<?php
// classes/olt_drivers/VSOLEponDriver.php

require_once __DIR__ . '/OLTInterface.php';

class VSOLEponDriver implements OLTInterface {
    private $ctx;

    public function __construct($context) {
        $this->ctx = $context;
    }

    public function getOnuList($interface = '') {
        // Handled in monitorAllOnus for VSOL OLT since it collects all data at once to reduce connection latency
        return array();
    }

    public function getOnuPower($interface = '') {
        return array();
    }

    public function getUptime($interface = '') {
        return array();
    }

    public function rebootOnu($interface, $onu_id = null) {
        // For VSOL, interface is passed as full ID e.g., "port:onu_id"
        $full_id = $interface;
        $parts = explode(':', $full_id);
        if (count($parts) != 2) return false;
        $port = $parts[0];
        $onu_idx = $parts[1];
        
        if (!$this->ctx->telnet_connect()) return false;
        try {
            $this->ctx->execute_command("interface epon 0/$port", 2);
            $this->ctx->execute_command("reset onu auth onuid $onu_idx", 2);
            $this->ctx->execute_command("exit", 1);
            $this->ctx->telnet_disconnect();
            $this->ctx->log("ONU $full_id rebooted", 'INFO');
            return true;
        } catch (Exception $e) {
            $this->ctx->log("VSOL EPON Reboot error: " . $e->getMessage(), 'ERROR');
            return false;
        }
    }

    public function monitorAllOnus() {
        $data = array('onu_list' => array(), 'power' => array(), 'mactable' => array(), 'uptime' => array());
        if (!$this->ctx->telnet_connect()) return $data;
        
        $max_ports = 16;
        
        // Step 1: Get all ONUs from all ports
        for ($port = 1; $port <= $max_ports; $port++) {
            $output = $this->ctx->execute_command("show onu status pon $port", 2);
            if ($output) {
                $clean_output = str_replace(["\r", "\n"], " ", substr($output, 0, 200));
                $this->ctx->log("vsol_epon_get_all_data: show onu status pon $port returned: $clean_output", 'INFO');
            }
            if (!$output || strpos($output, 'Invalid') !== false || strpos($output, 'not exist') !== false) continue;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                if (preg_match('/(?:^\s*\d+\s+)?(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+(\S+)/', $line, $matches)) {
                    $data['onu_list'][] = array('onu_id' => "$port:".$matches[1], 'mac' => strtoupper(trim($matches[2])), 'status' => trim($matches[3]), 'port' => $port);
                } elseif (preg_match('/(?:^\s*\d+\s+)?(\d+)\s+(\S+)\s+([0-9a-fA-F:.\-]{12,17})/', $line, $matches)) {
                    $data['onu_list'][] = array('onu_id' => "$port:".$matches[1], 'mac' => strtoupper(trim($matches[3])), 'status' => trim($matches[2]), 'port' => $port);
                }
            }
        }
        
