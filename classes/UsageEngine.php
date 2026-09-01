<?php
/**
 * classes/UsageEngine.php
 * Core bandwidth usage tracking and calculation engine.
 */

class UsageEngine {
    
    /**
     * Synchronize PPPoE bandwidth usage for a specific router.
     * 
     * @param PDO $pdo SCOped database connection (ensuring tenant isolation)
     * @param array $router Router database record
     * @return array Sync statistics
     */
    public static function syncRouterUsage($pdo, $router) {
        $stats = [
            'router_name' => $router['name'],
            'status' => 'Offline',
            'active_sessions' => 0,
            'synced_sessions' => 0,
            'bytes_uploaded' => 0,
            'bytes_downloaded' => 0,
            'error' => null
        ];

        // 1. Establish MikroTik API Connection
        $max_attempts = 2;
        $mk = null;
        for ($attempt = 1; $attempt <= $max_attempts; $attempt++) {
            $mk = new MikrotikApp($router, 5);
            if ($mk->isOnline()) {
                break;
            }
            usleep(500000); // Wait 0.5s before retry
        }

        if (!$mk || !$mk->isOnline()) {
            $stats['error'] = "Failed to connect after {$max_attempts} attempts. " . ($mk->error ?? '');
            self::logRouterStatus($pdo, $router['id'], 'offline', $stats['error']);
            return $stats;
        }

        $stats['status'] = 'Online';
        self::logRouterStatus($pdo, $router['id'], 'online');

        // 2. Fetch Active PPPoE Sessions
        $active_users = $mk->getOnlineUsers();
        if (empty($active_users)) {
            return $stats; // No online sessions
        }

        $stats['active_sessions'] = count($active_users);

        // 3. Pre-fetch all local customers in a batch to avoid querying one-by-one (Performance Optimization)
        // Table TBL_USERS maps to 'users'
        $customers_raw = safeFetchAll($pdo, "SELECT id, user_id FROM " . TBL_USERS . " WHERE router_id = ? OR router_id IS NULL OR router_id = 0", [$router['id']]);
        $customer_map = [];
        foreach ($customers_raw as $c) {
            $customer_map[strtolower($c['user_id'])] = $c['id'];
        }

        // 4. Pre-fetch all baseline logs for this router (Performance Optimization)
        $baselines_raw = safeFetchAll($pdo, "SELECT customer_id, last_bytes_in, last_bytes_out, last_uptime FROM " . TBL_USAGE_LAST . " WHERE router_id = ?", [$router['id']]);
        $baselines = [];
        foreach ($baselines_raw as $b) {
            $baselines[$b['customer_id']] = $b;
        }

        // Get Tenant Name if in Tenant Context
        $tenant_id = defined('CURRENT_TENANT') ? CURRENT_TENANT : null;
        $today = date('Y-m-d');

        // 5. Process Active Sessions in a single transaction for efficiency
        $pdo->beginTransaction();
        try {
            // Prepared statements for batch processing
            $stmt_insert_last = $pdo->prepare("
                INSERT INTO " . TBL_USAGE_LAST . " 
                (customer_id, username, router_id, last_bytes_in, last_bytes_out, last_uptime) 
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    last_bytes_in = VALUES(last_bytes_in), 
                    last_bytes_out = VALUES(last_bytes_out), 
                    last_uptime = VALUES(last_uptime)
            ");

            $stmt_insert_log = $pdo->prepare("
                INSERT INTO " . TBL_USAGE_LOGS . " 
                (tenant_id, customer_id, username, router_id, usage_date, upload_bytes, download_bytes, uptime_seconds) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    upload_bytes = upload_bytes + VALUES(upload_bytes), 
                    download_bytes = download_bytes + VALUES(download_bytes), 
                    uptime_seconds = VALUES(uptime_seconds)
            ");

            foreach ($active_users as $session) {
                $username = $session['name'] ?? null;
                if (!$username) continue;

                $username_lower = strtolower($username);
                if (!isset($customer_map[$username_lower])) {
                    continue; // PPPoE user is not registered in local billing users table
                }

                $customer_id = $customer_map[$username_lower];
                $uptime_str = $session['uptime'] ?? '0s';
                $uptime = MikrotikApp::parseUptime($uptime_str);
                
                // bytes-in = client upload (rx from router perspective)
                // bytes-out = client download (tx from router perspective)
                $bytes_in = (float)($session['bytes-in'] ?? 0);
                $bytes_out = (float)($session['bytes-out'] ?? 0);

                $upload_diff = 0;
                $download_diff = 0;

                if (!isset($baselines[$customer_id])) {
                    // Scenario A: First-time sync or new session baseline
                    $stmt_insert_last->execute([
                        $customer_id,
                        $username,
                        $router['id'],
                        $bytes_in,
                        $bytes_out,
                        $uptime
                    ]);
                    // No usage diff on first calculation (acts as baseline)
                } else {
                    // Scenario B: Baseline exists
                    $last = $baselines[$customer_id];
                    $last_uptime = (int)$last['last_uptime'];
                    $last_bytes_in = (float)$last['last_bytes_in'];
                    $last_bytes_out = (float)$last['last_bytes_out'];

                    // Check for Reconnect, Reboot, or Counter Reset
                    // Margins are added to prevent noise (e.g. 5-second uptime shift, or counter fluctuations)
                    $reconnect = ($uptime < ($last_uptime - 5)) 
                              || ($bytes_in < $last_bytes_in) 
                              || ($bytes_out < $last_bytes_out);

                    if ($reconnect) {
                        // User reconnected or counter reset. Entire current bytes-in/out is new usage.
                        $upload_diff = $bytes_in;
                        $download_diff = $bytes_out;
                    } else {
                        // Normal ongoing session. Calculate incremental difference.
                        $upload_diff = $bytes_in - $last_bytes_in;
                        $download_diff = $bytes_out - $last_bytes_out;
                    }

                    // Prevent noise or edge-case negative errors
                    $upload_diff = max(0.0, $upload_diff);
                    $download_diff = max(0.0, $download_diff);

                    // If usage exists, insert/update usage log
                    if ($upload_diff > 0 || $download_diff > 0) {
                        $stmt_insert_log->execute([
                            $tenant_id,
                            $customer_id,
                            $username,
                            $router['id'],
                            $today,
                            (int)$upload_diff,
                            (int)$download_diff,
                            $uptime
                        ]);
                        $stats['bytes_uploaded'] += $upload_diff;
                        $stats['bytes_downloaded'] += $download_diff;
                    }

                    // Update baseline record with current values
                    $stmt_insert_last->execute([
                        $customer_id,
                        $username,
                        $router['id'],
                        $bytes_in,
                        $bytes_out,
                        $uptime
                    ]);
                }

                $stats['synced_sessions']++;
            }

            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            $stats['error'] = "Transaction failed: " . $e->getMessage();
            error_log("Sync Router Usage Transaction Error (Router {$router['id']}): " . $e->getMessage());
        }

        return $stats;
    }

    /**
     * Logs router connection status or error to settings/audit log.
     */
    private static function logRouterStatus($pdo, $router_id, $status, $error_msg = '') {
        try {
            // Update router status setting or router record if required
            // Let's store router log in TBL_LOGS
            if ($status === 'offline') {
                $stmt = $pdo->prepare("
                    SELECT timestamp FROM " . TBL_LOGS . " 
                    WHERE target_id = ? AND action_type = 'Router Offline' 
                    ORDER BY id DESC LIMIT 1
                ");
                $stmt->execute([$router_id]);
                $last_log = $stmt->fetch();
                
                // Only log offline every 15 minutes to avoid cluttering the audit log
                if (!$last_log || (time() - strtotime($last_log['timestamp']) > 900)) {
                    $pdo->prepare("
                        INSERT INTO " . TBL_LOGS . " (staff_id, admin_user, action_type, target_id, description) 
                        VALUES (0, 'System', 'Router Offline', ?, ?)
                    ")->execute([$router_id, "Router API Connection Failed: " . substr($error_msg, 0, 200)]);
                }
            }
        } catch (Exception $e) {
            error_log("Failed to log router status: " . $e->getMessage());
        }
    }
}
