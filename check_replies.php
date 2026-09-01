<?php
$_SERVER['HTTP_HOST'] = 'billing.ripaonline.net';
require_once 'includes/config.php';
require_once 'includes/functions.php';

echo "--- Ticket Replies ---\n";
$replies = safeFetchAll($pdo, "SELECT * FROM ticket_replies ORDER BY id DESC LIMIT 10");
print_r($replies);

echo "\n--- Last Logs ---\n";
$logs = safeFetchAll($pdo, "SELECT * FROM " . TBL_LOGS . " ORDER BY id DESC LIMIT 15");
print_r($logs);
?>
