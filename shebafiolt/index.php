<?php
set_time_limit(0);
ignore_user_abort(true);
/**
 * Complete ISP OLT Monitoring System
 * Supports BDcom & VSOL (EPON & GPON)
 * Features: OLT Management, ONU Monitoring, Power Levels, Reboot, MAC Search
 */

require_once 'olt_monitor.php';

// Initialize manager
$olt_manager = new OLTManager();
$message = '';
$error = '';
$edit_olt = null;
$search_mac_result = null;
$search_mac = isset($_POST['search_mac']) ? $_POST['search_mac'] : (isset($_GET['search_mac']) ? $_GET['search_mac'] : null);

// Handle POST requests
$force_sync = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action'])) {
        switch ($_POST['action']) {
            case 'add_olt':
                $result = $olt_manager->add_olt($_POST['olt_type'], $_POST['ip'], $_POST['username'], $_POST['password'], 
                    $_POST['snmp_community'], $_POST['port'], $_POST['timeout'], isset($_POST['latlong']) ? $_POST['latlong'] : '');
                if ($result) {
                    $message = "OLT added successfully";
                    $force_sync = true;
                }
                else $error = "Failed to add OLT (may already exist)";
                break;
            case 'edit_olt':
                $result = $olt_manager->update_olt($_POST['original_ip'], array(
                    'type' => $_POST['olt_type'], 'ip' => $_POST['ip'], 'username' => $_POST['username'],
                    'password' => $_POST['password'], 'snmp_community' => $_POST['snmp_community'],
                    'port' => $_POST['port'], 'timeout' => $_POST['timeout'],
                    'latlong' => isset($_POST['latlong']) ? $_POST['latlong'] : ''
                ));
                if ($result) {
                    $message = "OLT updated successfully";
                    $force_sync = true;
                }
                else $error = "Failed to update OLT";
                break;
            case 'delete_olt':
                if ($olt_manager->remove_olt($_POST['ip'])) {
                    $message = "OLT removed successfully";
                    $force_sync = true;
                    // Clean up cache for deleted OLT
                    $cache = get_cached_data();
                    if (isset($cache['olt_summary'][$_POST['ip']])) {
                        unset($cache['olt_summary'][$_POST['ip']]);
                        $cache['onus'] = array_filter($cache['onus'], function($o) {
                            return $o['olt_ip'] !== $_POST['ip'];
                        });
                        // Recalculate stats
                        $cache['total_onus'] = count($cache['onus']);
                        $cache['active_onus'] = 0;
                        $cache['offline_onus'] = 0;
                        $cache['poor_signal'] = 0;
                        foreach ($cache['onus'] as $onu) {
                            if ($onu['status'] === 'active') $cache['active_onus']++;
                            else $cache['offline_onus']++;
                            if ($onu['signal_quality'] === 'Poor') $cache['poor_signal']++;
                        }
                        save_cached_data($cache);
                    }
                }
                else $error = "Failed to remove OLT";
                break;
            case 'toggle_olt':
                $olts = $olt_manager->get_olts();
                foreach ($olts as $olt) {
                    if ($olt['ip'] === $_POST['ip']) {
                        $enabled = isset($olt['enabled']) ? !$olt['enabled'] : false;
                        $olt_manager->update_olt($_POST['ip'], array('enabled' => $enabled));
                        $message = "OLT " . ($enabled ? "enabled" : "disabled");
                        $force_sync = true;
                        break;
                    }
                }
                break;
            case 'reboot_onu':
                $success = false;
                $olts = $olt_manager->get_olts();
                foreach ($olts as $olt) {
                    if ($olt['ip'] === $_POST['olt_ip'] && (!isset($olt['enabled']) || $olt['enabled'])) {
                        $monitor = new OLTMonitor($olt['type'], $olt['ip'], $olt['username'], $olt['password'],
                            isset($olt['snmp_community']) ? $olt['snmp_community'] : 'public',
                            isset($olt['port']) ? $olt['port'] : 23,
                            isset($olt['timeout']) ? $olt['timeout'] : 10);
                        
                        switch($olt['type']) {
                            case 'bdcom_epon': 
                                $onu_parts = explode(':', $_POST['onu_id']);
                                $port_idx = isset($onu_parts[0]) ? $onu_parts[0] : '1';
                                $onu_idx = isset($onu_parts[1]) ? $onu_parts[1] : '';
                                $success = $monitor->bdcom_epon_reboot_onu("epon 0/$port_idx", $onu_idx); 
                                break;
                            case 'bdcom_gpon': $success = $monitor->bdcom_gpon_reboot_onu('gpon 0/1', $_POST['onu_id']); break;
                            case 'dm_epon':
                            case 'vsol_epon': $success = $monitor->vsol_epon_reboot_onu($_POST['onu_id']); break;
                            case 'dm_gpon':
                            case 'vsol_gpon': $success = $monitor->vsol_gpon_reboot_onu($_POST['onu_id']); break;
                        }
                        break;
                    }
                }
                if ($success) $message = "Reboot command sent successfully";
                else $error = "Failed to send reboot command";
                break;
            case 'search_mac':
                $search_mac_result = array();
                $olts = $olt_manager->get_olts();
                foreach ($olts as $olt) {
                    if (!isset($olt['enabled']) || $olt['enabled']) {
                        $monitor = new OLTMonitor($olt['type'], $olt['ip'], $olt['username'], $olt['password'],
                            isset($olt['snmp_community']) ? $olt['snmp_community'] : 'public',
                            isset($olt['port']) ? $olt['port'] : 23,
                            isset($olt['timeout']) ? $olt['timeout'] : 10);
                        $result = $monitor->get_mac_table($_POST['search_mac']);
                        if ($result) {
                            $result['olt_ip'] = $olt['ip'];
                            $search_mac_result[] = $result;
                        }
                    }
                }
                if (empty($search_mac_result)) $error = "MAC address not found";
                else $message = "Found " . count($search_mac_result) . " result(s)";
                break;
            case 'test_connection':
                $olts = $olt_manager->get_olts();
                foreach ($olts as $olt) {
                    if ($olt['ip'] === $_POST['ip']) {
                        $monitor = new OLTMonitor($olt['type'], $olt['ip'], $olt['username'], $olt['password'],
                            isset($olt['snmp_community']) ? $olt['snmp_community'] : 'public',
                            isset($olt['port']) ? $olt['port'] : 23,
                            isset($olt['timeout']) ? $olt['timeout'] : 10);
                        if ($monitor->test_connection()) $message = "Connection successful to " . $olt['ip'];
                        else $error = "Connection failed to " . $olt['ip'] . ". Check logs.";
                        break;
                    }
                }
                break;
            case 'run_command':
                $olts = $olt_manager->get_olts();
                foreach ($olts as $olt) {
                    if ($olt['ip'] === $_POST['ip']) {
                        $monitor = new OLTMonitor($olt['type'], $olt['ip'], $olt['username'], $olt['password'],
                            isset($olt['snmp_community']) ? $olt['snmp_community'] : 'public',
                            isset($olt['port']) ? $olt['port'] : 23,
                            isset($olt['timeout']) ? $olt['timeout'] : 15);
                        if ($monitor->test_connection()) {
                            $cmd_output = $monitor->execute_command($_POST['command'], 5);
                            $monitor->telnet_disconnect();
                            echo "<div style='background:#000; color:#0f0; padding:20px; font-family:monospace; white-space:pre-wrap; max-height:500px; overflow:auto;'>";
                            echo "<h3>Output for: " . htmlspecialchars($_POST['command']) . "</h3>";
                            echo htmlspecialchars($cmd_output);
                            echo "</div><hr><button onclick='location.reload()'>Close</button>";
                            exit;
                        } else {
                            echo "Connection failed";
                            exit;
                        }
                    }
                }
                break;
            case 'view_logs':
                if (file_exists('olt_monitor.log')) {
                    $logs = file_get_contents('olt_monitor.log');
                    $lines = explode("\n", $logs);
                    $last_logs = array_slice($lines, -100);
                    echo "<div style='background:#1e1e1e; color:#d4d4d4; padding:20px; font-family:Consolas, monospace; white-space:pre-wrap; max-height:600px; overflow:auto;'>";
                    echo "<h3>Last 100 Log Entries</h3>";
                    echo htmlspecialchars(implode("\n", $last_logs));
                    echo "</div><hr><button onclick='location.reload()'>Close</button>";
                } else {
                    echo "Log file not found.";
                }
                exit;
            case 'view_mac_table':
                $olts = $olt_manager->get_olts();
                foreach ($olts as $olt) {
                    if ($olt['ip'] === $_POST['olt_ip']) {
                        $monitor = new OLTMonitor($olt['type'], $olt['ip'], $olt['username'], $olt['password'], 'public', isset($olt['port']) ? $olt['port'] : 23);
                        if ($monitor->test_connection()) {
                            $parts = explode(':', $_POST['onu_id']);
                            $port = $parts[0];
                            if (strpos($olt['type'], 'gpon') !== false) {
                                $cmd = "show mac address-table interface gpon 0/$port";
                            } else {
                                $cmd = "show mac address-table interface epon 0/$port";
                            }
                            $output = $monitor->execute_command($cmd, 4);
                            $monitor->telnet_disconnect();
                            echo "<div style='background:#000; color:#0f0; padding:20px; font-family:monospace; white-space:pre-wrap; max-height:600px; overflow:auto;'>";
                            echo "<h3>Mac Address Table - " . (strpos($olt['type'], 'gpon') !== false ? "GPON" : "EPON") . " 0/$port</h3>";
                            echo "<div style='border-bottom: 1px solid #333; margin-bottom: 10px; padding-bottom: 10px; color: #888;'>OLT: " . htmlspecialchars($olt['ip']) . "</div>";
                            echo htmlspecialchars($output);
                            echo "</div><hr><button onclick='location.reload()'>Close</button>";
                        } else {
                            echo "Connection failed to OLT.";
                        }
                        exit;
                    }
                }
                break;
        }
    }
}

