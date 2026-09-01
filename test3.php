<?php
require 'includes/db_config.php';
try {
    $pdo = new PDO('mysql:host=localhost;dbname=shebafi_master', 'shebafi_minhaj', 'Mother519466@');
    $stmt = $pdo->query('SELECT * FROM api_tokens LIMIT 1');
    print_r($stmt->fetch(PDO::FETCH_ASSOC));
} catch (Exception $e) {
    echo $e->getMessage();
}
