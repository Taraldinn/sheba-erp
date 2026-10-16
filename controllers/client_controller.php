<?php
// controllers/client_controller.php
// --- CUSTOMER PANEL CONTROLLER & ROUTER ---

$client_id = $_SESSION['client_id'] ?? 0;
$client_logged_in = isset($_SESSION['client_logged_in']) && $_SESSION['client_logged_in'] === true;

// --- TENANT SESSION ISOLATION GUARD ---
$expected_tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
$session_tenant = $_SESSION['client_tenant_id'] ?? '';
if ($client_logged_in && $session_tenant !== $expected_tenant) {
    unset($_SESSION['client_logged_in']);
    unset($_SESSION['client_id']);
    unset($_SESSION['client_name']);
    unset($_SESSION['client_user_id']);
    unset($_SESSION['client_tenant_id']);
    $client_logged_in = false;
    $client_id = 0;
}

$tab = $_GET['tab'] ?? 'dashboard';

// --- CSRF VERIFICATION GUARD ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $is_login = isset($_POST['client_login']);
    if (!$is_login) {
        $token = $_POST['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (empty($token) || !hash_equals(get_csrf_token(), $token)) {
            $is_ajax = isset($_GET['ajax']) || isset($_POST['ajax']) || (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest');
            if ($is_ajax) {
                header('Content-Type: application/json');
                echo json_encode(['success' => false, 'message' => 'CSRF verification failed. Please refresh the page and try again.']);
            } else {
                echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>CSRF verification failed. Please go back, reload the page, and try again.</div></div>";
            }
            exit;
        }
    }
}

// 1. Handle Client Auth
if (!$client_logged_in) {
    // Run auto-migration check for self_care_password column
    try {
        $cols = $pdo->query("DESCRIBE ".TBL_USERS)->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('self_care_password', $cols)) {
            $pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN self_care_password VARCHAR(255) DEFAULT NULL");
        }
    } catch(Exception $e) {}

    if (isset($_POST['client_login'])) {
        $username = trim($_POST['username'] ?? ''); // PPPOE ID
        $password = trim($_POST['password'] ?? ''); // Password
        
        if ($username && $password !== '') {
            $stmt = $pdo->prepare("SELECT id, name, user_id, phone, self_care_password FROM ".TBL_USERS." WHERE user_id=? LIMIT 1");
            $stmt->execute([$username]);
            $u = $stmt->fetch();
            
            if ($u) {
                $authenticated = false;
                $is_first_login = false;
                
                if (!empty($u['self_care_password'])) {
                    if (strpos($u['self_care_password'], '$2y$') === 0) {
                        $authenticated = password_verify($password, $u['self_care_password']);
                    } else {
                        $authenticated = ($password === $u['self_care_password']);
                        if ($authenticated) {
                            $new_hash = password_hash($password, PASSWORD_BCRYPT);
                            $up_stmt = $pdo->prepare("UPDATE ".TBL_USERS." SET self_care_password=? WHERE id=?");
                            $up_stmt->execute([$new_hash, $u['id']]);
                        }
                    }
                } else {
                    // No self_care_password set yet -> check default (phone)
                    if ($password === $u['phone']) {
                        $authenticated = true;
                        $is_first_login = true;
                    }
                }
                
                if ($authenticated) {
                    session_regenerate_id(true);
                    $_SESSION['client_logged_in'] = true;
                    $_SESSION['client_id'] = $u['id'];
                    $_SESSION['client_name'] = $u['name'];
                    $_SESSION['client_user_id'] = $u['user_id'];
                    $_SESSION['client_tenant_id'] = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
                    
                    if ($is_first_login) {
                        $_SESSION['must_change_password'] = true;
                        header("Location: ?panel=client&tab=change_password");
                    } else {
                        header("Location: ?panel=client&tab=dashboard");
                    }
                    exit;
                } else {
                    $login_error = "Invalid PPPoE ID or Password.";
                }
            } else {
                $login_error = "Invalid PPPoE ID or Password.";
            }
        } else {
            $login_error = "Both fields are required.";
        }
    }
    
    require_once __DIR__ . '/../views/client/login.php';
    exit;
}

// --- LOGOUT HANDLER ---
if ($tab === 'logout') {
    unset($_SESSION['client_logged_in']);
    unset($_SESSION['client_id']);
    unset($_SESSION['client_name']);
    unset($_SESSION['client_user_id']);
    unset($_SESSION['must_change_password']);
    header("Location: ?panel=client&tab=login");
    exit;
}

