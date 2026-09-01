<?php
require_once __DIR__ . '/../includes/config.php';
$php_time = date('Y-m-d H:i:s');
$mysql_time = $pdo->query("SELECT NOW()")->fetchColumn();
echo json_encode(['php' => $php_time, 'mysql' => $mysql_time]);
