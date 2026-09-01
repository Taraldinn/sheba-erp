<?php
// classes/olt_drivers/BDCOMGponDriver.php

require_once __DIR__ . '/OLTInterface.php';

class BDCOMGponDriver implements OLTInterface {
    private $ctx;

    public function __construct($context) {
        $this->ctx = $context;
    }

    public function getOnuList($interface = '') {
        $onus = array();
        if (!$this->ctx->telnet_connect()) return $onus;
        
        try {
            $cmd = $interface ? "show gpon onu-information interface $interface" : "show gpon onu-information";
            $output = $this->ctx->execute_command($cmd);
            if (!$output) return $onus;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                if (preg_match('/(\d+)\s+([0-9a-fA-F:]{17})\s+(\S+)\s+(\S+)/', $line, $matches)) {
                    $onus[] = array('onu_id' => trim($matches[1]), 'mac' => strtoupper(trim($matches[2])), 'status' => trim($matches[3]), 'sn' => trim($matches[4]));
                }
            }
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
            $cmd = $interface ? "show gpon onu-optical-transceiver-diagnosis interface $interface" : "show gpon onu-optical-transceiver-diagnosis";
            $output = $this->ctx->execute_command($cmd, 5);
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
        } catch (Exception $e) {
            $this->ctx->log("Error fetching power: " . $e->getMessage(), 'ERROR');
            return $power_data;
        }
    }

    public function getUptime($interface = '') {
        $uptime_data = array();
        if (!$this->ctx->telnet_connect()) return $uptime_data;
        
        try {
            $cmd = $interface ? "show gpon active-onu interface $interface" : "show gpon active-onu";
            $output = $this->ctx->execute_command($cmd);
            if (!$output) return $uptime_data;
            
            $lines = explode("\n", $output);
            foreach ($lines as $line) {
                if (preg_match('/ONU\s+(\d+).*?(?:Uptime|Up time):\s+([\d:]+\s+(?:days?|hours?|minutes?))/i', $line, $matches)) {
                    $uptime_data[$matches[1]] = trim($matches[2]);
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
            $this->ctx->write("gpon reboot onu interface $interface:$onu_id\r\n");
            $output = $this->ctx->telnet_read(3);
            if (strpos($output, 'Are you sure') !== false) {
                $this->ctx->write("y\r\n");
                $this->ctx->telnet_read(3);
            }
            $this->ctx->telnet_disconnect();
            $this->ctx->log("ONU $onu_id rebooted on $interface", 'INFO');
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
            $monitoring_data['power'] = $this->getOnuPower("");
            $monitoring_data['uptime'] = $this->getUptime("");

            foreach ($monitoring_data['onu_list'] as $onu) {
                $is_active = (strtolower($onu['status']) === 'active' || strtolower($onu['status']) === 'online' || strtolower($onu['status']) === 'up');
                if ($is_active) {
                    $onu_id = $onu['onu_id'];
                    if (!isset($monitoring_data['power'][$onu_id]) || $monitoring_data['power'][$onu_id]['rx_power'] === 'N/A' || empty($monitoring_data['power'][$onu_id]['rx_power'])) {
                        $this->ctx->log("GPON ONU $onu_id is online but missing optical power. Querying individually...", 'INFO');
                        $single_power = $this->getOnuPower("gpon 0/1:" . $onu_id);
                        if (!empty($single_power) && isset($single_power[$onu_id])) {
                            $monitoring_data['power'][$onu_id] = $single_power[$onu_id];
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
