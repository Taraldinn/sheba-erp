<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=shebafi_beeonline;charset=utf8", "root", "");
    echo "Connected to shebafi_beeonline.\n";
    $stmt = $pdo->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    print_r($tables);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