// 2. Load Client Data
$c = safeFetch($pdo, "SELECT u.*, r.name as r_name FROM ".TBL_USERS." u LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id WHERE u.id=?", [$client_id]);
if (!$c) {
    echo "Account not found.";
    exit;
}

// Force first-time password change guard
if (isset($_SESSION['must_change_password']) && $_SESSION['must_change_password'] === true) {
    if ($tab !== 'change_password' && $tab !== 'logout') {
        header("Location: ?panel=client&tab=change_password");
        exit;
    }
}



// --- FUN BOX LIVE TV API PROXY ---
// The Live TV API key stays on Sheba-Fi. Client browsers receive only catalog
// metadata and a short-lived signed stream URL when the user presses Play.
if ($tab === 'funbox' && isset($_GET['livetv_api'])) {
    while (ob_get_level() > 0) { @ob_end_clean(); }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    $tv_cfg = get_live_tv_config($pdo);
    if (empty($tv_cfg['enabled'])) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Live TV is disabled by administrator.']);
        exit;
    }
    if (empty($tv_cfg['api_url']) || empty($tv_cfg['api_key'])) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Live TV is not configured yet.']);
        exit;
    }

    $action = strtolower(trim((string)$_GET['livetv_api']));
    $remote = null;

    if ($action === 'categories') {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'GET is required for categories.']);
            exit;
        }
        $remote = live_tv_api_request($pdo, 'categories');
    } elseif ($action === 'channels') {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'GET is required for channels.']);
            exit;
        }
        $params = [
            'page' => max(1, (int)($_GET['page'] ?? 1)),
            'limit' => min(100, max(1, (int)($_GET['limit'] ?? 40))),
        ];
        $category_id = max(0, (int)($_GET['category_id'] ?? 0));
        if ($category_id > 0) $params['category_id'] = $category_id;
        $remote = live_tv_api_request($pdo, 'channels', $params);
    } elseif ($action === 'search') {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'GET is required for search.']);
            exit;
        }
        $keyword = trim((string)($_GET['keyword'] ?? ''));
        if ($keyword === '') {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Search keyword is required.']);
            exit;
        }
        $keyword = function_exists('mb_substr') ? mb_substr($keyword, 0, 120) : substr($keyword, 0, 120);
        $remote = live_tv_api_request($pdo, 'search', ['keyword' => $keyword]);
    } elseif ($action === 'play') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'POST is required for playback.']);
            exit;
        }
        $channel_id = max(0, (int)($_POST['id'] ?? 0));
        if ($channel_id <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Invalid Live TV channel.']);
            exit;
        }
        $remote = live_tv_api_request($pdo, 'channels/' . $channel_id);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Unknown Live TV API action.']);
        exit;
    }

    $status = (int)($remote['http_status'] ?? 0);
    if ($status < 100 || $status > 599) $status = $remote['ok'] ? 200 : 502;
    http_response_code($status);

    if (!is_array($remote['json'])) {
        echo json_encode(['success' => false, 'message' => $remote['message'] ?? 'Live TV API request failed.']);
        exit;
    }

    $payload = $remote['json'];
    // Channel lists do not need signed playback URLs until the viewer presses
    // Play. Removing them keeps catalog responses smaller and avoids stale URLs.
    if (($action === 'channels' || $action === 'search') && !empty($payload['data']) && is_array($payload['data'])) {
        foreach ($payload['data'] as &$channel) {
            if (is_array($channel)) unset($channel['stream_url']);
        }
        unset($channel);
    }
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// --- FUN BOX MOVIE SERVER API PROXY ---
// The Movie Server API key never reaches the browser. Logged-in clients call this
// same-origin proxy, and Sheba-Fi forwards only whitelisted API operations.
if ($tab === 'funbox' && isset($_GET['funbox_api'])) {
    while (ob_get_level() > 0) { @ob_end_clean(); }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    $movie_cfg = get_movie_server_config($pdo);
    if (empty($movie_cfg['enabled'])) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Movie Server is disabled by administrator.']);
        exit;
    }
    if (empty($movie_cfg['api_url']) || empty($movie_cfg['api_key'])) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Movie Server is not configured yet.']);
        exit;
    }

    $action = strtolower(trim((string)$_GET['funbox_api']));
    $get_actions = ['home', 'categories', 'ott-platforms', 'filters', 'contents', 'movies', 'series', 'search', 'details'];

    if ($action === 'play') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'POST is required for playback.']);
            exit;
        }
        $kind = (($_POST['kind'] ?? 'movie') === 'episode') ? 'episode' : 'movie';
        $content_id = (int)($_POST['id'] ?? 0);
        if ($content_id <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Invalid video selection.']);
            exit;
        }
        $remote = movie_server_api_request($pdo, 'play', [], 'POST', [
            'kind' => $kind,
            'id' => $content_id,
            // Always bind playback to the authenticated PPPoE/customer username.
            'user_id' => (string)$c['user_id'],
        ]);
    } elseif (in_array($action, $get_actions, true)) {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'GET is required for this request.']);
            exit;
        }
        $params = [];
        if (isset($_GET['id'])) $params['id'] = max(0, (int)$_GET['id']);
        if (isset($_GET['ott_id'])) $params['ott_id'] = max(0, (int)$_GET['ott_id']);
        if (isset($_GET['category_id'])) $params['category_id'] = max(0, (int)$_GET['category_id']);
        if (isset($_GET['type']) && in_array($_GET['type'], ['movie','series'], true)) $params['type'] = $_GET['type'];
        if (isset($_GET['language'])) { $v=trim((string)$_GET['language']); if($v!=='') $params['language']=function_exists('mb_substr')?mb_substr($v,0,60):substr($v,0,60); }
        foreach (['year','year_from','year_to'] as $yk) { if (isset($_GET[$yk])) { $yv=(int)$_GET[$yk]; if($yv>=1900 && $yv<=2100) $params[$yk]=$yv; } }
        foreach (['date','date_from','date_to'] as $dk) { if (isset($_GET[$dk]) && preg_match('/^\d{4}-\d{2}-\d{2}$/',(string)$_GET[$dk])) $params[$dk]=(string)$_GET[$dk]; }
        if (isset($_GET['sort']) && in_array($_GET['sort'], ['latest','oldest','year_desc','year_asc','title_asc','title_desc','popular'], true)) $params['sort']=$_GET['sort'];
        if (isset($_GET['page'])) $params['page'] = max(1, (int)$_GET['page']);
        if (isset($_GET['limit'])) $params['limit'] = min(50, max(1, (int)$_GET['limit']));
        if (isset($_GET['q'])) { $raw_q = trim((string)$_GET['q']); $params['q'] = function_exists('mb_substr') ? mb_substr($raw_q, 0, 120) : substr($raw_q, 0, 120); }
        $remote = movie_server_api_request($pdo, $action, $params, 'GET');
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Unknown Fun Box API action.']);
        exit;
    }

    $status = (int)($remote['http_status'] ?? 0);
    if ($status < 100 || $status > 599) $status = $remote['ok'] ? 200 : 502;
    http_response_code($status);
    if (is_array($remote['json'])) {
        echo json_encode($remote['json'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode(['success' => false, 'message' => $remote['message'] ?? 'Movie Server request failed.']);
    }
    exit;
}

// --- PASSWORD CHANGE HANDLER ---
if ($tab === 'change_password') {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['change_pass'])) {
        $new_pass = trim($_POST['new_pass'] ?? '');
        $confirm_pass = trim($_POST['confirm_pass'] ?? '');
        
        $current_check_passed = true;
        if (!isset($_SESSION['must_change_password']) || $_SESSION['must_change_password'] !== true) {
            $current_pass = trim($_POST['current_pass'] ?? '');
            if (!empty($c['self_care_password'])) {
                if (strpos($c['self_care_password'], '$2y$') === 0) {
                    $current_check_passed = password_verify($current_pass, $c['self_care_password']);
                } else {
                    $current_check_passed = ($current_pass === $c['self_care_password']);
                }
            } else {
                $current_check_passed = ($current_pass === $c['phone']);
            }
            if (!$current_check_passed) {
                $pass_error = "Current password is incorrect.";
            }
        }
        
        if ($current_check_passed) {
            if (strlen($new_pass) < 4) {
                $pass_error = "Password must be at least 4 characters long.";
            } elseif ($new_pass !== $confirm_pass) {
                $pass_error = "New passwords do not match.";
            } else {
                // Update the self_care_password column in database with secure bcrypt hash
                $new_hash = password_hash($new_pass, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare("UPDATE ".TBL_USERS." SET self_care_password=? WHERE id=?");
                $stmt->execute([$new_hash, $client_id]);
                
                // Clear the must_change_password flag
                if (isset($_SESSION['must_change_password'])) {
                    unset($_SESSION['must_change_password']);
                }
                
                $_SESSION['flash_msg'] = "Password changed successfully!";
                header("Location: ?panel=client&tab=dashboard");
                exit;
            }
        }
    }
}

