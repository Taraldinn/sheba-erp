<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=shebafi_ripa1;charset=utf8", "root", "");
    echo "Connected to shebafi_ripa1.\n";
    
    // Check if tables exist and count rows
    $tables = ['voice_call_logs', 'voice_broadcasts', 'voice_reminder_tracking'];
    foreach ($tables as $t) {
        $stmt = $pdo->query("SHOW TABLES LIKE '$t'");
        if ($stmt->fetch()) {
            $count = $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
            echo "Table $t has $count rows.\n";
            if ($count > 0) {
                $rows = $pdo->query("SELECT * FROM $t LIMIT 2")->fetchAll(PDO::FETCH_ASSOC);
                print_r($rows);
            }
        } else {
            echo "Table $t does NOT exist.\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
