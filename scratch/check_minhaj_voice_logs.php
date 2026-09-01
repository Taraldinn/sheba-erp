<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=shebafi_minhaj;charset=utf8", "root", "");
    
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
        echo "No voice_call_logs table in shebafi_minhaj\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
