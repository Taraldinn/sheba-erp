<?php
// Bypass config.php and load db credentials directly to avoid composer autoload check
require_once __DIR__ . '/../includes/db_config.php';

echo "Database Name: " . DB_NAME . "\n\n";

try {
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 1. Fetch RX0002 from database
    $stmt = $pdo->prepare("SELECT id, user_id, name, onu_mac FROM users WHERE user_id = ? OR id = ? OR name LIKE ?");
    $stmt->execute(['RX0002', 2, '%Mohammed Habibur%']);
    $db_users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "--- Database Users Match ---\n";
    print_r($db_users);

    // 2. Fetch from cache/global_online.json
    $cache_file = __DIR__ . '/../cache/global_online.json';
    if (file_exists($cache_file)) {
        $online_users = json_decode(file_get_contents($cache_file), true);
        echo "\n--- Cache file found. Total online users: " . count($online_users) . " ---\n";
        
        // Find RX0002 or similar
        $found = [];
        foreach ($online_users as $username => $session) {
            if (stripos($username, 'RX0002') !== false || (isset($session['caller_id']) && stripos($session['caller_id'], 'BC:62:CE') !== false)) {
                $found[$username] = $session;
            }
        }
        echo "Found in Cache:\n";
        print_r($found);
    } else {
        echo "\n--- Cache file NOT found at $cache_file ---\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
