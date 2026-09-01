<?php
// Start MySQL
echo "Starting MySQL daemon...\n";
pclose(popen("start /B C:\\xampp\\mysql\\bin\\mysqld.exe --defaults-file=C:\\xampp\\mysql\\bin\\my.ini --console", "r"));

// Wait for MySQL to start
for ($i = 0; $i < 10; $i++) {
    try {
        $pdo = new PDO("mysql:host=127.0.0.1;charset=utf8", "root", "");
        break;
    } catch (Exception $e) {
        sleep(1);
    }
}

if (!isset($pdo)) {
    die("Failed to connect to MySQL.\n");
}

try {
    $pdo->exec("USE shebafi_ripa1");
    
    // Check staff settings
    $staff = $pdo->query("SELECT id, username, role, voice_config FROM staff WHERE id IN (1, 2, 54)")->fetchAll(PDO::FETCH_ASSOC);
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
