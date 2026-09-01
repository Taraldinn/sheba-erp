<?php
/**
 * cron/process_router_sync.php
 * Background Router Sync worker.
 * Redesigned for cPanel/WHM with batch processing, connection reuse, and CPU yielding.
 */

// Parse CLI arguments
$tenant = '';
$job_id = 0;

if (isset($argv)) {
    foreach ($argv as $arg) {
        if (strpos($arg, '--tenant=') === 0) {
            $tenant = substr($arg, 9);
        }
        if (strpos($arg, '--job_id=') === 0) {
            $job_id = intval(substr($arg, 9));
        }
    }
}

if (!empty($tenant)) {
    define('TENANT_OVERRIDE', preg_replace('/[^a-zA-Z0-9-]/', '', $tenant));
}

// Check lock file to prevent concurrent cron runs for the same tenant
$tenant_name_clean = preg_replace('/[^a-zA-Z0-9-]/', '', $tenant ?: 'main');
$lock_dir = __DIR__ . '/../tmp';
if (!is_dir($lock_dir)) {
    @mkdir($lock_dir, 0755, true);
}
$lock_file = $lock_dir . '/process_router_sync_' . $tenant_name_clean . '.lock';
$lock_fp = fopen($lock_file, 'c');
if (!$lock_fp || !flock($lock_fp, LOCK_EX | LOCK_NB)) {
    // Already running for this tenant, exit silently
    exit;
}

// Boot application config & functions
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/MikrotikApp.php';

// Enable error logging for cron
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../debug_mikrotik_sync_cron.log');

// Helper function for fast in-memory expiry check
function is_client_expired_fast($client, $staff_map, $admin_expire_time) {
    if (isset($client['promise_enabled']) && $client['promise_enabled'] == 1 && !empty($client['promise_date'])) {
        $today = date('Y-m-d');
        if ($client['promise_date'] >= $today) {
            return false;
        }
    }

    $today = date('Y-m-d');
    $current_time = date('H:i:s');
    $expiry_date = $client['current_bill_date'] ?? null;
    
    if (!$expiry_date) return false;
    if ($expiry_date < $today) return true;
    if ($expiry_date > $today) return false;
    
    // If it's today, check target time
    $manager_id = (int)($client['manager_id'] ?? 0);
    $target_time = '23:59:59';
    
    if ($manager_id > 0 && isset($staff_map[$manager_id])) {
        $mgr = $staff_map[$manager_id];
        if (strcasecmp($mgr['role'] ?? '', 'Admin') === 0 || strcasecmp($mgr['role'] ?? '', 'Super Admin') === 0) {
            $target_time = $admin_expire_time;
        } else {
            $target_time = $mgr['expire_time'] ?: '23:59:59';
        }
    }
    
    return $current_time > $target_time;
}

$start_time = microtime(true);
$max_execution_time = 45; // Yield after 45 seconds to prevent PHP timeouts on shared hosting
$batch_size = 200;