        // Step 2: Get Power for all ONUs found
        $ports_with_onus = array_unique(array_column($data['onu_list'], 'port'));
        foreach ($ports_with_onus as $port) {
            $output = $this->ctx->execute_command("show onu opm-diag pon $port", 3);
            if ($output) {
                $clean_output = str_replace(["\r", "\n"], " ", substr($output, 0, 200));
                $this->ctx->log("vsol_epon_get_all_data: show onu opm-diag pon $port returned: $clean_output", 'INFO');
            }
            if (!$output) continue;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                if (preg_match('/(?:epon|gpon|pon)?\s?(?:\d+\/)?(\d+):(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i', $line, $matches)) {
                    $full_id = $matches[1] . ":" . $matches[2];
                    $data['power'][$full_id] = array('rx_power' => $matches[7], 'tx_power' => $matches[6], 'temperature' => $matches[3]);
                }
            }
        }

        // Step 3: Get MAC address table info
        $data['mactable'] = array();
        $mac_output = $this->ctx->execute_command("show mac address-table", 4);
        $has_global_macs = false;
        
        if ($mac_output && strpos($mac_output, 'Invalid') === false && strpos($mac_output, 'not support') === false) {
            $clean_output = str_replace(["\r", "\n"], " ", substr($mac_output, 0, 300));
            $this->ctx->log("vsol_epon_get_all_data: show mac address-table returned: $clean_output", 'INFO');
            
            $lines = explode("\n", $mac_output);
            foreach ($lines as $line) {
                if (preg_match('/(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+(?:epon|gpon|pon)?\s?(?:\d+\/)?(\d+):(\d+)/i', $line, $matches)) {
                    $vlan = $matches[1];
                    $mac = strtoupper($matches[2]);
                    $onu_port = $matches[3];
                    $onu_idx = $matches[4];
                    $full_id = "$onu_port:$onu_idx";
                    if (!isset($data['mactable'][$full_id])) $data['mactable'][$full_id] = array();
                    
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
            $this->ctx->log("vsol_epon_get_all_data: Global MAC table empty or did not yield ONU-specific mappings. Running ONU-level queries.", 'INFO');
            
            $active_onus = [];
            foreach ($data['onu_list'] as $onu) {
                $status = strtolower($onu['status']);
                if ($status === 'active' || $status === 'online' || $status === 'up') {
                    $active_onus[] = $onu;
                }
            }
            
            if (!empty($active_onus)) {
                $this->ctx->log("vsol_epon_get_all_data: Querying MAC table for " . count($active_onus) . " active ONUs.", 'INFO');
                foreach ($active_onus as $onu) {
                    $full_id = $onu['onu_id'];
                    $parts = explode(':', $full_id);
                    $port = $parts[0];
                    $onu_idx = $parts[1];
                    
                    $cmd = "show mac address-table interface epon 0/$port:$onu_idx";
                    $onu_mac_output = $this->ctx->execute_command($cmd, 2);
                    
                    if (!$onu_mac_output || strpos($onu_mac_output, 'Invalid') !== false || strpos($onu_mac_output, 'not support') !== false || strlen(trim($onu_mac_output)) < 10) {
                        $cmd = "show epon interface epon 0/$port:$onu_idx onu mac address-table";
                        $onu_mac_output = $this->ctx->execute_command($cmd, 2);
                    }
                    
                    if ($onu_mac_output) {
                        $clean_output = str_replace(["\r", "\n"], " ", substr($onu_mac_output, 0, 200));
                        $this->ctx->log("vsol_epon_get_all_data: $cmd for ONU $full_id returned: $clean_output", 'INFO');
                        
                        $lines = explode("\n", $onu_mac_output);
                        foreach ($lines as $line) {
                            $line = trim($line);
                            if (empty($line)) continue;
                            
                            if (preg_match('/(\d+)\s+([0-9a-fA-F:.\-]{12,17})/i', $line, $matches)) {
                                $vlan = $matches[1];
                                $mac_raw = $matches[2];
                                $mac_clean = str_replace(array(':', '.', '-'), '', $mac_raw);
                                $mac = strtoupper(implode(':', str_split($mac_clean, 2)));
                                
                                if (!isset($data['mactable'][$full_id])) {
                                    $data['mactable'][$full_id] = array();
                                }
                                
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
                }
            }
            
            $still_empty = true;
            foreach ($data['mactable'] as $fid => $macs) {
                if (!empty($macs)) { $still_empty = false; break; }
            }
            
            if ($still_empty) {
                $this->ctx->log("vsol_epon_get_all_data: ONU-level queries returned no MACs. Trying legacy port-by-port fallback.", 'INFO');
                foreach ($ports_with_onus as $p) {
                    $mac_output = $this->ctx->execute_command("show mac address-table interface epon 0/$p", 2);
                    if ($mac_output) {
                        $clean_output = str_replace(["\r", "\n"], " ", substr($mac_output, 0, 200));
                        $this->ctx->log("vsol_epon_get_all_data: show mac address-table interface epon 0/$p returned: $clean_output", 'INFO');
                    }
                    if (!$mac_output) continue;
                    
                    $lines = explode("\n", $mac_output);
                    foreach ($lines as $line) {
                        if (preg_match('/(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+(?:epon|gpon|pon)?\s?(?:\d+\/)?(\d+):(\d+)/i', $line, $matches)) {
                            $vlan = $matches[1];
                            $mac = strtoupper($matches[2]);
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
        
        $this->ctx->telnet_disconnect();
        return $data;
    }
}
?>
