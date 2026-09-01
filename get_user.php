<?php
require 'includes/db_config.php';
try {
    $pdo = new PDO('mysql:host=127.0.0.1;dbname=shebafi_beeonline', DB_USER, DB_PASS);
    $stmt = $pdo->query("SELECT status, bill_amount, current_bill_date, bill_position FROM users WHERE user_id = 'bo103'");
    print_r($stmt->fetch(PDO::FETCH_ASSOC));
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