// Handle GET requests for editing
if (isset($_GET['edit']) && isset($_GET['ip'])) {
    $olts = $olt_manager->get_olts();
    foreach ($olts as $olt) {
        if ($olt['ip'] === $_GET['ip']) { $edit_olt = $olt; break; }
    }
}

// Concurrency-safe cache helper functions
function get_cached_data() {
    $cache_file = 'olt_cache.json';
    $empty_cache = array(
        'total_onus' => 0,
        'active_onus' => 0,
        'offline_onus' => 0,
        'poor_signal' => 0,
        'olt_summary' => array(),
        'onus' => array()
    );
    
    if (!file_exists($cache_file)) {
        return $empty_cache;
    }
    
    $fp = @fopen($cache_file, 'r');
    if ($fp) {
        @flock($fp, LOCK_SH);
        $size = @filesize($cache_file);
        $content = '';
        if ($size > 0) {
            $content = @fread($fp, $size);
        }
        @flock($fp, LOCK_UN);
        @fclose($fp);
        
        $data = json_decode($content, true);
        if (is_array($data)) {
            return $data;
        }
    }
    
    return $empty_cache;
}

function save_cached_data($data) {
    $cache_file = 'olt_cache.json';
    $fp = @fopen($cache_file, 'c+');
    if ($fp) {
        @flock($fp, LOCK_EX);
        @ftruncate($fp, 0);
        @rewind($fp);
        @fwrite($fp, json_encode($data));
        @flock($fp, LOCK_UN);
        @fclose($fp);
        return true;
    }
    return false;
}

function sync_single_olt($olt_ip) {
    $olt_manager = new OLTManager();
    $olts = $olt_manager->get_olts();
    $target_olt = null;
    foreach ($olts as $o) {
        if ($o['ip'] === $olt_ip) {
            $target_olt = $o;
            break;
        }
    }
    
    if (!$target_olt) {
        return array('success' => false, 'error' => 'OLT not found in configuration');
    }
    
    $enabled = isset($target_olt['enabled']) ? $target_olt['enabled'] : true;
    if (!$enabled) {
        return array('success' => false, 'error' => 'OLT is disabled');
    }
    
    try {
        $monitor = new OLTMonitor($target_olt['type'], $target_olt['ip'], $target_olt['username'], $target_olt['password'],
            isset($target_olt['snmp_community']) ? $target_olt['snmp_community'] : 'public',
            isset($target_olt['port']) ? $target_olt['port'] : 23,
            isset($target_olt['timeout']) ? $target_olt['timeout'] : 10);
        
        $data = $monitor->monitor_all_onus();
        if ($data === false) {
            return array('success' => false, 'error' => 'Failed to connect to OLT via Telnet');
        }
        
        $new_onus = array();
        $olt_summary = array(
            'type' => $target_olt['type'],
            'total' => 0, 'online' => 0, 'offline' => 0, 'poor' => 0,
            'ports' => array()
        );
        
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
                
                $onu_data = array(
                    'olt_ip' => $target_olt['ip'], 'olt_type' => $target_olt['type'],
                    'onu_id' => $onu['onu_id'], 'mac' => $onu['mac'], 'status' => $online ? 'active' : 'offline',
                    'mactable' => (isset($data['mactable'][$onu['onu_id']]) && !empty($data['mactable'][$onu['onu_id']])) 
                                  ? $data['mactable'][$onu['onu_id']] 
                                  : ($online ? array(array('mac' => $onu['mac'], 'vlan' => 'ONU')) : array()),
                    'rx_power' => isset($data['power'][$onu['onu_id']]['rx_power']) ? $data['power'][$onu['onu_id']]['rx_power'] : 'N/A',
                    'tx_power' => isset($data['power'][$onu['onu_id']]['tx_power']) ? $data['power'][$onu['onu_id']]['tx_power'] : 'N/A',
                    'signal_quality' => $quality, 'uptime' => isset($data['uptime'][$onu['onu_id']]) ? $data['uptime'][$onu['onu_id']] : 'N/A'
                );
                
                $port_num = explode(':', $onu['onu_id'])[0];
                if (!isset($olt_summary['ports'][$port_num])) {
                    $olt_summary['ports'][$port_num] = array('total' => 0, 'online' => 0, 'offline' => 0);
                }
                
                $new_onus[] = $onu_data;
                $olt_summary['total']++;
                $olt_summary['ports'][$port_num]['total']++;
                
                if ($online) {
                    $olt_summary['online']++;
                    $olt_summary['ports'][$port_num]['online']++;
                } else {
                    $olt_summary['offline']++;
                    $olt_summary['ports'][$port_num]['offline']++;
                }
                if ($quality == 'Poor') {
                    $olt_summary['poor']++;
                }
            }
        }
        
        // Lock and update the cache file
        $cache_file = 'olt_cache.json';
        $current_cache = array(
            'total_onus' => 0,
            'active_onus' => 0,
            'offline_onus' => 0,
            'poor_signal' => 0,
            'olt_summary' => array(),
            'onus' => array()
        );
        
        $fp = @fopen($cache_file, 'c+');
        if ($fp) {
            @flock($fp, LOCK_EX);
            $size = @filesize($cache_file);
            if ($size > 0) {
                $content = @fread($fp, $size);
                $decoded = json_decode($content, true);
                if (is_array($decoded)) {
                    $current_cache = $decoded;
                }
            }
            
            if (!isset($current_cache['olt_summary'])) $current_cache['olt_summary'] = array();
            if (!isset($current_cache['onus'])) $current_cache['onus'] = array();
            
            $current_cache['olt_summary'][$olt_ip] = $olt_summary;
            
            // Filter out old ONUs for this specific OLT
            $filtered_onus = array();
            foreach ($current_cache['onus'] as $onu) {
                if ($onu['olt_ip'] !== $olt_ip) {
                    $filtered_onus[] = $onu;
                }
            }
            
            // Merge with new ONUs
            $current_cache['onus'] = array_merge($filtered_onus, $new_onus);
            
            // Recalculate global stats
            $current_cache['total_onus'] = count($current_cache['onus']);
            $current_cache['active_onus'] = 0;
            $current_cache['offline_onus'] = 0;
            $current_cache['poor_signal'] = 0;
            
            foreach ($current_cache['onus'] as $onu) {
                if ($onu['status'] === 'active') {
                    $current_cache['active_onus']++;
                } else {
                    $current_cache['offline_onus']++;
                }
                if ($onu['signal_quality'] === 'Poor') {
                    $current_cache['poor_signal']++;
                }
            }
            
            @ftruncate($fp, 0);
            @rewind($fp);
            @fwrite($fp, json_encode($current_cache));
            @flock($fp, LOCK_UN);
            @fclose($fp);
        }
        
        return array(
            'success' => true, 
            'olt_ip' => $olt_ip, 
            'summary' => $olt_summary, 
            'onus' => $new_onus,
            'global' => array(
                'total_onus' => $current_cache['total_onus'],
                'active_onus' => $current_cache['active_onus'],
                'offline_onus' => $current_cache['offline_onus'],
                'poor_signal' => $current_cache['poor_signal']
            )
        );
    } catch (Exception $e) { 
        return array('success' => false, 'error' => $e->getMessage()); 
    }
}

