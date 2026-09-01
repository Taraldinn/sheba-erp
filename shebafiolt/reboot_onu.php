<?php
header('Content-Type: application/json');

require_once 'olt_monitor.php';

$olt_ip = $_POST['olt_ip'] ?? $_GET['olt_ip'] ?? null;
$onu_id = $_POST['onu_id'] ?? $_GET['onu_id'] ?? null;

if (!$olt_ip || !$onu_id) {
    echo json_encode(['success' => false, 'message' => 'OLT IP and ONU ID are required']);
    exit;
}

$olt_manager = new OLTManager();
$olts = $olt_manager->get_olts();

$success = false;
$message = 'OLT not found';

foreach ($olts as $olt_config) {
    if ($olt_config['ip'] === $olt_ip) {
        try {
            $monitor = new OLTMonitor(
                $olt_config['type'],
                $olt_config['ip'],
                $olt_config['username'],
                $olt_config['password'],
                $olt_config['snmp_community'] ?? 'public',
                $olt_config['port'] ?? 23,
                $olt_config['timeout'] ?? 10
            );
            
            switch($olt_config['type']) {
                case 'bdcom_epon':
                    $onu_parts = explode(':', $onu_id);
                    $port_idx = isset($onu_parts[0]) ? $onu_parts[0] : '1';
                    $onu_idx = isset($onu_parts[1]) ? $onu_parts[1] : '';
                    $result = $monitor->bdcom_epon_reboot_onu("epon 0/$port_idx", $onu_idx);
                    break;
                case 'bdcom_gpon':
                    $result = $monitor->bdcom_gpon_reboot_onu('gpon 0/1', $onu_id);
                    break;
                case 'dm_epon':
                case 'vsol_epon':
                    $result = $monitor->vsol_epon_reboot_onu($onu_id);
                    break;
                case 'vsol_gpon':
                    $result = $monitor->vsol_gpon_reboot_onu($onu_id);
                    break;
                default:
                    $result = false;
                    $message = 'Unsupported OLT type';
                    break;
            }
            
            if ($result) {
                $success = true;
                $message = 'ONU reboot command sent successfully';
            } else {
                $message = 'Failed to send reboot command';
            }
        } catch (Exception $e) {
            $message = $e->getMessage();
        }
        break;
    }
}

echo json_encode(['success' => $success, 'message' => $message]);
?>