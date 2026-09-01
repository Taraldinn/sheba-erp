<?php
$dbs = ['ample', 'betternet4', 'ctggraphics_webiptv', 'inventory', 'inventory2', 'inventorymgtci', 'ispcrm', 'mysql', 'perfex', 'phpmyadmin', 'qtv_qtv', 'shebafi_master', 'shebafi_minhaj', 'shebafi_ripa1', 'sms_db'];

foreach ($dbs as $db) {
    try {
        $pdo = new PDO("mysql:host=127.0.0.1;dbname=$db;charset=utf8", "root", "");
        
        // Check if TBL_STAFF / staff table exists and has beeonline
        $stmt = $pdo->query("SHOW TABLES LIKE 'staff'");
        if ($stmt->fetch()) {
            $stmt2 = $pdo->prepare("SELECT COUNT(*) FROM staff WHERE username = ? OR name = ?");
            $stmt2->execute(['beeonline', 'beeonline']);
            $count = $stmt2->fetchColumn();
            if ($count > 0) {
                echo "Found 'beeonline' staff in database: $db (count: $count)\n";
            }
        }
        
        // Also check tenants table if it exists
        $stmt = $pdo->query("SHOW TABLES LIKE 'tenants'");
        if ($stmt->fetch()) {
            $stmt2 = $pdo->prepare("SELECT COUNT(*) FROM tenants WHERE subdomain LIKE ? OR name = ?");
            $stmt2->execute(['%beeonline%', 'beeonline']);
            $count = $stmt2->fetchColumn();
            if ($count > 0) {
                echo "Found 'beeonline' tenant in tenants table of database: $db (count: $count)\n";
            }
        }
    } catch (Exception $e) {
        // Skip
    }
}
echo "Scan complete.\n";
?>