// API Endpoint routing
if (isset($_GET['api'])) {
    header('Content-Type: application/json');
    ob_clean();
    
    switch ($_GET['api']) {
        case 'sync_olt':
            $ip = isset($_GET['ip']) ? $_GET['ip'] : '';
            if (!$ip) {
                echo json_encode(array('success' => false, 'error' => 'Missing IP parameter'));
                exit;
            }
            $result = sync_single_olt($ip);
            echo json_encode($result);
            exit;
            
        case 'get_cache':
            $data = get_cached_data();
            echo json_encode($data);
            exit;
            
        default:
            echo json_encode(array('success' => false, 'error' => 'Invalid API action'));
            exit;
    }
}

// Get monitoring data using immediate caching
$cache_file = 'olt_cache.json';
$cache_time = 1800; // 30 minutes in seconds
$monitoring_data = get_cached_data();

// Initialize empty structure file if cache file doesn't exist
if (!file_exists($cache_file)) {
    save_cached_data($monitoring_data);
}

$olts = $olt_manager->get_olts();

// Determine if we need to trigger sync on load (cache older than 30s or new OLT added)
$configured_ips = array_map(function($o) { return $o['ip']; }, array_filter($olts, function($o) { return !isset($o['enabled']) || $o['enabled']; }));
$cached_ips = isset($monitoring_data['olt_summary']) ? array_keys($monitoring_data['olt_summary']) : array();

$needs_sync_for_new_olt = false;
foreach ($configured_ips as $ip) {
    if (!in_array($ip, $cached_ips)) {
        $needs_sync_for_new_olt = true;
        break;
    }
}

