<?php
// classes/olt_drivers/VSOLGponDriver.php

require_once __DIR__ . '/OLTInterface.php';

class VSOLGponDriver implements OLTInterface {
    private $ctx;

    public function __construct($context) {
        $this->ctx = $context;
    }

    public function getOnuList($interface = '') {
        // Handled in monitorAllOnus for VSOL OLT to minimize telnet roundtrips
        return array();
    }

    public function getOnuPower($interface = '') {
        return array();
    }

    public function getUptime($interface = '') {
        return array();
    }

    public function rebootOnu($interface, $onu_id = null) {
        // For VSOL GPON, interface can be passed as full ID e.g., "port:onu_id" or port and onu_id separately
        if ($onu_id === null) {
            $parts = explode(':', $interface);
            if (count($parts) != 2) return false;
            $port = $parts[0];
            $onu_id = $parts[1];
        } else {
            $port = $interface;
        }

        if (!$this->ctx->telnet_connect()) return false;
        try {
            $this->ctx->execute_command("interface gpon 0/$port", 2);
            $res = $this->ctx->execute_command("onu $onu_id reboot", 2);
            $this->ctx->execute_command("exit", 1);
            $this->ctx->telnet_disconnect();
            
            if ($res && (strpos($res, 'OK') !== false || strpos($res, 'success') !== false)) {
                $this->ctx->log("GPON ONU $port:$onu_id rebooted successfully", 'INFO');
                return true;
            }
            $this->ctx->log("Failed to reboot GPON ONU $port:$onu_id: " . substr($res, 0, 50), 'WARNING');
            return false;
        } catch (Exception $e) {
            $this->ctx->log("VSOL GPON Reboot error: " . $e->getMessage(), 'ERROR');
            return false;
        }
    }

    public function monitorAllOnus() {
        $data = array('onu_list' => array(), 'power' => array(), 'mactable' => array(), 'uptime' => array());
        if (!$this->ctx->telnet_connect()) return $data;
        
        $max_ports = 16;
        
        // Step 1: Query global show onu info first (to map ports to serial numbers/MACs)
        $info_output = $this->ctx->execute_command("show onu info", 15);
        $state_output = $this->ctx->execute_command("show onu state", 15);
        
        $onu_info_map = array();
        if ($info_output && strpos($info_output, 'Invalid') === false && strpos($info_output, 'Unknown') === false) {
            $lines = explode("\n", $info_output);
            foreach ($lines as $line) {
                // We access the protected/public render_virtual_line on context
                $line = $this->ctx->render_virtual_line($line);
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
                $line = $this->ctx->render_virtual_line($line);
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
            $this->ctx->execute_command("interface gpon 0/1", 2);
            $output = $this->ctx->execute_command("show onu state all", 15);
            $this->ctx->execute_command("exit", 1);
            
            if ($output && strpos($output, 'Invalid') === false) {
                $lines = explode("\n", $output);
                foreach ($lines as $line) {
                    $line = $this->ctx->render_virtual_line($line);
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
            $this->ctx->execute_command("interface gpon 0/$port", 2);
            $output = $this->ctx->execute_command("show pon onu all rx-power", 8);
            $this->ctx->execute_command("exit", 1);
            
            if (!$output) continue;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                $line = $this->ctx->render_virtual_line($line);
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
        $mac_output = $this->ctx->execute_command("show mac address-table pon", 15);
        $has_pon_macs = false;
        
        if ($mac_output && strpos($mac_output, 'Invalid') === false && strpos($mac_output, 'Unknown') === false) {
            $lines = explode("\n", $mac_output);
            foreach ($lines as $line) {
                $line = $this->ctx->render_virtual_line($line);
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
            $mac_output = $this->ctx->execute_command("show mac address-table", 10);
            if ($mac_output) {
                $lines = explode("\n", $mac_output);
                foreach ($lines as $line) {
                    $line = $this->ctx->render_virtual_line($line);
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
        
        $this->ctx->telnet_disconnect();
        return $data;
    }
}
?>
