<?php
set_time_limit(0);
ignore_user_abort(true);
/**
 * OLT Monitor Classes for ISP OLT Monitoring System
 * Automatically generated from classes/OLTManager.php
 */

class OLTMonitor {
    private $connection;
    private $olt_type;
    private $olt_ip;
    private $username;
    private $password;
    private $snmp_community;
    private $log_file;
    private $timeout;
    private $port;
    private $connection_retries;
    
    public function __construct($olt_type, $olt_ip, $username, $password, $snmp_community = 'public', $port = 23, $timeout = 5) {
        $this->olt_type = strtolower(str_replace(' ', '_', $olt_type));
        $this->olt_ip = $olt_ip;
        $this->username = $username;
        $this->password = $password;
        $this->snmp_community = $snmp_community;
        $this->port = $port;
        $this->timeout = $timeout;
        $this->connection_retries = 2; // Reduced from 3 to fail faster
        $this->log_file = 'olt_monitor.log';
    }
    
    private function log($message, $level = 'INFO') {
        $timestamp = date('Y-m-d H:i:s');
        file_put_contents($this->log_file, "[$timestamp] [$level] [$this->olt_ip] $message\n", FILE_APPEND);
    }
    
    private function telnet_connect() {
        if ($this->connection && is_resource($this->connection) && !feof($this->connection)) {
            return true;
        }
        $this->connection = null;

        for ($attempt = 1; $attempt <= $this->connection_retries; $attempt++) {
            $this->connection = @fsockopen($this->olt_ip, $this->port, $errno, $errstr, $this->timeout);
            if ($this->connection) {
                stream_set_timeout($this->connection, $this->timeout);
                break;
            }
            $this->log("Telnet connection attempt $attempt failed: $errstr", 'ERROR');
            if ($attempt == $this->connection_retries) {
                return false;
            }
            sleep(1);
        }
        
        try {
            $output = $this->telnet_read(5);
            $this->log("Initial output: " . substr(str_replace(["\n", "\r"], " ", $output), 0, 100));
            
            // Login Loop (up to 5 stages for robust connection timing)
            for ($i = 0; $i < 5; $i++) {
                if (!$this->connection || !is_resource($this->connection) || feof($this->connection)) {
                    break;
                }
                
                $lowered = strtolower($output);
                
                // Check if username/login prompt is detected (handles partial prompts like 'Us')
                if (strpos($lowered, 'username') !== false || strpos($lowered, 'login') !== false || strpos($lowered, 'user') !== false || preg_match('/us(er)?(name)?:?\s*$/i', $output)) {
                    $this->write($this->username . "\r\n");
                    sleep(1);
                    $output = $this->telnet_read(5);
                    $lowered = strtolower($output);
                }
                
                // Check if password prompt is detected
                if (strpos($lowered, 'password') !== false || preg_match('/pass(word)?:?\s*$/i', $output)) {
                    $this->write($this->password . "\r\n");
                    sleep(1);
                    $output = $this->telnet_read(5);
                    $lowered = strtolower($output);
                }
                
                // Check if we reached user or privileged mode
                if (preg_match('/[#>]\s*$/', $output)) {
                    break;
                }
                
                // If no terminal/login prompt is matched yet, the OLT is likely slow. Sleep and read more.
                if (!preg_match('/[#>:]\s*$/', $output)) {
                    sleep(1);
                    $output .= $this->telnet_read(2);
                }
            }
            
            if (!$this->connection || !is_resource($this->connection) || feof($this->connection)) {
                $this->log("Telnet connection lost during login", 'ERROR');
                return false;
            }
            
            if (strpos($output, 'Login incorrect') !== false || strpos($output, 'Authentication failed') !== false) {
                $this->log("Authentication failed: " . substr($output, 0, 50), 'ERROR');
                fclose($this->connection);
                return false;
            }
            
            // Enable mode
            if (!preg_match('/#\s*$/', $output)) {
                $this->log("Sending enable...");
                $this->write("enable\r\n");
                sleep(1);
                $output = $this->telnet_read(5);
                
                if (strpos($output, 'Password:') !== false || strpos($output, 'password:') !== false) {
                    $this->write($this->password . "\r\n");
                    sleep(1);
                    $output = $this->telnet_read(5);
                }
            }
            
            if (!$this->connection || !is_resource($this->connection) || feof($this->connection)) {
                $this->log("Telnet connection lost during enable setup", 'ERROR');
                return false;
            }
            
            // terminal length 0 (After enable)
            if (strpos($this->olt_type, 'bdcom') !== false || strpos($this->olt_type, 'vsol') !== false || strpos($this->olt_type, 'dm') !== false) {
                $this->write("terminal length 0\r\n");
                sleep(1);
                $this->telnet_read(3);
            }

            if ($this->olt_type === 'vsol_epon' || $this->olt_type === 'vsol_gpon' || $this->olt_type === 'dm_epon' || $this->olt_type === 'dm_gpon') {
                $this->log("Entering config mode (c t)...");
                $this->write("c t\r\n");
                sleep(2);
                $this->telnet_read(5);
            }
            
            if (!$this->connection || !is_resource($this->connection) || feof($this->connection)) {
                $this->log("Telnet connection lost during config mode setup", 'ERROR');
                return false;
            }
            
            return true;
        } catch (Exception $e) {
            $this->log("Telnet connection error: " . $e->getMessage(), 'ERROR');
            return false;
        }
    }
    
    private function strip_telnet_negotiations($data) {
        // Strip IAC subnegotiation: \xFF\xFA ... \xFF\xF0
        $data = preg_replace('/\xFF\xFA.*?\xFF\xF0/s', '', $data);
        // Strip IAC WILL/WONT/DO/DONT followed by one byte: \xFF[\xFB-\xFE].
        $data = preg_replace('/\xFF[\xFB-\xFE]./s', '', $data);
        // Strip IAC followed by other command bytes: \xFF[\xF0-\xF9]
        $data = preg_replace('/\xFF[\xF0-\xF9]/s', '', $data);
        return $data;
    }
    
