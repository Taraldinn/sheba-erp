<?php
// Find the correct MySQL port and dump user MAC info
require_once __DIR__ . '/../includes/db_config.php';

$ports = [3306, 3307, 3308, 3309];
$hosts = ['127.0.0.1', 'localhost'];

$connected = false;
$activePdo = null;

foreach ($hosts as $host) {
    foreach ($ports as $port) {
        try {
            $dsn = "mysql:host=$host;port=$port;dbname=" . DB_NAME . ";charset=utf8";
            $activePdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 2
            ]);
            echo "SUCCESS: Connected on Host: $host, Port: $port\n";
            $connected = true;
            break 2;
        } catch (Exception $e) {
            // Echo failure for tracking
            // echo "Failed Host: $host, Port: $port - " . $e->getMessage() . "\n";
        }
    }
}

if (!$connected) {
    die("FATAL: Could not connect to database on any standard host/port combination.\n");
}

try {
    // Query users
    $stmt = $activePdo->query("SELECT id, user_id, name, onu_mac FROM users");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Total users in database: " . count($users) . "\n\n";
    
    foreach ($users as $user) {
        $cleanMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $user['onu_mac']));
        if (!empty($user['onu_mac'])) {
            echo "User ID: " . $user['user_id'] . " | Name: " . $user['name'] . " | DB MAC: [" . $user['onu_mac'] . "] | Cleaned: [" . $cleanMac . "]\n";
        }
        if (strpos($cleanMac, 'BC62CE0832EC') !== false || strpos($user['user_id'], 'RX0002') !== false) {
            echo "--> FOUND TARGET USER/MAC!\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