$needs_sync = (time() - filemtime($cache_file)) >= $cache_time || count($monitoring_data['onus']) == 0 || $needs_sync_for_new_olt || ($force_sync ?? false);
if (!isset($monitoring_data['olt_summary'])) $monitoring_data['olt_summary'] = array();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ISP OLT Monitoring System - Complete Solution</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --secondary: #ec4899;
            --accent: #8b5cf6;
            --bg-dark: #0f172a;
            --bg-card: rgba(30, 41, 59, 0.7);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --border: rgba(255, 255, 255, 0.1);
            --glass: rgba(255, 255, 255, 0.05);
            --online: #10b981;
            --offline: #ef4444;
            --warning: #f59e0b;
            --shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Outfit', sans-serif; 
            background: radial-gradient(circle at top right, #1e1b4b, #0f172a);
            color: var(--text-main);
            min-height: 100vh; 
            padding: 20px; 
            line-height: 1.6;
            overflow-x: hidden;
        }

        body::before {
            content: '';
            position: fixed;
            top: -10%;
            left: -10%;
            width: 40%;
            height: 40%;
            background: var(--primary);
            filter: blur(150px);
            opacity: 0.15;
            z-index: -1;
            border-radius: 50%;
        }

        body::after {
            content: '';
            position: fixed;
            bottom: -10%;
            right: -10%;
            width: 40%;
            height: 40%;
            background: var(--secondary);
            filter: blur(150px);
            opacity: 0.1;
            z-index: -1;
            border-radius: 50%;
        }

        .container { max-width: 1440px; margin: 0 auto; position: relative; z-index: 1; }

        .header { 
            background: var(--bg-card);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: 20px; 
            padding: 30px; 
            margin-bottom: 30px; 
            box-shadow: var(--shadow);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header-content h1 { 
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(to right, #fff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 5px;
            letter-spacing: -1px;
        }

        .header-content p { color: var(--text-muted); font-size: 1.1rem; }

        .tabs { 
            display: flex; 
            gap: 12px; 
            margin-bottom: 30px; 
            background: var(--glass);
            padding: 8px;
            border-radius: 16px;
            width: fit-content;
            border: 1px solid var(--border);
        }

        .tab { 
            background: transparent;
            color: var(--text-muted); 
            border: none; 
            padding: 12px 24px; 
            border-radius: 10px; 
            cursor: pointer; 
            font-size: 15px; 
            font-weight: 500;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tab i { font-size: 18px; }

        .tab.active { 
            background: var(--primary); 
            color: white; 
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }

        .tab:not(.active):hover { 
            background: rgba(255,255,255,0.05); 
            color: white;
            transform: translateY(-2px); 
        }

        .tab-content { display: none; animation: fadeIn 0.5s ease; }
        .tab-content.active { display: block; }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .card { 
            background: var(--bg-card);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: 20px; 
            padding: 25px; 
            margin-bottom: 30px; 
            box-shadow: var(--shadow);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--border);
        }

        .card-header h2, .card-header h3 { 
            font-size: 1.5rem;
            font-weight: 600;
            color: white;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
            gap: 25px; 
            margin-bottom: 35px; 
        }

        .stat-card { 
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 20px; 
            padding: 25px; 
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
            border-color: var(--primary);
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0; right: 0;
            width: 80px; height: 80px;
            background: linear-gradient(135deg, transparent, rgba(255,255,255,0.05));
            border-radius: 0 0 0 100%;
        }

        .stat-card .number { font-size: 42px; font-weight: 700; color: white; line-height: 1; }
        .stat-card .label { font-size: 15px; color: var(--text-muted); margin-top: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; }
        .stat-card .icon { 
            position: absolute; 
            right: 25px; 
            top: 25px; 
            font-size: 28px; 
            opacity: 0.3;
            color: var(--primary);
        }

        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; color: var(--text-muted); font-weight: 500; font-size: 14px; }
        .form-group input, .form-group select { 
            width: 100%; 
            padding: 12px 16px; 
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border);
            border-radius: 12px; 
            color: white;
            font-size: 15px; 
            outline: none;
            transition: border-color 0.3s;
        }

        .form-group input:focus, .form-group select:focus { border-color: var(--primary); }

        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

        button { 
            background: var(--primary); 
            color: white; 
            border: none; 
            padding: 12px 24px; 
            border-radius: 12px; 
            cursor: pointer; 
            font-size: 15px; 
            font-weight: 600;
            transition: all 0.3s; 
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        button:hover { 
            background: var(--primary-hover); 
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .table-container { overflow-x: auto; border-radius: 16px; border: 1px solid var(--border); }
        table { width: 100%; border-collapse: separate; border-spacing: 0; }
        th, td { padding: 16px; text-align: left; border-bottom: 1px solid var(--border); }
        th { 
            background: rgba(255, 255, 255, 0.03); 
            font-weight: 600; 
            color: var(--text-muted); 
            text-transform: uppercase; 
            font-size: 12px;
            letter-spacing: 1px;
        }

        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255, 255, 255, 0.02); }

        .vlan-tag { 
            background: var(--glass); 
            color: var(--accent); 
            padding: 2px 8px; 
            border-radius: 6px; 
            font-weight: 600; 
            font-size: 11px; 
            border: 1px solid rgba(139, 92, 246, 0.3);
        }

        .mactable-list { max-height: 100px; overflow-y: auto; font-size: 12px; padding-right: 5px; }
        .mactable-list::-webkit-scrollbar { width: 4px; }
        .mactable-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

        .mactable-item { border-bottom: 1px solid var(--border); padding: 4px 0; color: var(--text-muted); }
        .mactable-item:last-child { border-bottom: none; }

        .badge { padding: 4px 10px; border-radius: 8px; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
        .badge-online { background: rgba(16, 185, 129, 0.1); color: var(--online); border: 1px solid rgba(16, 185, 129, 0.2); }
        .badge-offline { background: rgba(239, 68, 68, 0.1); color: var(--offline); border: 1px solid rgba(239, 68, 68, 0.2); }

        .signal-indicator { width: 100%; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-top: 5px; }
        .signal-bar { height: 100%; transition: width 1s ease-in-out; }
        .signal-Good { background: var(--online); }
        .signal-Fair { background: var(--warning); }
        .signal-Poor { background: var(--offline); }
        .signal-Offline { background: #475569; }
        .signal-Unknown { background: var(--text-muted); }

        .btn-small { padding: 8px 14px; font-size: 13px; border-radius: 10px; }
        .btn-danger { background: rgba(239, 68, 68, 0.1); color: var(--offline); border: 1px solid rgba(239, 68, 68, 0.2); }
        .btn-danger:hover { background: var(--offline); color: white; }
        .btn-success { background: rgba(16, 185, 129, 0.1); color: var(--online); border: 1px solid rgba(16, 185, 129, 0.2); }
        .btn-success:hover { background: var(--online); color: white; }
        .btn-warning { background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2); }
        .btn-warning:hover { background: var(--warning); color: white; }
        .btn-info { background: rgba(99, 102, 241, 0.1); color: var(--primary); border: 1px solid rgba(99, 102, 241, 0.2); }
        .btn-info:hover { background: var(--primary); color: white; }

        .message { padding: 15px 20px; border-radius: 16px; margin-bottom: 25px; display: flex; align-items: center; gap: 12px; }
        .message-success { background: rgba(16, 185, 129, 0.1); color: var(--online); border: 1px solid rgba(16, 185, 129, 0.2); }
        .message-error { background: rgba(239, 68, 68, 0.1); color: var(--offline); border: 1px solid rgba(239, 68, 68, 0.2); }

        .port-badge {
            background: var(--glass);
            padding: 8px 16px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .port-badge:hover {
            background: var(--primary);
            color: white;
            transform: translateY(-3px) scale(1.05);
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
            border-color: rgba(255,255,255,0.2);
        }
        .port-badge:active { transform: translateY(-1px) scale(1); }
        .port-badge.active { background: var(--primary); border-color: var(--primary); }
        .port-badge strong { color: var(--text-muted); transition: color 0.3s; }
        .port-badge:hover strong { color: rgba(255,255,255,0.8); }

        .search-box { display: flex; gap: 12px; margin-bottom: 30px; }
        .search-box input { flex: 1; padding: 12px 20px; background: var(--glass); border: 1px solid var(--border); border-radius: 14px; color: white; outline: none; }
        .search-box input:focus { border-color: var(--primary); }

        .loading { 
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(8px);
            z-index: 9999; flex-direction: column; align-items: center; justify-content: center;
        }
        .loading.active { display: flex; }
        .spinner { 
            width: 50px; height: 50px; 
            border: 4px solid var(--border); 
            border-top: 4px solid var(--primary); 
            border-radius: 50%; 
            animation: spin 1s linear infinite; 
            margin-bottom: 20px;
        }
        
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg-dark); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

        @media (max-width: 1024px) { 
            .form-row { grid-template-columns: 1fr; gap: 10px; } 
            .stats { grid-template-columns: repeat(2, 1fr); gap: 15px; }
            .card { padding: 20px; }
            body { padding: 15px; }
        }
        
        @media (max-width: 768px) {
            .header-content h1 { font-size: 2rem; }
            .header { padding: 20px; flex-direction: column; text-align: center; gap: 20px; }
            .header-actions { width: 100%; }
            .header-actions button { width: 100%; }
            
            table th, table td { padding: 12px 10px; font-size: 13px; }
            .btn-small { padding: 6px 10px; font-size: 12px; }
        }
        
        @media (max-width: 640px) {
            .stats { grid-template-columns: 1fr; gap: 12px; }
            .tabs { 
                display: flex;
                width: 100%; 
                overflow-x: auto; 
                white-space: nowrap; 
                padding: 6px; 
                gap: 8px;
                -webkit-overflow-scrolling: touch; 
            }
            .tab { 
                flex: 0 0 auto; 
                padding: 10px 16px; 
                font-size: 14px; 
            }
            .search-box { 
                flex-direction: column; 
                gap: 10px; 
            }
            .search-box button, .search-box input { 
                width: 100%; 
            }
            .card { padding: 15px; border-radius: 16px; }
            .card-header { flex-direction: column; align-items: flex-start; gap: 10px; }
        }
    </style>
</head>
<body>
<div class="loading" id="loading"><div class="spinner"></div><p>Processing...</p></div>

<div class="container">
    <div class="header">
        <div class="header-content">
            <h1>OLT Pro</h1>
            <p><i class="fas fa-network-wired"></i> Unified Monitoring & Management Console</p>
        </div>
        <div class="header-actions">
            <button onclick="refreshData(true)" style="background: var(--glass); border: 1px solid var(--border);">
                <i class="fas fa-sync-alt"></i> Sync All
            </button>
        </div>
    </div>
    
    <?php if ($message): ?><div class="message message-success"><?php echo htmlspecialchars($message); ?></div><?php endif; ?>
    <?php if ($error): ?><div class="message message-error"><?php echo htmlspecialchars($error); ?></div><?php endif; ?>
    
    <div class="tabs">
        <button class="tab active" onclick="showTab('dashboard', this)"><i class="fas fa-chart-line"></i> Dashboard</button>
        <button class="tab" onclick="showTab('olts', this)"><i class="fas fa-server"></i> Network</button>
        <button class="tab" onclick="showTab('search', this)"><i class="fas fa-search"></i> MAC Explorer</button>
        <button class="tab" onclick="showTab('add', this)"><i class="fas fa-plus-circle"></i> Provisioning</button>
    </div>
    
    <!-- Dashboard Tab -->
    <div id="dashboard" class="tab-content active">
        <!-- OLT Summary Section -->
        <div class="card" style="margin-bottom: 30px;">
            <div class="card-header">
                <h3 style="margin: 0;"><i class="fas fa-server"></i> OLT Performance Summary</h3>
            </div>
            <div class="card-body table-container">
                <table style="width:100%; border-collapse:collapse; text-align:left;">
                    <thead>
                        <tr style="border-bottom:2px solid #333; color:#888;">
                            <th style="padding:15px;">OLT IP</th>
                            <th style="padding:15px;">Type</th>
                            <th style="padding:15px;">Total ONUs</th>
                            <th style="padding:15px;">Online</th>
                            <th style="padding:15px;">Offline</th>
                            <th style="padding:15px;">Poor Signal</th>
                            <th style="padding:15px;">Port Statistics</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($monitoring_data['olt_summary'] as $ip => $stats): ?>
                            <tr data-summary-olt="<?php echo $ip; ?>">
                                <td style="padding:15px; font-weight:bold;">
                                    <i class="fas fa-server" style="color: var(--primary); margin-right: 8px;"></i>
                                    <?php echo $ip; ?>
                                    <span class="sync-status" style="margin-left: 8px; font-size: 11px; font-weight: normal; color: var(--text-muted);"></span>
                                </td>
                                <td style="padding:15px;"><span class="badge" style="background: var(--glass);"><?php echo strtoupper($stats['type']); ?></span></td>
                                <td style="padding:15px;"><span style="background:var(--glass); padding:4px 10px; border-radius:8px; font-weight: 600;"><?php echo $stats['total']; ?></span></td>
                                <td style="padding:15px;"><span style="color:var(--online); font-weight:bold;"><i class="fas fa-check"></i> <?php echo $stats['online']; ?></span></td>
                                <td style="padding:15px;"><span style="color:var(--offline); font-weight:bold;"><i class="fas fa-times"></i> <?php echo $stats['offline']; ?></span></td>
                                <td style="padding:15px;"><span style="color:var(--warning); font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> <?php echo $stats['poor']; ?></span></td>
                                <td style="padding:15px;">
                                     <div style="display:flex; flex-wrap:wrap; gap:12px; padding: 10px 0;">
                                         <?php ksort($stats['ports']); foreach ($stats['ports'] as $p => $ps): 
                                             $port_online = ($ps['online'] > 0);
                                         ?>
                                             <div class="port-badge" 
                                                  onclick="filterByPort('<?php echo $ip; ?>', '<?php echo $p; ?>', this)"
                                                  style="border-color: <?php echo $port_online ? 'rgba(16, 185, 129, 0.4)' : 'var(--border)'; ?>;" 
                                                  title="Click to filter Port <?php echo $p; ?>">
                                                 <strong>P<?php echo $p; ?></strong> 
                                                 <span style="color:var(--online);"><?php echo $ps['online']; ?></span>
                                                 <span style="color: var(--text-muted); font-size: 10px;">/</span>
                                                 <span style="color:var(--offline);"><?php echo $ps['offline']; ?></span>
                                             </div>
                                         <?php endforeach; ?>
                                     </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <i class="fas fa-microchip icon"></i>
                <div class="number"><?php echo $monitoring_data['total_onus']; ?></div>
                <div class="label">Total Devices</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid var(--online);">
                <i class="fas fa-signal icon" style="color: var(--online);"></i>
                <div class="number" style="color: var(--online);"><?php echo $monitoring_data['active_onus']; ?></div>
                <div class="label">Active Sessions</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid var(--offline);">
                <i class="fas fa-plug-circle-xmark icon" style="color: var(--offline);"></i>
                <div class="number" style="color: var(--offline);"><?php echo $monitoring_data['offline_onus']; ?></div>
                <div class="label">Link Failures</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid var(--warning);">
                <i class="fas fa-triangle-exclamation icon" style="color: var(--warning);"></i>
                <div class="number" style="color: var(--warning);"><?php echo $monitoring_data['poor_signal']; ?></div>
                <div class="label">Signal Alerts</div>
            </div>
        </div>
        
        <div class="card">
            <h2>ONU Status</h2>
            <div class="search-box">
                <input type="text" id="onuSearch" placeholder="Search by MAC, ONU ID, or OLT IP..." onkeyup="filterONUs()">
                <button onclick="refreshData(true)" style="background:var(--online)"><i class="fas fa-sync-alt"></i> Force Refresh</button>
                <button onclick="viewLogs()" style="background:var(--glass); border: 1px solid var(--border);"><i class="fas fa-list-ul"></i> View Logs</button>
            </div>
            <div class="table-container">
                <table id="onuTable">
                    <thead><tr><th>OLT IP</th><th>ONU ID</th><th>MAC Address</th><th>MacTable</th><th>Status</th><th>RX Power</th><th>TX Power</th><th>Signal</th><th>Uptime</th><th>Action</th></tr></thead>
                    <tbody>
                        <?php if (!empty($monitoring_data['onus'])): ?>
                            <?php foreach ($monitoring_data['onus'] as $onu): ?>
                                 <tr data-mac="<?php echo strtolower($onu['mac']); ?>" 
                                    data-id="<?php echo $onu['onu_id']; ?>" 
                                    data-olt="<?php echo $onu['olt_ip']; ?>"
                                    data-port="<?php echo explode(':', $onu['onu_id'])[0]; ?>">
                                    <td><?php echo htmlspecialchars($onu['olt_ip']); ?></td>
                                    <td><?php echo htmlspecialchars($onu['onu_id']); ?></td>
                                    <td><?php echo htmlspecialchars($onu['mac']); ?></td>
                                    <td>
                                        <div class="mactable-list">
                                            <?php if (!empty($onu['mactable'])): ?>
                                                <?php foreach ($onu['mactable'] as $m): ?>
                                                    <div class="mactable-item"><?php echo $m['mac']; ?> <span class="vlan-tag"><?php echo $m['vlan']; ?></span></div>
                                                <?php endforeach; ?>
                                            <?php else: ?>
                                                <span style="color:#999">N/A</span>
                                            <?php endif; ?>
                                        </div>
                                    </td>
                                    <td>
                                        <?php $is_online = (strtolower($onu['status']) === 'active' || strtolower($onu['status']) === 'online' || strtolower($onu['status']) === 'up'); ?>
                                        <div class="badge <?php echo $is_online ? 'badge-online' : 'badge-offline'; ?>">
                                            <i class="fas <?php echo $is_online ? 'fa-check-circle' : 'fa-times-circle'; ?>"></i>
                                            <?php echo strtoupper($onu['status']); ?>
                                        </div>
                                    </td>
                                    <td><strong><?php echo $onu['rx_power']; ?></strong> <small>dBm</small></td>
                                    <td><strong><?php echo $onu['tx_power']; ?></strong> <small>dBm</small></td>
                                    <td>
                                        <div style="font-size: 11px; margin-bottom: 4px;"><?php echo $onu['signal_quality']; ?></div>
                                        <div class="signal-indicator">
                                            <?php 
                                                $sq = $onu['signal_quality'];
                                                $width = ($sq == 'Good') ? '90%' : (($sq == 'Fair') ? '60%' : (($sq == 'Poor') ? '30%' : (($sq == 'Offline') ? '5%' : '10%')));
                                            ?>
                                            <div class="signal-bar signal-<?php echo $sq; ?>" style="width: <?php echo $width; ?>;"></div>
                                        </div>
                                    </td>
                                    <td><?php echo $onu['uptime']; ?></td>
                                    <td>
                                        <button class="btn-small" onclick="rebootONU('<?php echo $onu['olt_ip']; ?>', '<?php echo $onu['onu_id']; ?>')">Reboot</button>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <tr><td colspan="9" style="text-align: center;">No ONU data available. Please add OLTs first.</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <!-- OLT Management Tab -->
    <div id="olts" class="tab-content">
        <div class="card">
            <h2>Configured OLTs</h2>
            <div class="search-box"><input type="text" id="oltSearch" placeholder="Search by IP or Type..." onkeyup="filterOLTs()"></div>
            <?php if (empty($olts)): ?>
                <p style="text-align: center; padding: 40px;">No OLTs configured. Use "Add OLT" tab to add your first OLT.</p>
            <?php else: ?>
                <div class="table-container">
                    <table id="oltTable">
                        <thead><tr><th>Type</th><th>IP Address</th><th>Username</th><th>Port</th><th>Status</th><th>Added Date</th><th>Actions</th></tr></thead>
                        <tbody>
                            <?php foreach ($olts as $olt): ?>
                                <tr data-ip="<?php echo $olt['ip']; ?>" data-type="<?php echo $olt['type']; ?>">
                                    <td><?php echo strtoupper(str_replace('_', ' ', $olt['type'])); ?></td>
                                    <td>
                                        <?php echo htmlspecialchars($olt['ip']); ?>
                                        <?php if (!empty($olt['latlong'])): ?>
                                            <br><small><i class="fas fa-map-marker-alt text-danger"></i> <a href="https://maps.google.com/?q=<?php echo urlencode($olt['latlong']); ?>" target="_blank" style="color: #4a5568; font-weight: bold;"><?php echo htmlspecialchars($olt['latlong']); ?></a></small>
                                        <?php endif; ?>
                                    </td>
                                    <td><?php echo htmlspecialchars($olt['username']); ?></td>
                                    <td><?php echo isset($olt['port']) ? $olt['port'] : '23'; ?></td>
                                    <td>
                                        <span class="badge <?php echo (isset($olt['enabled']) && $olt['enabled']) ? 'badge-online' : 'badge-offline'; ?>">
                                            <i class="fas <?php echo (isset($olt['enabled']) && $olt['enabled']) ? 'fa-check-circle' : 'fa-times-circle'; ?>"></i>
                                            <?php echo (isset($olt['enabled']) && $olt['enabled']) ? 'Enabled' : 'Disabled'; ?>
                                        </span>
                                    </td>
                                    <td><?php echo isset($olt['added_date']) ? $olt['added_date'] : 'N/A'; ?></td>
                                    <td>
                                        <form method="POST" style="display: inline;"><input type="hidden" name="action" value="toggle_olt"><input type="hidden" name="ip" value="<?php echo $olt['ip']; ?>"><button type="submit" class="btn-small btn-warning"><i class="fas fa-power-off"></i></button></form>
                                        <a href="?edit=1&ip=<?php echo urlencode($olt['ip']); ?>" class="btn-small btn-info" style="display: inline-block; text-decoration: none; color: white;"><i class="fas fa-edit"></i></a>
                                        <form method="POST" style="display: inline;" onsubmit="return confirm('Delete this OLT?')"><input type="hidden" name="action" value="delete_olt"><input type="hidden" name="ip" value="<?php echo $olt['ip']; ?>"><button type="submit" class="btn-small btn-danger"><i class="fas fa-trash"></i></button></form>
                                        <button onclick="testConnection('<?php echo $olt['ip']; ?>')" class="btn-small btn-success"><i class="fas fa-vial"></i></button>
                                        <button onclick="openCommandPanel('<?php echo $olt['ip']; ?>')" class="btn-small btn-info"><i class="fas fa-terminal"></i></button>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                
                <div class="card" id="oltCommands" style="display:none; margin-top:20px; border: 2px solid #667eea;">
                    <h2 id="commandTitle">OLT Diagnostic Commands</h2>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Quick Commands</label>
                            <select id="quickCmd" onchange="document.getElementById('customCmd').value = this.value">
                                <option value="">-- Select Command --</option>
                                <option value="show running-config">Show Full Config</option>
                                <option value="show interface brief">Show All Interface Status</option>
                                <option value="show running-config interface gigabitethernet 0/1">Show GE 0/1 Config</option>
                                <option value="show running-config interface epon 0/1">Show EPON 0/1 Config</option>
                                <option value="show version">Show Version/Model/SN</option>
                                <option value="show mac address-table">Show All MACs</option>
                                <option value="show mac address-table interface epon 0/1">Show EPON 0/1 MACs</option>
                                <option value="show mac address-table interface gigabitethernet 0/1">Show GE 0/1 MACs</option>
                                <option value="show mac address-table VLAN 1">Show VLAN 1 MACs</option>
                                <option value="show interface epon 0/1">Show EPON 0/1 Info</option>
                                <option value="show VLAN">Show VLAN Info</option>
                                <option value="show fan">Show Fan Status</option>
                                <option value="show power">Show Power Status</option>
                                <option value="show onu status pon 1">Show ONU Status PON 1</option>
                                <option value="show onu opm-diag pon 1">Show ONU Power PON 1</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Command to Run</label>
                            <input type="text" id="customCmd" placeholder="Enter command...">
                        </div>
                    </div>
                    <button onclick="runOLTCommand()">Execute Command</button>
                    <button onclick="document.getElementById('oltCommands').style.display='none'" style="background:#6c757d">Close</button>
                    <input type="hidden" id="selectedOltIp">
                </div>
            <?php endif; ?>
        </div>
        
        <?php if ($edit_olt): ?>
        <div class="card">
            <h2>Edit OLT</h2>
            <form method="POST">
                <input type="hidden" name="action" value="edit_olt">
                <input type="hidden" name="original_ip" value="<?php echo htmlspecialchars($edit_olt['ip']); ?>">
                <div class="form-row">
                    <div class="form-group"><label>OLT Type</label><select name="olt_type" required>
                        <option value="bdcom_epon" <?php echo $edit_olt['type'] == 'bdcom_epon' ? 'selected' : ''; ?>>BDCOM EPON</option>
                        <option value="bdcom_gpon" <?php echo $edit_olt['type'] == 'bdcom_gpon' ? 'selected' : ''; ?>>BDCOM GPON</option>
                        <option value="vsol_epon" <?php echo $edit_olt['type'] == 'vsol_epon' ? 'selected' : ''; ?>>VSOL EPON</option>
                        <option value="vsol_gpon" <?php echo $edit_olt['type'] == 'vsol_gpon' ? 'selected' : ''; ?>>VSOL GPON</option>
                        <option value="dm_epon" <?php echo $edit_olt['type'] == 'dm_epon' ? 'selected' : ''; ?>>DM EPON</option>
                        <option value="dm_gpon" <?php echo $edit_olt['type'] == 'dm_gpon' ? 'selected' : ''; ?>>DM GPON</option>
                    </select></div>
                    <div class="form-group"><label>IP Address</label><input type="text" name="ip" value="<?php echo htmlspecialchars($edit_olt['ip']); ?>" required></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Username</label><input type="text" name="username" value="<?php echo htmlspecialchars($edit_olt['username']); ?>" required></div>
                    <div class="form-group"><label>Password</label><input type="password" name="password" value="<?php echo htmlspecialchars($edit_olt['password']); ?>" required></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>SNMP Community</label><input type="text" name="snmp_community" value="<?php echo isset($edit_olt['snmp_community']) ? htmlspecialchars($edit_olt['snmp_community']) : 'public'; ?>"></div>
                    <div class="form-group"><label>Port</label><input type="number" name="port" value="<?php echo isset($edit_olt['port']) ? $edit_olt['port'] : '23'; ?>"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Timeout (seconds)</label><input type="number" name="timeout" value="<?php echo isset($edit_olt['timeout']) ? $edit_olt['timeout'] : '10'; ?>"></div>
                    <div class="form-group"><label>OLT Latlong</label><input type="text" name="latlong" value="<?php echo isset($edit_olt['latlong']) ? htmlspecialchars($edit_olt['latlong']) : ''; ?>" placeholder="e.g. 23.8103,90.4125"></div>
                </div>
                <div class="form-row" style="margin-top: 15px;">
                    <div class="form-group"><button type="submit">Update OLT</button><a href="olt_system.php" style="margin-left: 10px; display: inline-block; padding: 10px 20px; background: #6c757d; color: white; text-decoration: none; border-radius: 4px;">Cancel</a></div>
                </div>
            </form>
        </div>
        <?php endif; ?>
    </div>
    
    <!-- MAC Search Tab -->
    <div id="search" class="tab-content">
        <div class="card">
            <h2>Search MAC Address</h2>
            <form method="POST">
                <input type="hidden" name="action" value="search_mac">
                <div class="form-row">
                    <div class="form-group"><label>MAC Address</label><input type="text" name="search_mac" placeholder="XX:XX:XX:XX:XX:XX" value="<?php echo htmlspecialchars($search_mac); ?>" required></div>
                    <div class="form-group"><button type="submit">Search</button></div>
                </div>
            </form>
            
            <?php if ($search_mac_result !== null): ?>
                <h3 style="margin-top: 20px;">Search Results for: <?php echo htmlspecialchars($search_mac); ?></h3>
                <?php if (empty($search_mac_result)): ?>
                    <p>No results found.</p>
                <?php else: ?>
                    <table>
                        <thead><tr><th>OLT IP</th><th>MAC Address</th><th>VLAN</th><th>Port</th></tr></thead>
                        <tbody>
                            <?php foreach ($search_mac_result as $result): ?>
                                <tr><td><?php echo htmlspecialchars($result['olt_ip']); ?></td><td><?php echo htmlspecialchars($result['mac']); ?></td><td><?php echo htmlspecialchars($result['vlan']); ?></td><td><?php echo htmlspecialchars($result['port']); ?></td></tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            <?php endif; ?>
        </div>
    </div>
    
    <!-- Add OLT Tab -->
    <div id="add" class="tab-content">
        <div class="card">
            <h2>Add New OLT</h2>
            <form method="POST">
                <input type="hidden" name="action" value="add_olt">
                <div class="form-row">
                    <div class="form-group"><label>OLT Type *</label><select name="olt_type" required>
                        <option value="">Select Type</option>
                        <option value="bdcom_epon">BDCOM EPON</option>
                        <option value="bdcom_gpon">BDCOM GPON</option>
                        <option value="vsol_epon">VSOL EPON</option>
                        <option value="vsol_gpon">VSOL GPON</option>
                        <option value="dm_epon">DM EPON</option>
                        <option value="dm_gpon">DM GPON</option>
                    </select></div>
                    <div class="form-group"><label>IP Address *</label><input type="text" name="ip" placeholder="192.168.1.1" required></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Username *</label><input type="text" name="username" placeholder="admin" required></div>
                    <div class="form-group"><label>Password *</label><input type="password" name="password" required></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>SNMP Community</label><input type="text" name="snmp_community" value="public"></div>
                    <div class="form-group"><label>Telnet Port</label><input type="number" name="port" value="23"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Timeout (seconds)</label><input type="number" name="timeout" value="10"></div>
                    <div class="form-group"><label>OLT Latlong</label><input type="text" name="latlong" placeholder="e.g. 23.8103,90.4125"></div>
                </div>
                <div class="form-row" style="margin-top: 15px;">
                    <div class="form-group"><button type="submit">Add OLT</button></div>
                </div>
            </form>
        </div>
        
        <div class="card">
            <h2>Quick Configuration Guide</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                <div><h3>BDCOM EPON</h3><ul><li>ONU List: show epon onu-information interface epon 0/1</li><li>Power: show epon onu-ctc-optical-transceiver-diagnosis</li><li>Reboot: epon reboot onu interface epon 0/1:[ID]</li></ul></div>
                <div><h3>BDCOM GPON</h3><ul><li>ONU List: show gpon onu-information interface gpon 0/1</li><li>Power: show gpon onu-optical-transceiver-diagnosis</li><li>Reboot: gpon reboot onu interface gpon 0/1:[ID]</li></ul></div>
                <div><h3>VSOL EPON</h3><ul><li>ONU List: show onu status pon 1</li><li>Power: show onu opm-diag pon 1</li><li>Reboot: interface epon 0/1 → reset onu auth onuid [ID]</li></ul></div>
                <div><h3>VSOL GPON</h3><ul><li>ONU List: show onu info & show onu state</li><li>Power: show pon onu all rx-power (in interface mode)</li><li>Reboot: onu [ID] reboot (in interface mode)</li></ul></div>
            </div>
        </div>
    </div>
</div>

<script>
function showTab(tabName, btn) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    btn.classList.add('active');
}

