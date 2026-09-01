<?php
// cron/call_center_cron.php
/**
 * Automated Cron Job for Call Center and Voice SMS Dispatching
 * 
 * Schedule in cPanel / crontab to run every 5 minutes:
 * *\/5 * * * * php /path/to/cron/call_center_cron.php > /dev/null 2>&1
 */



// CLI Argument Parsing
$options = getopt("", ["tenant:"]);
$tenant_arg = $options['tenant'] ?? null;

if ($tenant_arg) {
    // Define Tenant Override before loading DB configuration
    define('TENANT_OVERRIDE', $tenant_arg);
    require_once __DIR__ . '/../includes/config.php';
    require_once __DIR__ . '/../includes/functions.php';
    require_once __DIR__ . '/../classes/IPPhoneDriver.php';
    
    run_tenant_cron($pdo, $tenant_arg);
} else {
    // If run without parameters, fetch all active tenants and execute subprocesses
    define('TENANT_OVERRIDE', 'main');
    require_once __DIR__ . '/../includes/config.php';
    require_once __DIR__ . '/../includes/functions.php';
    
    echo "Starting Call Center Master Cron Job...\n";
    
    try {
        // Query active subdomains from master database
        $mpdo = get_master_pdo();
        if ($mpdo) {
            $tenants = $mpdo->query("SELECT subdomain FROM tenants WHERE status = 'active'")->fetchAll(PDO::FETCH_COLUMN);
            
            if (empty($tenants)) {
                echo "No active tenants found. Running master database tasks...\n";
                run_tenant_cron($pdo, 'main');
            } else {
                foreach ($tenants as $subdomain) {
                    echo "Spawning subprocess cron worker for tenant: $subdomain\n";
                    $php_bin = (defined('PHP_BINARY') && PHP_BINARY) ? PHP_BINARY : 'php';
                    $cmd = escapeshellarg($php_bin) . " " . escapeshellarg(__FILE__) . " --tenant=" . escapeshellarg($subdomain);
                    $output = safe_shell_exec($cmd);
                    echo "Tenant [$subdomain] Output: " . substr((string)$output, 0, 500) . "\n";
                }
                
                // Also run for main system
                echo "Running main cron tasks...\n";
                run_tenant_cron($pdo, 'main');
            }
        } else {
            echo "Master database not connected. Running local system tasks...\n";
            run_tenant_cron($pdo, 'main');
        }
    } catch (Exception $e) {
        echo "Master Cron Error: " . $e->getMessage() . "\n";
    }
}

/**
 * Executes campaign dispatching and automation for the selected tenant pdo context.
 */
function run_tenant_cron(PDO $pdo, string $tenant) {
    echo "--------------------------------------------------\n";
    echo "Executing Cron Tasks for Tenant Context: [$tenant]\n";
    echo "Current Time: " . date('Y-m-d H:i:s') . "\n";
    echo "--------------------------------------------------\n";
    
    // --- TASK 1: AUTO EXPIRY REMINDER QUEUE BUILDER (Runs daily at 9:00 AM) ---
    $hour = date('H');
    $minute = date('i');
    if ($hour == '09' && intval($minute) < 10) {
        echo "Running Daily Queue Builder (Expired/Due alerts)...\n";
        build_daily_voice_queues($pdo, $tenant);
    }
    
    // --- TASK 2: DISPATCH OUTGOING VOICE SMS QUEUE ---
    dispatch_voice_queue($pdo, $tenant);
    
    // --- TASK 3: DATABASE CLEANUP AND HOUSEKEEPING (Runs daily at 11:00 PM) ---
    if ($hour == '23' && intval($minute) < 10) {
        echo "Running Database Cleanup Logs Housekeeping...\n";
        purge_old_call_logs($pdo);
    }
    
    echo "Tenant Context [$tenant] finished successfully.\n\n";
}

/**
 * Automatically builds voice sms campaigns for Expired or Due clients.
 */
