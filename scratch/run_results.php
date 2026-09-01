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

// Run voice_broadcast_results.php
echo "Running voice_broadcast_results.php...\n";
$argv = ['cron/voice_broadcast_results.php', '--tenant=billing'];
include __DIR__ . '/../cron/voice_broadcast_results.php';
?>
