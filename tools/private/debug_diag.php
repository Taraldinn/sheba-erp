<?php
// debug_diag.php
ob_start();
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once 'includes/config.php';
require_once 'includes/functions.php';

echo "<h2>Diagnostic Report - Ticket Reply Fixes</h2>";
echo "<b>Current Work Directory:</b> " . __DIR__ . "<br>";
echo "<b>Tenant Environment:</b> " . (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'Main System') . "<br>";

// 1. Verify Table Existence
try {
    $res = $pdo->query("DESCRIBE ticket_replies");
    echo "<p style='color:green'>✔️ Table `ticket_replies` exists!</p>";
    echo "<b>Columns:</b><br><pre>";
    while ($row = $res->fetch(PDO::FETCH_ASSOC)) {
         print_r($row);
    }
    echo "</pre>";
} catch (Exception $e) {
    echo "<p style='color:red'>❌ Table `ticket_replies` missing or inaccessible!</p>";
    echo "<b>Error:</b> " . $e->getMessage() . "<br>";
    echo "<i>Attempting auto-creation...</i><br>";
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS ticket_replies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ticket_id INT,
            staff_id INT DEFAULT NULL,
            client_id INT DEFAULT NULL,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
        echo "<p style='color:green'>✔️ Table created successfully now!</p>";
    } catch (Exception $ex) {
        echo "<p style='color:red'>❌ Creation failed: " . $ex->getMessage() . "</p>";
    }
}

// 2. Sample Replies Check
echo "<b>Last 5 Replies In Database:</b> <br>";
try {
    $replies = safeFetchAll($pdo, "SELECT * FROM ticket_replies ORDER BY id DESC LIMIT 5");
    echo "<pre>"; print_r($replies); echo "</pre>";
} catch (Exception $e) {}

// 3. SMS Settings Check
echo "<h3>SMS Configuration Diagnostics</h3>";
$test_staff_id = $_SESSION['admin_id'] ?? ($_SESSION['client_id'] ?? 1);
echo "<b>Testing for Staff ID:</b> $test_staff_id <br>";

$api_url = get_sms_setting($pdo, $test_staff_id, 'sms_api_url');
$api_key = get_sms_setting($pdo, $test_staff_id, 'sms_api_key');
$sender_id = get_sms_setting($pdo, $test_staff_id, 'sms_sender_id');
$is_enabled = get_sms_setting($pdo, $test_staff_id, 'sms_enabled');

echo "<b>sms_enabled:</b> " . ($is_enabled ? 'ON' : 'OFF') . "<br>";
echo "<b>sms_api_url:</b> " . ($api_url ? 'Configured' : 'Missing') . "<br>";
echo "<b>sms_api_key:</b> " . ($api_key ? 'Configured' : 'Missing') . "<br>";
echo "<b>sms_sender_id:</b> " . ($sender_id ? 'Configured' : 'Missing') . "<br>";

if (!$is_enabled || $is_enabled === '0') {
    echo "<p style='color:red'>❌ SMS is DISABLED in settings!</p>";
} elseif (!$api_url) {
    echo "<p style='color:red'>❌ SMS API URL is missing!</p>";
} else {
    echo "<p style='color:green'>✔️ SMS settings appear populated!</p>";
}

echo "<b>Global Fallbacks:</b><br>";
echo "Global sms_enabled: " . (get_opt($pdo, 'sms_enabled') ? 'ON' : 'OFF') . "<br>";

echo "<b>Last 5 SMS Logs:</b> <br>";
try {
    $logs = safeFetchAll($pdo, "SELECT * FROM " . TBL_LOGS . " WHERE action_type LIKE '%SMS%' ORDER BY id DESC LIMIT 5");
    echo "<pre>"; print_r($logs); echo "</pre>";
} catch (Exception $e) {}

?>
