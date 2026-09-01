<?php
/**
 * scratch_active_print.php
 * Standalone CLI test to dump active session keys.
 */

$host = '127.0.0.1'; // Bypasses local IPv6 resolution blocks on Windows
$db = 'shebafi_minhaj';
$user = 'shebafi_minhaj';
$pass = 'Mother519466@';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $routers = $pdo->query("SELECT * FROM routers")->fetchAll();
    if (empty($routers)) {
        die("No routers found in database.\n");
    }

    // Require MikrotikApp and Autoloader
    if (file_exists(__DIR__ . '/vendor/autoload.php')) {
        require_once __DIR__ . '/vendor/autoload.php';
    }
    require_once __DIR__ . '/classes/MikrotikApp.php';

    foreach ($routers as $r) {
        echo "=== Router: {$r['name']} ({$r['ip_address']}) ===\n";
        
        $mk = new MikrotikApp($r, 5);
        if ($mk->isOnline()) {
            echo "Status: Online\n";
            $active = $mk->getOnlineUsers();
            if (!empty($active)) {
                echo "Total Active PPPoE Users: " . count($active) . "\n";
                echo "Dumping first user data keys and values:\n";
                print_r($active[0]);
                
                echo "\nCalculated checks:\n";
                echo "bytes-in: " . ($active[0]['bytes-in'] ?? 'NULL') . "\n";
                echo "bytes-out: " . ($active[0]['bytes-out'] ?? 'NULL') . "\n";
                echo "uptime: " . ($active[0]['uptime'] ?? 'NULL') . "\n";
                break; // Only need one online router
            } else {
                echo "No active sessions found on this router.\n";
            }
        } else {
            echo "Status: Offline. Error: " . ($mk->error ?? 'Unknown') . "\n";
        }
    }
} catch (Exception $e) {
    echo "Database Error: " . $e->getMessage() . "\n";
}
