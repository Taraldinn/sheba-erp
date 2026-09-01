<?php
// classes/olt_drivers/BDCOMEponDriver.php

require_once __DIR__ . '/OLTInterface.php';

class BDCOMEponDriver implements OLTInterface {
    private $ctx;

    public function __construct($context) {
        $this->ctx = $context;
    }

    public function getOnuList($interface = '') {
        $onus = array();
        if (!$this->ctx->telnet_connect()) return $onus;
        
        try {
            $cmd = $interface ? "show epon onu-information interface $interface" : "show epon onu-information";
            $this->ctx->log("Scanning BDCOM " . ($interface ? "port $interface" : "all ports") . "...");
            $output = $this->ctx->execute_command($cmd);
            if (!$output || strlen(trim($output)) < 10) {
                $this->ctx->log("No valid output from $interface", 'WARNING');
                return $onus;
            }
            
            $lines = explode("\n", $output);
            for ($i = 0; $i < count($lines); $i++) {
                $line = trim($lines[$i]);
                if (empty($line)) continue;
                
                if (preg_match('/EPON\s?\d+\/(\d+):(\d+)\s+.*?\s+([0-9a-fA-F:.\-]{12,17})\s+/i', $line, $matches)) {
                    $p = $matches[1];
                    $id = $matches[2];
                    $mac = strtoupper(str_replace('.', ':', $matches[3]));
                    
                    $status = 'offline';
                    if (isset($lines[$i+1])) {
                        $nextLine = trim($lines[$i+1]);
                        if (preg_match('/(?:static|dynamic)\s+(\S+)/i', $nextLine, $statusMatches)) {
                            $raw_status = strtolower($statusMatches[1]);
                            $status = (strpos($raw_status, 'configured') !== false || $raw_status == 'up' || $raw_status == 'online' || $raw_status == 'active') ? 'active' : 'offline';
                            $i++;
                        }
                    }
                    
                    $onus[] = array('onu_id' => "$p:$id", 'mac' => $mac, 'status' => $status, 'port' => $p);
                }
            }
            $count = count($onus);
            if ($count > 0) $this->ctx->log("Parsed $count ONUs from $interface");
            return $onus;
        } catch (Exception $e) {
            $this->ctx->log("Error: " . $e->getMessage(), 'ERROR');
            return $onus;
        }
    }

    public function getOnuPower($interface = '') {
        $power_data = array();
        if (!$this->ctx->telnet_connect()) return $power_data;
        
        try {
            $cmd = $interface ? "show epon onu-ctc-optical-transceiver-diagnosis interface $interface" : "show epon onu-ctc-optical-transceiver-diagnosis";
            if ($interface) $this->ctx->log("Fetching power for $interface...");
            $output = $this->ctx->execute_command($cmd, 5);
            if (!$output) return $power_data;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
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
        } catch (Exception $e) {
            $this->ctx->log("Error fetching power: " . $e->getMessage(), 'ERROR');
            return $power_data;
        }
    }

    public function getUptime($interface = '') {
        $uptime_data = array();
        if (!$this->ctx->telnet_connect()) return $uptime_data;
        
        try {
            $cmd = $interface ? "show epon onu-sequence-time interface $interface" : "show epon onu-sequence-time";
            if ($interface) $this->ctx->log("Fetching uptime for $interface...");
            $output = $this->ctx->execute_command($cmd, 5);
            if (!$output) return $uptime_data;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                if (preg_match('/epon\s?\d+\/(\d+):(\d+)\s+(\d+)\s+(.+)$/i', $line, $matches)) {
                    $p = $matches[1];
                    $onu_idx = $matches[2];
                    $state = trim($matches[4]);
                    
                    $uptime_data["$p:$onu_idx"] = $state;
                }
            }
            return $uptime_data;
        } catch (Exception $e) {
            $this->ctx->log("Error fetching uptime: " . $e->getMessage(), 'ERROR');
            return $uptime_data;
        }
    }

    public function rebootOnu($interface, $onu_id = null) {
        if (!$this->ctx->telnet_connect()) return false;
        
        try {
            $cmd = "epon reboot-onu interface $interface onu $onu_id\r\n";
            $this->ctx->log("Sending reboot command: $cmd");
            $this->ctx->write($cmd);
            sleep(1);
            $output = $this->ctx->telnet_read(5);
            
            if (strpos($output, 'y/n') !== false || strpos($output, 'confirm') !== false) {
                $this->ctx->write("y\r\n");
                sleep(1);
                $output .= $this->ctx->telnet_read(5);
            }
            
            $this->ctx->log("Reboot output: " . str_replace("\n", " ", $output));
            return true;
        } catch (Exception $e) {
            $this->ctx->log("Reboot error: " . $e->getMessage(), 'ERROR');
            return false;
        }
    }

    public function monitorAllOnus() {
        $monitoring_data = array('onu_list' => array(), 'power' => array(), 'uptime' => array(), 'mactable' => array());
        
        $monitoring_data['onu_list'] = $this->getOnuList("");
        if (!empty($monitoring_data['onu_list'])) {
            $global_power = $this->getOnuPower("");
            $global_uptime = $this->getUptime("");
            
            if (!empty($global_power)) {
                $monitoring_data['power'] = $global_power;
            }
            if (!empty($global_uptime)) {
                $monitoring_data['uptime'] = $global_uptime;
            }
            
            $global_power_failed = empty($global_power);
            $global_uptime_failed = empty($global_uptime);
            
            if ($global_power_failed || $global_uptime_failed) {
                $unique_ports = array_unique(array_column($monitoring_data['onu_list'], 'port'));
                foreach ($unique_ports as $p) {
                    $port_interface = "epon 0/$p";
                    if ($global_power_failed) {
                        $port_power = $this->getOnuPower($port_interface);
                        if (is_array($port_power)) {
                            $monitoring_data['power'] = array_merge($monitoring_data['power'], $port_power);
                        }
                    }
                    if ($global_uptime_failed) {
                        $port_uptime = $this->getUptime($port_interface);
                        if (is_array($port_uptime)) {
                            $monitoring_data['uptime'] = array_merge($monitoring_data['uptime'], $port_uptime);
                        }
                    }
                }
            }

            foreach ($monitoring_data['onu_list'] as $onu) {
                $is_active = (strtolower($onu['status']) === 'active' || strtolower($onu['status']) === 'online' || strtolower($onu['status']) === 'up');
                if ($is_active) {
                    $onu_id = $onu['onu_id'];
                    if (!isset($monitoring_data['power'][$onu_id]) || $monitoring_data['power'][$onu_id]['rx_power'] === 'N/A' || empty($monitoring_data['power'][$onu_id]['rx_power'])) {
                        $this->ctx->log("ONU $onu_id is online but missing optical power. Querying port epon 0/" . $onu['port'] . "...", 'INFO');
                        $port_power = $this->getOnuPower("epon 0/" . $onu['port']);
                        if (!empty($port_power) && isset($port_power[$onu_id])) {
                            $monitoring_data['power'][$onu_id] = $port_power[$onu_id];
                        }
                    }
                }
            }
        }
        $monitoring_data['mactable'] = $this->ctx->bdcom_get_all_macs();
        return $monitoring_data;
    }
}
?>
