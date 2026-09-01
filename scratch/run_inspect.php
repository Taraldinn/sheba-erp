<?php
// Start MySQL
echo "Starting MySQL daemon...\n";
pclose(popen("start /B C:\\xampp\\mysql\\bin\\mysqld.exe --defaults-file=C:\\xampp\\mysql\\bin\\my.ini --console", "r"));

// Wait for MySQL to start
for ($i = 0; $i < 10; $i++) {
    try {
        $pdo = new PDO("mysql:host=127.0.0.1;charset=utf8", "root", "");
        echo "Connected to MySQL successfully!\n";
        break;
    } catch (Exception $e) {
        echo "Waiting for MySQL... (" . ($i + 1) . ")\n";
        sleep(1);
    }
}

if (!isset($pdo)) {
    die("Failed to connect to MySQL after 10 seconds.\n");
}

try {
    // Select shebafi_ripa1 database
    $pdo->exec("USE shebafi_ripa1");
    
    // Check tables
    $tables = ['voice_call_logs', 'voice_broadcasts', 'voice_reminder_tracking'];
    foreach ($tables as $t) {
        $stmt = $pdo->query("SHOW TABLES LIKE '$t'");
        if ($stmt->fetch()) {
            $count = $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
            echo "Table $t has $count rows.\n";
            if ($count > 0) {
                $rows = $pdo->query("SELECT * FROM $t ORDER BY id DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
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