function build_daily_voice_queues(PDO $pdo, string $tenant) {
    $today = date('Y-m-d');
    
    // 1. Fetch default active templates
    $tpl_expired = safeFetch($pdo, "SELECT * FROM voice_templates WHERE type = 'Expired package reminder' LIMIT 1");
    $tpl_due = safeFetch($pdo, "SELECT * FROM voice_templates WHERE type = 'Due bill reminder' LIMIT 1");
    
    // Target 1: Expired clients (Active status but expiry is in past)
    if ($tpl_expired) {
        $expired_users = safeFetchAll($pdo, "SELECT id, name, phone, user_package, bill_amount, current_bill_date FROM " . TBL_USERS . " WHERE current_bill_date < ? AND status = 'Active'", [$today]);
        $queued_exp = 0;
        
        $stmt = $pdo->prepare("INSERT INTO voice_sms_queue (tenant_id, customer_id, phone, template_id, campaign_name, audio_file, text_message, scheduled_at) VALUES (?, ?, ?, ?, 'Auto Expiry Reminder', ?, ?, NOW())");
        
        foreach ($expired_users as $u) {
            if (empty($u['phone'])) continue;
            
            // Check if reminder was already built today
            $already_sent = $pdo->query("SELECT COUNT(*) FROM voice_sms_queue WHERE customer_id = {$u['id']} AND campaign_name='Auto Expiry Reminder' AND DATE(created_at) = '$today'")->fetchColumn();
            if ($already_sent > 0) continue;
            
            // Build dynamic text transcript
            $expiry = date('d-m-Y', strtotime($u['current_bill_date']));
            $msg = str_replace(
                ['[NAME]', '[ID]', '[AMOUNT]', '[DATE]', '[PACKAGE]'],
                [$u['name'], $u['phone'], $u['bill_amount'], $expiry, $u['user_package']],
                $tpl_expired['message_text']
            );
            
            $stmt->execute([
                $tenant,
                $u['id'],
                $u['phone'],
                $tpl_expired['id'],
                $tpl_expired['audio_file_path'],
                $msg
            ]);
            $queued_exp++;
        }
        echo "Auto Expiry Campaign built: Queued $queued_exp calls.\n";
    }
    
    // Target 2: Due clients (outstanding balance > 0)
    if ($tpl_due) {
        $due_users = safeFetchAll($pdo, "SELECT id, name, phone, user_package, due, current_bill_date FROM " . TBL_USERS . " WHERE due > 0 AND status = 'Active'");
        $queued_due = 0;
        
        $stmt = $pdo->prepare("INSERT INTO voice_sms_queue (tenant_id, customer_id, phone, template_id, campaign_name, audio_file, text_message, scheduled_at) VALUES (?, ?, ?, ?, 'Auto Outstanding Bill Reminder', ?, ?, NOW())");
        
        foreach ($due_users as $u) {
            if (empty($u['phone'])) continue;
            
            // Check if reminder was already built today
            $already_sent = $pdo->query("SELECT COUNT(*) FROM voice_sms_queue WHERE customer_id = {$u['id']} AND campaign_name='Auto Outstanding Bill Reminder' AND DATE(created_at) = '$today'")->fetchColumn();
            if ($already_sent > 0) continue;
            
            $expiry = date('d-m-Y', strtotime($u['current_bill_date']));
            $msg = str_replace(
                ['[NAME]', '[ID]', '[AMOUNT]', '[DATE]', '[PACKAGE]'],
                [$u['name'], $u['phone'], $u['due'], $expiry, $u['user_package']],
                $tpl_due['message_text']
            );
            
            $stmt->execute([
                $tenant,
                $u['id'],
                $u['phone'],
                $tpl_due['id'],
                $tpl_due['audio_file_path'],
                $msg
            ]);
            $queued_due++;
        }
        echo "Auto Outstanding Bill Campaign built: Queued $queued_due calls.\n";
    }
}

/**
 * Dispatches pending voice SMS queue items.
 */