// Common queries for dashboard widgets and full history
$invoices = safeFetchAll($pdo, "SELECT * FROM ".TBL_LOGS." WHERE target_id=? AND action_type IN ('Recharge', 'Add Client', 'Extend Service', 'Pay Due') ORDER BY timestamp DESC", [$client_id]);
$invoices_recent = array_slice($invoices, 0, 5); // Dashboard widget: last 5 only

// --- TICKET HANDLER ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['category'])) {
    $category = $_POST['category'] ?? '';
    $message = $_POST['message'] ?? '';
    if ($category && $message) {
        try {
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $stmt = $pdo->prepare("INSERT INTO tickets (client_id, category, message, status) VALUES (?, ?, ?, 'Open')");
            $stmt->execute([$client_id, $category, $message]);
            $_SESSION['flash_msg'] = "Ticket created successfully!";
            header("Location: /?panel=client&tab=ticket");
            exit;
        } catch (PDOException $e) {
            // Check if missing table error (42S02 is MySQL code)
            if ($e->getCode() === '42S02' || strpos($e->getMessage(), "doesn't exist") !== false || strpos($e->getMessage(), "not found") !== false) {
                try {
                    // Create tickets table
                    $pdo->exec("CREATE TABLE IF NOT EXISTS tickets (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT, category VARCHAR(100), message TEXT, status VARCHAR(20) DEFAULT 'Open', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
                    // Retry query
                    $stmt = $pdo->prepare("INSERT INTO tickets (client_id, category, message, status) VALUES (?, ?, ?, 'Open')");
                    $stmt->execute([$client_id, $category, $message]);
                    $_SESSION['flash_msg'] = "Ticket created successfully!";
                    header("Location: /?panel=client&tab=ticket");
                    exit;
                } catch (Exception $ex) {
                    $ticket_error = "Self-healing failed to create table: " . $ex->getMessage();
                }
            } else {
                $ticket_error = "Database Error: " . $e->getMessage();
            }
        }
    } else {
        $ticket_error = "Please fill all fields.";
    }
}

