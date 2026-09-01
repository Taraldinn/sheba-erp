<?php
/**
 * SMS Reminder Cron Script
 * Run this once daily (e.g., at 10 AM)
 * Command: php cron/sms_reminders.php
 */

// Check for tenant override from CLI arguments (Consistency with sync_sessions.php)
if (isset($argv)) {
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

// --- CONCURRENCY LOCK ---
$tenant_key = defined('TENANT_OVERRIDE') ? TENANT_OVERRIDE : (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$lock_file = sys_get_temp_dir() . '/sheba_sms_reminders_' . md5($tenant_key) . '.lock';
$lock_fp = fopen($lock_file, 'w+');
if (!$lock_fp || !flock($lock_fp, LOCK_EX | LOCK_NB)) {
    echo "[" . date('Y-m-d H:i:s') . "] Another instance of SMS Reminders is already running for tenant $tenant_key. Exiting.\n";
    exit;
}

// --- SETUP IDEMPOTENCY TABLE ---
$pdo->exec("CREATE TABLE IF NOT EXISTS sms_reminder_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    manager_id INT NOT NULL DEFAULT 0,
    user_id VARCHAR(50) NOT NULL,
    reminder_type ENUM('27_day', 'expiry') NOT NULL,
    billing_cycle_date DATE NOT NULL,
    normalized_phone VARCHAR(20) NOT NULL,
    status ENUM('processing', 'sent', 'failed', 'permanently_failed') NOT NULL DEFAULT 'processing',
    reserved_by VARCHAR(64) NULL,
    processing_started_at DATETIME NULL,
    next_retry_at DATETIME NULL,
    retry_count INT DEFAULT 0,
    sms_log_id INT NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reminder (user_id, manager_id, reminder_type, billing_cycle_date)
) ENGINE=InnoDB;");

$today = date('Y-m-d');
$reminder_date = date('Y-m-d', strtotime('+3 days'));

// --- SAFEGUARD: Only run once per day per tenant ---
// (Disabled to allow checking custom times throughout the day)
$last_run = get_opt($pdo, 'last_sms_reminder_date', '');
if ($last_run === $today && !in_array('--force', $argv ?? [])) {
    // echo "[" . date('Y-m-d H:i:s') . "] SMS Reminders already sent for today ($today). Skipping.\n";
    // exit;
}

echo "[" . date('Y-m-d H:i:s') . "] Starting SMS Reminders for $today...\n";

// --- 1. Expiry Reminders (Due Today) ---
$expiry_users = safeFetchAll($pdo, "SELECT * FROM ".TBL_USERS." WHERE current_bill_date = ? AND status IN ('Active', 'Expire')", [$today]);
$count_expiry = 0;

foreach ($expiry_users as $u) {
    if (isset($u['send_sms']) && $u['send_sms'] == 0) continue;
    if (get_sms_setting($pdo, $u['manager_id'], 'sms_enabled_expiry') != '1') continue;
    
    // Check if it's time to send
    $expiry_time = get_sms_setting($pdo, $u['manager_id'], 'sms_time_expiry');
    if (!$expiry_time) $expiry_time = "00:00";
    if (date('H:i') < $expiry_time && !in_array('--force', $argv ?? [])) continue;
    
    $expiry_tpl = get_sms_setting($pdo, $u['manager_id'], 'sms_tpl_expiry');
    if (!$expiry_tpl) $expiry_tpl = "Dear [NAME], your internet service for ID [ID] expires today. Please recharge immediately.";
    
    $monthly_bill = floatval($u['bill_amount']);
    if ($monthly_bill <= 0) {
        $pkg = safeFetch($pdo, "SELECT price FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
        $monthly_bill = $pkg ? floatval($pkg['price']) : 0;
    }
    $amount = max(0, $monthly_bill) + floatval($u['due'] ?? 0);
    $days = 0; // Expiry is today

    $msg = str_replace(['[NAME]', '[ID]', '[DATE]', '[DAYS]', '[AMOUNT]'], [$u['name'], $u['user_id'], $today, $days, $amount], $expiry_tpl);
    
    // Determine tracking metadata
    $bill_date = $u['current_bill_date'] ?? $today;
    $manager_id = $u['manager_id'] ?? 0;
    $user_id = $u['user_id'];
    $reminder_type = 'expiry';
    $search_phone = normalize_bd_phone($u['phone']);

    // Generate unique reservation token
    $token = bin2hex(random_bytes(16));

    // ATOMIC RESERVATION
    $stmt = $pdo->prepare("INSERT INTO sms_reminder_tracking 
        (manager_id, user_id, reminder_type, billing_cycle_date, normalized_phone, status, reserved_by, processing_started_at, retry_count)
        VALUES (?, ?, ?, ?, ?, 'processing', ?, NOW(), 0)
        ON DUPLICATE KEY UPDATE 
            reserved_by = IF(
                (status = 'failed' AND next_retry_at <= NOW() AND retry_count < 3) OR
                (status = 'processing' AND processing_started_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)),
                ?, reserved_by
            ),
            processing_started_at = IF(reserved_by = ?, NOW(), processing_started_at),
            status = IF(reserved_by = ?, 'processing', status)");
    
    $stmt->execute([$manager_id, $user_id, $reminder_type, $bill_date, $search_phone, $token, $token, $token, $token]);

    // Check if we won the reservation
    $track = safeFetch($pdo, "SELECT id, reserved_by, retry_count FROM sms_reminder_tracking WHERE user_id=? AND manager_id=? AND reminder_type=? AND billing_cycle_date=?", [$user_id, $manager_id, $reminder_type, $bill_date]);
    
    if (!$track || $track['reserved_by'] !== $token) {
        continue; // Skipped safely: locked by another process, or already sent, or max retries reached.
    }

    // Send SMS
    $inserted_log_id = null;
    $sms_success = sendSMS($pdo, $u['phone'], $msg, $manager_id, 0, $inserted_log_id);
    
    // Update tracking status atomically
    if ($sms_success) {
        $pdo->prepare("UPDATE sms_reminder_tracking SET status='sent', sms_log_id=? WHERE id=?")->execute([$inserted_log_id, $track['id']]);
        $count_expiry++;
    } else {
        $retry_count = intval($track['retry_count']) + 1;
        $next_retry = null;
        $new_status = 'failed';
        if ($retry_count == 1) {
            $next_retry = date('Y-m-d H:i:s', strtotime('+2 hours'));
        } elseif ($retry_count == 2) {
            $next_retry = date('Y-m-d H:i:s', strtotime('+5 hours'));
        } else {
            $new_status = 'permanently_failed';
        }
        $pdo->prepare("UPDATE sms_reminder_tracking SET status=?, retry_count=?, next_retry_at=?, sms_log_id=? WHERE id=?")->execute([$new_status, $retry_count, $next_retry, $inserted_log_id, $track['id']]);
    }
}
echo "Sent $count_expiry expiry reminders.\n";


// --- 2. Payment Reminders (Due in 3 Days) ---
$reminder_users = safeFetchAll($pdo, "SELECT * FROM ".TBL_USERS." WHERE current_bill_date = ? AND status='Active'", [$reminder_date]);
$count_reminder = 0;

foreach ($reminder_users as $u) {
    if (isset($u['send_sms']) && $u['send_sms'] == 0) continue;
    if (get_sms_setting($pdo, $u['manager_id'], 'sms_enabled_reminder') != '1') continue;

    // Check if it's time to send
    $reminder_time = get_sms_setting($pdo, $u['manager_id'], 'sms_time_reminder');
    if (!$reminder_time) $reminder_time = "00:00";
    if (date('H:i') < $reminder_time && !in_array('--force', $argv ?? [])) continue;

    $reminder_tpl = get_sms_setting($pdo, $u['manager_id'], 'sms_tpl_reminder');
    if (!$reminder_tpl) $reminder_tpl = "Dear [NAME], your internet bill for ID [ID] is due in 3 days. Please pay to avoid disruption.";
    
    $monthly_bill = floatval($u['bill_amount']);
    if ($monthly_bill <= 0) {
        $pkg = safeFetch($pdo, "SELECT price FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
        $monthly_bill = $pkg ? floatval($pkg['price']) : 0;
    }
    $amount = max(0, $monthly_bill) + floatval($u['due'] ?? 0);
    $days = round((strtotime($u['current_bill_date']) - strtotime($today)) / 86400);

    $msg = str_replace(['[NAME]', '[ID]', '[DATE]', '[DAYS]', '[AMOUNT]'], [$u['name'], $u['user_id'], $reminder_date, $days, $amount], $reminder_tpl);
    
    // Determine tracking metadata
    $bill_date = $u['current_bill_date'] ?? $today;
    $manager_id = $u['manager_id'] ?? 0;
    $user_id = $u['user_id'];
    $reminder_type = '27_day';
    $search_phone = normalize_bd_phone($u['phone']);

    // Generate unique reservation token
    $token = bin2hex(random_bytes(16));

    // ATOMIC RESERVATION
    $stmt = $pdo->prepare("INSERT INTO sms_reminder_tracking 
        (manager_id, user_id, reminder_type, billing_cycle_date, normalized_phone, status, reserved_by, processing_started_at, retry_count)
        VALUES (?, ?, ?, ?, ?, 'processing', ?, NOW(), 0)
        ON DUPLICATE KEY UPDATE 
            reserved_by = IF(
                (status = 'failed' AND next_retry_at <= NOW() AND retry_count < 3) OR
                (status = 'processing' AND processing_started_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)),
                ?, reserved_by
            ),
            processing_started_at = IF(reserved_by = ?, NOW(), processing_started_at),
            status = IF(reserved_by = ?, 'processing', status)");
    
    $stmt->execute([$manager_id, $user_id, $reminder_type, $bill_date, $search_phone, $token, $token, $token, $token]);

    // Check if we won the reservation
    $track = safeFetch($pdo, "SELECT id, reserved_by, retry_count FROM sms_reminder_tracking WHERE user_id=? AND manager_id=? AND reminder_type=? AND billing_cycle_date=?", [$user_id, $manager_id, $reminder_type, $bill_date]);
    
    if (!$track || $track['reserved_by'] !== $token) {
        continue; // Skipped safely: locked by another process, or already sent, or max retries reached.
    }

    // Send SMS
    $inserted_log_id = null;
    $sms_success = sendSMS($pdo, $u['phone'], $msg, $manager_id, 0, $inserted_log_id);
    
    // Update tracking status atomically
    if ($sms_success) {
        $pdo->prepare("UPDATE sms_reminder_tracking SET status='sent', sms_log_id=? WHERE id=?")->execute([$inserted_log_id, $track['id']]);
        $count_reminder++;
    } else {
        $retry_count = intval($track['retry_count']) + 1;
        $next_retry = null;
        $new_status = 'failed';
        if ($retry_count == 1) {
            $next_retry = date('Y-m-d H:i:s', strtotime('+2 hours'));
        } elseif ($retry_count == 2) {
            $next_retry = date('Y-m-d H:i:s', strtotime('+5 hours'));
        } else {
            $new_status = 'permanently_failed';
        }
        $pdo->prepare("UPDATE sms_reminder_tracking SET status=?, retry_count=?, next_retry_at=?, sms_log_id=? WHERE id=?")->execute([$new_status, $retry_count, $next_retry, $inserted_log_id, $track['id']]);
    }
}
echo "Sent $count_reminder payment reminders.\n";

// Update last run date
set_opt($pdo, 'last_sms_reminder_date', $today . ' ' . date('H:i:s'));

echo "[" . date('Y-m-d H:i:s') . "] Done.\n";