function filterONUs() {
    let input = document.getElementById('onuSearch');
    let filter = input.value.toUpperCase();
    let table = document.getElementById('onuTable');
    let tr = table.getElementsByTagName('tr');
    for (let i = 1; i < tr.length; i++) {
        let mac = tr[i].getAttribute('data-mac') || '';
        let id = tr[i].getAttribute('data-id') || '';
        let olt = tr[i].getAttribute('data-olt') || '';
        tr[i].style.display = (mac.toUpperCase().indexOf(filter) > -1 || id.indexOf(filter) > -1 || olt.indexOf(filter) > -1) ? '' : 'none';
    }
}

function filterOLTs() {
    let input = document.getElementById('oltSearch');
    let filter = input.value.toUpperCase();
    let table = document.getElementById('oltTable');
    let tr = table.getElementsByTagName('tr');
    for (let i = 1; i < tr.length; i++) {
        let ip = tr[i].getAttribute('data-ip') || '';
        let type = tr[i].getAttribute('data-type') || '';
        tr[i].style.display = (ip.toUpperCase().indexOf(filter) > -1 || type.toUpperCase().indexOf(filter) > -1) ? '' : 'none';
    }
}

function filterByPort(olt_ip, port, element) {
    let isAlreadyActive = element && element.classList.contains('active');
    
    // UI Update: Reset all badges
    document.querySelectorAll('.port-badge').forEach(b => b.classList.remove('active'));

    let table = document.getElementById('onuTable');
    let tr = table.getElementsByTagName('tr');
    let searchInput = document.getElementById('onuSearch');

    if (isAlreadyActive) {
        // De-select: Show all and clear search
        searchInput.value = "";
        for (let i = 1; i < tr.length; i++) tr[i].style.display = '';
        console.log("Filter cleared");
    } else {
        // Select: Apply filter
        if (element) element.classList.add('active');
        
        // Scroll to table
        table.scrollIntoView({ behavior: 'smooth' });

        // Update search box
        searchInput.value = olt_ip + " Port " + port;

        let count = 0;
        for (let i = 1; i < tr.length; i++) {
            let row_olt = tr[i].getAttribute('data-olt') || '';
            let row_port = tr[i].getAttribute('data-port') || '';
            
            if (row_olt === olt_ip && row_port === port) {
                tr[i].style.display = '';
                count++;
            } else {
                tr[i].style.display = 'none';
            }
        }
        console.log("Filtered " + count + " ONUs for OLT " + olt_ip + " Port " + port);
    }
}

