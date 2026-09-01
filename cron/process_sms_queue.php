<?php
/**
 * cron/process_sms_queue.php
 * Background SMS queue worker.
 * Processes pending SMS logs to avoid blocking the web interface.
 */

// Check for tenant override from CLI arguments or HTTP GET
if (isset($_GET['tenant'])) {
    define('TENANT_OVERRIDE', preg_replace('/[^a-zA-Z0-9-]/', '', $_GET['tenant']));
} elseif (isset($argv)) {
    foreach ($argv as $arg) {
        if (strpos($arg, '--tenant=') === 0) {
            $tenant = substr($arg, 9);
            define('TENANT_OVERRIDE', $tenant);
            break;
        }
    }
}

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

// Enable error logging for cron
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../debug_sms_cron.log');

// Fetch pending SMS logs (limit to 200 per run to prevent timeout)
try {
    $stmt = $pdo->prepare("SELECT * FROM " . TBL_SMS_LOGS . " WHERE status = 'Pending' ORDER BY id ASC LIMIT 200");
    $stmt->execute();
    $pending = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($pending)) {
        exit;
    }
    
    foreach ($pending as $row) {
        // Send SMS using the core sendSMS function, passing the log ID to update the existing record
        sendSMS($pdo, $row['phone'], $row['message'], $row['staff_id'], $row['id']);
    }
} catch (Exception $e) {
    error_log("SMS Queue Processor Error: " . $e->getMessage());
}
?>
