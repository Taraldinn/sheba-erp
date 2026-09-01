<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=shebafi_beeonline;charset=utf8", "root", "");
    echo "Connected to shebafi_beeonline.\n";
    
    // Check staff table
    $stmt = $pdo->query("SHOW TABLES LIKE 'staff'");
    if ($stmt->fetch()) {
        $staff = $pdo->query("SELECT id, name, username, role, voice_config FROM staff")->fetchAll(PDO::FETCH_ASSOC);
        echo "Staff list:\n";
        foreach ($staff as $s) {
            echo "  - ID {$s['id']}: {$s['username']} ({$s['name']}) - Role: {$s['role']}\n";
            echo "    Voice config: {$s['voice_config']}\n";
        }
    } else {
        echo "No staff table in shebafi_beeonline\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