    protected function render_virtual_line($line) {
        // If there are no carriage returns or escape sequences, return as is.
        if (strpos($line, "\r") === false && strpos($line, "\x1b") === false) {
            return $line;
        }
        
        $buffer = str_repeat(' ', 150);
        $cursor = 0;
        $len = strlen($line);
        
        for ($i = 0; $i < $len; $i++) {
            $char = $line[$i];
            
            if ($char === "\r") {
                $cursor = 0;
            } elseif ($char === "\n") {
                // Ignore newline character
            } elseif ($char === "\x1b" && isset($line[$i+1]) && $line[$i+1] === '[') {
                // Parse ESC [ ... C cursor movement
                $j = $i + 2;
                $num_str = '';
                while ($j < $len && $line[$j] >= '0' && $line[$j] <= '9') {
                    $num_str .= $line[$j];
                    $j++;
                }
                if ($j < $len && $line[$j] === 'C') {
                    $cursor = intval($num_str);
                    $i = $j; // Move past 'C'
                }
            } else {
                if ($cursor < 150) {
                    $buffer[$cursor] = $char;
                    $cursor++;
                }
            }
        }
        return rtrim($buffer);
    }
    
    private function telnet_read($timeout = 5) {
        if (!$this->connection) return '';
        
        $output = '';
        $start_time = microtime(true);
        stream_set_blocking($this->connection, false);
        
        while ((microtime(true) - $start_time) < $timeout) {
            if (feof($this->connection)) {
                break;
            }
            $read = fread($this->connection, 8192);
            if ($read !== false && $read !== '') {
                $output .= $read;
                
                // Strip negotiations to ensure prompt matching works on clean text
                $clean_output = $this->strip_telnet_negotiations($output);
                if (preg_match('/[#>:]\s*$/', $clean_output) || strpos($clean_output, '--More--') !== false) {
                    break;
                }
            }
            usleep(50000); // 50ms wait
        }
        
        stream_set_blocking($this->connection, true);
        return $this->strip_telnet_negotiations($output);
    }
    
    public function execute_command($command, $wait_time = 3) {
        if (!$this->connection) return false;
        $this->write($command . "\r\n");
        $full_output = '';
        
        $max_pages = 20; // Safety limit
        for ($i = 0; $i < $max_pages; $i++) {
            $output = $this->telnet_read($wait_time + 5);
            $full_output .= $output;
            
            if (strpos($output, '--More--') !== false) {
                $this->write(" "); // Send space to continue pagination
                usleep(300000); // Wait 300ms for next chunk
                continue;
            }
            break;
        }
        return $full_output;
    }
    
    public function telnet_disconnect() {
        if ($this->connection) {
            $this->write("exit\r\n");
            @fclose($this->connection);
            $this->connection = null;
        }
    }
    
    private function write($data) {
        if (!$this->connection || !is_resource($this->connection) || feof($this->connection)) {
            $this->log("Write failed: Connection lost or invalid resource", 'ERROR');
            return false;
        }
        $result = @fwrite($this->connection, $data);
        if ($result === false) {
            $this->log("Write failed to socket", 'ERROR');
        }
        return $result;
    }
    
    // BDCOM EPON Functions
    public function bdcom_epon_get_onu_list($interface = '') {
        $onus = array();
        if (!$this->telnet_connect()) return $onus;
        
        try {
            $cmd = $interface ? "show epon onu-information interface $interface" : "show epon onu-information";
            $this->log("Scanning BDCOM " . ($interface ? "port $interface" : "all ports") . "...");
            $output = $this->execute_command($cmd);
            if (!$output || strlen(trim($output)) < 10) {
                $this->log("No valid output from $interface", 'WARNING');
                return $onus;
            }
            
            $lines = explode("\n", $output);
            for ($i = 0; $i < count($lines); $i++) {
                $line = trim($lines[$i]);
                if (empty($line)) continue;
                
                // Match first line: EPON0/1:1   ----   0x00000000 a07d.0227.1624 N/A
                if (preg_match('/EPON\s?\d+\/(\d+):(\d+)\s+.*?\s+([0-9a-fA-F:.\-]{12,17})\s+/i', $line, $matches)) {
                    $p = $matches[1];
                    $id = $matches[2];
                    $mac = strtoupper(str_replace('.', ':', $matches[3]));
                    
                    // Look ahead for the next line for status (it might be indented)
                    $status = 'offline';
                    if (isset($lines[$i+1])) {
                        $nextLine = trim($lines[$i+1]);
                        // Match second line: static  lost  unknow OR static auto-configured N/A
                        if (preg_match('/(?:static|dynamic)\s+(\S+)/i', $nextLine, $statusMatches)) {
                            $raw_status = strtolower($statusMatches[1]);
                            $status = (strpos($raw_status, 'configured') !== false || $raw_status == 'up' || $raw_status == 'online' || $raw_status == 'active') ? 'active' : 'offline';
                            $i++; // Skip the next line as we've processed it
                        }
                    }
                    
                    $onus[] = array('onu_id' => "$p:$id", 'mac' => $mac, 'status' => $status, 'port' => $p);
                }
            }
            $count = count($onus);
            if ($count > 0) $this->log("Parsed $count ONUs from $interface");
            return $onus;
        } catch (Exception $e) {
            $this->log("Error: " . $e->getMessage(), 'ERROR');
            return $onus;
        }
    }
    
