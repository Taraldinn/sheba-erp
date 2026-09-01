<?php
require_once __DIR__ . '/../includes/config.php';
$vpns = $pdo->query("SELECT * FROM " . TBL_TENANT_VPN)->fetchAll(PDO::FETCH_ASSOC);
print_r($vpns);

$olts = $pdo->query("SELECT * FROM " . TBL_OLTS)->fetchAll(PDO::FETCH_ASSOC);
print_r($olts);
?>
