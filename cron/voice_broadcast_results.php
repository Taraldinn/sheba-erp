<?php
/**
 * AwajDigital Voice Broadcast Results Sync Cron
 * 
 * Run this periodically (e.g., every 5-10 minutes) via cron to synchronize pending call states.
 * Command: php cron/voice_broadcast_results.php
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
$lock_file = sys_get_temp_dir() . '/sheba_voice_broadcast_results_' . md5($tenant_key) . '.lock';
$lock_fp = @fopen($lock_file, 'w+');

if (!$lock_fp || !flock($lock_fp, LOCK_EX | LOCK_NB)) {
    echo "[" . date('Y-m-d H:i:s') . "] Another instance of Broadcast Results Sync is already running for tenant $tenant_key. Exiting.\n";
    exit;
}

// --- SELF-HEALING: Repair any logs with NULL or 0 broadcast_id ---
try {
    $broken_broadcasts = safeFetchAll($pdo, "SELECT id, request_id, api_response FROM " . TBL_VOICE_BROADCASTS . " WHERE (awaj_broadcast_id IS NULL OR awaj_broadcast_id = 0) AND api_response IS NOT NULL");
    
    foreach ($broken_broadcasts as $bb) {
        $resp = json_decode($bb['api_response'], true);
        $real_id = null;
        if ($resp) {
            if (isset($resp['broadcast']['id'])) {
                $real_id = (int)$resp['broadcast']['id'];
            } elseif (isset($resp['broadcast_id'])) {
                $real_id = (int)$resp['broadcast_id'];
            }
        }
        
        if ($real_id) {
            // Update TBL_VOICE_BROADCASTS
            $pdo->prepare("UPDATE " . TBL_VOICE_BROADCASTS . " SET awaj_broadcast_id = ? WHERE id = ?")
                ->execute([$real_id, $bb['id']]);
                
            // Update TBL_VOICE_CALL_LOGS
            $pdo->prepare("UPDATE " . TBL_VOICE_CALL_LOGS . " SET broadcast_id = ? WHERE request_id = ?")
                ->execute([$real_id, $bb['request_id']]);
                
            // Update TBL_VOICE_REMINDER_TRACKING
            $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET broadcast_id = ? WHERE request_id = ?")
                ->execute([$real_id, $bb['request_id']]);
                
            echo "Repaired broadcast ID to $real_id for request {$bb['request_id']}\n";
        }
    }
    
    // Also repair any voice_call_logs that have NULL/0 broadcast_id but have a request_id present in voice_broadcasts
    $pdo->exec("UPDATE " . TBL_VOICE_CALL_LOGS . " cl 
        JOIN " . TBL_VOICE_BROADCASTS . " b ON cl.request_id = b.request_id 
        SET cl.broadcast_id = b.awaj_broadcast_id 
        WHERE (cl.broadcast_id IS NULL OR cl.broadcast_id = 0) AND b.awaj_broadcast_id IS NOT NULL AND b.awaj_broadcast_id > 0");
        
} catch (Exception $healing_ex) {
    error_log("Voice self-healing failed: " . $healing_ex->getMessage());
}

// Find pending logs to sync (grouped by broadcast_id to minimize API connection overhead)
$pending_calls = safeFetchAll($pdo, "SELECT DISTINCT broadcast_id, manager_id FROM " . TBL_VOICE_CALL_LOGS . " WHERE status = 'pending' AND broadcast_id IS NOT NULL LIMIT 100");

if (empty($pending_calls)) {
    echo "No pending voice calls found for synchronization.\n";
    exit;
}

echo "[" . date('Y-m-d H:i:s') . "] Syncing results for " . count($pending_calls) . " broadcasts...\n";

foreach ($pending_calls as $pc) {
    $broadcast_id = (int)$pc['broadcast_id'];
    $mgr_id = (int)$pc['manager_id'];
    
    // Retrieve Bearer Token for this manager
    $token = get_voice_setting($pdo, $mgr_id, 'voice_api_token', true);
    if (empty($token)) {
        echo "API Token not configured for manager $mgr_id. Skipping broadcast $broadcast_id.\n";
        continue;
    }
    
    $client = new AwajDigitalClient($token);
    $res = $client->getBroadcastResult($broadcast_id);
    
    if (!$res['success']) {
        $errMsg = $res['data']['message'] ?? $res['message'] ?? 'API response error';
        echo "Failed to retrieve results for broadcast $broadcast_id: $errMsg\n";
        continue;
    }
    
    $data = $res['data'];
    $is_complete = $data['isComplete'] ?? false;
    $broadcast_status = strtolower($data['broadcast']['status'] ?? '');
    
    // Update local broadcast status in TBL_VOICE_BROADCASTS if API confirms it's finished
    if ($broadcast_status === 'completed' || $broadcast_status === 'failed') {
        $pdo->prepare("UPDATE " . TBL_VOICE_BROADCASTS . " SET status = ?, api_response = ? WHERE awaj_broadcast_id = ?")
            ->execute([$broadcast_status, json_encode($data), $broadcast_id]);
    }
    
    if (!$is_complete) {
        echo "Broadcast $broadcast_id is still in progress. Skipping individual logs sync.\n";
        continue;
    }
    
    $results = $data['results'] ?? [];
    if (empty($results)) {
        echo "No individual call details found in response for broadcast $broadcast_id.\n";
        continue;
    }
    
    foreach ($results as $detail) {
        $phone = normalize_bd_phone_11($detail['phoneNumber'] ?? '');
        $status_raw = strtolower($detail['status'] ?? '');
        $duration = (int)($detail['duration'] ?? 0);
        
        if (empty($phone)) continue;
        
        // Map AwajDigital status to local status values
        $mapped_status = 'unknown';
        if ($status_raw === 'answered') $mapped_status = 'answered';
        elseif ($status_raw === 'not_answered') $mapped_status = 'not_answered';
        elseif ($status_raw === 'rejected') $mapped_status = 'rejected';
        elseif ($status_raw === 'busy') $mapped_status = 'busy';
        elseif ($status_raw === 'failed') $mapped_status = 'failed';
        
        // Skip updating if still pending on the API side
        if ($status_raw === 'pending' || $status_raw === 'processing') {
            continue;
        }
        
        // Check if we already updated this log (idempotency check)
        $existing = safeFetch($pdo, "SELECT id, status FROM " . TBL_VOICE_CALL_LOGS . " WHERE broadcast_id=? AND phone=?", [$broadcast_id, $phone]);
        if (!$existing || $existing['status'] !== 'pending') {
            continue; // Already processed or record not found
        }
        
        // Update Call Log record
        $pdo->prepare("UPDATE " . TBL_VOICE_CALL_LOGS . " SET status = ?, duration = ? WHERE id = ?")
            ->execute([$mapped_status, $duration, $existing['id']]);
            
        // Sync with tracker table to schedule retries if necessary
        $track = safeFetch($pdo, "SELECT * FROM " . TBL_VOICE_REMINDER_TRACKING . " WHERE broadcast_id=? AND normalized_phone=?", [$broadcast_id, $phone]);
        
        if ($track) {
            $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET call_status = ? WHERE id = ?")
                ->execute([$mapped_status, $track['id']]);
                
            if ($mapped_status === 'answered') {
                // Call answered! Set tracker status to successfully completed
                $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET status = 'sent' WHERE id = ?")
                    ->execute([$track['id']]);
            } else {
                // Call unanswered / busy / failed. Let's see if we should retry.
                $retry_enabled = get_voice_setting($pdo, $mgr_id, 'voice_retry_enabled');
                $max_attempts = (int)get_voice_setting($pdo, $mgr_id, 'voice_retry_max_attempts') ?: 1;
                $retry_delay = (int)get_voice_setting($pdo, $mgr_id, 'voice_retry_after_minutes') ?: 60;
                
                $current_retry_count = (int)$track['retry_count'] + 1;
                
                if ($retry_enabled == '1' && $current_retry_count < $max_attempts) {
                    $next_retry = date('Y-m-d H:i:s', strtotime("+$retry_delay minutes"));
                    
                    $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET status='failed', retry_count=?, next_retry_at=?, error_message=? WHERE id=?")
                        ->execute([$current_retry_count, $next_retry, "Call status returned: " . $mapped_status, $track['id']]);
                        
                    echo "Scheduled retry attempt #$current_retry_count for client {$track['user_id']} ({$phone}) at $next_retry\n";
                } else {
                    // Permanently failed
                    $pdo->prepare("UPDATE " . TBL_VOICE_REMINDER_TRACKING . " SET status='permanently_failed', retry_count=?, error_message=? WHERE id=?")
                        ->execute([$current_retry_count, "Call failed after maximum retry limit reached. Status: " . $mapped_status, $track['id']]);
                        
                    echo "Call to client {$track['user_id']} ({$phone}) failed permanently. Max retries reached.\n";
                }
            }
        }
    }
    echo "Synchronized details for broadcast $broadcast_id.\n";
}

echo "[" . date('Y-m-d H:i:s') . "] Sync completed.\n";
flock($lock_fp, LOCK_UN);
fclose($lock_fp);
@unlink($lock_file);
