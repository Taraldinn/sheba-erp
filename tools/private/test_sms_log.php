<?php
require_once __DIR__ . '/includes/config.php';

$phone = '01881469088';
$clean_phone = preg_replace('/[^0-9]/', '', $phone);
$search_phone1 = $clean_phone;
$search_phone2 = $clean_phone;
if (strlen($clean_phone) == 11 && substr($clean_phone, 0, 1) == '0') {
    $search_phone1 = '88' . $clean_phone;
}

echo "Search 1: *$search_phone1*\n";
echo "Search 2: *$search_phone2*\n";

$sql = "SELECT * FROM ".TBL_LOGS." WHERE action_type IN ('SMS Sent', 'SMS Error') ORDER BY id DESC LIMIT 5";
$stmt = $pdo->query($sql);
$logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($logs as $log) {
    echo "LOG ID: " . $log['id'] . "\n";
    echo "Details: " . $log['details'] . "\n";
    
    $match1 = strpos($log['details'], $search_phone1) !== false || mb_strpos($log['details'], $search_phone1) !== false;
    $match2 = strpos($log['details'], $search_phone2) !== false;
    
    echo "PHP Match 1 ($search_phone1): " . ($match1 ? "YES" : "NO") . "\n";
    echo "PHP Match 2 ($search_phone2): " . ($match2 ? "YES" : "NO") . "\n";
    
    $sql_like = "SELECT COUNT(*) FROM ".TBL_LOGS." WHERE id = ? AND (details LIKE ? OR details LIKE ?)";
    $stmt_like = $pdo->prepare($sql_like);
    $stmt_like->execute([$log['id'], "%$search_phone1%", "%$search_phone2%"]);
    $sql_match = $stmt_like->fetchColumn();
    echo "SQL LIKE Match: " . ($sql_match > 0 ? "YES" : "NO") . "\n\n";
}
