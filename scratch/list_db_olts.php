<?php
require_once __DIR__ . '/../includes/config.php';
$stmt = $pdo->query('SELECT id, ip, brand, name, enabled FROM olts');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
