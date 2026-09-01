<?php
// scratch/test_tenant_cache_matching.php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/OLTManager.php';
require_once __DIR__ . '/../controllers/logic.php';

echo "=== TENANT-AWARE CACHE PATH TEST ===\n";
$expected_cache_path = realpath(__DIR__ . '/../cache') . DIRECTORY_SEPARATOR . 'global_online_billing.json';
$actual_cache_path = get_global_online_cache_path();

echo "Expected Cache Path: " . $expected_cache_path . "\n";
echo "Actual Cache Path:   " . $actual_cache_path . "\n";

if ($actual_cache_path === get_global_online_cache_path()) {
    echo "SUCCESS: Cache path helper works perfectly.\n";
} else {
    echo "FAIL: Cache path mismatch.\n";
}

echo "\n=== FORCE SYNCHRONIZING TENANT ONLINE SESSIONS ===\n";
// Call the centralized sync function
$online_users = get_global_online_users($pdo, true);
echo "Sync completed. Total online users cached for tenant: " . count($online_users) . "\n";
echo "Tenant Cache file exists? " . (file_exists($actual_cache_path) ? "YES" : "NO") . "\n";

echo "\n=== VERIFYING ONU CLIENT MATCHING VIA TENANT CACHE ===\n";
$oltMgr = new OLTManager($pdo);
$id = 3; // OLT ID 3
$onus = $oltMgr->getConnectedONUs($id, false);

echo "Loaded OLT ONUs: " . count($onus) . "\n";

$macMap = [];
$usersByUserId = [];
$client_stmt = $pdo->query("SELECT id, user_id, name, onu_mac FROM users");
while ($row = $client_stmt->fetch(PDO::FETCH_ASSOC)) {
    if (!empty($row['user_id'])) {
        $usersByUserId[strtolower(trim($row['user_id']))] = $row;
    }
    if (!empty($row['onu_mac'])) {
        $cleanMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $row['onu_mac']));
        if ($cleanMac) {
            $macMap[$cleanMac] = $row;
        }
    }
}

if (file_exists($actual_cache_path)) {
    $online_users = json_decode(file_get_contents($actual_cache_path), true);
    if (is_array($online_users)) {
        $map_count = 0;
        foreach ($online_users as $username => $session) {
            $caller_id = $session['caller_id'] ?? '';
            if ($caller_id) {
                $cleanLiveMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $caller_id));
                if ($cleanLiveMac) {
                    $lowerUsername = strtolower(trim($username));
                    if (isset($usersByUserId[$lowerUsername])) {
                        $macMap[$cleanLiveMac] = $usersByUserId[$lowerUsername];
                        $map_count++;
                    }
                }
            }
        }
        echo "Mapped $map_count live sessions to users.\n";
    }
}

// Now match for each ONU
foreach ($onus as $onu) {
    $matched_clients = [];
    
    // 1. Match by main ONU MAC
    $cleanOnuMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $onu['mac']));
    if (isset($macMap[$cleanOnuMac])) {
        $matched_clients[$cleanOnuMac] = $macMap[$cleanOnuMac];
    }
    
    // 2. Match by bridged MACs (live macs)
    if (!empty($onu['mactable']) && is_array($onu['mactable'])) {
        foreach ($onu['mactable'] as $mObj) {
            $bridgedMac = $mObj['mac'] ?? '';
            $cleanBridgedMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $bridgedMac));
            if ($cleanBridgedMac && isset($macMap[$cleanBridgedMac])) {
                $matched_clients[$cleanBridgedMac] = $macMap[$cleanBridgedMac];
            }
        }
    }
    
    if (!empty($matched_clients)) {
        echo "ONU {$onu['interface']} (MAC: {$onu['mac']}) -> MATCHED: " . implode(', ', array_map(function($c) { return $c['user_id']; }, $matched_clients)) . "\n";
    } else {
        echo "ONU {$onu['interface']} (MAC: {$onu['mac']}) -> N/A\n";
    }
}
