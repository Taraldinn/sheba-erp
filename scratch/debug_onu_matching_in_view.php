<?php
// scratch/debug_onu_matching_in_view.php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../classes/OLTManager.php';

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
echo "Total users in DB: " . count($usersByUserId) . "\n";
echo "Users with onu_mac in DB: " . count($macMap) . "\n";

// Map live MACs from active PPPoE sessions
$cache_file = __DIR__ . '/../cache/global_online.json';
echo "Checking cache file: $cache_file\n";
echo "Cache file exists? " . (file_exists($cache_file) ? "YES" : "NO") . "\n";

if (file_exists($cache_file)) {
    $online_users = json_decode(file_get_contents($cache_file), true);
    if (is_array($online_users)) {
        echo "Total online users in cache: " . count($online_users) . "\n";
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
    } else {
        echo "Failed to decode cache JSON.\n";
    }
}

// Check if BC62CE0832EC is mapped
$test_mac = 'BC62CE0832EC';
if (isset($macMap[$test_mac])) {
    echo "SUCCESS: $test_mac is in macMap mapped to user: " . $macMap[$test_mac]['user_id'] . "\n";
} else {
    echo "FAIL: $test_mac is NOT in macMap.\n";
}

// Now match for each ONU
foreach ($onus as $onu) {
    echo "\nONU: {$onu['interface']} | MAC: {$onu['mac']}\n";
    
    $matched_clients = [];
    
    // 1. Match by main ONU MAC
    $cleanOnuMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $onu['mac']));
    if (isset($macMap[$cleanOnuMac])) {
        $matched_clients[$cleanOnuMac] = $macMap[$cleanOnuMac];
        echo " -> Matched by main MAC: " . $macMap[$cleanOnuMac]['user_id'] . "\n";
    }
    
    // 2. Match by bridged MACs (live macs)
    if (!empty($onu['mactable']) && is_array($onu['mactable'])) {
        echo " -> Bridged MACs count: " . count($onu['mactable']) . "\n";
        foreach ($onu['mactable'] as $mObj) {
            $bridgedMac = $mObj['mac'] ?? '';
            $cleanBridgedMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $bridgedMac));
            echo "    -> Bridged MAC: $bridgedMac (Cleaned: $cleanBridgedMac)\n";
            if ($cleanBridgedMac && isset($macMap[$cleanBridgedMac])) {
                $matched_clients[$cleanBridgedMac] = $macMap[$cleanBridgedMac];
                echo "       -> Matched bridged MAC to: " . $macMap[$cleanBridgedMac]['user_id'] . "\n";
            }
        }
    } else {
        echo " -> No bridged MACs found in mactable.\n";
    }
    
    if (empty($matched_clients)) {
        echo " -> RESULT: N/A\n";
    } else {
        echo " -> RESULT: Matched Users: " . implode(', ', array_map(function($c) { return $c['user_id']; }, $matched_clients)) . "\n";
    }
}
?>
