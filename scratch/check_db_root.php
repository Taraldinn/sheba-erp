<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;charset=utf8", "root", "");
    echo "Connected successfully as root!\n";
    $stmt = $pdo->query("SHOW DATABASES");
    $dbs = $stmt->fetchAll(PDO::FETCH_COLUMN);
    echo "Databases:\n";
    foreach ($dbs as $db) {
        echo " - $db\n";
    }
} catch (Exception $e) {
    echo "Failed to connect as root: " . $e->getMessage() . "\n";
}
?>
