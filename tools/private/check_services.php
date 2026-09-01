<?php
require 'includes/config.php';
$res = $pdo->query('SELECT * FROM mikrotik_services')->fetchAll();
print_r($res);
