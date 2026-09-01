<?php
/**
 * cron/sync_sessions.php
 * Synchronizes active MikroTik sessions with the local database.
 * Run this via crontab every 1-5 minutes.
 */

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
require_once __DIR__ . '/../classes/MikrotikApp.php';

// 1. Overlap Guard
$tenant_name = defined('TENANT_OVERRIDE') ? TENANT_OVERRIDE : 'main';
$cache_dir = __DIR__ . '/../cache';
if (!is_dir($cache_dir)) {
    @mkdir($cache_dir, 0777, true);
}
$cron_lock_file = $cache_dir . '/sync_sessions_' . $tenant_name . '.lock';
if (file_exists($cron_lock_file) && (time() - filemtime($cron_lock_file) < 300)) { // 5 minutes lock
    echo "[" . date('Y-m-d H:i:s') . "] Sync session already in progress for tenant: $tenant_name. Exiting.\n";
    exit;
}
@file_put_contents($cron_lock_file, time());

// register shutdown function to delete lock file on completion/fatal error
register_shutdown_function(function() use ($cron_lock_file) {
    @unlink($cron_lock_file);
});

// Enable error logging for cron
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../debug_cron.log');

echo "[" . date('Y-m-d H:i:s') . "] Starting Session Sync...\n";

// Auto-delete Password Mismatch logs that have been solved and are older than 24 hours
try {
    $pdo->exec("DELETE FROM " . TBL_LOGS . " WHERE action_type = 'Password Mismatch' AND description LIKE '%(Solved)%' AND timestamp < DATE_SUB(NOW(), INTERVAL 24 HOUR)");
} catch (Exception $e) {
    error_log("Password Mismatch Logs Cleanup Error: " . $e->getMessage());
}

// Auto-maintain Free Clients: Bill = 0, never expire (auto credit recharge)
try {
    $pdo->exec("UPDATE " . TBL_USERS . " SET bill_amount = 0, current_bill_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY) WHERE status = 'Free' AND bill_position = 'Free' AND (bill_amount != 0 OR current_bill_date <= DATE_ADD(CURDATE(), INTERVAL 5 DAY))");
} catch(Exception $e) {
    error_log("Free Client Auto-Maintain Error: " . $e->getMessage());
}

// Check TBL_USERS columns dynamically to support alternative identifier columns
$user_cols = [];
try {
    $q_cols = $pdo->query("SHOW COLUMNS FROM " . TBL_USERS);
    while ($col = $q_cols->fetch(PDO::FETCH_ASSOC)) {
        $user_cols[] = strtolower($col['Field']);
    }
} catch (Exception $e) {
    $user_cols = ['id', 'user_id', 'status', 'user_package', 'password', 'assigned_ip', 'onu_mac'];
}

$global_online_users = [];
$sync_failed = false;
$routers = safeFetchAll($pdo, "SELECT * FROM " . TBL_ROUTERS);