function rebootONU(olt_ip, onu_id) {
    if (confirm('Reboot ONU ' + onu_id + ' on ' + olt_ip + '?')) {
        document.getElementById('loading').classList.add('active');
        let formData = new FormData();
        formData.append('action', 'reboot_onu');
        formData.append('olt_ip', olt_ip);
        formData.append('onu_id', onu_id);
        fetch(window.location.href, { method: 'POST', body: formData })
            .then(response => response.text())
            .then(() => { alert('Reboot command sent'); location.reload(); })
            .catch(error => { alert('Error: ' + error); })
            .finally(() => { document.getElementById('loading').classList.remove('active'); });
    }
}

function testConnection(ip) {
    document.getElementById('loading').classList.add('active');
    let formData = new FormData();
    formData.append('action', 'test_connection');
    formData.append('ip', ip);
    fetch(window.location.href, { method: 'POST', body: formData })
        .then(response => response.text())
        .then(() => { alert('Test completed. Check message above.'); location.reload(); })
        .catch(error => alert('Error: ' + error))
        .finally(() => document.getElementById('loading').classList.remove('active'));
}

function openCommandPanel(ip) {
    document.getElementById('selectedOltIp').value = ip;
    document.getElementById('commandTitle').innerText = 'Diagnostic Commands for ' + ip;
    document.getElementById('oltCommands').style.display = 'block';
    document.getElementById('oltCommands').scrollIntoView();
}

