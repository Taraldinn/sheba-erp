<?php
/**
 * controllers/usage_controller.php
 * Handles all AJAX backend actions for the ISP Usage Tracking System.
 */

require_once __DIR__ . '/../classes/MikrotikApp.php';
require_once __DIR__ . '/../classes/UsageEngine.php';

/**
 * Format uptime seconds to human-readable.
 */
if (!function_exists('formatUptime')) {
    function formatUptime($seconds) {
        if ($seconds <= 0) return '0s';
        $days = floor($seconds / 86400);
        $hours = floor(($seconds % 86400) / 3600);
        $mins = floor(($seconds % 3600) / 60);
        
        $out = [];
        if ($days > 0) $out[] = "{$days}d";
        if ($hours > 0) $out[] = "{$hours}h";
        if ($mins > 0) $out[] = "{$mins}m";
        if (empty($out)) $out[] = ($seconds % 60) . 's';
        
        return implode(' ', $out);
    }
}

// Safety check: ensure user is logged in
if (!function_exists('isLoggedIn') || !isLoggedIn()) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Unauthorized access.']);
    exit;
}

// Check authorization (must be Admin, or have 'monitoring' permission, and NOT be a Reseller/Branch)
$curr_role_bu = $_SESSION['user_role'] ?? '';
$is_partner_bu = (strcasecmp($curr_role_bu, 'Reseller') === 0 || strcasecmp($curr_role_bu, 'SubReseller') === 0 || strcasecmp($curr_role_bu, 'Sub-Reseller') === 0);
$is_reseller_branch_bu = ($is_partner_bu || (isOffice() && !isSystemAuthority()));

if ($is_reseller_branch_bu || (!hasRole('Admin') && !hasPermission('monitoring'))) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Forbidden. Access Denied.']);
    exit;
}