function dispatch_voice_queue(PDO $pdo, string $tenant) {
    // Fetch active API Driver
    $driverObj = IPPhoneDriver::getDriver($pdo);
    if (!$driverObj) {
        echo "API Driver is disabled or not configured. Skipping queue dispatch.\n";
        return;
    }
    
    // Fetch up to 10 pending voice messages scheduled in the past
    $now = date('Y-m-d H:i:s');
    $queue = safeFetchAll($pdo, "SELECT * FROM voice_sms_queue WHERE status = 'Pending' AND scheduled_at <= ? ORDER BY id ASC LIMIT 10", [$now]);
    
    if (empty($queue)) {
        echo "No pending voice calls in queue.\n";
        return;
    }
    
    foreach ($queue as $q) {
        echo "Processing Queue ID #{$q['id']} for Client ID #{$q['customer_id']}...\n";
        
        // --- PAID SUPPRESSION FILTER ---
        // Check if customer already paid (status is Active and due balance is zero for outstanding reminders)
        $client = safeFetch($pdo, "SELECT status, due, current_bill_date FROM " . TBL_USERS . " WHERE id = ?", [$q['customer_id']]);
        if ($client) {
            $is_paid_reminder = (strpos($q['campaign_name'], 'Bill') !== false || strpos($q['campaign_name'], 'Outstanding') !== false);
            
            // If they paid (due is 0) or package recharged (expiry is in future), cancel reminder
            if (($is_paid_reminder && floatval($client['due']) <= 0) || ($client['status'] === 'Active' && $client['current_bill_date'] >= date('Y-m-d'))) {
                $pdo->prepare("UPDATE voice_sms_queue SET status = 'Cancelled', error_message = 'Suppressed: Customer already recharged or paid bills.' WHERE id = ?")
                    ->execute([$q['id']]);
                echo "  Reminder Cancelled: Customer already recharged/paid.\n";
                continue;
            }
        }
        
        // Update queue item to Sending to prevent dual concurrency
        $pdo->prepare("UPDATE voice_sms_queue SET status = 'Sending' WHERE id = ?")->execute([$q['id']]);
        
        // Dispatch call
        $message = !empty($q['audio_file']) ? $q['audio_file'] : $q['text_message'];
        $is_audio = !empty($q['audio_file']);
        
        $result = $driverObj->sendVoiceSMS($q['phone'], $message, $is_audio);
        
        // Handle result
        if ($result['success']) {
            // Save successful call log
            $pdo->prepare("UPDATE voice_sms_queue SET status = 'Sent', attempts = attempts + 1, sent_at = NOW(), error_message = 'Connected successfully' WHERE id = ?")
                ->execute([$q['id']]);
            
            // Save to call_logs table
            $call_start = date('Y-m-d H:i:s');
            $pdo->prepare("INSERT INTO call_logs (tenant_id, customer_id, customer_name, customer_mobile, staff_id, staff_name, call_type, call_start_time, call_end_time, duration, call_status, api_response) VALUES (?, ?, ?, ?, 0, 'Auto Campaign', 'Voice Broadcast', ?, ?, 30, 'Answered', ?)")
                ->execute([
                    $tenant,
                    $q['customer_id'],
                    $client['name'] ?? 'Campaign Client',
                    $q['phone'],
                    $call_start,
                    $call_start,
                    $result['raw_response']
                ]);
                
            echo "  Call Connected successfully.\n";
        } else {
            // Failure retry loops
            $attempts = intval($q['attempts']) + 1;
            $max_attempts = intval($q['max_attempts']);
            $err_msg = $result['message'];
            
            if ($attempts < $max_attempts) {
                // Reschedule for retry in 30 minutes
                $retry_time = date('Y-m-d H:i:s', strtotime('+30 minutes'));
                $pdo->prepare("UPDATE voice_sms_queue SET status = 'Pending', attempts = ?, scheduled_at = ?, error_message = ? WHERE id = ?")
                    ->execute([$attempts, $retry_time, "Busy/No-Answer: Retry scheduled. Error: $err_msg", $q['id']]);
                echo "  Call Failed (Attempts: $attempts/$max_attempts). Rescheduled retry for $retry_time.\n";
            } else {
                // Max attempts reached -> Mark Failed
                $pdo->prepare("UPDATE voice_sms_queue SET status = 'Failed', attempts = ?, error_message = ? WHERE id = ?")
                    ->execute([$attempts, "Final Failure after max retries. API Error: $err_msg", $q['id']]);
                echo "  Call Final Failure. Max attempts reached ($attempts/$max_attempts).\n";
            }
        }
    }
}

/**
 * Purges call request logs older than 30 days.
 */
function purge_old_call_logs(PDO $pdo) {
    $thirty_days_ago = date('Y-m-d H:i:s', strtotime('-30 days'));
    try {
        $stmt = $pdo->prepare("DELETE FROM call_logs WHERE call_start_time < ?");
        $stmt->execute([$thirty_days_ago]);
        $rows = $stmt->rowCount();
        echo "Housekeeping cleanup: Purged $rows call logs older than 30 days.\n";
    } catch (Exception $e) {
        echo "Housekeeping Cleanup error: " . $e->getMessage() . "\n";
    }
}
?>
