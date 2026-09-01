<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=shebafi_ripa1;charset=utf8", "root", "");
    
    // Check if voice_call_logs table exists and count rows
    $stmt = $pdo->query("SHOW TABLES LIKE 'voice_call_logs'");
    if ($stmt->fetch()) {
        $count = $pdo->query("SELECT COUNT(*) FROM voice_call_logs")->fetchColumn();
        echo "voice_call_logs count: $count\n";
        if ($count > 0) {
            $logs = $pdo->query("SELECT * FROM voice_call_logs ORDER BY id DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
            print_r($logs);
        }
    } else {
        echo "No voice_call_logs table\n";
    }
    
    // Check voice_broadcasts
    $stmt = $pdo->query("SHOW TABLES LIKE 'voice_broadcasts'");
    if ($stmt->fetch()) {
        $count = $pdo->query("SELECT COUNT(*) FROM voice_broadcasts")->fetchColumn();
        echo "voice_broadcasts count: $count\n";
        if ($count > 0) {
            $broadcasts = $pdo->query("SELECT * FROM voice_broadcasts ORDER BY id DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
            print_r($broadcasts);
        }
    } else {
        echo "No voice_broadcasts table\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
