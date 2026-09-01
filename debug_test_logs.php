<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

$total = $pdo->query("SELECT COUNT(*) FROM " . TBL_USERS)->fetchColumn();
$by_status = $pdo->query("SELECT status, COUNT(*) as count FROM " . TBL_USERS . " GROUP BY status")->fetchAll(PDO::FETCH_ASSOC);
$by_router = $pdo->query("SELECT router_id, COUNT(*) as count FROM " . TBL_USERS . " GROUP BY router_id")->fetchAll(PDO::FETCH_ASSOC);

$out = "Total: $total\nStatus:\n" . print_r($by_status, true) . "\nRouter:\n" . print_r($by_router, true);
file_put_contents(__DIR__ . '/test_count_output.txt', $out);
echo "OK";
?>
