<?php
try {
    $dsn = "mysql:host=localhost;dbname=shebafi_ripa1;charset=utf8";
    $pdo = new PDO($dsn, 'shebafi_ripa1', 'ripaonline1');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "Tables in shebafi_ripa1:\n";
    print_r($tables);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