// Client Ticket Rating / Feedback Handler
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['client_ticket_rating'])) {
    $ticket_id = (int)($_POST['ticket_id'] ?? 0);
    $rating = max(1, min(5, (int)($_POST['rating'] ?? 0)));
    $comment = trim((string)($_POST['rating_comment'] ?? ''));
    $ticket = safeFetch($pdo, "SELECT id,status,rating FROM tickets WHERE id=? AND client_id=?", [$ticket_id, $client_id]);
    if (!$ticket) {
        $ticket_error = 'Ticket not found.';
    } elseif (!in_array($ticket['status'], ['Solved','Closed'], true)) {
        $ticket_error = 'You can rate a ticket after it is solved or closed.';
    } elseif (!empty($ticket['rating'])) {
        $ticket_error = 'This ticket has already been rated.';
    } else {
        $pdo->prepare("UPDATE tickets SET rating=?, rating_comment=?, rated_at=NOW() WHERE id=? AND client_id=?")
            ->execute([$rating, $comment, $ticket_id, $client_id]);
        $_SESSION['flash_msg'] = 'Thank you. Your support rating was submitted.';
        header('Location: /?panel=client&tab=ticket&ticket_id=' . $ticket_id);
        exit;
    }
}

// Client Reply Handler
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['ticket_id'])) {
    $ticket_id = intval($_POST['ticket_id'] ?? 0);
    $message = trim($_POST['message'] ?? '');
    
    if ($ticket_id > 0 && $message !== '') {
        try {
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $stmt = $pdo->prepare("INSERT INTO ticket_replies (ticket_id, sender_type, sender_id, message) VALUES (?, 'Client', ?, ?)");
            $stmt->execute([$ticket_id, $client_id, $message]);
            
            $pdo->prepare("UPDATE tickets SET status='Open' WHERE id=?")->execute([$ticket_id]);
            $_SESSION['flash_msg'] = "Reply sent successfully!";
            header("Location: /?panel=client&tab=ticket&ticket_id=" . $ticket_id);
            exit;
        } catch (PDOException $e) {
            if ($e->getCode() === '42S02' || strpos($e->getMessage(), "doesn't exist") !== false || strpos($e->getMessage(), "not found") !== false) {
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS ticket_replies (id INT AUTO_INCREMENT PRIMARY KEY, ticket_id INT, sender_type VARCHAR(20) NOT NULL, sender_id INT NOT NULL, message TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
                    
                    $stmt = $pdo->prepare("INSERT INTO ticket_replies (ticket_id, sender_type, sender_id, message) VALUES (?, 'Client', ?, ?)");
                    $stmt->execute([$ticket_id, $client_id, $message]);
                    
                    $pdo->prepare("UPDATE tickets SET status='Open' WHERE id=?")->execute([$ticket_id]);
                    $_SESSION['flash_msg'] = "Reply sent successfully!";
                    header("Location: /?panel=client&tab=ticket&ticket_id=" . $ticket_id);
                    exit;
                } catch (Exception $ex) {
                    $ticket_error = "Self-healing failed: " . $ex->getMessage();
                }
            } else {
                $ticket_error = "Database Error: " . $e->getMessage();
            }
        }
    } else {
        $ticket_error = "Reply cannot be empty.";
    }
}

