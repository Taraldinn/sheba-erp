<?php
require 'g:/ISP Sheba fi resource/2 March 2026/includes/config.php';
$stmt = $pdo->query('SELECT id, name FROM ' . TBL_SERVICES);
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
?>
