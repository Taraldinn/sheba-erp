<?php
require 'includes/db_config.php';
$pdo = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME, DB_USER, DB_PASS);
$stmt = $pdo->prepare("SELECT status, bill_amount, current_bill_date, bill_position FROM users WHERE user_id = 'bo103'");
$stmt->execute();
print_r($stmt->fetch(PDO::FETCH_ASSOC));
