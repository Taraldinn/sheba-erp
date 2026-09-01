<?php
/**
 * AwajDigital Voice Reminders Dispatch Cron
 * 
 * Run this hourly or every 30 minutes via cron to process and dispatch reminders.
 * Command: php cron/voice_reminders.php
 */

date_default_timezone_set('Asia/Dhaka');

// Check for tenant override from CLI arguments
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
require_once __DIR__ . '/../includes/AwajDigitalClient.php';

$tenant_key = defined('TENANT_OVERRIDE') ? TENANT_OVERRIDE : (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$lock_file = sys_get_temp_dir() . '/sheba_voice_reminders_' . md5($tenant_key) . '.lock';
$lock_fp = @fopen($lock_file, 'w+');

if (!$lock_fp || !flock($lock_fp, LOCK_EX | LOCK_NB)) {
    echo "[" . date('Y-m-d H:i:s') . "] Another instance of Voice Reminders is already running for tenant $tenant_key. Exiting.\n";
    exit;
}

$today = date('Y-m-d');
$now_time = date('H:i');

// --- STEP 1: safe calling hours verification ---
// We check global or manager calling hours. Let's load system-wide hours to check if we are outside the 9:00 - 20:00 window.
// We also allow bypass via CLI argument --force
$force = (isset($argv) && in_array('--force', $argv));

// Check global boundary first (hardcoded safeguard limit)
if (($now_time < '09:00' || $now_time > '20:00') && !$force) {
    echo "[" . date('Y-m-d H:i:s') . "] Outside safe calling window (09:00 - 20:00). Automated reminders skipped.\n";
    exit;
}

// --- STEP 2: Find all managers (staff/admin) who have active/expired clients ---
$managers = safeFetchAll($pdo, "SELECT DISTINCT manager_id FROM " . TBL_USERS . " WHERE status IN ('Active', 'Expire')");
if (empty($managers)) {
    echo "No active clients found.\n";
    exit;
}

// Group candidates for batch dispatching
// We will group by: manager_id, reminder_type, billing_cycle_date, voice, sender
$batches = [];

foreach ($managers as $mgr) {
    $mgr_id = (int)$mgr['manager_id'];
    
    // Check if voice reminds is enabled for this manager
    $voice_enabled = get_voice_setting($pdo, $mgr_id, 'voice_enabled');
    $voice_enabled_expiry = get_voice_setting($pdo, $mgr_id, 'voice_enabled_expiry');
    
    if ($voice_enabled != '1' || $voice_enabled_expiry != '1') {
        continue;
    }
    
    // Check call time settings for this manager
    $mgr_call_time = get_voice_setting($pdo, $mgr_id, 'voice_time_expiry') ?: '10:00';
    if ($now_time < $mgr_call_time && !$force) {
        continue; // Manager's preferred calling time not reached yet
    }
    
    // Check manager's safe calling window limits
    $mgr_start = get_voice_setting($pdo, $mgr_id, 'voice_allowed_hours_start') ?: '09:00';
    $mgr_end = get_voice_setting($pdo, $mgr_id, 'voice_allowed_hours_end') ?: '20:00';
    if (($now_time < $mgr_start || $now_time > $mgr_end) && !$force) {
        continue;
    }
    
    // Determine the targeting billing date for this manager based on offset settings
    $offset_days = (int)get_voice_setting($pdo, $mgr_id, 'voice_days_before_expiry');
    $target_date = date('Y-m-d', strtotime("+$offset_days days"));
    
    // Load config parameters
    $voice = get_voice_setting($pdo, $mgr_id, 'voice_voice_name');
    $sender = get_voice_setting($pdo, $mgr_id, 'voice_sender');
    
    if (empty($voice) || empty($sender)) {
        continue; // Incomplete settings
    }
    
    // Fetch all active/expired clients under this manager expiring on the target date
    $clients = safeFetchAll($pdo, "SELECT * FROM " . TBL_USERS . " WHERE manager_id=? AND current_bill_date=? AND status IN ('Active', 'Expire')", [$mgr_id, $target_date]);
    
    foreach ($clients as $c) {
        // Exclude if voice call notifications are explicitly disabled for this client
        if (isset($c['send_voice_call']) && $c['send_voice_call'] == 0) {
            continue;
        }
        
        // Exclude if client has an active promise extension (effective expiry shifts to promise_date)
        if (isset($c['promise_enabled']) && $c['promise_enabled'] == 1) {
            $promise_date = $c['promise_date'] ?? '';
            if (!empty($promise_date) && $promise_date >= $today) {
                continue; // Extended under promise, do not call today
            }
        }
        
        $phone = normalize_bd_phone_11($c['phone']);
        if (empty($phone)) {
            continue; // Invalid number
        }
        
        // Group client into batches
        $reminder_type = 'expiry';
        if ($offset_days == 1) $reminder_type = '1_day_before';
        elseif ($offset_days == 2) $reminder_type = '2_days_before';
        elseif ($offset_days == 3) $reminder_type = '3_days_before';
        
        $batch_key = "{$mgr_id}_{$reminder_type}_{$target_date}_{$voice}_{$sender}";
        
        if (!isset($batches[$batch_key])) {
            $batches[$batch_key] = [
                'manager_id' => $mgr_id,
                'reminder_type' => $reminder_type,
                'billing_cycle_date' => $target_date,
                'voice' => $voice,
                'sender' => $sender,
                'clients' => []
            ];
        }
        
        $batches[$batch_key]['clients'][] = [
            'id' => $c['id'],
            'user_id' => $c['user_id'],
            'phone' => $phone
        ];
    }
}

// --- STEP 3: Process and dispatch batches ---
foreach ($batches as $key => $batch) {
    $mgr_id = $batch['manager_id'];
    $reminder_type = $batch['reminder_type'];
    $billing_cycle_date = $batch['billing_cycle_date'];
    $voice = $batch['voice'];
    $sender = $batch['sender'];
    $clients = $batch['clients'];
    
    if (empty($clients)) continue;
    
    // Retrieve API Bearer Token
    $token = get_voice_setting($pdo, $mgr_id, 'voice_api_token', true);
    if (empty($token)) {
        echo "API Token not configured for manager $mgr_id. Skipping batch.\n";
        continue;
    }
    
    // Prepare numbers list and unique reservation token
    $phone_numbers = [];
    $reserved_clients = [];
    $res_token = bin2hex(random_bytes(16));
    
    foreach ($clients as $cl) {
        $user_id = $cl['user_id'];
        $phone = $cl['phone'];
        
        // ATOMIC RESERVATION LOCK
        $stmt = $pdo->prepare("INSERT INTO " . TBL_VOICE_REMINDER_TRACKING . " 
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
        
        $stmt->execute([$mgr_id, $user_id, $reminder_type, $billing_cycle_date, $phone, $res_token, $res_token, $res_token, $res_token]);
        
        // Check if we won the reservation
        $track = safeFetch($pdo, "SELECT id, reserved_by, retry_count FROM " . TBL_VOICE_REMINDER_TRACKING . " WHERE user_id=? AND manager_id=? AND reminder_type=? AND billing_cycle_date=?", [$user_id, $mgr_id, $reminder_type, $billing_cycle_date]);
        
        if ($track && $track['reserved_by'] === $res_token) {
            $phone_numbers[] = $phone;
            $reserved_clients[] = [
                'id' => $cl['id'],
                'user_id' => $user_id,
                'phone' => $phone,
                'track_id' => $track['id'],
                'retry_count' => $track['retry_count']
            ];
        }
    }
    
    if (empty($phone_numbers)) {
        continue; // All numbers in this batch were locked or already sent
    }
    
    // Dispatch call broadcast via AwajDigitalClient
    $client = new AwajDigitalClient($token);
    $requestId = 'auto_' . uniqid() . '_' . time();
    
    echo "Dispatching batch of " . count($phone_numbers) . " voice calls for Manager $mgr_id...\n";
    $apiRes = $client->createBroadcast($requestId, $voice, $sender, $phone_numbers);
    
    if ($apiRes['success']) {
        $data = $apiRes['data'];
        $awaj_broadcast_id = $data['broadcast']['id'] ?? $data['broadcast_id'] ?? null;
        
        // Save broadcast record
        $stmtB = $pdo->prepare("INSERT INTO " . TBL_VOICE_BROADCASTS . " (manager_id, request_id, awaj_broadcast_id, reminder_type, billing_cycle_date, voice, sender, total_numbers, status, api_response) VALUES (?,?,?,?,?,?,?,?,?,?)");
        $stmtB->execute([
            $mgr_id,
            $requestId,
            $awaj_broadcast_id,
            $reminder_type,
            $billing_cycle_date,
            $voice,
            $sender,
            count($phone_numbers),
            'completed',
            json_encode($data)
        ]);
        
        // Update trackers to 'sent' and insert log rows
        foreach ($reserved_clients as $rc) {
            $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET status='sent', request_id=?, broadcast_id=? WHERE id=?")->execute([$requestId, $awaj_broadcast_id, $rc['track_id']]);
            
            // Insert log row
            $stmtLog = $pdo->prepare("INSERT INTO " . TBL_VOICE_CALL_LOGS . " (manager_id, user_id, phone, broadcast_id, request_id, reminder_type, billing_cycle_date, status) VALUES (?,?,?,?,?,?,?,?)");
            $stmtLog->execute([
                $mgr_id,
                $rc['user_id'],
                $rc['phone'],
                $awaj_broadcast_id,
                $requestId,
                $reminder_type,
                $billing_cycle_date,
                'pending'
            ]);
        }
        echo "Batch dispatched successfully. Broadcast ID: $awaj_broadcast_id\n";
    } else {
        $errMsg = $apiRes['data']['message'] ?? $apiRes['message'] ?? 'API response failure';
        echo "API Dispatch Failed: $errMsg\n";
        
        // Handle failure updates
        foreach ($reserved_clients as $rc) {
            $new_retry_count = (int)$rc['retry_count'] + 1;
            $next_retry = null;
            $new_status = 'failed';
            
            // Load delay preference
            $retry_delay = (int)get_voice_setting($pdo, $mgr_id, 'voice_retry_after_minutes') ?: 60;
            $max_attempts = (int)get_voice_setting($pdo, $mgr_id, 'voice_retry_max_attempts') ?: 1;
            
            if ($new_retry_count < $max_attempts) {
                $next_retry = date('Y-m-d H:i:s', strtotime("+$retry_delay minutes"));
            } else {
                $new_status = 'permanently_failed';
            }
            
            $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET status=?, retry_count=?, next_retry_at=?, error_message=? WHERE id=?")->execute([
                $new_status,
                $new_retry_count,
                $next_retry,
                $errMsg,
                $rc['track_id']
            ]);
            
            // Log the error
            $stmtLog = $pdo->prepare("INSERT INTO " . TBL_VOICE_CALL_LOGS . " (manager_id, user_id, phone, reminder_type, billing_cycle_date, status, error_message) VALUES (?,?,?,?,?,?,?)");
            $stmtLog->execute([
                $mgr_id,
                $rc['user_id'],
                $rc['phone'],
                $reminder_type,
                $billing_cycle_date,
                'failed',
                $errMsg
            ]);
        }
    }
}

