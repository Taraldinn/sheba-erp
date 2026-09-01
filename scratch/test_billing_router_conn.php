<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/MikrotikApp.php';

try {
    $routers = safeFetchAll($pdo, "SELECT * FROM routers");
    foreach ($routers as $r) {
        echo "Connecting to Router: {$r['name']} ({$r['ip_address']}:{$r['port']}) ...\n";
        $mk = new MikrotikApp($r, 5);
        if ($mk->isOnline()) {
            echo "SUCCESS: Router is Online!\n";
            $online = $mk->getOnlineUsers();
            echo "Total online users from router: " . count($online) . "\n";
            if (!empty($online)) {
                echo "First 3 online users:\n";
                print_r(array_slice($online, 0, 3));
            }
        } else {
            echo "FAILED: Router is Offline. Error: " . ($mk->error ?? 'Unknown error') . "\n";
        }
        echo "----------------------------------------\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