// Single Ticket View
$view_ticket = null;
$replies = [];
if (isset($_GET['ticket_id'])) {
    $tid = intval($_GET['ticket_id']);
    $view_ticket = safeFetch($pdo, "SELECT * FROM tickets WHERE id=? AND client_id=?", [$tid, $client_id]);
    if ($view_ticket) {
        // Updated Query using (sender_type, sender_id)
        $replies = safeFetchAll($pdo, "SELECT r.*, s.name as staff_name 
                                        FROM ticket_replies r 
                                        LEFT JOIN ".TBL_STAFF." s ON r.sender_id = s.id AND r.sender_type = 'Staff' 
                                        WHERE r.ticket_id=? 
                                        ORDER BY r.created_at ASC", [$tid]);
    }
}

$tickets = safeFetchAll($pdo, "SELECT * FROM tickets WHERE client_id=? ORDER BY created_at DESC", [$client_id]);

// --- AJAX BW SPEED RELAY FOR CLIENT ---

if (isset($_GET['ajax_client_ping'])) {
    header('Content-Type: application/json');
    $result = ['success' => false, 'error' => 'Not connected to MikroTik'];
    if ($c && $c['router_id'] > 0) {
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$c['router_id']]);
        if($r) {
            $mk = new MikrotikApp($r, 5);
            $stats = $mk->stats($c['user_id']);
            $target_ip = $stats['ip'] ?: ($c['assigned_ip'] ?? '');
            
            if (!empty($target_ip)) {
                $ping_res = $mk->ping($target_ip, 15); // User requested minimum 15
                if (is_array($ping_res)) {
                    $html = '<div class="table-responsive" style="max-height: 250px;"><table class="table table-sm table-bordered small mb-0">
                                <thead class="bg-light sticky-top">
                                    <tr><th>Seq</th><th>TTL</th><th>Time</th><th>Status</th></tr>
                                </thead>
                                <tbody>';
                    $success_count = 0;
                    foreach ($ping_res as $p) {
                        $status = $p['status'] ?? 'timeout';
                        $is_ok = ($status == 'received' || !isset($p['status']));
                        if($is_ok) $success_count++;
                        $color = $is_ok ? 'text-success' : 'text-danger';
                        $html .= "<tr>
                                    <td>".($p['seq']??'-')."</td>
                                    <td>".($p['ttl']??'-')."</td>
                                    <td>".($p['time']??'-')."</td>
                                    <td class='$color fw-bold'>".ucfirst($status)."</td>
                                  </tr>";
                    }
                    $html .= '</tbody></table></div>';
                    $summary = "<div class='mt-2 small fw-bold'>Sent: ".count($ping_res).", Received: $success_count, Loss: ".(count($ping_res)-$success_count)."</div>";
                    $result = ['success' => true, 'html' => $html . $summary, 'ip' => $target_ip];
                } else {
                    $result['error'] = $ping_res;
                }
            } else {
                $result['error'] = "No active IP found. Please connect to the internet first.";
            }
        }
    }
    echo json_encode($result);
    exit;
}

