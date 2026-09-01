<?php
require_once __DIR__ . '/includes/config.php';

try {
    $usersByUserId = [];
    $macMap = [];
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

    // Exact replica of olt_onus.php cache loading:
    // Simulated path from views/networking/olt_onus.php:
    // views/networking/olt_onus.php has __DIR__ = 'd:\Ashik\Shebad 21 may\views\networking'
    // so __DIR__ . '/../../cache/global_online.json'
    $simulated_dir = 'd:\Ashik\Shebad 21 may\views\networking';
    $cache_file = $simulated_dir . '/../../cache/global_online.json';
    
    echo "Simulated cache file path: $cache_file\n";
    echo "File exists? " . (file_exists($cache_file) ? "YES" : "NO") . "\n";
    
    if (file_exists($cache_file)) {
        $content = file_get_contents($cache_file);
        echo "File content length: " . strlen($content) . "\n";
        
        $online_users = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            echo "JSON Decode Error: " . json_last_error_msg() . "\n";
        }
        
        if (is_array($online_users)) {
            echo "Online users count: " . count($online_users) . "\n";
            $matched_count = 0;
            foreach ($online_users as $username => $session) {
                $caller_id = $session['caller_id'] ?? '';
                if ($caller_id) {
                    $cleanLiveMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $caller_id));
                    if ($cleanLiveMac) {
                        $lowerUsername = strtolower(trim($username));
                        if (isset($usersByUserId[$lowerUsername])) {
                            $macMap[$cleanLiveMac] = $usersByUserId[$lowerUsername];
                            $matched_count++;
                        }
                    }
                }
            }
            echo "Matched live sessions successfully mapped: $matched_count\n";
            echo "Is BC62CE0832EC in macMap? " . (isset($macMap['BC62CE0832EC']) ? "YES" : "NO") . "\n";
        } else {
            echo "online_users is not an array!\n";
        }
    }
} catch (Exception $e) {
    echo "Exception occurred: " . $e->getMessage() . "\n";
}