function runOLTCommand() {
    let ip = document.getElementById('selectedOltIp').value;
    let cmd = document.getElementById('customCmd').value;
    if (!cmd) return alert('Please enter a command');
    
    document.getElementById('loading').classList.add('active');
    let formData = new FormData();
    formData.append('action', 'run_command');
    formData.append('ip', ip);
    formData.append('command', cmd);
    
    fetch(window.location.href, { method: 'POST', body: formData })
        .then(response => response.text())
        .then(html => {
            document.body.innerHTML = html;
        })
        .catch(error => alert('Error: ' + error))
        .finally(() => document.getElementById('loading').classList.remove('active'));
}

function viewMacTable(olt_ip, onu_id) {
    document.getElementById('loading').classList.add('active');
    let formData = new FormData();
    formData.append('action', 'view_mac_table');
    formData.append('olt_ip', olt_ip);
    formData.append('onu_id', onu_id);
    fetch(window.location.href, { method: 'POST', body: formData })
        .then(response => response.text())
        .then(html => { document.body.innerHTML = html; })
        .catch(error => alert('Error: ' + error))
        .finally(() => document.getElementById('loading').classList.remove('active'));
}

function viewLogs() {
    document.getElementById('loading').classList.add('active');
    let formData = new FormData();
    formData.append('action', 'view_logs');
    fetch(window.location.href, { method: 'POST', body: formData })
        .then(response => response.text())
        .then(html => { document.body.innerHTML = html; })
        .catch(error => alert('Error: ' + error))
        .finally(() => document.getElementById('loading').classList.remove('active'));
}