if (isset($_GET['ajax_client_trace'])) {
    header('Content-Type: application/json');
    $result = ['success' => false, 'error' => 'Not connected to MikroTik'];
    if ($c && $c['router_id'] > 0) {
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$c['router_id']]);
        if($r) {
            $mk = new MikrotikApp($r, 10);
            $stats = $mk->stats($c['user_id']);
            $target_ip = $stats['ip'] ?: ($c['assigned_ip'] ?? '');
            
            if (!empty($target_ip)) {
                $trace_res = $mk->traceroute($target_ip);
                if (is_array($trace_res)) {
                    $html = '<div class="table-responsive"><table class="table table-sm table-bordered small mb-0">
                                <thead class="bg-light">
                                    <tr><th>Hop</th><th>Address</th><th>Loss</th><th>Sent</th><th>Avg</th></tr>
                                </thead>
                                <tbody>';
                    foreach ($trace_res as $t) {
                        $html .= "<tr>
                                    <td>".($t['hop']??'-')."</td>
                                    <td>".($t['address']??'-')."</td>
                                    <td>".($t['loss']??'0')."%</td>
                                    <td>".($t['sent']??'-')."</td>
                                    <td>".($t['avg']??'-')."</td>
                                  </tr>";
                    }
                    $html .= '</tbody></table></div>';
                    $result = ['success' => true, 'html' => $html, 'ip' => $target_ip];
                } else {
                    $result['error'] = $trace_res;
                }
            } else {
                $result['error'] = "No active IP found.";
            }
        }
    }
    echo json_encode($result);
    exit;
}

// --- AJAX BANDWIDTH & STATUS RELAY FOR CLIENT ---
if (isset($_GET['ajax_client_bw'])) {
    header('Content-Type: application/json');
    $result = [
        'status' => 'offline',
        'up_speed' => 0,
        'down_speed' => 0,
        'uptime' => '00:00:00'
    ];
    
    if ($c && $c['router_id'] > 0) {
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$c['router_id']]);
        if ($r) {
            require_once __DIR__ . '/../classes/MikrotikApp.php';
            $mk = new MikrotikApp($r, 2);
            $bw = $mk->traffic($c['user_id'], true);
            if ($bw && $bw['status'] === 'online') {
                $result = array_merge($result, $bw);
            } else {
                // Second check fallback
                $stats = $mk->stats($c['user_id']);
                if ($stats && $stats['online']) {
                    $result['status'] = 'online';
                    $result['ip'] = $stats['ip'] ?? '';
                    $result['mac'] = $stats['mac'] ?? '';
                }
            }
        }
    }
    
    while (ob_get_level() > 0) ob_end_clean();
    echo json_encode($result);
    exit;
}

// --- MIKROTIK GRAPH PROXY ---
if (isset($_GET['ajax_client_graph'])) {
    $type = $_GET['type'] ?? 'daily'; // daily, weekly, monthly
    if ($c && $c['router_id'] > 0) {
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$c['router_id']]);
        if($r) {
            $username = $c['user_id'];
            $patterns = [$username, "<pppoe-" . $username . ">", "pppoe-" . $username, "pppoe_" . $username];
            
            $img = null;
            $found = false;
            foreach ($patterns as $iface) {
                $url = "http://".$r['ip_address']."/graphs/iface/".urlencode($iface)."/".$type.".gif";
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
                curl_setopt($ch, CURLOPT_TIMEOUT, 5);
                $img = curl_exec($ch);
                $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                
                if ($http_code == 200 && $img && strlen($img) > 100) { // Check size to avoid empty gifs
                    $found = true;
                    break;
                }
            }
            if ($found) {
                header("Content-Type: image/gif");
                echo $img;
                exit;
            }
        }
    }
    header("Content-Type: image/gif");
    echo base64_decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
    exit;
}

// Route based on Tab
if ($tab === 'dashboard') {
    require_once __DIR__ . '/../views/client/dashboard.php';
} elseif ($tab === 'pay_bill') {
    require_once __DIR__ . '/../views/client/pay_bill.php';
} elseif ($tab === 'payment_history') {
    require_once __DIR__ . '/../views/client/payment_history.php';
} elseif ($tab === 'recharge_invoice') {
    require_once __DIR__ . '/../views/client/recharge_invoice.php';
} elseif ($tab === 'ticket') {
    require_once __DIR__ . '/../views/client/tickets.php';
} elseif ($tab === 'report') {
    require_once __DIR__ . '/../views/client/report.php';
} elseif ($tab === 'funbox') {
    require_once __DIR__ . '/../views/client/funbox.php';
} elseif ($tab === 'change_password') {
    require_once __DIR__ . '/../views/client/change_password.php';
} elseif ($tab === 'payment_verification') {
    require_once __DIR__ . '/../views/client/payment_verification.php';
} else {
    require_once __DIR__ . '/../views/client/dashboard.php';
}

