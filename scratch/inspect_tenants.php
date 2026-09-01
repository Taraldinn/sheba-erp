<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=shebafi_minhaj;charset=utf8", "root", "");
    $stmt = $pdo->query("SELECT * FROM tenants");
    $tenants = $stmt->fetchAll(PDO::FETCH_ASSOC);
    print_r($tenants);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