// --- STEP 4: Process Retries for individual failed reminders ---
// Fetch failed rows that reached their next_retry_at times
$retries = safeFetchAll($pdo, "SELECT * FROM " . TBL_VOICE_REMINDER_TRACKING . " WHERE status='failed' AND next_retry_at <= NOW() LIMIT 100");

if (!empty($retries)) {
    echo "Processing " . count($retries) . " failed retries...\n";
    
    // Group retries by manager/voice/sender to dispatch them efficiently in batches
    $retry_batches = [];
    
    foreach ($retries as $r_track) {
        $mgr_id = (int)$r_track['manager_id'];
        
        $voice_retry_enabled = get_voice_setting($pdo, $mgr_id, 'voice_retry_enabled');
        if ($voice_retry_enabled != '1') {
            // Retries disabled, mark permanently failed
            $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET status='permanently_failed' WHERE id=?")->execute([$r_track['id']]);
            continue;
        }
        
        // Verify calling hours safety window
        $mgr_start = get_voice_setting($pdo, $mgr_id, 'voice_allowed_hours_start') ?: '09:00';
        $mgr_end = get_voice_setting($pdo, $mgr_id, 'voice_allowed_hours_end') ?: '20:00';
        if (($now_time < $mgr_start || $now_time > $mgr_end) && !$force) {
            continue; // Postpone retry until tomorrow's safe hour window opens
        }
        
        $voice = get_voice_setting($pdo, $mgr_id, 'voice_voice_name');
        $sender = get_voice_setting($pdo, $mgr_id, 'voice_sender');
        
        if (empty($voice) || empty($sender)) continue;
        
        $rkey = "{$mgr_id}_{$voice}_{$sender}";
        if (!isset($retry_batches[$rkey])) {
            $retry_batches[$rkey] = [
                'manager_id' => $mgr_id,
                'voice' => $voice,
                'sender' => $sender,
                'records' => []
            ];
        }
        
        $retry_batches[$rkey]['records'][] = $r_track;
    }
    
    foreach ($retry_batches as $rk => $rbatch) {
        $mgr_id = $rbatch['manager_id'];
        $voice = $rbatch['voice'];
        $sender = $rbatch['sender'];
        $records = $rbatch['records'];
        
        $token = get_voice_setting($pdo, $mgr_id, 'voice_api_token', true);
        if (empty($token)) continue;
        
        $phone_numbers = [];
        $processing_records = [];
        $res_token = bin2hex(random_bytes(16));
        
        foreach ($records as $rec) {
            // Atomic lock reservation
            $stmt = $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET reserved_by=?, processing_started_at=NOW() WHERE id=? AND reserved_by IS NULL");
            $stmt->execute([$res_token, $rec['id']]);
            
            // Check if we won
            $check = safeFetch($pdo, "SELECT id, reserved_by, retry_count FROM " . TBL_VOICE_REMINDER_TRACKING . " WHERE id=?", [$rec['id']]);
            if ($check && $check['reserved_by'] === $res_token) {
                $phone_numbers[] = $rec['normalized_phone'];
                $processing_records[] = [
                    'track_id' => $rec['id'],
                    'user_id' => $rec['user_id'],
                    'phone' => $rec['normalized_phone'],
                    'retry_count' => $rec['retry_count'],
                    'reminder_type' => $rec['reminder_type'],
                    'billing_cycle_date' => $rec['billing_cycle_date']
                ];
            }
        }
        
        if (empty($phone_numbers)) continue;
        
        $client = new AwajDigitalClient($token);
        $requestId = 'retry_' . uniqid() . '_' . time();
        
        echo "Dispatching retry batch of " . count($phone_numbers) . " voice calls for Manager $mgr_id...\n";
        $apiRes = $client->createBroadcast($requestId, $voice, $sender, $phone_numbers);
        
        if ($apiRes['success']) {
            $data = $apiRes['data'];
            $awaj_broadcast_id = $data['broadcast']['id'] ?? $data['broadcast_id'] ?? null;
            
            // Save broadcast record
            $stmtB = $pdo->prepare("INSERT INTO " . TBL_VOICE_BROADCASTS . " (manager_id, request_id, awaj_broadcast_id, reminder_type, billing_cycle_date, voice, sender, total_numbers, status, api_response) VALUES (?,?,?,?,?,?,?,?,?,?)");
            $stmtB->execute([
                $mgr_id,
                $requestId,
                $awaj_broadcast_id,
                'retry',
                date('Y-m-d'),
                $voice,
                $sender,
                count($phone_numbers),
                'completed',
                json_encode($data)
            ]);
            
            foreach ($processing_records as $pr) {
                $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET status='sent', request_id=?, broadcast_id=?, reserved_by=NULL WHERE id=?")->execute([$requestId, $awaj_broadcast_id, $pr['track_id']]);
                
                // Fetch current attempt count
                $log_attempt = (int)$pr['retry_count'] + 1;
                
                // Insert log row
                $stmtLog = $pdo->prepare("INSERT INTO " . TBL_VOICE_CALL_LOGS . " (manager_id, user_id, phone, broadcast_id, request_id, reminder_type, billing_cycle_date, status, attempt) VALUES (?,?,?,?,?,?,?,?,?)");
                $stmtLog->execute([
                    $mgr_id,
                    $pr['user_id'],
                    $pr['phone'],
                    $awaj_broadcast_id,
                    $requestId,
                    $pr['reminder_type'],
                    $pr['billing_cycle_date'],
                    'pending',
                    $log_attempt
                ]);
            }
        } else {
            $errMsg = $apiRes['data']['message'] ?? $apiRes['message'] ?? 'API response failure';
            
            foreach ($processing_records as $pr) {
                $new_retry_count = (int)$pr['retry_count'] + 1;
                $next_retry = null;
                $new_status = 'failed';
                
                $retry_delay = (int)get_voice_setting($pdo, $mgr_id, 'voice_retry_after_minutes') ?: 60;
                $max_attempts = (int)get_voice_setting($pdo, $mgr_id, 'voice_retry_max_attempts') ?: 1;
                
                if ($new_retry_count < $max_attempts) {
                    $next_retry = date('Y-m-d H:i:s', strtotime("+$retry_delay minutes"));
                } else {
                    $new_status = 'permanently_failed';
                }
                
                $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET status=?, retry_count=?, next_retry_at=?, error_message=?, reserved_by=NULL WHERE id=?")->execute([
                    $new_status,
                    $new_retry_count,
                    $next_retry,
                    $errMsg,
                    $pr['track_id']
                ]);
                
                // Insert error log row
                $stmtLog = $pdo->prepare("INSERT INTO " . TBL_VOICE_CALL_LOGS . " (manager_id, user_id, phone, reminder_type, billing_cycle_date, status, error_message, attempt) VALUES (?,?,?,?,?,?,?,?)");
                $stmtLog->execute([
                    $mgr_id,
                    $pr['user_id'],
                    $pr['phone'],
                    $pr['reminder_type'],
                    $pr['billing_cycle_date'],
                    'failed',
                    $errMsg,
                    ($new_retry_count)
                ]);
            }
        }
    }
}

echo "[" . date('Y-m-d H:i:s') . "] Done voice reminders dispatch.\n";
flock($lock_fp, LOCK_UN);
fclose($lock_fp);
@unlink($lock_file);
