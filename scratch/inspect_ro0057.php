<?php
define('TENANT_OVERRIDE', 'billing');
require_once "d:/Ashik/Sheba 23 june 26/includes/config.php";

echo "=== Transactions for RO0057 ===\n";
$txs = safeFetchAll($pdo, "SELECT t.*, s.username as staff_username, s.role as staff_role 
                           FROM " . TBL_TX . " t 
                           LEFT JOIN " . TBL_STAFF . " s ON t.staff_id = s.id 
                           WHERE t.description LIKE '%RO0057%' 
                           ORDER BY t.id DESC");
foreach ($txs as $t) {
    echo "ID: {$t['id']} | Staff: {$t['staff_username']} ({$t['staff_role']}) | Type: {$t['type']} | Amt: {$t['amount']} | AdminCost: {$t['admin_cost']} | Desc: {$t['description']} | Time: {$t['created_at']}\n";
}

echo "\n=== fin_cashbook entries for RO0057 ===\n";
$cash = safeFetchAll($pdo, "SELECT c.*, s.username as staff_username 
                            FROM " . TBL_FIN_CASHBOOK . " c 
                            LEFT JOIN " . TBL_STAFF . " s ON c.staff_id = s.id 
                            WHERE c.description LIKE '%RO0057%' 
                            ORDER BY c.id DESC");
foreach ($cash as $c) {
    echo "ID: {$c['id']} | Staff: {$c['staff_username']} | Type: {$c['entry_type']} | Amt: {$c['amount']} | Desc: {$c['description']} | Time: {$c['created_at']}\n";
}
