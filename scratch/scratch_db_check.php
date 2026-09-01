<?php
// Scratch script to check users database on remote server1
require_once __DIR__ . '/../includes/db_config.php';

try {
    $dsn = "mysql:host=100.94.147.63;dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 3
    ]);
    echo "SUCCESS: Connected to DB on 100.94.147.63\n";
    
    // Dump target user
    $stmt = $pdo->prepare("SELECT id, user_id, name, onu_mac FROM users WHERE user_id = ?");
    $stmt->execute(['RX0002']);
    $user = $stmt->fetch();
    if ($user) {
        echo "FOUND RX0002: id=" . $user['id'] . ", name=" . $user['name'] . ", onu_mac=" . $user['onu_mac'] . "\n";
    } else {
        echo "RX0002 not found in DB\n";
    }
    
    // Dump OLT cache
    $stmt = $pdo->query("SELECT id, name, brand, onu_cache FROM olts");
    while ($row = $stmt->fetch()) {
        echo "OLT ID: " . $row['id'] . " | Name: " . $row['name'] . " | Brand: " . $row['brand'] . "\n";
        if ($row['onu_cache']) {
            $cache = json_decode($row['onu_cache'], true);
            echo "Cache count: " . (is_array($cache) ? count($cache) : 0) . "\n";
            if (is_array($cache)) {
                // Find a matching ONU or print some ONUs
                foreach ($cache as $onu) {
                    if ($onu['interface'] === '1:2') {
                        echo "Found ONU 1:2 in cache:\n";
                        print_r($onu);
                    }
                }
            }
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
