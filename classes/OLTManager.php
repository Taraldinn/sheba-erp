<?php
set_time_limit(0);

// Load OLT Driver Interface and Implementations
require_once __DIR__ . '/olt_drivers/OLTInterface.php';
require_once __DIR__ . '/olt_drivers/BDCOMEponDriver.php';
require_once __DIR__ . '/olt_drivers/BDCOMGponDriver.php';
require_once __DIR__ . '/olt_drivers/VSOLEponDriver.php';
require_once __DIR__ . '/olt_drivers/VSOLEponWebDriver.php';
require_once __DIR__ . '/olt_drivers/VSOLGponDriver.php';
require_once __DIR__ . '/olt_drivers/VSOLGponWebDriver.php';
require_once __DIR__ . '/olt_drivers/HSGQEponDriver.php';

/**
 * Unified OLT Monitoring & Management Module
 * Supports BDCOM & VSOL (EPON & GPON)
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
    private $driver;
    
    public $http_protocol;
    public $web_port;
    public $mode;
    
    public function __construct($olt_type, $olt_ip, $username, $password, $snmp_community = 'public', $port = 23, $timeout = 5, $http_protocol = 'http', $web_port = 80, $mode = 'telnet') {
        $this->olt_type = strtolower(str_replace(' ', '_', $olt_type));
        $this->olt_ip = $olt_ip;
        $this->username = $username;
        $this->password = $password;
        $this->snmp_community = $snmp_community;
        $this->port = $port;
        $this->timeout = $timeout;
        $this->connection_retries = 2; // Reduced from 3 to fail faster
        $this->log_file = __DIR__ . '/../debug_log.txt';
        $this->http_protocol = $http_protocol ?: 'http';
        $this->web_port = empty($web_port) ? ($this->http_protocol === 'https' ? 443 : 80) : $web_port;
        $this->mode = strtolower(trim($mode ?: 'telnet'));

        // Instantiate strategy driver
        if ($this->mode === 'web') {
            switch ($this->olt_type) {
                case 'dm_epon':
                case 'vsol_epon':
                    $this->driver = new VSOLEponWebDriver($this);
                    break;
                case 'dm_gpon':
                case 'vsol_gpon':
                    $this->driver = new VSOLGponWebDriver($this);
                    break;
                case 'hsgq_epon':
                    $this->driver = new HSGQEponDriver($this);
                    break;
                default:
                    $this->driver = null;
                    break;
            }
        } else {
            switch ($this->olt_type) {
                case 'bdcom_epon':
                    $this->driver = new BDCOMEponDriver($this);
                    break;
                case 'bdcom_gpon':
                    $this->driver = new BDCOMGponDriver($this);
                    break;
                case 'dm_epon':
                case 'vsol_epon':
                    $this->driver = new VSOLEponDriver($this);
                    break;
                case 'dm_gpon':
                case 'vsol_gpon':
                    $this->driver = new VSOLGponDriver($this);
                    break;
                case 'hsgq_epon':
                    $this->driver = new HSGQEponDriver($this);
                    break;
                default:
                    $this->driver = null;
                    break;
            }
        }
    }

    public function getOltIp() { return $this->olt_ip; }
    public function getUsername() { return $this->username; }
    public function getPassword() { return $this->password; }
    public function getSnmpCommunity() { return $this->snmp_community; }
    public function getTimeout() { return $this->timeout; }
    public function getHttpProtocol() { return $this->http_protocol; }
    public function getWebPort() { return $this->web_port; }
    
    // Note: Helper methods are made public to allow access from driver classes
    public function log($message, $level = 'INFO') {
        $timestamp = date('Y-m-d H:i:s');
        file_put_contents($this->log_file, "[$timestamp] [$level] [$this->olt_ip] $message\n", FILE_APPEND);
    }
    
    public function telnet_connect() {
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
    
    public function strip_telnet_negotiations($data) {
        // IAC subnegotiation: \xFF\xFA ... \xFF\xF0
        $data = preg_replace('/\xFF\xFA.*?\xFF\xF0/s', '', $data);
        // IAC WILL/WONT/DO/DONT followed by one byte: \xFF[\xFB-\xFE].
        $data = preg_replace('/\xFF[\xFB-\xFE]./s', '', $data);
        // IAC followed by other command bytes: \xFF[\xF0-\xF9]
        $data = preg_replace('/\xFF[\xF0-\xF9]/s', '', $data);
        return $data;
    }
    
    public function render_virtual_line($line) {
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
                // Ignore newline
            } elseif ($char === "\x1b" && isset($line[$i+1]) && $line[$i+1] === '[') {
                $j = $i + 2;
                $num_str = '';
                while ($j < $len && $line[$j] >= '0' && $line[$j] <= '9') {
                    $num_str .= $line[$j];
                    $j++;
                }
                if ($j < $len && $line[$j] === 'C') {
                    $cursor = intval($num_str);
                    $i = $j;
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
    
    public function telnet_read($timeout = 5) {
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
                
                $clean_output = $this->strip_telnet_negotiations($output);
                if (preg_match('/[#>:]\s*$/', $clean_output) || strpos($clean_output, '--More--') !== false) {
                    break;
                }
            }
            usleep(50000);
        }
        
        stream_set_blocking($this->connection, true);
        return $this->strip_telnet_negotiations($output);
    }
    
    public function execute_command($command, $wait_time = 3) {
        if (!$this->connection) return false;
        $this->write($command . "\r\n");
        $full_output = '';
        
        $max_pages = 20;
        for ($i = 0; $i < $max_pages; $i++) {
            $output = $this->telnet_read($wait_time + 5);
            $full_output .= $output;
            
            if (strpos($output, '--More--') !== false) {
                $this->write(" ");
                usleep(300000);
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
    
    public function write($data) {
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
    
    // Delegated brand-specific functions for backward compatibility
    public function bdcom_epon_get_onu_list($interface = '') {
        if ($this->driver && $this->olt_type === 'bdcom_epon') {
            return $this->driver->getOnuList($interface);
        }
        return array();
    }
    
    public function bdcom_epon_get_onu_power($interface = '') {
        if ($this->driver && $this->olt_type === 'bdcom_epon') {
            return $this->driver->getOnuPower($interface);
        }
        return array();
    }
    
    public function bdcom_epon_get_uptime($interface = '') {
        if ($this->driver && $this->olt_type === 'bdcom_epon') {
            return $this->driver->getUptime($interface);
        }
        return array();
    }
    
    public function bdcom_epon_reboot_onu($interface, $onu_id) {
        if ($this->driver && $this->olt_type === 'bdcom_epon') {
            return $this->driver->rebootOnu($interface, $onu_id);
        }
        return false;
    }
    
    public function bdcom_gpon_get_onu_list($interface = '') {
        if ($this->driver && $this->olt_type === 'bdcom_gpon') {
            return $this->driver->getOnuList($interface);
        }
        return array();
    }
    
    public function bdcom_gpon_get_onu_power($interface = '') {
        if ($this->driver && $this->olt_type === 'bdcom_gpon') {
            return $this->driver->getOnuPower($interface);
        }
        return array();
    }
    
    public function bdcom_gpon_get_uptime($interface = '') {
        if ($this->driver && $this->olt_type === 'bdcom_gpon') {
            return $this->driver->getUptime($interface);
        }
        return array();
    }
    
    public function bdcom_gpon_reboot_onu($interface, $onu_id) {
        if ($this->driver && $this->olt_type === 'bdcom_gpon') {
            return $this->driver->rebootOnu($interface, $onu_id);
        }
        return false;
    }
    
    public function vsol_epon_get_all_data($max_ports = 16) {
        if ($this->driver && ($this->olt_type === 'vsol_epon' || $this->olt_type === 'dm_epon')) {
            return $this->driver->monitorAllOnus();
        }
        return array('onu_list' => array(), 'power' => array(), 'mactable' => array());
    }
    
    public function vsol_epon_reboot_onu($full_id) {
        if ($this->driver && ($this->olt_type === 'vsol_epon' || $this->olt_type === 'dm_epon')) {
            return $this->driver->rebootOnu($full_id);
        }
        return false;
    }
    
    public function vsol_gpon_get_all_data($max_ports = 16) {
        if ($this->driver && ($this->olt_type === 'vsol_gpon' || $this->olt_type === 'dm_gpon')) {
            return $this->driver->monitorAllOnus();
        }
        return array('onu_list' => array(), 'power' => array(), 'mactable' => array());
    }
    
    public function vsol_gpon_reboot_onu($full_id) {
        if ($this->driver && $this->olt_type === 'vsol_gpon') {
            return $this->driver->rebootOnu($full_id);
        }
        return false;
    }

    public function hsgq_epon_reboot_onu($interface) {
        if ($this->driver && $this->olt_type === 'hsgq_epon') {
            return $this->driver->rebootOnu($interface);
        }
        return false;
    }
    
    public function bdcom_get_all_macs() {
        $mactable = array();
        try {
            $output = $this->execute_command("show mac address-table", 10);
            if (!$output) return $mactable;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
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
        if ($this->driver) {
            return $this->driver->monitorAllOnus();
        }
        return false;
    }
    
    public function test_connection() {
        $timeout = min(2.0, floatval($this->timeout));
        if ($timeout < 1.0) $timeout = 1.5;
        $port_to_check = ($this->mode === 'web' || $this->olt_type === 'hsgq_epon') ? $this->web_port : $this->port;
        $conn = @fsockopen($this->olt_ip, $port_to_check, $errno, $errstr, $timeout);
        if ($conn) {
            @fclose($conn);
            return true;
        }
        return false;
    }
    
    public function test_login() {
        if ($this->mode === 'web' || $this->olt_type === 'hsgq_epon') {
            if ($this->driver && method_exists($this->driver, 'testLogin')) {
                return $this->driver->testLogin();
            }
            return false;
        }
        $connected = $this->telnet_connect();
        if ($connected) {
            $this->telnet_disconnect();
        }
        return $connected;
    }
}

// OLT Manager Class


class OLTManager {
    private $pdo;
    
    public function __construct($pdo) {
        $this->pdo = $pdo;
        $this->migrateSchema();
    }
    
    private function migrateSchema() {
        try {
            $cols = $this->pdo->query("DESCRIBE olts")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('onu_cache', $cols)) {
                @$this->pdo->exec("ALTER TABLE olts ADD COLUMN onu_cache LONGTEXT DEFAULT NULL");
            }
            if (!in_array('last_sync', $cols)) {
                @$this->pdo->exec("ALTER TABLE olts ADD COLUMN last_sync DATETIME DEFAULT NULL");
            }
            if (!in_array('latlong', $cols)) {
                @$this->pdo->exec("ALTER TABLE olts ADD COLUMN latlong VARCHAR(100) DEFAULT NULL");
            }
            if (!in_array('mode', $cols)) {
                @$this->pdo->exec("ALTER TABLE olts ADD COLUMN mode VARCHAR(20) DEFAULT 'telnet'");
            }
            
            // Auto-seeding from JSON config is disabled to prevent multi-tenant OLT data leaks.
            // Each tenant must register and manage their own OLTs via their OLT Management Dashboard.
        } catch (Exception $e) {
            // Silence migration errors
        }
    }
    
    public function getAllOLTs($staff_id = null) {
        if ($staff_id !== null) {
            $stmt = $this->pdo->prepare("SELECT * FROM olts WHERE staff_id = ? ORDER BY id DESC");
            $stmt->execute([$staff_id]);
        } else {
            $stmt = $this->pdo->query("SELECT * FROM olts ORDER BY id DESC");
        }
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    public function getOLT($id) {
        $stmt = $this->pdo->prepare("SELECT * FROM olts WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
    
    public function addOLT($data, $staff_id) {
        $name = $data['name'] ?? '';
        $ip = $data['ip_address'] ?? '';
        $port = intval($data['port'] ?? 80);
        $protocol = $data['http_scheme'] ?? 'http';
        $brand = $data['brand'] ?? 'bdcom_epon';
        $user = $data['snmp_user'] ?? '';
        $pass = $data['snmp_password'] ?? '';
        $telnet_port = intval($data['telnet_port'] ?? 23);
        $snmp_community = $data['snmp_community'] ?? 'public';
        $timeout = intval($data['timeout'] ?? 10);
        $latlong = !empty($data['latlong']) ? trim($data['latlong']) : null;
        $mode = $data['mode'] ?? 'telnet';
        
        $stmt = $this->pdo->prepare("INSERT INTO olts (staff_id, name, ip, port, protocol, telnet_port, user, pass, brand, snmp_community, timeout, latlong, mode, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
        return $stmt->execute([$staff_id, $name, $ip, $port, $protocol, $telnet_port, $user, $pass, $brand, $snmp_community, $timeout, $latlong, $mode]);
    }
    
    public function updateOLT($id, $data) {
        $name = $data['name'] ?? '';
        $ip = $data['ip_address'] ?? '';
        $port = intval($data['port'] ?? 80);
        $protocol = $data['http_scheme'] ?? 'http';
        $brand = $data['brand'] ?? 'bdcom_epon';
        $user = $data['snmp_user'] ?? '';
        $pass = $data['snmp_password'] ?? '';
        $telnet_port = intval($data['telnet_port'] ?? 23);
        $snmp_community = $data['snmp_community'] ?? 'public';
        $timeout = intval($data['timeout'] ?? 10);
        $latlong = !empty($data['latlong']) ? trim($data['latlong']) : null;
        $mode = $data['mode'] ?? 'telnet';
        
        $stmt = $this->pdo->prepare("UPDATE olts SET name = ?, ip = ?, port = ?, protocol = ?, telnet_port = ?, user = ?, pass = ?, brand = ?, snmp_community = ?, timeout = ?, latlong = ?, mode = ? WHERE id = ?");
        return $stmt->execute([$name, $ip, $port, $protocol, $telnet_port, $user, $pass, $brand, $snmp_community, $timeout, $latlong, $mode, $id]);
    }
    
    public function deleteOLT($id, $staff_id = null) {
        if ($staff_id !== null) {
            $stmt = $this->pdo->prepare("DELETE FROM olts WHERE id = ? AND staff_id = ?");
            return $stmt->execute([$id, $staff_id]);
        } else {
            $stmt = $this->pdo->prepare("DELETE FROM olts WHERE id = ?");
            return $stmt->execute([$id]);
        }
    }
    
    public function checkConnection($id, $deep = false) {
        $olt = $this->getOLT($id);
        if (!$olt) {
            return ['status' => false, 'message' => 'OLT Not Found'];
        }
        
        $monitor = new OLTMonitor($olt['brand'], $olt['ip'], $olt['user'], $olt['pass'], $olt['snmp_community'], $olt['telnet_port'], $olt['timeout'], $olt['protocol'] ?? 'http', $olt['port'] ?? 80, $olt['mode'] ?? 'telnet');
        $success = $deep ? $monitor->test_login() : $monitor->test_connection();
        if ($success) {
            return ['status' => true, 'message' => 'Connection successful to OLT ' . $olt['ip']];
        } else {
            return ['status' => false, 'message' => 'Connection failed to OLT ' . $olt['ip'] . ($deep ? '. Check credentials and networking.' : '. Device is offline or port closed.')];
        }
    }
    
    public function rebootONU($id, $interface) {
        $olt = $this->getOLT($id);
        if (!$olt) return false;
        
        $brand = strtolower(str_replace(' ', '_', $olt['brand']));
        $monitor = new OLTMonitor($olt['brand'], $olt['ip'], $olt['user'], $olt['pass'], $olt['snmp_community'], $olt['telnet_port'], $olt['timeout'], $olt['protocol'] ?? 'http', $olt['port'] ?? 80, $olt['mode'] ?? 'telnet');
        
        if ($brand === 'bdcom_epon') {
            $parts = explode(':', $interface);
            if (count($parts) === 2) {
                return $monitor->bdcom_epon_reboot_onu("epon 0/" . $parts[0], $parts[1]);
            }
        } elseif ($brand === 'bdcom_gpon') {
            $parts = explode(':', $interface);
            if (count($parts) === 2) {
                return $monitor->bdcom_gpon_reboot_onu("gpon 0/" . $parts[0], $parts[1]);
            }
        } elseif ($brand === 'vsol_epon' || $brand === 'dm_epon') {
            return $monitor->vsol_epon_reboot_onu($interface);
        } elseif ($brand === 'vsol_gpon' || $brand === 'dm_gpon') {
            return $monitor->vsol_gpon_reboot_onu($interface);
        } elseif ($brand === 'hsgq_epon') {
            return $monitor->hsgq_epon_reboot_onu($interface);
        }
        return false;
    }
    
    public function runCommand($id, $command) {
        $olt = $this->getOLT($id);
        if (!$olt) return 'OLT Not Found';
        
        $monitor = new OLTMonitor($olt['brand'], $olt['ip'], $olt['user'], $olt['pass'], $olt['snmp_community'], $olt['telnet_port'], $olt['timeout'], $olt['protocol'] ?? 'http', $olt['port'] ?? 80, $olt['mode'] ?? 'telnet');
        $res = $monitor->execute_command($command);
        $monitor->telnet_disconnect();
        return $res;
    }
    
    public function getConnectedONUs($id, $refresh = false) {
        $olt = $this->getOLT($id);
        if (!$olt) {
            return ['error' => 'OLT Not Found'];
        }
        
        $use_cache = true;
        if ($refresh) {
            $use_cache = false;
        } elseif (empty($olt['onu_cache']) || $olt['onu_cache'] === '[]') {
            $use_cache = false;
        }
        
        if ($use_cache) {
            $cached = json_decode($olt['onu_cache'], true);
            if (is_array($cached)) {
                return $cached;
            }
        }
        
        try {
            $monitor = new OLTMonitor($olt['brand'], $olt['ip'], $olt['user'], $olt['pass'], $olt['snmp_community'], $olt['telnet_port'], $olt['timeout'], $olt['protocol'] ?? 'http', $olt['port'] ?? 80, $olt['mode'] ?? 'telnet');
            
            // Fast TCP connectivity check to avoid slow Telnet connect loops if OLT is offline
            if (!$monitor->test_connection()) {
                if (!empty($olt['onu_cache'])) {
                    $cached = json_decode($olt['onu_cache'], true);
                    if (is_array($cached)) {
                        return $cached;
                    }
                }
                return ['error' => 'OLT is offline or unreachable (Connection timed out)'];
            }
            
            $data = $monitor->monitor_all_onus();
            
            if ($data === false) {
                if (!empty($olt['onu_cache'])) {
                    $cached = json_decode($olt['onu_cache'], true);
                    if (is_array($cached)) {
                        return $cached;
                    }
                }
                return ['error' => 'Failed to connect to OLT via Telnet for monitoring. Check credentials and configuration.'];
            }
            
            if (empty($data['onu_list']) && !empty($olt['onu_cache'])) {
                // If scan returned empty (e.g. connection timeout) but we have a cache, fall back to it
                $cached = json_decode($olt['onu_cache'], true);
                if (is_array($cached)) {
                    return $cached;
                }
            }
            
            $onus = [];
            if ($data && is_array($data) && isset($data['onu_list'])) {
                foreach ($data['onu_list'] as $onu) {
                    $online = (strtolower($onu['status']) == 'active' || strtolower($onu['status']) == 'online' || strtolower($onu['status']) == 'up');
                    
                    if (!$online) {
                        $quality = 'Offline';
                    } else {
                        $rx_power_val = isset($data['power'][$onu['onu_id']]['rx_power']) ? $data['power'][$onu['onu_id']]['rx_power'] : 'N/A';
                        $rx_power = ($rx_power_val === 'N/A') ? -999 : floatval($rx_power_val);
                        
                        if ($rx_power > -25 && $rx_power < -10) $quality = 'Good';
                        elseif ($rx_power > -30 && $rx_power <= -25) $quality = 'Fair';
                        elseif ($rx_power <= -30) $quality = 'Poor';
                        else $quality = 'Unknown';
                    }
                    
                    $rx_power = isset($data['power'][$onu['onu_id']]['rx_power']) ? $data['power'][$onu['onu_id']]['rx_power'] : 'N/A';
                    $tx_power = isset($data['power'][$onu['onu_id']]['tx_power']) ? $data['power'][$onu['onu_id']]['tx_power'] : 'N/A';
                    $temp = isset($data['power'][$onu['onu_id']]['temperature']) ? $data['power'][$onu['onu_id']]['temperature'] : 'N/A';
                    $voltage = isset($data['power'][$onu['onu_id']]['voltage']) ? $data['power'][$onu['onu_id']]['voltage'] : 'N/A';
                    
                    $onu_mapped = [
                        'interface' => $onu['onu_id'],
                        'mac' => $onu['mac'],
                        'model' => strtoupper($olt['brand']),
                        'state' => $online ? 'Connect' : 'Offline',
                        'status' => $onu['status'],
                        'rx_power' => $rx_power,
                        'tx_power' => $tx_power,
                        'temp' => $temp,
                        'voltage' => $voltage,
                        'signal_quality' => $quality,
                        'distance' => $onu['distance'] ?? 'N/A',
                        'vendor_id' => (isset($data['power'][$onu['onu_id']]['vendor_id']) && $data['power'][$onu['onu_id']]['vendor_id'] !== 'N/A') ? $data['power'][$onu['onu_id']]['vendor_id'] : ($onu['vendor_id'] ?? 'N/A'),
                        'last_register' => $onu['last_register'] ?? 'N/A',
                        'last_deregister' => $onu['last_deregister'] ?? 'N/A',
                        'deregister_reason' => $onu['deregister_reason'] ?? 'N/A',
                        'uptime' => isset($data['uptime'][$onu['onu_id']]) ? $data['uptime'][$onu['onu_id']] : 'N/A',
                        'mactable' => isset($data['mactable'][$onu['onu_id']]) ? $data['mactable'][$onu['onu_id']] : []
                    ];
                    
                    $onus[] = $onu_mapped;
                }
            }
            
            // Save to DB cache
            $json = json_encode($onus);
            $stmt = $this->pdo->prepare("UPDATE olts SET onu_cache = ?, last_sync = NOW() WHERE id = ?");
            $stmt->execute([$json, $olt['id']]);
            
            return $onus;
        } catch (Exception $e) {
            if (!empty($olt['onu_cache'])) {
                $cached = json_decode($olt['onu_cache'], true);
                if (is_array($cached)) {
                    return $cached;
                }
            }
            return ['error' => 'Connection failed to OLT: ' . $e->getMessage()];
        }
    }
}
