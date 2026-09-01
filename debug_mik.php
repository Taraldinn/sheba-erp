<?php
require 'includes/config.php';
$_GET['ajax_bw'] = 1;

// Find a user ID that is currently online based on the screenshots
$stmt = $pdo->query("SELECT * FROM " . TBL_USERS . " WHERE user_id = 'RX0001'");
$u = $stmt->fetch();

if (!$u) die("User not found");

$_GET['uid'] = $u['id'];

require 'controllers/logic.php';