try {
    // 1. Transactional check to find and lock a job to process
    $pdo->beginTransaction();
    
    $job = null;
    if ($job_id > 0) {
        $stmt = $pdo->prepare("SELECT * FROM router_sync_jobs WHERE id = ? FOR UPDATE");
        $stmt->execute([$job_id]);
        $job = $stmt->fetch(PDO::FETCH_ASSOC);
    } else {
        // Find oldest queued job, or a running job that timed out (not updated for > 10 minutes)
        $stmt = $pdo->query("
            SELECT * FROM router_sync_jobs 
            WHERE status = 'queued' 
               OR (status = 'running' AND updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
            ORDER BY id ASC 
            LIMIT 1 FOR UPDATE
        ");
        $job = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    if (!$job || in_array($job['status'], ['completed', 'failed'])) {
        $pdo->rollBack();
        exit; // No active/pending job
    }

    $job_id = intval($job['id']);
    $router_id = intval($job['router_id']);

    // Check database-level lock to prevent concurrent cron executions for the same router and tenant
    $lock_name = 'router_sync_lock_' . DB_NAME . '_' . $router_id;
    $lock_stmt = $pdo->prepare("SELECT GET_LOCK(?, 0)");
    $lock_stmt->execute([$lock_name]);
    $lock_acquired = $lock_stmt->fetchColumn();

    if ($lock_acquired != 1) {
        // Lock already held by another cron process. Roll back and exit.
        $pdo->rollBack();
        exit;
    }

    // Update job status to running and record start time
    $stmt = $pdo->prepare("UPDATE router_sync_jobs SET status = 'running', started_at = IFNULL(started_at, NOW()), updated_at = NOW() WHERE id = ?");
    $stmt->execute([$job_id]);
    $pdo->commit();

    // 2. Fetch Router Details
    $router = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id = ?", [$router_id]);
    if (!$router) {
        $pdo->prepare("UPDATE router_sync_jobs SET status = 'failed', error_message = 'Router not found.', updated_at = NOW() WHERE id = ?")->execute([$job_id]);
        exit;
    }

    // 3. Connect to MikroTik (Connection Reuse)
    $mk = new MikrotikApp($router, 15);
    if (!$mk->isOnline()) {
        $err = $mk->error ?? 'Router is offline or credentials invalid.';
        $pdo->prepare("UPDATE router_sync_jobs SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?")->execute([$err, $job_id]);
        exit;
    }

    // 4. Pre-fetch mappings to avoid N+1 queries
    // Fetch packages/services
    $services = safeFetchAll($pdo, "SELECT name, mikrotik_profile_name FROM " . TBL_SERVICES);
    $services_map = [];
    foreach ($services as $s) {
        $services_map[strtolower(trim($s['name']))] = trim($s['mikrotik_profile_name']);
    }

    // Fetch staff managers
    $staff = safeFetchAll($pdo, "SELECT id, expire_time, role FROM " . TBL_STAFF);
    $staff_map = [];
    foreach ($staff as $st) {
        $staff_map[$st['id']] = $st;
    }

    // Fetch admin expire time
    $admin_expire_time = get_opt($pdo, 'admin_expire_time', '23:59:59');

    // 5. Pre-fetch all secrets and active sessions from MikroTik in BULK
    $raw_secrets = $mk->getSecrets();
    $mikrotik_secrets = [];
    foreach ($raw_secrets as $s) {
        if (isset($s['name'])) {
            $mikrotik_secrets[$s['name']] = $s;
        }
    }

    $raw_active = $mk->getClient() ? ($mk->getClient()->query(new RouterOS\Query('/ppp/active/print'))->read()) : [];
    $active_sessions = [];
    if (is_array($raw_active)) {
        foreach ($raw_active as $act) {
            if (isset($act['name'])) {
                $active_sessions[$act['name']][] = $act;
            }
        }
    }

    // 6. Setup Pagination
    $last_processed_id = intval($job['last_processed_id']);
    $processed_count = intval($job['processed_clients']);
    $failed_count = intval($job['failed_clients']);
    $total_clients = intval($job['total_clients']);

    $yielded = false;

    // 7. Process clients in batches
    while (true) {
        // Check if we are approaching execution timeout limit
        $elapsed = microtime(true) - $start_time;
        if ($elapsed >= $max_execution_time) {
            $yielded = true;
            break;
        }

        // Keyset pagination: Fetch clients with id > last_processed_id
        $clients = safeFetchAll($pdo, "
            SELECT * FROM " . TBL_USERS . " 
            WHERE (router_id = ? OR router_id = 0 OR router_id IS NULL) 
              AND id > ? 
            ORDER BY id ASC 
            LIMIT " . intval($batch_size) . "
        ", [$router_id, $last_processed_id]);

        if (empty($clients)) {
            break; // No more clients to process
        }

        $batch_processed = 0;
        $batch_failed = 0;
        $expired_ids = [];
        $max_id_in_batch = $last_processed_id;

        foreach ($clients as $client) {
            $max_id_in_batch = max($max_id_in_batch, intval($client['id']));
            
            try {
                // Auto-assign router_id if it is 0 or null
                if (intval($client['router_id']) === 0 || $client['router_id'] === null) {
                    $pdo->prepare("UPDATE " . TBL_USERS . " SET router_id = ? WHERE id = ?")->execute([$router_id, $client['id']]);
                    $client['router_id'] = $router_id;
                }

                // Check expired status in memory
                $is_expired = is_client_expired_fast($client, $staff_map, $admin_expire_time);
                if ($is_expired && in_array($client['status'], ['Active', 'Promise Active'])) {
                    $expired_ids[] = $client['id'];
                    $client['status'] = 'Expire';
                }

                // Resolve target profile name
                $profile_name = 'default';
                if (!empty(trim($client['user_package']))) {
                    $pkg_key = strtolower(trim($client['user_package']));
                    if (isset($services_map[$pkg_key]) && !empty($services_map[$pkg_key])) {
                        $profile_name = $services_map[$pkg_key];
                    } else {
                        $profile_name = trim($client['user_package']);
                    }
                }

                // Desired state
                $status = trim($client['status']);
                $is_active = (strcasecmp($status, 'Active') === 0 || strcasecmp($status, 'Free') === 0 || strcasecmp($status, 'Promise Active') === 0);
                $enable = $is_active && !$is_expired;

                $client_pass = !empty($client['password']) ? $client['password'] : $client['user_id'];
                $username = $client['user_id'];

                // Compare with MikroTik in-memory secrets list
                if (!isset($mikrotik_secrets[$username])) {
                    // Secret does not exist -> ADD secret
                    $q = new RouterOS\Query('/ppp/secret/add');
                    $q->equal('name', $username)
                      ->equal('password', $client_pass)
                      ->equal('service', 'pppoe')
                      ->equal('profile', $profile_name)
                      ->equal('disabled', $enable ? 'no' : 'yes');
                    $mk->getClient()->query($q)->read();
                } else {
                    // Secret exists -> Check if SET is needed
                    $exist = $mikrotik_secrets[$username];
                    $mt_disabled = $exist['disabled'] ?? 'false';
                    $desired_disabled = $enable ? 'false' : 'true';
                    $mt_profile = $exist['profile'] ?? '';
                    $mt_password = $exist['password'] ?? '';

                    $needs_update = ($mt_disabled !== $desired_disabled) || 
                                    ($mt_profile !== $profile_name) || 
                                    ($mt_password !== $client_pass);

                    if ($needs_update) {
                        $q = new RouterOS\Query('/ppp/secret/set');
                        $q->equal('.id', $exist['.id'])
                          ->equal('disabled', $enable ? 'no' : 'yes')
                          ->equal('profile', $profile_name)
                          ->equal('password', $client_pass);
                        $mk->getClient()->query($q)->read();
                    }
                }

                // Force disconnect active session if user is disabled or expired
                if (!$enable && isset($active_sessions[$username])) {
                    foreach ($active_sessions[$username] as $act_item) {
                        if (isset($act_item['.id'])) {
                            $mk->getClient()->query((new RouterOS\Query('/ppp/active/remove'))->equal('.id', $act_item['.id']))->read();
                        }
                    }
                }

                $batch_processed++;
            } catch (Exception $client_ex) {
                error_log("MikroTik Router Sync: failed for client {$client['user_id']} - " . $client_ex->getMessage());
                $batch_failed++;
            }
        }

        // Apply bulk DB update for expired clients in this batch
        if (!empty($expired_ids)) {
            $placeholders = implode(',', array_fill(0, count($expired_ids), '?'));
            $pdo->prepare("UPDATE " . TBL_USERS . " SET status = 'Expire', bill_position = 'Expire', promise_enabled = 0, promise_date = NULL WHERE id IN ($placeholders)")->execute($expired_ids);
        }

        // Update progress in database
        $processed_count += $batch_processed;
        $failed_count += $batch_failed;
        $last_processed_id = $max_id_in_batch;
        
        $progress = ($total_clients > 0) ? round(($processed_count + $failed_count) / $total_clients * 100) : 100;
        $progress = min(100, max(0, $progress));

        $stmt = $pdo->prepare("
            UPDATE router_sync_jobs 
            SET processed_clients = ?, 
                failed_clients = ?, 
                last_processed_id = ?, 
                progress = ?, 
                updated_at = NOW() 
            WHERE id = ?
        ");
        $stmt->execute([$processed_count, $failed_count, $last_processed_id, $progress, $job_id]);

        // Yield CPU
        usleep(50000); // 50ms pause
    }

    // 8. Update final job status
    if ($yielded) {
        // Paused because of script execution time limit. Let next cron resume.
        $pdo->prepare("UPDATE router_sync_jobs SET status = 'queued', updated_at = NOW() WHERE id = ?")->execute([$job_id]);
    } else {
        // Sync completed successfully
        $pdo->prepare("UPDATE router_sync_jobs SET status = 'completed', progress = 100, updated_at = NOW() WHERE id = ?")->execute([$job_id]);
        
        // Write audit log
        $router_name = $router['name'] ?? "Router ID {$router_id}";
        writeLog($pdo, 'System', 'Router Sync Completed', $router_id, "Background sync completed for router: {$router_name}. Processed: {$processed_count}, Failed: {$failed_count}.");
    }

} catch (Exception $e) {
    error_log("General Router Sync worker error: " . $e->getMessage());
    if (isset($job_id) && $job_id > 0) {
        try {
            $pdo->prepare("UPDATE router_sync_jobs SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?")->execute([$e->getMessage(), $job_id]);
        } catch (Exception $sec_ex) {}
    }
}