    public function bdcom_epon_get_onu_power($interface = '') {
        $power_data = array();
        if (!$this->telnet_connect()) return $power_data;
        
        try {
            $cmd = $interface ? "show epon onu-ctc-optical-transceiver-diagnosis interface $interface" : "show epon onu-ctc-optical-transceiver-diagnosis";
            if ($interface) $this->log("Fetching power for $interface...");
            $output = $this->execute_command($cmd, 5);
            if (!$output) return $power_data;
            
            // Extract port from interface name (e.g., 'epON 0/1' -> '1')
            $port = '1';
            if (preg_match('/(\d+)$/', $interface, $m)) $port = $m[1];
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                // Match: epon0/1:3   45.0         3.2     15.2     1.7        -17.0
                // Handling optional space after 'epon' and capture port and index
                if (preg_match('/epon\s?\d+\/(\d+):(\d+)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)/i', $line, $matches)) {
                    $p = $matches[1];
                    $onu_idx = $matches[2];
                    $temp = $matches[3];
                    $tx = $matches[6];
                    $rx = $matches[7];
                    
                    $power_data["$p:$onu_idx"] = array(
                        'rx_power' => ($rx === '--') ? 'N/A' : $rx,
                        'tx_power' => ($tx === '--') ? 'N/A' : $tx,
                        'temperature' => ($temp === '--') ? 'N/A' : $temp
                    );
                }
            }
            return $power_data;
        } catch (Exception $e) { return $power_data; }
    }
    
    public function bdcom_epon_get_uptime($interface = '') {
        $uptime_data = array();
        if (!$this->telnet_connect()) return $uptime_data;
        
        try {
            $cmd = $interface ? "show epon active-onu interface $interface" : "show epon active-onu";
            $output = $this->execute_command($cmd);
            if (!$output) return $uptime_data;
            
            $lines = explode("\n", $output);
            for ($i = 0; $i < count($lines); $i++) {
                $line = trim($lines[$i]);
                // Match: EPON0/1:3 or EPON 0/1:3
                if (preg_match('/EPON\s?\d+\/(\d+):(\d+)/i', $line, $matches)) {
                    $p = $matches[1];
                    $id = $matches[2];
                    
                    // Look for Alivetime on the next line
                    if (isset($lines[$i+1])) {
                        $nextLine = trim($lines[$i+1]);
                        // Match: 0 power-off        0.21:02:01
                        // Alivetime is usually the second/third part of the second line
                        $parts = preg_split('/\s+/', $nextLine);
                        if (count($parts) >= 2) {
                            $uptime = end($parts); // The last part is typically the Alivetime
                            $uptime_data["$p:$id"] = $uptime;
                        }
                        $i++; // Skip the next line
                    }
                }
            }
            return $uptime_data;
        } catch (Exception $e) { return $uptime_data; }
    }
    
    public function bdcom_epon_reboot_onu($interface, $onu_id) {
        if (!$this->telnet_connect()) return false;
        try {
            $this->write("epon reboot onu interface $interface:$onu_id\r\n");
            $output = $this->telnet_read(3);
            if (strpos($output, 'Are you sure') !== false) {
                $this->write("y\r\n");
                $this->telnet_read(3);
            }
            $this->telnet_disconnect();
            $this->log("ONU $onu_id rebooted on $interface", 'INFO');
            return true;
        } catch (Exception $e) { return false; }
    }
    
    // BDCOM GPON Functions
    public function bdcom_gpon_get_onu_list($interface = '') {
        $onus = array();
        if (!$this->telnet_connect()) return $onus;
        
        try {
            $cmd = $interface ? "show gpon onu-information interface $interface" : "show gpon onu-information";
            $output = $this->execute_command($cmd);
            if (!$output) return $onus;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                if (preg_match('/(\d+)\s+([0-9a-fA-F:]{17})\s+(\S+)\s+(\S+)/', $line, $matches)) {
                    $onus[] = array('onu_id' => trim($matches[1]), 'mac' => strtoupper(trim($matches[2])), 'status' => trim($matches[3]), 'sn' => trim($matches[4]));
                }
            }
            return $onus;
        } catch (Exception $e) { return $onus; }
    }
    
    public function bdcom_gpon_get_onu_power($interface = '') {
        $power_data = array();
        if (!$this->telnet_connect()) return $power_data;
        
        try {
            $cmd = $interface ? "show gpon onu-optical-transceiver-diagnosis interface $interface" : "show gpon onu-optical-transceiver-diagnosis";
            $output = $this->execute_command($cmd, 5);
            if (!$output) return $power_data;
            
            $lines = explode("\n", $output);
            $current_onu = null;
            foreach ($lines as $line) {
                if (preg_match('/ONU\s+(\d+)/i', $line, $matches)) {
                    $current_onu = $matches[1];
                    $power_data[$current_onu] = array('rx_power' => 'N/A', 'tx_power' => 'N/A', 'temperature' => 'N/A');
                }
                if ($current_onu) {
                    if (preg_match('/Rx Power:\s*([-\d.]+)\s*dBm/i', $line, $matches)) $power_data[$current_onu]['rx_power'] = $matches[1];
                    if (preg_match('/Tx Power:\s*([-\d.]+)\s*dBm/i', $line, $matches)) $power_data[$current_onu]['tx_power'] = $matches[1];
                }
            }
            return $power_data;
        } catch (Exception $e) { return $power_data; }
    }
    
    public function bdcom_gpon_get_uptime($interface = '') {
        $uptime_data = array();
        if (!$this->telnet_connect()) return $uptime_data;
        
        try {
            $cmd = $interface ? "show gpon active-onu interface $interface" : "show gpon active-onu";
            $output = $this->execute_command($cmd);
            if (!$output) return $uptime_data;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                if (preg_match('/ONU\s+(\d+).*?(?:Uptime|Up time):\s+([\d:]+\s+(?:days?|hours?|minutes?))/i', $line, $matches)) {
                    $uptime_data[$matches[1]] = trim($matches[2]);
                }
            }
            return $uptime_data;
        } catch (Exception $e) { return $uptime_data; }
    }
    
    public function bdcom_gpon_reboot_onu($interface, $onu_id) {
        if (!$this->telnet_connect()) return false;
        try {
            $this->write("gpon reboot onu interface $interface:$onu_id\r\n");
            $output = $this->telnet_read(3);
            if (strpos($output, 'Are you sure') !== false) {
                $this->write("y\r\n");
                $this->telnet_read(3);
            }
            $this->telnet_disconnect();
            $this->log("ONU $onu_id rebooted on $interface", 'INFO');
            return true;
        } catch (Exception $e) { return false; }
    }
    
    // VSOL EPON Functions (Legacy/Internal)
    private function vsol_epon_get_onu_list($pon_port = 1) {
        // Now handled by vsol_epon_get_all_data
        return array();
    }
    
    public function vsol_epon_get_all_data($max_ports = 16) {
        $data = array('onu_list' => array(), 'power' => array(), 'mactable' => array());
        if (!$this->telnet_connect()) return $data;
        
        // Step 1: Get all ONUs from all ports
        for ($port = 1; $port <= $max_ports; $port++) {
            $output = $this->execute_command("show onu status pon $port", 2);
            if ($output) {
                $clean_output = str_replace(["\r", "\n"], " ", substr($output, 0, 200));
                $this->log("vsol_epon_get_all_data: show onu status pon $port returned: $clean_output", 'INFO');
            }
            if (!$output || strpos($output, 'Invalid') !== false || strpos($output, 'not exist') !== false) continue;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                $line = $this->render_virtual_line($line);
                // Support robust MAC/Serial matching (between 12 and 17 characters including hex, colons, dots, hyphens)
                if (preg_match('/(?:^\s*\d+\s+)?(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+(\S+)/', $line, $matches)) {
                    $mac_clean = str_replace(array(':', '.', '-'), '', $matches[2]);
                    $mac = strtoupper(implode(':', str_split($mac_clean, 2)));
                    $data['onu_list'][] = array('onu_id' => "$port:".$matches[1], 'mac' => $mac, 'status' => trim($matches[3]), 'port' => $port);
                } elseif (preg_match('/(?:^\s*\d+\s+)?(\d+)\s+(\S+)\s+([0-9a-fA-F:.\-]{12,17})/', $line, $matches)) {
                    $mac_clean = str_replace(array(':', '.', '-'), '', $matches[3]);
                    $mac = strtoupper(implode(':', str_split($mac_clean, 2)));
                    $data['onu_list'][] = array('onu_id' => "$port:".$matches[1], 'mac' => $mac, 'status' => trim($matches[2]), 'port' => $port);
                }
            }
        }
        
        // Step 2: Get Power for all ONUs found
        $ports_with_onus = array_unique(array_column($data['onu_list'], 'port'));
        foreach ($ports_with_onus as $port) {
            $output = $this->execute_command("show onu opm-diag pon $port", 3);
            if ($output) {
                $clean_output = str_replace(["\r", "\n"], " ", substr($output, 0, 200));
                $this->log("vsol_epon_get_all_data: show onu opm-diag pon $port returned: $clean_output", 'INFO');
            }
            if (!$output) continue;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                $line = $this->render_virtual_line($line);
                // Support robust interface prefix structure (e.g. EPON0/1:2, EPON 0/1:2, pon 1:2, etc.)
                if (preg_match('/(?:epon|gpon|pon)?\s?(?:\d+\/)?(\d+):(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i', $line, $matches)) {
                    $full_id = $matches[1] . ":" . $matches[2];
                    $data['power'][$full_id] = array('rx_power' => $matches[7], 'tx_power' => $matches[6], 'temperature' => $matches[3]);
                }
            }
        }

        // Step 3: Get MAC address table info (try globally first, fall back to port-by-port if empty)
        $data['mactable'] = array();
        
        // Exit config mode to enable/exec mode to ensure 'show' commands execute successfully
        $this->log("vsol_epon_get_all_data: Exiting config mode to enable mode for MAC table queries...", 'INFO');
        $this->execute_command("exit", 1);
        
        $mac_output = $this->execute_command("show mac address-table", 4);
        $has_global_macs = false;
        
        if ($mac_output && strpos($mac_output, 'Invalid') === false && strpos($mac_output, 'not support') === false) {
            $clean_output = str_replace(["\r", "\n"], " ", substr($mac_output, 0, 300));
            $this->log("vsol_epon_get_all_data: show mac address-table returned: $clean_output", 'INFO');
            
            $lines = explode("\n", $mac_output);
            foreach ($lines as $line) {
                $line = $this->render_virtual_line($line);
                // Match: 671     bc62:ce08:32ec    Dynamic    EPON0/1:2
                // Support robust interface prefix matching
                if (preg_match('/(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+(?:epon|gpon|pon)?\s?(?:\d+\/)?(\d+):(\d+)/i', $line, $matches)) {
                    $vlan = $matches[1];
                    $mac_raw = $matches[2];
                    $mac_clean = str_replace(array(':', '.', '-'), '', $mac_raw);
                    $mac = strtoupper(implode(':', str_split($mac_clean, 2)));
                    $onu_port = $matches[3];
                    $onu_idx = $matches[4];
                    $full_id = "$onu_port:$onu_idx";
                    if (!isset($data['mactable'][$full_id])) $data['mactable'][$full_id] = array();
                    
                    // Avoid duplicates
                    $exists = false;
                    foreach ($data['mactable'][$full_id] as $existing) {
                        if ($existing['mac'] === $mac) { $exists = true; break; }
                    }
                    if (!$exists) {
                        $data['mactable'][$full_id][] = array('mac' => $mac, 'vlan' => $vlan);
                        $has_global_macs = true;
                    }
                }
            }
        }
        
        if (!$has_global_macs) {
            $this->log("vsol_epon_get_all_data: Global MAC table empty or did not yield ONU-specific mappings. Running ONU-level queries.", 'INFO');
            
            // Gather active ONUs
            $active_onus = [];
            foreach ($data['onu_list'] as $onu) {
                $status = strtolower($onu['status']);
                if ($status === 'active' || $status === 'online' || $status === 'up') {
                    $active_onus[] = $onu;
                }
            }
            
            if (!empty($active_onus)) {
                $this->log("vsol_epon_get_all_data: Querying MAC table for " . count($active_onus) . " active ONUs.", 'INFO');
                foreach ($active_onus as $onu) {
                    $full_id = $onu['onu_id']; // E.g., "2:1"
                    $parts = explode(':', $full_id);
                    $port = $parts[0];
                    $onu_idx = $parts[1];
                    
                    // Try primary command: show mac address-table interface epon 0/$port:$onu_idx
                    $cmd = "show mac address-table interface epon 0/$port:$onu_idx";
                    $onu_mac_output = $this->execute_command($cmd, 2);
                    
                    // Fallback command: show epon interface epon 0/$port:$onu_idx onu mac address-table
                    if (!$onu_mac_output || strpos($onu_mac_output, 'Invalid') !== false || strpos($onu_mac_output, 'not support') !== false || strlen(trim($onu_mac_output)) < 10) {
                        $cmd = "show epon interface epon 0/$port:$onu_idx onu mac address-table";
                        $onu_mac_output = $this->execute_command($cmd, 2);
                    }
                    
                    if ($onu_mac_output) {
                        $clean_output = str_replace(["\r", "\n"], " ", substr($onu_mac_output, 0, 200));
                        $this->log("vsol_epon_get_all_data: $cmd for ONU $full_id returned: $clean_output", 'INFO');
                        
                        $lines = explode("\n", $onu_mac_output);
                        foreach ($lines as $line) {
                            $line = $this->render_virtual_line($line);
                            if (empty($line)) continue;
                            
                            // Match lines starting with digits (vlan) and then containing a MAC address
                            // E.g. "602      58d9:d51e:e5e8    Dynamic    EPON0/2"
                            if (preg_match('/(\d+)\s+([0-9a-fA-F:.\-]{12,17})/i', $line, $matches)) {
                                $vlan = $matches[1];
                                $mac_raw = $matches[2];
                                
                                $mac_clean = str_replace(array(':', '.', '-'), '', $mac_raw);
                                $mac = strtoupper(implode(':', str_split($mac_clean, 2)));
                                
                                if (!isset($data['mactable'][$full_id])) {
                                    $data['mactable'][$full_id] = array();
                                }
                                
                                // Avoid duplicates
                                $exists = false;
                                foreach ($data['mactable'][$full_id] as $existing) {
                                    if ($existing['mac'] === $mac) {
                                        $exists = true;
                                        break;
                                    }
                                }
                                if (!$exists) {
                                    $data['mactable'][$full_id][] = array('mac' => $mac, 'vlan' => $vlan);
                                    $has_global_macs = true; // Mark that we successfully retrieved at least some MACs
                                }
                            }
                        }
                    }
                }
            }
            
            // Final fallback: If still empty, try legacy port-by-port query
            $still_empty = true;
            foreach ($data['mactable'] as $fid => $macs) {
                if (!empty($macs)) {
                    $still_empty = false;
                    break;
                }
            }
            
            if ($still_empty) {
                $this->log("vsol_epon_get_all_data: ONU-level queries returned no MACs. Trying legacy port-by-port fallback.", 'INFO');
                foreach ($ports_with_onus as $p) {
                    $mac_output = $this->execute_command("show mac address-table interface epon 0/$p", 2);
                    if ($mac_output) {
                        $clean_output = str_replace(["\r", "\n"], " ", substr($mac_output, 0, 200));
                        $this->log("vsol_epon_get_all_data: show mac address-table interface epon 0/$p returned: $clean_output", 'INFO');
                    }
                    if (!$mac_output) continue;
                    
                    $lines = explode("\n", $mac_output);
                    foreach ($lines as $line) {
                        $line = $this->render_virtual_line($line);
                        if (preg_match('/(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+(?:epon|gpon|pon)?\s?(?:\d+\/)?(\d+):(\d+)/i', $line, $matches)) {
                            $vlan = $matches[1];
                            $mac_raw = $matches[2];
                            $mac_clean = str_replace(array(':', '.', '-'), '', $mac_raw);
                            $mac = strtoupper(implode(':', str_split($mac_clean, 2)));
                            $onu_port = $matches[3];
                            $onu_idx = $matches[4];
                            $full_id = "$onu_port:$onu_idx";
                            if (!isset($data['mactable'][$full_id])) $data['mactable'][$full_id] = array();
                            
                            $exists = false;
                            foreach ($data['mactable'][$full_id] as $existing) {
                                if ($existing['mac'] === $mac) { $exists = true; break; }
                            }
                            if (!$exists) $data['mactable'][$full_id][] = array('mac' => $mac, 'vlan' => $vlan);
                        }
                    }
                }
            }
        }
        
        $this->telnet_disconnect();
        return $data;
    }

    public function vsol_epon_reboot_onu($full_id) {
        $parts = explode(':', $full_id);
        if (count($parts) != 2) return false;
        $port = $parts[0];
        $onu_id = $parts[1];
        
        if (!$this->telnet_connect()) return false;
        try {
            $this->execute_command("interface epon 0/$port", 2);
            $this->execute_command("reset onu auth onuid $onu_id", 2);
            $this->execute_command("exit", 1);
            $this->telnet_disconnect();
            $this->log("ONU $full_id rebooted", 'INFO');
            return true;
        } catch (Exception $e) { return false; }
    }
    
    public function get_mac_table($mac_address) {
        if (!$this->telnet_connect()) return false;
        try {
            $output = $this->execute_command("show mac address-table | include $mac_address", 3);
            $this->telnet_disconnect();
            if (!$output) return false;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                if (preg_match('/([0-9a-fA-F:\.]{17})\s+(\d+)\s+(\S+)/i', $line, $matches)) {
                    return array('mac' => strtoupper($matches[1]), 'vlan' => $matches[2], 'port' => $matches[3]);
                }
            }
            return false;
        } catch (Exception $e) { return false; }
    }
    
    public function vsol_gpon_get_all_data($max_ports = 16) {
        $data = array('onu_list' => array(), 'power' => array(), 'mactable' => array());
        if (!$this->telnet_connect()) return $data;
        
        // Step 1: Query global show onu info first (to map ports to serial numbers/MACs)
        $info_output = $this->execute_command("show onu info", 15);
        $state_output = $this->execute_command("show onu state", 15);
        
        $onu_info_map = array();
        if ($info_output && strpos($info_output, 'Invalid') === false && strpos($info_output, 'Unknown') === false) {
            $lines = explode("\n", $info_output);
            foreach ($lines as $line) {
                $line = $this->render_virtual_line($line);
                // Match: GPON0/1:1   V142                 default                sn      GPON009AD958
                if (preg_match('/GPON\d+\/(\d+):(\d+)\s+.*?\s+(?:sn|password)\s+([a-zA-Z0-9]{8,17})/i', $line, $matches)) {
                    $port = intval($matches[1]);
                    $onu_id = intval($matches[2]);
                    $sn = trim($matches[3]);
                    $onu_info_map["$port:$onu_id"] = $sn;
                }
            }
        }
        
        if ($state_output && strpos($state_output, 'Invalid') === false && strpos($state_output, 'Unknown') === false) {
            $lines = explode("\n", $state_output);
            foreach ($lines as $line) {
                $line = $this->render_virtual_line($line);
                // Match: 1/1/1:1  enable  enable  working  1(GPON)  or  GPON0/1:1 ...
                if (preg_match('/(?:1\/1\/|GPON\d+\/)(\d+):(\d+)\s+(\S+)\s+(\S+)\s+(\S+)/i', $line, $matches)) {
                    $port = intval($matches[1]);
                    $onu_id = intval($matches[2]);
                    
                    if ($port > $max_ports) continue;
                    
                    $phase_state = strtolower(trim($matches[5]));
                    $status = ($phase_state === 'working') ? 'active' : 'offline';
                    
                    $key = "$port:$onu_id";
                    $sn = isset($onu_info_map[$key]) ? $onu_info_map[$key] : 'UNKNOWN';
                    
                    // Format the MAC/SN if it's 12 chars hex
                    $formatted_mac = $sn;
                    if (strlen($sn) === 12 && !str_contains($sn, ':')) {
                        $formatted_mac = implode(':', str_split($sn, 2));
                    }
                    $formatted_mac = strtoupper($formatted_mac);
                    
                    $data['onu_list'][] = array(
                        'onu_id' => "$port:$onu_id",
                        'mac' => $formatted_mac,
                        'status' => $status,
                        'port' => $port
                    );
                }
            }
        }
        
        // Fallback: If no ONUs found, try the legacy show onu state all inside interface gpon 0/1
        if (empty($data['onu_list'])) {
            $this->execute_command("interface gpon 0/1", 2);
            $output = $this->execute_command("show onu state all", 15);
            $this->execute_command("exit", 1);
            
            if ($output && strpos($output, 'Invalid') === false) {
                $lines = explode("\n", $output);
                foreach ($lines as $line) {
                    $line = $this->render_virtual_line($line);
                    if (preg_match('/GPON\d+\/(\d+):(\d+)\s+.*?\s+(\S+)\s+([a-zA-Z0-9]{12,17})\s*$/', $line, $matches)) {
                        $p = $matches[1];
                        $idx = $matches[2];
                        if ($p > $max_ports) continue;
                        $phase_state = strtolower(trim($matches[3]));
                        $mac_raw = trim($matches[4]);
                        $status = ($phase_state === 'working') ? 'active' : 'offline';
                        
                        $formatted_mac = $mac_raw;
                        if (strlen($mac_raw) === 12) {
                            $formatted_mac = implode(':', str_split($mac_raw, 2));
                        }
                        $formatted_mac = strtoupper($formatted_mac);
                        
                        $data['onu_list'][] = array(
                            'onu_id' => "$p:$idx",
                            'mac' => $formatted_mac,
                            'status' => $status,
                            'port' => $p
                        );
                    }
                }
            }
        }
        
        // Step 3: Get optical power diagnostics
        $ports_with_onus = array_unique(array_column($data['onu_list'], 'port'));
        foreach ($ports_with_onus as $port) {
            $this->execute_command("interface gpon 0/$port", 2);
            $output = $this->execute_command("show pon onu all rx-power", 8);
            $this->execute_command("exit", 1);
            
            if (!$output) continue;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                $line = $this->render_virtual_line($line);
                // Match either GPON0/1:1 -24.317(dbm) or numerical index formats
                if (preg_match('/(?:GPON\d+\/\d+:|1\/1\/\d+:|^\s*)(\d+)\s+([-\d.]+)/i', $line, $matches)) {
                    $onu_idx = intval($matches[1]);
                    $rx_power = trim($matches[2]);
                    $full_id = "$port:$onu_idx";
                    $data['power'][$full_id] = array(
                        'rx_power' => ($rx_power === 'N/A') ? 'N/A' : $rx_power,
                        'tx_power' => 'N/A',
                        'temperature' => 'N/A'
                    );
                } elseif (preg_match('/^\s*(\d+)\s+(\S+)\s+(\S+)/', $line, $matches)) {
                    $onu_idx = intval($matches[1]);
                    $rx_power = trim($matches[2]);
                    $full_id = "$port:$onu_idx";
                    $data['power'][$full_id] = array(
                        'rx_power' => ($rx_power === 'N/A') ? 'N/A' : $rx_power,
                        'tx_power' => 'N/A',
                        'temperature' => 'N/A'
                    );
                }
            }
        }
 
        // Step 4: Get MAC address table globally using show mac address-table pon
        $mac_output = $this->execute_command("show mac address-table pon", 15);
        $has_pon_macs = false;
        
        if ($mac_output && strpos($mac_output, 'Invalid') === false && strpos($mac_output, 'Unknown') === false) {
            $lines = explode("\n", $mac_output);
            foreach ($lines as $line) {
                $line = $this->render_virtual_line($line);
                // Match: bc22.2820.b84c 670 Dynamic GPON0/2:18 1138
                if (preg_match('/([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\s*(\d+)\s+\S+\s+GPON\d+\/(\d+):(\d+)/i', $line, $matches)) {
                    $mac_raw = $matches[1];
                    $vlan = $matches[2];
                    $onu_port = intval($matches[3]);
                    $onu_idx = intval($matches[4]);
                    $full_id = "$onu_port:$onu_idx";
                    
                    $mac_clean = str_replace(array(':', '.', '-'), '', $mac_raw);
                    $mac = strtoupper(implode(':', str_split($mac_clean, 2)));
                    
                    if (!isset($data['mactable'][$full_id])) $data['mactable'][$full_id] = array();
                    $data['mactable'][$full_id][] = array('mac' => $mac, 'vlan' => $vlan);
                    $has_pon_macs = true;
                }
            }
        }
        
        // Fallback to general show mac address-table
        if (!$has_pon_macs) {
            $mac_output = $this->execute_command("show mac address-table", 10);
            if ($mac_output) {
                $lines = explode("\n", $mac_output);
                foreach ($lines as $line) {
                    $line = $this->render_virtual_line($line);
                    if (preg_match('/^\s*(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+GPON\s?\d+\/(\d+):(\d+)/i', $line, $matches)) {
                        $vlan = $matches[1];
                        $mac_raw = $matches[2];
                        $onu_port = $matches[3];
                        $onu_idx = intval($matches[4]);
                        $full_id = "$onu_port:$onu_idx";
                        
                        $mac_clean = str_replace(array(':', '.', '-'), '', $mac_raw);
                        $mac = strtoupper($mac_raw);
                        if (strlen($mac_clean) === 12) {
                            $mac = strtoupper(implode(':', str_split($mac_clean, 2)));
                        }
                        
                        if (!isset($data['mactable'][$full_id])) $data['mactable'][$full_id] = array();
                        $data['mactable'][$full_id][] = array('mac' => $mac, 'vlan' => $vlan);
                    }
                }
            }
        }
        
        $this->telnet_disconnect();
        return $data;
    }

    public function vsol_gpon_reboot_onu($full_id) {
        $parts = explode(':', $full_id);
        if (count($parts) != 2) return false;
        $port = $parts[0];
        $onu_id = $parts[1];
        
        if (!$this->telnet_connect()) return false;
        try {
            $this->execute_command("interface gpon 0/$port", 2);
            $res = $this->execute_command("onu $onu_id reboot", 2);
            $this->execute_command("exit", 1);
            $this->telnet_disconnect();
            
            if ($res && (strpos($res, 'OK') !== false || strpos($res, 'success') !== false)) {
                $this->log("GPON ONU $full_id rebooted successfully", 'INFO');
                return true;
            }
            $this->log("Failed to reboot GPON ONU $full_id: " . substr($res, 0, 50), 'WARNING');
            return false;
        } catch (Exception $e) { return false; }
    }
    
    public function bdcom_get_all_macs() {
        $mactable = array();
        try {
            $output = $this->execute_command("show mac address-table", 10);
            if (!$output) return $mactable;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                // Match: 141     bc62.ce4c.fb3b    DYNAMIC   epon0/4:1
                if (preg_match('/(\d+|All)\s+([0-9a-fA-F\.]{14})\s+\S+\s+(?:epon|gpon)\d+\/(\d+):(\d+)/i', $line, $matches)) {
                    $vlan = $matches[1];
                    $mac = strtoupper(str_replace('.', '', $matches[2]));
                    $p = $matches[3];
                    $id = $matches[4];
                    $onu_key = "$p:$id";
                    
                    if (!isset($mactable[$onu_key])) $mactable[$onu_key] = array();
                    $mactable[$onu_key][] = array('mac' => $mac, 'vlan' => $vlan);
                }
            }
            return $mactable;
        } catch (Exception $e) { return $mactable; }
    }
    
    public function monitor_all_onus() {
        $monitoring_data = array('onu_list' => array(), 'power' => array(), 'uptime' => array());
        if (!$this->telnet_connect()) {
            $this->log("Failed to connect to OLT for monitoring", 'ERROR');
            return false;
        }

        try {
            switch($this->olt_type) {
                case 'bdcom_epon':
                    // Fetch all data at once instead of port-by-port
                    $monitoring_data['onu_list'] = $this->bdcom_epon_get_onu_list("");
                    if (!empty($monitoring_data['onu_list'])) {
                        // Attempt global fetch first (much faster)
                        $global_power = $this->bdcom_epon_get_onu_power("");
                        $global_uptime = $this->bdcom_epon_get_uptime("");
                        
                        if (!empty($global_power)) {
                            $monitoring_data['power'] = $global_power;
                        }
                        if (!empty($global_uptime)) {
                            $monitoring_data['uptime'] = $global_uptime;
                        }
                        
                        // Fallback to port-by-port fetch if global fetch failed
                        $global_power_failed = empty($global_power);
                        $global_uptime_failed = empty($global_uptime);
                        
                        if ($global_power_failed || $global_uptime_failed) {
                            $unique_ports = array_unique(array_column($monitoring_data['onu_list'], 'port'));
                            foreach ($unique_ports as $p) {
                                $port_interface = "epon 0/$p";
                                if ($global_power_failed) {
                                    $port_power = $this->bdcom_epon_get_onu_power($port_interface);
                                    if (is_array($port_power)) {
                                        $monitoring_data['power'] = array_merge($monitoring_data['power'], $port_power);
                                    }
                                }
                                if ($global_uptime_failed) {
                                    $port_uptime = $this->bdcom_epon_get_uptime($port_interface);
                                    if (is_array($port_uptime)) {
                                        $monitoring_data['uptime'] = array_merge($monitoring_data['uptime'], $port_uptime);
                                    }
                                }
                            }
                        }

                        // Guaranteed Fallback: Loop online ONUs and query port level if still missing power
                        foreach ($monitoring_data['onu_list'] as $onu) {
                            $is_active = (strtolower($onu['status']) === 'active' || strtolower($onu['status']) === 'online' || strtolower($onu['status']) === 'up');
                            if ($is_active) {
                                $onu_id = $onu['onu_id'];
                                if (!isset($monitoring_data['power'][$onu_id]) || $monitoring_data['power'][$onu_id]['rx_power'] === 'N/A' || empty($monitoring_data['power'][$onu_id]['rx_power'])) {
                                    $this->log("ONU $onu_id is online but missing optical power. Querying port epon 0/" . $onu['port'] . "...", 'INFO');
                                    $port_power = $this->bdcom_epon_get_onu_power("epon 0/" . $onu['port']);
                                    if (!empty($port_power) && isset($port_power[$onu_id])) {
                                        $monitoring_data['power'][$onu_id] = $port_power[$onu_id];
                                    }
                                }
                            }
                        }
                    }
                    $monitoring_data['mactable'] = $this->bdcom_get_all_macs();
                    break;
                case 'bdcom_gpon':
                    // Fetch all data at once
                    $monitoring_data['onu_list'] = $this->bdcom_gpon_get_onu_list("");
                    if (!empty($monitoring_data['onu_list'])) {
                        $monitoring_data['power'] = $this->bdcom_gpon_get_onu_power("");
                        $monitoring_data['uptime'] = $this->bdcom_gpon_get_uptime("");

                        // Guaranteed Fallback: Loop online GPON ONUs and query individually if still missing power
                        foreach ($monitoring_data['onu_list'] as $onu) {
                            $is_active = (strtolower($onu['status']) === 'active' || strtolower($onu['status']) === 'online' || strtolower($onu['status']) === 'up');
                            if ($is_active) {
                                $onu_id = $onu['onu_id'];
                                if (!isset($monitoring_data['power'][$onu_id]) || $monitoring_data['power'][$onu_id]['rx_power'] === 'N/A' || empty($monitoring_data['power'][$onu_id]['rx_power'])) {
                                    $this->log("GPON ONU $onu_id is online but missing optical power. Querying individually...", 'INFO');
                                    $single_power = $this->bdcom_gpon_get_onu_power("gpon 0/1:" . $onu_id);
                                    if (!empty($single_power) && isset($single_power[$onu_id])) {
                                        $monitoring_data['power'][$onu_id] = $single_power[$onu_id];
                                    }
                                }
                            }
                        }
                    }
                    $monitoring_data['mactable'] = $this->bdcom_get_all_macs();
                    break;
                case 'dm_epon':
                case 'vsol_epon':
                    $vsol_data = $this->vsol_epon_get_all_data();
                    $monitoring_data['onu_list'] = $vsol_data['onu_list'];
                    $monitoring_data['power'] = $vsol_data['power'];
                    $monitoring_data['mactable'] = $vsol_data['mactable'];
                    break;
                case 'dm_gpon':
                case 'vsol_gpon':
                    $vsol_data = $this->vsol_gpon_get_all_data();
                    $monitoring_data['onu_list'] = $vsol_data['onu_list'];
                    $monitoring_data['power'] = $vsol_data['power'];
                    $monitoring_data['mactable'] = $vsol_data['mactable'];
                    break;
            }
            $this->telnet_disconnect();
        } catch (Exception $e) { $this->log("Monitor error: " . $e->getMessage(), 'ERROR'); }
        return $monitoring_data;
    }
    
    public function test_connection() {
        $timeout = min(2.0, floatval($this->timeout));
        if ($timeout < 1.0) $timeout = 1.5;
        $conn = @fsockopen($this->olt_ip, $this->port, $errno, $errstr, $timeout);
        if ($conn) {
            @fclose($conn);
            return true;
        }
        return false;
    }
    
    public function test_login() {
        $connected = $this->telnet_connect();
        if ($connected) {
            $this->telnet_disconnect();
        }
        return $connected;
    }
}

