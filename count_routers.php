<?php
require 'g:/ISP Sheba fi resource/2 March 2026/includes/config.php';
$stmt = $pdo->query('SELECT COUNT(*) FROM ' . TBL_ROUTERS);
echo $stmt->fetchColumn();
?>
