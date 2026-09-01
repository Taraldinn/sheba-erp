<?php
require 'includes/config.php';
echo "Services Table Content:\n";
$services = $pdo->query("SELECT id, name, price, buying_price FROM mikrotik_services")->fetchAll(PDO::FETCH_ASSOC);
print_r($services);

echo "\nLast 10 Transactions:\n";
$tx = $pdo->query("SELECT * FROM transactions ORDER BY id DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
print_r($tx);