// OLT Manager Class


// OLT Manager Class (JSON configuration based)
class OLTManager {
    private $config_file;
    private $olts;
    
    public function __construct($config_file = 'olts_config.json') {
        $this->config_file = $config_file;
        $this->olts = array();
        $this->load_config();
    }
    
    private function load_config() {
        if (file_exists($this->config_file)) {
            $content = file_get_contents($this->config_file);
            $this->olts = json_decode($content, true);
            if (!is_array($this->olts)) $this->olts = array();
        }
    }
    
    private function save_config() {
        file_put_contents($this->config_file, json_encode($this->olts, JSON_PRETTY_PRINT));
    }
    
    public function add_olt($olt_type, $ip, $username, $password, $snmp_community = 'public', $port = 23, $timeout = 10) {
        foreach ($this->olts as $olt) {
            if ($olt['ip'] === $ip) return false;
        }
        $this->olts[] = array(
            'type' => $olt_type, 'ip' => $ip, 'username' => $username, 'password' => $password,
            'snmp_community' => $snmp_community, 'port' => $port, 'timeout' => $timeout,
            'enabled' => true, 'added_date' => date('Y-m-d H:i:s')
        );
        $this->save_config();
        return true;
    }
    
    public function update_olt($ip, $data) {
        foreach ($this->olts as $key => $olt) {
            if ($olt['ip'] === $ip) {
                $this->olts[$key] = array_merge($olt, $data);
                $this->save_config();
                return true;
            }
        }
        return false;
    }
    
    public function remove_olt($ip) {
        $new_olts = array();
        $found = false;
        foreach ($this->olts as $olt) {
            if ($olt['ip'] === $ip) { $found = true; continue; }
            $new_olts[] = $olt;
        }
        if ($found) { $this->olts = $new_olts; $this->save_config(); return true; }
        return false;
    }
    
    public function get_olts() { return $this->olts; }
    
    public function test_olt_connection($ip) {
        foreach ($this->olts as $olt) {
            if ($olt['ip'] === $ip) {
                $monitor = new OLTMonitor($olt['type'], $olt['ip'], $olt['username'], $olt['password'], 
                    isset($olt['snmp_community']) ? $olt['snmp_community'] : 'public',
                    isset($olt['port']) ? $olt['port'] : 23,
                    isset($olt['timeout']) ? $olt['timeout'] : 5);
                return $monitor->test_connection();
            }
        }
        return false;
    }
}
