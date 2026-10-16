<?php
// --- CONTROLLER ---
// --- CONTROLLER ---
if (!empty($_POST)) {
    $masked_post = mask_sensitive_data($_POST);
    $masked_get = mask_sensitive_data($_GET);
    safe_log('debug_post', "POST DATA: " . json_encode($masked_post) . " | GET: " . json_encode($masked_get) . " | User: " . ($_SESSION['admin_id'] ?? 'NONE') . " | Role: " . ($_SESSION['user_role'] ?? 'NONE') . " | hasSubReseller: " . (hasRole('SubReseller') ? 'YES' : 'NO'));
}
// --- TENANT SESSION ISOLATION GUARD ---
if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    $expected_tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
    
    // Upgrade tenant_id once if missing but user is otherwise valid
    if (!isset($_SESSION['tenant_id'])) {
        $_SESSION['tenant_id'] = $expected_tenant;
    }
    
    $session_tenant = $_SESSION['tenant_id'];
    if ($session_tenant !== $expected_tenant) {
        // Real tenant mismatch: destroy session and clear remember-me cookies
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();
        
        // Clear remember-me cookies to prevent auto-login loop
        if (isset($_COOKIE['remember_uid'])) {
            setcookie('remember_uid', '', time() - 3600, '/');
        }
        if (isset($_COOKIE['remember_token'])) {
            setcookie('remember_token', '', time() - 3600, '/');
        }
        
        // Redirect to login page with clear reason
        header("Location: index.php?error=" . urlencode("Session expired due to tenant context switch. Please login again."));
        exit;
    }
}

// --- CSRF VERIFICATION GUARD ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $tab = $_GET['tab'] ?? '';
    $action = $_GET['action'] ?? $_POST['action'] ?? '';
    $is_public = ($tab === 'payment_callback' || isset($_GET['bkash_callback']) || isset($_GET['nagad_callback']) || isset($_GET['payment_callback']) || isset($_GET['sslcz_callback']) || $action === 'piprapay_webhook');
    $is_auth = (isset($_POST['login']) || isset($_POST['reset_request']) || isset($_POST['reset_password_action']) || $action === 'reset_password' || $action === 'forgot_password');
    
    if (!$is_public && !$is_auth) {
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

// Router secrets are never embedded in page HTML. Only a tenant Admin may
// retrieve them through this CSRF-protected, audited endpoint.
if (isset($_POST['reveal_router_credentials'])) {
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    if (!isLoggedIn() || !hasRole('Admin')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Admin access is required.']);
        exit;
    }
    $routerId = (int)($_POST['router_id'] ?? 0);
    $router = safeFetch($pdo, "SELECT id, name, username, api_password, port FROM ".TBL_ROUTERS." WHERE id=? LIMIT 1", [$routerId]);
    if (!$router) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Router not found.']);
        exit;
    }
    writeLog($pdo, $_SESSION['admin_username'] ?? 'Admin', 'Reveal Router Credential', $routerId, "Router API credentials were revealed for {$router['name']}.");
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode([
        'success' => true,
        'router' => [
            'id' => (int)$router['id'],
            'name' => (string)$router['name'],
            'username' => (string)$router['username'],
            'api_password' => (string)$router['api_password'],
            'port' => (string)$router['port'],
        ],
    ]);
    exit;
}

$user = $_SESSION['admin_id'] ?? 0;
$role = $_SESSION['user_role'] ?? '';
$my_router_id = 0;

// --- BACKEND PERMISSION CHECK FOR OFFICE STAFF ---
if (isOffice() && !hasRole('Admin')) {
    $post_permission_map = [
        'add_client'                  => 'add_client',
        'recharge'                    => 'recharge',
        'extend_service'              => 'clients_active',
        'toggle_service'              => 'clients_active',
        'edit_user_full'              => 'client_edit',
        'quick_edit_pppoe'            => 'clients_active',
        'quick_change_package'        => 'client_change_package',
        'set_promise_date'            => 'client_promise_date',
        'save_client_router_details'  => 'clients_active',
        'make_left_confirm'           => 'clients_left',
        'permanent_delete_client'     => 'clients_left',
        'bulk_recharge'               => 'recharge',
        'bulk_extend'                 => 'clients_active',
        'bulk_disable'                => 'clients_active',
        'bulk_enable'                 => 'clients_active',
        'bulk_left'                   => 'clients_left',
        'bulk_delete'                 => 'clients_left',
        
        'add_zone'                    => 'config',
        'add_tj'                      => 'config',
        'edit_tj'                     => 'config',
        
        'create_offer'                => 'offers',
        
        'create_office_staff'         => 'office_staff',
        'edit_office_staff'           => 'office_staff',
        'toggle_staff_lock'           => 'office_staff',
        
        'add_agent'                   => 'manage_agents',
        'edit_agent'                  => 'manage_agents',
        
        'create_staff'                => 'resellers',
        'edit_staff'                  => 'resellers',
        
        'add_router'                  => 'routers_olt',
        'edit_router'                 => 'routers_olt',
        'quick_import'                => 'routers_olt',
        'add_olt'                     => 'routers_olt',
        'edit_olt'                    => 'routers_olt',
        'delete_olt'                  => 'routers_olt',
        'reboot_onu'                  => 'routers_olt',
        
        'add_service'                 => 'packages',
        'edit_service'                => 'packages',
        
        'update_settings'             => 'settings',
        'save_smart_call_center'      => 'settings',
        'save_mikopbx'                => 'settings',
        
        'transfer_fund'               => 'wallet_deposit',
        'withdraw_fund'               => 'wallet_deposit',
        'collect_due'                 => 'wallet_deposit',
        'add_expense'                 => 'wallet_deposit',
        
        'pay_client_due'              => 'pay_due',
        'retry_balance_failed_sms'    => 'activity_log',
    ];
    
    foreach ($post_permission_map as $key => $req_slug) {
        if ((isset($_POST[$key]) || (isset($_POST['action']) && $_POST['action'] === $key)) && !hasPermission($req_slug)) {
            if (isset($_GET['ajax']) || isset($_POST['ajax']) || (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest')) {
                header('Content-Type: application/json');
                echo json_encode(['success' => false, 'message' => 'Access Denied: Insufficient permissions.']);
            } else {
                echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied: You do not have permission to perform this action.</div></div>";
            }
            exit;
        }
    }
 }

// Save the tenant switch through the public index.php route. Shared hosting
// commonly denies direct HTTP requests to the controllers directory.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_smart_call_center'])) {
    if (!isLoggedIn() || !(hasRole('Admin') || (isOffice() && hasPermission('settings')))) {
        $_SESSION['flash_error'] = 'Permission denied: Smart Call Center setting was not changed.';
    } else {
        $enabled = ($_POST['smart_call_center_enabled'] ?? '') === '1' ? '1' : '0';
        try {
            set_opt($pdo, 'smart_call_center_enabled', $enabled);
            if (smart_call_center_is_enabled($pdo) !== ($enabled === '1')) {
                throw new RuntimeException('Saved value verification failed.');
            }
            $_SESSION['flash_msg'] = 'Smart Call Center ' . ($enabled === '1' ? 'enabled' : 'disabled') . ' successfully.';
        } catch (Throwable $e) {
            error_log('Smart Call Center toggle failed: ' . $e->getMessage());
            $_SESSION['flash_error'] = 'Could not save Smart Call Center. Check the tenant settings table.';
        }
    }
    header('Location: index.php?tab=settings', true, 303);
    exit;
}

// Process PBX configuration before the global POST redirect at the end of this file.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_mikopbx'])) {
    if (!smart_call_center_is_enabled($pdo) || !(hasRole('Admin') || (isOffice() && hasPermission('settings')))) {
        $_SESSION['flash_error'] = 'Permission denied: MikoPBX settings were not changed.';
    } else {
        $url = rtrim(trim((string)($_POST['mikopbx_url'] ?? '')), '/');
        $did = preg_replace('/\D/', '', (string)($_POST['mikopbx_did'] ?? ''));
        $parts = parse_url($url);
        $host = $parts['host'] ?? '';
        if (!$parts || strtolower((string)($parts['scheme'] ?? '')) !== 'https' || !$host || !preg_match('/^[a-z0-9.:-]+$/i', $host) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || !empty($parts['path']) || strlen($url) > 190 || strlen($did) < 8 || strlen($did) > 15) {
            $_SESSION['flash_error'] = 'Enter the PBX HTTPS base address and assigned DID (8–15 digits).';
        } else {
            try {
                $token = trim((string)($_POST['mikopbx_token'] ?? ''));
                $encrypted = $token !== '' ? encrypt_app_secret($token) : null;
                if ($token !== '' && !$encrypted) throw new RuntimeException('Could not encrypt API key.');
                $staff = safeFetchAll($pdo, 'SELECT id FROM ' . TBL_STAFF . ' ORDER BY id LIMIT 300');
                $extensions = is_array($_POST['agent_extension'] ?? null) ? $_POST['agent_extension'] : [];
                foreach ($staff as $person) {
                    $ext = trim((string)($extensions[(int)$person['id']] ?? ''));
                    if ($ext !== '' && !preg_match('/^[0-9]{2,8}$/', $ext)) throw new RuntimeException('Extension numbers must contain 2–8 digits.');
                }
                set_opt($pdo, 'mikopbx_url', $url);
                set_opt($pdo, 'mikopbx_did', $did);
                if ($encrypted !== null) set_opt($pdo, 'mikopbx_token_enc', $encrypted);
                foreach ($staff as $person) {
                    $id = (int)$person['id'];
                    set_opt($pdo, 'mikopbx_extension_' . $id, trim((string)($extensions[$id] ?? '')));
                }
                // Read the database after writing so a failed update is visible immediately.
                $check = $pdo->prepare('SELECT key_value FROM ' . TBL_SETTINGS . ' WHERE key_name=? LIMIT 1');
                $check->execute(['mikopbx_url']);
                if ((string)$check->fetchColumn() !== $url) throw new RuntimeException('Saved address verification failed.');
                $_SESSION['flash_msg'] = 'MikoPBX settings saved for this tenant.';
            } catch (Throwable $e) {
                error_log('MikoPBX settings save failed: ' . $e->getMessage());
                $_SESSION['flash_error'] = 'Could not save MikoPBX settings. Check server logs and the tenant settings table.';
            }
        }
    }
    header('Location: index.php?tab=smart_call_center', true, 303);
    exit;
}

// --- SMS LOGS: ONE-CLICK RETRY FOR BALANCE-FAILED MESSAGES (v4.2.6) ---
// A retry request never sends hundreds of provider calls inside the web request.
// Eligible rows are atomically returned to the existing Pending queue and the
// background worker is nudged immediately. The per-tenant cron remains the fallback.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['retry_balance_failed_sms'])) {
    $can_retry_sms = hasPermission('activity_log') || hasRole('Admin') || (hasRole('Reseller') && !isOffice());
    if (!$can_retry_sms) {
        $_SESSION['flash_error'] = 'Access denied: you do not have permission to retry SMS logs.';
        header('Location: index.php?tab=sms_logs');
        exit;
    }

    $from = trim((string)($_POST['from'] ?? date('Y-m-d')));
    $to = trim((string)($_POST['to'] ?? date('Y-m-d')));
    $search = trim((string)($_POST['search'] ?? ''));
    $status_filter = trim((string)($_POST['status_filter'] ?? 'all'));

    $valid_date = static function (string $d): bool {
        $dt = DateTime::createFromFormat('Y-m-d', $d);
        return $dt && $dt->format('Y-m-d') === $d;
    };
    if (!$valid_date($from) || !$valid_date($to)) {
        $_SESSION['flash_error'] = 'Invalid SMS log date range.';
        header('Location: index.php?tab=sms_logs');
        exit;
    }
    if ($from > $to) {
        [$from, $to] = [$to, $from];
    }

    // Scope the retry to exactly the staff rows this logged-in user is allowed to see.
    $managed = getManagedStaffIds($pdo, (int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['user_role'] ?? ''));
    $where = ["DATE(created_at) BETWEEN ? AND ?", "status IN ('Error','Failed')", "(response LIKE ? OR response LIKE ? OR response LIKE ? OR response LIKE ? OR response LIKE ?)"];
    $params = [$from, $to, '%Insufficient SMS balance%', '%Insufficient Balance%', '%Error 1000:%', '%\"status\":1000%', '%\"status\":\"1000\"%'];

    if ($managed !== 'ALL') {
        $managed = array_values(array_filter(array_map('intval', (array)$managed), static fn($v) => $v >= 0));
        if (empty($managed)) {
            $_SESSION['flash_error'] = 'No SMS log scope is available for your account.';
            $qs = http_build_query(['tab'=>'sms_logs','from'=>$from,'to'=>$to,'search'=>$search,'status_filter'=>$status_filter]);
            header('Location: index.php?' . $qs);
            exit;
        }
        $where[] = 'staff_id IN (' . implode(',', array_fill(0, count($managed), '?')) . ')';
        $params = array_merge($params, $managed);
    }

    if ($search !== '') {
        $where[] = '(phone LIKE ? OR message LIKE ?)';
        $params[] = '%' . $search . '%';
        $params[] = '%' . $search . '%';
    }

    $where_sql = implode(' AND ', $where);
    $queued = 0;
    try {
        $pdo->beginTransaction();
        // FOR UPDATE prevents two staff clicks from queuing the same failed row twice.
        $sel = $pdo->prepare('SELECT id FROM ' . TBL_SMS_LOGS . ' WHERE ' . $where_sql . ' ORDER BY id ASC FOR UPDATE');
        $sel->execute($params);
        $ids = array_map('intval', $sel->fetchAll(PDO::FETCH_COLUMN));

        if (!empty($ids)) {
            $chunks = array_chunk($ids, 500);
            foreach ($chunks as $chunk) {
                $ph = implode(',', array_fill(0, count($chunk), '?'));
                $upd = $pdo->prepare(
                    "UPDATE " . TBL_SMS_LOGS . "
                     SET status='Pending',
                         response='Balance recharged: retry queued from SMS Logs.',
                         retry_count=COALESCE(retry_count,0)+1,
                         last_retry_at=NOW(),
                         retry_requested_by=?,
                         retry_reason='Balance Recharge'
                     WHERE id IN ($ph) AND status IN ('Error','Failed')"
                );
                $upd->execute(array_merge([(int)($_SESSION['admin_id'] ?? 0)], $chunk));
                $queued += $upd->rowCount();
            }
        }
        $pdo->commit();

        if ($queued > 0) {
            $actor = (string)($_SESSION['admin_username'] ?? ('Staff#' . (int)($_SESSION['admin_id'] ?? 0)));
            writeLog($pdo, $actor, 'SMS Retry Queued', 0, "Queued $queued balance-failed SMS for resend from $from to $to" . ($search !== '' ? " | Filter: $search" : ''));

            // Best-effort immediate background nudge. master_cron.php remains the reliable fallback.
            $tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
            $runner = __DIR__ . '/../cron/process_sms_queue.php';
            $php_cli = defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : 'php';
            $tenant_arg = ' --tenant=' . escapeshellarg($tenant);
            if (PHP_OS_FAMILY === 'Windows') {
                if (function_exists('popen') && function_exists('pclose')) {
                    try { @pclose(@popen('start /B ' . escapeshellarg($php_cli) . ' ' . escapeshellarg($runner) . $tenant_arg, 'r')); } catch (Throwable $e) {}
                }
            } elseif (function_exists('shell_exec')) {
                try { @shell_exec(escapeshellarg($php_cli) . ' ' . escapeshellarg($runner) . $tenant_arg . ' > /dev/null 2>&1 &'); } catch (Throwable $e) {}
            }

            // Shared/cPanel hosting often disables shell_exec. Fire a short loopback
            // request too; process_sms_queue.php uses ignore_user_abort + a tenant lock,
            // so this is safe even when the CLI nudge also succeeded.
            if (isset($_SERVER['HTTP_HOST']) && function_exists('curl_init')) {
                try {
                    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') == 443);
                    $base_path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
                    if ($base_path === '.' || $base_path === '/') $base_path = '';
                    $loop_url = ($https ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . $base_path . '/cron/process_sms_queue.php?tenant=' . rawurlencode($tenant);
                    $ch = curl_init($loop_url);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 500);
                    curl_setopt($ch, CURLOPT_TIMEOUT_MS, 1200);
                    curl_setopt($ch, CURLOPT_NOSIGNAL, 1);
                    @curl_exec($ch);
                    @curl_close($ch);
                } catch (Throwable $e) {}
            }

            $_SESSION['flash_msg'] = "$queued balance-failed SMS queued for resend. Sending starts immediately; the SMS queue cron will continue any remaining batch.";
        } else {
            $_SESSION['flash_error'] = 'No balance-failed SMS matched the selected date/filter, or they were already queued.';
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Balance-failed SMS retry error: ' . $e->getMessage());
        $_SESSION['flash_error'] = 'Could not queue failed SMS for retry. Please try again.';
    }

    $qs = http_build_query(['tab'=>'sms_logs','from'=>$from,'to'=>$to,'search'=>$search,'status_filter'=>$status_filter]);
    header('Location: index.php?' . $qs);
    exit;
}

// Undo-recharge/expire-time schema is handled by the deployment migration in
// includes/config.php. Never run ALTER TABLE during normal page requests.

// --- AJAX GRAPH PROXY ---
if (isset($_GET['ajax_graph']) && isset($_GET['uid'])) {
    $uid = intval($_GET['uid']);
    $type = $_GET['type'] ?? 'daily';
    $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$uid]);
    if ($u && $u['router_id'] > 0) {
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
        if ($r) {
            $username = $u['user_id'];
            $patterns = [$username, "<pppoe-" . $username . ">", "pppoe-" . $username, "pppoe_" . $username];
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
                if ($http_code == 200 && $img && strlen($img) > 100) {
                    header("Content-Type: image/gif");
                    echo $img;
                    exit;
                }
            }
        }
    }
    header("Content-Type: image/gif");
    echo base64_decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
    exit;
}

// Extract flash messages from session
if (isset($_SESSION['flash_msg'])) {
    $msg = $_SESSION['flash_msg'];
    unset($_SESSION['flash_msg']);
}
if (isset($_SESSION['flash_error'])) {
    $error = $_SESSION['flash_error'];
    unset($_SESSION['flash_error']);
}

// --- AJAX USERNAME CHECK ---
if (isset($_GET['ajax_check_user']) && isset($_GET['user_id'])) {
    $uid = trim($_GET['user_id']);
    $exists = false;
    if (!empty($uid)) {
        $check = safeFetch($pdo, "SELECT id FROM ".TBL_USERS." WHERE user_id=? LIMIT 1", [$uid]);
        if ($check) $exists = true;
        else {
            $check_staff = safeFetch($pdo, "SELECT id FROM ".TBL_STAFF." WHERE username=? LIMIT 1", [$uid]);
            if ($check_staff) $exists = true;
        }
    }
    header('Content-Type: application/json');
    echo json_encode(['exists' => $exists]);
    exit;
}

// --- VOICE REMINDER AJAX HANDLERS ---
if (isset($_GET['ajax']) && isset($_POST['action'])) {
    require_once __DIR__ . '/../includes/AwajDigitalClient.php';
    header('Content-Type: application/json');
    $staff_id = $_SESSION['admin_id'] ?? 0;
    
    // Resolve post permissions if office staff
    if (isOffice() && !hasRole('Admin')) {
        $allowed_actions = [
            'voice_test_connection' => 'voice_settings',
            'voice_refresh_senders_voices' => 'voice_settings',
            'voice_make_test_call' => 'voice_manual_call',
            'voice_upload_voice' => 'voice_settings'
        ];
        $act = $_POST['action'];
        if (isset($allowed_actions[$act]) && !hasPermission($allowed_actions[$act])) {
            echo json_encode(['success' => false, 'message' => 'Access Denied: Insufficient permissions.']);
            exit;
        }
    }

    if ($_POST['action'] === 'voice_test_connection') {
        $posted_token = $_POST['voice_api_token'] ?? '';
        if (!empty($posted_token) && strpos($posted_token, '***') !== false) {
            // Read stored raw token
            $posted_token = get_voice_setting($pdo, $staff_id, 'voice_api_token', false);
        }
        if (empty($posted_token)) {
            echo json_encode(['success' => false, 'message' => 'API token is required.']);
            exit;
        }
        
        $client = new AwajDigitalClient($posted_token);
        $res = $client->testConnection();
        echo json_encode($res);
        exit;
    }

    if ($_POST['action'] === 'voice_refresh_senders_voices') {
        $posted_token = $_POST['voice_api_token'] ?? '';
        if (!empty($posted_token) && strpos($posted_token, '***') !== false) {
            $posted_token = get_voice_setting($pdo, $staff_id, 'voice_api_token', false);
        }
        if (empty($posted_token)) {
            echo json_encode(['success' => false, 'message' => 'API token is required to sync.']);
            exit;
        }
        
        $client = new AwajDigitalClient($posted_token);
        $test = $client->testConnection();
        if (!$test['success']) {
            echo json_encode(['success' => false, 'message' => 'Failed to reach API server: ' . $test['message']]);
            exit;
        }
        
        $balance = $test['balance'];
        
        $sendersRes = $client->getSenders();
        $voicesRes = $client->getVoices();
        
        $senders = $sendersRes['data']['senders'] ?? [];
        $voices = $voicesRes['data']['voices'] ?? [];
        
        // Save these cached settings
        if (hasRole('Admin')) {
            set_opt($pdo, 'voice_cached_senders', json_encode($senders));
            set_opt($pdo, 'voice_cached_voices', json_encode($voices));
            set_opt($pdo, 'voice_cached_balance', $balance);
            set_opt($pdo, 'voice_cached_at', date('Y-m-d H:i:s'));
        } else {
            $stmt = $pdo->prepare("SELECT voice_config FROM ".TBL_STAFF." WHERE id=?");
            $stmt->execute([$staff_id]);
            $config = json_decode($stmt->fetchColumn() ?: '{}', true);
            
            $config['voice_cached_senders'] = json_encode($senders);
            $config['voice_cached_voices'] = json_encode($voices);
            $config['voice_cached_balance'] = $balance;
            $config['voice_cached_at'] = date('Y-m-d H:i:s');
            
            $pdo->prepare("UPDATE ".TBL_STAFF." SET voice_config=? WHERE id=?")->execute([json_encode($config), $staff_id]);
        }
        
        echo json_encode(['success' => true, 'balance' => $balance, 'active_senders' => $test['active_senders'], 'approved_voices' => $test['approved_voices']]);
        exit;
    }

    if ($_POST['action'] === 'voice_make_test_call') {
        $phone = normalize_bd_phone_11($_POST['test_phone'] ?? '');
        $sender = $_POST['test_sender'] ?? '';
        $voice = $_POST['test_voice'] ?? '';
        
        if (empty($phone)) {
            echo json_encode(['success' => false, 'message' => 'Please provide a valid 11-digit Bangladeshi phone number (starting with 01).']);
            exit;
        }
        if (empty($sender) || empty($voice)) {
            echo json_encode(['success' => false, 'message' => 'Please configure and select a Caller Sender ID and Voice file first.']);
            exit;
        }
        
        $token = get_voice_setting($pdo, $staff_id, 'voice_api_token', true);
        if (empty($token)) {
            echo json_encode(['success' => false, 'message' => 'API Token is not configured.']);
            exit;
        }
        
        // Allowed calling hours warning check
        $start_time = get_voice_setting($pdo, $staff_id, 'voice_allowed_hours_start') ?: '09:00';
        $end_time = get_voice_setting($pdo, $staff_id, 'voice_allowed_hours_end') ?: '20:00';
        $tz = new DateTimeZone('Asia/Dhaka');
        $now = new DateTime('now', $tz);
        $current_time = $now->format('H:i');
        $outside_hours = false;
        if ($current_time < $start_time || $current_time > $end_time) {
            $outside_hours = true;
        }
        
        $client = new AwajDigitalClient($token);
        $requestId = 'test_' . uniqid() . '_' . time();
        
        $res = $client->createBroadcast($requestId, $voice, $sender, [$phone]);
        
        if ($res['success']) {
            $data = $res['data'];
            $awaj_broadcast_id = $data['broadcast']['id'] ?? $data['broadcast_id'] ?? null;
            
            // Insert broadcast record
            $stmt = $pdo->prepare("INSERT INTO ".TBL_VOICE_BROADCASTS." (manager_id, request_id, awaj_broadcast_id, reminder_type, billing_cycle_date, voice, sender, total_numbers, status, api_response) VALUES (?,?,?,?,?,?,?,?,?,?)");
            $stmt->execute([
                $staff_id,
                $requestId,
                $awaj_broadcast_id,
                'test_call',
                date('Y-m-d'),
                $voice,
                $sender,
                1,
                'completed',
                json_encode($data)
            ]);
            
            // Insert call log record
            $stmtLog = $pdo->prepare("INSERT INTO ".TBL_VOICE_CALL_LOGS." (manager_id, user_id, phone, broadcast_id, request_id, reminder_type, billing_cycle_date, status) VALUES (?,?,?,?,?,?,?,?)");
            $stmtLog->execute([
                $staff_id,
                'test_call',
                $phone,
                $awaj_broadcast_id,
                $requestId,
                'test_call',
                date('Y-m-d'),
                'pending'
            ]);
            
            $msg_ok = 'Test call broadcast submitted successfully.';
            if ($outside_hours) {
                $msg_ok .= ' Warning: Current time is outside safe calling window (' . $start_time . ' - ' . $end_time . ').';
            }
            
            // Save last test phone number
            if (hasRole('Admin')) {
                set_opt($pdo, 'voice_test_phone', $_POST['test_phone']);
            } else {
                $stmt = $pdo->prepare("SELECT voice_config FROM ".TBL_STAFF." WHERE id=?");
                $stmt->execute([$staff_id]);
                $config = json_decode($stmt->fetchColumn() ?: '{}', true);
                $config['voice_test_phone'] = $_POST['test_phone'];
                $pdo->prepare("UPDATE ".TBL_STAFF." SET voice_config=? WHERE id=?")->execute([json_encode($config), $staff_id]);
            }
            
            echo json_encode(['success' => true, 'broadcast_id' => $awaj_broadcast_id, 'message' => $msg_ok]);
        } else {
            $msg_err = $res['data']['message'] ?? $res['message'] ?? 'API dispatch failure';
            echo json_encode(['success' => false, 'message' => 'Failed to dispatch call: ' . $msg_err]);
        }
        exit;
    }

    if ($_POST['action'] === 'voice_upload_voice') {
        $name = trim($_POST['voice_upload_name'] ?? '');
        
        if (empty($name) || !preg_match('/^[a-zA-Z0-9_]+$/', $name)) {
            echo json_encode(['success' => false, 'message' => 'Please provide a valid voice name (letters, numbers, and underscores only).']);
            exit;
        }
        
        if (!isset($_FILES['voice_upload_file']) || $_FILES['voice_upload_file']['error'] !== UPLOAD_ERR_OK) {
            $errCode = $_FILES['voice_upload_file']['error'] ?? 'no file';
            echo json_encode(['success' => false, 'message' => 'File upload error code: ' . $errCode]);
            exit;
        }
        
        $file = $_FILES['voice_upload_file'];
        
        if ($file['size'] > 10 * 1024 * 1024) {
            echo json_encode(['success' => false, 'message' => 'File size exceeds maximum limit of 10MB.']);
            exit;
        }
        
        $allowedExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm', 'flac'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExts)) {
            echo json_encode(['success' => false, 'message' => 'Unsupported audio format. Allowed formats: ' . implode(', ', $allowedExts)]);
            exit;
        }
        
        $token = get_voice_setting($pdo, $staff_id, 'voice_api_token', false);
        if (empty($token)) {
            echo json_encode(['success' => false, 'message' => 'API Token is not configured.']);
            exit;
        }
        
        $client = new AwajDigitalClient($token);
        
        // Upload the file directly to AwajDigital
        $res = $client->uploadVoice($name, $file['tmp_name'], $file['type'], $file['name']);
        
        if ($res['success']) {
            echo json_encode([
                'success' => true,
                'name' => $res['data']['name'] ?? $name,
                'status' => $res['data']['status'] ?? 'pending'
            ]);
        } else {
            $msg_err = $res['data']['message'] ?? $res['message'] ?? 'Upload dispatch failure';
            echo json_encode(['success' => false, 'message' => 'Upload failed: ' . $msg_err]);
        }
        exit;
    }
}

// --- AJAX PING HANDLER ---
if (isset($_GET['ajax_ping']) && isset($_GET['id'])) {
    header('Content-Type: application/json');
    $client_id = intval($_GET['id']);
    $count = intval($_GET['count'] ?? 4);
    if($count > 20) $count = 20; 
    
    $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$client_id]);
    
    if (!$u) {
        echo json_encode(['success' => false, 'error' => 'Client not found.']);
        exit;
    }
    
    $router = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
    if (!$router) {
        echo json_encode(['success' => false, 'error' => 'Router not found.']);
        exit;
    }
    
    $mk = new MikrotikApp($router);
    $stats = $mk->stats($u['user_id']);
    $target_ip = $stats['ip'] ?: ($u['assigned_ip'] ?? '');
    
    if (empty($target_ip)) {
        echo json_encode(['success' => false, 'error' => 'No active IP found for this client. Connect to MikroTik first.']);
        exit;
    }
    
    $ping_res = $mk->ping($target_ip, $count);
    
    if (is_array($ping_res)) {
        $html = '<div class="table-responsive" style="max-height: 300px;"><table class="table table-sm table-bordered small mb-0">
                    <thead class="bg-light sticky-top">
                        <tr><th>Seq</th><th>Size</th><th>TTL</th><th>Time</th><th>Status</th></tr>
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
                        <td>".($p['size']??'-')."</td>
                        <td>".($p['ttl']??'-')."</td>
                        <td>".($p['time']??'-')."</td>
                        <td class='$color fw-bold'>".ucfirst($status)."</td>
                      </tr>";
        }
        $html .= '</tbody></table></div>';
        $summary = "<div class='mt-2 small fw-bold'>Sent: ".count($ping_res).", Received: $success_count, Loss: ".(count($ping_res)-$success_count)."</div>";
        echo json_encode(['success' => true, 'html' => $html . $summary, 'ip' => $target_ip]);
    } else {
        echo json_encode(['success' => false, 'error' => $ping_res]);
    }
    exit;
}

// --- AJAX TRACE HANDLER ---
if (isset($_GET['ajax_trace']) && isset($_GET['id'])) {
    header('Content-Type: application/json');
    $client_id = intval($_GET['id']);
    $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$client_id]);
    
    if (!$u) {
        echo json_encode(['success' => false, 'error' => 'Client not found.']);
        exit;
    }
    
    $router = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
    if (!$router) {
        echo json_encode(['success' => false, 'error' => 'Router not found.']);
        exit;
    }
    
    $mk = new MikrotikApp($router);
    $stats = $mk->stats($u['user_id']);
    $target_ip = $stats['ip'] ?: ($u['assigned_ip'] ?? '');
    
    if (empty($target_ip)) {
        echo json_encode(['success' => false, 'error' => 'No active IP found for this client.']);
        exit;
    }
    
    $trace_res = $mk->traceroute($target_ip);
    
    if (is_array($trace_res)) {
        $html = '<div class="table-responsive"><table class="table table-sm table-bordered small mb-0">
                    <thead class="bg-light">
                        <tr><th>Hop</th><th>Address</th><th>Loss</th><th>Sent</th><th>Last</th><th>Avg</th><th>Best</th><th>Worst</th></tr>
                    </thead>
                    <tbody>';
        foreach ($trace_res as $t) {
            $html .= "<tr>
                        <td>".($t['hop']??'-')."</td>
                        <td>".($t['address']??'-')."</td>
                        <td>".($t['loss']??'0')."%</td>
                        <td>".($t['sent']??'-')."</td>
                        <td>".($t['last']??'-')."</td>
                        <td>".($t['avg']??'-')."</td>
                        <td>".($t['best']??'-')."</td>
                        <td>".($t['worst']??'-')."</td>
                      </tr>";
        }
        $html .= '</tbody></table></div>';
        echo json_encode(['success' => true, 'html' => $html, 'ip' => $target_ip]);
    } else {
        echo json_encode(['success' => false, 'error' => $trace_res]);
    }
    exit;
}

// --- AJAX VPN CONNECT (CLI-queue safe; works when web shell_exec is disabled) ---
if (isset($_GET['ajax_vpn_connect'])) {
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    if (!isset($_SESSION['admin_id']) || !hasRole('Admin')) {
        echo json_encode(['success' => false, 'message' => 'Not authenticated.']);
        exit;
    }
    require_once __DIR__ . '/../classes/TenantPptpManager.php';
    $mgr = new TenantPptpManager($pdo);
    $vpn = $mgr->getConfig();
    if (!$vpn) {
        echo json_encode(['success' => false, 'message' => 'No VPN configuration found. Please configure first.']);
        exit;
    }
    if (!$mgr->isConfigured($vpn)) {
        echo json_encode(['success' => false, 'message' => 'Incomplete VPN configuration. Please configure server, username, password and OLT LAN.']);
        exit;
    }

    $pdo->prepare("UPDATE " . TBL_TENANT_VPN . " SET vpn_status='connecting', error_message=NULL, last_health_check=NOW() WHERE id=?")->execute([(int)$vpn['id']]);
    $queued = $mgr->queueAction('connect');

    // If command execution is allowed in this web SAPI, start immediately.
    // Otherwise the per-minute CLI pptp_keepalive job consumes the queue.
    $spawned = false;
    if (stripos(PHP_OS, 'WIN') === false && (function_exists('exec') || function_exists('shell_exec'))) {
        $worker = realpath(__DIR__ . '/../cron/vpn_worker.php');
        $php = file_exists('/usr/bin/php') ? '/usr/bin/php' : (PHP_BINARY ?: 'php');
        $tenant = $mgr->getTenantKey();
        $cmd = escapeshellarg($php) . ' ' . escapeshellarg($worker);
        if ($tenant !== 'main') $cmd .= ' --tenant=' . escapeshellarg($tenant);
        $cmd .= ' --force=1 > /dev/null 2>&1 &';
        $exit = null;
        $out = function_exists('safe_command_exec') ? safe_command_exec($cmd, $exit) : safe_shell_exec($cmd);
        if ($out !== null) {
            $spawned = true;
            // Prevent the next cron from replaying a connect already started here.
            $mgr->consumeQueuedAction();
        }
    }

    echo json_encode([
        'success' => $queued || $spawned,
        'message' => $spawned
            ? 'PPTP worker started. Negotiating tunnel with ' . $vpn['pptp_server'] . '...'
            : 'PPTP connect request queued for the CLI worker. It will run on the next master cron cycle (normally within 1 minute).',
        'status' => 'connecting',
        'execution' => $spawned ? 'immediate' : 'queued_cli'
    ]);
    exit;
}

// --- AJAX VPN DISCONNECT (CLI-queue safe) ---
if (isset($_GET['ajax_vpn_disconnect'])) {
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    if (!isset($_SESSION['admin_id']) || !hasRole('Admin')) {
        echo json_encode(['success' => false, 'message' => 'Not authenticated.']);
        exit;
    }
    require_once __DIR__ . '/../classes/TenantPptpManager.php';
    $mgr = new TenantPptpManager($pdo);
    $vpn = $mgr->getConfig();
    if (!$vpn) {
        echo json_encode(['success' => false, 'message' => 'No VPN configuration found.']);
        exit;
    }

    // The CLI worker performs the actual poff/route/peer cleanup. Do not lie to
    // the UI when web PHP cannot execute OS commands.
    $pdo->prepare("UPDATE " . TBL_TENANT_VPN . " SET vpn_status='disabled', error_message=NULL, reachability_status='unknown', last_health_check=NOW() WHERE id=?")->execute([(int)$vpn['id']]);
    $queued = $mgr->queueAction('disconnect');

    $spawned = false;
    if (stripos(PHP_OS, 'WIN') === false && (function_exists('exec') || function_exists('shell_exec'))) {
        $worker = realpath(__DIR__ . '/../cron/vpn_worker.php');
        $php = file_exists('/usr/bin/php') ? '/usr/bin/php' : (PHP_BINARY ?: 'php');
        $tenant = $mgr->getTenantKey();
        $cmd = escapeshellarg($php) . ' ' . escapeshellarg($worker);
        if ($tenant !== 'main') $cmd .= ' --tenant=' . escapeshellarg($tenant);
        $cmd .= ' --force=1 > /dev/null 2>&1 &';
        $exit = null;
        $out = function_exists('safe_command_exec') ? safe_command_exec($cmd, $exit) : safe_shell_exec($cmd);
        if ($out !== null) {
            $spawned = true;
            $mgr->consumeQueuedAction();
        }
    }

    echo json_encode([
        'success' => $queued || $spawned,
        'message' => $spawned
            ? 'PPTP teardown worker started.'
            : 'PPTP disconnect request queued for the CLI worker. The tunnel will be removed on the next master cron cycle.',
        'status' => 'disabled',
        'execution' => $spawned ? 'immediate' : 'queued_cli'
    ]);
    exit;
}

// --- AJAX VPN STATUS POLL ---
if (isset($_GET['ajax_vpn_status'])) {
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    if (!isset($_SESSION['admin_id'])) {
        echo json_encode(['status' => 'disabled', 'iface' => '', 'error' => '', 'last_connected' => '', 'queued_action' => null]);
        exit;
    }
    require_once __DIR__ . '/../classes/TenantPptpManager.php';
    $mgr = new TenantPptpManager($pdo);
    $vpn = safeFetch($pdo, "SELECT vpn_status, ppp_interface, error_message, last_connected_at, last_health_check, last_reachable_at, reachability_status FROM " . TBL_TENANT_VPN . " LIMIT 1");
    if (!$vpn) {
        echo json_encode(['status' => 'disabled', 'iface' => '', 'error' => '', 'last_connected' => '', 'queued_action' => null]);
        exit;
    }
    echo json_encode([
        'status'         => $vpn['vpn_status'],
        'iface'          => $vpn['ppp_interface'] ?? '',
        'error'          => $vpn['error_message'] ?? '',
        'last_connected' => $vpn['last_connected_at'] ?? '',
        'last_health_check' => $vpn['last_health_check'] ?? '',
        'last_reachable_at' => $vpn['last_reachable_at'] ?? '',
        'reachability' => $vpn['reachability_status'] ?? 'unknown',
        'queued_action' => $mgr->peekQueuedAction(),
    ]);
    exit;
}

// --- AJAX VPN FULL DIAGNOSTICS ---
if (isset($_GET['ajax_vpn_diag'])) {
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    if (!isset($_SESSION['admin_id']) || !hasRole('Admin')) {
        echo json_encode(['error' => 'Not authenticated. Please log in again.']);
        exit;
    }

    require_once __DIR__ . '/../classes/TenantPptpManager.php';
    require_once __DIR__ . '/../classes/PptpCliDiagnostics.php';
    $mgr = new TenantPptpManager($pdo);
    $vpn = $mgr->getConfig() ?: [];
    $webCommandExec = function_exists('shell_exec') || function_exists('exec');
    $results = null;

    if ($webCommandExec && stripos(PHP_OS, 'WIN') === false) {
        try {
            $collector = new PptpCliDiagnostics($mgr);
            $results = $collector->collectAndWrite($vpn);
            $results['diag_source'] = 'live_web_command';
        } catch (Throwable $e) {
            $results = ['diag_error' => $e->getMessage()];
        }
    } else {
        $results = $mgr->readDiagnosticSnapshot();
        if (!is_array($results)) $results = [];
        $results['diag_source'] = 'cli_snapshot';
    }

    // Always overlay fresh web/DB information. These checks do not require OS
    // command execution and therefore remain accurate with disable_functions.
    $results['os'] = $results['os'] ?? (PHP_OS . ' (' . php_uname('r') . ')');
    $results['php_binary'] = $results['php_binary'] ?? PHP_BINARY;
    $results['php_version'] = $results['php_version'] ?? PHP_VERSION;
    $results['server_ip'] = $_SERVER['SERVER_ADDR'] ?? ($results['server_ip'] ?? 'unknown');
    $results['is_windows'] = stripos(PHP_OS, 'WIN') !== false;
    $results['shell_exec_enabled'] = function_exists('shell_exec');
    $results['web_command_exec_enabled'] = $webCommandExec;
    $results['vpn_config'] = [
        'server' => $vpn['pptp_server'] ?? 'NOT SET',
        'username' => $vpn['pptp_username'] ?? 'NOT SET',
        'lan' => $vpn['olt_lan'] ?? 'NOT SET',
        'status' => $vpn['vpn_status'] ?? 'NOT SET',
        'iface' => $vpn['ppp_interface'] ?? 'none',
        'error' => $vpn['error_message'] ?? '',
    ];

    $server = trim((string)($vpn['pptp_server'] ?? ''));
    if ($server !== '') {
        $sock = @fsockopen($server, 1723, $errno, $errstr, 5);
        if ($sock) {
            fclose($sock);
            $results['port_1723'] = 'OPEN - PPTP server reachable on ' . $server . ':1723';
        } else {
            $results['port_1723'] = 'CLOSED/UNREACHABLE - ' . ($errstr ?: ('errno ' . $errno)) . ' on ' . $server . ':1723';
        }
    } else {
        $results['port_1723'] = 'No server configured';
    }

    $results['chap_secrets_exists'] = file_exists('/etc/ppp/chap-secrets') ? 'exists' : ($results['chap_secrets_exists'] ?? 'NOT FOUND');
    $results['pap_secrets_exists'] = file_exists('/etc/ppp/pap-secrets') ? 'exists' : ($results['pap_secrets_exists'] ?? 'NOT FOUND');

    if (!$webCommandExec) {
        if (empty($results['collected_at'])) {
            $results['note'] = 'Web PHP command execution is disabled. No CLI diagnostics snapshot exists yet. Run the master cron or: php cron/pptp_keepalive.php --tenant=' . $mgr->getTenantKey();
            foreach (['pppd_path','pptp_path','poff_path','pppd_ver','sudo_test','ppp_interfaces','peers_dir','syslog_pppd'] as $k) {
                if (!isset($results[$k])) $results[$k] = 'WAITING FOR CLI SNAPSHOT';
            }
        } else {
            $results['note'] = 'Web PHP command execution is disabled; tool/interface/route results below are from the latest CLI cron snapshot collected at ' . $results['collected_at'] . '.';
        }
        $results['worker_output'] = $results['worker_output'] ?? ('CLI snapshot: ' . ($results['collected_at'] ?? 'pending'));
    }

    echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!empty($_POST)) {
    // Debug: Log ANY post request
    safe_log('debug_post', "POST: " . json_encode(mask_sensitive_data($_POST)));
}
if (isset($_POST['request_reset'])) {
    safe_log('debug_reset', "Reset Button Detected! Email: " . ($_POST['email'] ?? ''));
}


// --- FUN BOX MOVIE SERVER API SETTINGS ---
if (isset($_POST['action']) && $_POST['action'] === 'save_movie_server_api') {
    if (!hasRole('Admin') && !isOffice()) { http_response_code(403); exit("Access denied"); }

    $enabled = isset($_POST['movie_api_enabled']) ? '1' : '0';
    $api_url = movie_server_normalize_api_url($_POST['movie_api_url'] ?? '');
    $new_key = trim((string)($_POST['movie_api_key'] ?? ''));
    $remove_key = isset($_POST['remove_movie_api_key']) && $_POST['remove_movie_api_key'] === '1';

    if ($api_url === '' && $enabled === '1') {
        $_SESSION['flash_error'] = "Movie Server API URL is required before enabling the integration.";
        header("Location: ?tab=settings#v-pills-funbox");
        exit;
    }

    $existing_encrypted = get_opt($pdo, 'funbox_movie_api_key_enc', '');
    $encrypted_key = $existing_encrypted;
    if ($remove_key) {
        $encrypted_key = '';
    } elseif ($new_key !== '') {
        $encrypted_key = encrypt_app_secret($new_key);
        if ($encrypted_key === '') {
            $_SESSION['flash_error'] = "Could not encrypt the Movie Server API Key. Please make sure OpenSSL is enabled.";
            header("Location: ?tab=settings#v-pills-funbox");
            exit;
        }
    }

    if ($enabled === '1' && $encrypted_key === '') {
        $_SESSION['flash_error'] = "Movie Server API Key is required before enabling the integration.";
        header("Location: ?tab=settings#v-pills-funbox");
        exit;
    }

    set_opt($pdo, 'funbox_movie_api_enabled', $enabled);
    set_opt($pdo, 'funbox_movie_api_url', $api_url);
    set_opt($pdo, 'funbox_movie_api_key_enc', $encrypted_key);

    // Test immediately after save so the admin can see if the URL/key is usable.
    $cfg = get_movie_server_config($pdo);
    if ($api_url !== '' && !empty($cfg['api_key'])) {
        $test = movie_server_api_request($pdo, 'home');
        $test_time = date('Y-m-d H:i:s');
        set_opt($pdo, 'funbox_movie_api_last_status', $test['ok'] ? 'ok' : 'error');
        set_opt($pdo, 'funbox_movie_api_last_message', $test['message']);
        set_opt($pdo, 'funbox_movie_api_last_tested_at', $test_time);
        if ($test['ok']) {
            $_SESSION['flash_msg'] = "Movie Server API settings saved and connection test passed.";
        } else {
            $_SESSION['flash_error'] = "Settings saved, but Movie Server test failed: " . $test['message'];
        }
    } else {
        set_opt($pdo, 'funbox_movie_api_last_status', 'never');
        set_opt($pdo, 'funbox_movie_api_last_message', '');
        set_opt($pdo, 'funbox_movie_api_last_tested_at', '');
        $_SESSION['flash_msg'] = "Movie Server API settings saved.";
    }
    header("Location: ?tab=settings#v-pills-funbox");
    exit;
}

if (isset($_POST['action']) && $_POST['action'] === 'test_movie_server_api') {
    if (!hasRole('Admin') && !isOffice()) { http_response_code(403); exit("Access denied"); }
    $cfg = get_movie_server_config($pdo);
    if (empty($cfg['api_url']) || empty($cfg['api_key'])) {
        $_SESSION['flash_error'] = "Save a Movie Server API URL and API Key first.";
    } else {
        $test = movie_server_api_request($pdo, 'home');
        set_opt($pdo, 'funbox_movie_api_last_status', $test['ok'] ? 'ok' : 'error');
        set_opt($pdo, 'funbox_movie_api_last_message', $test['message']);
        set_opt($pdo, 'funbox_movie_api_last_tested_at', date('Y-m-d H:i:s'));
        if ($test['ok']) {
            $home = $test['json']['data'] ?? [];
            $movies = is_array($home['latest_movies'] ?? null) ? count($home['latest_movies']) : 0;
            $series = is_array($home['latest_series'] ?? null) ? count($home['latest_series']) : 0;
            $_SESSION['flash_msg'] = "Movie Server connected successfully. Latest Movies: {$movies}, Series: {$series}.";
        } else {
            $_SESSION['flash_error'] = "Movie Server connection failed: " . $test['message'];
        }
    }
    header("Location: ?tab=settings#v-pills-funbox");
    exit;
}



// --- FUN BOX LIVE TV API SETTINGS ---
if (isset($_POST['action']) && $_POST['action'] === 'save_live_tv_api') {
    if (!hasRole('Admin') && !isOffice()) { http_response_code(403); exit("Access denied"); }

    $enabled = isset($_POST['livetv_api_enabled']) ? '1' : '0';
    $api_url = live_tv_normalize_api_url($_POST['livetv_api_url'] ?? '');
    $new_key = trim((string)($_POST['livetv_api_key'] ?? ''));
    $remove_key = isset($_POST['remove_livetv_api_key']) && $_POST['remove_livetv_api_key'] === '1';

    if ($api_url === '' && $enabled === '1') {
        $_SESSION['flash_error'] = "Live TV API URL is required before enabling the integration.";
        header("Location: ?tab=settings#v-pills-funbox");
        exit;
    }

    $existing_encrypted = get_opt($pdo, 'funbox_livetv_api_key_enc', '');
    $encrypted_key = $existing_encrypted;
    if ($remove_key) {
        $encrypted_key = '';
    } elseif ($new_key !== '') {
        $encrypted_key = encrypt_app_secret($new_key);
        if ($encrypted_key === '') {
            $_SESSION['flash_error'] = "Could not encrypt the Live TV API Key. Please make sure OpenSSL is enabled.";
            header("Location: ?tab=settings#v-pills-funbox");
            exit;
        }
    }

    if ($enabled === '1' && $encrypted_key === '') {
        $_SESSION['flash_error'] = "Live TV API Key is required before enabling the integration.";
        header("Location: ?tab=settings#v-pills-funbox");
        exit;
    }

    set_opt($pdo, 'funbox_livetv_api_enabled', $enabled);
    set_opt($pdo, 'funbox_livetv_api_url', $api_url);
    set_opt($pdo, 'funbox_livetv_api_key_enc', $encrypted_key);

    $cfg = get_live_tv_config($pdo);
    if ($api_url !== '' && !empty($cfg['api_key'])) {
        $test = live_tv_api_request($pdo, 'channels', ['page' => 1, 'limit' => 1]);
        $test_time = date('Y-m-d H:i:s');
        set_opt($pdo, 'funbox_livetv_api_last_status', $test['ok'] ? 'ok' : 'error');
        set_opt($pdo, 'funbox_livetv_api_last_message', $test['message']);
        set_opt($pdo, 'funbox_livetv_api_last_tested_at', $test_time);
        if ($test['ok']) {
            $total = (int)($test['json']['pagination']['total_records'] ?? count($test['json']['data'] ?? []));
            $_SESSION['flash_msg'] = "Live TV API settings saved and connection test passed. Active channels: {$total}.";
        } else {
            $_SESSION['flash_error'] = "Settings saved, but Live TV test failed: " . $test['message'];
        }
    } else {
        set_opt($pdo, 'funbox_livetv_api_last_status', 'never');
        set_opt($pdo, 'funbox_livetv_api_last_message', '');
        set_opt($pdo, 'funbox_livetv_api_last_tested_at', '');
        $_SESSION['flash_msg'] = "Live TV API settings saved.";
    }
    header("Location: ?tab=settings#v-pills-funbox");
    exit;
}

if (isset($_POST['action']) && $_POST['action'] === 'test_live_tv_api') {
    if (!hasRole('Admin') && !isOffice()) { http_response_code(403); exit("Access denied"); }
    $cfg = get_live_tv_config($pdo);
    if (empty($cfg['api_url']) || empty($cfg['api_key'])) {
        $_SESSION['flash_error'] = "Save a Live TV API URL and API Key first.";
    } else {
        $test = live_tv_api_request($pdo, 'channels', ['page' => 1, 'limit' => 1]);
        set_opt($pdo, 'funbox_livetv_api_last_status', $test['ok'] ? 'ok' : 'error');
        set_opt($pdo, 'funbox_livetv_api_last_message', $test['message']);
        set_opt($pdo, 'funbox_livetv_api_last_tested_at', date('Y-m-d H:i:s'));
        if ($test['ok']) {
            $total = (int)($test['json']['pagination']['total_records'] ?? count($test['json']['data'] ?? []));
            $_SESSION['flash_msg'] = "Live TV connected successfully. Active channels: {$total}.";
        } else {
            $_SESSION['flash_error'] = "Live TV connection failed: " . $test['message'];
        }
    }
    header("Location: ?tab=settings#v-pills-funbox");
    exit;
}

if (isset($_POST['action']) && $_POST['action'] === 'save_funbox') {
    if (!hasRole('Admin') && !isOffice()) { http_response_code(403); exit("Access denied"); }
    $name = trim($_POST['funbox_name'] ?? '');
    $url = trim($_POST['funbox_url'] ?? '');
    if ($name && $url) {
        $funbox_links = json_decode(get_opt($pdo, 'funbox_links', '[]'), true);
        $funbox_links[] = ['name' => $name, 'url' => $url];
        set_opt($pdo, 'funbox_links', json_encode($funbox_links));
        $_SESSION['flash_msg'] = "Entertainment link added successfully!";
    }
    header("Location: ?tab=settings");
    exit;
}

if (isset($_POST['action']) && $_POST['action'] === 'edit_funbox') {
    if (!hasRole('Admin') && !isOffice()) { http_response_code(403); exit("Access denied"); }
    $id = intval($_POST['funbox_id']);
    $name = trim($_POST['funbox_name'] ?? '');
    $url = trim($_POST['funbox_url'] ?? '');
    if ($name && $url) {
        $funbox_links = json_decode(get_opt($pdo, 'funbox_links', '[]'), true);
        if (isset($funbox_links[$id])) {
            $funbox_links[$id] = ['name' => $name, 'url' => $url];
            set_opt($pdo, 'funbox_links', json_encode($funbox_links));
            $_SESSION['flash_msg'] = "Entertainment link updated successfully!";
        }
    }
    header("Location: ?tab=settings");
    exit;
}

if (isset($_GET['action']) && $_GET['action'] === 'delete_funbox') {
    if (!hasRole('Admin') && !isOffice()) { http_response_code(403); exit("Access denied"); }
    $id = intval($_GET['id']);
    $funbox_links = json_decode(get_opt($pdo, 'funbox_links', '[]'), true);
    if (isset($funbox_links[$id])) {
        unset($funbox_links[$id]);
        $funbox_links = array_values($funbox_links); // re-index
        set_opt($pdo, 'funbox_links', json_encode($funbox_links));
        $_SESSION['flash_msg'] = "Entertainment link deleted!";
    }
    header("Location: ?tab=settings");
    exit;
}

// --- SMS CENTER: SEND / GATEWAY TEST ---
if (isset($_POST['action']) && $_POST['action'] === 'sms_center_send') {
    $allowedSmsCenter = hasRole('Admin') || hasPermission('activity_log') || (hasRole('Reseller') && !isOffice());
    if (!$allowedSmsCenter) {
        $_SESSION['flash_error'] = 'Access Denied: You do not have permission to send SMS from the SMS Center.';
        header('Location: ?tab=sms_logs');
        exit;
    }

    $phone = trim((string)($_POST['phone'] ?? ''));
    $message = trim((string)($_POST['message'] ?? ''));
    $mode = trim((string)($_POST['sms_mode'] ?? 'send'));
    if ($phone === '' || $message === '') {
        $_SESSION['flash_error'] = 'Phone number and message are required.';
        header('Location: ?tab=sms_logs');
        exit;
    }
    if (strlen($message) > 1200) {
        $_SESSION['flash_error'] = 'SMS message is too long. Please keep it within 1200 characters.';
        header('Location: ?tab=sms_logs');
        exit;
    }

    $insertedLogId = null;
    $ok = sendSMS($pdo, $phone, $message, (int)$user, 0, $insertedLogId);
    if ($ok) {
        $_SESSION['flash_msg'] = ($mode === 'test' ? 'Gateway test SMS sent successfully to ' : 'SMS sent successfully to ') . $phone . '.';
        writeLog($pdo, $_SESSION['admin_username'] ?? 'System', $mode === 'test' ? 'SMS Gateway Test' : 'Send SMS', 0, "SMS Center sent message to {$phone}. Log ID: " . ($insertedLogId ?: 'N/A'));
    } else {
        $_SESSION['flash_error'] = ($mode === 'test' ? 'Gateway test failed.' : 'SMS sending failed.') . ' Check SMS balance, gateway settings and the SMS log response.';
    }
    header('Location: ?tab=sms_logs');
    exit;
}

// --- SEND CUSTOM SMS ---
if (isset($_POST['action']) && $_POST['action'] === 'send_custom_sms') {
    $uid = intval($_POST['uid']);
    $message = trim($_POST['message'] ?? '');
    
    $u = safeFetch($pdo, "SELECT phone FROM ".TBL_USERS." WHERE id=?", [$uid]);
    if ($u && !empty($message)) {
        require_once __DIR__ . '/../includes/functions.php';
        $status = sendSMS($pdo, $u['phone'], $message, $user);
        if ($status) {
            $_SESSION['flash_msg'] = "Custom SMS sent to " . $u['phone'];
        } else {
            $_SESSION['flash_error'] = "Failed to send SMS. Check API configuration.";
        }
    } else {
        $_SESSION['flash_error'] = "Invalid user or empty message.";
    }
    header("Location: ?tab=profile&view_id=$uid");
    exit;
}

// --- SEND VOICE REMINDER ---
if (isset($_POST['action']) && $_POST['action'] === 'send_voice_reminder') {
    if (!hasPermission('voice_manual_call')) {
        $_SESSION['flash_error'] = "Access Denied: Insufficient permissions.";
        header("Location: ?tab=profile&view_id=" . intval($_POST['uid']));
        exit;
    }
    
    $uid = intval($_POST['uid']);
    $sender = trim($_POST['voice_sender'] ?? '');
    $voice = trim($_POST['voice_file'] ?? '');
    
    $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$uid]);
    if ($u && !empty($sender) && !empty($voice)) {
        $phone = normalize_bd_phone_11($u['phone']);
        if (empty($phone)) {
            $_SESSION['flash_error'] = "Invalid client phone format. Must be 11-digit Bangladeshi number.";
        } else {
            require_once __DIR__ . '/../includes/AwajDigitalClient.php';
            $token = get_voice_setting($pdo, $user, 'voice_api_token', true);
            
            if (empty($token)) {
                $_SESSION['flash_error'] = "Voice API Token not configured.";
            } else {
                // Allowed calling hours safety window check
                $start_time = get_voice_setting($pdo, $user, 'voice_allowed_hours_start') ?: '09:00';
                $end_time = get_voice_setting($pdo, $user, 'voice_allowed_hours_end') ?: '20:00';
                $tz = new DateTimeZone('Asia/Dhaka');
                $now = new DateTime('now', $tz);
                $current_time = $now->format('H:i');
                $outside_hours = false;
                if ($current_time < $start_time || $current_time > $end_time) {
                    $outside_hours = true;
                }
                
                $client = new AwajDigitalClient($token);
                $requestId = 'manual_' . uniqid() . '_' . time();
                
                $res = $client->createBroadcast($requestId, $voice, $sender, [$phone]);
                
                if ($res['success']) {
                    $data = $res['data'];
                    $awaj_broadcast_id = $data['broadcast_id'] ?? null;
                    
                    // Save to broadcasts
                    $stmt = $pdo->prepare("INSERT INTO ".TBL_VOICE_BROADCASTS." (manager_id, request_id, awaj_broadcast_id, reminder_type, billing_cycle_date, voice, sender, total_numbers, status, api_response) VALUES (?,?,?,?,?,?,?,?,?,?)");
                    $stmt->execute([
                        $user,
                        $requestId,
                        $awaj_broadcast_id,
                        'manual',
                        date('Y-m-d'),
                        $voice,
                        $sender,
                        1,
                        'completed',
                        json_encode($data)
                    ]);
                    
                    // Save to logs
                    $stmtLog = $pdo->prepare("INSERT INTO ".TBL_VOICE_CALL_LOGS." (manager_id, user_id, phone, broadcast_id, request_id, reminder_type, billing_cycle_date, status) VALUES (?,?,?,?,?,?,?,?)");
                    $stmtLog->execute([
                        $user,
                        $u['user_id'],
                        $phone,
                        $awaj_broadcast_id,
                        $requestId,
                        'manual',
                        date('Y-m-d'),
                        'pending'
                    ]);
                    
                    writeLog($pdo, $_SESSION['admin_username'], 'Voice Call Sent', $uid, "Voice call reminder initiated to " . $phone . " (Broadcast ID: " . $awaj_broadcast_id . ")");
                    
                    $msg_ok = "Voice call reminder dispatched to " . $phone;
                    if ($outside_hours) {
                        $msg_ok .= " (Warning: Outside safe calling hours " . $start_time . "-" . $end_time . ")";
                    }
                    $_SESSION['flash_msg'] = $msg_ok;
                } else {
                    $msg_err = $res['data']['message'] ?? $res['message'] ?? 'API dispatch failure';
                    $_SESSION['flash_error'] = "Failed to dispatch call: " . $msg_err;
                    writeLog($pdo, $_SESSION['admin_username'], 'Voice Call Error', $uid, "Failed to call " . $phone . ": " . $msg_err);
                }
            }
        }
    } else {
        $_SESSION['flash_error'] = "Invalid client or missing caller ID/voice.";
    }
    header("Location: ?tab=profile&view_id=$uid");
    exit;
}

// --- UNDO RECHARGE ---
if (isset($_POST['action']) && $_POST['action'] === 'undo_recharge') {

    $uid = intval($_POST['uid']);
    $log_id = intval($_POST['log_id']);
    
    $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$uid]);
    if (!$u) {
        $_SESSION['flash_error'] = "Invalid user.";
        header("Location: ?tab=clients");
        exit;
    }
    
    $is_reseller = hasRole('Reseller') || hasRole('SubReseller');
    $can_undo_flag = 0;
    if ($is_reseller) {
        $staff_info = safeFetch($pdo, "SELECT can_undo_recharge FROM ".TBL_STAFF." WHERE id=?", [$user]);
        $can_undo_flag = $staff_info['can_undo_recharge'] ?? 0;
    }
    
    $allowed = hasPermission('clients_edit') || hasRole('Admin') || hasRole('Super Admin') || ($is_reseller && $can_undo_flag == 1);
    if ($allowed) {
        $log = safeFetch($pdo, "SELECT * FROM ".TBL_LOGS." WHERE id=? AND target_id=? AND action_type='Recharge' AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)", [$log_id, $uid]);

        if ($log) {
            if (preg_match('/for (\d+) days/', $log['description'], $matches)) {
                $days_to_remove = intval($matches[1]);
                $target_user_id = $u['user_id'];
                
                $tx_expense = safeFetch($pdo, "SELECT * FROM ".TBL_TX." WHERE type='Expense' AND description LIKE ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY id DESC LIMIT 1", ["Recharge Cost%: $target_user_id%"]);
                $tx_income = safeFetch($pdo, "SELECT * FROM ".TBL_TX." WHERE type='Income' AND description LIKE ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY id DESC LIMIT 1", ["Bill Collection%: $target_user_id%"]);
                
                $penalty_amount = 0;
                if ($is_reseller) {
                    $delay_hours = intval(get_opt($pdo, 'undo_recharge_deduct_hours', '2'));
                    $log_time = strtotime($log['timestamp']);
                    $elapsed_hours = (time() - $log_time) / 3600;
                    if ($elapsed_hours > $delay_hours && $days_to_remove > 0) {
                        $penalty_amount = floatval($tx_expense['amount'] / $days_to_remove);
                    }
                }
                
                if ($tx_expense) {
                    $refund_amount = $tx_expense['amount'] - $penalty_amount;
                    $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance + ? WHERE id=?")->execute([$refund_amount, $tx_expense['staff_id']]);
                    log_tx($pdo, $tx_expense['staff_id'], 'Income', $refund_amount, "Recharge Refund (Voided) - Penalty: $penalty_amount BDT: $target_user_id", 'System', $user);
                }

                
                if ($tx_income) {
                    log_tx($pdo, $tx_income['staff_id'], 'Expense', $tx_income['amount'], "Bill Refund (Voided): $target_user_id", 'System', $user);
                }
                
                if (isSystemAuthority()) {
                    if ($tx_expense) log_finance($pdo, 'Income', $tx_expense['amount'], 'System', 'Recharge Refund', $u['id'], "Refund Cost for $target_user_id");
                    if ($tx_income) log_finance($pdo, 'Expense', $tx_income['amount'], 'System', 'Recharge Refund', $u['id'], "Refund Collection from $target_user_id");
                } else {
                    if ($tx_income && $tx_expense) {
                        $profit = floatval($tx_income['amount']) - floatval($tx_expense['amount']);
                        $pdo->prepare("INSERT INTO ".TBL_STAFF_PROFIT." (staff_id, client_id, client_user_id, bill_amount, package_cost, profit, source) VALUES (?, ?, ?, ?, ?, ?, ?)")->execute([$user, $u['id'], $target_user_id, -$tx_income['amount'], -$tx_expense['amount'], -$profit, 'Voided Recharge']);
                    }
                }
                
                $current_date = $u['current_bill_date'];
                $newDate = date('Y-m-d', strtotime($current_date . " - $days_to_remove days"));
                
                $status = $u['status'];
                if ($newDate <= date('Y-m-d')) {
                     $status = 'Expire';
                     $pdo->prepare("UPDATE ".TBL_USERS." SET current_bill_date=?, status=?, bill_position='Expire' WHERE id=?")->execute([$newDate, $status, $uid]);
                     $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id={$u['router_id']}");
                     if($r) { 
                         require_once __DIR__ . '/../classes/MikrotikApp.php';
                         $mk = new MikrotikApp($r); 
                         $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
                         $profile = $svc ? $svc['mikrotik_profile_name'] : '';
                         $mk->toggle($target_user_id, false, $profile); 
                     }
                } else {
                     $pdo->prepare("UPDATE ".TBL_USERS." SET current_bill_date=? WHERE id=?")->execute([$newDate, $uid]);
                }
                
                writeLog($pdo, $_SESSION['admin_username'], 'Undo Recharge', $uid, "Reverted $days_to_remove days. Wallet fully refunded.");
                $pdo->prepare("DELETE FROM ".TBL_LOGS." WHERE id=?")->execute([$log_id]);
                $_SESSION['flash_msg'] = "Recharge successfully undone! Days reverted and Wallet refunded.";
            } else {
                $_SESSION['flash_error'] = "Could not identify days from recharge log.";
            }
        } else {
             $_SESSION['flash_error'] = "This recharge is older than 24 hours or has already been reversed.";
        }
    } else {
        $_SESSION['flash_error'] = "You do not have permission to refund recharges.";
    }
    header("Location: ?view_id=$uid");
    exit;
}
// --- AUTO LOGIN ---
if (!isLoggedIn() && isset($_COOKIE['remember_uid']) && isset($_COOKIE['remember_token'])) {
    $r_uid = intval($_COOKIE['remember_uid']);
    $r_token = $_COOKIE['remember_token'];
    $stmt = $pdo->prepare("SELECT * FROM ".TBL_STAFF." WHERE id=?");
    $stmt->execute([$r_uid]);
    $u = $stmt->fetch();
    if ($u) {
        $expected_token = hash_hmac('sha256', $u['id'] . '|' . $u['username'] . '|' . $u['password'], get_app_encryption_key());
        if (hash_equals($expected_token, $r_token)) {
             $_SESSION['admin_logged_in'] = true; 
             $_SESSION['admin_id'] = $u['id']; 
             $_SESSION['admin_username'] = $u['username']; 
             $_SESSION['user_role'] = $u['role']; 
             $_SESSION['user_balance'] = $u['balance'];
             $_SESSION['parent_id'] = $u['parent_id'] ?? 0;
             $_SESSION['user_permissions'] = json_decode($u['permissions'] ?? '[]', true);
             $_SESSION['tenant_id'] = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
             $_SESSION['app_deployment_id'] = defined('APP_DEPLOYMENT_ID') ? APP_DEPLOYMENT_ID : '20260629_153151';
             if (empty($_SESSION['csrf_token'])) {
                 $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
             }
             $user = $_SESSION['admin_id'];
             $role = $_SESSION['user_role'];
        }
    }
}// --- GLOBAL CACHE HELPER ---
if (!function_exists('get_global_online_cache_path')) {
    function get_global_online_cache_path() {
        $suffix = '';
        if (defined('TENANT_OVERRIDE')) {
            $suffix = '_' . TENANT_OVERRIDE;
        } elseif (defined('CURRENT_TENANT')) {
            $suffix = '_' . CURRENT_TENANT;
        }
        return __DIR__ . '/../cache/global_online' . $suffix . '.json';
    }
}

if (!function_exists('get_global_online_lock_path')) {
    function get_global_online_lock_path() {
        $suffix = '';
        if (defined('TENANT_OVERRIDE')) {
            $suffix = '_' . TENANT_OVERRIDE;
        } elseif (defined('CURRENT_TENANT')) {
            $suffix = '_' . CURRENT_TENANT;
        }
        return __DIR__ . '/../cache/global_online' . $suffix . '.lock';
    }
}

function get_global_online_users($pdo, $force_refresh = false, $sync_sessions = true, $auto_refresh_stale = false) {
    $cache_dir = __DIR__ . '/../cache';
    if (!is_dir($cache_dir)) @mkdir($cache_dir, 0777, true);
    $cache_file = get_global_online_cache_path();
    // Keep the shared tenant cache slightly shorter than the dashboard's 10-second poll.
    // This makes the chart genuinely live while still ensuring multiple browser tabs reuse one RouterOS poll.
    $cache_time = 8;

    // Preserve the legacy cache-only behavior for ordinary web pages. The live usage
    // dashboard opts into stale-cache auto refresh explicitly, while CLI workers also keep
    // the short TTL behavior.
    if (!$force_refresh && file_exists($cache_file)) {
        $cache_age = time() - filemtime($cache_file);
        $web_cache_only = (php_sapi_name() !== 'cli' && !$auto_refresh_stale);
        if ($web_cache_only || $cache_age < $cache_time) {
            $cached = json_decode(@file_get_contents($cache_file), true);
            $data = isset($cached['data']) ? $cached['data'] : $cached;
            return is_array($data) ? $data : [];
        }
    }

    // Real file lock instead of a timestamp lock file. The old lock could leave the
    // dashboard serving a stale sample (including after Sync Now) when a previous web/cron
    // request overlapped. flock is released automatically if PHP exits unexpectedly.
    $lock_file = get_global_online_lock_path();
    $lock_fp = @fopen($lock_file, 'c');
    $got_lock = false;
    if ($lock_fp) {
        $attempts = $force_refresh ? 15 : 1; // manual Sync Now may wait ~1.5s for an in-flight poll
        for ($i = 0; $i < $attempts; $i++) {
            if (@flock($lock_fp, LOCK_EX | LOCK_NB)) {
                $got_lock = true;
                break;
            }
            if ($force_refresh) usleep(100000);
        }
    }
    if (!$got_lock) {
        if (is_resource($lock_fp)) @fclose($lock_fp);
        if (file_exists($cache_file)) {
            $cached = json_decode(@file_get_contents($cache_file), true);
            $data = isset($cached['data']) ? $cached['data'] : $cached;
            return is_array($data) ? $data : [];
        }
        return [];
    }
    
    $online_data = [];
    $any_router_failed = false;
    $routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS);
    
    // Check TBL_ROUTERS columns dynamically
    $router_cols = [];
    try {
        $q_rcols = $pdo->query("SHOW COLUMNS FROM " . TBL_ROUTERS);
        if ($q_rcols) {
            while ($col = $q_rcols->fetch(PDO::FETCH_ASSOC)) {
                $router_cols[] = strtolower($col['Field']);
            }
        }
    } catch (Exception $e) {
        // Fallback
    }
    
    // Optimization: Fetch all users in one go to map user_id to internal ID and match casing
    $user_map = [];
    $db_users_cased = [];
    $all_users = $pdo->query("SELECT id, user_id FROM ".TBL_USERS)->fetchAll(PDO::FETCH_ASSOC);
    foreach($all_users as $u) {
        if (!empty($u['user_id'])) {
            $user_map[$u['user_id']] = $u['id'];
            $db_users_cased[strtolower(trim($u['user_id']))] = $u['user_id'];
        }
    }

    foreach ($routers as $r) {
        $r_name = $r['name'] ?? 'Unknown';
        try {
            $timeout = defined('MIKROTIK_TIMEOUT') ? MIKROTIK_TIMEOUT : 5;
            $mk = new MikrotikApp($r, $timeout);
            if (!$mk->isOnline()) {
                throw new Exception("Could not connect to Mikrotik router (IP: {$r['ip_address']})");
            }
            
            $active = $mk->getOnlineUsers();
            if (!is_array($active)) {
                throw new Exception("Router returned invalid active session response");
            }
            
            $router_active_usernames = [];
            
            foreach ($active as $p) {
                if (isset($p['name'])) {
                    $username = $p['name'];
                    
                    // Normalize casing to match the database casing
                    $lower_uname = strtolower(trim($username));
                    $matched_username = isset($db_users_cased[$lower_uname]) ? $db_users_cased[$lower_uname] : $username;
                    
                    $router_active_usernames[] = $matched_username;
                    
                    $online_data[$matched_username] = [
                        'uptime' => $p['uptime'] ?? '00:00:00',
                        'upload' => (float)($p['bytes-in'] ?? 0),
                        'download' => (float)($p['bytes-out'] ?? 0),
                        'address' => $p['address'] ?? '',
                        'caller_id' => $p['caller-id'] ?? '',
                        'router_name' => $r['name'],
                        'router_id' => (int)$r['id']
                    ];
                    
                    // SYNC SESSION TO DATABASE (The "No-Cron" Magic)
                    // Only run database sync for small setups (< 150 active) or CLI (Cron) to prevent browser timeouts
                    if ($sync_sessions && (count($active) < 150 || php_sapi_name() === 'cli') && isset($user_map[$matched_username])) {
                        $mk->syncSession(
                            $pdo, 
                            $user_map[$matched_username], 
                            $r['id'], 
                            $matched_username, 
                            (float)($p['bytes-in'] ?? 0), 
                            (float)($p['bytes-out'] ?? 0), 
                            $p['uptime'] ?? '00:00:00'
                        );
                    }
                }
            }
            
            // Handle sessions that went offline (marked active in DB but not in Mikrotik list)
            // Only run database update for small setups (< 150 active) or CLI (Cron) to prevent browser timeouts
            if ($sync_sessions && (count($active) < 150 || php_sapi_name() === 'cli')) {
                if (!empty($router_active_usernames)) {
                    $placeholders = implode(',', array_fill(0, count($router_active_usernames), '?'));
                    $pdo->prepare("UPDATE " . TBL_SESSIONS . " 
                            SET status = 'closed', 
                                ended_at = NOW(),
                                total_rx_bytes = GREATEST(0, last_rx_bytes - start_rx_bytes),
                                total_tx_bytes = GREATEST(0, last_tx_bytes - start_tx_bytes)
                            WHERE router_id = ? AND status = 'active' AND mikrotik_username NOT IN ($placeholders)")
                        ->execute(array_merge([$r['id']], $router_active_usernames));
                } else {
                    // If router returned NO users, close ALL active sessions for this router in DB
                    $pdo->prepare("UPDATE " . TBL_SESSIONS . " 
                        SET status = 'closed', 
                            ended_at = NOW(),
                            total_rx_bytes = GREATEST(0, last_rx_bytes - start_rx_bytes),
                            total_tx_bytes = GREATEST(0, last_tx_bytes - start_tx_bytes)
                        WHERE router_id = ? AND status = 'active'")
                    ->execute([$r['id']]);
                }
            }
            
            // Save router status as online if columns exist
            if (in_array('status', $router_cols) && in_array('last_seen', $router_cols)) {
                $pdo->prepare("UPDATE ".TBL_ROUTERS." SET status='Online', last_seen=NOW() WHERE id=?")
                    ->execute([$r['id']]);
            }
                
        } catch (Throwable $e) {
            $any_router_failed = true;
            
            // Save router status as offline only if it has been failing for more than 15 minutes and status column exists
            if (in_array('status', $router_cols)) {
                $last_seen = (in_array('last_seen', $router_cols) && !empty($r['last_seen'])) ? strtotime($r['last_seen']) : 0;
                if (time() - $last_seen > 900) { // 15 minutes
                    $pdo->prepare("UPDATE ".TBL_ROUTERS." SET status='Offline' WHERE id=?")
                        ->execute([$r['id']]);
                }
            }
            safe_log('debug_ajax', "Router Error ($r_name): " . $e->getMessage());
        }
    }
    
    // Save to cache file using atomic write ONLY if all routers succeeded
    if (!$any_router_failed) {
        $cache_content = [
            'metadata' => [
                'updated_at' => time(),
                // High-resolution timestamp + unique sample id are used by the Live Usage
                // dashboard. filemtime() only has 1-second precision and can be stat-cached.
                'sampled_at' => microtime(true),
                'sample_id' => uniqid('live_', true),
                'source' => php_sapi_name() === 'cli' ? 'cron' : 'web',
                'count' => count($online_data)
            ],
            'data' => $online_data
        ];
        $temp_file = $cache_file . '.' . uniqid('', true) . '.tmp';
        if (@file_put_contents($temp_file, json_encode($cache_content)) !== false) {
            @rename($temp_file, $cache_file);
        }
    } else {
        safe_log('debug_ajax', "Skipping cache write due to router API failure. Existing cache preserved.");
        // If we have an existing cache, use it instead of returning empty/partial data
        if (file_exists($cache_file)) {
            $cached = json_decode(@file_get_contents($cache_file), true);
            $online_data = isset($cached['data']) ? $cached['data'] : $cached;
        }
    }
    
    if ($got_lock && is_resource($lock_fp)) {
        @flock($lock_fp, LOCK_UN);
        @fclose($lock_fp);
    }
    return $online_data;
}

// --- AJAX BW HANDLER: SPEED-BASED ACCUMULATION (NO CRON NEEDED) ---
if (isset($_GET['ajax_bw'])) {
    if (defined('APP_DEBUG') && APP_DEBUG) {
        @ini_set('display_errors', 1);
        @ini_set('display_startup_errors', 1);
        @error_reporting(E_ALL);
    } else {
        @ini_set('display_errors', 0);
        @ini_set('display_startup_errors', 0);
        @ini_set('log_errors', 1);
        @error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
    }
    $uid = intval($_GET['uid']);
    $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$uid]);

    $result = [
        'up_speed' => 0, 'down_speed' => 0,
        'status'   => 'offline', 'uptime' => '00:00:00',
        'session_rx' => 0, 'session_tx' => 0, 'session_total' => 0,
        'daily_rx'   => 0, 'daily_tx'   => 0, 'daily_total'   => 0,
        'ip' => '', 'mac' => ''
    ];

    if ($u && $u['router_id'] > 0) {
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
        if ($r) {
            $mk  = new MikrotikApp($r, 2);
            $bw  = $mk->traffic($u['user_id'], true);
            $now = time();

            if ($bw && $bw['status'] === 'online') {
                $result = array_merge($result, $bw);

                $down_mbps   = (float)($bw['down_speed'] ?? 0);   // Mbps download
                $up_mbps     = (float)($bw['up_speed']   ?? 0);   // Mbps upload
                $uptime_str  = $bw['uptime'] ?? '0:00:00';
                $uptime_secs = MikrotikApp::parseUptime($uptime_str);

                // ── Find or create active DB session ──────────────────────────
                $sess = safeFetch($pdo,
                    "SELECT * FROM ".TBL_SESSIONS." WHERE client_id=? AND status='active' ORDER BY id DESC LIMIT 1",
                    [$u['id']]
                );

                $is_new_session = false;

                if ($sess) {
                    // Detect reconnect: MikroTik uptime << expected age of DB session
                    $db_age_secs    = $now - strtotime($sess['started_at']);
                    $uptime_slipped = ($uptime_secs < ($db_age_secs - 180)); // 3-min tolerance

                    if ($uptime_slipped) {
                        // Reconnected! Close old session with final totals
                        $pdo->prepare("UPDATE ".TBL_SESSIONS." SET
                            status='closed', ended_at=NOW(),
                            total_rx_bytes = last_rx_bytes,
                            total_tx_bytes = last_tx_bytes
                            WHERE id=?")->execute([$sess['id']]);
                        $sess = null;
                        $is_new_session = true;
                    }
                } else {
                    $is_new_session = true;
                }

                if ($is_new_session || !$sess) {
                    // Create a brand-new session starting from 0
                    $started_at = date('Y-m-d H:i:s', $now - $uptime_secs);
                    $key = hash('sha256', $u['user_id'].'_'.$r['id'].'_'.$started_at.'_'.uniqid());
                    $pdo->prepare("INSERT INTO ".TBL_SESSIONS."
                        (client_id, mikrotik_username, router_id, session_key,
                         start_rx_bytes, start_tx_bytes, last_rx_bytes, last_tx_bytes,
                         started_at, status)
                        VALUES (?,?,?,?, 0,0,0,0, ?, 'active')")
                        ->execute([$u['id'], $u['user_id'], $r['id'], $key, $started_at]);
                    $sess = safeFetch($pdo,
                        "SELECT * FROM ".TBL_SESSIONS." WHERE client_id=? AND status='active' ORDER BY id DESC LIMIT 1",
                        [$u['id']]
                    );
                }

                // ── Accumulate bytes for elapsed time since last poll ─────────
                if ($sess) {
                    $last_ts      = strtotime($sess['last_updated'] ?? $sess['started_at']);
                    $elapsed_secs = max(1, min($now - $last_ts, 30)); // cap at 30s to handle tab-reopen

                    // bytes = Mbps × 1,000,000 / 8 × seconds
                    $rx_bytes_inc = (int)round($down_mbps * 125000 * $elapsed_secs);
                    $tx_bytes_inc = (int)round($up_mbps   * 125000 * $elapsed_secs);

                    if ($rx_bytes_inc > 0 || $tx_bytes_inc > 0) {
                        // Update session totals
                        $pdo->prepare("UPDATE ".TBL_SESSIONS." SET
                            last_rx_bytes = last_rx_bytes + ?,
                            last_tx_bytes = last_tx_bytes + ?,
                            last_updated  = NOW()
                            WHERE id=?")
                            ->execute([$rx_bytes_inc, $tx_bytes_inc, $sess['id']]);

                        // Accumulate daily traffic
                        $pdo->prepare("INSERT INTO ".TBL_DAILY_TRAFFIC."
                            (client_id, traffic_date, rx_bytes, tx_bytes)
                            VALUES (?, CURDATE(), ?, ?)
                            ON DUPLICATE KEY UPDATE
                                rx_bytes = rx_bytes + VALUES(rx_bytes),
                                tx_bytes = tx_bytes + VALUES(tx_bytes)")
                            ->execute([$u['id'], $rx_bytes_inc, $tx_bytes_inc]);
                    } else {
                        // Still update timestamp so next elapsed calc is fresh
                        $pdo->prepare("UPDATE ".TBL_SESSIONS." SET last_updated=NOW() WHERE id=?")
                            ->execute([$sess['id']]);
                    }

                    // Re-read updated session totals
                    $sess = safeFetch($pdo,
                        "SELECT * FROM ".TBL_SESSIONS." WHERE id=?", [$sess['id']]
                    );
                    $result['session_rx']    = (float)($sess['last_rx_bytes'] ?? 0);
                    $result['session_tx']    = (float)($sess['last_tx_bytes'] ?? 0);
                    $result['session_total'] = $result['session_rx'] + $result['session_tx'];
                    $result['started_at']    = $sess['started_at'];
                }

            } else {
                // ── OFFLINE: close any stale active sessions ──────────────────
                $pdo->prepare("UPDATE ".TBL_SESSIONS." SET
                    status='closed', ended_at=NOW(),
                    total_rx_bytes = last_rx_bytes,
                    total_tx_bytes = last_tx_bytes
                    WHERE client_id=? AND status='active'")
                    ->execute([$u['id']]);

                // Return last session info
                $last = safeFetch($pdo,
                    "SELECT * FROM ".TBL_SESSIONS."
                     WHERE client_id=? AND status='closed'
                     ORDER BY ended_at DESC LIMIT 1",
                    [$u['id']]
                );
                if ($last) {
                    $result['last_session_ended'] = $last['ended_at'];
                    $result['last_session_total'] = (float)$last['total_rx_bytes'] + (float)$last['total_tx_bytes'];
                }
            }

            // ── Daily totals (always show) ────────────────────────────────────
            $daily = safeFetch($pdo,
                "SELECT * FROM ".TBL_DAILY_TRAFFIC." WHERE client_id=? AND traffic_date=CURDATE()",
                [$u['id']]
            );
            if ($daily) {
                $result['daily_rx']    = (float)$daily['rx_bytes'];
                $result['daily_tx']    = (float)$daily['tx_bytes'];
                $result['daily_total'] = $result['daily_rx'] + $result['daily_tx'];
            }
        }
    }

    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode($result);
    exit;
}



// --- AJAX STATUS HANDLER (CHECK ONLINE TARGET UIDs) ---
if (isset($_GET['ajax_status'])) {
    if (defined('APP_DEBUG') && APP_DEBUG) {
        @ini_set('display_errors', 1);
        @error_reporting(E_ALL);
    } else {
        @ini_set('display_errors', 0);
        @ini_set('log_errors', 1);
        @error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
    }
    while (ob_get_level() > 0) ob_end_clean();
    
    $online_data = get_global_online_users($pdo);
    
    if (isset($_GET['uids'])) {
        $uids = array_filter(explode(',', $_GET['uids']));
        $res = [];
        
        // 1. Build lookup indexes once before loop to achieve O(1) performance
        $online_key_set = [];
        $online_ip_set = [];
        $online_mac_set = [];
        
        foreach ($online_data as $ckey => $cval) {
            $online_key_set[strtolower(trim($ckey))] = true;
            
            if (!empty($cval['address'])) {
                $online_ip_set[trim($cval['address'])] = true;
            }
            
            if (!empty($cval['caller_id'])) {
                $mac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $cval['caller_id']));
                if ($mac !== '') {
                    $online_mac_set[$mac] = true;
                }
            }
        }
        
        // Fetch all requested users in one single query to optimize DB roundtrips
        $users_map = [];
        if (!empty($uids)) {
            $trimmed_uids = array_map('trim', $uids);
            $placeholders = implode(',', array_fill(0, count($trimmed_uids), '?'));
            $u_rows = safeFetchAll($pdo, "SELECT * FROM " . TBL_USERS . " WHERE user_id IN ($placeholders)", $trimmed_uids);
            if (is_array($u_rows)) {
                foreach ($u_rows as $row) {
                    if (!empty($row['user_id'])) {
                        $users_map[$row['user_id']] = $row;
                    }
                }
            }
        }
        
        foreach ($uids as $uid) {
            $uid = trim($uid);
            $is_online = false;
            
            // Check exact or case-insensitive cache key using O(1) lookup
            $lower_uid = strtolower($uid);
            if (isset($online_key_set[$lower_uid])) {
                $is_online = true;
            }
            
            // Check alternative database identifiers, IP, or MAC using O(1) lookup
            if (!$is_online && isset($users_map[$uid])) {
                $u = $users_map[$uid];
                $possible_keys = [];
                if (!empty($u['user_id'])) $possible_keys[] = $u['user_id'];
                if (!empty($u['pppoe_username'])) $possible_keys[] = $u['pppoe_username'];
                if (!empty($u['mikrotik_username'])) $possible_keys[] = $u['mikrotik_username'];
                if (!empty($u['username'])) $possible_keys[] = $u['username'];
                if (!empty($u['name'])) $possible_keys[] = $u['name'];
                
                // Check if any of these match the cache keys
                foreach ($possible_keys as $pkey) {
                    if (isset($online_key_set[strtolower(trim($pkey))])) {
                        $is_online = true;
                        break;
                    }
                }
                
                // Check by IP address
                if (!$is_online) {
                    $ip = trim($u['assigned_ip'] ?? $u['live_ip'] ?? $u['ip'] ?? '');
                    if ($ip !== '' && isset($online_ip_set[$ip])) {
                        $is_online = true;
                    }
                }
                
                // Check by MAC address
                if (!$is_online) {
                    $mac = $u['onu_mac'] ?? $u['live_mac'] ?? $u['mac'] ?? '';
                    if (!empty($mac)) {
                        $clean_mac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $mac));
                        if ($clean_mac !== '' && isset($online_mac_set[$clean_mac])) {
                            $is_online = true;
                        }
                    }
                }
            }
            
            $res[$uid] = $is_online;
        }
    } else {
        $res = array_keys($online_data);
    }
    
    header('Content-Type: application/json');
    echo json_encode($res);
    exit;
}

// --- AJAX MAP CLIENTS FOR monitoring MAP ---
if (isset($_GET['ajax_map_clients'])) {
    $managed_ids = getManagedStaffIds($pdo, $_SESSION['admin_id'], $_SESSION['user_role']);
    
    $query = "SELECT u.id, u.name, u.phone, u.user_package, u.user_id, u.last_seen, u.lat_long, u.address, r.name as router_name 
              FROM ".TBL_USERS." u 
              LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id 
              WHERE u.status IN ('Active', 'Expire')";
    $params = [];

    if ($managed_ids !== 'ALL') {
        $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
        $query .= " AND u.manager_id IN ($placeholders)";
        $params = $managed_ids;
    } elseif (isset($_GET['f_manager'])) {
        if (!empty($_GET['f_manager'])) {
            $query .= " AND u.manager_id = ?";
            $params[] = $_GET['f_manager'];
        }
    } else {
        // Default Admin View: Only show own clients
        $query .= " AND u.manager_id = ?";
        $params[] = $_SESSION['admin_id'];
    }

    $users = safeFetchAll($pdo, $query, $params);

    // Fetch global online data from cache
    $cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../cache/global_online.json';
    $cache_raw = file_exists($cache_file) ? json_decode(file_get_contents($cache_file), true) : [];
    $online_data = isset($cache_raw['data']) ? $cache_raw['data'] : $cache_raw;

    $response_clients = [];
    foreach ($users as $u) {
        $lat_long = trim($u['lat_long'] ?? '');
        if (empty($lat_long) || $lat_long === '0' || $lat_long === '0.000000' || strcasecmp($lat_long, 'null') === 0) {
            continue;
        }

        $parts = explode(',', $lat_long);
        if (count($parts) !== 2) {
            continue;
        }

        $lat_raw = trim($parts[0]);
        $lng_raw = trim($parts[1]);

        if (!is_numeric($lat_raw) || !is_numeric($lng_raw)) {
            continue;
        }

        $lat = (float)$lat_raw;
        $lng = (float)$lng_raw;

        // Validate range: Latitude between -90 and 90, Longitude between -180 and 180
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            continue;
        }

        // Reject exact (0,0) as invalid GPS
        if ($lat === 0.0 && $lng === 0.0) {
            continue;
        }

        $is_online = isset($online_data[$u['user_id']]);
        
        // Find IP address from online cache if available
        $ip = '';
        if ($is_online && isset($online_data[$u['user_id']]['address'])) {
            $ip = $online_data[$u['user_id']]['address'];
        }

        $response_clients[] = [
            'id' => $u['user_id'],
            'client_id' => $u['user_id'],
            'name' => $u['name'],
            'client_name' => $u['name'],
            'status' => $is_online ? 'online' : 'offline',
            'lat' => $lat,
            'latitude' => $lat,
            'lng' => $lng,
            'longitude' => $lng,
            'ip' => $ip,
            'ip_address' => $ip,
            'router' => $u['router_name'] ?? 'N/A'
        ];
    }

    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode($response_clients);
    exit;
}

// --- AJAX MONITORING HANDLER FOR MONITORING TAB ---
if (isset($_GET['ajax_monitoring'])) {
    $online_data = get_global_online_users($pdo);
    
    if (!empty($online_data)) {
        $usernames = array_keys($online_data);
        $placeholders = implode(',', array_fill(0, count($usernames), '?'));
        $pdo->prepare("UPDATE ".TBL_USERS." SET last_seen = CURRENT_TIMESTAMP WHERE user_id IN ($placeholders)")->execute($usernames);
    }

    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['status' => 'success', 'data' => $online_data]);
    exit;
}

    
// --- AJAX ROUTER STATUS HANDLER ---
if (isset($_GET['ajax_router_status'])) {
    if (defined('APP_DEBUG') && APP_DEBUG) {
        @ini_set('display_errors', 1);
        @error_reporting(E_ALL);
    } else {
        @ini_set('display_errors', 0);
        @ini_set('log_errors', 1);
        @error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
    }
    
    if (!hasRole('Admin') && !isOffice()) {
        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/json');
        echo json_encode(['online' => false, 'error' => 'Access Denied']);
        exit;
    }
    
    $id = intval($_GET['id']);
    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$id]);
    $res = ['online' => false];
    if ($r) {
        $timeout = 2; // 2 seconds timeout
        $mk = new MikrotikApp($r, $timeout);
        $res['online'] = $mk->isOnline();
    }
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode($res);
    exit;
}
    

// --- AJAX ROUTER WORKSPACE METRICS ---
// Read-only MikroTik monitoring endpoint used by the Router Workspace UI.
// It does not change router configuration and intentionally returns no credentials.
if (isset($_GET['ajax_router_workspace'])) {
    if (!hasRole('Admin') && !isOffice()) {
        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'online' => false, 'message' => 'Access Denied']);
        exit;
    }

    $id = intval($_GET['id'] ?? 0);
    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$id]);
    if (!$r) {
        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'online' => false, 'message' => 'Router not found']);
        exit;
    }

    $response = [
        'success' => true,
        'online' => false,
        'router' => [
            'id' => (int)$r['id'],
            'name' => (string)$r['name'],
            'ip' => (string)$r['ip_address'],
            'port' => null,
        ],
        'identity' => (string)$r['name'],
        'resource' => [],
        'routerboard' => [],
        'health' => [],
        'interfaces' => [],
        'active_ports' => 0,
        'total_ports' => 0,
        'active_interfaces' => 0,
        'total_interfaces' => 0,
        'pppoe_active' => 0,
        'total_secrets' => 0,
        'profiles' => 0,
        'latency_ms' => null,
        'traffic' => null,
        'collected_at' => date('c'),
    ];

    try {
        // A short API timeout keeps the management page responsive when a router is unreachable.
        $mk = new MikrotikApp($r, 3);
        $client = $mk->getClient();
        if (!$client) {
            throw new Exception($mk->error ?: 'Unable to initialize MikroTik API client');
        }

        $t0 = microtime(true);
        $identityRows = $client->query(new \RouterOS\Query('/system/identity/print'))->read();
        $response['latency_ms'] = round((microtime(true) - $t0) * 1000, 2);
        $response['online'] = true;
        if (!empty($identityRows[0]['name'])) $response['identity'] = (string)$identityRows[0]['name'];

        // Traffic polling is deliberately a small/fast request. When an interface
        // is supplied, return its one-shot counters immediately instead of also
        // re-reading every resource/interface/PPP table every 5 seconds.
        $trafficInterface = trim((string)($_GET['interface'] ?? ''));
        if ($trafficInterface !== '') {
            try {
                $q = new \RouterOS\Query('/interface/monitor-traffic');
                $q->equal('interface', $trafficInterface)->equal('once');
                $trafficRows = $client->query($q)->read();
                if (!empty($trafficRows[0]) && is_array($trafficRows[0])) {
                    $tr = $trafficRows[0];
                    $response['traffic'] = [
                        'interface' => $trafficInterface,
                        'rx_bps' => (float)($tr['rx-bits-per-second'] ?? ($tr['rx-rate'] ?? 0)),
                        'tx_bps' => (float)($tr['tx-bits-per-second'] ?? ($tr['tx-rate'] ?? 0)),
                        'rx_pps' => (float)($tr['rx-packets-per-second'] ?? 0),
                        'tx_pps' => (float)($tr['tx-packets-per-second'] ?? 0),
                    ];
                }
            } catch (Throwable $ignore) {}

            while (ob_get_level() > 0) ob_end_clean();
            header('Content-Type: application/json');
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
            echo json_encode($response);
            exit;
        }

        try {
            $resourceRows = $client->query(new \RouterOS\Query('/system/resource/print'))->read();
            if (!empty($resourceRows[0]) && is_array($resourceRows[0])) {
                $res = $resourceRows[0];
                $totalMem = (float)($res['total-memory'] ?? 0);
                $freeMem = (float)($res['free-memory'] ?? 0);
                $memoryPct = $totalMem > 0 ? round((($totalMem - $freeMem) / $totalMem) * 100, 2) : null;
                $response['resource'] = [
                    'uptime' => (string)($res['uptime'] ?? ''),
                    'version' => (string)($res['version'] ?? ''),
                    'build_time' => (string)($res['build-time'] ?? ''),
                    'cpu' => (string)($res['cpu'] ?? ''),
                    'cpu_count' => (int)($res['cpu-count'] ?? 0),
                    'cpu_frequency' => (string)($res['cpu-frequency'] ?? ''),
                    'cpu_load' => (float)($res['cpu-load'] ?? 0),
                    'free_memory' => $freeMem,
                    'total_memory' => $totalMem,
                    'memory_percent' => $memoryPct,
                    'free_hdd_space' => (float)($res['free-hdd-space'] ?? 0),
                    'total_hdd_space' => (float)($res['total-hdd-space'] ?? 0),
                    'architecture' => (string)($res['architecture-name'] ?? ''),
                    'board_name' => (string)($res['board-name'] ?? ''),
                    'platform' => (string)($res['platform'] ?? 'MikroTik'),
                ];
            }
        } catch (Throwable $ignore) {}

        try {
            $rbRows = $client->query(new \RouterOS\Query('/system/routerboard/print'))->read();
            if (!empty($rbRows[0]) && is_array($rbRows[0])) {
                $rb = $rbRows[0];
                $response['routerboard'] = [
                    'model' => (string)($rb['model'] ?? ''),
                    'serial_number' => (string)($rb['serial-number'] ?? ''),
                    'current_firmware' => (string)($rb['current-firmware'] ?? ''),
                    'upgrade_firmware' => (string)($rb['upgrade-firmware'] ?? ''),
                    'factory_firmware' => (string)($rb['factory-firmware'] ?? ''),
                ];
            }
        } catch (Throwable $ignore) {}

        try {
            $healthRows = $client->query(new \RouterOS\Query('/system/health/print'))->read();
            if (is_array($healthRows) && !empty($healthRows)) {
                // RouterOS versions expose health either as one associative row
                // or as name/value rows. Normalize both without assuming a model.
                $h = [];
                foreach ($healthRows as $healthRow) {
                    if (!is_array($healthRow)) continue;
                    if (isset($healthRow['name']) && array_key_exists('value', $healthRow)) {
                        $h[(string)$healthRow['name']] = $healthRow['value'];
                    } else {
                        $h = array_merge($h, $healthRow);
                    }
                }
                $temperature = $h['temperature'] ?? ($h['cpu-temperature'] ?? ($h['board-temperature1'] ?? null));
                $response['health'] = [
                    'temperature' => $temperature,
                    'voltage' => $h['voltage'] ?? null,
                    'fan1_speed' => $h['fan1-speed'] ?? null,
                    'fan2_speed' => $h['fan2-speed'] ?? null,
                ];
            }
        } catch (Throwable $ignore) {}

        try {
            $ifaceRows = $client->query(new \RouterOS\Query('/interface/print'))->read();
            if (is_array($ifaceRows)) {
                foreach ($ifaceRows as $iface) {
                    if (!is_array($iface) || empty($iface['name'])) continue;
                    $running = strtolower((string)($iface['running'] ?? 'false')) === 'true';
                    $disabled = strtolower((string)($iface['disabled'] ?? 'false')) === 'true';
                    $type = strtolower((string)($iface['type'] ?? ''));
                    $isPhysical = in_array($type, ['ether','wlan','wifi','lte','5g'], true);
                    $response['total_interfaces']++;
                    if ($running && !$disabled) $response['active_interfaces']++;
                    if ($isPhysical) {
                        $response['total_ports']++;
                        if ($running && !$disabled) $response['active_ports']++;
                    }
                    $response['interfaces'][] = [
                        'id' => (string)($iface['.id'] ?? ''),
                        'name' => (string)$iface['name'],
                        'type' => (string)($iface['type'] ?? ''),
                        'physical' => $isPhysical,
                        'running' => $running,
                        'disabled' => $disabled,
                        'mtu' => (string)($iface['actual-mtu'] ?? ($iface['mtu'] ?? '')),
                        'mac_address' => (string)($iface['mac-address'] ?? ''),
                        'rx_byte' => (float)($iface['rx-byte'] ?? 0),
                        'tx_byte' => (float)($iface['tx-byte'] ?? 0),
                        'rx_packet' => (float)($iface['rx-packet'] ?? 0),
                        'tx_packet' => (float)($iface['tx-packet'] ?? 0),
                        'rx_error' => (float)($iface['rx-error'] ?? 0),
                        'tx_error' => (float)($iface['tx-error'] ?? 0),
                        'link_downs' => (int)($iface['link-downs'] ?? 0),
                        'comment' => (string)($iface['comment'] ?? ''),
                    ];
                }
                // total_ports tracks physical ports; total_interfaces includes bridges, VLANs, tunnels, etc.
            }
        } catch (Throwable $ignore) {}

        try {
            $rows = $client->query(new \RouterOS\Query('/ppp/active/print'))->read();
            $response['pppoe_active'] = is_array($rows) ? count($rows) : 0;
        } catch (Throwable $ignore) {}
        try {
            $rows = $client->query(new \RouterOS\Query('/ppp/secret/print'))->read();
            $response['total_secrets'] = is_array($rows) ? count($rows) : 0;
        } catch (Throwable $ignore) {}
        try {
            $rows = $client->query(new \RouterOS\Query('/ppp/profile/print'))->read();
            $response['profiles'] = is_array($rows) ? count($rows) : 0;
        } catch (Throwable $ignore) {}

    } catch (Throwable $e) {
        $response['success'] = false;
        $response['online'] = false;
        $response['message'] = $e->getMessage();
    }

    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode($response);
    exit;
}

// --- AJAX MIKROTIK PPP PROFILE LOADER ---
// Used by Package Manager. Read-only and safe to call repeatedly.
if (isset($_GET['ajax_router_profiles'])) {
    if (!hasRole('Admin') && !isOffice()) {
        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'profiles' => [], 'message' => 'Access Denied']);
        exit;
    }

    $id = intval($_GET['id'] ?? 0);
    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$id]);
    $out = ['success' => false, 'online' => false, 'profiles' => []];
    if ($r) {
        try {
            $mk = new MikrotikApp($r, 3);
            $client = $mk->getClient();
            if (!$client) throw new Exception($mk->error ?: 'Router API unavailable');
            $rows = $client->query(new \RouterOS\Query('/ppp/profile/print'))->read();
            $out['online'] = true;
            $out['success'] = true;
            if (is_array($rows)) {
                foreach ($rows as $row) {
                    if (!is_array($row) || empty($row['name'])) continue;
                    $out['profiles'][] = [
                        'name' => (string)$row['name'],
                        'rate_limit' => (string)($row['rate-limit'] ?? ''),
                        'local_address' => (string)($row['local-address'] ?? ''),
                        'remote_address' => (string)($row['remote-address'] ?? ''),
                    ];
                }
                usort($out['profiles'], static fn($a, $b) => strnatcasecmp($a['name'], $b['name']));
            }
        } catch (Throwable $e) {
            $out['message'] = $e->getMessage();
        }
    } else {
        $out['message'] = 'Router not found';
    }
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode($out);
    exit;
}

// --- AJAX RATES HANDLER FOR STAFF ---
if (isset($_GET['ajax_get_rates'])) {
    $staff_id = intval($_GET['staff_id']);
    
    $sell_rates = [];
    $stmt = $pdo->prepare("SELECT service_id, custom_price FROM ".TBL_PRICING." WHERE staff_id=?");
    $stmt->execute([$staff_id]);
    while ($row = $stmt->fetch()) {
        $sell_rates[$row['service_id']] = (float)$row['custom_price'];
    }

    $agent_rates = [];
    $stmt = $pdo->prepare("SELECT service_id, commission FROM ".TBL_AGENT_COMM." WHERE staff_id=?");
    $stmt->execute([$staff_id]);
    while ($row = $stmt->fetch()) {
        $agent_rates[$row['service_id']] = (float)$row['commission'];
    }

    While (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['sell_rates' => $sell_rates, 'agent_rates' => $agent_rates]);
    exit;
}

// --- AJAX DASHBOARD STATS (Online/Offline) ---
if (isset($_GET['ajax_dashboard_stats'])) {
    
    // CACHING
    $cache_dir = __DIR__ . '/../cache';
    if (!is_dir($cache_dir)) @mkdir($cache_dir, 0777, true);
    
    $is_global = isset($_GET['global']) ? '_global' : '';

    // IMPORTANT: dashboard statistics cache must be isolated per SaaS tenant.
    // Admin IDs are repeated between tenant databases (usually ID 1), so using
    // only admin_id caused one tenant's Online/Offline values to appear in
    // every other tenant dashboard.
    $tenant_cache_key = defined('TENANT_OVERRIDE')
        ? (string) TENANT_OVERRIDE
        : (defined('CURRENT_TENANT') ? (string) CURRENT_TENANT : 'main');
    $tenant_cache_key = preg_replace('/[^a-zA-Z0-9_-]/', '_', $tenant_cache_key);
    $role_cache_key = preg_replace('/[^a-zA-Z0-9_-]/', '_', (string)($_SESSION['user_role'] ?? 'guest'));
    $admin_cache_key = (int)($_SESSION['admin_id'] ?? 0);

    $cache_file = $cache_dir . '/stats_' . $tenant_cache_key . '_' . $role_cache_key . '_' . $admin_cache_key . $is_global . '.json';
    $cache_time = 5; // Real-time (5 seconds cache to prevent API spam)

    if (file_exists($cache_file) && (time() - filemtime($cache_file) < $cache_time)) {
        $data = json_decode(file_get_contents($cache_file), true);
        if ($data) {
            while (ob_get_level() > 0) ob_end_clean();
            header('Content-Type: application/json');
            echo json_encode($data);
            exit;
        }
    }

    $online_data = get_global_online_users($pdo);
    $online_users = array_keys($online_data);
    $online_cnt = count($online_users);
    
    // Filter by managed scope if needed
    $user_id = $_SESSION['admin_id'];
    $role = $_SESSION['user_role'];
    $managed_ids = getManagedStaffIds($pdo, $user_id, $role);
    
    // Default Admin to their own clients for the dashboard view
    $effective_ids = $managed_ids;
    if ($managed_ids === 'ALL' && !isset($_GET['global'])) {
        $effective_ids = [$user_id];
    }
    
    if ($effective_ids !== 'ALL') {
         if($online_cnt > 0) {
            $placeholders = implode(',', array_fill(0, count($online_users), '?'));
            $sql = "SELECT COUNT(*) FROM ".TBL_USERS." WHERE user_id IN ($placeholders)";
            $params = $online_users;
            
            $m_placeholders = implode(',', array_fill(0, count($effective_ids), '?'));
            $sql .= " AND manager_id IN ($m_placeholders)";
            $params = array_merge($params, $effective_ids);
            
            $online_cnt = safeFetch($pdo, $sql, $params)['COUNT(*)'] ?? 0;
         }
         
         // Calculate total monitored
         $m_placeholders = implode(',', array_fill(0, count($effective_ids), '?'));
         $total_monitored = safeFetch($pdo, "SELECT COUNT(*) FROM ".TBL_USERS." WHERE manager_id IN ($m_placeholders) AND status IN ('Active','Expire','Promise Active','Free')", $effective_ids)['COUNT(*)'] ?? 0;
    } else {
         $total_monitored = $pdo->query("SELECT COUNT(*) FROM ".TBL_USERS." WHERE status IN ('Active','Expire','Promise Active','Free')")->fetchColumn();
    }
    
    $offline_cnt = max(0, $total_monitored - $online_cnt);
    
    // Save to Cache
    @file_put_contents($cache_file, json_encode(['online' => $online_cnt, 'offline' => $offline_cnt]));

    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['online' => $online_cnt, 'offline' => $offline_cnt]);
    exit;
}

// --- WEBHOOK ---
if (isset($_GET['action']) && $_GET['action'] == 'piprapay_webhook') {
   $rawData = file_get_contents("php://input");
   $data = json_decode($rawData, true);
   $headers = getallheaders();
   $headers = array_change_key_case($headers, CASE_LOWER);
   $received_key = $headers['mh-piprapay-api-key'] ?? ($headers['mh-piprapay-api-key'] ?? ($_SERVER['HTTP_MH_PIPRAPAY_API_KEY'] ?? ''));

   if ($received_key !== $piprapay_api_key) {
       http_response_code(401); echo json_encode(["status" => false, "message" => "Unauthorized"]); exit;
   }

   $trx_id = $data['pp_id'] ?? ''; 
   $metadata = $data['metadata'] ?? [];
   if (is_string($metadata)) $metadata = json_decode($metadata, true);
   $local_trx_id = $metadata['trx_id'] ?? '';
   $status = $data['status'] ?? '';

   writeLog($pdo, 'Webhook', 'PipraPay Webhook', 0, "Received: TRX={$local_trx_id}, Status={$status}");

   if ($local_trx_id && ($status === 'success' || $status === 'Completed')) {
       $pay_log = safeFetch($pdo, "SELECT * FROM ".TBL_ONLINE_PAY." WHERE trx_id=? AND status='Pending'", [$local_trx_id]);
       if ($pay_log) {
           $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET status='Success', gateway_response=? WHERE id=?")->execute([json_encode($data), $pay_log['id']]);
           $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance + ? WHERE id=?")->execute([$pay_log['amount'], $pay_log['staff_id']]);
           log_tx($pdo, $pay_log['staff_id'], 'Income', $pay_log['amount'], "Online Deposit (Webhook): $local_trx_id", 'Online');
       }
   }
   http_response_code(200); echo json_encode(['status' => true]); exit;
}

// Redundant callback handlers moved to payment_callback.php for centralized expiry processing.
if (isLoggedIn()) {
   // Auto-fix negative due balances (Move negative debt to positive balance)
   $pdo->exec("UPDATE ".TBL_STAFF." SET balance = balance + ABS(due_balance), due_balance = 0 WHERE due_balance < 0");

   $stmt = $pdo->prepare("SELECT router_id FROM ".TBL_STAFF." WHERE id=?");
   $stmt->execute([$user]);
   $my_router_id = (int)$stmt->fetchColumn();
   
   // Throttled Auto-Expiry Check (Runs once per hour)
   $last_check = (int)get_opt($pdo, 'last_auto_expire_check', 0);
   if (time() - $last_check > 3600) {
       try {
           $today = date('Y-m-d');
            $exp_sql = "SELECT u.*, r.ip_address, r.username as r_user, r.api_password, r.port, r.use_ssl, s.expire_time as reseller_expire, s.role as staff_role FROM ".TBL_USERS." u LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id LEFT JOIN ".TBL_STAFF." s ON u.manager_id = s.id WHERE u.status='Active' AND u.current_bill_date <= ? LIMIT 50";
            $expired_users = safeFetchAll($pdo, $exp_sql, [$today]);
            if(!empty($expired_users)) {
                foreach($expired_users as $ex_u) {
                    $target_time = '23:59:59';
                    if (($ex_u['staff_role'] ?? '') === 'Admin') {
                        $target_time = get_opt($pdo, 'admin_expire_time', '23:59:59');
                    } else {
                        $target_time = $ex_u['reseller_expire'] ?: '23:59:59';
                    }
                    
                    $current_time = date('H:i:s');
                    if ($ex_u['current_bill_date'] < $today || ($ex_u['current_bill_date'] === $today && $current_time >= $target_time)) {
                        $pdo->prepare("UPDATE ".TBL_USERS." SET status='Expire', bill_position='Expire' WHERE id=?")->execute([$ex_u['id']]);
                        if($ex_u['ip_address']) {
                            $mk = new MikrotikApp(['ip_address'=>$ex_u['ip_address'], 'username'=>$ex_u['r_user'], 'api_password'=>$ex_u['api_password'], 'port'=>$ex_u['port'], 'use_ssl'=>$ex_u['use_ssl']], 3);
                            $mk->toggle($ex_u['user_id'], false, '');
                        }
                        writeLog($pdo, 'System', 'Auto Expire', $ex_u['id'], "User {$ex_u['user_id']} disabled automatically.");
                    }
                }
            }
           set_opt($pdo, 'last_auto_expire_check', time());
       } catch(Exception $e) { }
   }
   
   if (isset($_POST['manual_verify_btn'])) {
       $row_id = intval($_POST['row_id']);
       $pay_log = safeFetch($pdo, "SELECT * FROM ".TBL_ONLINE_PAY." WHERE id=?", [$row_id]);
       
       if ($pay_log && $pay_log['status'] == 'Pending') {
            if (empty($pay_log['payment_id'])) {
                $error = "Cannot verify: PipraPay ID missing.";
            } else {
                $pp = new PipraPayGateway($piprapay_api_key, $piprapay_url);
                $verification = $pp->verifyPayment($pay_log['payment_id']);
                
                $is_valid = false;
                $v_status = $verification['status'] ?? null;
                if ($v_status === true || $v_status === 'true' || strtolower((string)$v_status) === 'success' || strtolower((string)$v_status) === 'completed') {
                   $is_valid = true;
                } elseif (isset($verification['message']) && strtolower($verification['message']) === 'success') {
                     $is_valid = true;
                }
                
                if ($is_valid) {
                     $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET status='Success', gateway_response=? WHERE id=?")->execute([json_encode($verification), $pay_log['id']]);
                     $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance + ? WHERE id=?")->execute([$pay_log['amount'], $pay_log['staff_id']]);
                     log_tx($pdo, $pay_log['staff_id'], 'Income', $pay_log['amount'], "Online Deposit (Manual): {$pay_log['trx_id']}", 'Online');
                     $msg = "Payment Verified Successfully! Balance Updated.";
                     header("Location: ./?tab=pay_history&msg=" . urlencode($msg)); exit;
                } else {
                     $debug_msg = json_encode($verification);
                     $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET gateway_response=? WHERE id=?")->execute([$debug_msg, $pay_log['id']]);
                     if (strtolower((string)$v_status) === 'pending') {
                         $error = "Payment is still Pending at Gateway. Please wait.";
                     } else {
                         $error = "Verification Failed. Response: " . $debug_msg;
                     }
                }
            }
         }
    }
}
if (isset($_POST['login'])) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $username = trim($_POST['username'] ?? '');

    // Brute force protection: limit to 5 failed attempts within 15 minutes
    $stmt_failed = $pdo->prepare("SELECT COUNT(*) FROM " . TBL_LOGS . " WHERE action_type = 'LoginFailed' AND (admin_user = ? OR description LIKE ?) AND timestamp > NOW() - INTERVAL 15 MINUTE");
    $stmt_failed->execute([$username, "%IP: $ip%"]);
    $failed_count = $stmt_failed->fetchColumn();

    if ($failed_count >= 5) {
        $error = "Too many failed login attempts. Please try again after 15 minutes.";
    } else {
        $stmt = $pdo->prepare("SELECT * FROM ".TBL_STAFF." WHERE username=?");
        $stmt->execute([$username]);
        $u = $stmt->fetch();
        
        $password_matched = false;
        if ($u) {
            if (strpos($u['password'], '$2y$') === 0) {
                $password_matched = password_verify($_POST['password'], $u['password']);
            } else {
                $password_matched = ($u['password'] === $_POST['password']);
                if ($password_matched) {
                    // Auto-upgrade password hash to bcrypt
                    $new_hash = password_hash($_POST['password'], PASSWORD_BCRYPT);
                    $up_stmt = $pdo->prepare("UPDATE ".TBL_STAFF." SET password=? WHERE id=?");
                    $up_stmt->execute([$new_hash, $u['id']]);
                    $u['password'] = $new_hash; // update in memory for token calculations
                }
            }
        }

        if ($u && $password_matched) {
             
             // --- AUTO DB MIGRATION FOR LOCK FEATURE (Run once check) ---
             if (!isset($u['lock_status'])) {
                  // Columns don't exist, try to add them
                  try {
                     $cols = $pdo->query("DESCRIBE ".TBL_STAFF)->fetchAll(PDO::FETCH_COLUMN);
                     if (!in_array('lock_status', $cols)) $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN lock_status ENUM('None','Panel','Full') DEFAULT 'None'");
                     if (!in_array('lock_note', $cols)) $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN lock_note TEXT DEFAULT NULL");
                     if (!in_array('permissions', $cols)) $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN permissions TEXT DEFAULT NULL");
                     if (!in_array('expire_time', $cols)) $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN expire_time TIME DEFAULT '23:59:59'");
                     
                     $cols_u = $pdo->query("DESCRIBE ".TBL_USERS)->fetchAll(PDO::FETCH_COLUMN);
                     if (!in_array('is_parent_locked', $cols_u)) $pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN is_parent_locked TINYINT(1) DEFAULT 0");
                     
                     // Re-fetch user to get new columns
                     $stmt->execute([$username]);
                     $u = $stmt->fetch();
                  } catch(Exception $e) {}
             }

             // --- LOCK CHECK ---
             $lock_status = $u['lock_status'] ?? 'None';
             if ($lock_status !== 'None') {
                  $error = "<h3>Panel Locked</h3><p>Your access has been restricted by the administrator.</p>";
                  if (!empty($u['lock_note'])) {
                      $error .= "<div class='alert alert-warning mt-2'>" . nl2br(htmlspecialchars($u['lock_note'])) . "</div>";
                  }
             }
             elseif(($u['status'] ?? 'Active') !== 'Active') { $error = "Account is inactive."; } 
             else {
                 session_regenerate_id(true);
                 $_SESSION['admin_logged_in'] = true; 
                 $_SESSION['admin_id'] = $u['id']; 
                 $_SESSION['admin_username'] = $u['username']; 
                 $_SESSION['user_role'] = $u['role']; 
                 $_SESSION['user_balance'] = $u['balance'];
                 $_SESSION['parent_id'] = $u['parent_id'] ?? 0;
                 $_SESSION['user_permissions'] = json_decode($u['permissions'] ?? '[]', true);
                 $_SESSION['tenant_id'] = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
                 
                 // --- REMEMBER ME LOGIC ---
                 if (isset($_POST['remember'])) {
                     $token = hash_hmac('sha256', $u['id'] . '|' . $u['username'] . '|' . $u['password'], get_app_encryption_key());
                     $cookie_opts = [
                         'expires' => time() + (86400 * 30),
                         'path' => '/',
                         'secure' => true,
                         'httponly' => true,
                         'samesite' => 'Lax'
                     ];
                     setcookie('remember_uid', $u['id'], $cookie_opts);
                     setcookie('remember_token', $token, $cookie_opts);
                     setcookie('login_username', $u['username'], $cookie_opts);
                     // Password cookie is removed entirely for cookie security compliance
                 } else {
                     $clear_opts = [
                         'expires' => time() - 3600,
                         'path' => '/',
                         'secure' => true,
                         'httponly' => true,
                         'samesite' => 'Lax'
                     ];
                     setcookie('remember_uid', '', $clear_opts);
                     setcookie('remember_token', '', $clear_opts);
                     setcookie('login_username', '', $clear_opts);
                     setcookie('login_password', '', $clear_opts);
                 }
                 // -------------------------

                 writeLog($pdo, $u['username'], 'Login', 0, 'User logged in');
                 header("Location: ./"); exit;
             }
        } else {
            writeLog($pdo, $username, 'LoginFailed', 0, "Failed login attempt from IP: $ip");
            $error = "Invalid Credentials";
        }
    }
}

if (isset($_POST['reset_request'])) $msg = "If the username exists, a reset link has been sent to the administrator.";
if (isset($_GET['logout'])) { 
    if(isLoggedIn()) writeLog($pdo, $_SESSION['admin_username'], 'Logout', 0, 'User logged out'); 
    session_unset();
    session_destroy();
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    } 
    $clear_opts = [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax'
    ];
    setcookie('remember_uid', '', $clear_opts);
    setcookie('remember_token', '', $clear_opts);
    setcookie('login_username', '', $clear_opts);
    setcookie('login_password', '', $clear_opts);
    header("Location: ./"); exit; 
}

if (isset($_GET['stop_impersonate']) && isset($_SESSION['impersonator_id'])) {
   $orig_id = $_SESSION['impersonator_id'];
   $t = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$orig_id]);
   if ($t && isAdminRole($t['role'])) {
       $_SESSION['admin_id'] = $t['id']; 
       $_SESSION['admin_username'] = $t['username']; 
       $_SESSION['user_role'] = $t['role']; 
       $_SESSION['user_balance'] = $t['balance'];
       $_SESSION['user_permissions'] = json_decode($t['permissions'] ?? '[]', true);
       unset($_SESSION['impersonator_id']); writeLog($pdo, $t['username'], 'Impersonate End', 0, 'Stopped impersonation'); header("Location: ./"); exit;
   }
}

if (isLoggedIn() && isset($_GET['impersonate']) && hasRole('Admin')) {
   $target_id = intval($_GET['impersonate']);
   $t = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$target_id]);
   if ($t) {
       $_SESSION['impersonator_id'] = $_SESSION['admin_id'];
       $_SESSION['admin_id'] = $t['id'];
       $_SESSION['admin_username'] = $t['username'];
       $_SESSION['user_role'] = $t['role'];
       $_SESSION['user_balance'] = $t['balance'];
       $_SESSION['parent_id'] = $t['parent_id'] ?? 0;
       $_SESSION['user_permissions'] = json_decode($t['permissions'] ?? '[]', true);
       writeLog($pdo, $_SESSION['admin_username'], 'Impersonate Start', $target_id, 'Started impersonating user');
       header("Location: ./"); exit;
   }
}

if (isLoggedIn()) {
    
    // --- EXPORT CLIENTS ---
    if (isset($_GET['action']) && $_GET['action'] == 'export_clients') {
        $filename = "clients_export_" . date('Y-m-d') . ".csv";
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        
        $output = fopen('php://output', 'w');
        // Comprehensive Headers
        fputcsv($output, [
            'PPPoE ID', 'Full Name', 'Phone', 'Phone 2', 'NID', 'PPPoE Password', 
            'Address', 'District', 'Thana', 'Package', 'Bill Amount', 'Discount', 'Due Amount', 
            'Status', 'Bill Position', 'Router Name', 'Zone Name', 'TJ Box', 
            'Connection Type', 'Client Type', 'ONU MAC', 'Assigned IP', 
            'GPS (Lat,Long)', 'Remarks', 'Joining Date', 'Bill Expiry Date'
        ]);
        
        $query = "SELECT u.*, r.name as router_name, z.name as zone_name 
                  FROM ".TBL_USERS." u 
                  LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id 
                  LEFT JOIN ".TBL_ZONES." z ON u.zone_id = z.id";
        if (!hasRole('Admin')) {
             $query .= " WHERE u.manager_id = " . intval($_SESSION['admin_id']);
        }
        $query .= " ORDER BY u.id DESC";
        $clients = safeFetchAll($pdo, $query);

        foreach ($clients as $row) {
            fputcsv($output, [
                $row['user_id'], $row['name'], $row['phone'], $row['phone2'], $row['nid'], $row['password'],
                $row['address'], $row['district'], $row['thana'], $row['user_package'], $row['bill_amount'], $row['discount'], $row['due'],
                $row['status'], $row['bill_position'], $row['router_name'] ?? $row['intended_router_name'], $row['zone_name'], $row['tj_box_name'],
                $row['connection_type'], $row['client_type'], $row['onu_mac'], $row['assigned_ip'],
                $row['lat_long'], $row['remarks'], $row['joining_date'], $row['current_bill_date']
            ]);
        }
        fclose($output);
        exit;
    }

    if (isset($_GET['action']) && $_GET['action'] == 'download_csv_template') {
        $filename = "client_import_template.csv";
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        $output = fopen('php://output', 'w');
        fputcsv($output, [
            'PPPoE ID', 'Full Name', 'Phone', 'Phone 2', 'NID', 'PPPoE Password', 
            'Address', 'District', 'Thana', 'Package Name', 'Monthly Bill', 'Discount', 'Due Amount', 
            'Status', 'Bill Position', 'Router Name', 'Zone Name', 'TJ Box', 
            'Connection Type', 'Client Type (Home/Office)', 'ONU MAC', 'Assigned IP', 
            'GPS (Lat,Long)', 'Remarks', 'Joining Date (d-m-Y)', 'Expiry (Days or d-m-Y)', 'Custom ID / Client Code'
        ]);
        fputcsv($output, [
            'user123', 'John Doe', '01700000000', '', '1234567890', 'pass123', 
            '123 Street, Dhaka', 'Dhaka', 'Dhanmondi', '10 Mbps', '500', '0', '0.00',
            'Active', 'Active', 'Core-Router', 'Zone-A', 'TJ-01', 
            'Fiber', 'Home', 'AA:BB:CC:DD:EE:FF', '10.10.10.5', 
            '23.8103, 90.4125', 'Self registered', date('d-m-Y'), date('d-m-Y', strtotime('+30 days')), 'CUST-123'
        ]);
        fclose($output);
        exit;
    }

    // --- IMPORT CLIENTS ---
    if (isset($_POST['import_clients']) && (hasRole('Reseller') || isOffice())) {
        if (isset($_FILES['csv_file']) && $_FILES['csv_file']['error'] == 0) {
            $file = $_FILES['csv_file']['tmp_name'];
            $filename_orig = $_FILES['csv_file']['name'];
            $ext = strtolower(pathinfo($filename_orig, PATHINFO_EXTENSION));

            if ($ext !== 'csv') {
                $error = "Import Failed: Only CSV files are supported. Please save your Excel file as CSV (Comma Delimited) and try again.";
            } else {
                ini_set('auto_detect_line_endings', true);
                $handle = fopen($file, "r");
                
                // Read first few bytes to check for BOM
                $bom = fread($handle, 3);
                if ($bom == "\xEF\xBB\xBF") {
                    // BOM detected, pointer is already at 4th byte
                } else {
                    rewind($handle);
                }

                $raw_header = fgets($handle);
                rewind($handle);
                // Detect delimiter
                $delimiter = ",";
                if (strpos($raw_header, ";") !== false && strpos($raw_header, ",") === false) {
                    $delimiter = ";";
                } elseif (substr_count($raw_header, ";") > substr_count($raw_header, ",")) {
                    $delimiter = ";";
                }

                $header = fgetcsv($handle, 0, $delimiter);
                $imported = 0; $updated = 0; $row_count = 0;
                
                $sync_mk = isset($_POST['sync_mikrotik']);
                
                // Pre-fetch all Zones for faster lookup
                $owner_id = (isOffice() && isset($_SESSION['parent_id']) && $_SESSION['parent_id'] > 0) ? $_SESSION['parent_id'] : $user;
                $zones_raw = safeFetchAll($pdo, "SELECT id, name FROM ".TBL_ZONES." WHERE staff_id=?", [$owner_id]);
                $zones_map = [];
                foreach($zones_raw as $z) { $zones_map[strtolower(trim($z['name']))] = $z['id']; }
                
                // Pre-fetch all Routers
                $routers_raw = safeFetchAll($pdo, "SELECT id, name FROM ".TBL_ROUTERS);
                $routers_map = [];
                foreach($routers_raw as $r) { $routers_map[strtolower(trim($r['name']))] = $r['id']; }
                
                // Pre-fetch all Services (Packages)
                $services_raw = safeFetchAll($pdo, "SELECT id, name, mikrotik_profile_name FROM ".TBL_SERVICES);
                $services_map = [];
                foreach($services_raw as $s) { $services_map[strtolower(trim($s['name']))] = $s; }

                $pdo->beginTransaction();
                try {
                    while (($data = fgetcsv($handle, 0, $delimiter)) !== FALSE) {
                        $row_count++;
                        $user_id = trim($data[0] ?? '');
                        if (empty($user_id)) continue;
                        
                        $csv_bill = floatval($data[10] ?? 0);
                        $csv_discount = floatval($data[11] ?? 0);
                        
                        $csv_due = 0;
                        $offset = 0;
                        
                        // Robustly check if "Due Amount" exists in the header
                        $has_due = false;
                        foreach ($header as $h) {
                            if (stripos(trim($h), 'Due') !== false) {
                                $has_due = true;
                                break;
                            }
                        }
                        if ($has_due) {
                            $csv_due = floatval($data[12] ?? 0);
                            $offset = 1;
                        }

                        $net_bill = $csv_bill - $csv_discount;
                        if ($net_bill < 0) $net_bill = 0;
                        
                        $c_type = trim($data[18 + $offset] ?? '');
                        if (!in_array($c_type, ['Home', 'Office'])) $c_type = 'Home';

                        $payload = [
                            'name' => trim($data[1] ?? ''),
                            'phone' => trim($data[2] ?? ''),
                            'phone2' => trim($data[3] ?? ''),
                            'nid' => trim($data[4] ?? ''),
                            'password' => trim($data[5] ?? ''),
                            'address' => trim($data[6] ?? ''),
                            'district' => trim($data[7] ?? ''),
                            'thana' => trim($data[8] ?? ''),
                            'package' => trim($data[9] ?? ''),
                            'bill' => $net_bill,
                            'discount' => $csv_discount,
                            'due' => $csv_due,
                            'status' => trim($data[12 + $offset] ?? 'Active'),
                            'bill_pos' => trim($data[13 + $offset] ?? 'Active'),
                            'router_name' => trim($data[14 + $offset] ?? ''),
                            'zone_name' => trim($data[15 + $offset] ?? ''),
                            'tj_box' => trim($data[16 + $offset] ?? ''),
                            'conn_type' => trim($data[17 + $offset] ?? 'Fiber'),
                            'client_type' => $c_type,
                            'onu_mac' => trim($data[19 + $offset] ?? ''),
                            'ip' => trim($data[20 + $offset] ?? ''),
                            'lat_long' => trim($data[21 + $offset] ?? ''),
                            'remarks' => trim($data[22 + $offset] ?? ''),
                            'joining' => trim($data[23 + $offset] ?? date('Y-m-d')),
                            'expiry_data' => trim($data[24 + $offset] ?? '30'),
                            'client_code' => trim($data[25 + $offset] ?? '')
                        ];

                        $zone_id = $zones_map[strtolower($payload['zone_name'])] ?? 0;
                        $router_id = $routers_map[strtolower($payload['router_name'])] ?? 0;
                        $intended = ($router_id === 0) ? $payload['router_name'] : null;

                        $joining_val = $payload['joining'];
                        $joining_date = date('Y-m-d');
                        if (!empty($joining_val)) {
                            $joining_val = str_replace('/', '-', $joining_val);
                            $parsed_joining = strtotime($joining_val);
                            if ($parsed_joining) $joining_date = date('Y-m-d', $parsed_joining);
                        }

                        $expiry_val = $payload['expiry_data'];
                        $bill_date = date('Y-m-d', strtotime("+30 days"));
                        if (!empty($expiry_val)) {
                            if (is_numeric($expiry_val) && strlen($expiry_val) <= 3) {
                                $bill_date = date('Y-m-d', strtotime("+$expiry_val days"));
                            } else {
                                $expiry_val = str_replace('/', '-', $expiry_val);
                                $parsed_expiry = strtotime($expiry_val);
                                if ($parsed_expiry) $bill_date = date('Y-m-d', $parsed_expiry);
                            }
                        }
                        
                        $exist = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE user_id=?", [$user_id]);
                        if ($exist) {
                            // Security Check: Non-admins/office staff can only update their own clients
                            if (!isAdminRole($_SESSION['user_role'] ?? '') && !isOffice() && $exist['manager_id'] != $user) {
                                // Skip this row if client belongs to someone else
                                writeLog($pdo, $_SESSION['admin_username'], 'Import Warning', $exist['id'], "Skipped update for client {$user_id}: Access Denied.");
                                continue; 
                            }
                            
                            // Preserve existing values if CSV is blank for optional fields
                            $final_mac = !empty($payload['onu_mac']) ? $payload['onu_mac'] : $exist['onu_mac'];
                            $final_pass = !empty($payload['password']) ? $payload['password'] : $exist['password'];
                            $db_client_code = !empty($payload['client_code']) ? $payload['client_code'] : $exist['client_code'];
                            
                            $sql = "UPDATE ".TBL_USERS." SET 
                                    name=?, phone=?, phone2=?, nid=?, password=?, address=?, district=?, thana=?, 
                                    user_package=?, bill_amount=?, discount=?, due=?, status=?, bill_position=?, 
                                    router_id=?, intended_router_name=?, zone_id=?, tj_box_name=?, connection_type=?, 
                                    client_type=?, onu_mac=?, assigned_ip=?, lat_long=?, remarks=?, joining_date=?, current_bill_date=?, client_code=? 
                                    WHERE id=?";
                            $pdo->prepare($sql)->execute([
                                $payload['name'], $payload['phone'], $payload['phone2'], $payload['nid'], $final_pass, $payload['address'], $payload['district'], $payload['thana'],
                                $payload['package'], $payload['bill'], $payload['discount'], $payload['due'], $payload['status'], $payload['bill_pos'],
                                $router_id, $intended, $zone_id, $payload['tj_box'], $payload['conn_type'],
                                $payload['client_type'], $final_mac, $payload['ip'], $payload['lat_long'], $payload['remarks'], $joining_date, $bill_date, $db_client_code,
                                $exist['id']
                            ]);
                            $updated++;
                        } else {
                            $db_client_code = !empty($payload['client_code']) ? $payload['client_code'] : null;
                            $sql = "INSERT INTO ".TBL_USERS." (
                                    user_id, name, phone, phone2, nid, password, address, district, thana, 
                                    user_package, bill_amount, discount, due, status, bill_position, 
                                    router_id, intended_router_name, zone_id, tj_box_name, connection_type, 
                                    client_type, onu_mac, assigned_ip, lat_long, remarks, joining_date, current_bill_date, manager_id, client_code
                                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
                            $pdo->prepare($sql)->execute([
                                $user_id, $payload['name'], $payload['phone'], $payload['phone2'], $payload['nid'], $payload['password'], $payload['address'], $payload['district'], $payload['thana'],
                                $payload['package'], $payload['bill'], $payload['discount'], $payload['due'], $payload['status'], $payload['bill_pos'],
                                $router_id, $intended, $zone_id, $payload['tj_box'], $payload['conn_type'], 
                                $payload['client_type'], $payload['onu_mac'], $payload['ip'], $payload['lat_long'], $payload['remarks'], $joining_date, $bill_date, $user, $db_client_code
                            ]);
                            $imported++;
                        }

                        // Auto-Sync to Mikrotik ONLY IF CHECKED
                        if ($sync_mk && $router_id > 0) {
                            $r_info = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$router_id]);
                            $svc = $services_map[strtolower($payload['package'])] ?? null;
                            if ($r_info && $svc) {
                                $mk = new MikrotikApp($r_info);
                                $enable = ($payload['status'] === 'Active' || $payload['status'] === 'Free' || $payload['status'] === 'Promise Active');
                                // Blank CSV password means KEEP the existing DB/MikroTik credential.
                                // Never push an empty raw CSV cell to MikroTik.
                                $sync_password = $exist ? (string)$final_pass : (string)$payload['password'];
                                if (trim((string)$payload['password']) !== '') {
                                    // A non-empty CSV password is an explicit credential update.
                                    $mk->setPppoePassword($user_id, (string)$payload['password'], true, $svc['mikrotik_profile_name'], $enable);
                                }
                                $mk->toggle($user_id, $enable, $svc['mikrotik_profile_name'], $sync_password !== '' ? $sync_password : false);
                            }
                        }
                    }
                    $pdo->commit();
                    fclose($handle);
                    writeLog($pdo, $_SESSION['admin_username'], 'Import Clients', 0, "Imported $imported, Updated $updated clients from CSV.");
                    $msg = "Import Complete: Updated $updated, Inserted $imported clients.";
                } catch (Exception $e) {
                    $pdo->rollBack();
                    if(isset($handle)) fclose($handle);
                    $error = "Import Failed at row $row_count: " . $e->getMessage();
                    writeLog($pdo, $_SESSION['admin_username'], 'Import Error', 0, "Import Failed at row $row_count: " . $e->getMessage());
                }
            }
        } else {
            $error = "File Upload Error: " . ($_FILES['csv_file']['error'] ?? 'Unknown');
        }
    }
   
   // --- OFFICE STAFF MANAGEMENT ---
   if (isset($_POST['create_office_staff']) || isset($_POST['edit_office_staff'])) {
       if (!hasRole('Admin') && !hasRole('Reseller')) { 
           $_SESSION['flash_error'] = "Access Denied"; 
       } else {
           $name = $_POST['name'];
           $phone = $_POST['phone'];
           $username = $_POST['username'];
	           $requested_role = trim((string)($_POST['role'] ?? 'Supervisor'));
	           $admin_office_roles = ['Administrator', 'Supervisor', 'Office Manager', 'System Admin', 'TL', 'Executive', 'HR Manager', 'Accounts Manager', 'Support Engineer', 'Sales Staff', 'Staff'];
	           $role = hasRole('Admin') && in_array($requested_role, $admin_office_roles, true)
	               ? $requested_role
	               : 'Supervisor';
           $permission_owner_type = hasRole('Admin') ? 'admin' : 'reseller';
           $allowed_permission_slugs = array_keys(getOfficeStaffPermissionCatalog($permission_owner_type));
           $submitted_permissions = is_array($_POST['permissions'] ?? null) ? $_POST['permissions'] : [];
           $perms = json_encode(array_values(array_intersect($submitted_permissions, $allowed_permission_slugs)));
           $staff_id = $_POST['staff_id'] ?? '';

           if (isset($_POST['create_office_staff'])) {
               // Check if username already exists
               $exist = safeFetch($pdo, "SELECT id FROM ".TBL_STAFF." WHERE username=?", [$username]);
               if ($exist) {
                   $_SESSION['flash_error'] = "Username already exists.";
               } else {
                   $pass = $_POST['password'];
                   $parent_id = hasRole('Admin') ? 0 : $_SESSION['admin_id'];
                   $pdo->prepare("INSERT INTO ".TBL_STAFF." (name, phone, username, password, role, permissions, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
                       ->execute([$name, $phone, $username, $pass, $role, $perms, $parent_id]);
                   $_SESSION['flash_msg'] = "Staff created successfully.";
               }
           } else {
               $sql = "UPDATE ".TBL_STAFF." SET name=?, phone=?, role=?, permissions=? ";
               $params = [$name, $phone, $role, $perms];
               if (!empty($_POST['password'])) {
                   $sql .= ", password=? ";
                   $params[] = $_POST['password'];
               }
	               $sql .= " WHERE id=? AND status='Active'";
	               $params[] = $staff_id;
	               if (hasRole('Admin')) {
	                   $sql .= " AND parent_id=0 AND role NOT IN ('Admin', 'Reseller', 'SubReseller', 'Agent')";
	               } else {
	                   $sql .= " AND parent_id=? AND role='Supervisor'";
	                   $params[] = (int)$_SESSION['admin_id'];
	               }
	               $stmt = $pdo->prepare($sql);
	               $stmt->execute($params);
	               if ($stmt->rowCount() > 0) {
	                   $_SESSION['flash_msg'] = "Staff updated successfully.";
	               } else {
	                   $_SESSION['flash_error'] = "Staff not found or access denied.";
	               }
           }
       }
       header("Location: ?tab=office_staff"); exit;
   }

   if (isset($_GET['action']) && $_GET['action'] == 'delete_staff' && isset($_GET['id']) && ($_GET['tab'] ?? '') == 'office_staff') {
       if (!hasRole('Admin') && !hasRole('Reseller')) {
           $_SESSION['flash_error'] = "Access Denied";
       } else {
           $sql = "DELETE FROM ".TBL_STAFF." WHERE id=? AND role NOT IN ('Admin', 'Reseller', 'SubReseller', 'Agent')";
           $params = [$_GET['id']];
           if (!hasRole('Admin')) {
               $sql .= " AND parent_id = ?";
               $params[] = $_SESSION['admin_id'];
           }
           $pdo->prepare($sql)->execute($params);
           $_SESSION['flash_msg'] = "Staff deleted.";
       }
       header("Location: ?tab=office_staff"); exit;
   }

   // --- OFFERS LOGIC ---
    if (isset($_POST['create_offer'])) {
        $buy_days = intval($_POST['buy_days']);
        $total_free_days = intval($_POST['free_days']);
       
       $pdo->prepare("INSERT INTO ".TBL_OFFERS." (staff_id, name, buy_days, free_days, description, valid_until) VALUES (?, ?, ?, ?, ?, ?)")->execute([$user, $_POST['name'], $buy_days, $total_free_days, $_POST['description'], $_POST['valid_until']]);
       $msg = "Offer Created Successfully";
    }
   
   if (isset($_GET['action']) && $_GET['action'] == 'delete_offer') {
       $pdo->prepare("DELETE FROM ".TBL_OFFERS." WHERE id=?")->execute([$_GET['id']]);
       $msg = "Offer Deleted";
   }
   
   if (isset($_POST['add_zone'])) {
       try {
           $pdo->prepare("INSERT INTO ".TBL_ZONES." (name, staff_id) VALUES (?, ?)")->execute([$_POST['zone_name'], $user]);
           $msg = "Zone Added Successfully";
       } catch (Exception $e) { $error = "Error: Zone name already exists or invalid."; }
   }
   if (isset($_GET['action']) && $_GET['action'] == 'delete_zone') {
       $pdo->prepare("DELETE FROM ".TBL_ZONES." WHERE id=?")->execute([$_GET['id']]);
       $msg = "Zone Deleted";
   }
   
       if (isset($_POST['add_tj'])) {
        try {
            $zone_id = intval($_POST['zone_id'] ?? 0);
            $lat_long = $_POST['lat_long'] ?? '';
            $fiber_code = $_POST['fiber_code'] ?? '';
             $box_category = $_POST['box_category'] ?? 'Master Box';
             $notes = $_POST['notes'] ?? '';
             $pdo->prepare("INSERT INTO ".TBL_TJ_BOXES." (name, staff_id, zone_id, lat_long, fiber_code, box_category, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")->execute([$_POST['tj_name'], $user, $zone_id, $lat_long, $fiber_code, $box_category, $notes]);
            // Redirect to prevent form resubmission
            header("Location: ?tab=configuration&success=tj_added");
            exit;
        } catch (Exception $e) { $error = "Error: Name already exists or invalid."; }
    }
    
    if (isset($_POST['edit_tj'])) {
        try {
            $id = intval($_POST['tj_id']);
            $zone_id = intval($_POST['zone_id'] ?? 0);
            $lat_long = $_POST['lat_long'] ?? '';
            $fiber_code = $_POST['fiber_code'] ?? '';
             $box_category = $_POST['box_category'] ?? 'Master Box';
             $notes = $_POST['notes'] ?? '';
             $pdo->prepare("UPDATE ".TBL_TJ_BOXES." SET name=?, zone_id=?, lat_long=?, fiber_code=?, box_category=?, notes=? WHERE id=? AND staff_id=?")->execute([$_POST['tj_name'], $zone_id, $lat_long, $fiber_code, $box_category, $notes, $id, $user]);
            // Redirect to prevent form resubmission
            header("Location: ?tab=configuration&success=tj_updated");
            exit;
        } catch (Exception $e) { $error = "Error: Name might already exist or invalid."; }
    }

    if (isset($_GET['action']) && $_GET['action'] == 'delete_tj') {
       $pdo->prepare("DELETE FROM ".TBL_TJ_BOXES." WHERE id=?")->execute([$_GET['id']]);
       $msg = "TJ Box Deleted";
   }

    if (isset($_POST['initiate_payment'])) {
        $current_role = trim($_SESSION['user_role'] ?? '');
        if (!isPartnerWalletRole($current_role)) {
            $error = "Only Reseller / Sub-Reseller / POP / Branch accounts can self top-up this wallet.";
        } else {
            $amount = round(floatval($_POST['amount'] ?? 0), 2);
            $method = trim($_POST['gateway'] ?? '');
            $me = safeFetch($pdo, "SELECT id, name, username, role, parent_id, balance FROM ".TBL_STAFF." WHERE id=?", [$user]);

            if (!$me || $amount < 10) {
                $error = "Invalid wallet top-up amount.";
            } else {
                // These partner roles own their own wallet. The logged-in username is
                // always the human-facing payment reference.
                $wallet_owner_id = (int)$me['id'];
                $panel_reference = trim((string)$me['username']);
                $gateway_admin_id = getTenantAdminStaffId($pdo, $user);
                $trx_id = "WT" . strtoupper(bin2hex(random_bytes(7)));

                if ($gateway_admin_id <= 0) {
                    $error = "Admin payment gateway owner could not be resolved.";
                } else {
                    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || ($_SERVER['SERVER_PORT'] ?? 80) == 443) ? "https://" : "http://";
                    $baseUrl = $protocol . $_SERVER['HTTP_HOST'] . $_SERVER['PHP_SELF'];
                    $separator = (strpos($baseUrl, '?') === false) ? '?' : '&';
                    $gwConfig = get_gateway_credentials($pdo, $gateway_admin_id);

                    if (strpos($method, 'AUTO_') === 0) {
                        try {
                            $gw_id = intval(substr($method, 5));
                            // Security: reseller/POP/branch may use only an ACTIVE tenant/Admin
                            // SMS verification gateway. checkout_enabled controls public customer
                            // checkout and is intentionally not required for internal partner top-up.
                            $gw_row = getPartnerWalletAdminMfsGatewayById($pdo, $user, $gw_id);
                            if (!$gw_row) {
                                throw new RuntimeException("Selected Admin MFS verification gateway is unavailable or inactive.");
                            }

                            $min_amount = isset($gw_row['min_amount']) && $gw_row['min_amount'] !== '' ? floatval($gw_row['min_amount']) : 10.0;
                            $max_amount = isset($gw_row['max_amount']) && $gw_row['max_amount'] !== '' ? floatval($gw_row['max_amount']) : 25000.0;
                            if ($amount < $min_amount || $amount > $max_amount) {
                                throw new RuntimeException("Amount is outside this gateway's allowed range (৳" . number_format($min_amount, 2) . " - ৳" . number_format($max_amount, 2) . ").");
                            }

                            // Old tenant DBs may have these payment tables without the newer
                            // staff/reference columns. Repair them before creating the checkout.
                            ensurePartnerWalletCheckoutSchema($pdo);

                            $merchant_number = trim((string)($gw_row['merchant_number'] ?? ''));
                            if ($merchant_number === '') {
                                throw new RuntimeException("Selected gateway merchant/mobile number is empty.");
                            }

                            $public_token = bin2hex(random_bytes(16));
                            $expiry_mins = max(1, intval($gw_row['checkout_expiry_mins'] ?? 10));
                            $expires_at = date('Y-m-d H:i:s', strtotime("+$expiry_mins minutes"));

                            $pdo->beginTransaction();

                            // Create the audit/pending row first. It is tied explicitly to a staff
                            // wallet so successful SMS settlement can never be mistaken for a client.
                            $stmt = $pdo->prepare("INSERT INTO ".TBL_ONLINE_PAY." (staff_id, amount, trx_id, status, entity_type, initiator_staff_id, reference_id) VALUES (?,?,?, 'Pending', 'staff', ?, ?)");
                            $stmt->execute([$wallet_owner_id, $amount, $trx_id, $user, $panel_reference]);

                            $stmt = $pdo->prepare("INSERT INTO ".TBL_PAYMENT_INTENTS." (public_token, gateway_id, gateway_name, receiver_mobile, manager_id, customer_id, entity_type, invoice_id, reference_id, initiator_staff_id, amount, status, expires_at) VALUES (?, ?, ?, ?, ?, 0, 'staff', ?, ?, ?, ?, 'created', ?)");
                            $stmt->execute([$public_token, $gw_id, $gw_row['gateway_name'], $merchant_number, $wallet_owner_id, $trx_id, $panel_reference, $user, $amount, $expires_at]);

                            $pdo->commit();

                            try {
                                writeLog($pdo, $_SESSION['admin_username'] ?? $panel_reference, 'Wallet Topup Initiated', $wallet_owner_id, "MFS wallet top-up initiated via {$gw_row['gateway_name']} | Ref: {$panel_reference} | Amount: ৳{$amount}");
                            } catch (Throwable $logEx) {
                                error_log("Wallet top-up audit log warning: " . $logEx->getMessage());
                            }

                            // Root-relative URL avoids /index.php/views/... style paths, while the
                            // helper also provides JS/meta fallback if a proxy swallows Location.
                            redirectToPartnerCheckout('/views/auth/checkout.php?token=' . rawurlencode($public_token));
                        } catch (Throwable $e) {
                            if ($pdo->inTransaction()) {
                                $pdo->rollBack();
                            }
                            error_log("Partner MFS wallet checkout start failed: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
                            $error = "Could not open Automated Checkout: " . $e->getMessage();
                        }
                    } elseif ($method === 'bKash') {
                        $bk_sandbox = ($gwConfig['bkash_sandbox'] ?? '0') == '1';
                        if ($bk_sandbox) {
                            $bk_key = $gwConfig['bkash_sandbox_app_key'] ?? '';
                            $bk_secret = $gwConfig['bkash_sandbox_app_secret'] ?? '';
                            $bk_user = $gwConfig['bkash_sandbox_username'] ?? '';
                            $bk_pass = $gwConfig['bkash_sandbox_password'] ?? '';
                        } else {
                            $bk_key = $gwConfig['bkash_app_key'] ?? '';
                            $bk_secret = $gwConfig['bkash_app_secret'] ?? '';
                            $bk_user = $gwConfig['bkash_username'] ?? '';
                            $bk_pass = $gwConfig['bkash_password'] ?? '';
                        }

                        if (!empty($bk_key) && !empty($bk_secret) && !empty($bk_user) && !empty($bk_pass)) {
                            $pdo->prepare("INSERT INTO ".TBL_ONLINE_PAY." (staff_id, amount, trx_id, status, entity_type, initiator_staff_id, reference_id) VALUES (?,?,?, 'Pending', 'staff', ?, ?)")
                                ->execute([$wallet_owner_id, $amount, $trx_id, $user, $panel_reference]);

                            require_once __DIR__ . '/../classes/BKashGateway.php';
                            $bkash = new BKashGateway($bk_key, $bk_secret, $bk_user, $bk_pass, $bk_sandbox);
                            $tokenResp = $bkash->grantToken();
                            if (isset($tokenResp['id_token']) && !empty($tokenResp['id_token'])) {
                                $callbackUrl = $baseUrl . $separator . "bkash_callback=1&trxID=" . urlencode($trx_id);
                                // payerReference is the panel username; merchantInvoiceNumber stays our unique WT id.
                                $createResp = $bkash->createPayment($tokenResp['id_token'], $amount, $trx_id, $callbackUrl, $panel_reference);
                                if (isset($createResp['bkashURL'])) {
                                    if (!empty($createResp['paymentID'])) {
                                        $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET payment_id=? WHERE trx_id=?")->execute([$createResp['paymentID'], $trx_id]);
                                    }
                                    writeLog($pdo, $_SESSION['admin_username'] ?? $panel_reference, 'Wallet Topup Initiated', $wallet_owner_id, "bKash API wallet top-up initiated | Ref: {$panel_reference} | Amount: ৳{$amount}");
                                    header("Location: " . $createResp['bkashURL']);
                                    exit;
                                }
                                $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET status='Failed', gateway_response=? WHERE trx_id=?")->execute([json_encode($createResp), $trx_id]);
                                $error = "bKash Create Error: " . ($createResp['errorMessage'] ?? ($createResp['statusMessage'] ?? ($createResp['msg'] ?? 'Failed to initiate')));
                            } else {
                                $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET status='Failed', gateway_response=? WHERE trx_id=?")->execute([json_encode($tokenResp), $trx_id]);
                                $error = "bKash Token Error: " . ($tokenResp['errorMessage'] ?? ($tokenResp['statusMessage'] ?? ($tokenResp['description'] ?? 'Check Admin bKash credentials')));
                            }
                        } else {
                            $error = "Admin bKash API gateway is not configured.";
                        }
                    } else {
                        $error = "Invalid payment gateway selected.";
                    }
                }
            }
        }
    }


    if (isset($_POST['update_email_settings']) && hasRole('Admin')) {
        set_opt($pdo, 'smtp_host', $_POST['smtp_host']);
        set_opt($pdo, 'smtp_port', $_POST['smtp_port']);
        set_opt($pdo, 'smtp_user', $_POST['smtp_user']);
        set_opt($pdo, 'smtp_pass', $_POST['smtp_pass']);
        set_opt($pdo, 'smtp_secure', $_POST['smtp_secure']);
        set_opt($pdo, 'smtp_from_name', $_POST['smtp_from_name']);
        set_opt($pdo, 'smtp_from_email', $_POST['smtp_from_email']);
        writeLog($pdo, $_SESSION['admin_username'], 'Update Settings', 0, "Updated Email/SMTP settings");
        $msg = "Email settings updated.";
    }

   if (isset($_POST['change_own_password'])) {
       $old = $_POST['old_password']; $new = $_POST['new_password'];
       $email = filter_var($_POST['email'] ?? '', FILTER_SANITIZE_EMAIL);
       
       $stmt = $pdo->prepare("SELECT password FROM ".TBL_STAFF." WHERE id=?"); $stmt->execute([$user]);
       if ($stmt->fetchColumn() === $old) {
           $sql = "UPDATE ".TBL_STAFF." SET password=?";
           $params = [$new];
           
           if (!empty($email)) {
               $sql .= ", email=?";
               $params[] = $email;
           }
           
           $sql .= " WHERE id=?";
           $params[] = $user;
           
           $pdo->prepare($sql)->execute($params);
           writeLog($pdo, $_SESSION['admin_username'], 'Change Password', $user, 'Changed own password/email'); $msg = 'Password/Email updated successfully.';
       } else $error = 'Old Password does not match.';
   }

   // --- PASSWORD RESET LOGIC ---
   if (isset($_POST['request_reset'])) {
       $email = filter_var($_POST['email'] ?? '', FILTER_SANITIZE_EMAIL);
       writeLog($pdo, 'System', 'Reset Request', 0, "Reset requested for: '$email'");
       
       $staff = safeFetch($pdo, "SELECT id, name FROM ".TBL_STAFF." WHERE email=?", [$email]);
       
       if ($staff) {
           $token = bin2hex(random_bytes(32));
           $expiry = date('Y-m-d H:i:s', strtotime('+1 hour'));
           $pdo->prepare("UPDATE ".TBL_STAFF." SET reset_token=?, reset_expiry=? WHERE id=?")->execute([$token, $expiry, $staff['id']]);
           
            $resetLink = SITE_URL . "/index.php?tab=reset_password&token=" . $token;
            $subject = "Password Reset Request";
            $message_text = "Hi " . $staff['name'] . ",\n\nClick here to reset your password:\n" . $resetLink . "\n\nLink expires in 1 hour.";
            $message_html = nl2br($message_text);
            
             if(sendEmail($pdo, $email, $subject, $message_html)) {
                 writeLog($pdo, 'System', 'Reset Email Sent', $staff['id'], "Password reset link sent to $email");
                 $msg = "Reset link sent to your email.";
             } else {
                 writeLog($pdo, 'System', 'Reset Email Failed', $staff['id'], "Failed to send reset link to $email");
                 $error = "Failed to send email. Check SMTP settings. <a href='$resetLink'>Click here (Test Only)</a>"; 
             }
       } else {
           writeLog($pdo, 'System', 'Reset Failed', 0, "Email not found in DB: '$email'");
           $error = "Email not found.";
       }
   }

   if (isset($_POST['reset_password_action'])) {
       $token = $_POST['token'];
       $pass = $_POST['new_password'];
       
       $staff = safeFetch($pdo, "SELECT id FROM ".TBL_STAFF." WHERE reset_token=? AND reset_expiry > NOW()", [$token]);
       
       if ($staff) {
           $pdo->prepare("UPDATE ".TBL_STAFF." SET password=?, reset_token=NULL, reset_expiry=NULL WHERE id=?")->execute([$pass, $staff['id']]);
           $msg = "Password reset successfully. You can now login.";
           // Redirect to login after 2 seconds
           header("refresh:2;url=index.php");
       } else {
           $error = "Invalid or expired token.";
       }
   }

   if (isset($_POST['save_my_rates']) && (hasRole('Reseller') || hasRole('SubReseller'))) {
       foreach($_POST['rates'] as $sid => $price) { $pdo->prepare("INSERT INTO ".TBL_SELL_PRICING." (staff_id, service_id, price) VALUES (?,?,?) ON DUPLICATE KEY UPDATE price=?")->execute([$user, $sid, $price, $price]); }
       writeLog($pdo, $_SESSION['admin_username'], 'Update Rates', 0, 'Updated own sell rates'); $msg = "Sell rates updated.";
   }

   if (isset($_POST['add_client']) && hasRole('SubReseller')) {
       $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE id=".intval($_POST['service_id']));
        if ($svc) {
            $monthly_admin_cost = floatval($svc['buying_price']);
            if (hasRole('Admin')) {
                 $cost = floatval($svc['buying_price']);
            } else {
                 $cost = getBuyPrice($pdo, $user, $svc['id']);
            }
           $target_router = ($my_router_id > 0) ? $my_router_id : intval($_POST['router']);
           // --- UNIQUE USER_ID CHECK ---
           $uid_to_check = trim($_POST['user_id']);
           $already_exists = safeFetch($pdo, "SELECT id FROM ".TBL_USERS." WHERE user_id=? LIMIT 1", [$uid_to_check]);
           if (!$already_exists) {
               $already_exists = safeFetch($pdo, "SELECT id FROM ".TBL_STAFF." WHERE username=? LIMIT 1", [$uid_to_check]);
           }

           if ($already_exists) {
               $error = "Username '{$uid_to_check}' is already taken. Please choose another.";
           } elseif (($wallet_owner_id = deductWallet($pdo, $user, $cost)) !== false) {
                $init_status = $_POST['status'] ?? 'Active'; $joining_date = $_POST['date'];
                
                // --- NEW PRO-RATED BILLING CYCLE LOGIC ---
                $billing_cycle = $_POST['billing_cycle'] ?? 'standard';
                if ($billing_cycle === 'standard') {
                    $next_bill_date = date('Y-m-d', strtotime($joining_date . ' + 30 days'));
                    $actual_income = floatval($_POST['bill'] ?? 0);
                    $days = 30;
                    $admin_cost = $monthly_admin_cost;
                } else {
                    $cycle_day = (int)$billing_cycle;
                    $join_day = (int)date('d', strtotime($joining_date));
                    $join_month = (int)date('m', strtotime($joining_date));
                    $join_year = (int)date('Y', strtotime($joining_date));

                    if ($join_day < $cycle_day) {
                        // Billing day is later in the current month
                        $next_bill_date = date('Y-m-d', mktime(0, 0, 0, $join_month, $cycle_day, $join_year));
                    } else {
                        // Billing day is in the next month
                        $next_bill_date = date('Y-m-d', mktime(0, 0, 0, $join_month + 1, $cycle_day, $join_year));
                    }

                    // Calculate Days
                    $diff = strtotime($next_bill_date) - strtotime($joining_date);
                    $days = round($diff / (60 * 60 * 24)) + 1; // Inclusive of start/end based on user example (8th to 10th = 3 days)
                    
                    if ($days <= 0) $days = 30; // Fallback
                    if ($days > 45) $days = 30; // Safety cap
                    
                    // Adjust Cost (Full cost / 30 * days)
                    $cost = round(($cost / 30) * $days, 2);
                    $admin_cost = round(($monthly_admin_cost / 30) * $days, 2);
                    
                    // --- NEW: Also pro-rate the Income log ---
                    $bill_input = floatval($_POST['bill'] ?? 0);
                    $actual_income = round(($bill_input / 30) * $days, 2);
                }
                // ------------------------------------------
               $zone_id = intval($_POST['zone_id']);
               $tj_box_name = $_POST['tj_box_name'];

               try {
                   $profile_pic = "";
                   if (isset($_FILES['profile_pic']) && $_FILES['profile_pic']['error'] === UPLOAD_ERR_OK) {
                       $fileTmpPath = $_FILES['profile_pic']['tmp_name'];
                       $fileName = $_FILES['profile_pic']['name'];
                       $fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
                       if (in_array($fileExt, ['jpg', 'jpeg', 'png', 'webp'])) {
                           $newFileName = 'pp_' . time() . '_' . rand(100, 999) . '.' . $fileExt;
                           $destPath = __DIR__ . '/../uploads/profile_pics/' . $newFileName;
                           if (save_uploaded_file_with_image_limit($_FILES['profile_pic'], $destPath, 50 * 1024) !== false) {
                               $profile_pic = 'uploads/profile_pics/' . $newFileName;
                           }
                       }
                   }
                   $discount = floatval($_POST['discount'] ?? 0);
                   $bill_amt = floatval($_POST['bill'] ?? 0);
                   $bill_pos = $_POST['bill_position'] ?? 'Active';
                   if ($init_status === 'Free' && $bill_pos === 'Free') {
                       $bill_amt = 0;
                       $discount = 0;
                       $next_bill_date = date('Y-m-d', strtotime('+30 days'));
                   }
                    $client_code = !empty($_POST['client_code']) ? trim($_POST['client_code']) : null;
                    $send_sms = isset($_POST['send_sms']) ? intval($_POST['send_sms']) : 1;
                    $send_voice_call = isset($_POST['send_voice_call']) ? intval($_POST['send_voice_call']) : 1;
                    $auto_recharge = isset($_POST['auto_recharge']) ? (int)($_POST['auto_recharge'] == '1') : 0;
                    $auto_recharge_mode = (($_POST['auto_recharge_mode'] ?? '30_days') === 'custom') ? 'custom' : '30_days';
                    $auto_recharge_days = $auto_recharge_mode === 'custom' ? max(1, min(3650, (int)($_POST['auto_recharge_days'] ?? 30))) : 30;
                    $email = trim((string)($_POST['email'] ?? ''));
                    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $email = '';
                    $allowed_btrc_connectivity = ['Shared', 'Dedicated'];
                    $btrc_connectivity = in_array($_POST['btrc_connectivity'] ?? 'Shared', $allowed_btrc_connectivity, true) ? $_POST['btrc_connectivity'] : 'Shared';
                    $allowed_btrc_ip_types = ['Shared', 'Private', 'Public', 'Static Public', 'Dynamic Public'];
                    $btrc_ip_type = in_array($_POST['btrc_ip_type'] ?? 'Shared', $allowed_btrc_ip_types, true) ? $_POST['btrc_ip_type'] : 'Shared';
                    $sql = "INSERT INTO ".TBL_USERS." (
                                joining_date, name, phone, email, user_id, client_code, password, address, district, thana,
                                tj_box_name, zone_id, user_package, bill_amount, discount, router_id, manager_id,
                                current_bill_date, status, bill_position, phone2, nid, onu_mac, connection_type, client_type,
                                remarks, lat_long, profile_pic, send_sms, send_voice_call, auto_recharge, auto_recharge_mode, auto_recharge_days, assigned_ip,
                                btrc_connectivity, btrc_ip_type, btrc_house_no, btrc_road_no, btrc_area, btrc_distribution_location
                            ) VALUES (
                                :joining_date, :name, :phone, :email, :user_id, :client_code, :password, :address, :district, :thana,
                                :tj_box_name, :zone_id, :user_package, :bill_amount, :discount, :router_id, :manager_id,
                                :current_bill_date, :status, :bill_position, :phone2, :nid, :onu_mac, :connection_type, :client_type,
                                :remarks, :lat_long, :profile_pic, :send_sms, :send_voice_call, :auto_recharge, :auto_recharge_mode, :auto_recharge_days, :assigned_ip,
                                :btrc_connectivity, :btrc_ip_type, :btrc_house_no, :btrc_road_no, :btrc_area, :btrc_distribution_location
                            )";
                    $pdo->prepare($sql)->execute([
                        ':joining_date' => $joining_date,
                        ':name' => $_POST['name'],
                        ':phone' => $_POST['phone'],
                        ':email' => $email,
                        ':user_id' => $_POST['user_id'],
                        ':client_code' => $client_code,
                        ':password' => $_POST['password'],
                        ':address' => $_POST['address'],
                        ':district' => $_POST['district'],
                        ':thana' => $_POST['thana'],
                        ':tj_box_name' => $tj_box_name,
                        ':zone_id' => $zone_id,
                        ':user_package' => $svc['name'],
                        ':bill_amount' => $bill_amt,
                        ':discount' => $discount,
                        ':router_id' => $target_router,
                        ':manager_id' => $user,
                        ':current_bill_date' => $next_bill_date,
                        ':status' => $init_status,
                        ':bill_position' => $bill_pos,
                        ':phone2' => $_POST['phone2'],
                        ':nid' => $_POST['nid'],
                        ':onu_mac' => $_POST['onu_mac'],
                        ':connection_type' => $_POST['connection_type'],
                        ':client_type' => $_POST['client_type'],
                        ':remarks' => $_POST['remarks'],
                        ':lat_long' => $_POST['lat_long'],
                        ':profile_pic' => $profile_pic,
                        ':send_sms' => $send_sms,
                        ':send_voice_call' => $send_voice_call,
                        ':auto_recharge' => $auto_recharge,
                        ':auto_recharge_mode' => $auto_recharge_mode,
                        ':auto_recharge_days' => $auto_recharge_days,
                        ':assigned_ip' => trim((string)($_POST['assigned_ip'] ?? '')),
                        ':btrc_connectivity' => $btrc_connectivity,
                        ':btrc_ip_type' => $btrc_ip_type,
                        ':btrc_house_no' => trim((string)($_POST['btrc_house_no'] ?? '')),
                        ':btrc_road_no' => trim((string)($_POST['btrc_road_no'] ?? '')),
                        ':btrc_area' => trim((string)($_POST['btrc_area'] ?? '')),
                        ':btrc_distribution_location' => trim((string)($_POST['btrc_distribution_location'] ?? '')),
                    ]);
                   $newId = $pdo->lastInsertId();
                   $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=".$target_router);
                   if($r) { 
                       $mk = new MikrotikApp($r); 
                       $enable_mk = ($init_status === 'Active' || $init_status === 'Free'); 
                       // New-client creation is an explicit credential action.
                       // Set the requested PPPoE password once, then sync only state/profile.
                       $mk->setPppoePassword($_POST['user_id'], (string)$_POST['password'], true, $svc['mikrotik_profile_name'], $enable_mk);
                       $mk->toggle($_POST['user_id'], $enable_mk, $svc['mikrotik_profile_name'], $_POST['password']); 
                   }
                    log_tx($pdo, $wallet_owner_id, 'Expense', $cost, "Package Cost: New Client {$_POST['user_id']}", 'System', $user, $admin_cost);
                    log_tx($pdo, $wallet_owner_id, 'Income', $actual_income, "Bill Collection: New Client {$_POST['user_id']}", 'Cash', $user);
                   
                     if (isSystemAuthority()) {
                         log_finance($pdo, 'Expense', -$cost, 'System', 'Package Cost', $newId, "Package Cost: New Client {$_POST['user_id']}");
                         log_finance($pdo, 'Income', $actual_income, 'Cash', 'Bill Collection', $newId, "Bill Collection: New Client {$_POST['user_id']}");
                     } else {
                         log_profit($pdo, $user, $newId, $_POST['user_id'], $actual_income, $cost, 'New Client');
                     }

                    // --- WELCOME SMS ---
                    $welcome_tpl = get_sms_setting($pdo, $user, 'sms_tpl_welcome');
                    if (!$welcome_tpl) $welcome_tpl = "Welcome [NAME]! Your [ID] is active. Password: [PASS].";
                    $msg_to_send = str_replace(['[NAME]', '[ID]', '[PASS]'], [$_POST['name'], $_POST['user_id'], $_POST['password']], $welcome_tpl);
                    if (get_sms_setting($pdo, $user, 'sms_enabled_welcome') == '1') { sendSMS($pdo, $_POST['phone'], $msg_to_send, $user); }
                   
                   // --- AGENT COMMISSION LOGIC ---
                   $manager = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$user]);
                   if ($manager && $manager['agent_id'] > 0) {
                       $comm_amount = 0;
                       if ($manager['commission_type'] == 'Package') {
                           $ac = safeFetch($pdo, "SELECT commission FROM ".TBL_AGENT_COMM." WHERE staff_id=? AND service_id=?", [$manager['id'], $svc['id']]);
                           if ($ac) $comm_amount = (float)$ac['commission'];
                       } else {
                           $comm_amount = (float)$manager['agent_commission'];
                       }

                       if ($comm_amount > 0) {
                           $pdo->prepare("UPDATE ".TBL_AGENTS." SET balance = balance + ? WHERE id=?")->execute([$comm_amount, $manager['agent_id']]);
                           writeLog($pdo, 'System', 'Agent Commission', $manager['agent_id'], "Agent earned $comm_amount for client {$_POST['user_id']} (Reseller: {$manager['username']})");
                       }
                   } 
                   // -----------------------------

                   writeLog($pdo, $_SESSION['admin_username'], 'Add Client', $newId, "Added client: {$_POST['name']} ({$_POST['user_id']}) | Package: {$svc['name']} | Amount: $actual_income | Validity: $days days | via Cash"); $msg = "Client added successfully! Wallet deducted: ৳$cost"; 
                    $_SESSION['registration_success'] = [
                        'name' => $_POST['name'],
                        'user_id' => $_POST['user_id'],
                        'cost' => $cost
                    ];
               } catch (Exception $e) {
                   $error = "Error adding client: " . $e->getMessage();
               }
           } else $error = L('INSUFFICIENT_FUND');
       }
   }

   if (isset($_POST['recharge']) && hasRole('SubReseller')) {
       $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=".intval($_POST['uid']));
       if ($u) {
           $cd_stmt = $pdo->prepare("SELECT COUNT(*) FROM ".TBL_LOGS." WHERE target_id=? AND action_type='Recharge' AND timestamp >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)");
           $cd_stmt->execute([$u['id']]);
           if ($cd_stmt->fetchColumn() > 0) {
               $error = "Client was already recharged recently. Please wait 2 minutes.";
           } else {
               $pay_method = $_POST['pay_method'] ?? ($_POST['method'] ?? 'Cash');
               $input_trx_id = trim($_POST['trx_id'] ?? '');
               $trx_duplicate = false;
               if (!empty($input_trx_id) && in_array($pay_method, ['Bank', 'bKash', 'Nagad', 'Rocket'])) {
                   $trx_chk = $pdo->prepare("SELECT COUNT(*) FROM ".TBL_TX." WHERE description LIKE ?");
                   $trx_chk->execute(["%(Trx: $input_trx_id)%"]);
                   if ($trx_chk->fetchColumn() > 0) {
                       $trx_duplicate = true;
                   }
               }
               
               if ($trx_duplicate) {
                   $error = "Transaction ID '$input_trx_id' has already been used!";
               } else {
                   $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name='{$u['user_package']}'");
           if ($svc) {
               $offer_id = isset($_POST['offer_id']) ? intval($_POST['offer_id']) : 0;
               $r_days = 30; // Default
               $billing_days = 30; // Days to charge reseller for

               if ($offer_id > 0) {
                   $offer = safeFetch($pdo, "SELECT * FROM ".TBL_OFFERS." WHERE id=?", [$offer_id]);
                   if ($offer) {
                       $billing_days = $offer['buy_days'];
                       $r_days = $offer['buy_days'] + $offer['free_days'];
                       $offer_desc = "Offer: " . $offer['name'];
                   } else { $offer_id = 0; }
               }

               if ($offer_id == 0) {
                     // Regular Recharge is ALWAYS 30 days. Manual days are accepted only when
                     // the UI explicitly submits recharge_mode=manual. This prevents a stale
                     // hidden Manual Days value (e.g. 3) from corrupting a 30-day recharge.
                     $recharge_mode = strtolower(trim($_POST['recharge_mode'] ?? 'regular'));
                     if ($recharge_mode === 'manual') {
                         $r_days = intval($_POST['days'] ?? 30);
                         if ($r_days < 1) $r_days = 30;
                         $offer_desc = "Manual Recharge ({$r_days} Days)";
                     } else {
                         $r_days = 30;
                         $offer_desc = "Regular Recharge";
                     }
                     $billing_days = $r_days;
               }

                 $charger_id = $user;
                 $charger_is_admin = hasRole('Admin');
                 if ($charger_is_admin && isset($u['manager_id']) && $u['manager_id'] > 0) {
                     $mgr = safeFetch($pdo, "SELECT role FROM ".TBL_STAFF." WHERE id=?", [$u['manager_id']]);
                     if ($mgr && !in_array(strtolower(trim($mgr['role'])), ['admin', 'super admin'])) {
                         $charger_id = intval($u['manager_id']);
                         $charger_is_admin = false;
                     }
                 }

                 if ($charger_is_admin) {
                     $monthly_cost = floatval($svc['buying_price']);
                 } else {
                     $monthly_cost = getBuyPrice($pdo, $charger_id, $svc['id']);
                 }
                 
                 $cost = round(($monthly_cost / 30) * $billing_days, 2); 
                 $monthly_admin_cost = floatval($svc['buying_price']);
                 $admin_cost = round(($monthly_admin_cost / 30) * $billing_days, 2);
                 
                 // Fallback to service price if bill_amount is 0
                 $base_bill_amount = floatval($u['bill_amount']);
                 if ($base_bill_amount <= 0) {
                      $base_bill_amount = floatval($svc['price']);
                      // Auto-fix the bill amount in DB for future reference
                      $pdo->prepare("UPDATE ".TBL_USERS." SET bill_amount=? WHERE id=?")->execute([$base_bill_amount, $u['id']]);
                 }
                 
                 $income = round(($base_bill_amount / 30) * $billing_days, 2); // Gross recharge value
                 $pay_method = $_POST['pay_method'] ?? ($_POST['method'] ?? 'Cash');
                 $pay_method_norm = strtolower(trim((string)$pay_method));
                 // Both legacy value `Expire` and newer value `Due` mean: recharge on credit.
                 $is_due_recharge = in_array($pay_method_norm, ['expire', 'due'], true);

                 // Tenant-controlled recharge discount. Discount reduces customer collection, not the validity purchased.
                 $discount_mode_enabled = (get_opt($pdo, 'recharge_discount_enabled') === '1');
                 $discount_amount = 0.0;
                 if ($discount_mode_enabled && !$is_due_recharge) {
                     $discount_amount = round(max(0, floatval($_POST['recharge_discount'] ?? 0)), 2);
                     $discount_amount = min($discount_amount, $income);
                 }
                 $net_payment = max(0, round($income - $discount_amount, 2));

                 // Optional: settle existing client due first from actual cash received.
                 $deduct_due_requested = isset($_POST['deduct_due_balance']) && $_POST['deduct_due_balance'] == '1' && !$is_due_recharge;
                 $due_before = max(0, floatval($u['due'] ?? 0));
                 $due_deducted = $deduct_due_requested ? min($due_before, $net_payment) : 0;
                 $cash_recharge_after_due = max(0, round($net_payment - $due_deducted, 2));

                 // Discount itself must not reduce validity. Only old-due settlement consumes recharge value/validity.
                 $recharge_income_after_due = max(0, round($income - $due_deducted, 2));

                 // The old due already represented previously delivered service, so do not charge reseller bandwidth cost again for that portion.
                 $recharge_ratio = ($income > 0) ? ($recharge_income_after_due / $income) : 1;
                 $cost = round($cost * $recharge_ratio, 2);
                 $admin_cost = round($admin_cost * $recharge_ratio, 2);

                 $wallet_owner_id = deductWallet($pdo, $charger_id, $cost);
                if ($wallet_owner_id !== false) {
                    // Credit extension is limited to 1-10 days by the UI. Guard against old/corrupt values
                    // (e.g. 30) which previously reduced a 30-day recharge to zero validity.
                    $raw_credit_days = ($u['credit_taken'] == 1) ? intval($u['credit_days']) : 0;
                    $deduct_days = max(0, min(10, $raw_credit_days));
                    if ($raw_credit_days > 10) {
                        writeLog($pdo, $_SESSION['admin_username'], 'Credit Repair', $u['id'], "Invalid credit_days={$raw_credit_days} repaired to {$deduct_days} during recharge for {$u['user_id']}");
                    }
                    
                    // PROMISE DATE ADJUSTMENT
                    $extra_used_days = 0;
                    $promise_due = 0;
                    $promise_adjustment_log = "";
                    if (isset($u['promise_enabled']) && $u['promise_enabled'] == 1 && !empty($u['promise_date'])) {
                        $today = date('Y-m-d');
                        $expire_date = $u['current_bill_date'];
                        if ($today > $expire_date) {
                            $end_use_date = ($today < $u['promise_date']) ? $today : $u['promise_date'];
                            $diff = strtotime($end_use_date) - strtotime($expire_date);
                            $extra_used_days = max(0, round($diff / 86400));
                            if ($extra_used_days > 0) {
                                $daily_rate = $base_bill_amount / 30;
                                $promise_due = round($extra_used_days * $daily_rate, 2);
                            }
                        }
                    }

                    // Calculate remaining recharge amount and days after optional old-due settlement.
                    $remaining_income = $is_due_recharge ? $recharge_income_after_due : ($recharge_income_after_due - $promise_due);
                    if ($remaining_income < 0) {
                        $remaining_income = 0;
                    }
                    
                    if ($income > 0) {
                        $recharge_days_equivalent = round(($remaining_income / $income) * $r_days);
                    } else {
                        $recharge_days_equivalent = $r_days;
                    }
                    
                    $actual_days_to_add = $recharge_days_equivalent - $deduct_days;
                    if ($actual_days_to_add < 0) {
                        $actual_days_to_add = 0;
                    }
                    // A Due/Expire recharge must never consume wallet and leave the client expired.
                    if ($is_due_recharge && $r_days > 0 && $actual_days_to_add <= 0) {
                        $actual_days_to_add = max(1, $r_days - $deduct_days);
                    }
                    
                    if ($promise_due > 0) {
                        $promise_adjustment_log = " | Promise Adjustment: Deducted ৳{$promise_due} for {$extra_used_days} days";
                    }
                    
                    if ($due_deducted > 0) {
                        $new_due = max(0, $due_before - $due_deducted);
                        $pdo->prepare("UPDATE ".TBL_USERS." SET due=? WHERE id=?")->execute([$new_due, $u['id']]);
                    }

                    $base_date = ($u['current_bill_date'] > date('Y-m-d')) ? $u['current_bill_date'] : date('Y-m-d');
                    $newDate = $u['current_bill_date'];
                    if ($actual_days_to_add > 0) {
                        $newDate = date('Y-m-d', strtotime($base_date . " + $actual_days_to_add days"));
                        $upd = $pdo->prepare("UPDATE ".TBL_USERS." SET current_bill_date=?, status='Active', bill_position='Active', credit_taken=0, credit_days=0, promise_enabled=0, promise_date=NULL WHERE id=?");
                        $upd->execute([$newDate, $u['id']]);
                        // Defensive verification: a successful recharge must leave the client Active
                        // with the newly calculated expiry date.
                        $verify_recharge = safeFetch($pdo, "SELECT current_bill_date,status,bill_position FROM ".TBL_USERS." WHERE id=?", [$u['id']]);
                        if (!$verify_recharge || $verify_recharge['current_bill_date'] !== $newDate || $verify_recharge['status'] !== 'Active') {
                            throw new Exception("Recharge validity update failed for client {$u['user_id']}");
                        }
                    }
                    
                    // Re-fetch/toggle only when some recharge validity remains after due deduction.
                    $u_latest = $actual_days_to_add > 0 ? safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=".intval($u['id'])) : null;
                    if ($u_latest && !empty($u_latest['router_id'])) {
                        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=".intval($u_latest['router_id']));
                        if($r) { 
                            try {
                                $mk = new MikrotikApp($r); 
                                $res = $mk->toggle($u_latest['user_id'], true, $svc['mikrotik_profile_name'], $u_latest['password']); 
                            } catch (Exception $e) {
                                error_log("Mikrotik Toggle Error on Recharge: " . $e->getMessage());
                            }
                        }
                    }
                    
                    // Logs
                    log_tx($pdo, $wallet_owner_id, 'Expense', $cost, "Recharge Cost ($offer_desc): {$u['user_id']}", 'System', $charger_id, $admin_cost);
                    
                    // Finance Module Integration
                    $pay_method = $_POST['pay_method'] ?? 'Cash';
                    
                    // Always log bandwidth cost as Expense
                    if ($charger_is_admin) {
                        log_finance($pdo, 'Expense', -$cost, 'System', 'Cost of Bandwidth', $u['id'], "Cost for {$u['user_id']} ($offer_desc)");
                    } else {
                        log_profit($pdo, $charger_id, $u['id'], $u['user_id'], $cash_recharge_after_due, $cost, 'Manual Recharge');
                    }

                    $trx_id = !empty($_POST['trx_id']) ? " (Trx: " . $_POST['trx_id'] . ")" : ($is_due_recharge ? " (Trx: Due)" : "");
                    if (!$is_due_recharge) {
                        if ($due_deducted > 0) {
                            log_tx($pdo, $wallet_owner_id, 'Income', $due_deducted, "Due Payment Received: {$u['user_id']}" . $trx_id, $pay_method, $charger_id);
                            if ($charger_is_admin) {
                                log_finance($pdo, 'Income', $due_deducted, $pay_method, 'Due Collection', $u['id'], "Due Payment from {$u['user_id']}" . $trx_id);
                            }
                            writeLog($pdo, $_SESSION['admin_username'], 'Pay Due', $u['id'], "Auto-deducted due: ৳{$due_deducted} from recharge payment for {$u['user_id']} via {$pay_method}" . $trx_id);
                        }
                        if ($cash_recharge_after_due > 0) {
                            $discount_tx_note = $discount_amount > 0 ? " | Discount: ৳{$discount_amount} | Gross: ৳{$income}" : '';
                            log_tx($pdo, $wallet_owner_id, 'Income', $cash_recharge_after_due, "Bill Collection ($offer_desc): {$u['user_id']}" . $trx_id . $discount_tx_note, $pay_method, $charger_id);
                            if ($charger_is_admin) {
                                log_finance($pdo, 'Income', $cash_recharge_after_due, $pay_method, 'Customer Recharge', $u['id'], "Collection from {$u['user_id']} ($offer_desc)" . $trx_id . $discount_tx_note);
                            }
                        }
                    } else {
                        $due_charge = round($income + max(0, $promise_due), 2);
                        $pdo->prepare("UPDATE ".TBL_USERS." SET due = due + ? WHERE id=?")->execute([$due_charge, $u['id']]);
                        log_tx($pdo, $wallet_owner_id, 'Income', $due_charge, "Bill Due ($offer_desc): {$u['user_id']}", 'Due', $charger_id);
                    }

                    // --- PAYMENT RECEIVED SMS ---
                    if (!$is_due_recharge) {
                        $pay_tpl = get_sms_setting($pdo, $charger_id, 'sms_tpl_payment');
                        if (!$pay_tpl) $pay_tpl = "Dear [NAME], we have received [AMOUNT]৳ for ID [ID].";
                        $msg_to_send = str_replace(['[NAME]', '[ID]', '[AMOUNT]'], [$u['name'], $u['user_id'], $net_payment], $pay_tpl);
                        if (get_sms_setting($pdo, $charger_id, 'sms_enabled_payment') == '1') {
                            sendSMS($pdo, $u['phone'], $msg_to_send, $charger_id);
                        }
                    }
                   
                    // Embed credit info into the recharge log if credit was applied
                    $credit_note = '';
                    if ($deduct_days > 0) {
                        // Find the Extend Service log for this client to get the credit date
                        $ext_log = safeFetch($pdo,
                            "SELECT timestamp FROM " . TBL_LOGS . " WHERE target_id=? AND action_type='Extend Service' ORDER BY timestamp DESC LIMIT 1",
                            [$u['id']]
                        );
                        $credit_given_on = $ext_log ? date('d M Y', strtotime($ext_log['timestamp'])) : date('d M Y');
                        $credit_note = " | Credit: {$deduct_days} days (given: {$credit_given_on})";
                    }
                    $due_note = $due_deducted > 0 ? " | Due Deducted: ৳{$due_deducted} | Recharge Value: ৳{$recharge_income_after_due}" : '';
                    $discount_note = $discount_amount > 0 ? " | Gross: ৳{$income} | Discount: ৳{$discount_amount} | Paid: ৳{$cash_recharge_after_due}" : '';
                    $expiry_note = $actual_days_to_add > 0 ? " | Expiry: {$newDate}" : '';
                    if ($recharge_income_after_due > 0 && $actual_days_to_add > 0) {
                        writeLog($pdo, $_SESSION['admin_username'], 'Recharge', $u['id'], "Recharged client: {$u['user_id']} for {$actual_days_to_add} days ($offer_desc) - Amount: ৳{$cash_recharge_after_due}" . $trx_id . $credit_note . $expiry_note . $promise_adjustment_log . $due_note . $discount_note);
                    }
                    if ($discount_amount > 0) {
                        writeLog($pdo, $_SESSION['admin_username'], 'Recharge Discount', $u['id'], "Manual recharge discount: ৳{$discount_amount} | Gross: ৳{$income} | Net Paid: ৳{$net_payment} for {$u['user_id']}");
                    }
                    if ($due_deducted > 0) {
                        $msg = "Payment ৳{$net_payment}: discount ৳{$discount_amount}; due deducted ৳{$due_deducted}; recharge collection ৳{$cash_recharge_after_due}; validity {$actual_days_to_add} day(s). Wallet deducted: ৳{$cost}.";
                    } elseif ($discount_amount > 0) {
                        $msg = "Recharged {$actual_days_to_add} day(s). Gross ৳{$income}, discount ৳{$discount_amount}, paid ৳{$net_payment}. Wallet deducted: ৳{$cost}.";
                    } else {
                        if ($actual_days_to_add > 0) {
                            $msg = "Recharged {$actual_days_to_add} day(s) with {$offer_desc}. New expiry: {$newDate}. Wallet deducted: ৳{$cost}.";
                        } else {
                            $msg = "Payment processed, but no new validity was available after adjustments. No client activation was performed.";
                        }
                    }
                } else $error = L('INSUFFICIENT_FUND');
            } else $error = "Service not found";
            } // End Trx Check else
        } // End Cooldown else
    } // End if($u)
} // End if(isset(recharge))

    if (isset($_POST['pay_client_due'])) {
        if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('pay_due')) {
            $error = "Access Denied: You do not have permission to collect due payments.";
        } else {
            $uid = intval($_POST['uid']);
            $pay_amount = floatval($_POST['amount']);
            $pay_method = $_POST['pay_method'] ?? 'Cash';
            $input_trx_id = trim($_POST['trx_id'] ?? '');

            $trx_duplicate = false;
            if (!empty($input_trx_id) && in_array($pay_method, ['Bank', 'bKash', 'Nagad', 'Rocket'])) {
                $trx_chk = $pdo->prepare("SELECT COUNT(*) FROM ".TBL_TX." WHERE description LIKE ?");
                $trx_chk->execute(["%(Trx: $input_trx_id)%"]);
                if ($trx_chk->fetchColumn() > 0) {
                    $trx_duplicate = true;
                }
            }
            
            if ($trx_duplicate) {
                $error = "Transaction ID '$input_trx_id' has already been used!";
            } else {
                $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$uid]);
                if ($u && $pay_amount > 0) {
                $new_due = floatval($u['due']) - $pay_amount;
                
                $pdo->prepare("UPDATE ".TBL_USERS." SET due=? WHERE id=?")->execute([$new_due, $u['id']]);
                
                $wallet_owner_id = deductWallet($pdo, $user, 0); // Resolve owner without deducting
                $trx_id = !empty($_POST['trx_id']) ? " (Trx: " . $_POST['trx_id'] . ")" : "";
                log_tx($pdo, $wallet_owner_id, 'Income', $pay_amount, "Due Payment Received: {$u['user_id']}" . $trx_id, $pay_method, $user);
                
                if (isSystemAuthority()) {
                    log_finance($pdo, 'Income', $pay_amount, $pay_method, 'Due Collection', $u['id'], "Due Payment from {$u['user_id']}" . $trx_id);
                }
                
                writeLog($pdo, $_SESSION['admin_username'], 'Pay Due', $u['id'], "Collected due amount: ৳$pay_amount from {$u['user_id']} via $pay_method" . $trx_id);
                $msg = "Due payment of ৳$pay_amount successfully recorded.";
            } else $error = "User not found or invalid amount.";
            } // End Trx Check else
        }
    }

   if (isset($_POST['create_staff']) && (hasRole('Reseller') || hasRole('Supervisor') || hasRole('Admin'))) {
       $username = trim($_POST['username']);
       $exist = safeFetch($pdo, "SELECT id FROM ".TBL_STAFF." WHERE username=?", [$username]);
       if ($exist) {
           $error = "Username '$username' is already taken.";
       } else {
           $assign_router = ($my_router_id > 0) ? $my_router_id : intval($_POST['staff_router_id'] ?? 0);
           $agent_id = isset($_POST['agent_id']) ? intval($_POST['agent_id']) : 0;
           $agent_comm = isset($_POST['agent_commission']) ? floatval($_POST['agent_commission']) : 0;
           $advance_limit = isset($_POST['advance_balance_limit']) ? floatval($_POST['advance_balance_limit']) : 0;
           $supervisor_id = isset($_POST['supervisor_id']) ? intval($_POST['supervisor_id']) : 0;
           $allowed_packages = isset($_POST['allowed_packages']) && is_array($_POST['allowed_packages']) ? json_encode($_POST['allowed_packages']) : null;
            $comm_type = $_POST['commission_type'] ?? 'Fixed';
            $can_undo_recharge = isset($_POST['can_undo_recharge']) ? 1 : 0;
            $expire_time = $_POST['expire_time'] ?? '23:59:59';
            $sms_balance = isset($_POST['sms_balance']) ? floatval($_POST['sms_balance']) : 0;
            $sms_rate = isset($_POST['sms_rate']) ? floatval($_POST['sms_rate']) : 0;
            $can_use_global_sms = isset($_POST['can_use_global_sms']) ? 1 : 0;
            $stmt = $pdo->prepare("INSERT INTO ".TBL_STAFF." (name, username, password, role, parent_id, router_id, agent_id, agent_commission, commission_type, phone, nid, address, advance_balance_limit, supervisor_id, allowed_packages, can_undo_recharge, expire_time, sms_balance, sms_rate, can_use_global_sms, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'Active')");
            $params = [$_POST['name'], $username, $_POST['password'], $_POST['role'], $user, $assign_router, $agent_id, $agent_comm, $comm_type, $_POST['phone']??'', $_POST['nid']??'', $_POST['address']??'', $advance_limit, $supervisor_id, $allowed_packages, $can_undo_recharge, $expire_time, $sms_balance, $sms_rate, $can_use_global_sms];

           if($stmt->execute($params)) {
               writeLog($pdo, $_SESSION['admin_username'], 'Create Staff', 0, "Created staff: $username");
               $msg = "Staff created";
           } else {
               $errInfo = $stmt->errorInfo();
               $error = "Failed to create staff: " . $errInfo[2];
           }
       }
   }
   
   if (isset($_POST['edit_staff']) && (hasRole('Reseller') || hasRole('Admin') || hasRole('Supervisor'))) {
       $target_id = $_POST['staff_id'];
       $can_edit = hasRole('Admin') || isOffice();
       if (!$can_edit) {
           $stmt = $pdo->prepare("SELECT id FROM ".TBL_STAFF." WHERE id=? AND (parent_id=? OR supervisor_id=?)");
           $stmt->execute([$target_id, $user, $user]);
           if ($stmt->fetch()) $can_edit = true;
       }

        if ($can_edit) {
            $name = $_POST['name']; $username = trim($_POST['username']); $role = $_POST['role'];
            
            // Check if username is taken by another user
            $exist = safeFetch($pdo, "SELECT id FROM ".TBL_STAFF." WHERE username=? AND id != ?", [$username, $target_id]);
            if ($exist) {
                $error = "Username '$username' is already taken.";
            } else {
                $router = isset($_POST['staff_router_id']) ? intval($_POST['staff_router_id']) : 0;
                $agent_id = isset($_POST['agent_id']) ? intval($_POST['agent_id']) : 0;
                $agent_comm = isset($_POST['agent_commission']) ? floatval($_POST['agent_commission']) : 0;
                $phone = $_POST['phone'] ?? '';
                $nid = $_POST['nid'] ?? '';
                $address = $_POST['address'] ?? '';
                
                // Ensure advance limit is captured correctly even if disabled or missing, and typecast
                $advance_limit = isset($_POST['advance_balance_limit']) ? floatval($_POST['advance_balance_limit']) : 0;
                $supervisor_id = isset($_POST['supervisor_id']) ? intval($_POST['supervisor_id']) : 0;
                $allowed_packages = isset($_POST['allowed_packages']) && is_array($_POST['allowed_packages']) ? json_encode($_POST['allowed_packages']) : null;

                $comm_type = $_POST['commission_type'] ?? 'Fixed';
                 $can_undo_recharge = isset($_POST['can_undo_recharge']) ? 1 : 0;
                 $expire_time = $_POST['expire_time'] ?? '23:59:59';
                  $sms_balance = isset($_POST['sms_balance']) ? floatval($_POST['sms_balance']) : 0;
                  $sms_rate = isset($_POST['sms_rate']) ? floatval($_POST['sms_rate']) : 0;
                  $can_use_global_sms = isset($_POST['can_use_global_sms']) ? 1 : 0;
                  if (!empty($_POST['password'])) {
                      $pass = $_POST['password'];
                      $pdo->prepare("UPDATE ".TBL_STAFF." SET name=?, username=?, password=?, role=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=?, advance_balance_limit=?, supervisor_id=?, allowed_packages=?, can_undo_recharge=?, expire_time=?, sms_balance=?, sms_rate=?, can_use_global_sms=? WHERE id=?")->execute([$name, $username, $pass, $role, $router, $agent_id, $agent_comm, $comm_type, $phone, $nid, $address, $advance_limit, $supervisor_id, $allowed_packages, $can_undo_recharge, $expire_time, $sms_balance, $sms_rate, $can_use_global_sms, $target_id]);
                  } else {
                      $pdo->prepare("UPDATE ".TBL_STAFF." SET name=?, username=?, role=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=?, advance_balance_limit=?, supervisor_id=?, allowed_packages=?, can_undo_recharge=?, expire_time=?, sms_balance=?, sms_rate=?, can_use_global_sms=? WHERE id=?")->execute([$name, $username, $role, $router, $agent_id, $agent_comm, $comm_type, $phone, $nid, $address, $advance_limit, $supervisor_id, $allowed_packages, $can_undo_recharge, $expire_time, $sms_balance, $sms_rate, $can_use_global_sms, $target_id]);
                  }
                writeLog($pdo, $_SESSION['admin_username'], 'Edit Staff', $target_id, "Updated staff info for: $username");
                $msg = "Staff updated successfully.";
            }
        } else $error = L('DENIED');
   }
   
   if (isset($_GET['action']) && $_GET['action'] == 'delete_staff' && (hasRole('Reseller') || isOffice())) {
       $target_id = $_GET['id'];
       $can_delete = hasRole('Admin') || isOffice();
       if (!$can_delete) {
           $stmt = $pdo->prepare("SELECT id FROM ".TBL_STAFF." WHERE id=? AND parent_id=?");
           $stmt->execute([$target_id, $user]);
           if ($stmt->fetch()) $can_delete = true;
       }
       if ($can_delete) {
           $t_staff = safeFetch($pdo, "SELECT name, username FROM ".TBL_STAFF." WHERE id=?", [$target_id]);
           $t_label = $t_staff ? $t_staff['name'] . " (" . $t_staff['username'] . ")" : $target_id;
           $pdo->prepare("UPDATE ".TBL_STAFF." SET status='Left' WHERE id=?")->execute([$target_id]);
           writeLog($pdo, $_SESSION['admin_username'], 'Delete Staff', $target_id, "Marked staff $t_label as Left");
           $_SESSION['flash_msg'] = "Staff marked as Left.";
           
           if (($_GET['tab'] ?? '') == 'agents') { header("Location: ?tab=left_resellers"); exit; }
           if (($_GET['tab'] ?? '') == 'staff') { header("Location: ?tab=left_staff"); exit; }
           
           $msg = "Staff marked as Left.";
       } else $error = L('DENIED');
   }
   
   if (isset($_GET['action']) && $_GET['action'] == 'restore_staff' && (hasRole('Reseller') || isOffice())) {
        $target_id = $_GET['id'];
        $can_restore = hasRole('Admin') || isOffice();
        if (!$can_restore) {
            $stmt = $pdo->prepare("SELECT id FROM ".TBL_STAFF." WHERE id=? AND parent_id=?");
            $stmt->execute([$target_id, $user]);
            if ($stmt->fetch()) $can_restore = true;
        }
        if ($can_restore) {
            $t_staff = safeFetch($pdo, "SELECT name, username FROM ".TBL_STAFF." WHERE id=?", [$target_id]);
            $t_label = $t_staff ? $t_staff['name'] . " (" . $t_staff['username'] . ")" : $target_id;
            $pdo->prepare("UPDATE ".TBL_STAFF." SET status='Active' WHERE id=?")->execute([$target_id]);
            writeLog($pdo, $_SESSION['admin_username'], 'Restore Staff', $target_id, "Restored staff $t_label");
            $_SESSION['flash_msg'] = "Staff restored successfully.";
            
            if (($_GET['tab'] ?? '') == 'agents') { header("Location: ?tab=agents"); exit; }
            if (($_GET['tab'] ?? '') == 'staff') { header("Location: ?tab=staff"); exit; }
            
            $msg = "Staff restored.";
        } else $error = L('DENIED');
   }
   
   if (isset($_GET['action']) && $_GET['action'] == 'perm_delete_staff' && (hasRole('Admin') || isOffice())) {
       $t_staff = safeFetch($pdo, "SELECT name, username FROM ".TBL_STAFF." WHERE id=?", [$_GET['id']]);
       $t_label = $t_staff ? $t_staff['name'] . " (" . $t_staff['username'] . ")" : $_GET['id'];
       $pdo->prepare("DELETE FROM ".TBL_STAFF." WHERE id=?")->execute([$_GET['id']]);
       writeLog($pdo, $_SESSION['admin_username'], 'Perm Delete Staff', $_GET['id'], "Permanently deleted staff $t_label");
       $_SESSION['flash_msg'] = "Staff permanently deleted.";
       if (($_GET['tab'] ?? '') == 'agents') { header("Location: ?tab=left_resellers"); exit; }
       if (($_GET['tab'] ?? '') == 'staff') { header("Location: ?tab=left_staff"); exit; }
       $msg = "Staff permanently deleted.";
   }

   if ((isset($_POST['make_left_confirm']) || (isset($_POST['action']) && $_POST['action'] === 'make_left_confirm')) && hasRole('SubReseller')) {
        $cid = $_POST['id'];
        $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=".intval($cid));
        
        if($u) {
            $scope = getManagedStaffIds($pdo, $user, $role);
            if($scope !== 'ALL' && !in_array($u['manager_id'], $scope)) {
                $error = L('DENIED');
            } else {
                $bill_date = new DateTime($u['current_bill_date']);
                $today = new DateTime(date('Y-m-d'));
                $refund_amount = 0;
                if($bill_date > $today) {
                    $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name='{$u['user_package']}'");
                    if($svc) {
                        $diff = $today->diff($bill_date);
                        $days_remaining = $diff->days;
                        $cost_price = getBuyPrice($pdo, $u['manager_id'], $svc['id']);
                        $daily_rate = $cost_price / 30;
                        $refund_amount = round($daily_rate * $days_remaining, 2);
                    }
                }
                
                $refund_method = $_POST['refund_method']; 

                $pdo->prepare("UPDATE ".TBL_USERS." SET status='Left', bill_position='Left', current_bill_date=? WHERE id=?")->execute([date('Y-m-d'), $cid]);
                if($u['router_id']) {
                    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id={$u['router_id']}");
                    if($r) { 
                        try {
                            $mk = new MikrotikApp($r); 
                            $mk->toggle($u['user_id'], false, ''); 
                        } catch (\Exception $e) {
                            writeLog($pdo, $_SESSION['admin_username'], 'Router Error', $cid, "Mikrotik error during Left: " . $e->getMessage());
                        }
                    }
                }
                
                if ($refund_amount > 0) {
                    if ($refund_method == 'Wallet') {
                        $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance + ? WHERE id=?")->execute([$refund_amount, $u['manager_id']]);
                        log_tx($pdo, $u['manager_id'], 'Income', $refund_amount, "Refund (Wallet): Client Left {$u['user_id']}", 'System', $user);
                    } elseif ($refund_method == 'Cash') {
                        // Cash payment is a physical act, but if it affects logical wallet...
                        log_tx($pdo, $u['manager_id'], 'Expense', $refund_amount, "Refund (Cash): Client Left {$u['user_id']}", 'Cash', $user);
                    }
                }
                
                writeLog($pdo, $_SESSION['admin_username'], 'Make Client Left', $cid, "Marked client {$u['user_id']} as left. Refund: $refund_amount ($refund_method)");
                $msg = L("Refund successful: ") . "৳$refund_amount ($refund_method)";
            }
        }
    }
   
    if (isset($_POST['permanent_delete_client']) && hasRole('SubReseller')) {
        $cid = intval($_POST['delete_client_id']);
        $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$cid]);
        
        if ($u && $u['status'] == 'Left') {
            $scope = getManagedStaffIds($pdo, $user, $role);
            if ($scope !== 'ALL' && !in_array($u['manager_id'], $scope)) {
                $error = L('DENIED');
            } else {
                $pdo->prepare("DELETE FROM ".TBL_USERS." WHERE id=?")->execute([$cid]);
                writeLog($pdo, $_SESSION['admin_username'], 'Perm Delete Client', $cid, "Permanently deleted left client {$u['user_id']}");
                $msg = "Client permanently deleted.";
            }
        } else {
            $error = "Client must be marked as Left before permanent deletion.";
        }
    }
    
    // Toggle Client Status (GET Wrapper)
    if (isset($_GET['action']) && $_GET['action'] == 'toggle_status' && isset($_GET['id']) && isset($_GET['status']) && hasRole('SubReseller')) {
        $id = intval($_GET['id']);
        $new_status = $_GET['status'];
        $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$id]);
        if ($u) {
            if ($new_status === 'Inactive' && $u['status'] !== 'Inactive') { pause_client_days($pdo, $id); }
            $pdo->prepare("UPDATE ".TBL_USERS." SET status=?, bill_position=? WHERE id=?")->execute([$new_status, $new_status, $id]);
            if ($new_status === 'Active' && $u['status'] !== 'Active') { resume_client_days($pdo, $id); }
            if ($u['router_id']) {
                $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
                if ($r) {
                    $mk = new MikrotikApp($r);
                    $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
                    $profile = $svc ? $svc['mikrotik_profile_name'] : '';
                    $mk->toggle($u['user_id'], ($new_status === 'Active'), $profile, $u['password']);
                }
            }
            writeLog($pdo, $_SESSION['admin_username'], 'Status Change', $id, "Changed status of {$u['user_id']} to $new_status");
            $_SESSION['flash_msg'] = "Client status updated to $new_status";
        }
        header("Location: ?tab=clients");
        exit;
    }

    // Delete Client (GET Wrapper)
    if (isset($_GET['action']) && $_GET['action'] == 'delete_client' && isset($_GET['id']) && hasRole('SubReseller')) {
        $id = intval($_GET['id']);
        $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$id]);
        if ($u && $u['status'] === 'Left') {
            $pdo->prepare("DELETE FROM ".TBL_USERS." WHERE id=?")->execute([$id]);
            writeLog($pdo, $_SESSION['admin_username'], 'Delete Client', $id, "Permanently deleted client {$u['user_id']}");
            $_SESSION['flash_msg'] = "Client permanently deleted.";
        }
        header("Location: ?tab=clients");
        exit;
    }

   if (isset($_GET['action']) && $_GET['action'] == 'restore_client' && hasRole('SubReseller')) {
       $pdo->prepare("UPDATE ".TBL_USERS." SET status='Expire', bill_position='Expire' WHERE id=?")->execute([$_GET['id']]);
       writeLog($pdo, $_SESSION['admin_username'], 'Restore Client', $_GET['id'], "Restored client {$_GET['id']} to Expire");
       $msg = "Client restored (Expire).";
   }
   if (isset($_GET['action']) && $_GET['action'] == 'perm_delete_client' && (hasRole('Admin') || isOffice())) {
       $pdo->prepare("DELETE FROM ".TBL_USERS." WHERE id=?")->execute([$_GET['id']]);
       writeLog($pdo, $_SESSION['admin_username'], 'Perm Delete Client', $_GET['id'], "Deleted client {$_GET['id']}");
       $msg = "Client permanently deleted.";
   }

   if (isset($_POST['move_client_confirm']) && (hasRole('Admin') || isOffice() || hasRole('Reseller') || hasRole('SubReseller'))) {
       $cid = intval($_POST['id']);
       $new_owner_id = intval($_POST['new_reseller_id']);
       
       $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$cid]);
       $new_owner = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$new_owner_id]);
       
       if ($u && $new_owner) {
            // Scope check: non-admin users can only move clients they manage
            $scope = getManagedStaffIds($pdo, $user, $role);
            if ($scope !== 'ALL' && !in_array($u['manager_id'], $scope)) {
                $error = "Access Denied: You can only move your own clients.";
            } else {
                $pdo->prepare("UPDATE ".TBL_USERS." SET manager_id=? WHERE id=?")->execute([$new_owner_id, $cid]);
                writeLog($pdo, $_SESSION['admin_username'], 'Move Client', $cid, "Moved client {$u['user_id']} ({$u['name']}) from Reseller #{$u['manager_id']} to Reseller #{$new_owner_id} ({$new_owner['username']})");
                $msg = "Client moved to {$new_owner['name']} successfully.";
            }
       } else {
            $error = "Invalid client or reseller.";
       }
   }

    if (isset($_POST['bulk_move']) && (hasRole('Admin') || isOffice() || hasRole('Reseller') || hasRole('SubReseller'))) {
        $ids = $_POST['bulk_ids'] ?? [];
        $new_reseller_id = intval($_POST['bulk_reseller_id']);
        
        if (!empty($ids) && $new_reseller_id > 0) {
            // Security Check: Non-admins can only move to resellers they manage, and only move clients they manage
            if (!hasRole('Admin') && !isOffice()) {
                $managed_ids = getManagedStaffIds($pdo, $user, $role);
                if (!in_array($new_reseller_id, $managed_ids)) {
                    $error = "Access Denied: You do not manage the target Reseller/Agent.";
                    $ids = []; // Clear ids to prevent action
                }
                
                // Also ensure all bulk_ids belong to the reseller or their managed resellers
                if (!empty($ids)) {
                    $clean_ids = array_map('intval', $ids);
                    $placeholders = implode(',', array_fill(0, count($clean_ids), '?'));
                    $client_check = safeFetchAll($pdo, "SELECT manager_id FROM ".TBL_USERS." WHERE id IN ($placeholders)", $clean_ids);
                    foreach ($client_check as $cc) {
                        if (!in_array($cc['manager_id'], $managed_ids)) {
                            $error = "Access Denied: You do not manage one or more of the selected clients.";
                            $ids = [];
                            break;
                        }
                    }
                }
            }

            if (!empty($ids)) {
                $new_owner = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$new_reseller_id]);
                
                if ($new_owner) {
                    // Prepare IDs for SQL IN clause
                    // Sanitize IDs
                    $clean_ids = array_map('intval', $ids);
                    $placeholders = implode(',', array_fill(0, count($clean_ids), '?'));
                    
                    // We need to merge params: first the new manager ID, then all the client IDs
                    $params = array_merge([$new_reseller_id], $clean_ids);
                    
                    $sql = "UPDATE ".TBL_USERS." SET manager_id=? WHERE id IN ($placeholders)";
                    $stmt = $pdo->prepare($sql);
                    
                    if ($stmt->execute($params)) {
                        $count = $stmt->rowCount();
                        writeLog($pdo, $_SESSION['admin_username'], 'Bulk Move', 0, "Moved $count clients to Reseller #{$new_reseller_id} ({$new_owner['username']})");
                        $msg = "Successfully moved $count clients to {$new_owner['name']}.";
                    } else {
                        $error = "Failed to update clients.";
                    }
                } else {
                     $error = "Invalid target reseller.";
                }
            }
        } else {
            $error = "Please select clients and a target reseller.";
        }
    }

   if (isset($_POST['transfer_fund']) && (hasRole('Reseller') || hasRole('Supervisor'))) {
       $amount = floatval($_POST['amount']);
       $target_id = $_POST['target_id'];
       $method = $_POST['method'] ?? 'Cash';
       $wallet_owner_id = (hasRole('Admin') && !isOffice()) ? $user : deductWallet($pdo, $user, $amount);

        if($wallet_owner_id !== false) {
            $pdo->prepare("UPDATE ".TBL_STAFF." SET balance=balance+? WHERE id=?")->execute([$amount, $target_id]);
            
            $receiver = safeFetch($pdo, "SELECT username FROM ".TBL_STAFF." WHERE id=?", [$target_id]);
            $r_name = $receiver ? $receiver['username'] : 'Unknown';
            
            if ($method == 'Expire' || $method == 'Due') {
                 $pdo->prepare("UPDATE ".TBL_STAFF." SET due_balance=due_balance+? WHERE id=?")->execute([$amount, $target_id]);
                 log_tx($pdo, $wallet_owner_id, 'Transfer', ((hasRole('Admin') || hasRole('Supervisor')) ? $amount : 0), "Sold Credit ($method) to: $r_name", $method, $user);
                 log_finance($pdo, 'Transfer', $amount, $method, "Fund Sold ($method)", $target_id, "Reseller credit sold to $r_name ($method)");
                 // Log for Reseller (Credit Statement)
                 log_tx($pdo, $target_id, 'Credit', $amount, "Credit Given by: " . $_SESSION['admin_username'], $method, $user);
            } else {
                 log_tx($pdo, $wallet_owner_id, 'Payment', $amount, "Sold Credit to: $r_name", $method, $user);
                 log_finance($pdo, 'Income', $amount, $method, 'Fund Sold', $target_id, "Reseller credit sold to $r_name");
                 // Log for Reseller (Fund Received Statement)
                 log_tx($pdo, $target_id, 'Income', $amount, "Fund Received from: " . $_SESSION['admin_username'], $method, $user);
            }
           
           // Removed redundant log_tx
           writeLog($pdo, $_SESSION['admin_username'], 'Fund Transfer', $target_id, "Transferred $amount to $r_name via $method");
           $msg = "Fund Transferred via $method";
       } else $error = L('INSUFFICIENT_FUND');
   }

    if (isset($_POST['withdraw_fund']) && (hasRole('Reseller') || hasRole('Supervisor'))) {
        $amount = floatval($_POST['amount']);
        $target_id = $_POST['target_id'];
        $desc = trim($_POST['description'] ?? "Balance withdrawn by Admin");
        
        $target = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$target_id]);
        if ($target) {
            if ($target['balance'] >= $amount) {
                $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance - ? WHERE id=?")->execute([$amount, $target_id]);
                
                // Return to Admin/Parent wallet
                $wallet_owner_id = (isOffice() && $_SESSION['parent_id'] > 0) ? $_SESSION['parent_id'] : $user;
                if (!isAdminRole($_SESSION['user_role'] ?? '')) {
                     $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance + ? WHERE id=?")->execute([$amount, $wallet_owner_id]);
                }

                $full_desc = "Balance Refund: " . $desc;
                log_tx($pdo, $target_id, 'Expense', $amount, $full_desc, 'Withdraw', $user);
                log_tx($pdo, $wallet_owner_id, 'Income', $amount, "Balance Refunded from: " . $target['username'], 'Withdraw', $user);
                log_finance($pdo, 'Income', $amount, 'Withdraw', 'Fund Refund', $target_id, "Balance refunded from " . $target['username'] . ": " . $desc);
                
                writeLog($pdo, $_SESSION['admin_username'], 'Fund Refund', $target_id, "Refunded $amount from " . $target['username']);
                $msg = "Fund Refunded Successfully";
            } else {
                $error = "Insufficient Balance in Reseller Account";
            }
        } else $error = "Invalid Reseller";
    }

   if (isset($_POST['collect_due']) && (hasRole('Reseller') || hasRole('Supervisor'))) {
       $amount = floatval($_POST['amount']);
       $discount = floatval($_POST['discount'] ?? 0);
       $target_id = $_POST['target_id'];
       $method = $_POST['method']; 

       $wallet_owner_id = (isOffice() && $_SESSION['parent_id'] > 0) ? $_SESSION['parent_id'] : $user;
       $total_reduction = $amount + $discount;
       $pdo->prepare("UPDATE ".TBL_STAFF." SET due_balance=due_balance-? WHERE id=?")->execute([$total_reduction, $target_id]);
        log_tx($pdo, $wallet_owner_id, 'Income', $amount, "Collected Expire from Staff #$target_id", $method, $user);
        $fin_desc = "Collected due from staff $target_id";
        if($discount > 0) $fin_desc .= " (Discount: $discount)";
        log_finance($pdo, 'Income', $amount, $method, 'Collect Expire', $target_id, $fin_desc);
       // Log for Reseller (Payment Statement)
       log_tx($pdo, $target_id, 'Payment', $amount, "Paid Expire to: " . $_SESSION['admin_username'], $method);
       if ($discount > 0) {
           log_tx($pdo, $user, 'Discount', $discount, "Discount given to Staff #$target_id during due collection", 'System');
           // Log for Reseller (Discount Received)
           log_tx($pdo, $target_id, 'Discount', $discount, "Discount received from: " . $_SESSION['admin_username'], 'System');
       }
       writeLog($pdo, $_SESSION['admin_username'], 'Collect Expire', $target_id, "Collected due $amount (Discount: $discount) from staff $target_id");
       $msg = "Expire Collected.";
   }

   if (isset($_POST['set_rates']) && (hasRole('Reseller') || hasRole('Supervisor'))) {
       foreach($_POST['rates'] as $sid => $price) {
           if($price === '') continue; 
           $pdo->prepare("INSERT INTO ".TBL_PRICING." (staff_id, service_id, custom_price) VALUES (?,?,?) ON DUPLICATE KEY UPDATE custom_price=?")
               ->execute([$_POST['target_id'], $sid, $price, $price]);
       }
       writeLog($pdo, $_SESSION['admin_username'], 'Set Rates', $_POST['target_id'], "Updated rates for staff {$_POST['target_id']}");
       $msg = "Rates updated";
   }

   if (isset($_POST['set_agent_rates']) && (hasRole('Reseller') || hasRole('Supervisor'))) {
       foreach($_POST['agent_rates'] as $sid => $comm) {
           if($comm === '') continue; 
           $pdo->prepare("INSERT INTO ".TBL_AGENT_COMM." (staff_id, service_id, commission) VALUES (?,?,?) ON DUPLICATE KEY UPDATE commission=?")
               ->execute([$_POST['target_id'], $sid, $comm, $comm]);
       }
       $msg = "Agent commissions updated";
   }

   if (isset($_GET['action']) && $_GET['action'] == 'reset_rate' && (hasRole('Reseller') || hasRole('Supervisor'))) {
       $pdo->prepare("DELETE FROM ".TBL_PRICING." WHERE staff_id=? AND service_id=?")
           ->execute([$_GET['staff_id'], $_GET['service_id']]);
       $msg = "Rate reset to default.";
   }
   
    if (isset($_POST['edit_user_full'])) {
        $uid = intval($_POST['uid']);
        $existing = safeFetch($pdo, "SELECT profile_pic, user_id, password, user_package, promise_enabled, promise_date, status, bill_position FROM " . TBL_USERS . " WHERE id=" . $uid);

        // The full edit form contains package and promise fields, but Office
        // Staff need the dedicated permissions before either value may change.
        if (isOffice() && !hasRole('Admin')) {
            if (!hasPermission('client_change_package')) {
                $_POST['pkg'] = $existing['user_package'] ?? '';
            }
            if (!hasPermission('client_promise_date')) {
                $_POST['promise_enabled'] = (int)($existing['promise_enabled'] ?? 0);
                $_POST['promise_date'] = !empty($existing['promise_date'])
                    ? (int)date('d', strtotime($existing['promise_date']))
                    : '';
                if (($_POST['status'] ?? '') === 'Promise Active' && ($existing['status'] ?? '') !== 'Promise Active') {
                    $_POST['status'] = $existing['status'] ?? 'Active';
                    $_POST['bill_position'] = $existing['bill_position'] ?? 'Active';
                }
            }
        }
        
        $old_user_id = $existing['user_id'];
        $new_user_id = trim($_POST['user_id']);
        // A blank password field on the general edit form means keep the current PPPoE password.
        $submitted_pppoe_password = (string)($_POST['password'] ?? '');
        $effective_pppoe_password = ($submitted_pppoe_password !== '') ? $submitted_pppoe_password : (string)($existing['password'] ?? '');
        $user_id_changed = false;
        
        if (!empty($new_user_id) && $new_user_id !== $old_user_id) {
            $exists = safeFetch($pdo, "SELECT id FROM ".TBL_USERS." WHERE user_id=? AND id!=?", [$new_user_id, $uid]);
            if ($exists) {
                $error = "The PPPoE ID '{$new_user_id}' is already taken by another client.";
            } else {
                $user_id_changed = true;
            }
        }
        
        if (!isset($error)) {
            // Profile Picture Upload
            $profile_pic = $existing['profile_pic'];
            if (isset($_FILES['profile_pic']) && $_FILES['profile_pic']['error'] === UPLOAD_ERR_OK) {
                $fileTmpPath = $_FILES['profile_pic']['tmp_name'];
                $fileName = $_FILES['profile_pic']['name'];
                $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
                $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];

                if (in_array($fileExtension, $allowedExtensions)) {
                    $newFileName = 'pp_' . $uid . '_' . time() . '.' . $fileExtension;
                    $destPath = __DIR__ . '/../uploads/profile_pics/' . $newFileName;
                    if (save_uploaded_file_with_image_limit($_FILES['profile_pic'], $destPath, 50 * 1024) !== false) {
                        $profile_pic = 'uploads/profile_pics/' . $newFileName;
                    }
                }
            }

            $target_router_id = ($my_router_id > 0) ? $my_router_id : intval($_POST['router_id'] ?? 0);

            $discount = floatval($_POST['discount'] ?? 0);
            $due = isset($_POST['due']) ? floatval($_POST['due']) : 0;
            $bill_amt = $_POST['bill'];
            $ip_cost = isset($_POST['ip_cost']) ? floatval($_POST['ip_cost']) : 0;
            if ($_POST['status'] === 'Free' && $_POST['bill_position'] === 'Free') {
                $bill_amt = 0;
                $discount = 0;
                $ip_cost = 0;
            }
            $promise_enabled = isset($_POST['promise_enabled']) ? intval($_POST['promise_enabled']) : 0;
            $promise_date = !empty($_POST['promise_date']) ? get_calculated_promise_date($_POST['promise_date']) : null;
            
            $u_db = safeFetch($pdo, "SELECT current_bill_date FROM " . TBL_USERS . " WHERE id = ?", [$uid]);
            $status = $_POST['status'];
            $bill_pos = $_POST['bill_position'];
            if ($status === 'Promise Active') {
                $promise_enabled = 1;
                $bill_pos = 'Promise Active';
            } elseif ($promise_enabled == 1) {
                $status = 'Promise Active';
                $bill_pos = 'Promise Active';
            } else {
                if ($status === 'Promise Active') {
                    $status = 'Active';
                    $bill_pos = 'Active';
                    if ($u_db) {
                        $temp_u = [
                            'current_bill_date' => $u_db['current_bill_date'],
                            'promise_enabled' => 0,
                            'promise_date' => null
                        ];
                        if (is_client_expired($temp_u, $pdo)) {
                            $status = 'Expire';
                            $bill_pos = 'Expire';
                        }
                    }
                }
            }

            $client_code = !empty($_POST['client_code']) ? trim($_POST['client_code']) : null;
            $send_sms = isset($_POST['send_sms']) ? intval($_POST['send_sms']) : 1;
            $send_voice_call = isset($_POST['send_voice_call']) ? intval($_POST['send_voice_call']) : 1;
            $auto_recharge = isset($_POST['auto_recharge']) ? (int)($_POST['auto_recharge'] == '1') : 0;
            $auto_recharge_mode = (($_POST['auto_recharge_mode'] ?? '30_days') === 'custom') ? 'custom' : '30_days';
            $auto_recharge_days = $auto_recharge_mode === 'custom' ? max(1, min(3650, (int)($_POST['auto_recharge_days'] ?? 30))) : 30;
            $email = trim((string)($_POST['email'] ?? ''));
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $email = '';
            $allowed_btrc_connectivity = ['Shared', 'Dedicated'];
            $btrc_connectivity = in_array($_POST['btrc_connectivity'] ?? 'Shared', $allowed_btrc_connectivity, true) ? $_POST['btrc_connectivity'] : 'Shared';
            $allowed_btrc_ip_types = ['Shared', 'Private', 'Public', 'Static Public', 'Dynamic Public'];
            $btrc_ip_type = in_array($_POST['btrc_ip_type'] ?? 'Shared', $allowed_btrc_ip_types, true) ? $_POST['btrc_ip_type'] : 'Shared';

            $sql = "UPDATE " . TBL_USERS . " SET
                    name=:name, phone=:phone, phone2=:phone2, email=:email, nid=:nid, password=:password,
                    user_id=:user_id, client_code=:client_code, user_package=:user_package, bill_amount=:bill_amount,
                    discount=:discount, due=:due, status=:status, bill_position=:bill_position, router_id=:router_id,
                    zone_id=:zone_id, tj_box_name=:tj_box_name, connection_type=:connection_type, client_type=:client_type,
                    onu_mac=:onu_mac, assigned_ip=:assigned_ip, ip_cost=:ip_cost, lat_long=:lat_long, district=:district,
                    thana=:thana, address=:address, remarks=:remarks, profile_pic=:profile_pic, joining_date=:joining_date,
                    promise_enabled=:promise_enabled, promise_date=:promise_date, send_sms=:send_sms,
                    send_voice_call=:send_voice_call, auto_recharge=:auto_recharge, auto_recharge_mode=:auto_recharge_mode, auto_recharge_days=:auto_recharge_days, btrc_connectivity=:btrc_connectivity, btrc_ip_type=:btrc_ip_type,
                    btrc_house_no=:btrc_house_no, btrc_road_no=:btrc_road_no, btrc_area=:btrc_area,
                    btrc_distribution_location=:btrc_distribution_location
                    WHERE id=:id";

            $pdo->prepare($sql)->execute([
                ':name' => $_POST['name'],
                ':phone' => $_POST['phone'],
                ':phone2' => $_POST['phone2'],
                ':email' => $email,
                ':nid' => $_POST['nid'],
                ':password' => $effective_pppoe_password,
                ':user_id' => $new_user_id,
                ':client_code' => $client_code,
                ':user_package' => $_POST['pkg'],
                ':bill_amount' => $bill_amt,
                ':discount' => $discount,
                ':due' => $due,
                ':status' => $status,
                ':bill_position' => $bill_pos,
                ':router_id' => $target_router_id,
                ':zone_id' => $_POST['zone_id'],
                ':tj_box_name' => $_POST['tj_box_name'],
                ':connection_type' => $_POST['connection_type'],
                ':client_type' => $_POST['client_type'],
                ':onu_mac' => $_POST['onu_mac'],
                ':assigned_ip' => $_POST['assigned_ip'],
                ':ip_cost' => $ip_cost,
                ':lat_long' => $_POST['lat_long'],
                ':district' => $_POST['district'],
                ':thana' => $_POST['thana'],
                ':address' => $_POST['addr'],
                ':remarks' => $_POST['remarks'],
                ':profile_pic' => $profile_pic,
                ':joining_date' => $_POST['joining_date'],
                ':promise_enabled' => $promise_enabled,
                ':promise_date' => $promise_date,
                ':send_sms' => $send_sms,
                ':send_voice_call' => $send_voice_call,
                ':auto_recharge' => $auto_recharge,
                ':auto_recharge_mode' => $auto_recharge_mode,
                ':auto_recharge_days' => $auto_recharge_days,
                ':btrc_connectivity' => $btrc_connectivity,
                ':btrc_ip_type' => $btrc_ip_type,
                ':btrc_house_no' => trim((string)($_POST['btrc_house_no'] ?? '')),
                ':btrc_road_no' => trim((string)($_POST['btrc_road_no'] ?? '')),
                ':btrc_area' => trim((string)($_POST['btrc_area'] ?? '')),
                ':btrc_distribution_location' => trim((string)($_POST['btrc_distribution_location'] ?? '')),
                ':id' => $uid,
            ]);

            // Sync with Mikrotik
            $u_info = safeFetch($pdo, "SELECT * FROM " . TBL_USERS . " WHERE id=" . $uid);
            if ($u_info && $target_router_id) {
                $svc = safeFetch($pdo, "SELECT * FROM " . TBL_SERVICES . " WHERE name='" . $_POST['pkg'] . "'");
                $r = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id=" . intval($target_router_id));
                if ($r && $svc) {
                    $mk = new MikrotikApp($r);
                    if ($user_id_changed) {
                        // Rename the secret in Mikrotik first
                        $mk->renamePppoe($old_user_id, $new_user_id);
                    }
                    $status = trim($u_info['status']);
                    $is_active = (strcasecmp($status, 'Active') === 0 || strcasecmp($status, 'Free') === 0 || strcasecmp($status, 'Promise Active') === 0);
                    // Password is written only when the admin actually changed it.
                    $password_changed = ($effective_pppoe_password !== (string)($existing['password'] ?? ''));
                    if ($password_changed && $effective_pppoe_password !== '') {
                        $mk->setPppoePassword($u_info['user_id'], $effective_pppoe_password, true, $svc['mikrotik_profile_name'], $is_active);
                    }
                    // Routine profile/status sync never writes an existing secret password.
                    $mk->toggle($u_info['user_id'], $is_active, $svc['mikrotik_profile_name'], $u_info['password']);
                }
            }
            writeLog($pdo, $_SESSION['admin_username'], 'Edit Client Full', $uid, "Updated full details for client " . $_POST['name']);
            $msg = "Profile Updated Successfully";
        }
    }

    if (isset($_POST['save_client_router_details'])) {
        $uid = intval($_POST['uid']);
        $existing_router_details = safeFetch($pdo, "SELECT router_password,cpe_management_ip,cpe_access_method,cpe_api_port,cpe_api_ssl FROM " . TBL_USERS . " WHERE id=?", [$uid]);
        if (!$existing_router_details) {
            $error = "Client not found.";
        } else {
            $r_model = trim((string)($_POST['router_model'] ?? ''));
            if($r_model === 'N/A' || $r_model === '') $r_model = null;
            
            $r_port = trim((string)($_POST['router_port'] ?? ''));
            if($r_port === 'N/A' || $r_port === '') $r_port = null;
            
            $r_user = trim((string)($_POST['router_username'] ?? ''));
            if($r_user === 'N/A' || $r_user === '') $r_user = null;
            
            // Blank management password means "keep existing" so an accidental empty form
            // submission cannot destroy the CPE login needed by Credential Rescue.
            $submitted_r_pass = (string)($_POST['router_password'] ?? '');
            $r_pass = ($submitted_r_pass === '' || $submitted_r_pass === 'N/A')
                ? (string)($existing_router_details['router_password'] ?? '')
                : $submitted_r_pass;
            if ($r_pass === '') $r_pass = null;

            $cpe_management_ip = trim((string)($_POST['cpe_management_ip'] ?? ''));
            if ($cpe_management_ip === 'N/A') $cpe_management_ip = '';
            $cpe_method = trim((string)($_POST['cpe_access_method'] ?? 'Manual'));
            if (!in_array($cpe_method, ['Manual','RouterOS API','ACS'], true)) $cpe_method = 'Manual';
            $cpe_api_port = max(1, min(65535, (int)($_POST['cpe_api_port'] ?? 8728)));
            $cpe_api_ssl = !empty($_POST['cpe_api_ssl']) ? 1 : 0;
            
            $pdo->prepare("UPDATE " . TBL_USERS . " SET router_model=?, router_port=?, router_username=?, router_password=?, cpe_management_ip=?, cpe_access_method=?, cpe_api_port=?, cpe_api_ssl=? WHERE id=?")->execute([
                $r_model, $r_port, $r_user, $r_pass, ($cpe_management_ip !== '' ? $cpe_management_ip : null), $cpe_method, $cpe_api_port, $cpe_api_ssl, $uid
            ]);
            writeLog($pdo, $_SESSION['admin_username'], 'Router Remote Details', $uid, "Updated client CPE management/remote access details. Password value was not logged.");
            $msg = "Router Details Saved Successfully";
        }
    }

    if (isset($_POST['quick_edit_pppoe'])) {
        $uid = intval($_POST['uid']);
        $new_user_id = trim($_POST['new_user_id']);
        $new_password = $_POST['new_password'];
        
        $u_info = safeFetch($pdo, "SELECT * FROM " . TBL_USERS . " WHERE id=?", [$uid]);
        if ($u_info) {
            if ((string)$new_password === '') $new_password = (string)($u_info['password'] ?? '');
            $old_user_id = $u_info['user_id'];
            $user_id_changed = ($old_user_id !== $new_user_id);
            
            $exists = false;
            if ($user_id_changed && !empty($new_user_id)) {
                $exists = safeFetch($pdo, "SELECT id FROM " . TBL_USERS . " WHERE user_id=? AND id!=?", [$new_user_id, $uid]);
            }
            
            if ($exists) {
                $error = "The PPPoE ID '{$new_user_id}' is already taken by another client.";
            } elseif (empty($new_user_id)) {
                $error = "PPPoE ID cannot be empty.";
            } else {
                $pdo->prepare("UPDATE " . TBL_USERS . " SET user_id=?, password=? WHERE id=?")->execute([
                    $new_user_id, $new_password, $uid
                ]);
                
                // Sync with Mikrotik
                $target_router_id = $u_info['router_id'];
                if ($target_router_id) {
                    $svc = safeFetch($pdo, "SELECT * FROM " . TBL_SERVICES . " WHERE name=?", [$u_info['user_package']]);
                    $r = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id=?", [$target_router_id]);
                    if ($r && $svc) {
                        $mk = new MikrotikApp($r);
                        if ($user_id_changed) {
                            $mk->renamePppoe($old_user_id, $new_user_id);
                        }
                        $status = trim($u_info['status']);
                        $is_active = (strcasecmp($status, 'Active') === 0 || strcasecmp($status, 'Free') === 0 || strcasecmp($status, 'Promise Active') === 0);
                        // Quick Edit PPPoE is an explicit credential change.
                        if ((string)$new_password !== (string)($u_info['password'] ?? '') && (string)$new_password !== '') {
                            $mk->setPppoePassword($new_user_id, (string)$new_password, true, $svc['mikrotik_profile_name'], $is_active);
                        }
                        $mk->toggle($new_user_id, $is_active, $svc['mikrotik_profile_name'], $new_password);
                    }
                }
                
                writeLog($pdo, $_SESSION['admin_username'], 'Quick Edit PPPoE', $uid, "Updated PPPoE credentials. ID: $new_user_id");
                $msg = "PPPoE ID & Password updated successfully!";
            }
        }
    }

    if (isset($_POST['quick_change_package'])) {
        $uid = intval($_POST['uid']);
        $new_pkg = $_POST['pkg'];
        $new_bill = floatval($_POST['bill']);
        $new_due = floatval($_POST['due']);
        
        $u_info = safeFetch($pdo, "SELECT * FROM " . TBL_USERS . " WHERE id=?", [$uid]);
        if ($u_info) {
            if ($u_info['status'] === 'Free' && $u_info['bill_position'] === 'Free') {
                $new_bill = 0;
            }
            $pdo->prepare("UPDATE " . TBL_USERS . " SET user_package=?, bill_amount=?, due=? WHERE id=?")->execute([
                $new_pkg, $new_bill, $new_due, $uid
            ]);
            
            // Sync with Mikrotik
            $svc = safeFetch($pdo, "SELECT * FROM " . TBL_SERVICES . " WHERE name=?", [$new_pkg]);
            if ($u_info['router_id'] > 0 && $svc) {
                $r = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id=?", [$u_info['router_id']]);
                if ($r) {
                    $mk = new MikrotikApp($r);
                    $status = trim($u_info['status']);
                    $is_active = (strcasecmp($status, 'Active') === 0 || strcasecmp($status, 'Free') === 0);
                    $mk->toggle($u_info['user_id'], $is_active, $svc['mikrotik_profile_name'], $u_info['password']);
                }
            }
            writeLog($pdo, $_SESSION['admin_username'], 'Quick Change Package', $uid, "Changed package for client " . $u_info['name'] . " to $new_pkg. New base bill: $new_bill, New Due: $new_due");
            $msg = "Package Updated Successfully";
        } else {
            $error = "Client not found";
        }
    }

   if ((isset($_POST['extend_service']) || (isset($_POST['action']) && $_POST['action'] === 'extend_service')) && hasRole('SubReseller')) {
       $uid = $_POST['id'];
       $days = (int)$_POST['extension_days'];
       if($days < 1 || $days > 10) { $error = "Invalid days (1-10)"; }
       else {
           $reseller = safeFetch($pdo, "SELECT balance, advance_balance_limit FROM ".TBL_STAFF." WHERE id=?", [$user]);
           $available_balance = ($reseller['balance'] ?? 0) + ($reseller['advance_balance_limit'] ?? 0);
           
           if ($available_balance <= 0) {
               $error = "Insufficient Wallet Balance / Advance Limit to provide credit.";
           } else {
               $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=".intval($uid));
           if($u) {
                if ($u['credit_taken']) { $error = L('CREDIT_LIMIT'); } else {
                    $new_bill_date = (new DateTime($u['current_bill_date']))->modify("+{$days} days")->format('Y-m-d');
                    $pdo->prepare("UPDATE ".TBL_USERS." SET current_bill_date=?, status='Active', bill_position='Active', credit_taken=1, credit_days=? WHERE id=?")->execute([$new_bill_date, $days, $uid]);
                    if($u['router_id']) {
                        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id={$u['router_id']}");
                        if($r) {
                            try {
                                $mk = new MikrotikApp($r);
                                $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name='{$u['user_package']}'");
                                if($svc) $mk->toggle($u['user_id'], true, $svc['mikrotik_profile_name'], $u['password']);
                            } catch (\Exception $e) {
                                writeLog($pdo, $_SESSION['admin_username'], 'Router Error', $uid, "Mikrotik error during Extend: " . $e->getMessage());
                            }
                        }
                    }
                    $wallet_owner_id = deductWallet($pdo, $user, 0); // Resolve owner without deducting
                    log_tx($pdo, $wallet_owner_id, 'Transfer', 0.00, "Credit Extended: {$u['user_id']} ($days days)", 'System', $user);
                    
                    // --- LOAN SMS ---
                    $loan_tpl = get_sms_setting($pdo, $user, 'sms_tpl_loan');
                    if (!$loan_tpl) $loan_tpl = "Dear [NAME], [DAYS] days credit added to ID [ID].";
                    $msg_to_send = str_replace(['[NAME]', '[ID]', '[DAYS]'], [$u['name'], $u['user_id'], $days], $loan_tpl);
                    if (get_sms_setting($pdo, $user, 'sms_enabled_loan') == '1') {
                        sendSMS($pdo, $u['phone'], $msg_to_send, $user);
                    }

                    writeLog($pdo, $_SESSION['admin_username'], 'Extend Service', $uid, "Extended service for {$u['user_id']} by $days days | Credit Date: " . date('d M Y'));
                    $msg = L('CREDIT_GIVEN');
                }
           }
           }
       }
   }

    if ((isset($_POST['toggle_service']) || (isset($_POST['action']) && $_POST['action'] === 'toggle_service')) && hasRole('SubReseller')) {
       $uid = $_POST['id']; $cur = $_POST['current_status'];
       $new = ($cur == 'Active' || $cur == 'Expire' || $cur == 'Free') ? 'Inactive' : 'Active';
       $pos = ($new == 'Active') ? 'Active' : (($cur == 'Expire') ? 'Expire' : 'Inactive');
       if ($new === 'Inactive') { pause_client_days($pdo, $uid); }
       $pdo->prepare("UPDATE ".TBL_USERS." SET status=?, bill_position=? WHERE id=?")->execute([$new, $pos, $uid]);
       if ($new === 'Active') { resume_client_days($pdo, $uid); }
       $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=".intval($uid));
       if($u && $u['router_id']) {
           $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id={$u['router_id']}");
           if($r) {
               try {
                   $mk = new MikrotikApp($r);
                   $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name='{$u['user_package']}'");
                   $enable = ($new == 'Active');
                   if($svc) $mk->toggle($u['user_id'], $enable, $svc['mikrotik_profile_name'], $u['password']);
               } catch (\Exception $e) {
                   writeLog($pdo, $_SESSION['admin_username'], 'Router Error', $uid, "Mikrotik error during Toggle: " . $e->getMessage());
               }
           }
       }
       writeLog($pdo, $_SESSION['admin_username'], 'Toggle Status', $uid, "Changed status of {$u['user_id']} to $new");
       $msg = "Status changed to $new";
   }

    if (isset($_POST['action']) && $_POST['action'] === 'set_promise_date' && hasRole('SubReseller')) {
        $uid = intval($_POST['uid']);
        $promise_enabled = isset($_POST['promise_enabled']) ? intval($_POST['promise_enabled']) : 0;
        $promise_date = !empty($_POST['promise_date']) ? get_calculated_promise_date($_POST['promise_date']) : null;

        $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$uid]);
        if ($u) {
            if ($promise_enabled == 1 && empty($promise_date)) {
                $error = "Please select a valid Promise Date.";
            } else {
                $today = date('Y-m-d');
                if ($promise_enabled == 1) {
                    if ($promise_date < $today) {
                        $error = "Promise Date cannot be in the past.";
                    } else {
                        // Enable promise, update status to "Promise Active"
                        $pdo->prepare("UPDATE ".TBL_USERS." SET promise_enabled=1, promise_date=?, status='Promise Active', bill_position='Promise Active' WHERE id=?")
                            ->execute([$promise_date, $uid]);

                        // Ensure they are active on MikroTik
                        if ($u['router_id'] > 0) {
                            $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
                            if ($r) {
                                $mk = new MikrotikApp($r);
                                $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
                                $profile = $svc ? $svc['mikrotik_profile_name'] : '';
                                $mk->toggle($u['user_id'], true, $profile, $u['password'] ?? '');
                            }
                        }

                        writeLog($pdo, $_SESSION['admin_username'], 'Promise Enabled', $uid, "Promise Date enabled until $promise_date for client {$u['user_id']}");
                        $msg = "Promise Date enabled successfully until $promise_date.";
                    }
                } else {
                    // Disable promise
                    // Re-calculate correct status based on expiry
                    $status = 'Active';
                    $bill_position = 'Active';
                    
                    $temp_u = $u;
                    $temp_u['promise_enabled'] = 0;
                    $temp_u['promise_date'] = null;
                    $is_expired = is_client_expired($temp_u, $pdo);

                    if ($is_expired) {
                        $status = 'Expire';
                        $bill_position = 'Expire';
                    }

                    $pdo->prepare("UPDATE ".TBL_USERS." SET promise_enabled=0, promise_date=NULL, status=?, bill_position=? WHERE id=?")
                        ->execute([$status, $bill_position, $uid]);

                    // Toggle on MikroTik based on status
                    if ($u['router_id'] > 0) {
                        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
                        if ($r) {
                            $mk = new MikrotikApp($r);
                            $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
                            $profile = $svc ? $svc['mikrotik_profile_name'] : '';
                            $mk->toggle($u['user_id'], !$is_expired, $profile, $u['password'] ?? '');
                        }
                    }

                    writeLog($pdo, $_SESSION['admin_username'], 'Promise Disabled', $uid, "Promise Date disabled for client {$u['user_id']}");
                    $msg = "Promise Date disabled successfully.";
                }
            }
        } else {
            $error = "Client not found.";
        }
        header("Location: ?view_id=$uid");
        exit;
    }
   
    if (isset($_GET['action']) && $_GET['action'] == 'delete_service' && (hasRole('Admin') || isOffice())) {
        $pdo->prepare("DELETE FROM ".TBL_SERVICES." WHERE id=?")->execute([$_GET['id']]);
        writeLog($pdo, $_SESSION['admin_username'], 'Delete Service', $_GET['id'], "Deleted package ID {$_GET['id']}");
        $msg = "Service package deleted.";
    }

   if (isset($_POST['add_router']) && hasRole('Admin')) {
       ensure_router_secret_storage($pdo);
       $router_port = max(1, min(65535, (int)($_POST['port'] ?? 8728)));
       $pdo->prepare("INSERT INTO ".TBL_ROUTERS." (name, ip_address, username, api_password, port) VALUES (?,?,?,?,?)")->execute([$_POST['name'], $_POST['ip'], $_POST['user'], encrypt_router_secret($_POST['pass'] ?? ''), encrypt_router_secret((string)$router_port)]);
       $router_id = $pdo->lastInsertId();
       
       // --- AUTO MATCH INTENDED ROUTER USERS ---
       $matching_users = safeFetchAll($pdo, "SELECT * FROM ".TBL_USERS." WHERE intended_router_name = ?", [$_POST['name']]);
       foreach ($matching_users as $mu) {
            $pdo->prepare("UPDATE ".TBL_USERS." SET router_id = ?, intended_router_name = NULL WHERE id = ?")->execute([$router_id, $mu['id']]);
            // Trigger sync to Mikrotik
            $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name LIKE ?", [$mu['user_package']]);
            if ($svc) {
                 $router_obj = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$router_id]);
                 $mk = new MikrotikApp($router_obj);
                 $enable = ($mu['status'] === 'Active' || $mu['status'] === 'Free' || $mu['status'] === 'Promise Active');
                 $mk->toggle($mu['user_id'], $enable, $svc['mikrotik_profile_name'], $mu['password']);
            }
       }
       
       writeLog($pdo, $_SESSION['admin_username'], 'Add Router', $router_id, "Added router {$_POST['name']} and matched " . count($matching_users) . " clients.");
   }
   if (isset($_POST['add_service'])) {
        // Migration: Check for vat_percent and router_id
        try {
            $cols = $pdo->query("DESCRIBE ".TBL_SERVICES)->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('router_id', $cols)) $pdo->exec("ALTER TABLE ".TBL_SERVICES." ADD COLUMN router_id INT DEFAULT 0");
            if (!in_array('vat_percent', $cols)) $pdo->exec("ALTER TABLE ".TBL_SERVICES." ADD COLUMN vat_percent DECIMAL(5,2) DEFAULT 0");
            if (!in_array('btrc_bandwidth_mbps', $cols)) $pdo->exec("ALTER TABLE ".TBL_SERVICES." ADD COLUMN btrc_bandwidth_mbps DECIMAL(10,2) DEFAULT 0");
        } catch(Exception $e) {}

        $vat = floatval($_POST['vat_percent'] ?? 0);
        $router_id = intval($_POST['router_id'] ?? 0);
        $btrc_bandwidth = max(0, floatval($_POST['btrc_bandwidth_mbps'] ?? 0));
        $pdo->prepare("INSERT INTO ".TBL_SERVICES." (name, price, buying_price, mikrotik_profile_name, rate_limit_profile, router_id, vat_percent, btrc_bandwidth_mbps) VALUES (?,?,?,?,?,?,?,?)")->execute([$_POST['name'], $_POST['price'], $_POST['buying_price'], $_POST['profile'], $_POST['rate'], $router_id, $vat, $btrc_bandwidth]);
       writeLog($pdo, $_SESSION['admin_username'], 'Add Service', 0, "Added package {$_POST['name']}");
   }
   if (isset($_POST['edit_service'])) {
         // Migration: Check for vat_percent and router_id (ensure logic exists even for edits)
         try {
            $cols = $pdo->query("DESCRIBE ".TBL_SERVICES)->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('router_id', $cols)) $pdo->exec("ALTER TABLE ".TBL_SERVICES." ADD COLUMN router_id INT DEFAULT 0");
            if (!in_array('vat_percent', $cols)) $pdo->exec("ALTER TABLE ".TBL_SERVICES." ADD COLUMN vat_percent DECIMAL(5,2) DEFAULT 0");
            if (!in_array('btrc_bandwidth_mbps', $cols)) $pdo->exec("ALTER TABLE ".TBL_SERVICES." ADD COLUMN btrc_bandwidth_mbps DECIMAL(10,2) DEFAULT 0");
        } catch(Exception $e) {}

        $vat = floatval($_POST['vat_percent'] ?? 0);
        $router_id = intval($_POST['router_id'] ?? 0);
        $btrc_bandwidth = max(0, floatval($_POST['btrc_bandwidth_mbps'] ?? 0));
        
        // Fetch old package details
        $old_pkg = safeFetch($pdo, "SELECT name FROM ".TBL_SERVICES." WHERE id=?", [$_POST['id']]);

        $pdo->prepare("UPDATE ".TBL_SERVICES." SET name=?, price=?, buying_price=?, mikrotik_profile_name=?, rate_limit_profile=?, router_id=?, vat_percent=?, btrc_bandwidth_mbps=? WHERE id=?")
            ->execute([$_POST['name'], $_POST['price'], $_POST['buying_price'], $_POST['profile'], $_POST['rate'], $router_id, $vat, $btrc_bandwidth, $_POST['id']]);
            
        // Automatically update all clients using the old package name to the new one
        if ($old_pkg && $old_pkg['name'] !== $_POST['name']) {
            $pdo->prepare("UPDATE ".TBL_USERS." SET user_package=? WHERE user_package=?")->execute([$_POST['name'], $old_pkg['name']]);
        }

       writeLog($pdo, $_SESSION['admin_username'], 'Edit Service', $_POST['id'], "Updated package {$_POST['name']}");
       $msg = "Service updated.";
   }

    if (isset($_POST['sync_mikrotik_clients']) && (hasRole('Admin') || isOffice())) {
        $pkg_id = intval($_POST['pkg_id']);
        $router_id = intval($_POST['router_id']);
        $reseller_id = intval($_POST['reseller_id']);
        $profile_name = $_POST['profile_name'];
        $auto_active = isset($_POST['auto_active']) ? 'Active' : 'Inactive';
        
        $pkg = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE id=?", [$pkg_id]);
        $router = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$router_id]);
        
        if ($pkg && $router) {
            $mk = new MikrotikApp($router);
            $secrets = $mk->getSecrets();
            $imported = 0;
            $skipped = 0;
            
            // Set initial bill to package price if package matches, otherwise 0
            $bill_amount = ($pkg && isset($pkg['price'])) ? floatval($pkg['price']) : 0; 
            $today = date('Y-m-d');
            $next_bill = $today; // Set credit to 0 days
            
            foreach ($secrets as $s) {
                if (isset($s['profile']) && $s['profile'] === $profile_name) {
                    $u_id = $s['name'];
                    // Check if already exists
                    $exists = safeFetch($pdo, "SELECT id FROM ".TBL_USERS." WHERE user_id=?", [$u_id]);
                    if (!$exists) {
                        $sql = "INSERT INTO ".TBL_USERS." (joining_date, name, phone, user_id, password, user_package, bill_amount, router_id, manager_id, current_bill_date, status, bill_position, connection_type, client_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
                        $pdo->prepare($sql)->execute([
                            $today, $u_id, '', $u_id, $s['password'] ?? '', $pkg['name'], $bill_amount, $router_id, $reseller_id, $next_bill, $auto_active, 'Active', 'Fiber', 'Home'
                        ]);
                        $imported++;
                    } else {
                        $skipped++;
                    }
                }
            }
            writeLog($pdo, $_SESSION['admin_username'], 'Sync Mikrotik Clients', $pkg_id, "Imported $imported clients from MikroTik for package {$pkg['name']}. Router ID: $router_id. Skipped: $skipped.");
            $msg = "Success: Imported $imported clients. Skipped $skipped (already exist).";
        } else {
            $error = "Invalid Package or Router selected.";
        }
    }
   if (isset($_POST['add_agent']) && (hasRole('Admin') || isOffice())) {
       $pdo->prepare("INSERT INTO ".TBL_AGENTS." (name, phone, email, address, bank_name, account_name, account_no, branch_name, routing_no) VALUES (?,?,?,?,?,?,?,?,?)")
           ->execute([
               $_POST['name'], $_POST['phone'], $_POST['email'], $_POST['address'],
               $_POST['bank_name'], $_POST['account_name'], $_POST['account_no'], $_POST['branch_name'], $_POST['routing_no']
           ]);
       writeLog($pdo, $_SESSION['admin_username'], 'Add Agent', 0, "Added agent {$_POST['name']}");
       $msg = "Agent Added";
   }
   
   if (isset($_POST['edit_agent']) && (hasRole('Admin') || isOffice())) {
       $pdo->prepare("UPDATE ".TBL_AGENTS." SET name=?, phone=?, email=?, address=?, bank_name=?, account_name=?, account_no=?, branch_name=?, routing_no=? WHERE id=?")
           ->execute([
               $_POST['name'], $_POST['phone'], $_POST['email'], $_POST['address'],
               $_POST['bank_name'], $_POST['account_name'], $_POST['account_no'], $_POST['branch_name'], $_POST['routing_no'],
               $_POST['agent_id']
           ]);
       writeLog($pdo, $_SESSION['admin_username'], 'Edit Agent', $_POST['agent_id'], "Updated agent {$_POST['name']}");
       $msg = "Agent updated successfully.";
   }

   if (isset($_POST['edit_router']) && hasRole('Admin')) {
       ensure_router_secret_storage($pdo);
       $router_port = max(1, min(65535, (int)($_POST['port'] ?? 8728)));
       $pdo->prepare("UPDATE ".TBL_ROUTERS." SET name=?, ip_address=?, username=?, api_password=?, port=? WHERE id=?")
           ->execute([
               $_POST['name'], $_POST['ip'], $_POST['user'], encrypt_router_secret($_POST['pass'] ?? ''), encrypt_router_secret((string)$router_port), $_POST['router_id']
           ]);
       
       // --- AUTO MATCH INTENDED ROUTER USERS ALSO ON EDIT ---
       $matching_users = safeFetchAll($pdo, "SELECT * FROM ".TBL_USERS." WHERE intended_router_name = ?", [$_POST['name']]);
       foreach ($matching_users as $mu) {
            $pdo->prepare("UPDATE ".TBL_USERS." SET router_id = ?, intended_router_name = NULL WHERE id = ?")->execute([$_POST['router_id'], $mu['id']]);
            // Sync
            $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name LIKE ?", [$mu['user_package']]);
            if ($svc) {
                 $router_obj = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$_POST['router_id']]);
                 $mk = new MikrotikApp($router_obj);
                 $enable = ($mu['status'] === 'Active' || $mu['status'] === 'Free' || $mu['status'] === 'Promise Active');
                 $mk->toggle($mu['user_id'], $enable, $svc['mikrotik_profile_name'], $mu['password']);
            }
       }
       
       writeLog($pdo, $_SESSION['admin_username'], 'Edit Router', $_POST['router_id'], "Updated router {$_POST['name']} and matched " . count($matching_users) . " clients.");
       $msg = "Router updated successfully.";
   }

   if (isset($_POST['delete_router']) && hasRole('Admin')) {
       $deleteRouterId = (int)($_POST['router_id'] ?? 0);
       $pdo->prepare("DELETE FROM ".TBL_ROUTERS." WHERE id=?")->execute([$deleteRouterId]);
       writeLog($pdo, $_SESSION['admin_username'], 'Delete Router', $deleteRouterId, "Deleted router {$deleteRouterId}");
       $msg = "Router deleted successfully.";
   }

    if (isset($_POST['update_reseller_invoice']) && hasRole('Reseller')) {
        try {
            $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN invoice_config TEXT DEFAULT NULL");
        } catch (\Exception $e) {}

        $config = [
            'name' => trim($_POST['invoice_company_name'] ?? ''),
            'phone' => trim($_POST['invoice_company_phone'] ?? ''),
            'address' => trim($_POST['invoice_company_address'] ?? ''),
            'email' => trim($_POST['invoice_company_email'] ?? '')
        ];

        $pdo->prepare("UPDATE ".TBL_STAFF." SET invoice_config = ? WHERE id = ?")
            ->execute([json_encode($config), $_SESSION['admin_id']]);

        writeLog($pdo, $_SESSION['admin_username'], 'Update Reseller Invoice Branding', $_SESSION['admin_id'], "Updated invoice branding settings.");
        $msg = "Invoice branding updated successfully.";
    }

    // bKash Connection Testing Handler
    if (hasRole('Admin') && (isset($_POST['test_bkash_token']) || isset($_POST['test_bkash_create']))) {
        require_once __DIR__ . '/../classes/BKashGateway.php';
        
        $is_sandbox = isset($_POST['bkash_sandbox']) ? true : false;
        if ($is_sandbox) {
            $bk_key = $_POST['bkash_sandbox_app_key'] ?? '';
            $bk_secret = $_POST['bkash_sandbox_app_secret'] ?? '';
            $bk_user = $_POST['bkash_sandbox_username'] ?? '';
            $bk_pass = $_POST['bkash_sandbox_password'] ?? '';
        } else {
            $bk_key = $_POST['bkash_app_key'] ?? '';
            $bk_secret = $_POST['bkash_app_secret'] ?? '';
            $bk_user = $_POST['bkash_username'] ?? '';
            $bk_pass = $_POST['bkash_password'] ?? '';
        }
        
        $env_name = $is_sandbox ? 'Sandbox' : 'Production';
        $base_url = $is_sandbox ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta' : 'https://tokenized.pay.bka.sh/v1.2.0-beta';
        
        $test_logs = "Environment: $env_name\nBase URL: $base_url\nApp Key: " . (empty($bk_key) ? 'EMPTY' : substr($bk_key, 0, 4) . "..." . substr($bk_key, -4)) . "\nUsername: " . (empty($bk_user) ? 'EMPTY' : substr($bk_user, 0, 4) . "...") . "\n\n";
        
        if (empty($bk_key) || empty($bk_secret) || empty($bk_user) || empty($bk_pass)) {
            $test_logs .= "Error: App Key, App Secret, Username, or Password cannot be empty for the selected environment.";
            $_SESSION['bkash_test_result'] = $test_logs;
            header("Location: index.php?tab=settings"); exit;
        }
        
        $bkash = new BKashGateway($bk_key, $bk_secret, $bk_user, $bk_pass, $is_sandbox);
        
        $test_logs .= "--- STEP 1: Grant Token ---\n";
        $tokenResp = $bkash->grantToken();
        
        // Safe logging of token response (mask the actual id_token)
        $token_log = $tokenResp;
        if (isset($token_log['id_token'])) {
            $token_log['id_token'] = substr($token_log['id_token'], 0, 8) . "..." . substr($token_log['id_token'], -8);
        }
        if (isset($token_log['refresh_token'])) {
            $token_log['refresh_token'] = 'MASKED';
        }
        $test_logs .= "Token Response: " . json_encode($token_log, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n\n";
        
        if (isset($_POST['test_bkash_create'])) {
            if (isset($tokenResp['id_token'])) {
                $test_logs .= "--- STEP 2: Create Mock Payment (10 BDT) ---\n";
                $mock_trx = "TEST_" . strtoupper(uniqid());
                $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
                $baseUrl = $protocol . $_SERVER['HTTP_HOST'] . $_SERVER['PHP_SELF'];
                $separator = (strpos($baseUrl, '?') === false) ? '?' : '&';
                $mock_callback = $baseUrl . $separator . "bkash_callback=1&trxID=$mock_trx";
                
                $createResp = $bkash->createPayment($tokenResp['id_token'], 10, $mock_trx, $mock_callback);
                
                $test_logs .= "Create Payment Response: " . json_encode($createResp, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            } else {
                $test_logs .= "Skipped Step 2: Token grant failed, cannot initiate payment.";
            }
        }
        
        $_SESSION['bkash_test_result'] = $test_logs;
        header("Location: index.php?tab=settings"); exit;
    }
    
    if (hasRole('Admin') && isset($_POST['clear_bkash_test'])) {
        unset($_SESSION['bkash_test_result']);
        header("Location: index.php?tab=settings"); exit;
    }

   if (isset($_POST['save_ui_theme']) && isLoggedIn()) {
       $selected_theme = strtolower(trim((string)($_POST['ui_theme'] ?? 'modern')));
       if (!in_array($selected_theme, ['modern', 'colorful', 'midnight', 'royal', 'ai', 'ai-colorful', 'event-blue'], true)) {
           $selected_theme = 'modern';
       }
       try {
           $pdo->prepare("UPDATE ".TBL_STAFF." SET ui_theme=? WHERE id=?")->execute([$selected_theme, (int)$_SESSION['admin_id']]);
           $_SESSION['ui_theme'] = $selected_theme;
           $theme_labels = ['modern' => 'Current Modern', 'colorful' => 'Old Colorful', 'midnight' => 'Midnight Dark', 'royal' => 'Royal Purple', 'ai' => 'AI Dashboard', 'ai-colorful' => 'AI Colorful', 'event-blue' => 'Event Blue'];
           $_SESSION['flash_msg'] = ($theme_labels[$selected_theme] ?? 'Current Modern') . ' Theme activated.';
       } catch (Throwable $e) {
           error_log('Theme preference save failed: ' . $e->getMessage());
           $_SESSION['flash_error'] = 'Could not save theme preference.';
       }
       header("Location: ?tab=settings&settings_section=appearance#v-pills-appearance");
       exit;
   }

   if (isset($_POST['update_settings'])) {
       if ((hasRole('Admin') || (isOffice() && hasPermission('settings'))) && isset($_POST['company_name'])) {
           set_opt($pdo, 'company_name', $_POST['company_name']);
            if (isset($_POST['recharge_discount_enabled'])) {
                set_opt($pdo, 'recharge_discount_enabled', $_POST['recharge_discount_enabled'] === '1' ? '1' : '0');
            }
            if (isset($_POST['undo_recharge_deduct_hours'])) {
                set_opt($pdo, 'undo_recharge_deduct_hours', $_POST['undo_recharge_deduct_hours']);
            }
            if (isset($_POST['admin_expire_time'])) {
                set_opt($pdo, 'admin_expire_time', $_POST['admin_expire_time']);
            }
            if (isset($_POST['company_address'])) {
                set_opt($pdo, 'company_address', $_POST['company_address']);
            }
            if (isset($_POST['company_phone'])) {
                set_opt($pdo, 'company_phone', $_POST['company_phone']);
            }
            if (isset($_POST['company_email'])) {
                set_opt($pdo, 'company_email', $_POST['company_email']);
            }
            if (isset($_POST['btrc_report_enabled'])) {
                set_opt($pdo, 'btrc_report_enabled', $_POST['btrc_report_enabled'] === '1' ? '1' : '0');
            }
            if (isset($_POST['btrc_operator_name'])) {
                set_opt($pdo, 'btrc_operator_name', trim($_POST['btrc_operator_name']));
            }
            if (isset($_POST['show_reseller_profile_speed'])) {
                set_opt($pdo, 'show_reseller_profile_speed', $_POST['show_reseller_profile_speed']);
            }
            if (isset($_POST['client_name'])) {
                set_opt($pdo, 'client_name', trim($_POST['client_name']));
            }
            if (isset($_POST['client_date_of_birth'])) {
                set_opt($pdo, 'client_date_of_birth', trim($_POST['client_date_of_birth']));
            }
            if (isset($_POST['payment_tutorial_video'])) {
                set_opt($pdo, 'payment_tutorial_video', trim($_POST['payment_tutorial_video']));
            }
       }
         
        if(isset($_POST['piprapay_url']) || isset($_POST['bkash_app_key']) || isset($_POST['sslcz_store_id'])) { // Assume payment form
            if (hasRole('Admin')) {
                set_opt($pdo, 'piprapay_api_key', $_POST['piprapay_api_key'] ?? '');
                set_opt($pdo, 'piprapay_url', $_POST['piprapay_url'] ?? '');
                set_opt($pdo, 'bkash_app_key', $_POST['bkash_app_key'] ?? '');
                set_opt($pdo, 'bkash_app_secret', $_POST['bkash_app_secret'] ?? '');
                set_opt($pdo, 'bkash_username', $_POST['bkash_username'] ?? '');
                set_opt($pdo, 'bkash_password', $_POST['bkash_password'] ?? '');
                set_opt($pdo, 'bkash_sandbox_app_key', $_POST['bkash_sandbox_app_key'] ?? '');
                set_opt($pdo, 'bkash_sandbox_app_secret', $_POST['bkash_sandbox_app_secret'] ?? '');
                set_opt($pdo, 'bkash_sandbox_username', $_POST['bkash_sandbox_username'] ?? '');
                set_opt($pdo, 'bkash_sandbox_password', $_POST['bkash_sandbox_password'] ?? '');
                set_opt($pdo, 'bkash_sandbox', isset($_POST['bkash_sandbox']) ? '1' : '0');
                set_opt($pdo, 'bkash_shop_enabled', isset($_POST['bkash_shop_enabled']) ? '1' : '0');
                set_opt($pdo, 'bkash_shop_base_url', $_POST['bkash_shop_base_url'] ?? '');

                // bKash Pay Bill (Biller/Aggregator Outbound Interface v1.4)
                set_opt($pdo, 'bkash_paybill_enabled', (isset($_POST['bkash_paybill_enabled']) && $_POST['bkash_paybill_enabled'] === '1') ? '1' : '0');
                set_opt($pdo, 'bkash_paybill_username', trim((string)($_POST['bkash_paybill_username'] ?? '')));
                $pb_mode = $_POST['bkash_paybill_amount_mode'] ?? 'due_or_monthly';
                if (!in_array($pb_mode, ['due_or_monthly', 'due_plus_monthly'], true)) $pb_mode = 'due_or_monthly';
                set_opt($pdo, 'bkash_paybill_amount_mode', $pb_mode);
                set_opt($pdo, 'bkash_paybill_allowed_ips', trim((string)($_POST['bkash_paybill_allowed_ips'] ?? '')));
                set_opt($pdo, 'bkash_paybill_strict_due_date', (isset($_POST['bkash_paybill_strict_due_date']) && $_POST['bkash_paybill_strict_due_date'] === '1') ? '1' : '0');
                if (!empty($_POST['bkash_paybill_password'])) {
                    set_opt($pdo, 'bkash_paybill_password_hash', password_hash((string)$_POST['bkash_paybill_password'], PASSWORD_DEFAULT));
                    // Remove any old plaintext credential if it existed in an earlier/manual deployment.
                    set_opt($pdo, 'bkash_paybill_password', '');
                }
                if (!empty($_POST['bkash_paybill_keyvalue'])) {
                    set_opt($pdo, 'bkash_paybill_key_hash', password_hash((string)$_POST['bkash_paybill_keyvalue'], PASSWORD_DEFAULT));
                }
                
                // Nagad Settings
                set_opt($pdo, 'nagad_merchant_id', $_POST['nagad_merchant_id'] ?? '');
                set_opt($pdo, 'nagad_merchant_phone', $_POST['nagad_merchant_phone'] ?? '');
                set_opt($pdo, 'nagad_public_key', $_POST['nagad_public_key'] ?? '');
                set_opt($pdo, 'nagad_private_key', $_POST['nagad_private_key'] ?? '');
                set_opt($pdo, 'nagad_sandbox', isset($_POST['nagad_sandbox']) ? '1' : '0');
                
                // SSLCOMMERZ Settings
                set_opt($pdo, 'sslcz_store_id', $_POST['sslcz_store_id'] ?? '');
                set_opt($pdo, 'sslcz_store_passwd', $_POST['sslcz_store_passwd'] ?? '');
                set_opt($pdo, 'sslcz_sandbox', isset($_POST['sslcz_sandbox']) ? '1' : '0');
                set_opt($pdo, 'sslcz_enabled', isset($_POST['sslcz_enabled']) ? '1' : '0');
            } else {
                $gw_data = [
                    'piprapay_url' => $_POST['piprapay_url'] ?? '',
                    'piprapay_api_key' => $_POST['piprapay_api_key'] ?? '',
                    'bkash_sandbox' => isset($_POST['bkash_sandbox']) ? '1' : '0',
                    'bkash_app_key' => $_POST['bkash_app_key'] ?? '',
                    'bkash_app_secret' => $_POST['bkash_app_secret'] ?? '',
                    'bkash_username' => $_POST['bkash_username'] ?? '',
                    'bkash_password' => $_POST['bkash_password'] ?? '',
                    'bkash_sandbox_app_key' => $_POST['bkash_sandbox_app_key'] ?? '',
                    'bkash_sandbox_app_secret' => $_POST['bkash_sandbox_app_secret'] ?? '',
                    'bkash_sandbox_username' => $_POST['bkash_sandbox_username'] ?? '',
                    'bkash_sandbox_password' => $_POST['bkash_sandbox_password'] ?? '',
                    'bkash_shop_enabled' => isset($_POST['bkash_shop_enabled']) ? '1' : '0',
                    'bkash_shop_base_url' => $_POST['bkash_shop_base_url'] ?? '',
                    'nagad_sandbox' => isset($_POST['nagad_sandbox']) ? '1' : '0',
                    'nagad_merchant_id' => $_POST['nagad_merchant_id'] ?? '',
                    'nagad_merchant_phone' => $_POST['nagad_merchant_phone'] ?? '',
                    'nagad_public_key' => $_POST['nagad_public_key'] ?? '',
                    'nagad_private_key' => $_POST['nagad_private_key'] ?? '',
                    'sslcz_store_id' => $_POST['sslcz_store_id'] ?? '',
                    'sslcz_store_passwd' => $_POST['sslcz_store_passwd'] ?? '',
                    'sslcz_sandbox' => isset($_POST['sslcz_sandbox']) ? '1' : '0',
                    'sslcz_enabled' => isset($_POST['sslcz_enabled']) ? '1' : '0'
                ];
                $pdo->prepare("UPDATE ".TBL_STAFF." SET gateway_config = ? WHERE id = ?")->execute([json_encode($gw_data), $_SESSION['admin_id']]);
            }
        }    
        
        if (hasRole('Admin')) {

        // UPLOAD LOGO
        if(isset($_FILES['logo']) && $_FILES['logo']['error'] === UPLOAD_ERR_OK) {
            $allowed = ['jpg','jpeg','png','gif','ico','webp'];
            $ext = strtolower(pathinfo($_FILES['logo']['name'], PATHINFO_EXTENSION));
            if(in_array($ext, $allowed)) {
                 // Tenant-aware filename
                 $tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
                 // Sanitize tenant again just in case (though constant should be safe)
                 $tenant = preg_replace('/[^a-zA-Z0-9-]/', '', $tenant);
                 
                 $filename = 'logo_' . $tenant . '.' . $ext;
                 $dest = __DIR__ . '/../uploads/' . $filename;
                 
                 if(save_uploaded_file_with_image_limit($_FILES['logo'], $dest, 50 * 1024) !== false) {
                     // Force refresh browser cache by appending timestamp? No, just store path.
                     // IMPORTANT: set_opt uses CURRENT DB connection.
                     // Since each tenant has their own DB, storing 'uploads/logo_tenant.png' in THAT DB's settings table is correct.
                     // AND the file system is shared, so different file names are required.
                     set_opt($pdo, 'logo_path', 'uploads/' . $filename);
                 }
            }
        }

        // UPLOAD LOGIN PAGE LOGO (separate from the company/panel logo)
        if(isset($_FILES['login_logo']) && $_FILES['login_logo']['error'] === UPLOAD_ERR_OK) {
            $allowed = ['jpg','jpeg','png','gif','webp'];
            $ext = strtolower(pathinfo($_FILES['login_logo']['name'], PATHINFO_EXTENSION));
            if(in_array($ext, $allowed, true)) {
                 $tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
                 $tenant = preg_replace('/[^a-zA-Z0-9-]/', '', $tenant);

                 $filename = 'login_logo_' . $tenant . '.' . $ext;
                 $dest = __DIR__ . '/../uploads/' . $filename;

                 if(save_uploaded_file_with_image_limit($_FILES['login_logo'], $dest, 50 * 1024) !== false) {
                     set_opt($pdo, 'login_logo_path', 'uploads/' . $filename);
                 }
            }
        }

        // UPLOAD FAVICON
        if(isset($_FILES['favicon']) && $_FILES['favicon']['error'] === UPLOAD_ERR_OK) {
            $allowed = ['jpg','jpeg','png','ico','webp'];
            $ext = strtolower(pathinfo($_FILES['favicon']['name'], PATHINFO_EXTENSION));
            if(in_array($ext, $allowed)) {
                 $tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
                 $tenant = preg_replace('/[^a-zA-Z0-9-]/', '', $tenant);
                 
                 $filename = 'favicon_' . $tenant . '.' . $ext;
                 $dest = __DIR__ . '/../uploads/' . $filename;
                 
                 if(save_uploaded_file_with_image_limit($_FILES['favicon'], $dest, 50 * 1024) !== false) {
                     set_opt($pdo, 'favicon_path', 'uploads/' . $filename);
                 }
             }
        }
        }
        
        $msg = "Settings updated successfully.";
    }

    // --- SAVE GATEWAY DEVICE ---
    if (isset($_POST['save_gateway'])) {
        if (!isLoggedIn()) {
            $error = 'Access Denied.';
        } else {
            $id = intval($_POST['id'] ?? 0);
            $gateway_name = trim($_POST['gateway_name'] ?? '');
            $merchant_number = trim($_POST['merchant_number'] ?? '');
            $device_id = trim($_POST['device_id'] ?? '');
            $api_token = trim($_POST['api_token'] ?? '');
            $status = trim($_POST['status'] ?? 'active');
            $account_type = trim($_POST['account_type'] ?? 'Personal');
            $instruction_type = trim($_POST['instruction_type'] ?? 'Send Money');
            $checkout_enabled = intval($_POST['checkout_enabled'] ?? 0);
            $checkout_expiry_mins = intval($_POST['checkout_expiry_mins'] ?? 10);

            if (empty($gateway_name) || empty($merchant_number) || empty($device_id) || empty($api_token)) {
                $error = 'All fields are required.';
            } else {
                try {
                    $old_err_mode = $pdo->getAttribute(PDO::ATTR_ERRMODE);
                    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

                    if ($id > 0) {
                        // Update: Check ownership if not admin
                        if (!hasRole('Admin')) {
                            $check_gw = safeFetch($pdo, "SELECT id FROM tenant_payment_gateways WHERE id = ? AND staff_id = ?", [$id, $_SESSION['admin_id']]);
                            if (!$check_gw) {
                                throw new Exception("Unauthorized to edit this gateway configuration.");
                            }
                        }
                        $stmt = $pdo->prepare("UPDATE tenant_payment_gateways SET gateway_name = ?, merchant_number = ?, device_id = ?, api_token = ?, status = ?, account_type = ?, instruction_type = ?, checkout_enabled = ?, checkout_expiry_mins = ? WHERE id = ?");
                        $stmt->execute([$gateway_name, $merchant_number, $device_id, $api_token, $status, $account_type, $instruction_type, $checkout_enabled, $checkout_expiry_mins, $id]);
                        $msg = 'Gateway device updated successfully!';
                    } else {
                        // Insert
                        $stmt = $pdo->prepare("INSERT INTO tenant_payment_gateways (gateway_name, merchant_number, device_id, api_token, status, staff_id, account_type, instruction_type, checkout_enabled, checkout_expiry_mins) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([$gateway_name, $merchant_number, $device_id, $api_token, $status, $_SESSION['admin_id'], $account_type, $instruction_type, $checkout_enabled, $checkout_expiry_mins]);
                        $msg = 'Gateway device registered successfully!';
                    }

                    // Sync device_id and api_token to all other gateways for this tenant (belonging to this staff)
                    $sync = $pdo->prepare("UPDATE tenant_payment_gateways SET device_id = ?, api_token = ? WHERE staff_id = ?");
                    $sync->execute([$device_id, $api_token, $_SESSION['admin_id']]);

                    $pdo->setAttribute(PDO::ATTR_ERRMODE, $old_err_mode);
                } catch (Exception $e) {
                    if (isset($old_err_mode)) {
                        $pdo->setAttribute(PDO::ATTR_ERRMODE, $old_err_mode);
                    }
                    if ($e->getCode() == 23000 || strpos($e->getMessage(), 'Duplicate entry') !== false) {
                        $error = 'A gateway with this merchant number/provider or device ID/token already exists.';
                    } else {
                        $error = 'Error: ' . $e->getMessage();
                    }
                }
            }
        }
    }

    // --- DELETE GATEWAY DEVICE ---
    if (isset($_GET['action']) && $_GET['action'] == 'delete_gateway') {
        if (!isLoggedIn()) {
            $error = 'Access Denied.';
        } else {
            $delete_id = intval($_GET['delete_id'] ?? 0);
            if ($delete_id > 0) {
                if (!hasRole('Admin')) {
                    $stmt = $pdo->prepare("DELETE FROM tenant_payment_gateways WHERE id = ? AND staff_id = ?");
                    $stmt->execute([$delete_id, $_SESSION['admin_id']]);
                } else {
                    $stmt = $pdo->prepare("DELETE FROM tenant_payment_gateways WHERE id = ?");
                    $stmt->execute([$delete_id]);
                }
                if ($stmt->rowCount() > 0) {
                    $msg = 'Gateway device removed successfully!';
                } else {
                    $error = 'Gateway device not found or unauthorized deletion.';
                }
            }
            if (isset($msg)) {
                $_SESSION['flash_msg'] = $msg;
            }
            if (isset($error)) {
                $_SESSION['flash_error'] = $error;
            }
            header("Location: ?tab=payment_verification_gateways");
            exit;
        }
    }

    // --- Mobile App Branding / Self Care API Settings ---
    if (isset($_POST['save_mobile_app_settings']) && hasRole('Admin')) {
        $appName = trim((string)($_POST['mobile_app_name'] ?? ''));
        $primary = trim((string)($_POST['mobile_app_primary_color'] ?? '#3158C8'));
        $secondary = trim((string)($_POST['mobile_app_secondary_color'] ?? '#283A9B'));
        $accent = trim((string)($_POST['mobile_app_accent_color'] ?? '#18C37E'));

        $validColor = function($value, $fallback) {
            return preg_match('/^#[0-9A-Fa-f]{6}$/', $value) ? strtoupper($value) : $fallback;
        };
        $primary = $validColor($primary, '#3158C8');
        $secondary = $validColor($secondary, '#283A9B');
        $accent = $validColor($accent, '#18C37E');

        set_opt($pdo, 'mobile_app_name', $appName);
        set_opt($pdo, 'mobile_app_primary_color', $primary);
        set_opt($pdo, 'mobile_app_secondary_color', $secondary);
        set_opt($pdo, 'mobile_app_accent_color', $accent);
        $_SESSION['flash_msg'] = 'Mobile App branding settings saved successfully.';
        header('Location: ?tab=settings#v-pills-api');
        exit;
    }

    // --- API Configuration Logic ---
    // API configs must be saved to BOTH the Tenant Database (for UI) and Master Database (for global routing)
    $api_actions = ['update_api_tenant', 'regenerate_hmac', 'generate_api_token'];
    $is_api_action = false;
    foreach ($api_actions as $act) { if (isset($_POST[$act])) { $is_api_action = true; break; } }
    if (isset($_GET['action']) && $_GET['action'] == 'delete_token') $is_api_action = true;

    if ($is_api_action && hasRole('Admin')) {
        // DB_NAME is hijacked by the tenant config. We must fetch true Master DB creds from api/.env
        $envPath = __DIR__ . '/../api/.env';
        $masterHost = '127.0.0.1'; $masterDb = ''; $masterUser = ''; $masterPass = '';
        if (file_exists($envPath)) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos(trim($line), '#') === 0) continue;
                list($name, $value) = explode('=', $line, 2);
                $name = trim($name); $value = trim($value);
                if ($name == 'MASTER_DB_HOST') $masterHost = $value;
                if ($name == 'MASTER_DB_NAME') $masterDb = $value;
                if ($name == 'MASTER_DB_USER') $masterUser = $value;
                if ($name == 'MASTER_DB_PASS') $masterPass = $value;
            }
        }
        
        try {
            $masterPdo = new PDO("mysql:host=" . $masterHost . ";dbname=" . $masterDb . ";charset=utf8", $masterUser, $masterPass);
            $masterPdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $masterPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (Exception $e) {
            http_response_code(500);
            exit("Master DB Connection Failed. Please ensure api/.env exists with correct MASTER_DB_* credentials. Error: " . $e->getMessage());
        }
        
        $tenant_ident = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'Main System';
        
        if (isset($_POST['update_api_tenant'])) {
            $sub = trim($_POST['api_subdomain']);
            
            // 1. Update Tenant DB (UI)
            $localTenant = safeFetch($pdo, "SELECT id FROM tenants LIMIT 1");
            if ($localTenant) {
                $pdo->prepare("UPDATE tenants SET subdomain = ? WHERE id = ?")->execute([$sub, $localTenant['id']]);
                $hmac = safeFetch($pdo, "SELECT hmac_secret FROM tenants WHERE id = ?", [$localTenant['id']])['hmac_secret'];
            } else {
                $hmac = bin2hex(random_bytes(16));
                $pdo->prepare("INSERT INTO tenants (name, subdomain, db_name, db_user, db_pass, hmac_secret, status) VALUES (?, ?, ?, ?, ?, ?, 'active')")
                    ->execute([$tenant_ident, $sub, DB_NAME, DB_USER, DB_PASS, $hmac]);
            }

            // 2. Update Master DB (API)
            $masterTenant = safeFetch($masterPdo, "SELECT id FROM tenants WHERE name = ? OR subdomain = ? LIMIT 1", [$tenant_ident, $sub]);
            if ($masterTenant) {
                $masterPdo->prepare("UPDATE tenants SET subdomain = ?, hmac_secret = ? WHERE id = ?")->execute([$sub, $hmac, $masterTenant['id']]);
            } else {
                $masterPdo->prepare("INSERT INTO tenants (name, subdomain, db_name, db_user, db_pass, hmac_secret, status) VALUES (?, ?, ?, ?, ?, ?, 'active')")
                          ->execute([$tenant_ident, $sub, DB_NAME, DB_USER, DB_PASS, $hmac]);
            }
            
            $msg = "API Tenant updated successfully.";
            header("Location: ?tab=settings");
            exit;
        }

        if (isset($_POST['regenerate_hmac'])) {
            $hmac = bin2hex(random_bytes(16));
            // Update Tenant DB
            $pdo->prepare("UPDATE tenants SET hmac_secret = ? LIMIT 1")->execute([$hmac]);
            // Update Master DB
            $masterPdo->prepare("UPDATE tenants SET hmac_secret = ? WHERE name = ? LIMIT 1")->execute([$hmac, $tenant_ident]);
            
            $msg = "HMAC Secret regenerated. All previous signatures will stop working.";
            header("Location: ?tab=settings");
            exit;
        }

        if (isset($_POST['generate_api_token'])) {
            $rate = intval($_POST['token_rate_limit']);
            
            $localTenant = safeFetch($pdo, "SELECT id, subdomain FROM tenants LIMIT 1");
            $sub = $localTenant ? $localTenant['subdomain'] : '';
            $masterTenant = safeFetch($masterPdo, "SELECT id FROM tenants WHERE name = ? OR subdomain = ? LIMIT 1", [$tenant_ident, $sub]);
            
            if ($localTenant && $masterTenant) {
                // Generate raw token, store raw token so user can retrieve it later
                $rawToken = bin2hex(random_bytes(32));
                // We no longer hash the token as requested by user to be able to copy the raw token anytime
                $expiryFull = date('Y-m-d H:i:s', strtotime('+10 years'));
                
                // Insert to Tenant DB
                $pdo->prepare("INSERT INTO api_tokens (tenant_id, token_hash, expires_at, rate_limit) VALUES (?, ?, ?, ?)")
                    ->execute([$localTenant['id'], $rawToken, $expiryFull, $rate]);
                    
                // Insert to Master DB (Let it auto-increment its own ID)
                $masterPdo->prepare("INSERT INTO api_tokens (tenant_id, token_hash, expires_at, rate_limit) VALUES (?, ?, ?, ?)")
                          ->execute([$masterTenant['id'], $rawToken, $expiryFull, $rate]);
                
                $_SESSION['new_api_token'] = $rawToken;
                header("Location: ?tab=settings");
                exit;
            } else {
                // Flash an actual visible message
                $_SESSION['error'] = "Please click 'Update Tenant' first to bind the subdomain.";
            }
        }

        if (isset($_GET['action']) && $_GET['action'] == 'delete_token') {
            $id = intval($_GET['token_id'] ?? $_GET['id'] ?? 0);
            if ($id > 0) {
                // Fetch the token hash to safely delete it from the master DB before removing it locally
                $tokenRow = safeFetch($pdo, "SELECT token_hash FROM api_tokens WHERE id = ?", [$id]);
                if ($tokenRow) {
                    $pdo->prepare("DELETE FROM api_tokens WHERE id = ?")->execute([$id]);
                    $masterPdo->prepare("DELETE FROM api_tokens WHERE token_hash = ?")->execute([$tokenRow['token_hash']]);
                }
                $msg = "API Token revoked.";
            }
            header("Location: ?tab=settings");
            exit;
        }
    }


   if (isset($_POST['update_sms_gateway']) && hasRole('SubReseller')) {
       if (hasRole('Admin')) {
           set_opt($pdo, 'sms_enabled', isset($_POST['sms_enabled']) ? '1' : '0');
           set_opt($pdo, 'sms_gateway_type', $_POST['sms_gateway_type'] ?? 'custom');
           set_opt($pdo, 'sms_api_url', $_POST['sms_api_url']);
           set_opt($pdo, 'sms_api_key', $_POST['sms_api_key']);
           set_opt($pdo, 'sms_sender_id', $_POST['sms_sender_id']);
       } else {
           // Reseller setting their own
           $stmt = $pdo->prepare("SELECT sms_config FROM ".TBL_STAFF." WHERE id=?");
           $stmt->execute([$_SESSION['admin_id']]);
           $config = json_decode($stmt->fetchColumn() ?: '{}', true);
           
           $config['sms_enabled'] = isset($_POST['sms_enabled']) ? '1' : '0';
           $config['sms_gateway_type'] = $_POST['sms_gateway_type'] ?? 'custom';
           $config['sms_api_url'] = $_POST['sms_api_url'];
           $config['sms_api_key'] = $_POST['sms_api_key'];
           $config['sms_sender_id'] = $_POST['sms_sender_id'];
           
           $pdo->prepare("UPDATE ".TBL_STAFF." SET sms_config=? WHERE id=?")->execute([json_encode($config), $_SESSION['admin_id']]);
       }
       writeLog($pdo, $_SESSION['admin_username'], 'Update SMS Gateway', 0, "Updated SMS API settings");
       $msg = "SMS Gateway settings updated.";
   }

   if (isset($_POST['update_sms_templates']) && hasRole('SubReseller')) {
       if (hasRole('Admin')) {
           set_opt($pdo, 'sms_tpl_welcome', $_POST['sms_tpl_welcome']);
           set_opt($pdo, 'sms_tpl_payment', $_POST['sms_tpl_payment']);
           set_opt($pdo, 'sms_tpl_loan', $_POST['sms_tpl_loan']);
           set_opt($pdo, 'sms_tpl_reminder', $_POST['sms_tpl_reminder']);
           set_opt($pdo, 'sms_tpl_expiry', $_POST['sms_tpl_expiry']);

            set_opt($pdo, 'sms_enabled_welcome', isset($_POST['sms_enabled_welcome']) ? '1' : '0');
            set_opt($pdo, 'sms_enabled_payment', isset($_POST['sms_enabled_payment']) ? '1' : '0');
            set_opt($pdo, 'sms_enabled_loan', isset($_POST['sms_enabled_loan']) ? '1' : '0');
            set_opt($pdo, 'sms_enabled_reminder', isset($_POST['sms_enabled_reminder']) ? '1' : '0');
            set_opt($pdo, 'sms_enabled_expiry', isset($_POST['sms_enabled_expiry']) ? '1' : '0');
            
            set_opt($pdo, 'sms_time_reminder', $_POST['sms_time_reminder'] ?? '00:00');
            set_opt($pdo, 'sms_time_expiry', $_POST['sms_time_expiry'] ?? '00:00');
       } else {
           $stmt = $pdo->prepare("SELECT sms_config FROM ".TBL_STAFF." WHERE id=?");
           $stmt->execute([$_SESSION['admin_id']]);
           $config = json_decode($stmt->fetchColumn() ?: '{}', true);
           
           $config['sms_tpl_welcome'] = $_POST['sms_tpl_welcome'];
           $config['sms_tpl_payment'] = $_POST['sms_tpl_payment'];
           $config['sms_tpl_loan'] = $_POST['sms_tpl_loan'];
           $config['sms_tpl_reminder'] = $_POST['sms_tpl_reminder'];
           $config['sms_tpl_expiry'] = $_POST['sms_tpl_expiry'];

            $config['sms_enabled_welcome'] = isset($_POST['sms_enabled_welcome']) ? '1' : '0';
            $config['sms_enabled_payment'] = isset($_POST['sms_enabled_payment']) ? '1' : '0';
            $config['sms_enabled_loan'] = isset($_POST['sms_enabled_loan']) ? '1' : '0';
            $config['sms_enabled_reminder'] = isset($_POST['sms_enabled_reminder']) ? '1' : '0';
            $config['sms_enabled_expiry'] = isset($_POST['sms_enabled_expiry']) ? '1' : '0';
            
            $config['sms_time_reminder'] = $_POST['sms_time_reminder'] ?? '00:00';
            $config['sms_time_expiry'] = $_POST['sms_time_expiry'] ?? '00:00';
           
           $pdo->prepare("UPDATE ".TBL_STAFF." SET sms_config=? WHERE id=?")->execute([json_encode($config), $_SESSION['admin_id']]);
       }
       writeLog($pdo, $_SESSION['admin_username'], 'Update SMS Templates', 0, "Updated SMS message templates");
       $msg = "SMS Templates updated.";
   }

    // --- VOICE REMINDER SETTINGS UPDATE ---
    if (isset($_POST['update_voice_settings'])) {
        $staff_id = $_SESSION['admin_id'];
        
        $voice_enabled = isset($_POST['voice_enabled']) ? '1' : '0';
        $posted_token = $_POST['voice_api_token'] ?? '';
        
        if (!empty($posted_token) && strpos($posted_token, '***') === false) {
            $encrypted_token = encrypt_voice_token($posted_token);
        } else {
            if (empty($posted_token)) {
                $encrypted_token = '';
            } else {
                $encrypted_token = get_voice_setting($pdo, $staff_id, 'voice_api_token', false);
            }
        }
        
        $voice_sender = $_POST['voice_sender'] ?? '';
        $voice_voice_name = $_POST['voice_voice_name'] ?? '';
        $voice_enabled_expiry = isset($_POST['voice_enabled_expiry']) ? '1' : '0';
        $voice_days_before_expiry = intval($_POST['voice_days_before_expiry'] ?? 0);
        $voice_time_expiry = $_POST['voice_time_expiry'] ?? '10:00';
        $voice_retry_enabled = isset($_POST['voice_retry_enabled']) ? '1' : '0';
        $voice_retry_max_attempts = intval($_POST['voice_retry_max_attempts'] ?? 1);
        $voice_retry_after_minutes = intval($_POST['voice_retry_after_minutes'] ?? 60);
        $voice_allowed_hours_start = $_POST['voice_allowed_hours_start'] ?? '09:00';
        $voice_allowed_hours_end = $_POST['voice_allowed_hours_end'] ?? '20:00';

        if (hasRole('Admin')) {
            set_opt($pdo, 'voice_enabled', $voice_enabled);
            set_opt($pdo, 'voice_api_token', $encrypted_token);
            set_opt($pdo, 'voice_sender', $voice_sender);
            set_opt($pdo, 'voice_voice_name', $voice_voice_name);
            set_opt($pdo, 'voice_enabled_expiry', $voice_enabled_expiry);
            set_opt($pdo, 'voice_days_before_expiry', $voice_days_before_expiry);
            set_opt($pdo, 'voice_time_expiry', $voice_time_expiry);
            set_opt($pdo, 'voice_retry_enabled', $voice_retry_enabled);
            set_opt($pdo, 'voice_retry_max_attempts', $voice_retry_max_attempts);
            set_opt($pdo, 'voice_retry_after_minutes', $voice_retry_after_minutes);
            set_opt($pdo, 'voice_allowed_hours_start', $voice_allowed_hours_start);
            set_opt($pdo, 'voice_allowed_hours_end', $voice_allowed_hours_end);
        } else {
            $stmt = $pdo->prepare("SELECT voice_config FROM ".TBL_STAFF." WHERE id=?");
            $stmt->execute([$staff_id]);
            $config = json_decode($stmt->fetchColumn() ?: '{}', true);
            
            $config['voice_enabled'] = $voice_enabled;
            $config['voice_api_token'] = $encrypted_token;
            $config['voice_sender'] = $voice_sender;
            $config['voice_voice_name'] = $voice_voice_name;
            $config['voice_enabled_expiry'] = $voice_enabled_expiry;
            $config['voice_days_before_expiry'] = $voice_days_before_expiry;
            $config['voice_time_expiry'] = $voice_time_expiry;
            $config['voice_retry_enabled'] = $voice_retry_enabled;
            $config['voice_retry_max_attempts'] = $voice_retry_max_attempts;
            $config['voice_retry_after_minutes'] = $voice_retry_after_minutes;
            $config['voice_allowed_hours_start'] = $voice_allowed_hours_start;
            $config['voice_allowed_hours_end'] = $voice_allowed_hours_end;
            
            $pdo->prepare("UPDATE ".TBL_STAFF." SET voice_config=? WHERE id=?")->execute([json_encode($config), $staff_id]);
        }
        
        writeLog($pdo, $_SESSION['admin_username'], 'Update Voice Settings', 0, "Updated Voice Call Reminder settings");
        $msg = "Voice Call Reminder settings updated.";
    }
       
    if (isset($_GET['action']) && $_GET['action'] == 'import_secrets' && hasRole('Admin')) {
        $rid = intval($_GET['router_id']);
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$rid]);
        if($r) {
             $mk = new MikrotikApp($r);
             $secrets = $mk->getSecrets();
             writeLog($pdo, $_SESSION['admin_username'], 'Import Debug', $rid, "Found ".count($secrets)." secrets");
             $count = 0;
             $skipped = 0;
             $today = date('Y-m-d');
             $exp_date = date('Y-m-d', strtotime('+1 day')); 

             foreach($secrets as $s) {
                 $u_name = $s['name'] ?? '';
                 $u_pass = $s['password'] ?? '';
                 $u_profile = $s['profile'] ?? 'default';

                 if($u_name) {
                     $exist = safeFetch($pdo, "SELECT id FROM ".TBL_USERS." WHERE user_id=?", [$u_name]);
                     if(!$exist) {
                         // Find matching package price and name (nickname)
                         $svc = safeFetch($pdo, "SELECT name, price FROM ".TBL_SERVICES." WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR LOWER(TRIM(mikrotik_profile_name)) = LOWER(TRIM(?)) LIMIT 1", [$u_profile, $u_profile]);
                         $pkg_name_to_set = ($svc && isset($svc['name'])) ? $svc['name'] : $u_profile;
                         $bill_amount = ($svc && isset($svc['price'])) ? floatval($svc['price']) : 0;

                         $sql = "INSERT INTO ".TBL_USERS." (name, phone, user_id, password, address, user_package, bill_amount, status, bill_position, router_id, joining_date, current_bill_date, credit_taken, credit_days, manager_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                         $pdo->prepare($sql)->execute([
                             $u_name, '00000000000', $u_name, $u_pass, 'Imported from Router', $pkg_name_to_set, $bill_amount, 'Active', 'Active', $rid, $today, $exp_date, 1, 1, $_SESSION['admin_id']
                         ]);
                         $count++;
                     } else {
                         $skipped++;
                     }
                 }
             }
             writeLog($pdo, $_SESSION['admin_username'], 'Import Secrets', $rid, "Imported $count users from router {$r['name']}");
             $msg = "Imported $count users. Skipped $skipped duplicates.";
        } else {
             $error = "Router not found.";
        }
    }

    if (isset($_POST['quick_import']) && (hasRole('Admin') || (isOffice() && hasPermission('routers_olt')))) {
        $rid = intval($_POST['router_id'] ?? 0);
        $u_name = trim($_POST['username'] ?? '');
        $u_profile = trim($_POST['profile'] ?? 'default');
        
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$rid]);
        if ($r && !empty($u_name)) {
            // Re-read the password server-side so it never travels in page HTML,
            // browser history, referrer headers, or query-string logs.
            $mk = new MikrotikApp($r);
            $u_pass = '';
            foreach ($mk->getSecrets() as $secret) {
                if (hash_equals($u_name, trim((string)($secret['name'] ?? '')))) {
                    $u_pass = (string)($secret['password'] ?? '');
                    break;
                }
            }
            if ($u_pass === '') {
                $_SESSION['flash_error'] = 'Could not securely read a non-empty PPPoE password from the router.';
                header("Location: ?tab=routers&view_unregistered=1&router_id=" . $rid);
                exit;
            }
            $exist = safeFetch($pdo, "SELECT id FROM ".TBL_USERS." WHERE user_id=?", [$u_name]);
            if (!$exist) {
                // Find matching package price and name
                $svc = safeFetch($pdo, "SELECT name, price FROM ".TBL_SERVICES." WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR LOWER(TRIM(mikrotik_profile_name)) = LOWER(TRIM(?)) LIMIT 1", [$u_profile, $u_profile]);
                $pkg_name_to_set = ($svc && isset($svc['name'])) ? $svc['name'] : $u_profile;
                $bill_amount = ($svc && isset($svc['price'])) ? floatval($svc['price']) : 0;
                
                $today = date('Y-m-d');
                $exp_date = date('Y-m-d', strtotime('+1 day')); 
                $manager_id = $_SESSION['admin_id'] ?? 0;
                
                $sql = "INSERT INTO ".TBL_USERS." (name, phone, user_id, password, address, user_package, bill_amount, status, bill_position, router_id, joining_date, current_bill_date, credit_taken, credit_days, manager_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $pdo->prepare($sql)->execute([
                    $u_name, '00000000000', $u_name, $u_pass, 'Imported from Router', $pkg_name_to_set, $bill_amount, 'Active', 'Active', $rid, $today, $exp_date, 1, 1, $manager_id
                ]);
                
                writeLog($pdo, $_SESSION['admin_username'], 'Quick Import Secret', $rid, "Quick imported user $u_name from router {$r['name']}");
                $_SESSION['flash_msg'] = "User \"$u_name\" successfully imported into billing system.";
            } else {
                $_SESSION['flash_error'] = "User already exists in the billing system.";
            }
        } else {
            $_SESSION['flash_error'] = "Invalid router or username.";
        }
        
        header("Location: ?tab=routers&view_unregistered=1&router_id=" . $rid);
        exit;
    }

    if (isset($_GET['action']) && $_GET['action'] == 'sync_clients' && (hasRole('Admin') || isOffice())) {
        @set_time_limit(0);
        $rid = intval($_GET['router_id']);
        $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$rid]);
        if ($r) {
            $mk = new MikrotikApp($r, 15);
            if ($mk->isOnline()) {
                // Fetch all clients of this router, plus any clients with no router assigned (0 or NULL)
                $clients = safeFetchAll($pdo, "SELECT * FROM ".TBL_USERS." WHERE router_id = ? OR router_id = 0 OR router_id IS NULL", [$rid]);
                $synced = 0;
                $disabled_count = 0;
                $enabled_count = 0;
                
                // Fetch packages/services for mapping profile names
                $services = safeFetchAll($pdo, "SELECT name, mikrotik_profile_name FROM " . TBL_SERVICES);
                $services_map = [];
                foreach ($services as $s) {
                    $services_map[strtolower(trim($s['name']))] = trim($s['mikrotik_profile_name']);
                }

                // Pre-fetch all secrets and active sessions in BULK
                $raw_secrets = $mk->getSecrets() ?: [];
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
                
                $expired_ids = [];
                
                foreach ($clients as $client) {
                    // Automatically assign router_id if it is 0 or null
                    if (intval($client['router_id']) === 0 || $client['router_id'] === null) {
                        $pdo->prepare("UPDATE " . TBL_USERS . " SET router_id = ? WHERE id = ?")->execute([$rid, $client['id']]);
                        $client['router_id'] = $rid;
                    }
                    
                    $is_expired = is_client_expired($client, $pdo);
                    if ($is_expired && in_array($client['status'], ['Active', 'Promise Active'])) {
                        $expired_ids[] = $client['id'];
                        $client['status'] = 'Expire';
                    }
                    
                    // Resolve profile name robustly
                    $profile_name = 'default';
                    if (!empty(trim($client['user_package']))) {
                        $pkg_key = strtolower(trim($client['user_package']));
                        if (isset($services_map[$pkg_key]) && !empty($services_map[$pkg_key])) {
                            $profile_name = $services_map[$pkg_key];
                        } else {
                            $profile_name = trim($client['user_package']);
                        }
                    }
                    
                    $status = trim($client['status']);
                    $is_active = (strcasecmp($status, 'Active') === 0 || strcasecmp($status, 'Free') === 0 || strcasecmp($status, 'Promise Active') === 0);
                    $enable = $is_active && !$is_expired;
                    
                    $client_pass = trim((string)($client['password'] ?? ''));
                    $username = $client['user_id'];
                    
                    $desired_disabled = $enable ? 'false' : 'true';
                    $has_changed = false;
                    
                    if (!isset($mikrotik_secrets[$username])) {
                        // Create only when a real DB password exists. Never fall back to username.
                        if ($client_pass !== '') {
                            try {
                                $q = new RouterOS\Query('/ppp/secret/add');
                                $q->equal('name', $username)
                                  ->equal('password', $client_pass)
                                  ->equal('service', 'pppoe')
                                  ->equal('profile', $profile_name)
                                  ->equal('disabled', $enable ? 'no' : 'yes');
                                $mk->getClient()->query($q)->read();
                                $has_changed = true;
                            } catch (Exception $ex) {}
                        }
                    } else {
                        // Existing secret: sync ONLY disabled/profile. Password is audit-only.
                        $exist = $mikrotik_secrets[$username];
                        $mt_disabled = $exist['disabled'] ?? 'false';
                        $mt_profile = $exist['profile'] ?? '';
                        $mt_password = (string)($exist['password'] ?? '');
                        if ($client_pass !== '') $mk->auditPassword($username, $client_pass, $mt_password);
                        
                        $needs_update = ($mt_disabled !== $desired_disabled) || 
                                        ($mt_profile !== $profile_name);
                                        
                        if ($needs_update) {
                            try {
                                $q = new RouterOS\Query('/ppp/secret/set');
                                $q->equal('.id', $exist['.id'])
                                  ->equal('disabled', $enable ? 'no' : 'yes')
                                  ->equal('profile', $profile_name);
                                $mk->getClient()->query($q)->read();
                                $has_changed = true;
                            } catch (Exception $ex) {}
                        }
                    }
                    
                    if ($has_changed) {
                        $synced++;
                    }
                    if ($enable) {
                        $enabled_count++;
                    } else {
                        $disabled_count++;
                    }
                    
                    // Force disconnect active session if user is disabled or expired
                    if (!$enable && isset($active_sessions[$username])) {
                        foreach ($active_sessions[$username] as $act_item) {
                            if (isset($act_item['.id'])) {
                                try {
                                    $mk->getClient()->query((new RouterOS\Query('/ppp/active/remove'))->equal('.id', $act_item['.id']))->read();
                                } catch (Exception $ex) {}
                            }
                        }
                    }
                }
                
                // Bulk update expired clients
                if (!empty($expired_ids)) {
                    $placeholders = implode(',', array_fill(0, count($expired_ids), '?'));
                    $pdo->prepare("UPDATE " . TBL_USERS . " SET status = 'Expire', bill_position = 'Expire', promise_enabled = 0, promise_date = NULL WHERE id IN ($placeholders)")->execute($expired_ids);
                }
                
                writeLog($pdo, $_SESSION['admin_username'], 'Sync Clients to MikroTik', $rid, "Synced $synced clients for router {$r['name']}. Enabled: $enabled_count, Disabled: $disabled_count.");
                $msg = "Router sync completed. Total updated: $synced (Enabled: $enabled_count, Disabled: $disabled_count).";
            } else {
                $error = "Router is offline. Cannot sync.";
            }
        } else {
            $error = "Router not found.";
        }
    }

    if (isset($_GET['action']) && $_GET['action'] == 'sync_all_clients' && (hasRole('Admin') || isOffice() || hasRole('Reseller') || hasRole('SubReseller'))) {
        @set_time_limit(0);
        $user_id_session = $_SESSION['admin_id'];
        $role_session = $_SESSION['user_role'] ?? '';
        $managed_ids = getManagedStaffIds($pdo, $user_id_session, $role_session);
        
        $sql = "SELECT * FROM " . TBL_USERS;
        $params = [];
        
        if (hasRole('Admin') || (isOffice() && $managed_ids === 'ALL')) {
            // Admin / office gets all clients
        } else {
            // Resellers/Sub-Resellers get only their managed clients
            if (is_array($managed_ids)) {
                $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
                $sql .= " WHERE manager_id IN ($placeholders)";
                $params = $managed_ids;
            } else {
                $sql .= " WHERE manager_id = ?";
                $params[] = $user_id_session;
            }
        }
        
        $clients = safeFetchAll($pdo, $sql, $params);
        
        // Find default router (first router in database) for fallback assignment
        $first_router = safeFetch($pdo, "SELECT id FROM " . TBL_ROUTERS . " LIMIT 1");
        $default_router_id = $first_router ? intval($first_router['id']) : 0;
        
        $clients_by_router = [];
        foreach ($clients as $client) {
            $router_id = intval($client['router_id']);
            // Automatically assign default router if router_id is 0 or null
            if ($router_id === 0 || $client['router_id'] === null) {
                if ($default_router_id > 0) {
                    $pdo->prepare("UPDATE " . TBL_USERS . " SET router_id = ? WHERE id = ?")->execute([$default_router_id, $client['id']]);
                    $router_id = $default_router_id;
                    $client['router_id'] = $default_router_id;
                }
            }
            if ($router_id > 0) {
                $clients_by_router[$router_id][] = $client;
            }
        }
        
        $total_synced = 0;
        $total_enabled = 0;
        $total_disabled = 0;
        $router_errors = [];
        
        // Fetch packages/services for mapping profile names
        $services = safeFetchAll($pdo, "SELECT name, mikrotik_profile_name FROM " . TBL_SERVICES);
        $services_map = [];
        foreach ($services as $s) {
            $services_map[strtolower(trim($s['name']))] = trim($s['mikrotik_profile_name']);
        }

        foreach ($clients_by_router as $router_id => $router_clients) {
            $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$router_id]);
            if ($r) {
                $mk = new MikrotikApp($r, 15);
                if ($mk->isOnline()) {
                    // Pre-fetch secrets and active sessions for this router in bulk
                    $raw_secrets = $mk->getSecrets() ?: [];
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

                    $expired_ids = [];

                    foreach ($router_clients as $client) {
                        $is_expired = is_client_expired($client, $pdo);
                        if ($is_expired && in_array($client['status'], ['Active', 'Promise Active'])) {
                            $expired_ids[] = $client['id'];
                            $client['status'] = 'Expire';
                        }
                        
                        // Resolve profile name robustly
                        $profile_name = 'default';
                        if (!empty(trim($client['user_package']))) {
                            $pkg_key = strtolower(trim($client['user_package']));
                            if (isset($services_map[$pkg_key]) && !empty($services_map[$pkg_key])) {
                                $profile_name = $services_map[$pkg_key];
                            } else {
                                $profile_name = trim($client['user_package']);
                            }
                        }
                        
                        $status = trim($client['status']);
                        $is_active = (strcasecmp($status, 'Active') === 0 || strcasecmp($status, 'Free') === 0 || strcasecmp($status, 'Promise Active') === 0);
                        $enable = $is_active && !$is_expired;
                        
                        $client_pass = trim((string)($client['password'] ?? ''));
                        $username = $client['user_id'];
                        
                        $desired_disabled = $enable ? 'false' : 'true';
                        $has_changed = false;
                        
                        if (!isset($mikrotik_secrets[$username])) {
                            if ($client_pass !== '') {
                                try {
                                    $q = new RouterOS\Query('/ppp/secret/add');
                                    $q->equal('name', $username)
                                      ->equal('password', $client_pass)
                                      ->equal('service', 'pppoe')
                                      ->equal('profile', $profile_name)
                                      ->equal('disabled', $enable ? 'no' : 'yes');
                                    $mk->getClient()->query($q)->read();
                                    $has_changed = true;
                                } catch (Exception $ex) {}
                            }
                        } else {
                            $exist = $mikrotik_secrets[$username];
                            $mt_disabled = $exist['disabled'] ?? 'false';
                            $mt_profile = $exist['profile'] ?? '';
                            $mt_password = (string)($exist['password'] ?? '');
                            if ($client_pass !== '') $mk->auditPassword($username, $client_pass, $mt_password);
                            
                            $needs_update = ($mt_disabled !== $desired_disabled) || 
                                            ($mt_profile !== $profile_name);
                                            
                            if ($needs_update) {
                                try {
                                    $q = new RouterOS\Query('/ppp/secret/set');
                                    $q->equal('.id', $exist['.id'])
                                      ->equal('disabled', $enable ? 'no' : 'yes')
                                      ->equal('profile', $profile_name);
                                    $mk->getClient()->query($q)->read();
                                    $has_changed = true;
                                } catch (Exception $ex) {}
                            }
                        }
                        
                        if ($has_changed) {
                            $total_synced++;
                        }
                        if ($enable) {
                            $total_enabled++;
                        } else {
                            $total_disabled++;
                        }
                        
                        // Force disconnect active session if user is disabled or expired
                        if (!$enable && isset($active_sessions[$username])) {
                            foreach ($active_sessions[$username] as $act_item) {
                                if (isset($act_item['.id'])) {
                                    try {
                                        $mk->getClient()->query((new RouterOS\Query('/ppp/active/remove'))->equal('.id', $act_item['.id']))->read();
                                    } catch (Exception $ex) {}
                                }
                            }
                        }
                    }

                    // Bulk update expired clients for this router
                    if (!empty($expired_ids)) {
                        $placeholders = implode(',', array_fill(0, count($expired_ids), '?'));
                        $pdo->prepare("UPDATE " . TBL_USERS . " SET status = 'Expire', bill_position = 'Expire', promise_enabled = 0, promise_date = NULL WHERE id IN ($placeholders)")->execute($expired_ids);
                    }
                } else {
                    $router_errors[] = $r['name'];
                }
            }
        }
        
        $log_msg = "Bulk Synced $total_synced clients. Enabled: $total_enabled, Disabled: $total_disabled.";
        if (!empty($router_errors)) {
            $log_msg .= " Failed routers: " . implode(', ', $router_errors);
        }
        
        writeLog($pdo, $_SESSION['admin_username'], 'Sync All Clients to MikroTik', 0, $log_msg);
        
        if ($total_synced > 0) {
            $_SESSION['flash_msg'] = "Successfully synced $total_synced clients (Enabled: $total_enabled, Disabled: $total_disabled).";
            if (!empty($router_errors)) {
                $_SESSION['flash_msg'] .= " Note: Could not connect to routers: " . implode(', ', $router_errors);
            }
        } else {
            $_SESSION['flash_error'] = "No clients were synced. " . (!empty($router_errors) ? "Could not connect to routers: " . implode(', ', $router_errors) : "No clients found.");
        }
        
        $redirect_tab = $_GET['tab'] ?? 'clients';
        header("Location: ?tab=" . $redirect_tab);
        exit;
    }

    if (isset($_GET['action']) && $_GET['action'] == 'sync_single_client' && (hasRole('Admin') || isOffice() || hasRole('Reseller') || hasRole('SubReseller'))) {
        $client_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        $client = safeFetch($pdo, "SELECT * FROM " . TBL_USERS . " WHERE id = ?", [$client_id]);
        
        if ($client) {
            $user_id_session = $_SESSION['admin_id'];
            $role_session = $_SESSION['user_role'] ?? '';
            $managed_ids = getManagedStaffIds($pdo, $user_id_session, $role_session);
            
            if ($managed_ids !== 'ALL' && !in_array(intval($client['manager_id']), $managed_ids)) {
                $_SESSION['flash_error'] = "Access Denied: You do not have permission to refresh this client.";
                header("Location: ?view_id=" . $client['id']);
                exit;
            }
            
            $router_id = intval($client['router_id']);
            if ($router_id === 0 || $client['router_id'] === null) {
                $first_router = safeFetch($pdo, "SELECT id FROM " . TBL_ROUTERS . " LIMIT 1");
                $default_router_id = $first_router ? intval($first_router['id']) : 0;
                if ($default_router_id > 0) {
                    $pdo->prepare("UPDATE " . TBL_USERS . " SET router_id = ? WHERE id = ?")->execute([$default_router_id, $client['id']]);
                    $router_id = $default_router_id;
                    $client['router_id'] = $default_router_id;
                }
            }
            
            if ($router_id > 0) {
                $r = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id = ?", [$router_id]);
                if ($r) {
                    $mk = new MikrotikApp($r, 10);
                    if ($mk->isOnline()) {
                        $is_expired = is_client_expired($client, $pdo);
                        if ($is_expired && in_array($client['status'], ['Active', 'Promise Active'])) {
                            $pdo->prepare("UPDATE " . TBL_USERS . " SET status = 'Expire', bill_position = 'Expire', promise_enabled = 0, promise_date = NULL WHERE id = ?")->execute([$client['id']]);
                            $client['status'] = 'Expire';
                        }
                        
                        $profile_name = 'default';
                        if (!empty(trim($client['user_package']))) {
                            $svc = safeFetch($pdo, "SELECT mikrotik_profile_name FROM " . TBL_SERVICES . " WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [$client['user_package']]);
                            if ($svc && !empty(trim($svc['mikrotik_profile_name']))) {
                                $profile_name = trim($svc['mikrotik_profile_name']);
                            } else {
                                $profile_name = trim($client['user_package']);
                            }
                        }
                        
                        $status = trim($client['status']);
                        $is_active = (strcasecmp($status, 'Active') === 0 || strcasecmp($status, 'Free') === 0 || strcasecmp($status, 'Promise Active') === 0);
                        $enable = $is_active && !$is_expired;
                        
                        $client_pass = !empty($client['password']) ? $client['password'] : false;
                        if ($mk->toggle($client['user_id'], $enable, $profile_name, $client_pass)) {
                            writeLog($pdo, $_SESSION['admin_username'], 'Refresh Client on MikroTik', $client['id'], "Refreshed client {$client['user_id']} on MikroTik (Router: {$r['name']}). Enable status: " . ($enable ? 'Yes' : 'No') . ".");
                            $_SESSION['flash_msg'] = "Successfully refreshed client {$client['user_id']} on MikroTik.";
                        } else {
                            $_SESSION['flash_error'] = "Could not refresh client {$client['user_id']} on MikroTik: " . ($mk->error ?: "Unknown MikroTik error.");
                        }
                    } else {
                        $_SESSION['flash_error'] = "Could not connect to router {$r['name']}.";
                    }
                } else {
                    $_SESSION['flash_error'] = "Router not found.";
                }
            } else {
                $_SESSION['flash_error'] = "No router assigned to this client.";
            }
            
            header("Location: ?view_id=" . $client['id']);
            exit;
        } else {
            $_SESSION['flash_error'] = "Client not found.";
            header("Location: ?tab=clients");
            exit;
        }
    }

    if (isset($_POST['bulk_recharge']) && hasRole('SubReseller')) {
        $ids = [];
        if (!empty($_POST['bulk_ids'])) {
            if (is_array($_POST['bulk_ids'])) {
                $ids = $_POST['bulk_ids'];
            } elseif (is_string($_POST['bulk_ids'])) {
                $decoded = json_decode($_POST['bulk_ids'], true);
                $ids = is_array($decoded) ? $decoded : explode(',', $_POST['bulk_ids']);
            }
        }
        if (empty($ids) && !empty($_POST['bulk_ids_json'])) {
            $decoded = json_decode($_POST['bulk_ids_json'], true);
            if (is_array($decoded)) {
                $ids = $decoded;
            }
        }
        $ids = array_filter(array_map('intval', $ids));
        
        $r_days = isset($_POST['bulk_recharge_days']) ? intval($_POST['bulk_recharge_days']) : 30;
        if($r_days < 1) $r_days = 30;
        
        $processed = 0;
        $failed = 0;
        $failure_reasons = [];
        $record_bulk_failure = function($reason) use (&$failed, &$failure_reasons) {
            $failed++;
            $failure_reasons[$reason] = ($failure_reasons[$reason] ?? 0) + 1;
        };
        $pay_method = $_POST['pay_method'] ?? 'Cash';
        $deduct_due_requested = isset($_POST['deduct_due_balance']) && $_POST['deduct_due_balance'] == '1' && $pay_method !== 'Expire';
        $discount_mode_enabled = (get_opt($pdo, 'recharge_discount_enabled') === '1');
        $bulk_discounts = ($discount_mode_enabled && isset($_POST['bulk_discount']) && is_array($_POST['bulk_discount'])) ? $_POST['bulk_discount'] : [];
        
        $trx_id_raw = trim($_POST['trx_id'] ?? '');
        $trx_id = !empty($trx_id_raw) ? " (Trx: " . $trx_id_raw . ")" : ($pay_method === 'Expire' ? " (Trx: Due)" : "");

        if (!empty($trx_id_raw) && in_array($pay_method, ['Bank', 'bKash', 'Nagad', 'Rocket'])) {
            $trx_chk = $pdo->prepare("SELECT COUNT(*) FROM ".TBL_TX." WHERE description LIKE ?");
            $trx_chk->execute(["%(Trx: $trx_id_raw)%"]);
            if ($trx_chk->fetchColumn() > 0) {
                $error = "Transaction ID '$trx_id_raw' has already been used!";
            }
        }

        if (!isset($error) && !empty($ids)) {
            // Group reseller caching helpers
            $reseller_pricing_cache = [];
            $get_reseller_buy_price = function($pdo, $reseller_id, $svc_id, $default_buying_price) use (&$reseller_pricing_cache) {
                if (!isset($reseller_pricing_cache[$reseller_id])) {
                    $pricing = [];
                    $stmt = $pdo->prepare("SELECT service_id, custom_price FROM " . TBL_PRICING . " WHERE staff_id=?");
                    $stmt->execute([$reseller_id]);
                    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                        $pricing[$row['service_id']] = floatval($row['custom_price']);
                    }
                    $reseller_pricing_cache[$reseller_id] = $pricing;
                }
                return isset($reseller_pricing_cache[$reseller_id][$svc_id]) ? $reseller_pricing_cache[$reseller_id][$svc_id] : floatval($default_buying_price);
            };

            $reseller_wallet_cache = [];
            $get_wallet_details = function($pdo, $reseller_id) use (&$reseller_wallet_cache) {
                if (!isset($reseller_wallet_cache[$reseller_id])) {
                    $wallet_owner_id = $reseller_id;
                    $is_system_authority = false;
                    $stmt = $pdo->prepare("SELECT id, role, parent_id, balance, advance_balance_limit FROM ".TBL_STAFF." WHERE id=?");
                    $stmt->execute([$reseller_id]);
                    $row = $stmt->fetch();
                    if ($row) {
                        $role = trim($row['role']);
                        $is_partner = isPartnerWalletRole($role);
                        if (!$is_partner && $row['parent_id'] > 0) {
                            $p_stmt = $pdo->prepare("SELECT id, role, parent_id, balance, advance_balance_limit FROM ".TBL_STAFF." WHERE id=?");
                            $p_stmt->execute([$row['parent_id']]);
                            $p_row = $p_stmt->fetch();
                            if ($p_row) {
                                $wallet_owner_id = $p_row['id'];
                                $row = $p_row;
                            }
                        } elseif (!$is_partner && (int)$row['parent_id'] <= 0) {
                            // Admin-created Office Staff use the system authority
                            // (infinite Admin wallet), matching deductWallet() and
                            // the working single-client recharge flow.
                            $is_system_authority = true;
                        }
                    }
                    $reseller_wallet_cache[$reseller_id] = [
                        'wallet_owner_id' => $wallet_owner_id,
                        'role' => $row['role'] ?? '',
                        'balance' => floatval($row['balance'] ?? 0),
                        'advance_balance_limit' => floatval($row['advance_balance_limit'] ?? 0),
                        'is_system_authority' => $is_system_authority
                    ];
                }
                return $reseller_wallet_cache[$reseller_id];
            };

            // Cache SMS settings per charger ID to eliminate DB query per user
            $sms_settings_cache = [];
            $get_charger_sms_config = function($pdo, $charger_id) use (&$sms_settings_cache) {
                if (!isset($sms_settings_cache[$charger_id])) {
                    $pay_tpl = get_sms_setting($pdo, $charger_id, 'sms_tpl_payment') ?: "Dear [NAME], we have received [AMOUNT]৳ for ID [ID].";
                    $enabled = get_sms_setting($pdo, $charger_id, 'sms_enabled_payment') == '1';
                    $sms_settings_cache[$charger_id] = [
                        'template' => $pay_tpl,
                        'enabled' => $enabled
                    ];
                }
                return $sms_settings_cache[$charger_id];
            };

            $total_cost_per_wallet = [];
            $wallet_deduction_exempt = [];
            $queued_sms_ids = []; // Track payment SMS rows created by this bulk recharge.
            
            // Get services map
            $services_map = [];
            $s_stmt = $pdo->query("SELECT * FROM " . TBL_SERVICES);
            while ($row = $s_stmt->fetch(PDO::FETCH_ASSOC)) {
                $services_map[trim($row['name'])] = $row;
            }
            
            // Fetch all users in a single query (chunked if > 2000 to prevent PDO parameter limit)
            $users = [];
            $chunk_ids = array_chunk($ids, 2000);
            foreach ($chunk_ids as $c_ids) {
                $placeholders = implode(',', array_map('intval', $c_ids));
                if (!empty($placeholders)) {
                    $u_rows = $pdo->query("SELECT * FROM " . TBL_USERS . " WHERE id IN ($placeholders)")->fetchAll(PDO::FETCH_ASSOC);
                    $users = array_merge($users, $u_rows);
                }
            }
            
            // Fetch cooldown info in single query
            $cooldown_users = [];
            foreach ($chunk_ids as $c_ids) {
                $placeholders = implode(',', array_map('intval', $c_ids));
                if (!empty($placeholders)) {
                    $cd_stmt = $pdo->query("SELECT target_id FROM " . TBL_LOGS . " WHERE action_type='Recharge' AND timestamp >= DATE_SUB(NOW(), INTERVAL 2 MINUTE) AND target_id IN ($placeholders)");
                    while ($row = $cd_stmt->fetch(PDO::FETCH_ASSOC)) {
                        $cooldown_users[$row['target_id']] = true;
                    }
                }
            }
            
            // Prepare reusable SQL statements once for high execution speed
            $stmt_update_user = $pdo->prepare("UPDATE ".TBL_USERS." SET current_bill_date=?, status='Active', bill_position='Active', credit_taken=0, credit_days=0, promise_enabled=0, promise_date=NULL, needs_sync=1 WHERE id=?");
            $stmt_update_due = $pdo->prepare("UPDATE ".TBL_USERS." SET due = due + ? WHERE id=?");
            $stmt_set_due = $pdo->prepare("UPDATE ".TBL_USERS." SET due = ? WHERE id=?");

            // Start transaction
            $pdo->beginTransaction();
            try {
                $today_str = date('Y-m-d');
                foreach($users as $u) {
                    if (isset($cooldown_users[$u['id']])) {
                        $record_bulk_failure('Recently recharged; wait 2 minutes');
                        continue;
                    }
                    
                    $pkg_name = trim($u['user_package']);
                    $svc = $services_map[$pkg_name] ?? null;
                    if($svc) {
                        // Resolve charger ID for this specific user
                        $charger_id = $user;
                        $charger_is_admin = hasRole('Admin');
                        if ($charger_is_admin && isset($u['manager_id']) && $u['manager_id'] > 0) {
                            $mgr = safeFetch($pdo, "SELECT role FROM ".TBL_STAFF." WHERE id=?", [$u['manager_id']]);
                            if ($mgr && !in_array(strtolower(trim($mgr['role'])), ['admin', 'super admin'])) {
                                $charger_id = intval($u['manager_id']);
                                $charger_is_admin = false;
                            }
                        }
                        
                        $wallet = $get_wallet_details($pdo, $charger_id);
                        $wallet_owner_id = $wallet['wallet_owner_id'];
                        $is_admin_owner = (strcasecmp($wallet['role'], 'Admin') === 0 || strcasecmp($wallet['role'], 'Super Admin') === 0 || !empty($wallet['is_system_authority']));
                        $charger_is_admin = $charger_is_admin || !empty($wallet['is_system_authority']);
                        $wallet_deduction_exempt[$wallet_owner_id] = $is_admin_owner;
                        
                        if ($charger_is_admin) {
                            $monthly_cost = floatval($svc['buying_price']);
                        } else {
                            $monthly_cost = $get_reseller_buy_price($pdo, $charger_id, $svc['id'], $svc['buying_price']);
                        }
                        
                        $cost = round(($monthly_cost / 30) * $r_days, 2);
                        $monthly_admin_cost = floatval($svc['buying_price']);
                        $admin_cost = round(($monthly_admin_cost / 30) * $r_days, 2);
                        $base_bill_amount = floatval($u['bill_amount']);
                        if ($base_bill_amount <= 0) $base_bill_amount = floatval($svc['price']);
                        $income = round(($base_bill_amount / 30) * $r_days, 2); // Gross recharge value
                        $discount_amount = 0.0;
                        if ($discount_mode_enabled && $pay_method !== 'Expire') {
                            $discount_amount = round(max(0, floatval($bulk_discounts[$u['id']] ?? 0)), 2);
                            $discount_amount = min($discount_amount, $income);
                        }
                        $net_payment = max(0, round($income - $discount_amount, 2));

                        // Due is settled from actual customer payment; discount does not reduce purchased validity.
                        $due_before = max(0, floatval($u['due'] ?? 0));
                        $due_deducted = $deduct_due_requested ? min($due_before, $net_payment) : 0;
                        $cash_recharge_after_due = max(0, round($net_payment - $due_deducted, 2));
                        $recharge_income_after_due = max(0, round($income - $due_deducted, 2));
                        $recharge_ratio = ($income > 0) ? ($recharge_income_after_due / $income) : 1;
                        $cost = round($cost * $recharge_ratio, 2);
                        $admin_cost = round($admin_cost * $recharge_ratio, 2);
                        
                        // Check balance
                        if (!isset($total_cost_per_wallet[$wallet_owner_id])) {
                            $total_cost_per_wallet[$wallet_owner_id] = 0;
                        }
                        $accumulated_cost = $total_cost_per_wallet[$wallet_owner_id];
                        if (!$is_admin_owner && ($wallet['balance'] + $wallet['advance_balance_limit'] - $accumulated_cost) < $cost) {
                            $record_bulk_failure('Insufficient wallet balance');
                            continue;
                        }
                        
                        $total_cost_per_wallet[$wallet_owner_id] += $cost;
                        $deduct_days = (($u['credit_taken'] == 1) ? $u['credit_days'] : 0);
                        
                        // PROMISE DATE ADJUSTMENT
                        $extra_used_days = 0;
                        $promise_due = 0;
                        $promise_adjustment_log = "";
                        if (isset($u['promise_enabled']) && $u['promise_enabled'] == 1 && !empty($u['promise_date'])) {
                            $expire_date = $u['current_bill_date'];
                            if ($today_str > $expire_date) {
                                $end_use_date = ($today_str < $u['promise_date']) ? $today_str : $u['promise_date'];
                                $diff = strtotime($end_use_date) - strtotime($expire_date);
                                $extra_used_days = max(0, round($diff / 86400));
                                if ($extra_used_days > 0) {
                                    $daily_rate = floatval($u['bill_amount']) / 30;
                                    $promise_due = round($extra_used_days * $daily_rate, 2);
                                }
                            }
                        }

                        // Calculate remaining recharge amount and days after optional old-due settlement.
                        $remaining_income = $recharge_income_after_due - $promise_due;
                        if ($remaining_income < 0) {
                            $remaining_income = 0;
                        }
                        
                        if ($income > 0) {
                            $recharge_days_equivalent = round(($remaining_income / $income) * $r_days);
                        } else {
                            $recharge_days_equivalent = $r_days;
                        }
                        
                        $actual_days_to_add = $recharge_days_equivalent - $deduct_days;
                        if ($actual_days_to_add < 0) {
                            $actual_days_to_add = 0;
                        }
                        
                        if ($promise_due > 0) {
                            $promise_adjustment_log = " | Promise Adjustment: Deducted ৳{$promise_due} for {$extra_used_days} days";
                        }
                        
                        if ($due_deducted > 0) {
                            $stmt_set_due->execute([max(0, $due_before - $due_deducted), $u['id']]);
                        }

                        $base_date = ($u['current_bill_date'] > $today_str) ? $u['current_bill_date'] : $today_str;
                        $newDate = $u['current_bill_date'];
                        if ($actual_days_to_add > 0) {
                            $newDate = date('Y-m-d', strtotime($base_date . " + $actual_days_to_add days"));
                            // Activate/sync only if payment still contains a new recharge portion.
                            $stmt_update_user->execute([$newDate, $u['id']]);
                        }
                        $processed++;
 
                        // Finance & Logs
                        log_tx($pdo, $wallet_owner_id, 'Expense', $cost, "Bulk Cost: {$u['user_id']}", 'System', $charger_id, $admin_cost);
                        
                        if ($charger_is_admin) {
                            log_finance($pdo, 'Expense', -$cost, 'System', 'Cost of Bandwidth', $u['id'], "Bulk Cost for {$u['user_id']}");
                        } else {
                            log_profit($pdo, $charger_id, $u['id'], $u['user_id'], $cash_recharge_after_due, $cost, 'Bulk Recharge');
                        }
 
                        if ($pay_method !== 'Expire') {
                            if ($due_deducted > 0) {
                                log_tx($pdo, $wallet_owner_id, 'Income', $due_deducted, "Due Payment Received: {$u['user_id']}" . $trx_id, $pay_method, $charger_id);
                                if ($charger_is_admin) log_finance($pdo, 'Income', $due_deducted, $pay_method, 'Due Collection', $u['id'], "Bulk due payment from {$u['user_id']}" . $trx_id);
                                writeLog($pdo, $_SESSION['admin_username'], 'Pay Due', $u['id'], "Bulk auto-deducted due: ৳{$due_deducted} from recharge payment for {$u['user_id']} via {$pay_method}" . $trx_id);
                            }
                            if ($cash_recharge_after_due > 0) {
                                $discount_tx_note = $discount_amount > 0 ? " | Discount: ৳{$discount_amount} | Gross: ৳{$income}" : '';
                                log_tx($pdo, $wallet_owner_id, 'Income', $cash_recharge_after_due, "Bulk Collection: {$u['user_id']}" . $trx_id . $discount_tx_note, $pay_method, $charger_id);
                                if ($charger_is_admin) log_finance($pdo, 'Income', $cash_recharge_after_due, $pay_method, 'Bulk Recharge', $u['id'], "Bulk Collection from {$u['user_id']}" . $trx_id . $discount_tx_note);
                            }
                            
                            // SMS shows actual amount received after discount.
                            $sms_cfg = $get_charger_sms_config($pdo, $charger_id);
                            if ($sms_cfg['enabled']) {
                                $msg_to_send = str_replace(['[NAME]', '[ID]', '[AMOUNT]'], [$u['name'], $u['user_id'], $net_payment], $sms_cfg['template']);
                                $queued_sms_id = queueSMS($pdo, $u['phone'], $msg_to_send, $charger_id);
                                if ($queued_sms_id > 0) {
                                    $queued_sms_ids[] = $queued_sms_id;
                                }
                            }
                        } else {
                            $stmt_update_due->execute([$income, $u['id']]);
                            log_tx($pdo, $wallet_owner_id, 'Income', $income, "Bulk Due: {$u['user_id']}", 'Expire', $charger_id);
                        }
                        if ($recharge_income_after_due > 0 && $actual_days_to_add > 0) {
                            $due_note = $due_deducted > 0 ? " | Due Deducted: ৳{$due_deducted} | Recharge Value: ৳{$recharge_income_after_due}" : '';
                            $discount_note = $discount_amount > 0 ? " | Gross: ৳{$income} | Discount: ৳{$discount_amount} | Paid: ৳{$cash_recharge_after_due}" : '';
                            writeLog($pdo, $_SESSION['admin_username'], 'Recharge', $u['id'], "Bulk Recharged client: {$u['user_id']} for {$actual_days_to_add} days - Amount: ৳{$cash_recharge_after_due}" . $trx_id . $promise_adjustment_log . $due_note . $discount_note);
                            if ($discount_amount > 0) {
                                writeLog($pdo, $_SESSION['admin_username'], 'Recharge Discount', $u['id'], "Bulk recharge discount: ৳{$discount_amount} | Gross: ৳{$income} | Net Paid: ৳{$net_payment} for {$u['user_id']}");
                            }
                        }
                    } else { $record_bulk_failure('Package/service not found'); }
                }
                
                // Deduct reseller balances in single updates
                foreach ($total_cost_per_wallet as $w_id => $t_cost) {
                    $w_stmt = $pdo->prepare("SELECT role FROM ".TBL_STAFF." WHERE id=?");
                    $w_stmt->execute([$w_id]);
                    $w_role = trim($w_stmt->fetchColumn() ?: '');
                    $w_is_admin = (strcasecmp($w_role, 'Admin') === 0 || strcasecmp($w_role, 'Super Admin') === 0);
                    
                    if (!$w_is_admin && empty($wallet_deduction_exempt[$w_id]) && $t_cost > 0) {
                        $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance - ? WHERE id=?")->execute([$t_cost, $w_id]);
                    }
                }
                
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("Bulk Recharge database transaction failed: " . $e->getMessage());
                // Every mutation inside this transaction was rolled back, even
                // rows counted as processed before the exception occurred.
                $processed = 0;
                $failed = count($users);
                $failure_reasons = ['Database transaction failed' => count($users)];
                $queued_sms_ids = []; // Transaction rollback removed the queued rows too.
            }

            // Reliability fix for small payment batches: flush the exact queued rows after COMMIT.
            // This avoids tenant-specific Pending rows when shell_exec/loopback HTTP is restricted.
            // Large batches remain asynchronous so the web request does not block for hundreds of API calls.
            if (!empty($queued_sms_ids) && count($queued_sms_ids) <= 25) {
                foreach ($queued_sms_ids as $queued_sms_id) {
                    try {
                        $q_stmt = $pdo->prepare("SELECT id, staff_id, phone, message, status FROM " . TBL_SMS_LOGS . " WHERE id=? LIMIT 1");
                        $q_stmt->execute([$queued_sms_id]);
                        $q_sms = $q_stmt->fetch(PDO::FETCH_ASSOC);
                        if ($q_sms && $q_sms['status'] === 'Pending') {
                            sendSMS($pdo, $q_sms['phone'], $q_sms['message'], (int)$q_sms['staff_id'], (int)$q_sms['id']);
                        }
                    } catch (Exception $sms_ex) {
                        error_log("Inline payment SMS flush failed for queue #{$queued_sms_id}: " . $sms_ex->getMessage());
                    }
                }
            }
            
            // Trigger background scripts immediately to process any remaining/stale SMS queue and MikroTik sync without blocking the user
            $tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : '';
            $tenant_param = !empty($tenant) ? " --tenant=" . escapeshellarg($tenant) : " --tenant=main";
            $base_dir = __DIR__ . '/..';
            $sms_runner = $base_dir . '/cron/process_sms_queue.php';
            $mt_runner = $base_dir . '/cron/process_mikrotik_sync.php';
            $php_cli = defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : 'php';
            
            $triggered = false;
            
            // 1. Try CLI invocation (if allowed by server PHP configuration)
            if (substr(php_uname(), 0, 7) == "Windows") {
                if (function_exists('popen') && function_exists('pclose')) {
                    try {
                        if (file_exists($sms_runner)) {
                            @pclose(popen("start /B " . escapeshellarg($php_cli) . " " . escapeshellarg($sms_runner) . $tenant_param, "r"));
                        }
                        if (file_exists($mt_runner)) {
                            @pclose(popen("start /B " . escapeshellarg($php_cli) . " " . escapeshellarg($mt_runner) . $tenant_param, "r"));
                        }
                        $triggered = true;
                    } catch (Exception $ex) {}
                }
            } else {
                if (function_exists('shell_exec')) {
                    try {
                        if (file_exists($sms_runner)) {
                            @shell_exec(escapeshellarg($php_cli) . " " . escapeshellarg($sms_runner) . $tenant_param . " > /dev/null 2>&1 &");
                        }
                        if (file_exists($mt_runner)) {
                            @shell_exec(escapeshellarg($php_cli) . " " . escapeshellarg($mt_runner) . $tenant_param . " > /dev/null 2>&1 &");
                        }
                        $triggered = true;
                    } catch (Exception $ex) {}
                }
            }
            
            // 2. HTTP trigger fallback (sends non-blocking request to the server itself)
            if (isset($_SERVER['HTTP_HOST'])) {
                $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || ($_SERVER['SERVER_PORT'] ?? '') == 443) ? "https://" : "http://";
                $host = $_SERVER['HTTP_HOST'];
                $tenant_query = !empty($tenant) ? "?tenant=" . urlencode($tenant) : "";
                
                $sms_url = $protocol . $host . "/cron/process_sms_queue.php" . $tenant_query;
                $mt_url = $protocol . $host . "/cron/process_mikrotik_sync.php" . $tenant_query;
                
                if (function_exists('curl_init')) {
                    $ch_sms = curl_init();
                    curl_setopt($ch_sms, CURLOPT_URL, $sms_url);
                    curl_setopt($ch_sms, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch_sms, CURLOPT_CONNECTTIMEOUT_MS, 800);
                    curl_setopt($ch_sms, CURLOPT_TIMEOUT_MS, 1500);
                    curl_setopt($ch_sms, CURLOPT_NOSIGNAL, 1);
                    @curl_exec($ch_sms);
                    curl_close($ch_sms);
                    
                    $ch_mt = curl_init();
                    curl_setopt($ch_mt, CURLOPT_URL, $mt_url);
                    curl_setopt($ch_mt, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch_mt, CURLOPT_TIMEOUT_MS, 300);
                    curl_setopt($ch_mt, CURLOPT_NOSIGNAL, 1);
                    @curl_exec($ch_mt);
                    curl_close($ch_mt);
                } else {
                    $parts_sms = parse_url($sms_url);
                    $parts_mt = parse_url($mt_url);
                    
                    $sms_socket_host = ($protocol === 'https://' ? 'ssl://' : '') . $parts_sms['host'];
                    $fp_sms = @fsockopen($sms_socket_host, $parts_sms['port'] ?? ($protocol === 'https://' ? 443 : 80), $errno, $errstr, 1);
                    if ($fp_sms) {
                        $sms_query = isset($parts_sms['query']) && $parts_sms['query'] !== '' ? '?' . $parts_sms['query'] : '';
                        $out = "GET " . ($parts_sms['path'] ?? '/cron/process_sms_queue.php') . $sms_query . " HTTP/1.1\r\n";
                        $out .= "Host: " . $parts_sms['host'] . "\r\n";
                        $out .= "Connection: Close\r\n\r\n";
                        fwrite($fp_sms, $out);
                        fclose($fp_sms);
                    }
                    
                    $mt_socket_host = ($protocol === 'https://' ? 'ssl://' : '') . $parts_mt['host'];
                    $fp_mt = @fsockopen($mt_socket_host, $parts_mt['port'] ?? ($protocol === 'https://' ? 443 : 80), $errno, $errstr, 1);
                    if ($fp_mt) {
                        $mt_query = isset($parts_mt['query']) && $parts_mt['query'] !== '' ? '?' . $parts_mt['query'] : '';
                        $out = "GET " . ($parts_mt['path'] ?? '/cron/process_mikrotik_sync.php') . $mt_query . " HTTP/1.1\r\n";
                        $out .= "Host: " . $parts_mt['host'] . "\r\n";
                        $out .= "Connection: Close\r\n\r\n";
                        fwrite($fp_mt, $out);
                        fclose($fp_mt);
                    }
                }
            }
            
            writeLog($pdo, $_SESSION['admin_username'], 'Bulk Recharge', 0, "Bulk recharged $processed clients for $r_days days");
            $msg = "Bulk Recharge ($r_days days): $processed success";
            if($failed > 0) $msg .= ", $failed failed";
        }
        
        // Return JSON response if requested via AJAX
        if (isset($_POST['is_ajax']) && $_POST['is_ajax'] == '1') {
            header('Content-Type: application/json');
            if (isset($error)) {
                echo json_encode(['success' => false, 'error' => $error]);
            } else {
                echo json_encode([
                    'success' => true,
                    'processed' => $processed ?? 0,
                    'failed' => $failed ?? 0,
                    'failure_reasons' => $failure_reasons ?? [],
                    'msg' => $msg ?? 'Bulk operation finished.'
                ]);
            }
            exit;
        }
    }

   if (isset($_POST['bulk_extend']) && hasRole('SubReseller')) {
       $ids = $_POST['bulk_ids'] ?? [];
       $days = (int)$_POST['bulk_days'];
       $processed = 0;
       if($days > 0 && $days <= 10) {
           $reseller = safeFetch($pdo, "SELECT balance, advance_balance_limit FROM ".TBL_STAFF." WHERE id=?", [$user]);
           $available_balance = ($reseller['balance'] ?? 0) + ($reseller['advance_balance_limit'] ?? 0);
           
           if ($available_balance <= 0) {
               $error = "Insufficient Wallet Balance / Advance Limit for bulk extension.";
           } else {
               foreach($ids as $id) {
                   $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=".intval($id));
                   if($u && !$u['credit_taken']) {
                         $new_bill_date = (new DateTime($u['current_bill_date'] < date('Y-m-d') ? date('Y-m-d') : $u['current_bill_date']))->modify("+{$days} days")->format('Y-m-d');
                     $pdo->prepare("UPDATE ".TBL_USERS." SET current_bill_date=?, status='Active', bill_position='Active', credit_taken=1, credit_days=? WHERE id=?")->execute([$new_bill_date, $days, $id]);
                     
                     if($u['router_id']) {
                         $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id={$u['router_id']}");
                         if($r) { 
                             try {
                                 $mk = new MikrotikApp($r); 
                                 $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name='{$u['user_package']}'");
                                 if($svc) {
                                     try {
                                         $mk->toggle($u['user_id'], true, $svc['mikrotik_profile_name'], $u['password']);
                                     } catch (\Exception $e) {
                                         writeLog($pdo, $_SESSION['admin_username'], 'Router Error', $u['id'], "Mikrotik error during Extend: " . $e->getMessage());
                                     }
                                 }
                             } catch (\Exception $e) {
                                 writeLog($pdo, $_SESSION['admin_username'], 'Router Error', $u['id'], "Mikrotik error during Extend: " . $e->getMessage());
                             }
                         }
                     }
                     log_tx($pdo, $user, 'Transfer', 0.00, "Bulk Credit Extended: {$u['user_id']} ($days days)", 'System');

                    // --- LOAN SMS ---
                    $loan_tpl = get_sms_setting($pdo, $user, 'sms_tpl_loan');
                    if (!$loan_tpl) $loan_tpl = "Dear [NAME], [DAYS] days credit added ID [ID].";
                    $msg_to_send = str_replace(['[NAME]', '[ID]', '[DAYS]'], [$u['name'], $u['user_id'], $days], $loan_tpl);
                    if (get_sms_setting($pdo, $user, 'sms_enabled_loan') == '1') {
                        sendSMS($pdo, $u['phone'], $msg_to_send, $user);
                    }
                     $processed++;
                   }
               }
               writeLog($pdo, $_SESSION['admin_username'], 'Bulk Extend', 0, "Bulk extended $processed clients by $days days");
               $msg = "Bulk Extended $processed clients.";
           }
       } else {
           $error = "Invalid days (1-10) for bulk extension.";
       }
   }

    // --- BULK DISABLE ---
    if (isset($_POST['bulk_disable']) && hasRole('SubReseller')) {
        $ids = $_POST['bulk_ids'] ?? [];
        $count = 0;
        foreach($ids as $id) {
            $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [intval($id)]);
            if ($u) {
                if ($u['status'] !== 'Inactive') { pause_client_days($pdo, $u['id']); }
                $pdo->prepare("UPDATE ".TBL_USERS." SET status='Inactive', bill_position='Inactive' WHERE id=?")->execute([$u['id']]);
                if ($u['router_id'] > 0) {
                    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
                    if ($r) {
                        $mk = new MikrotikApp($r);
                        $mk->toggle($u['user_id'], false, '');
                    }
                }
                writeLog($pdo, $_SESSION['admin_username'], 'Bulk Disable', $u['id'], "Disabled client {$u['user_id']} via bulk action.");
                $count++;
            }
        }
        $msg = "Bulk Disable: $count clients processed.";
    }

    // --- BULK ENABLE ---
    if (isset($_POST['bulk_enable']) && hasRole('SubReseller')) {
        $ids = $_POST['bulk_ids'] ?? [];
        $count = 0;
        foreach($ids as $id) {
            $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [intval($id)]);
            if ($u) {
                $pdo->prepare("UPDATE ".TBL_USERS." SET status='Active', bill_position='Active' WHERE id=?")->execute([$u['id']]);
                if ($u['status'] !== 'Active') { resume_client_days($pdo, $u['id']); }
                if ($u['router_id'] > 0) {
                    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
                    if ($r) {
                        $mk = new MikrotikApp($r);
                        $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
                        $profile = $svc ? $svc['mikrotik_profile_name'] : '';
                        $mk->toggle($u['user_id'], true, $profile, $u['password']);
                    }
                }
                writeLog($pdo, $_SESSION['admin_username'], 'Bulk Enable', $u['id'], "Enabled client {$u['user_id']} via bulk action.");
                $count++;
            }
        }
        $msg = "Bulk Enable: $count clients processed.";
    }

    // --- BULK LEFT ---
    if (isset($_POST['bulk_left']) && hasRole('SubReseller')) {
        $ids = $_POST['bulk_ids'] ?? [];
        $count = 0;
        $total_refunded = 0;
        foreach($ids as $id) {
            $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [intval($id)]);
            if ($u && $u['status'] !== 'Left') {
                $refund_amount = 0;

                // Calculate Refund for remaining days (guard against null/invalid date)
                $bill_date_str = $u['current_bill_date'] ?? '';
                if (!empty($bill_date_str) && $bill_date_str !== '0000-00-00') {
                    $today  = new DateTime(date('Y-m-d'));
                    $expiry = new DateTime($bill_date_str);

                    // rem_days > 0 only when expiry is in the future
                    if ($expiry > $today) {
                        $diff     = $today->diff($expiry);
                        $rem_days = $diff->days;

                        $pkg_name = trim($u['user_package']);
                        $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name=?", [$pkg_name]);
                        if ($svc && $rem_days > 0) {
                            $monthly_cost  = getBuyPrice($pdo, $u['manager_id'], $svc['id']);
                            $daily_cost    = $monthly_cost / 30;
                            $refund_amount = round($daily_cost * $rem_days, 2);
                        }
                    }
                }

                if ($refund_amount > 0) {
                    // Refund to Reseller Wallet
                    $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance + ? WHERE id=?")->execute([$refund_amount, $u['manager_id']]);
                    log_tx($pdo, $u['manager_id'], 'Income', $refund_amount, "Refund (Bulk Left): {$u['user_id']} ($rem_days days)", 'System', $user);
                    writeLog($pdo, $_SESSION['admin_username'], 'Refund', $u['id'], "Bulk Left Refund: ৳$refund_amount → Reseller #{$u['manager_id']} for client {$u['user_id']}");
                    $total_refunded += $refund_amount;
                }

                // Mark as Left and reset bill date to today
                $pdo->prepare("UPDATE ".TBL_USERS." SET status='Left', bill_position='Left', current_bill_date=? WHERE id=?")->execute([date('Y-m-d'), $u['id']]);

                if ($u['router_id'] > 0) {
                    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
                    if ($r) {
                        try {
                            $mk = new MikrotikApp($r);
                            $mk->toggle($u['user_id'], false, '');
                        } catch (\Exception $e) {
                            writeLog($pdo, $_SESSION['admin_username'], 'Router Error', $u['id'], "Mikrotik error during Bulk Left: " . $e->getMessage());
                        }
                    }
                }
                writeLog($pdo, $_SESSION['admin_username'], 'Bulk Left', $u['id'], "Marked client {$u['user_id']} as Left via bulk action. Refund: ৳$refund_amount");
                $count++;
            }
        }
        $msg = "Bulk Left: $count clients processed." . ($total_refunded > 0 ? " ৳$total_refunded refunded to wallets." : " No refund (no remaining days).");
    }

    // --- BULK DELETE ---
    if (isset($_POST['bulk_delete']) && (hasRole('Admin') || isOffice() || hasRole('Reseller') || hasRole('SubReseller'))) {
        $ids = $_POST['bulk_ids'] ?? [];
        $count = 0;
        $managed_ids = (!hasRole('Admin') && !isOffice()) ? getManagedStaffIds($pdo, $user, $role) : [];
        
        foreach($ids as $id) {
            $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [intval($id)]);
            if ($u) {
                // Security Check: Non-admins can only delete their own managed clients
                if (!hasRole('Admin') && !isOffice()) {
                    if (!in_array($u['manager_id'], $managed_ids)) continue;
                }

                if ($u['router_id'] > 0) {
                    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$u['router_id']]);
                    if ($r) {
                        $mk = new MikrotikApp($r);
                        $mk->removePppoe($u['user_id']);
                    }
                }
                $pdo->prepare("DELETE FROM ".TBL_USERS." WHERE id=?")->execute([$u['id']]);
                writeLog($pdo, $_SESSION['admin_username'], 'Bulk Delete', $u['id'], "Permanently deleted client {$u['user_id']} ({$u['name']}) via bulk action.");
                $count++;
            }
        }
        $msg = "Bulk Permanent Delete: $count clients removed from system.";
    }

    if (isset($_POST['bulk_send_sms'])) {
        $ids = $_POST['bulk_ids'] ?? [];
        $message_tpl = $_POST['bulk_sms_message'];
        $processed = 0;
        
        if (!empty($ids) && !empty($message_tpl)) {
            foreach ($ids as $id) {
                $u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [intval($id)]);
                if ($u && !empty($u['phone'])) {
                    $msg_to_send = str_replace(
                        ['[NAME]', '[ID]', '[DATE]'],
                        [$u['name'], $u['user_id'], $u['current_bill_date'] ?? 'N/A'],
                        $message_tpl
                    );
                    if (sendSMS($pdo, $u['phone'], $msg_to_send, $user)) {
                        $processed++;
                    }
                }
            }
            writeLog($pdo, $_SESSION['admin_username'], 'Bulk SMS', 0, "Sent bulk SMS to $processed clients.");
            $msg = "Bulk SMS sent successfully to $processed clients.";
        } else {
            $error = "Please select clients and enter a message.";
        }
    }

   if (isset($_POST['add_expense']) && (hasRole('Admin') || isOffice())) {
       $category = $_POST['category'];
       $amount = floatval($_POST['amount']);
       $date = $_POST['date'] ?? date('Y-m-d');
       $method = $_POST['method'] ?? 'Cash';
       $desc = $_POST['description'] ?? '';

       if ($amount > 0) {
           if (hasRole('Admin')) {
               $pdo->prepare("INSERT INTO ".TBL_FIN_EXPENSES." (category, amount, method, description, staff_id, date) VALUES (?,?,?,?,?,?)")
                   ->execute([$category, $amount, $method, $desc, $user, $date]);
               log_finance($pdo, 'Expense', -$amount, $method, $category, 0, $desc);
               writeLog($pdo, $_SESSION['admin_username'], 'Add Expense', 0, "Recorded expense: $category ($amount)");
               $msg = "Expense recorded successfully.";
           } else {
               // v4.2 approval workflow: office staff cannot bypass approval from Finance.
               $pdo->prepare("INSERT INTO ".TBL_EXPENSE_REQUESTS." (requester_id, category, amount, expense_date, method, description, status) VALUES (?,?,?,?,?,?,'Pending')")
                   ->execute([$user, $category, $amount, $date, $method, $desc]);
               writeLog($pdo, $_SESSION['admin_username'], 'Expense Request', 0, "Submitted expense approval request: $category ($amount)");
               $msg = "Expense submitted for approval. It will be posted to Finance after approval.";
           }
       } else {
           $error = "Amount must be greater than zero.";
       }
   }

   if (isset($_POST['login_as']) && hasRole('Admin')) {
       $target_id = $_POST['staff_id'];
       $t = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$target_id]);
       if ($t) {
           $_SESSION['impersonator_id'] = $_SESSION['admin_id'];
           $_SESSION['admin_id'] = $t['id'];
           $_SESSION['admin_username'] = $t['username'];
           $_SESSION['user_role'] = $t['role'];
           $_SESSION['user_balance'] = $t['balance'];
           writeLog($pdo, $_SESSION['admin_username'], 'Impersonate Start', $target_id, "Admin logged in as {$t['username']}");
           header("Location: index.php"); exit;
       }
   }
}
// --- OLT AJAX HANDLERS (Migrated) ---

if (isset($_GET['ajax_olt_check'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    session_write_close();
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    $id = intval($_GET['id']);
    $deep = isset($_GET['deep']) && $_GET['deep'] == 1;
    $res = $oltMgr->checkConnection($id, $deep);
    header('Content-Type: application/json');
    echo json_encode($res);
    exit;
}

if (isset($_GET['ajax_olt_network_map'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    session_write_close();
    header('Content-Type: application/json');
    
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    $is_admin = hasRole('Admin');
    
    // Load client MAC mappings from database and cache for live / ONU MAC matching
    $usersByUserId = [];
    $macMap = [];
    
    $client_stmt = $pdo->query("SELECT id, user_id, name, onu_mac FROM users");
    while ($row = $client_stmt->fetch(PDO::FETCH_ASSOC)) {
        if (!empty($row['user_id'])) {
            $usersByUserId[strtolower(trim($row['user_id']))] = $row;
        }
        if (!empty($row['onu_mac'])) {
            $cleanMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $row['onu_mac']));
            if ($cleanMac) {
                $macMap[$cleanMac] = $row['id'];
            }
        }
    }

    // Map live MACs from active PPPoE sessions
    $cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../cache/global_online.json';
    if (file_exists($cache_file)) {
        $cache_raw = json_decode(@file_get_contents($cache_file), true);
        $online_users = isset($cache_raw['data']) ? $cache_raw['data'] : $cache_raw;
        if (is_array($online_users)) {
            foreach ($online_users as $username => $session) {
                $caller_id = $session['caller_id'] ?? '';
                if ($caller_id) {
                    $cleanLiveMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $caller_id));
                    if ($cleanLiveMac) {
                        $lowerUsername = strtolower(trim($username));
                        if (isset($usersByUserId[$lowerUsername])) {
                            $macMap[$cleanLiveMac] = $usersByUserId[$lowerUsername]['id'];
                        }
                    }
                }
            }
        }
    }

    // Map of client ID -> online status (true/false)
    $clientOnlineStatus = [];

    // Fetch OLTs
    $olts_raw = $oltMgr->getAllOLTs($is_admin ? null : $current_staff_id);
    $olts = [];
    foreach ($olts_raw as $olt) {
        $connected_client_ids = [];
        if (!empty($olt['onu_cache'])) {
            $cached = json_decode($olt['onu_cache'], true);
            if (is_array($cached)) {
                foreach ($cached as $onu) {
                    $onu_online = false;
                    if (isset($onu['status'])) {
                        $stat = strtolower($onu['status']);
                        if ($stat == 'active' || $stat == 'online' || $stat == 'up') {
                            $onu_online = true;
                        }
                    }
                    if (!empty($onu['mac'])) {
                        $cleanMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $onu['mac']));
                        if (isset($macMap[$cleanMac])) {
                            $cid = $macMap[$cleanMac];
                            $connected_client_ids[] = $cid;
                            if ($onu_online) {
                                $clientOnlineStatus[$cid] = true;
                            }
                        }
                    }
                    if (!empty($onu['mactable']) && is_array($onu['mactable'])) {
                        foreach ($onu['mactable'] as $mObj) {
                            $bridgedMac = $mObj['mac'] ?? '';
                            $cleanBridgedMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $bridgedMac));
                            if (isset($macMap[$cleanBridgedMac])) {
                                $cid = $macMap[$cleanBridgedMac];
                                $connected_client_ids[] = $cid;
                                if ($onu_online) {
                                    $clientOnlineStatus[$cid] = true;
                                }
                            }
                        }
                    }
                }
            }
        }
        $olts[] = [
            'id' => $olt['id'],
            'name' => $olt['name'],
            'latlong' => $olt['latlong'] ?? '',
            'client_ids' => array_values(array_unique($connected_client_ids))
        ];
    }
    
    // Fetch TJ Boxes
    $owner_id = (isOffice() && isset($_SESSION['parent_id']) && $_SESSION['parent_id'] > 0) ? $_SESSION['parent_id'] : $current_staff_id;
    if ($is_admin) {
        $tj_boxes = safeFetchAll($pdo, "SELECT t.*, z.name as zone_name FROM tj_boxes t LEFT JOIN zones z ON t.zone_id = z.id ORDER BY t.id DESC");
    } else {
        $tj_boxes = safeFetchAll($pdo, "SELECT t.*, z.name as zone_name FROM tj_boxes t LEFT JOIN zones z ON t.zone_id = z.id WHERE t.staff_id=? ORDER BY t.id DESC", [$owner_id]);
    }
    
    // Fetch Clients (Users)
    if ($is_admin) {
        $clients_raw = safeFetchAll($pdo, "SELECT id, name, user_id, lat_long, tj_box_name, onu_mac FROM users WHERE (lat_long IS NOT NULL AND lat_long != '') AND (tj_box_name IS NOT NULL AND tj_box_name != '')");
    } else {
        $clients_raw = safeFetchAll($pdo, "SELECT id, name, user_id, lat_long, tj_box_name, onu_mac FROM users WHERE manager_id = ? AND (lat_long IS NOT NULL AND lat_long != '') AND (tj_box_name IS NOT NULL AND tj_box_name != '')", [$owner_id]);
    }
    
    $clients = [];
    foreach ($clients_raw as $c) {
        $cleanMac = '';
        if (!empty($c['onu_mac'])) {
            $cleanMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $c['onu_mac']));
        }
        $clients[] = [
            'id' => $c['id'],
            'name' => $c['name'],
            'user_id' => $c['user_id'],
            'lat_long' => $c['lat_long'],
            'tj_box_name' => $c['tj_box_name'],
            'onu_mac_clean' => $cleanMac,
            'is_online' => isset($clientOnlineStatus[$c['id']]) && $clientOnlineStatus[$c['id']] === true
        ];
    }
    
    echo json_encode([
        'olts' => $olts,
        'tj_boxes' => $tj_boxes,
        'clients' => $clients
    ]);
    exit;
}

if (isset($_GET['ajax_olt_signal'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    header('Content-Type: application/json');
    $id = intval($_GET['id']);
    $interface = $_GET['interface'] ?? '';
    
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    
    // Check access
    $olt = $oltMgr->getOLT($id);
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    if (!$olt || (!hasRole('Admin') && $olt['staff_id'] != $current_staff_id)) {
        echo json_encode(['rx' => 'N/A', 'tx' => 'N/A', 'voltage' => 'N/A', 'temp' => 'N/A']);
        exit;
    }
    
    session_write_close();
    
    $onus = $oltMgr->getConnectedONUs($id); // Will load from cache instantly
    if (is_array($onus)) {
        foreach ($onus as $onu) {
            if ($onu['interface'] === $interface) {
                echo json_encode([
                    'rx' => $onu['rx_power'] ?? 'N/A',
                    'tx' => $onu['tx_power'] ?? 'N/A',
                    'voltage' => $onu['voltage'] ?? 'N/A',
                    'temp' => $onu['temp'] ?? 'N/A',
                    'uptime' => $onu['uptime'] ?? 'N/A'
                ]);
                exit;
            }
        }
    }
    echo json_encode(['rx' => 'N/A', 'tx' => 'N/A', 'voltage' => 'N/A', 'temp' => 'N/A']);
    exit;
}

if (isset($_GET['ajax_olt_mac_table'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    header('Content-Type: application/json');
    $id = intval($_GET['id']);
    $interface = $_GET['interface'] ?? '';
    
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    
    $olt = $oltMgr->getOLT($id);
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    if (!$olt || (!hasRole('Admin') && $olt['staff_id'] != $current_staff_id)) {
        echo json_encode([]);
        exit;
    }
    
    session_write_close();
    
    $onus = $oltMgr->getConnectedONUs($id);
    if (is_array($onus)) {
        foreach ($onus as $onu) {
            if ($onu['interface'] === $interface) {
                echo json_encode($onu['mactable'] ?? []);
                exit;
            }
        }
    }
    echo json_encode([]);
    exit;
}

if (isset($_GET['ajax_olt_logs']) && hasRole('Admin')) {
    header('Content-Type: text/plain');
    $log_path = __DIR__ . '/../debug_log.txt';
    if (file_exists($log_path)) {
        $lines = file($log_path);
        $last_lines = array_slice($lines, -100);
        echo implode("", $last_lines);
    } else {
        echo "No logs found.";
    }
    exit;
}

if (isset($_GET['ajax_find_onu_signal'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    header('Content-Type: application/json');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    $input_mac = $_GET['mac'] ?? '';
    $client_id = intval($_GET['client_id'] ?? 0);
    $clean_input_mac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $input_mac));

    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);

    $candidateMacs = [];
    if ($clean_input_mac !== '') $candidateMacs[$clean_input_mac] = 'request';
    $client = null;
    if ($client_id > 0) {
        try {
            $stmt = $pdo->prepare("SELECT id,user_id,onu_mac FROM users WHERE id=? LIMIT 1");
            $stmt->execute([$client_id]);
            $client = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($client && !empty($client['onu_mac'])) {
                $m = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', (string)$client['onu_mac']));
                if ($m !== '') $candidateMacs[$m] = 'saved_onu';
            }
        } catch (Throwable $ignore) {}
    }

    if ($client && !empty($client['user_id'])) {
        try {
            $cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../cache/global_online.json';
            if (is_file($cache_file)) {
                $raw = json_decode((string)file_get_contents($cache_file), true);
                $onlineUsers = isset($raw['data']) && is_array($raw['data']) ? $raw['data'] : $raw;
                if (is_array($onlineUsers)) {
                    $wantUser = strtolower(trim((string)$client['user_id']));
                    foreach ($onlineUsers as $username => $session) {
                        $fullUser = strtolower(trim((string)$username));
                        $baseUser = strtolower(trim(explode('@', (string)$username)[0]));
                        if ($fullUser !== $wantUser && $baseUser !== $wantUser) continue;
                        $caller = is_array($session) ? ($session['caller_id'] ?? '') : '';
                        $m = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', (string)$caller));
                        if ($m !== '') $candidateMacs[$m] = 'live_caller';
                    }
                }
            }
        } catch (Throwable $ignore) {}
    }

    if (!$candidateMacs) {
        echo json_encode(['error' => 'No usable client/ONU MAC is available yet.']);
        exit;
    }

    $best = null;
    $bestScore = -1;
    foreach ($oltMgr->getAllOLTs(null) as $olt) {
        $onus = $oltMgr->getConnectedONUs($olt['id'], false);
        if (!is_array($onus)) continue;
        foreach ($onus as $onu) {
            if (!is_array($onu) || !$oltMgr->isONUOnline($onu)) continue;

            $score = -1;
            $cleanOnuMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', (string)($onu['mac'] ?? '')));
            if ($cleanOnuMac !== '' && isset($candidateMacs[$cleanOnuMac])) $score = 100;

            if (!empty($onu['mactable']) && is_array($onu['mactable'])) {
                foreach ($onu['mactable'] as $mac_entry) {
                    $cleanEntryMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', (string)($mac_entry['mac'] ?? '')));
                    if ($cleanEntryMac === '' || !isset($candidateMacs[$cleanEntryMac])) continue;
                    $source = $candidateMacs[$cleanEntryMac];
                    $bridgeScore = ($source === 'live_caller') ? 95 : (($source === 'request') ? 90 : 85);
                    if ($bridgeScore > $score) $score = $bridgeScore;
                }
            }

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = ['olt' => $olt, 'onu' => $onu];
            }
        }
    }

    if ($best && $bestScore >= 0) {
        $olt = $best['olt'];
        $onu = $best['onu'];
        echo json_encode([
            'olt_id' => $olt['id'],
            'olt_name' => $olt['name'],
            'interface' => $onu['interface'] ?? 'N/A',
            'onu_mac' => $onu['mac'] ?? 'N/A',
            'rx_power' => $onu['rx_power'] ?? 'N/A',
            'tx_power' => $onu['tx_power'] ?? 'N/A',
            'temp' => $onu['temp'] ?? 'N/A',
            'voltage' => $onu['voltage'] ?? 'N/A',
            'uptime' => $onu['uptime'] ?? 'N/A',
            'status' => 'Online',
            'raw_status' => $onu['status'] ?? 'N/A',
            'distance' => $onu['distance'] ?? 'N/A',
            'vendor_id' => $onu['vendor_id'] ?? 'N/A',
            'last_register' => $onu['last_register'] ?? 'N/A',
            'last_deregister' => $onu['last_deregister'] ?? 'N/A',
            'deregister_reason' => $onu['deregister_reason'] ?? 'N/A'
        ]);
        exit;
    }

    echo json_encode(['error' => 'No online ONU is currently matched to this client.']);
    exit;
}

// Admin-only cleanup of stale OFFLINE ONU data from Sheba-Fi. This action
// never de-registers or deletes the ONU from the physical OLT.
if (isset($_POST['remove_offline_onu']) || isset($_POST['remove_all_offline_onus'])) {
    $id = intval($_POST['id'] ?? 0);
    if (!isset($_SESSION['admin_id']) || !hasRole('Admin')) {
        $_SESSION['flash_error'] = 'Admin access is required to remove offline ONU records.';
        header('Location: index.php?tab=olt_onus&id=' . $id);
        exit;
    }
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    $olt = $oltMgr->getOLT($id);
    if (!$olt) {
        $_SESSION['flash_error'] = 'OLT Not Found';
        header('Location: index.php?tab=olt');
        exit;
    }

    $res = isset($_POST['remove_all_offline_onus'])
        ? $oltMgr->removeAllOfflineONUsFromBilling($id)
        : $oltMgr->removeOfflineONUFromBilling($id, $_POST['interface'] ?? '', $_POST['onu_mac'] ?? '');

    if (!empty($res['status'])) $_SESSION['flash_msg'] = $res['message'] ?? 'Offline ONU record removed from billing.';
    else $_SESSION['flash_error'] = $res['message'] ?? 'Could not remove offline ONU record.';
    header('Location: index.php?tab=olt_onus&id=' . $id);
    exit;
}

if (isset($_POST['reboot_onu'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    $id = intval($_POST['id']);
    $interface = $_POST['interface'];
    
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    
    // Check access
    $olt = $oltMgr->getOLT($id);
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    $res = false;
    if ($olt && (hasRole('Admin') || $olt['staff_id'] == $current_staff_id || hasRole('Reseller') || hasRole('SubReseller') || isOffice())) {
        $res = $oltMgr->rebootONU($id, $interface);
        if ($res) {
            $msg = "ONU $interface Reboot command sent successfully.";
        } else {
            $error = "Failed to send Reboot command for ONU $interface.";
        }
    } else {
        $error = "Access Denied";
    }
    
    // Check if it's an AJAX request (e.g. from the client profile page)
    if (isset($_POST['ajax_action_flag']) || isset($_GET['ajax'])) {
        header('Content-Type: application/json');
        if ($res) {
            echo json_encode(['status' => true, 'message' => $msg]);
        } else {
            echo json_encode(['status' => false, 'message' => $error]);
        }
        exit;
    }
    
    $_SESSION['flash_msg'] = $msg ?? null;
    $_SESSION['flash_error'] = $error ?? null;
    header("Location: index.php?tab=olt_onus&id=" . $id);
    exit;
}

// Lightweight OLT sync status endpoint for the redesigned ONU page.
// Keeps the browser cache-only while allowing progress updates without a full
// page reload every few seconds.
if (isset($_GET['olt_sync_status'])) {
    if (!isset($_SESSION['admin_id'])) {
        if (ob_get_length()) @ob_clean();
        header('Content-Type: application/json');
        http_response_code(401);
        echo json_encode(['status' => false, 'message' => 'Authentication required']);
        exit;
    }
    $id = intval($_GET['id'] ?? 0);
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    $olt = $oltMgr->getOLT($id);
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    $allowed = $olt && (hasRole('Admin') || $olt['staff_id'] == $current_staff_id || hasRole('Reseller') || hasRole('SubReseller') || isOffice());
    if (!$allowed) {
        if (ob_get_length()) @ob_clean();
        header('Content-Type: application/json');
        http_response_code(403);
        echo json_encode(['status' => false, 'message' => 'Access Denied']);
        exit;
    }

    $recovery = $oltMgr->recoverStaleSyncState($id);
    $olt = $oltMgr->getOLT($id) ?: $olt;
    $queue = $oltMgr->getSyncQueueInfo($id);
    $state = strtolower((string)($olt['sync_state'] ?? 'idle'));
    $coreQueue = $queue['core'] ?? null;
    $pending = in_array($state, ['queued','syncing'], true)
        || (!empty($coreQueue) && $state !== 'error');

    if (ob_get_length()) @ob_clean();
    header('Content-Type: application/json');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode([
        'status' => true,
        'pending' => $pending,
        'sync_state' => $state,
        'sync_error' => (string)($olt['sync_error'] ?? ''),
        'last_sync' => $olt['last_sync'] ?? null,
        'last_sync_attempt' => $olt['last_sync_attempt'] ?? null,
        'queued_at' => is_array($coreQueue) ? ($coreQueue['queued_at'] ?? ($olt['sync_queued_at'] ?? null)) : ($olt['sync_queued_at'] ?? null),
        'worker_started_at' => is_array($coreQueue) ? ($coreQueue['worker_started_at'] ?? ($olt['sync_started_at'] ?? null)) : ($olt['sync_started_at'] ?? null),
        'queue_age_seconds' => is_array($coreQueue) ? intval($coreQueue['age_seconds'] ?? 0) : 0,
        'recovered' => !empty($recovery['recovered']),
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

if (isset($_POST['sync_olt_now'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    $id = intval($_POST['id'] ?? 0);
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    $olt = $oltMgr->getOLT($id);
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    $allowed = $olt && (hasRole('Admin') || $olt['staff_id'] == $current_staff_id || hasRole('Reseller') || hasRole('SubReseller') || isOffice());
    if ($allowed) {
        $q = $oltMgr->queueSync($id, true);
        if (!empty($q['queued'])) {
            $_SESSION['flash_msg'] = $q['message'] ?? 'OLT sync queued in background.';
        } else {
            $_SESSION['flash_error'] = $q['message'] ?? 'Could not queue OLT sync.';
        }
    } else {
        $_SESSION['flash_error'] = 'Access Denied';
    }
    header('Location: index.php?tab=olt_onus&id=' . $id);
    exit;
}

if (isset($_POST['run_command']) && hasRole('Admin')) {
    $id = intval($_POST['id']);
    $command = $_POST['command'] ?? '';
    
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    
    $res = $oltMgr->runCommand($id, $command);
    
    $_SESSION['terminal_output'] = $res;
    $_SESSION['terminal_command'] = $command;
    header("Location: index.php?tab=olt");
    exit;
}

// --- OLT MIKROTIK NAT APPLY ---
if (isset($_POST['apply_olt_nat'])) {
    if (!isset($_SESSION['admin_id']) || !hasRole('Admin')) {
        $error = "Only an Admin can modify MikroTik firewall/NAT rules.";
    } else {
        require_once __DIR__ . '/../classes/OLTManager.php';
        $oltMgr = new OLTManager($pdo);
        $id = intval($_POST['id'] ?? 0);
        $olt = $oltMgr->getOLT($id);

        if (!$olt || ($olt['connection_type'] ?? 'direct') !== 'mikrotik_nat') {
            $error = "This OLT is not configured for MikroTik NAT mode.";
        } elseif (empty($olt['mikrotik_router_id'])) {
            $error = "Select an existing MikroTik in the OLT Edit form before applying NAT rules.";
        } elseif (!filter_var($olt['nat_source_ip'] ?? '', FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $error = "Set the SG Server Public IPv4 in the OLT Edit form before applying NAT rules.";
        } elseif (!filter_var($olt['private_ip'] ?? '', FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $error = "Set a valid OLT Private IPv4 before applying NAT rules.";
        } else {
            $router = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id=?", [(int)$olt['mikrotik_router_id']]);
            if (!$router) {
                $error = "Selected MikroTik router was not found.";
            } else {
                try {
                    $mk = new MikrotikApp($router, 8);
                    $client = $mk->getClient();
                    if (!$client) {
                        throw new RuntimeException($mk->error ?: 'MikroTik API connection failed');
                    }

                    $removeCommented = function($path, $comment) use ($client) {
                        $rows = $client->query(new RouterOS\Query($path . '/print'))->read();
                        foreach ($rows as $row) {
                            if (($row['comment'] ?? '') === $comment && !empty($row['.id'])) {
                                $q = new RouterOS\Query($path . '/remove');
                                $q->equal('.id', $row['.id']);
                                $client->query($q)->read();
                            }
                        }
                    };

                    $addRule = function($path, array $fields) use ($client) {
                        $q = new RouterOS\Query($path . '/add');
                        foreach ($fields as $key => $value) {
                            if ($value !== null && $value !== '') $q->equal($key, (string)$value);
                        }
                        return $client->query($q)->read();
                    };
                    $firstRuleId = function($path) use ($client) {
                        $rows = $client->query(new RouterOS\Query($path . '/print'))->read();
                        return (!empty($rows[0]['.id'])) ? $rows[0]['.id'] : null;
                    };

                    $source = $olt['nat_source_ip'];
                    $private = $olt['private_ip'];
                    $public = $olt['ip'] ?? '';
                    $publicMatch = filter_var($public, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? $public : null;
                    $mode = $olt['mode'] ?? 'telnet';
                    $baseComment = 'Sheba-Fi OLT#' . (int)$olt['id'];

                    $rules = [];
                    if ($mode === 'web') {
                        $rules[] = [
                            'suffix' => ' Web', 'protocol' => 'tcp',
                            'external' => max(1, (int)($olt['port'] ?? 80)),
                            'target' => max(1, (int)($olt['target_web_port'] ?? 80))
                        ];
                    } else {
                        $rules[] = [
                            'suffix' => ' Telnet', 'protocol' => 'tcp',
                            'external' => max(1, (int)($olt['telnet_port'] ?? 23)),
                            'target' => max(1, (int)($olt['target_telnet_port'] ?? 23))
                        ];
                    }
                    $rules[] = [
                        'suffix' => ' SNMP', 'protocol' => 'udp',
                        'external' => max(1, (int)($olt['snmp_port'] ?? 161)),
                        'target' => max(1, (int)($olt['target_snmp_port'] ?? 161))
                    ];

                    $natPlaceBefore = $firstRuleId('/ip/firewall/nat');
                    $filterPlaceBefore = $firstRuleId('/ip/firewall/filter');

                    foreach ($rules as $rule) {
                        $natComment = $baseComment . $rule['suffix'] . ' NAT';
                        $filterComment = $baseComment . $rule['suffix'] . ' Allow';
                        $removeCommented('/ip/firewall/nat', $natComment);
                        $removeCommented('/ip/firewall/filter', $filterComment);

                        $natFields = [
                            'chain' => 'dstnat',
                            'src-address' => $source,
                            'dst-address' => $publicMatch,
                            'protocol' => $rule['protocol'],
                            'dst-port' => $rule['external'],
                            'action' => 'dst-nat',
                            'to-addresses' => $private,
                            'to-ports' => $rule['target'],
                            'comment' => $natComment,
                            'place-before' => $natPlaceBefore
                        ];
                        $addRule('/ip/firewall/nat', $natFields);

                        $filterFields = [
                            'chain' => 'forward',
                            'src-address' => $source,
                            'dst-address' => $private,
                            'protocol' => $rule['protocol'],
                            'dst-port' => $rule['target'],
                            'connection-nat-state' => 'dstnat',
                            'action' => 'accept',
                            'comment' => $filterComment,
                            'place-before' => $filterPlaceBefore
                        ];
                        $addRule('/ip/firewall/filter', $filterFields);
                    }

                    writeLog($pdo, $_SESSION['admin_username'] ?? 'Admin', 'Apply OLT NAT', $id, "Applied MikroTik NAT rules for OLT {$olt['name']} ({$public} -> {$private}) with SG source whitelist {$source}.");
                    $msg = "MikroTik NAT rules applied successfully. Use Test to verify OLT reachability from the SG server.";
                } catch (Throwable $e) {
                    error_log('OLT NAT apply failed: ' . $e->getMessage());
                    $error = "Could not apply NAT rules through MikroTik API. Check router API access/permissions and the saved NAT settings.";
                }
            }
        }
    }
}

// --- OLT CRUD ACTIONS ---
if (isset($_POST['add_olt'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    if ($oltMgr->addOLT($_POST, $current_staff_id)) {
        $msg = "OLT Registered Successfully";
    } else {
        $error = "OLT could not be saved. NAT mode requires Public IP + OLT Private IP; PPTP mode requires a valid private IPv4 address.";
    }
}

if (isset($_POST['edit_olt'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    $id = intval($_POST['id']);
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    $is_admin = hasRole('Admin');
    
    $target = $oltMgr->getOLT($id);
    if ($is_admin || ($target && $target['staff_id'] == $current_staff_id)) {
        if ($oltMgr->updateOLT($id, $_POST)) {
            $msg = "OLT Updated Successfully";
        } else {
            $error = "OLT could not be updated. NAT mode requires Public IP + OLT Private IP; PPTP mode requires a valid private IPv4 address.";
        }
    } else {
        $error = "Access Denied";
    }
}

if (isset($_POST['delete_olt'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    $id = intval($_POST['id']);
    $current_staff_id = $_SESSION['admin_id'] ?? 0;
    $is_admin = hasRole('Admin');
    
    $target = $oltMgr->getOLT($id);
    if ($is_admin || ($target && $target['staff_id'] == $current_staff_id)) {
        $oltMgr->deleteOLT($id, $is_admin ? null : $current_staff_id);
        $msg = "OLT Deleted Successfully";
    } else {
        $error = "Access Denied";
    }
}

// --- RESELLER / POP / BRANCH FULL LOCK HANDLER ---
if (isset($_POST['toggle_staff_lock']) && (hasRole('Admin') || isOffice())) {
    $target_id = intval($_POST['staff_id'] ?? 0);
    $lock_type = trim($_POST['lock_type'] ?? 'None'); // None, Panel, Full
    $note = trim($_POST['lock_note'] ?? '');
    if (!in_array($lock_type, ['None','Panel','Full'], true)) $lock_type = 'None';

    $staff = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$target_id]);
    if ($staff) {
        try {
            $cols = $pdo->query("DESCRIBE ".TBL_STAFF)->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('lock_status', $cols)) $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN lock_status ENUM('None','Panel','Full') DEFAULT 'None'");
            if (!in_array('lock_note', $cols)) $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN lock_note TEXT DEFAULT NULL");

            $cols_u = $pdo->query("DESCRIBE ".TBL_USERS)->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('is_parent_locked', $cols_u)) $pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN is_parent_locked TINYINT(1) DEFAULT 0");
        } catch(Exception $e) {}

        // Selected POP/Branch/Reseller panel is locked immediately.
        $pdo->prepare("UPDATE ".TBL_STAFF." SET lock_status=?, lock_note=? WHERE id=?")
            ->execute([$lock_type, $note, $target_id]);

        // Build the selected staff member's complete managed tree. This covers
        // Reseller -> SubReseller/POP/Branch child staff and all of their users.
        $scope_ids = [$target_id];
        $scan_ids = [$target_id];
        while (!empty($scan_ids)) {
            $ph = implode(',', array_fill(0, count($scan_ids), '?'));
            try {
                $st = $pdo->prepare("SELECT id FROM ".TBL_STAFF." WHERE parent_id IN ($ph) OR supervisor_id IN ($ph)");
                $st->execute(array_merge($scan_ids, $scan_ids));
                $found = $st->fetchAll(PDO::FETCH_COLUMN);
            } catch (Exception $e) {
                $found = [];
            }
            $scan_ids = [];
            foreach ($found as $sid) {
                $sid = (int)$sid;
                if ($sid > 0 && !in_array($sid, $scope_ids, true)) {
                    $scope_ids[] = $sid;
                    $scan_ids[] = $sid;
                }
            }
        }

        $scope_ph = implode(',', array_fill(0, count($scope_ids), '?'));
        require_once __DIR__ . '/../classes/MikrotikApp.php';

        $disabled_ok = 0;
        $disabled_fail = 0;
        $restored_ok = 0;
        $restored_fail = 0;

        if ($lock_type === 'Full') {
            // Fetch ALL managed users, not only Active users. Every existing PPP secret
            // is disabled. Only Active users are marked for later restoration.
            $clients = safeFetchAll($pdo, "SELECT * FROM ".TBL_USERS." WHERE manager_id IN ($scope_ph)", $scope_ids);

            // Cache router connections so large POPs don't reconnect for every user.
            $router_apps = [];
            foreach ($clients as $c) {
                $cid = (int)($c['id'] ?? 0);
                $was_active = strcasecmp((string)($c['status'] ?? ''), 'Active') === 0;

                if ($was_active && $cid > 0) {
                    $pdo->prepare("UPDATE ".TBL_USERS." SET is_parent_locked=1 WHERE id=?")->execute([$cid]);
                }

                $rid = (int)($c['router_id'] ?? 0);
                $pppoe = trim((string)($c['user_id'] ?? ''));
                if ($rid <= 0 || $pppoe === '') {
                    $disabled_fail++;
                    continue;
                }

                if (!array_key_exists($rid, $router_apps)) {
                    $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$rid]);
                    if (!$r) {
                        $router_apps[$rid] = null;
                    } else {
                        try { $router_apps[$rid] = new MikrotikApp($r, 3); }
                        catch (Exception $e) { $router_apps[$rid] = null; }
                    }
                }

                $mk = $router_apps[$rid];
                if ($mk && $mk->toggle($pppoe, false, '')) $disabled_ok++;
                else $disabled_fail++;
            }
        } elseif ($lock_type === 'None') {
            // Restore ONLY clients that were Active when this Full Lock was applied.
            // Due/Inactive/Expired/Left users remain disabled as before.
            $params = $scope_ids;
            $clients = safeFetchAll($pdo, "SELECT * FROM ".TBL_USERS." WHERE manager_id IN ($scope_ph) AND is_parent_locked=1", $params);
            $router_apps = [];

            foreach ($clients as $c) {
                $cid = (int)($c['id'] ?? 0);
                if (strcasecmp((string)($c['status'] ?? ''), 'Active') === 0) {
                    $rid = (int)($c['router_id'] ?? 0);
                    $pppoe = trim((string)($c['user_id'] ?? ''));
                    if ($rid > 0 && $pppoe !== '') {
                        if (!array_key_exists($rid, $router_apps)) {
                            $r = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$rid]);
                            if (!$r) $router_apps[$rid] = null;
                            else {
                                try { $router_apps[$rid] = new MikrotikApp($r, 3); }
                                catch (Exception $e) { $router_apps[$rid] = null; }
                            }
                        }
                        $mk = $router_apps[$rid];
                        if ($mk) {
                            $svc = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name=?", [$c['user_package'] ?? '']);
                            $profile = $svc ? ($svc['mikrotik_profile_name'] ?? '') : '';
                            if ($mk->toggle($pppoe, true, $profile, $c['password'] ?? '')) $restored_ok++;
                            else $restored_fail++;
                        } else $restored_fail++;
                    } else $restored_fail++;
                }
                if ($cid > 0) {
                    $pdo->prepare("UPDATE ".TBL_USERS." SET is_parent_locked=0 WHERE id=?")->execute([$cid]);
                }
            }
        }

        $role_name = trim((string)($staff['role'] ?? 'Staff'));
        $target_name = trim((string)($staff['name'] ?? $staff['username'] ?? ('#'.$target_id)));
        $detail = "Set {$role_name} {$target_name} lock to {$lock_type}; scope staff=".count($scope_ids);
        if ($lock_type === 'Full') $detail .= "; MikroTik disabled={$disabled_ok}; failed/skipped={$disabled_fail}";
        if ($lock_type === 'None') $detail .= "; restored={$restored_ok}; failed/skipped={$restored_fail}";
        writeLog($pdo, $_SESSION['admin_username'], 'Staff Lock', $target_id, $detail);

        if ($lock_type === 'Full') {
            $msg = "Full Lock applied. Panel locked; {$disabled_ok} MikroTik PPPoE secret(s) disabled" . ($disabled_fail ? "; {$disabled_fail} failed/skipped." : ".");
        } elseif ($lock_type === 'Panel') {
            $msg = "Panel Lock applied. Client MikroTik secrets were not changed.";
        } else {
            $msg = "Panel unlocked. {$restored_ok} previously parent-locked Active client(s) re-enabled" . ($restored_fail ? "; {$restored_fail} failed/skipped." : ".");
        }
    }
}

// --- PPTP VPN CRUD ACTIONS ---
if (isset($_POST['save_vpn_config'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    
    $pptp_server = trim($_POST['pptp_server'] ?? '');
    $pptp_username = trim($_POST['pptp_username'] ?? '');
    $pptp_password = (string)($_POST['pptp_password'] ?? '');
    $olt_lan = trim($_POST['olt_lan'] ?? '');
    $require_encryption = isset($_POST['require_encryption']) ? 1 : 0;
    $auto_connect = isset($_POST['auto_connect']) ? 1 : 0;
    $route_metric = max(1, min(9999, intval($_POST['route_metric'] ?? 50)));
    $tenant_name = defined('CURRENT_TENANT') ? (string)CURRENT_TENANT : 'main';
    
    $cidr_valid = false;
    if (preg_match('/^([^\/]+)\/(\d{1,2})$/', $olt_lan, $cidr_m)) {
        $cidr_valid = filter_var($cidr_m[1], FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && (int)$cidr_m[2] <= 32;
    }
    $vpn = safeFetch($pdo, "SELECT id, pptp_password FROM " . TBL_TENANT_VPN . " LIMIT 1");
    $effective_password = $pptp_password !== '' ? $pptp_password : (string)($vpn['pptp_password'] ?? '');
    if (empty($pptp_server) || empty($pptp_username) || $effective_password === '' || empty($olt_lan)) {
        $error = "PPTP Server, Username, Password and OLT LAN are required.";
    } elseif (!preg_match('/^[A-Za-z0-9._-]+$/', $pptp_server)) {
        $error = "PPTP Server must be a valid IPv4 address or hostname.";
    } elseif (!preg_match('/^[A-Za-z0-9_.@+\-]{1,100}$/', $pptp_username)) {
        $error = "PPTP username contains unsupported characters.";
    } elseif (strpos($effective_password, "\n") !== false || strpos($effective_password, "\r") !== false) {
        $error = "PPTP password cannot contain line breaks.";
    } elseif (!$cidr_valid) {
        $error = "OLT LAN must be a valid IPv4 CIDR, for example 172.30.30.0/24.";
    } else {
        if ($vpn) {
            $stmt = $pdo->prepare("UPDATE " . TBL_TENANT_VPN . " SET tenant_id=?, pptp_server=?, pptp_username=?, pptp_password=?, olt_lan=?, require_encryption=?, auto_connect=?, route_metric=?, vpn_status=IF(vpn_status='disabled','disabled','disconnected'), ppp_interface=NULL, reachability_status='unknown', error_message=NULL, updated_at=NOW() WHERE id=?");
            $stmt->execute([$tenant_name, $pptp_server, $pptp_username, $effective_password, $olt_lan, $require_encryption, $auto_connect, $route_metric, $vpn['id']]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO " . TBL_TENANT_VPN . " (tenant_id, pptp_server, pptp_username, pptp_password, olt_lan, require_encryption, auto_connect, route_metric, vpn_status, reachability_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', 'unknown')");
            $stmt->execute([$tenant_name, $pptp_server, $pptp_username, $effective_password, $olt_lan, $require_encryption, $auto_connect, $route_metric]);
        }
        $msg = "PPTP VPN Configuration Saved Successfully. Background worker will orchestrate the connection.";
    }
}

if (isset($_POST['toggle_vpn_status'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    
    $vpn = safeFetch($pdo, "SELECT id, vpn_status FROM " . TBL_TENANT_VPN . " LIMIT 1");
    if ($vpn) {
        $new_status = ($vpn['vpn_status'] === 'disabled') ? 'disconnected' : 'disabled';
        $stmt = $pdo->prepare("UPDATE " . TBL_TENANT_VPN . " SET vpn_status = ? WHERE id = ?");
        $stmt->execute([$new_status, $vpn['id']]);
        
        if ($new_status === 'disconnected') {
            $msg = "VPN Connection initiated. Please allow up to 10 seconds for the tunnel to negotiate.";
        } else {
            $msg = "VPN Connection teardown initiated successfully.";
        }
    } else {
        $error = "Please configure and save your PPTP VPN settings first.";
    }
}

// --- MANUAL MATCH SMS ACTION ---
if (isset($_POST['submit_manual_match'])) {
    if (!isset($_SESSION['admin_id'])) exit;
    $smsId = intval($_POST['sms_id'] ?? 0);
    $customerId = intval($_POST['customer_id'] ?? 0);
    
    // Fetch SMS: restrict to owned device log if not Admin
    if (!hasRole('Admin')) {
        $sms = safeFetch($pdo, "SELECT * FROM payment_sms_logs WHERE id = ? AND status = 'unmatched' AND staff_id = ?", [$smsId, $_SESSION['admin_id']]);
    } else {
        $sms = safeFetch($pdo, "SELECT * FROM payment_sms_logs WHERE id = ? AND status = 'unmatched'", [$smsId]);
    }
    
    // Fetch client and check if they belong to the staff's managed scope
    $client = null;
    if ($sms) {
        $client = safeFetch($pdo, "SELECT id, user_id, manager_id FROM users WHERE id = ?", [$customerId]);
        if ($client && !hasRole('Admin')) {
            $managed_ids = getManagedStaffIds($pdo, $_SESSION['admin_id'], $_SESSION['user_role']);
            if (is_array($managed_ids) && !in_array((int)$client['manager_id'], $managed_ids)) {
                $client = null; // Unauthorized
            }
        }
    }
    
    if ($sms && $client) {
        try {
            $pdo->beginTransaction();
            
            $apiMeta = json_encode(['method' => 'MANUAL_MATCHED_SMS', 'gateway' => $sms['gateway_name'], 'sms_id' => $smsId, 'by_admin' => ($_SESSION['admin_username'] ?? 'System')]);
            $stmt = $pdo->prepare("INSERT INTO payment_gateway_logs (staff_id, amount, trx_id, status, payment_id, gateway_response) VALUES (?, ?, ?, 'COMPLETED', ?, ?)");
            $stmt->execute([$client['id'], $sms['amount'], $sms['trx_id'], $sms['trx_id'], $apiMeta]);
            
            $activation = processOnlinePaymentSuccess($pdo, $client['id'], $sms['amount'], $sms['gateway_name'] . '_SMS_MANUAL', json_decode($apiMeta, true));
            
            if ($activation) {
                // Check if a payment request with this transaction ID already exists to prevent integrity constraint duplicates
                $existing_req = safeFetch($pdo, "SELECT id, invoice_id FROM payment_requests WHERE UPPER(trx_id) = ?", [strtoupper($sms['trx_id'])]);
                if ($existing_req) {
                    $invoice_id = !empty($existing_req['invoice_id']) ? $existing_req['invoice_id'] : 'MANUAL_MATCH';
                    $stmt = $pdo->prepare("UPDATE payment_requests SET customer_id = ?, invoice_id = ?, gateway_name = ?, amount = ?, status = 'verified', verified_at = ? WHERE id = ?");
                    $stmt->execute([$client['id'], $invoice_id, $sms['gateway_name'], $sms['amount'], date('Y-m-d H:i:s'), $existing_req['id']]);
                } else {
                    $stmt = $pdo->prepare("INSERT INTO payment_requests (customer_id, invoice_id, gateway_name, amount, trx_id, status, verified_at) VALUES (?, 'MANUAL_MATCH', ?, ?, ?, 'verified', ?)");
                    $stmt->execute([$client['id'], $sms['gateway_name'], $sms['amount'], $sms['trx_id'], date('Y-m-d H:i:s')]);
                }
                
                // Mark SMS as matched
                $pdo->prepare("UPDATE payment_sms_logs SET status = 'matched' WHERE id = ?")->execute([$smsId]);
                
                $pdo->commit();
                $msg = "SMS matched successfully! Package activated for customer: {$client['user_id']}.";
            } else {
                $pdo->rollBack();
                $error = 'Failed to activate client package.';
            }
        } catch (Exception $e) {
            $pdo->rollBack();
            $error = 'Error manually matching SMS: ' . $e->getMessage();
        }
    } else {
        $error = 'SMS Log or Client not found.';
    }
}

// --- GLOBAL PRG REDIRECT ---
// Prevent form resubmission by redirecting after processing POST
if (!empty($_POST) && !isset($_POST['ajax_action_flag']) && !isset($_POST['login']) && !isset($_POST['request_reset'])) {
    if (isset($msg) && !empty($msg)) {
        $_SESSION['flash_msg'] = $msg;
    }
    if (isset($error) && !empty($error)) {
        $_SESSION['flash_error'] = $error;
    }

    $target_tab = $_GET['tab'] ?? 'dashboard';
    if (isset($_GET['view_id'])) {
        $target_tab = 'profile'; 
    }
    
    $redirect_url = "?tab=" . $target_tab;
    
    // Preserve other relevant GET params if needed
    if (isset($_GET['view_id'])) $redirect_url .= "&view_id=" . intval($_GET['view_id']);
    if (isset($_GET['uid'])) $redirect_url .= "&uid=" . intval($_GET['uid']);

    header("Location: " . $redirect_url);
    exit;
}

?>