foreach ($routers as $r) {
    echo "Processing Router: {$r['name']} ({$r['ip_address']})...\n";
    
    try {
        $mk = new MikrotikApp($r, 10);
        if (!$mk->isOnline()) {
            throw new Exception("Could not connect to Mikrotik router (IP: {$r['ip_address']})");
        }

        // PRE-EMPTIVE EXPIRY: Check all clients on this router who should be expired
        $expired_candidates = safeFetchAll($pdo, "SELECT id, user_id, password, user_package, current_bill_date, manager_id, promise_enabled, promise_date FROM " . TBL_USERS . " WHERE router_id = ? AND status IN ('Active', 'Promise Active') AND (current_bill_date <= ? OR promise_date <= ?)", [$r['id'], date('Y-m-d'), date('Y-m-d')]);
        foreach ($expired_candidates as $ec) {
            if (is_client_expired($ec, $pdo)) {
                $pdo->prepare("UPDATE " . TBL_USERS . " SET status = 'Expire', bill_position = 'Expire', promise_enabled = 0, promise_date = NULL WHERE id = ?")->execute([$ec['id']]);
                $svc = safeFetch($pdo, "SELECT mikrotik_profile_name FROM " . TBL_SERVICES . " WHERE name = ?", [$ec['user_package']]);
                $profile_name = $svc ? $svc['mikrotik_profile_name'] : $ec['user_package'];
                $mk->toggle($ec['user_id'], false, $profile_name, $ec['password']);
                echo "  ! Pre-emptive Expiry: {$ec['user_id']}\n";
                writeLog($pdo, 'System', 'Auto Expire', $ec['id'], "Client {$ec['user_id']} expired (pre-emptive check).");
            }
        }
        // AUTO-ADD/ENABLE ACTIVE USERS: Ensure active database users exist on the router and are enabled
        $active_db_users = safeFetchAll($pdo, "SELECT * FROM " . TBL_USERS . " WHERE router_id = ? AND status IN ('Active', 'Free', 'Promise Active')", [$r['id']]);
        if (!empty($active_db_users)) {
            // Fetch all secrets from Mikrotik to check existence/status
            $secrets = $mk->getSecrets();
            $secrets_map = [];
            if (is_array($secrets)) {
                foreach ($secrets as $sec) {
                    if (isset($sec['name'])) {
                        $secrets_map[strtolower(trim($sec['name']))] = $sec;
                    }
                }
            }
            
            foreach ($active_db_users as $db_user) {
                // Ensure they are not expired
                $is_expired = is_client_expired($db_user, $pdo);
                if ($is_expired) {
                    // If expired, update status in DB and disable on router
                    $pdo->prepare("UPDATE " . TBL_USERS . " SET status = 'Expire', bill_position = 'Expire', promise_enabled = 0, promise_date = NULL WHERE id = ?")->execute([$db_user['id']]);
                    
                    // Resolve profile name robustly
                    $profile_name = 'default';
                    if (!empty(trim($db_user['user_package']))) {
                        $svc = safeFetch($pdo, "SELECT mikrotik_profile_name FROM " . TBL_SERVICES . " WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [$db_user['user_package']]);
                        if ($svc && !empty(trim($svc['mikrotik_profile_name']))) {
                            $profile_name = trim($svc['mikrotik_profile_name']);
                        } else {
                            $profile_name = trim($db_user['user_package']);
                        }
                    }
                    
                    $mk->toggle($db_user['user_id'], false, $profile_name, $db_user['password']);
                    continue;
                }
                
                $username_lower = strtolower(trim($db_user['user_id']));
                $exists = isset($secrets_map[$username_lower]);
                
                $is_disabled = false;
                if ($exists) {
                    $mt_sec = $secrets_map[$username_lower];
                    $is_disabled = (isset($mt_sec['disabled']) && ($mt_sec['disabled'] === 'true' || $mt_sec['disabled'] === true || strcasecmp((string)$mt_sec['disabled'], 'yes') === 0));
                }
                
                // If they don't exist on MikroTik, or exist but are disabled, add/enable them!
                if (!$exists || $is_disabled) {
                    // Resolve profile name robustly
                    $profile_name = 'default';
                    if (!empty(trim($db_user['user_package']))) {
                        $svc = safeFetch($pdo, "SELECT mikrotik_profile_name FROM " . TBL_SERVICES . " WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [$db_user['user_package']]);
                        if ($svc && !empty(trim($svc['mikrotik_profile_name']))) {
                            $profile_name = trim($svc['mikrotik_profile_name']);
                        } else {
                            $profile_name = trim($db_user['user_package']);
                        }
                    }
                    
                    $client_pass = !empty($db_user['password']) ? $db_user['password'] : false;
                    $mk->toggle($db_user['user_id'], true, $profile_name, $client_pass);
                    echo "  + Auto-Sync Active Client: {$db_user['user_id']} (Profile: $profile_name)\n";
                }
            }
        }
        
        $active_mk = $mk->getOnlineUsers();
        if (empty($active_mk)) {
            echo "  - No active sessions found in Router.\n";
            // Close all active sessions in DB for this router - save final usage totals
            $pdo->prepare("UPDATE " . TBL_SESSIONS . " 
                SET status = 'closed', 
                    ended_at = NOW(),
                    total_rx_bytes = GREATEST(0, last_rx_bytes - start_rx_bytes),
                    total_tx_bytes = GREATEST(0, last_tx_bytes - start_tx_bytes)
                WHERE router_id = ? AND status = 'active'")->execute([$r['id']]);
            continue;
        }
        
        echo "  - Found " . count($active_mk) . " active sessions. Syncing...\n";
        
        $mk_usernames = [];
        $synced_count = 0;
        
        foreach ($active_mk as $session) {
            $username = $session['name'] ?? null;
            if (!$username) continue;
            
            // Find client from DB using dynamic alternative username columns
            $where_clauses = ["user_id = ?"];
            $params = [$username];
            if (in_array('pppoe_username', $user_cols)) {
                $where_clauses[] = "pppoe_username = ?";
                $params[] = $username;
            }
            if (in_array('mikrotik_username', $user_cols)) {
                $where_clauses[] = "mikrotik_username = ?";
                $params[] = $username;
            }
            if (in_array('username', $user_cols)) {
                $where_clauses[] = "username = ?";
                $params[] = $username;
            }
            
            $sql = "SELECT id, user_id, status, user_package, password, current_bill_date, manager_id, promise_enabled, promise_date FROM " . TBL_USERS . " WHERE " . implode(" OR ", $where_clauses) . " LIMIT 1";
            $client = safeFetch($pdo, $sql, $params);
            
            $matched_username = $client ? $client['user_id'] : $username;
            $mk_usernames[] = $matched_username;
            
            $session_data = [
                'uptime' => $session['uptime'] ?? '00:00:00',
                'upload' => (float)($session['bytes-in'] ?? 0),
                'download' => (float)($session['bytes-out'] ?? 0),
                'address' => $session['address'] ?? '',
                'caller_id' => $session['caller-id'] ?? '',
                'router_name' => $r['name'],
                'router_id' => (int)$r['id']
            ];
            
            // Map under matched database user_id
            $global_online_users[$matched_username] = $session_data;
            // If the matched username is different from raw active session username, store raw as an alias
            if ($matched_username !== $username) {
                $global_online_users[$username] = $session_data;
            }
            
            if ($client) {
                // AUTO-EXPIRE: If still Active but expiry has passed, mark as Expire
                if (in_array($client['status'], ['Active', 'Promise Active']) && is_client_expired($client, $pdo)) {
                    $client['status'] = 'Expire'; // Update local status for the next check
                    $pdo->prepare("UPDATE " . TBL_USERS . " SET status = 'Expire', bill_position = 'Expire', promise_enabled = 0, promise_date = NULL WHERE id = ?")->execute([$client['id']]);
                    echo "  ! Client Auto-Expired: {$matched_username}\n";
                    writeLog($pdo, 'System', 'Auto Expire', $client['id'], "Client {$matched_username} found online but past expiry. Auto-Expired.");
                }

                // Strictly disable Expired/Left clients found online
                if ($client['status'] === 'Expire' || $client['status'] === 'Left') {
                    $svc = safeFetch($pdo, "SELECT mikrotik_profile_name FROM " . TBL_SERVICES . " WHERE name = ?", [$client['user_package']]);
                    $profile_name = $svc ? $svc['mikrotik_profile_name'] : $client['user_package'];
                    $mk->toggle($matched_username, false, $profile_name, $client['password']);
                    echo "  ! Force Disabled Offline/Expired Client: {$matched_username}\n";
                    // Still sync the final session bytes before closing
                }

                $res = $mk->syncSession(
                    $pdo, 
                    $client['id'], 
                    $r['id'], 
                    $matched_username, 
                    (float)($session['bytes-in'] ?? 0), 
                    (float)($session['bytes-out'] ?? 0), 
                    $session['uptime'] ?? '00:00:00'
                );
                if ($res) $synced_count++;
            }
        }
        
        echo "  - Synced $synced_count sessions.\n";
        
        // Close sessions that are marked 'active' in our DB but were NOT seen in the current Mikrotik list
        if (!empty($mk_usernames)) {
            $placeholders = implode(',', array_fill(0, count($mk_usernames), '?'));
            $sql = "UPDATE " . TBL_SESSIONS . " 
                    SET status = 'closed', 
                        ended_at = NOW(),
                        total_rx_bytes = GREATEST(0, last_rx_bytes - start_rx_bytes),
                        total_tx_bytes = GREATEST(0, last_tx_bytes - start_tx_bytes)
                    WHERE router_id = ? AND status = 'active' AND mikrotik_username NOT IN ($placeholders)";
            $params = array_merge([$r['id']], $mk_usernames);
            $pdo->prepare($sql)->execute($params);
            $closed_count = $pdo->query("SELECT ROW_COUNT()")->fetchColumn();
            if ($closed_count > 0) echo "  - Closed $closed_count offline sessions (with usage totals saved).\n";
        }
        
    } catch (Exception $e) {
        error_log("Cron Sync Error (Router {$r['id']}): " . $e->getMessage());
        echo "  - Error: " . $e->getMessage() . "\n";
    }
}

// Write to cache file
if (!$sync_failed) {
    try {
        $cache_file = get_global_online_cache_path();
        $cache_dir = dirname($cache_file);
        if (!is_dir($cache_dir)) {
            @mkdir($cache_dir, 0777, true);
        }
        
        $cache_content = [
            'metadata' => [
                'updated_at' => time(),
                'source' => 'cron',
                'count' => count($global_online_users)
            ],
            'data' => $global_online_users
        ];
        
        $temp_file = $cache_file . '.' . uniqid('', true) . '.tmp';
        if (file_put_contents($temp_file, json_encode($cache_content)) !== false) {
            if (rename($temp_file, $cache_file)) {
                echo "  - Updated online users cache file: $cache_file (" . count($global_online_users) . " users)\n";
            } else {
                throw new Exception("Failed to rename temp cache file to: $cache_file");
            }
        } else {
            throw new Exception("Failed to write to temp cache file: $temp_file");
        }
    } catch (Exception $cache_ex) {
        error_log("Cron Cache Update Error: " . $cache_ex->getMessage());
        echo "  - Cache Update Error: " . $cache_ex->getMessage() . "\n";
    }
} else {
    echo "  - Skipping cache write due to router API sync failure. Existing cache preserved.\n";
}

echo "[" . date('Y-m-d H:i:s') . "] Sync Complete.\n";
?>
