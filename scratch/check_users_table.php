<?php require_once '../includes/config.php'; $stmt = $pdo->query('DESCRIBE '.TBL_USERS); print_r($stmt->fetchAll(PDO::FETCH_ASSOC)); ?>