const configuredOlts = <?php echo json_encode(array_map(function($o) { return $o['ip']; }, array_filter($olts, function($o) { return !isset($o['enabled']) || $o['enabled']; }))); ?>;
const needsSyncOnLoad = <?php echo $needs_sync ? 'true' : 'false'; ?>;

// Run background sync on load if cache is stale
if (needsSyncOnLoad) {
    window.addEventListener('DOMContentLoaded', () => {
        startBackgroundSync();
    });
}

function startBackgroundSync() {
    console.log("Starting background sync for OLTs:", configuredOlts);
    
    configuredOlts.forEach(ip => {
        updateOltSyncStatus(ip, 'syncing');
        
        fetch(`index.php?api=sync_olt&ip=${encodeURIComponent(ip)}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    updateOltSyncStatus(ip, 'success', data);
                    updateOnuTableRows(ip, data.onus);
                    updateGlobalStats(data.global);
                } else {
                    const errStr = (data && data.error) ? data.error : 'Unknown error';
                    updateOltSyncStatus(ip, 'failed', null, errStr);
                }
            })
            .catch(err => {
                console.error("Sync error for OLT " + ip, err);
                updateOltSyncStatus(ip, 'failed', null, err.message);
            });
    });
}

function updateOltSyncStatus(ip, status, data = null, errorMsg = '') {
    const row = document.querySelector(`tr[data-summary-olt="${ip}"]`);
    if (!row) return;
    
    const statusSpan = row.querySelector('.sync-status');
    if (!statusSpan) return;
    
    if (status === 'syncing') {
        statusSpan.innerHTML = `<i class="fas fa-spinner fa-spin" style="color: var(--primary);"></i> Syncing...`;
    } else if (status === 'success') {
        statusSpan.innerHTML = `<i class="fas fa-check-circle" style="color: var(--online);"></i> Synced`;
        
        if (data && data.summary) {
            const stats = data.summary;
            const cells = row.querySelectorAll('td');
            if (cells.length >= 7) {
                cells[2].innerHTML = `<span style="background:var(--glass); padding:4px 10px; border-radius:8px; font-weight: 600;">${stats.total}</span>`;
                cells[3].innerHTML = `<span style="color:var(--online); font-weight:bold;"><i class="fas fa-check"></i> ${stats.online}</span>`;
                cells[4].innerHTML = `<span style="color:var(--offline); font-weight:bold;"><i class="fas fa-times"></i> ${stats.offline}</span>`;
                cells[5].innerHTML = `<span style="color:var(--warning); font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> ${stats.poor}</span>`;
                
                let portsHtml = `<div style="display:flex; flex-wrap:wrap; gap:12px; padding: 10px 0;">`;
                const sortedPorts = Object.keys(stats.ports).sort((a, b) => parseInt(a) - parseInt(b));
                sortedPorts.forEach(p => {
                    const ps = stats.ports[p];
                    const portOnline = ps.online > 0;
                    portsHtml += `
                        <div class="port-badge" 
                             onclick="filterByPort('${ip}', '${p}', this)"
                             style="border-color: ${portOnline ? 'rgba(16, 185, 129, 0.4)' : 'var(--border)'};" 
                             title="Click to filter Port ${p}">
                            <strong>P${p}</strong> 
                            <span style="color:var(--online);">${ps.online}</span>
                            <span style="color: var(--text-muted); font-size: 10px;">/</span>
                            <span style="color:var(--offline);">${ps.offline}</span>
                        </div>
                    `;
                });
                portsHtml += `</div>`;
                cells[6].innerHTML = portsHtml;
            }
        }
    } else if (status === 'failed') {
        statusSpan.innerHTML = `<i class="fas fa-times-circle" style="color: var(--offline);" title="${errorMsg}"></i> Failed`;
    }
}

function updateOnuTableRows(oltIp, onus) {
    const tableBody = document.querySelector('#onuTable tbody');
    if (!tableBody) return;
    
    const rows = tableBody.querySelectorAll(`tr[data-olt="${oltIp}"]`);
    rows.forEach(r => r.remove());
    
    const emptyRow = tableBody.querySelector('tr td[colspan]');
    if (emptyRow) emptyRow.parentElement.remove();
    
    onus.forEach(onu => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-mac', onu.mac.toLowerCase());
        tr.setAttribute('data-id', onu.onu_id);
        tr.setAttribute('data-olt', onu.olt_ip);
        tr.setAttribute('data-port', onu.onu_id.split(':')[0]);
        
        const isOnline = onu.status === 'active' || onu.status === 'online' || onu.status === 'up';
        
        let macTableHtml = '<span style="color:#999">N/A</span>';
        if (onu.mactable && onu.mactable.length > 0) {
            macTableHtml = '<div class="mactable-list">';
            onu.mactable.forEach(m => {
                macTableHtml += `<div class="mactable-item">${m.mac} <span class="vlan-tag">${m.vlan}</span></div>`;
            });
            macTableHtml += '</div>';
        }
        
        const sq = onu.signal_quality;
        const width = (sq === 'Good') ? '90%' : ((sq === 'Fair') ? '60%' : ((sq === 'Poor') ? '30%' : ((sq === 'Offline') ? '5%' : '10%')));
        
        tr.innerHTML = `
            <td>${onu.olt_ip}</td>
            <td>${onu.onu_id}</td>
            <td>${onu.mac}</td>
            <td>${macTableHtml}</td>
            <td>
                <div class="badge ${isOnline ? 'badge-online' : 'badge-offline'}">
                    <i class="fas ${isOnline ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                    ${onu.status.toUpperCase()}
                </div>
            </td>
            <td><strong>${onu.rx_power}</strong> <small>dBm</small></td>
            <td><strong>${onu.tx_power}</strong> <small>dBm</small></td>
            <td>
                <div style="font-size: 11px; margin-bottom: 4px;">${onu.signal_quality}</div>
                <div class="signal-indicator">
                    <div class="signal-bar signal-${sq}" style="width: ${width};"></div>
                </div>
            </td>
            <td>${onu.uptime}</td>
            <td>
                <button class="btn-small" onclick="rebootONU('${onu.olt_ip}', '${onu.onu_id}')">Reboot</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
    
    filterONUs();
}

function updateGlobalStats(global) {
    if (!global) return;
    
    const cards = document.querySelectorAll('.stats .stat-card');
    if (cards.length >= 4) {
        cards[0].querySelector('.number').innerText = global.total_onus;
        cards[1].querySelector('.number').innerText = global.active_onus;
        cards[2].querySelector('.number').innerText = global.offline_onus;
        cards[3].querySelector('.number').innerText = global.poor_signal;
    }
}

function refreshData(force = false) {
    startBackgroundSync();
}

// Auto-refresh every 30 minutes (background sync instead of page reload)
setInterval(() => {
    if (document.getElementById('dashboard').classList.contains('active')) {
        startBackgroundSync();
    }
}, 1800000);
</script>
</body>
</html>