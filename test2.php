<?php
require "includes/db_config.php";
$pdo = new PDO("mysql:host=".DB_HOST.";dbname=".DB_NAME, DB_USER, DB_PASS);
$stmt = $pdo->query("
    SELECT u.status, 
           SUM(u.bill_amount) as bill, 
           SUM(
               COALESCE(
                   (SELECT p.custom_price FROM service_pricing p JOIN mikrotik_services s ON p.service_id = s.id WHERE s.name = u.user_package AND p.staff_id = u.manager_id LIMIT 1),
                   (SELECT s.buying_price FROM mikrotik_services s WHERE s.name = u.user_package LIMIT 1),
                   0
               )
           ) as cost 
    FROM users u 
    GROUP BY u.status
");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
