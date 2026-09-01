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
            
            // 1. Get cached online users
            $cache_file = get_global_online_cache_path();
            $online_data = [];
            $force_refresh = (isset($_GET['force_refresh']) && $_GET['force_refresh'] == 1);
            
            if (!$force_refresh && file_exists($cache_file)) {
                $cache_raw = json_decode(file_get_contents($cache_file), true);
                $online_data = isset($cache_raw['data']) ? $cache_raw['data'] : $cache_raw;
            }
            
            if (empty($online_data) || $force_refresh) {
                // Run optimized local sync
                if (function_exists('get_global_online_users')) {
                    $online_data = get_global_online_users($pdo, true);
                } else {
                    $online_data = [];
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
                    @file_put_contents($cache_file, json_encode($online_data));
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
            
            // 3. Calculate Aggregate Live Speeds (Mbps)
            $total_download_bytes = 0;
            $total_upload_bytes = 0;
            foreach ($filtered_sessions as $s) {
                $total_download_bytes += (float)($s['download'] ?? 0);
                $total_upload_bytes += (float)($s['upload'] ?? 0);
            }
            
            $cache_mtime = file_exists($cache_file) ? filemtime($cache_file) : time();
            
            $rates_file = __DIR__ . '/../cache/traffic_rates_temp.json';
            $rates_data = [];
            if (file_exists($rates_file)) {
                $rates_data = json_decode(@file_get_contents($rates_file), true);
            }
            if (!is_array($rates_data)) $rates_data = [];
            
            $router_key = "router_" . $router_id;
            $prev = $rates_data[$router_key] ?? null;
            $down_speed = 0.0;
            $up_speed = 0.0;
            
            if ($prev && isset($prev['cache_mtime']) && isset($prev['total_download'])) {
                $prev_mtime = (int)$prev['cache_mtime'];
                if ($cache_mtime !== $prev_mtime) {
                    $time_diff = $cache_mtime - $prev_mtime;
                    if ($time_diff > 0.5) {
                        $down_diff = $total_download_bytes - (float)$prev['total_download'];
                        $up_diff = $total_upload_bytes - (float)$prev['total_upload'];
                        if ($down_diff >= 0 && $up_diff >= 0) {
                            $down_speed = ($down_diff * 8) / ($time_diff * 1000000); // Mbps
                            $up_speed = ($up_diff * 8) / ($time_diff * 1000000); // Mbps
                        }
                    }
                } else {
                    // Cache has not updated (same mtime), preserve the last calculated rates
                    $down_speed = (float)($prev['down_speed'] ?? 0.0);
                    $up_speed = (float)($prev['up_speed'] ?? 0.0);
                }
            }
            
            // Update rates cache only if cache file was updated or first calculation
            if (!$prev || $cache_mtime !== (int)($prev['cache_mtime'] ?? 0)) {
                $rates_data[$router_key] = [
                    'cache_mtime' => $cache_mtime,
                    'total_download' => $total_download_bytes,
                    'total_upload' => $total_upload_bytes,
                    'down_speed' => $down_speed,
                    'up_speed' => $up_speed
                ];
                @file_put_contents($rates_file, json_encode($rates_data));
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
