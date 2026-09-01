<?php
$host = '127.0.0.1';
$db = 'jackint_billing';
$user = 'root';
$pass = ''; // Try empty or see what's in config.php. Wait, let's just use config.php but with session_write_close()!
require_once __DIR__ . '/../includes/config.php';
session_write_close(); // Unlock session

$php_time = date('Y-m-d H:i:s');
$mysql_time = $pdo->query("SELECT NOW()")->fetchColumn();

file_put_contents(__DIR__ . '/time_result.txt', "PHP: $php_time | MySQL: $mysql_time");
echo "Done";
