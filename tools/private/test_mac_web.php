<?php
// test_mac_web.php - Standalone web diagnostics
require_once __DIR__ . '/includes/config.php';

ob_start();

echo "=== DIAGNOSTICS FOR MAC MATCHING ===\n";
echo "Date: " . date('Y-m-d H:i:s') . "\n";
echo "PHP Version: " . phpversion() . "\n";

try {
    // 1. Check RX0002 user in database
    $stmt = $pdo->prepare("SELECT id, user_id, name, onu_mac FROM users WHERE user_id = ? OR name LIKE ?");
    $stmt->execute(['RX0002', '%Mohammed Habibur%']);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "\n--- Matched Users in Database ---\n";
    foreach ($users as $u) {
        $cleanOnuMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $u['onu_mac']));
        echo "ID: {$u['id']} | User ID: {$u['user_id']} | Name: {$u['name']} | onu_mac: [{$u['onu_mac']}] | clean: [{$cleanOnuMac}]\n";
    }

    // 2. Check cache/global_online.json
    $cache_file = __DIR__ . '/cache/global_online.json';
    echo "\n--- Cache File Status ---\n";
    echo "Path: $cache_file\n";
    echo "Exists: " . (file_exists($cache_file) ? "YES" : "NO") . "\n";
    if (file_exists($cache_file)) {
        $online_users = json_decode(file_get_contents($cache_file), true);
        echo "Online users count: " . count($online_users) . "\n";
        
        $found = [];
        foreach ($online_users as $username => $session) {
            $caller_id = $session['caller_id'] ?? '';
            $cleanLive = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $caller_id));
            if (stripos($username, 'RX0002') !== false || stripos($caller_id, 'BC:62') !== false || stripos($caller_id, 'BC62') !== false) {
                $found[$username] = [
                    'username' => $username,
                    'caller_id' => $caller_id,
                    'clean_live' => $cleanLive
                ];
            }
        }
        echo "Target users in cache:\n";
        print_r($found);
    }
    
    // 3. Simulated lookup table build
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
    
    if (file_exists($cache_file) && is_array($online_users)) {
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
    
    echo "\n--- Looking up BC62CE0832EC in $macMap ---\n";
    $test_mac = 'BC62CE0832EC';
    if (isset($macMap[$test_mac])) {
        echo "SUCCESS! Found $test_mac in map:\n";
        print_r($macMap[$test_mac]);
    } else {
        echo "FAILED! $test_mac not found in map.\n";
        // Check partial matches or close keys
        echo "Close keys in macMap:\n";
        foreach (array_keys($macMap) as $k) {
            if (stripos($k, 'BC62') !== false || stripos($k, 'CE08') !== false) {
                echo "- $k (Mapped to: " . $macMap[$k]['user_id'] . ")\n";
            }
        }
    }
    
} catch (Exception $e) {
    echo "Exception: " . $e->getMessage() . "\n";
}

$output = ob_get_clean();
file_put_contents(__DIR__ . '/debug_test_output.txt', $output);
echo "Diagnostics completed. Output written to debug_test_output.txt\n";
?>