header('Content-Type: application/json');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    switch ($action) {
        
        case 'sync_now':
            // Allow up to 5 minutes execution time for sync
            set_time_limit(300);
            
            $routers = safeFetchAll($pdo, "SELECT * FROM " . TBL_ROUTERS);
            $results = [];
            $success_count = 0;
            $failed_count = 0;
            
            foreach ($routers as $r) {
                $res = UsageEngine::syncRouterUsage($pdo, $r);
                if ($res['error']) {
                    $failed_count++;
                    $results[] = [
                        'router_name' => $r['name'],
                        'status' => 'failed',
                        'error' => $res['error']
                    ];
                } else {
                    $success_count++;
                    $results[] = [
                        'router_name' => $r['name'],
                        'status' => 'success',
                        'active_sessions' => $res['active_sessions'],
                        'synced_sessions' => $res['synced_sessions'],
                        'bytes_uploaded' => formatBytes($res['bytes_uploaded']),
                        'bytes_downloaded' => formatBytes($res['bytes_downloaded'])
                    ];
                }
            }
            
            echo json_encode([
                'success' => true,
                'summary' => "Synced $success_count routers successfully, $failed_count failed.",
                'details' => $results
            ]);
            break;
            
        case 'check_router_status':
            $router_id = (int)($_GET['router_id'] ?? 0);
            if ($router_id <= 0) {
                throw new Exception("Invalid Router ID.");
            }
            
            $router = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id = ?", [$router_id]);
            if (!$router) {
                throw new Exception("Router not found.");
            }
            
            $mk = new MikrotikApp($router, 5);
            $online = $mk->isOnline();
            
            echo json_encode([
                'success' => true,
                'online' => $online,
                'router_name' => htmlspecialchars($router['name']),
                'ip_address' => htmlspecialchars($router['ip_address'])
            ]);
            break;

        case 'get_live_usage':
            $router_id = (int)($_GET['router_id'] ?? 0);
            $page = (int)($_GET['page'] ?? 1);
            if ($page < 1) $page = 1;
            $limit = (int)($_GET['limit'] ?? 100);
            if ($limit < 10) $limit = 10;
            if ($limit > 500) $limit = 500;
            
            $search = trim($_GET['search'] ?? '');
            
            // 1. Get live online users through the shared tenant cache.
            // The helper refreshes RouterOS automatically once its cache is older than 8 seconds,
            // so the dashboard's 10-second timer now produces a genuinely fresh sample without
            // requiring the operator to press "Sync Now".
            $cache_file = get_global_online_cache_path();
            $online_data = [];
            $force_refresh = (isset($_GET['force_refresh']) && $_GET['force_refresh'] == 1);

            if (function_exists('get_global_online_users')) {
                // Live dashboard polling must not write session/accounting rows every 10 seconds;
                // the normal session cron remains responsible for those DB writes.
                $online_data = get_global_online_users($pdo, $force_refresh, false, true);
            } else {
                $routers = safeFetchAll($pdo, "SELECT * FROM " . TBL_ROUTERS);
                foreach ($routers as $r) {
                    try {
                        $mk = new MikrotikApp($r, 3);
                        $active = $mk->getOnlineUsers();
                        if (is_array($active)) {
                            foreach ($active as $p) {
                                if (isset($p['name'])) {
                                    $username = $p['name'];
                                    $online_data[$username] = [
                                        'uptime' => $p['uptime'] ?? '00:00:00',
                                        'upload' => (float)($p['bytes-in'] ?? 0),
                                        'download' => (float)($p['bytes-out'] ?? 0),
                                        'address' => $p['address'] ?? '',
                                        'caller_id' => $p['caller-id'] ?? '',
                                        'router_name' => $r['name'],
                                        'router_id' => (int)$r['id']
                                    ];
                                }
                            }
                        }
                    } catch (Throwable $e) {}
                }
            }

            if (!is_array($online_data)) {
                $online_data = [];
            }
            
            // 2. Filter by Router ID
            $filtered_sessions = [];
            foreach ($online_data as $username => $session) {
                $session_router_id = (int)($session['router_id'] ?? 0);
                
                // Fallback: If router_id is not in cache, match by name
                if ($session_router_id <= 0 && $router_id > 0) {
                    // Try to match router name to find router id
                    continue; 
                }
                
                if ($router_id > 0 && $session_router_id !== $router_id) {
                    continue;
                }
                
                $session['username'] = $username;
                $filtered_sessions[] = $session;
            }
            
            // 3. Calculate live speeds from PER-SESSION counter deltas.
            // Do not calculate from one aggregate byte total: when even one PPPoE session
            // reconnects its RouterOS counter resets, which used to make the aggregate delta
            // negative and forced the whole dashboard to 0.00 Mbps.
            clearstatcache(true, $cache_file);
            $cache_payload = [];
            if (file_exists($cache_file)) {
                $cache_payload = json_decode(@file_get_contents($cache_file), true);
                if (!is_array($cache_payload)) $cache_payload = [];
            }
            $cache_meta = (isset($cache_payload['metadata']) && is_array($cache_payload['metadata']))
                ? $cache_payload['metadata'] : [];
            $sample_ts = isset($cache_meta['sampled_at'])
                ? (float)$cache_meta['sampled_at']
                : (float)($cache_meta['updated_at'] ?? (file_exists($cache_file) ? filemtime($cache_file) : microtime(true)));
            $sample_id = (string)($cache_meta['sample_id'] ?? '');
            if ($sample_id === '') {
                $sample_id = 'legacy_' . (string)($cache_meta['updated_at'] ?? (file_exists($cache_file) ? filemtime($cache_file) : time()));
            }

            $rate_tenant = defined('TENANT_OVERRIDE')
                ? TENANT_OVERRIDE
                : (defined('CURRENT_TENANT') ? CURRENT_TENANT : ($_SESSION['tenant_id'] ?? 'main'));
            $rate_tenant = preg_replace('/[^a-zA-Z0-9_-]/', '_', (string)$rate_tenant);
            $rates_file = __DIR__ . '/../cache/traffic_rates_temp_' . $rate_tenant . '.json';
            $rates_data = [];
            if (file_exists($rates_file)) {
                $rates_data = json_decode(@file_get_contents($rates_file), true);
            }
            if (!is_array($rates_data)) $rates_data = [];

            $router_key = 'router_' . $router_id;
            $prev = (isset($rates_data[$router_key]) && is_array($rates_data[$router_key]))
                ? $rates_data[$router_key] : null;
            $down_speed = 0.0;
            $up_speed = 0.0;

            // Build a de-duplicated current session counter map. Cron cache can contain an
            // alias for the same active PPPoE session, so caller-id/address are preferred as
            // the physical session identity and username is the safe fallback.
            $current_rate_sessions = [];
            foreach ($filtered_sessions as $s) {
                $sid_router = (int)($s['router_id'] ?? 0);
                $sid_user = strtolower(trim((string)($s['username'] ?? '')));
                $sid_caller = strtolower(trim((string)($s['caller_id'] ?? '')));
                $sid_addr = trim((string)($s['address'] ?? ''));
                $physical = ($sid_caller !== '' || $sid_addr !== '')
                    ? ($sid_caller . '|' . $sid_addr)
                    : $sid_user;
                $sid = $sid_router . '|' . $physical;
                if ($physical === '') $sid = $sid_router . '|user|' . $sid_user;

                $current_rate_sessions[$sid] = [
                    'download' => max(0.0, (float)($s['download'] ?? 0)),
                    'upload' => max(0.0, (float)($s['upload'] ?? 0))
                ];
            }

            $same_sample = $prev && (($prev['sample_id'] ?? '') === $sample_id);

            // One-time compatibility with the v4.2.3 aggregate baseline. This lets an
            // upgrade produce a useful first rate when the old sample is recent, then the
            // state is immediately migrated to the safer per-session format below.
            $legacy_rate_ready = false;
            if ($prev && !isset($prev['sessions']) && isset($prev['total_download'], $prev['total_upload'], $prev['cache_mtime'])) {
                $legacy_dt = $sample_ts - (float)$prev['cache_mtime'];
                if ($legacy_dt >= 0.5 && $legacy_dt <= 120.0) {
                    $legacy_down_total = 0.0;
                    $legacy_up_total = 0.0;
                    foreach ($current_rate_sessions as $legacy_s) {
                        $legacy_down_total += (float)($legacy_s['download'] ?? 0);
                        $legacy_up_total += (float)($legacy_s['upload'] ?? 0);
                    }
                    $legacy_down_diff = $legacy_down_total - (float)$prev['total_download'];
                    $legacy_up_diff = $legacy_up_total - (float)$prev['total_upload'];
                    if ($legacy_down_diff >= 0 && $legacy_up_diff >= 0) {
                        $down_speed = ($legacy_down_diff * 8) / ($legacy_dt * 1000000);
                        $up_speed = ($legacy_up_diff * 8) / ($legacy_dt * 1000000);
                        $legacy_rate_ready = true;
                    }
                }
            }

            if ($same_sample) {
                // Another tab/request reused the same RouterOS sample: keep the last valid rate
                // instead of appending a false 0 Mbps point.
                $down_speed = (float)($prev['down_speed'] ?? 0.0);
                $up_speed = (float)($prev['up_speed'] ?? 0.0);
            } elseif ($prev && !$legacy_rate_ready) {
                $prev_ts = (float)($prev['sample_ts'] ?? 0);
                $time_diff = $sample_ts - $prev_ts;
                $prev_sessions = (isset($prev['sessions']) && is_array($prev['sessions'])) ? $prev['sessions'] : [];

                // Only calculate a rate for a sane fresh sampling interval. New/reconnected
                // sessions establish a baseline and do not zero the rate of other sessions.
                if ($time_diff >= 0.5 && $time_diff <= 120.0) {
                    $down_diff = 0.0;
                    $up_diff = 0.0;
                    $matched_counter_sessions = 0;

                    foreach ($current_rate_sessions as $sid => $cur) {
                        if (!isset($prev_sessions[$sid]) || !is_array($prev_sessions[$sid])) continue;
                        $old_down = (float)($prev_sessions[$sid]['download'] ?? 0);
                        $old_up = (float)($prev_sessions[$sid]['upload'] ?? 0);
                        $cur_down = (float)$cur['download'];
                        $cur_up = (float)$cur['upload'];

                        // RouterOS counters reset on reconnect. Ignore only that reset session
                        // for this one interval; all other users still contribute to the graph.
                        if ($cur_down >= $old_down) {
                            $down_diff += ($cur_down - $old_down);
                        }
                        if ($cur_up >= $old_up) {
                            $up_diff += ($cur_up - $old_up);
                        }
                        $matched_counter_sessions++;
                    }

                    if ($matched_counter_sessions > 0) {
                        $down_speed = ($down_diff * 8) / ($time_diff * 1000000);
                        $up_speed = ($up_diff * 8) / ($time_diff * 1000000);
                    }
                }
            }

            // Persist the exact fresh sample used above. Atomic rename avoids partial JSON reads
            // if two dashboard tabs are open at the same time.
            if (!$same_sample) {
                $rates_data[$router_key] = [
                    'sample_id' => $sample_id,
                    'sample_ts' => $sample_ts,
                    'sessions' => $current_rate_sessions,
                    'down_speed' => $down_speed,
                    'up_speed' => $up_speed
                ];
                $rates_tmp = $rates_file . '.' . getmypid() . '.' . uniqid('', true) . '.tmp';
                if (@file_put_contents($rates_tmp, json_encode($rates_data)) !== false) {
                    @rename($rates_tmp, $rates_file);
                } else {
                    @unlink($rates_tmp);
                }
            }

            // 4. Apply Search Filtering
            $matched_sessions = [];
            if ($search !== '') {
                $search_lower = strtolower($search);
                
                // Query database users matching search query
                $db_stmt = $pdo->prepare("
                    SELECT id, name, phone, user_id, user_package, status 
                    FROM " . TBL_USERS . " 
                    WHERE LOWER(name) LIKE ? OR phone LIKE ? OR LOWER(user_id) LIKE ? OR LOWER(user_package) LIKE ? OR LOWER(status) LIKE ?
                ");
                $like_query = "%" . $search_lower . "%";
                $db_stmt->execute([$like_query, $like_query, $like_query, $like_query, $like_query]);
                $db_users = $db_stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $db_user_map = [];
                foreach ($db_users as $u) {
                    $db_user_map[strtolower($u['user_id'])] = $u;
                }
                
                foreach ($filtered_sessions as $s) {
                    $u_lower = strtolower($s['username']);
                    $in_db = isset($db_user_map[$u_lower]);
                    $db_user = $in_db ? $db_user_map[$u_lower] : null;
                    
                    $name = $db_user['name'] ?? 'Unmapped PPPoE User';
                    $phone = $db_user['phone'] ?? 'N/A';
                    $package = $db_user['user_package'] ?? 'N/A';
                    $status = $db_user['status'] ?? 'Active';
                    $ip = $s['address'] ?? 'N/A';
                    $mac = $s['caller_id'] ?? 'N/A';
                    
                    if (
                        strpos($u_lower, $search_lower) !== false ||
                        strpos(strtolower($name), $search_lower) !== false ||
                        strpos(strtolower($phone), $search_lower) !== false ||
                        strpos(strtolower($package), $search_lower) !== false ||
                        strpos(strtolower($status), $search_lower) !== false ||
                        strpos(strtolower($ip), $search_lower) !== false ||
                        strpos(strtolower($mac), $search_lower) !== false
                    ) {
                        $s['db_user'] = [
                            'name' => $name,
                            'phone' => $phone,
                            'package' => $package,
                            'status' => $status
                        ];
                        $matched_sessions[] = $s;
                    }
                }
            } else {
                $matched_sessions = $filtered_sessions;
            }
            
            // 5. Paginate
            $total_count = count($matched_sessions);
            $total_pages = ceil($total_count / $limit);
            if ($total_pages < 1) $total_pages = 1;
            if ($page > $total_pages) $page = $total_pages;
            
            $offset = ($page - 1) * $limit;
            $paginated_slice = array_slice($matched_sessions, $offset, $limit);
            
            // 6. Map database details for only the paginated slice
            $response_sessions = [];
            $db_user_map = [];
            
            if ($search === '') {
                $page_usernames = [];
                foreach ($paginated_slice as $s) {
                    $page_usernames[] = strtolower($s['username']);
                }
                
                if (!empty($page_usernames)) {
                    $placeholders = implode(',', array_fill(0, count($page_usernames), '?'));
                    $db_stmt = $pdo->prepare("
                        SELECT id, name, phone, user_id, user_package, status 
                        FROM " . TBL_USERS . " 
                        WHERE LOWER(user_id) IN ($placeholders)
                    ");
                    $db_stmt->execute($page_usernames);
                    $db_users = $db_stmt->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($db_users as $u) {
                        $db_user_map[strtolower($u['user_id'])] = $u;
                    }
                }
            }
            
            foreach ($paginated_slice as $s) {
                $username = $s['username'];
                $u_lower = strtolower($username);
                
                if (isset($s['db_user'])) {
                    $db_user = $s['db_user'];
                } else {
                    $db_user = $db_user_map[$u_lower] ?? null;
                }
                
                $bytes_in = (float)($s['upload'] ?? 0);
                $bytes_out = (float)($s['download'] ?? 0);
                
                $response_sessions[] = [
                    'username' => htmlspecialchars($username),
                    'name' => htmlspecialchars($db_user['name'] ?? 'Unmapped PPPoE User'),
                    'phone' => htmlspecialchars($db_user['phone'] ?? 'N/A'),
                    'ip' => htmlspecialchars($s['address'] ?? 'N/A'),
                    'mac' => htmlspecialchars($s['caller_id'] ?? 'N/A'),
                    'uptime' => htmlspecialchars($s['uptime'] ?? '0s'),
                    'upload_raw' => $bytes_in,
                    'download_raw' => $bytes_out,
                    'upload_formatted' => formatBytes($bytes_in),
                    'download_formatted' => formatBytes($bytes_out),
                    'package' => htmlspecialchars($db_user['user_package'] ?? 'N/A'),
                    'status' => htmlspecialchars($db_user['status'] ?? 'Active'),
                    'router_name' => htmlspecialchars($s['router_name'] ?? 'Unknown')
                ];
            }
            
            echo json_encode([
                'success' => true,
                'count' => count($filtered_sessions),
                'filtered_count' => $total_count,
                'down_speed' => round($down_speed, 2),
                'up_speed' => round($up_speed, 2),
                'sample_id' => $sample_id,
                'sample_time' => $sample_ts,
                'rate_mode' => 'per_session',
                'page' => $page,
                'limit' => $limit,
                'total_pages' => $total_pages,
                'sessions' => $response_sessions
            ]);
            break;

        case 'get_usage_charts':
            $range = $_GET['range'] ?? '7days'; // 7days, 30days
            $limit_days = ($range === '30days') ? 30 : 7;
            
            // Get aggregated traffic grouped by date
            $query = "
                SELECT usage_date, 
                       SUM(upload_bytes) as upload, 
                       SUM(download_bytes) as download 
                FROM " . TBL_USAGE_LOGS . "
                WHERE usage_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                GROUP BY usage_date
                ORDER BY usage_date ASC
            ";
            
            $logs = safeFetchAll($pdo, $query, [$limit_days]);
            
            $labels = [];
            $upload_data = [];
            $download_data = [];
            
            // Initialize array of last N days to prevent empty date gaps
            for ($i = $limit_days - 1; $i >= 0; $i--) {
                $date_str = date('Y-m-d', strtotime("-{$i} days"));
                $labels[$date_str] = date('d M', strtotime($date_str));
                $upload_data[$date_str] = 0;
                $download_data[$date_str] = 0;
            }
            
            foreach ($logs as $row) {
                $date_key = $row['usage_date'];
                if (isset($upload_data[$date_key])) {
                    // Convert bytes to Gigabytes for clean charting
                    $upload_data[$date_key] = round($row['upload'] / 1073741824, 2);
                    $download_data[$date_key] = round($row['download'] / 1073741824, 2);
                }
            }
            
            echo json_encode([
                'success' => true,
                'labels' => array_values($labels),
                'upload' => array_values($upload_data),
                'download' => array_values($download_data)
            ]);
            break;

        case 'get_usage_reports_data':
            $report_type = $_GET['type'] ?? 'history'; // history, top_users, router_wise, customer_summary
            $router_filter = (int)($_GET['router_id'] ?? 0);
            $customer_filter = (int)($_GET['customer_id'] ?? 0);
            $date_from = $_GET['date_from'] ?? date('Y-m-d', strtotime('-30 days'));
            $date_to = $_GET['date_to'] ?? date('Y-m-d');
            
            $params = [];
            $where_clauses = ["l.usage_date BETWEEN ? AND ?"];
            $params[] = $date_from;
            $params[] = $date_to;
            
            if ($router_filter > 0) {
                $where_clauses[] = "l.router_id = ?";
                $params[] = $router_filter;
            }
            if ($customer_filter > 0) {
                $where_clauses[] = "l.customer_id = ?";
                $params[] = $customer_filter;
            }
            
            $where_sql = implode(" AND ", $where_clauses);
            
            if ($report_type === 'history') {
                // Fetch daily detailed logs
                $sql = "
                    SELECT l.*, u.name as client_name, r.name as router_name
                    FROM " . TBL_USAGE_LOGS . " l
                    LEFT JOIN " . TBL_USERS . " u ON l.customer_id = u.id
                    LEFT JOIN " . TBL_ROUTERS . " r ON l.router_id = r.id
                    WHERE {$where_sql}
                    ORDER BY l.usage_date DESC, l.download_bytes DESC
                    LIMIT 2000
                ";
                $data = safeFetchAll($pdo, $sql, $params);
                
                // Format results
                $formatted_data = [];
                $total_up = 0;
                $total_down = 0;
                
                foreach ($data as $row) {
                    $total_up += (float)$row['upload_bytes'];
                    $total_down += (float)$row['download_bytes'];
                    
                    $formatted_data[] = [
                        'date' => date('d M Y', strtotime($row['usage_date'])),
                        'username' => htmlspecialchars($row['username']),
                        'client_name' => htmlspecialchars($row['client_name'] ?? 'Deleted Customer'),
                        'router_name' => htmlspecialchars($row['router_name'] ?? 'N/A'),
                        'upload' => formatBytes($row['upload_bytes']),
                        'download' => formatBytes($row['download_bytes']),
                        'total' => formatBytes($row['upload_bytes'] + $row['download_bytes']),
                        'uptime' => formatUptime($row['uptime_seconds'])
                    ];
                }
                
                echo json_encode([
                    'success' => true,
                    'summary' => [
                        'total_upload' => formatBytes($total_up),
                        'total_download' => formatBytes($total_down),
                        'total_bandwidth' => formatBytes($total_up + $total_down),
                        'total_upload_raw' => $total_up,
                        'total_download_raw' => $total_down
                    ],
                    'records' => $formatted_data
                ]);
                
            } elseif ($report_type === 'top_users') {
                // Fetch highest bandwidth consumers
                $sql = "
                    SELECT l.customer_id, l.username, u.name as client_name, u.user_package,
                           SUM(l.upload_bytes) as total_upload, 
                           SUM(l.download_bytes) as total_download,
                           SUM(l.upload_bytes + l.download_bytes) as total_usage
                    FROM " . TBL_USAGE_LOGS . " l
                    LEFT JOIN " . TBL_USERS . " u ON l.customer_id = u.id
                    WHERE {$where_sql}
                    GROUP BY l.customer_id, l.username, u.name, u.user_package
                    ORDER BY total_usage DESC
                    LIMIT 50
                ";
                
                $data = safeFetchAll($pdo, $sql, $params);
                $formatted_data = [];
                $rank = 1;
                
                foreach ($data as $row) {
                    $formatted_data[] = [
                        'rank' => $rank++,
                        'username' => htmlspecialchars($row['username']),
                        'client_name' => htmlspecialchars($row['client_name'] ?? 'Deleted Customer'),
                        'package' => htmlspecialchars($row['user_package'] ?? 'N/A'),
                        'upload' => formatBytes($row['total_upload']),
                        'download' => formatBytes($row['total_download']),
                        'total' => formatBytes($row['total_usage'])
                    ];
                }
                
                echo json_encode([
                    'success' => true,
                    'records' => $formatted_data
                ]);
                
            } elseif ($report_type === 'router_wise') {
                // Fetch traffic totals grouped by router
                $sql = "
                    SELECT l.router_id, r.name as router_name, r.ip_address,
                           SUM(l.upload_bytes) as total_upload, 
                           SUM(l.download_bytes) as total_download,
                           COUNT(DISTINCT l.customer_id) as unique_users
                    FROM " . TBL_USAGE_LOGS . " l
                    LEFT JOIN " . TBL_ROUTERS . " r ON l.router_id = r.id
                    WHERE {$where_sql}
                    GROUP BY l.router_id, r.name, r.ip_address
                    ORDER BY total_download DESC
                ";
                
                $data = safeFetchAll($pdo, $sql, $params);
                $formatted_data = [];
                
                foreach ($data as $row) {
                    $total = $row['total_upload'] + $row['total_download'];
                    $formatted_data[] = [
                        'router_name' => htmlspecialchars($row['router_name'] ?? 'Deleted Router'),
                        'ip_address' => htmlspecialchars($row['ip_address'] ?? 'N/A'),
                        'unique_users' => (int)$row['unique_users'],
                        'upload' => formatBytes($row['total_upload']),
                        'download' => formatBytes($row['total_download']),
                        'total' => formatBytes($total)
                    ];
                }
                
                echo json_encode([
                    'success' => true,
                    'records' => $formatted_data
                ]);
            }
            break;
            
        default:
            throw new Exception("Action not recognized.");
    }
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}
exit;
