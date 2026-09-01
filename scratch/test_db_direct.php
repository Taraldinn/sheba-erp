<?php
// scratch/test_db_direct.php
$hosts = ['127.0.0.1', 'localhost', '100.94.147.63'];
$user = 'shebafi_minhaj';
$pass = 'Mother519466@';
$db = 'shebafi_minhaj';

foreach ($hosts as $host) {
    echo "Testing connection to host: $host ... ";
    try {
        $dsn = "mysql:host=$host;dbname=$db;charset=utf8";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 2
        ]);
        echo "SUCCESS!\n";
        // Check tables in the db
        $stmt = $pdo->query("SHOW TABLES");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        echo "Tables: " . implode(', ', $tables) . "\n\n";
    } catch (Exception $e) {
        echo "FAILED: " . $e->getMessage() . "\n\n";
    }
}
?>
