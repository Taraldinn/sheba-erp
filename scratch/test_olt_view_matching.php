<?php
// scratch/test_olt_view_matching.php
$host = 'localhost';
$db = 'shebafi_ripa1';
$user = 'shebafi_ripa1';
$pass = 'ripaonline1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // 1. Fetch OLT
    $olt_stmt = $pdo->prepare("SELECT * FROM olts WHERE id = 3");
    $olt_stmt->execute();
    $olt = $olt_stmt->fetch();
    echo "Loaded OLT: {$olt['name']} (ID: {$olt['id']})\n";

    // 2. Fetch ONUs from Cache
    $onus = json_decode($olt['onu_cache'], true);
    echo "Total ONUs loaded: " . count($onus) . "\n";

    // 3. Load client MAC mappings from database and cache
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
    echo "Total users loaded from DB: " . count($usersByUserId) . "\n";
    echo "Total MACs loaded from DB: " . count($macMap) . "\n";

    // Map live MACs from active PPPoE sessions
    $cache_file = __DIR__ . '/../cache/global_online.json';
    if (file_exists($cache_file)) {
        $online_users = json_decode(file_get_contents($cache_file), true);
        if (is_array($online_users)) {
            echo "Loaded online users from cache: " . count($online_users) . "\n";
            foreach ($online_users as $username => $session) {
                $caller_id = $session['caller_id'] ?? '';
                if ($caller_id) {
                    $cleanLiveMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $caller_id));
                    if ($cleanLiveMac) {
                        $lowerUsername = strtolower(trim($username));
                        if (isset($usersByUserId[$lowerUsername])) {
                            $macMap[$cleanLiveMac] = $usersByUserId[$lowerUsername];
                        }
                    }
                }
            }
        }
    } else {
        echo "Cache file global_online.json NOT FOUND!\n";
    }

    echo "Total unified MAC map entries: " . count($macMap) . "\n";

    // 4. Run through ONUs and execute matching logic
    foreach ($onus as $onu) {
        echo "\nAnalyzing ONU Interface: {$onu['interface']}\n";
        echo "Main ONU MAC: {$onu['mac']}\n";
        
        $matched_clients = [];
        
        // 1. Match by main ONU MAC
        $cleanOnuMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $onu['mac']));
        echo "Clean main MAC: $cleanOnuMac\n";
        if (isset($macMap[$cleanOnuMac])) {
            $matched_clients[$cleanOnuMac] = $macMap[$cleanOnuMac];
            echo "MATCHED main MAC to user: " . $macMap[$cleanOnuMac]['user_id'] . "\n";
        } else {
            echo "Main MAC not matched.\n";
        }
        
        // 2. Match by bridged MACs (live macs)
        if (!empty($onu['mactable']) && is_array($onu['mactable'])) {
            echo "Bridged MAC table has " . count($onu['mactable']) . " entries:\n";
            foreach ($onu['mactable'] as $mObj) {
                $bridgedMac = $mObj['mac'] ?? '';
                $cleanBridgedMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $bridgedMac));
                echo " - Bridged MAC: $bridgedMac (Cleaned: $cleanBridgedMac)\n";
                if ($cleanBridgedMac && isset($macMap[$cleanBridgedMac])) {
                    $matched_clients[$cleanBridgedMac] = $macMap[$cleanBridgedMac];
                    echo "   MATCHED bridged MAC to user: " . $macMap[$cleanBridgedMac]['user_id'] . "\n";
                } else {
                    echo "   No match for bridged MAC.\n";
                }
            }
        } else {
            echo "No bridged MAC table entries.\n";
        }

        if (empty($matched_clients)) {
            echo "FINAL RESULT: Client User ID = N/A\n";
        } else {
            echo "FINAL RESULT: Matched Users: " . implode(', ', array_map(function($c) {
                return $c['user_id'] . " (" . $c['name'] . ")";
            }, $matched_clients)) . "\n";
        }
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
