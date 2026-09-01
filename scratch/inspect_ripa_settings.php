<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=shebafi_ripa1;charset=utf8", "root", "");
    echo "Connected to shebafi_ripa1.\n";
    
    // Check staff settings
    $staff = $pdo->query("SELECT id, username, role, voice_config FROM staff WHERE id IN (1, 2)")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($staff as $s) {
        echo "Staff ID {$s['id']} ({$s['username']}):\n";
        echo "  Voice config: " . $s['voice_config'] . "\n";
    }
    
    // Check global settings
    $settings = $pdo->query("SELECT * FROM settings WHERE key_name LIKE 'voice_%'")->fetchAll(PDO::FETCH_ASSOC);
    echo "Global voice settings:\n";
    print_r($settings);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
