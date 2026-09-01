<?php
// controllers/call_center_controller.php
if (session_status() == PHP_SESSION_NONE) {
    ini_set('session.cookie_secure', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/IPPhoneDriver.php';

if (!isLoggedIn()) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Unauthorized access.']);
    exit;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$staff_id = $_SESSION['admin_id'] ?? 0;
$staff_name = $_SESSION['admin_user'] ?? 'Staff';
$current_role = $_SESSION['user_role'] ?? 'Staff';
$tenant_id = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
$owner_id = get_store_owner_id();
$managed_ids = getManagedStaffIds($pdo, $owner_id, $current_role);
if ($managed_ids !== 'ALL' && empty($managed_ids)) {
    $managed_ids = [$owner_id];
}

// Helper to sanitize phone number (strict Bangladeshi format 8801XXXXXXXXX or 01XXXXXXXXX)
function sanitize_phone($phone) {
    $phone = preg_replace('/[^0-9]/', '', $phone);
    if (strlen($phone) == 11 && substr($phone, 0, 1) === '0') {
        $phone = '88' . $phone;
    }
    return $phone;
}

function validate_phone($phone) {
    // Sanitize first
    $phone = sanitize_phone($phone);
    // Must be exactly 13 digits (8801XXXXXXXXX) or 11 digits (if not matching BD format)
    return (preg_match('/^8801[3-9][0-9]{8}$/', $phone) || preg_match('/^01[3-9][0-9]{8}$/', $phone));
}

// POST and AJAX Handler Router
switch ($action) {
    
    // Save API configuration (Admin / Tenant Owner Only)
    case 'save_api_settings':
        if (!hasRole('Admin') && strcasecmp($current_role, 'Reseller') !== 0) {
            $_SESSION['flash_error'] = "Access Denied. Only Admins can modify settings.";
            header("Location: ../index.php?tab=ip_phone_config");
            exit;
        }
        
        $driver = trim($_POST['driver'] ?? 'generic_rest');
        $base_url = trim($_POST['base_url'] ?? '');
        $username = trim($_POST['username'] ?? '');
        $password_token = trim($_POST['password_token'] ?? '');
        $caller_id = trim($_POST['caller_id'] ?? '');
        $extension = trim($_POST['extension'] ?? '');
        $enabled = isset($_POST['enabled']) ? 1 : 0;
        $test_mode = isset($_POST['test_mode']) ? 1 : 0;
        
        if ($driver === 'flemsoft') {
            $username = 'flemsoft';
            $base_url = 'https://flemsoft.com/voiceapi/newrequest/';
        }
        
        if (empty($base_url) || empty($username) || empty($password_token) || empty($caller_id)) {
            $_SESSION['flash_error'] = "All configuration fields except extension are required.";
            header("Location: ../index.php?tab=ip_phone_config");
            exit;
        }
        
        // Encrypt key
        $encrypted_token = IPPhoneDriver::encrypt($password_token);
        
        try {
            // Check if config exists for this reseller/admin
            $stmt_ex = $pdo->prepare("SELECT id FROM ip_phone_configs WHERE staff_id = ? LIMIT 1");
            $stmt_ex->execute([$owner_id]);
            $exists = $stmt_ex->fetchColumn();
            
            if ($exists) {
                $stmt = $pdo->prepare("UPDATE ip_phone_configs SET driver=?, base_url=?, username=?, password_token=?, caller_id=?, extension=?, enabled=?, test_mode=? WHERE id=?");
                $stmt->execute([$driver, $base_url, $username, $encrypted_token, $caller_id, $extension, $enabled, $test_mode, $exists]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO ip_phone_configs (staff_id, driver, base_url, username, password_token, caller_id, extension, enabled, test_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$owner_id, $driver, $base_url, $username, $encrypted_token, $caller_id, $extension, $enabled, $test_mode]);
            }
            
            writeLog($pdo, $staff_name, 'IP Phone Config Update', 0, "IP Phone settings updated. Driver: $driver. Test Mode: " . ($test_mode ? 'YES' : 'NO'));
            $_SESSION['flash_msg'] = "IP Phone API configurations saved successfully!";
        } catch (Exception $e) {
            $_SESSION['flash_error'] = "Database Error: " . $e->getMessage();
        }
        
        header("Location: ../index.php?tab=ip_phone_config");
        exit;

    // Save Direct SIP IP Number (Admin / Tenant Owner Only)
    case 'save_ip_number':
        if (!hasRole('Admin') && strcasecmp($current_role, 'Reseller') !== 0) {
            $_SESSION['flash_error'] = "Access Denied. Only Admins can modify settings.";
            header("Location: ../index.php?tab=ip_phone_numbers");
            exit;
        }
        
        // Ensure wss_uri column exists dynamically
        try {
            $pdo->exec("ALTER TABLE " . TBL_IP_PHONE_NUMBERS . " ADD COLUMN wss_uri VARCHAR(255) DEFAULT NULL");
        } catch (Exception $e) {
            // Gracefully ignore error if column exists
        }
        
        $ip_number_id = intval($_POST['id'] ?? 0);
        $ip_number = trim($_POST['ip_number'] ?? '');
        $password = trim($_POST['password'] ?? '');
        $sip_server = trim($_POST['sip_server'] ?? '');
        $port = intval($_POST['port'] ?? 5060);
        $wss_uri = trim($_POST['wss_uri'] ?? '');
        $is_main = isset($_POST['is_main']) ? 1 : 0;
        
        if (empty($ip_number) || empty($password) || empty($sip_server) || empty($port)) {
            $_SESSION['flash_error'] = "IP Number, Password, SIP Server, and Port are required fields.";
            header("Location: ../index.php?tab=ip_phone_numbers");
            exit;
        }
        
        // Encrypt the password
        $encrypted_password = IPPhoneDriver::encrypt($password);
        
        try {
            $pdo->beginTransaction();
            
            if ($is_main) {
                // Set all other IP Numbers to not main for this reseller/admin
                $stmt = $pdo->prepare("UPDATE " . TBL_IP_PHONE_NUMBERS . " SET is_main = 0 WHERE tenant_id = ? AND staff_id = ?");
                $stmt->execute([$tenant_id, $owner_id]);
            }
            
            if ($ip_number_id > 0) {
                // Verify ownership if not Admin
                if (!hasRole('Admin')) {
                    $verify = safeFetch($pdo, "SELECT id FROM " . TBL_IP_PHONE_NUMBERS . " WHERE id = ? AND staff_id = ?", [$ip_number_id, $owner_id]);
                    if (!$verify) {
                        throw new Exception("Access Denied: IP Number not found or unauthorized.");
                    }
                }
                
                // Update
                $stmt = $pdo->prepare("UPDATE " . TBL_IP_PHONE_NUMBERS . " SET ip_number = ?, password = ?, sip_server = ?, port = ?, wss_uri = ?, is_main = ? WHERE id = ? AND tenant_id = ?");
                $stmt->execute([$ip_number, $encrypted_password, $sip_server, $port, $wss_uri, $is_main, $ip_number_id, $tenant_id]);
                $msg = "IP Phone Number updated successfully.";
            } else {
                // Insert
                $stmt = $pdo->prepare("INSERT INTO " . TBL_IP_PHONE_NUMBERS . " (tenant_id, staff_id, ip_number, password, sip_server, port, wss_uri, is_main) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$tenant_id, $owner_id, $ip_number, $encrypted_password, $sip_server, $port, $wss_uri, $is_main]);
                $msg = "IP Phone Number added successfully.";
            }
            
            $pdo->commit();
            writeLog($pdo, $staff_name, 'IP Phone Number Saved', 0, "IP Number: $ip_number. Server: $sip_server. Main: " . ($is_main ? 'YES' : 'NO'));
            $_SESSION['flash_msg'] = $msg;
        } catch (Exception $e) {
            $pdo->rollBack();
            $_SESSION['flash_error'] = "Database Error: " . $e->getMessage();
        }
        
        header("Location: ../index.php?tab=ip_phone_numbers");
        exit;

    // Delete Direct SIP IP Number (Admin / Tenant Owner Only)
    case 'delete_ip_number':
        if (!hasRole('Admin') && strcasecmp($current_role, 'Reseller') !== 0) {
            $_SESSION['flash_error'] = "Access Denied. Only Admins can modify settings.";
            header("Location: ../index.php?tab=ip_phone_numbers");
            exit;
        }
        
        $ip_number_id = intval($_GET['id'] ?? 0);
        if ($ip_number_id > 0) {
            try {
                // Get the number info for logs and verify ownership
                $ip_info = safeFetch($pdo, "SELECT ip_number FROM " . TBL_IP_PHONE_NUMBERS . " WHERE id = ? AND staff_id = ? AND tenant_id = ?", [$ip_number_id, $owner_id, $tenant_id]);
                if ($ip_info) {
                    $pdo->prepare("DELETE FROM " . TBL_IP_PHONE_NUMBERS . " WHERE id = ? AND staff_id = ? AND tenant_id = ?")->execute([$ip_number_id, $owner_id, $tenant_id]);
                    writeLog($pdo, $staff_name, 'IP Phone Number Deleted', 0, "Deleted IP Number: " . $ip_info['ip_number']);
                    $_SESSION['flash_msg'] = "IP Phone Number deleted successfully.";
                } else {
                    $_SESSION['flash_error'] = "IP Number not found or unauthorized.";
                }
            } catch (Exception $e) {
                $_SESSION['flash_error'] = "Database Error: " . $e->getMessage();
            }
        }
        header("Location: ../index.php?tab=ip_phone_numbers");
        exit;

    // Toggle Active Main IP Number (Admin / Tenant Owner Only)
    case 'toggle_main_ip_number':
        if (!hasRole('Admin') && strcasecmp($current_role, 'Reseller') !== 0) {
            $_SESSION['flash_error'] = "Access Denied. Only Admins can modify settings.";
            header("Location: ../index.php?tab=ip_phone_numbers");
            exit;
        }
        
        $ip_number_id = intval($_GET['id'] ?? 0);
        if ($ip_number_id > 0) {
            try {
                $pdo->beginTransaction();
                
                // Get the number info for logs and verify ownership
                $ip_info = safeFetch($pdo, "SELECT ip_number FROM " . TBL_IP_PHONE_NUMBERS . " WHERE id = ? AND staff_id = ? AND tenant_id = ?", [$ip_number_id, $owner_id, $tenant_id]);
                if (!$ip_info) {
                    throw new Exception("IP Number not found or unauthorized.");
                }
                
                // Set all other IP Numbers to not main for this reseller/admin
                $pdo->prepare("UPDATE " . TBL_IP_PHONE_NUMBERS . " SET is_main = 0 WHERE tenant_id = ? AND staff_id = ?")->execute([$tenant_id, $owner_id]);
                
                // Set this specific number as main
                $stmt = $pdo->prepare("UPDATE " . TBL_IP_PHONE_NUMBERS . " SET is_main = 1 WHERE id = ? AND staff_id = ? AND tenant_id = ?");
                $stmt->execute([$ip_number_id, $owner_id, $tenant_id]);
                
                $pdo->commit();
                writeLog($pdo, $staff_name, 'IP Phone Main Changed', 0, "Set IP Number {$ip_info['ip_number']} as active Main Number.");
                $_SESSION['flash_msg'] = "Main IP Number changed successfully.";
            } catch (Exception $e) {
                $pdo->rollBack();
                $_SESSION['flash_error'] = "Database Error: " . $e->getMessage();
            }
        }
        header("Location: ../index.php?tab=ip_phone_numbers");
        exit;

    // Trigger Click-to-Call (AJAX)
    case 'click_to_call':
        header('Content-Type: application/json');
        
        $customer_id = intval($_POST['customer_id'] ?? 0);
        $phone = trim($_POST['phone'] ?? '');
        $name = trim($_POST['name'] ?? 'Unknown Customer');
        
        if (empty($phone)) {
            echo json_encode(['success' => false, 'message' => 'Phone number is required.']);
            exit;
        }
        
        if (!validate_phone($phone)) {
            echo json_encode(['success' => false, 'message' => 'Invalid phone number format. Mobile must be a valid 11-digit number.']);
            exit;
        }
        
        // Check if a Direct SIP number is configured as main (WebSIP softphone mode)
        $is_sip_client = true;
        
        // If we are explicitly triggering a test dial from the API Connection Test Console, bypass WebSIP check
        if ($customer_id === 0 && $name === 'API Test Loop') {
            $is_sip_client = false;
        } else {
            try {
                $sip_stmt = $pdo->prepare("SELECT id FROM ip_phone_numbers WHERE staff_id = ? AND is_main = 1 LIMIT 1");
                $sip_stmt->execute([$owner_id]);
                $sip_check = $sip_stmt->fetch();
                
                // If table exists but no main number is set, fall back to API mode check
                if ($sip_check === false) {
                    $is_sip_client = false;
                } else {
                    $is_sip_client = $sip_check ? true : false;
                }
            } catch (Exception $e) {
                // Table doesn't exist yet or column mismatch — treat as API mode
                $is_sip_client = false;
            }
        }
        
        $call_start = date('Y-m-d H:i:s');
        $call_end   = date('Y-m-d H:i:s');
        $duration   = 0;
        $api_resp   = '';
        $rec_url    = null;
        $result     = ['success' => false, 'message' => ''];
        
        if ($is_sip_client) {
            // === WebSIP Browser Softphone Mode ===
            // The actual call is made by the browser-embedded SIP client (JsSIP / Web Bridge).
            // We just log the attempt and return success so the frontend can activate the call UI.
            $call_status = 'WebSIP';
            $staff_ext   = 'WebSIP';
            $result      = ['success' => true, 'message' => 'WebSIP browser softphone call initiated. Browser is handling the connection.'];
        } else {
            // === External API Driver Mode ===
            $driverObj = IPPhoneDriver::getDriver($pdo, $owner_id, true);
            if (!$driverObj) {
                echo json_encode(['success' => false, 'message' => 'IP Phone API is disabled or not configured. Please configure an IP Phone API or add a Direct SIP number in Call Center settings.']);
                exit;
            }
            
            $ext_stmt = $pdo->prepare("SELECT extension FROM ip_phone_configs WHERE staff_id = ? AND enabled = 1 LIMIT 1");
            $ext_stmt->execute([$owner_id]);
            $staff_ext = $ext_stmt->fetchColumn() ?: '100';
            
            $call_result = $driverObj->clickToCall($phone, $staff_ext);
            $call_end    = date('Y-m-d H:i:s');
            $api_resp    = $call_result['raw_response'] ?? '';
            $result      = $call_result;
            
            if ($call_result['success']) {
                $parsed      = json_decode($api_resp, true);
                $call_status = $parsed['call_status'] ?? 'Answered';
                $duration    = intval($parsed['duration'] ?? 0);
                $rec_url     = $parsed['recording_url'] ?? null;
            } else {
                $call_status = 'Failed';
            }
        }
        
        // Log the call to DB (optional — call is browser-side in WebSIP mode)
        $log_id = 0;
        try {
            $stmt = $pdo->prepare("INSERT INTO call_logs (tenant_id, customer_id, customer_name, customer_mobile, staff_id, staff_name, ip_phone_extension, call_type, call_start_time, call_end_time, duration, call_status, api_response, recording_url) VALUES (?, ?, ?, ?, ?, ?, ?, 'Manual', ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $tenant_id,
                $customer_id ?: null,
                $name,
                $phone,
                $staff_id,
                $staff_name,
                $staff_ext ?? 'WebSIP',
                $call_start,
                $call_end,
                $duration,
                $call_status ?? 'WebSIP',
                $api_resp,
                $rec_url
            ]);
            $log_id = $pdo->lastInsertId();
            try { writeLog($pdo, $staff_name, 'Click to Call', $customer_id, "Call to $phone ($name). Mode: " . ($is_sip_client ? 'WebSIP' : 'API')); } catch(Exception $e2) {}
        } catch (Exception $e) {
            // call_logs table may not exist — non-critical, don't fail the call
        }
        
        echo json_encode([
            'success'       => $result['success'],
            'message'       => $result['message'],
            'log_id'        => $log_id,
            'status'        => $call_status ?? 'WebSIP',
            'duration'      => $duration,
            'is_sip_client' => $is_sip_client
        ]);
        exit;

        
    // Add Follow-up Note and Action
    case 'add_followup':
        $customer_id = intval($_POST['customer_id'] ?? 0);
        $type = trim($_POST['type'] ?? 'Billing');
        $note = trim($_POST['note'] ?? '');
        $followup_date = trim($_POST['followup_date'] ?? '');
        $status = trim($_POST['status'] ?? 'Pending');
        $next_date = trim($_POST['next_followup_date'] ?? '');
        $log_id = intval($_POST['log_id'] ?? 0);
        
        if (empty($note) || empty($followup_date)) {
            $_SESSION['flash_error'] = "Follow-up note and date/time are required.";
            header("Location: " . $_SERVER['HTTP_REFERER']);
            exit;
        }
        
        try {
            $pdo->beginTransaction();
            
            // Insert follow-up
            $stmt = $pdo->prepare("INSERT INTO customer_followups (customer_id, staff_id, note, followup_date, type, status) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$customer_id, $staff_id, $note, $followup_date, $type, $status]);
            
            // If linked to a call log, update call log remarks and status
            if ($log_id > 0) {
                $status_map = [
                    'Pending' => 'Call Back Later',
                    'Done' => 'Complaint Solved',
                    'Call Back Later' => 'Call Back Later',
                    'Interested' => 'Interested',
                    'Not Interested' => 'Not Interested'
                ];
                $c_status = $status_map[$status] ?? 'Answered';
                
                $stmt = $pdo->prepare("UPDATE call_logs SET remarks = ?, call_status = ?, next_followup_date = ? WHERE id = ?");
                $stmt->execute([$note, $c_status, !empty($next_date) ? $next_date : null, $log_id]);
            }
            
            // Sync next follow-up date back to the customer profile remarks
            if (!empty($next_date)) {
                $pdo->prepare("UPDATE " . TBL_USERS . " SET remarks = CONCAT(IFNULL(remarks,''), '\n[Follow-up Date: ', ?, ' | Note: ', ?, ']') WHERE id = ?")
                    ->execute([$next_date, $note, $customer_id]);
            }
            
            $pdo->commit();
            
            writeLog($pdo, $staff_name, 'Followup Created', $customer_id, "Added $type follow-up. Status: $status.");
            $_SESSION['flash_msg'] = "Follow-up logged successfully!";
        } catch (Exception $e) {
            $pdo->rollBack();
            $_SESSION['flash_error'] = "DB Transaction Error: " . $e->getMessage();
        }
        
        header("Location: " . $_SERVER['HTTP_REFERER']);
        exit;
        
    // AJAX timeline retrieval (AJAX)
    case 'get_customer_timeline':
        header('Content-Type: application/json');
        $customer_id = intval($_GET['customer_id'] ?? 0);
        
        if ($customer_id <= 0) {
            echo json_encode(['success' => false, 'html' => 'Invalid customer ID.']);
            exit;
        }
        
        try {
            // Call Logs
            $calls = safeFetchAll($pdo, "SELECT * FROM call_logs WHERE customer_id = ? ORDER BY call_start_time DESC LIMIT 30", [$customer_id]);
            // Follow-ups
            $followups = safeFetchAll($pdo, "SELECT f.*, s.name as staff_name FROM customer_followups f JOIN ".TBL_STAFF." s ON f.staff_id=s.id WHERE f.customer_id = ? ORDER BY f.followup_date DESC LIMIT 30", [$customer_id]);
            // Support Tickets
            $tickets = safeFetchAll($pdo, "SELECT * FROM tickets WHERE client_id = ? ORDER BY created_at DESC LIMIT 10", [$customer_id]);
            // Payments (via Audit Log of Recharge)
            $payments = safeFetchAll($pdo, "SELECT * FROM ".TBL_LOGS." WHERE target_id = ? AND action_type='Recharge' ORDER BY timestamp DESC LIMIT 15", [$customer_id]);
            // Voice SMS Queue
            $voice_sms = safeFetchAll($pdo, "SELECT q.*, t.name as template_name FROM voice_sms_queue q LEFT JOIN voice_templates t ON q.template_id = t.id WHERE q.customer_id = ? ORDER BY q.created_at DESC LIMIT 15", [$customer_id]);
            
            // Build a chronological event list
            $events = [];
            
            foreach ($calls as $c) {
                $events[] = [
                    'time' => strtotime($c['call_start_time']),
                    'date_str' => date('d M Y, h:i A', strtotime($c['call_start_time'])),
                    'icon' => 'fa-phone-alt',
                    'color' => $c['call_status'] === 'Answered' ? 'success' : ($c['call_status'] === 'Failed' ? 'danger' : 'warning'),
                    'title' => 'Phone Call (' . htmlspecialchars($c['call_status']) . ')',
                    'body' => 'Initiated by <strong>' . htmlspecialchars($c['staff_name']) . '</strong>. Duration: <strong>' . $c['duration'] . ' sec</strong>.' . 
                              (!empty($c['remarks']) ? '<br><span class="text-muted small">Remark: ' . htmlspecialchars($c['remarks']) . '</span>' : '') . 
                              (!empty($c['recording_url']) ? '<div class="mt-2"><audio src="' . htmlspecialchars($c['recording_url']) . '" controls style="height:30px;"></audio></div>' : '')
                ];
            }
            
            foreach ($followups as $f) {
                $events[] = [
                    'time' => strtotime($f['followup_date']),
                    'date_str' => date('d M Y, h:i A', strtotime($f['followup_date'])),
                    'icon' => 'fa-calendar-alt',
                    'color' => $f['status'] === 'Done' ? 'info' : 'warning',
                    'title' => 'Customer Follow-up (' . htmlspecialchars($f['type']) . ')',
                    'body' => 'Status: <span class="badge bg-light text-dark border">' . htmlspecialchars($f['status']) . '</span>. Assigned to <strong>' . htmlspecialchars($f['staff_name']) . '</strong>.<br>' . 
                              'Note: <span class="italic text-secondary">"' . htmlspecialchars($f['note']) . '"</span>'
                ];
            }
            
            foreach ($tickets as $t) {
                $events[] = [
                    'time' => strtotime($t['created_at']),
                    'date_str' => date('d M Y, h:i A', strtotime($t['created_at'])),
                    'icon' => 'fa-ticket-alt',
                    'color' => $t['status'] === 'Solved' ? 'success' : 'danger',
                    'title' => 'Complain Ticket (' . htmlspecialchars($t['category']) . ')',
                    'body' => 'Status: <strong class="text-primary">' . htmlspecialchars($t['status']) . '</strong>.<br>' . 
                              'Ticket Details: "' . htmlspecialchars($t['message']) . '"'
                ];
            }
            
            foreach ($payments as $p) {
                $events[] = [
                    'time' => strtotime($p['timestamp']),
                    'date_str' => date('d M Y, h:i A', strtotime($p['timestamp'])),
                    'icon' => 'fa-hand-holding-usd',
                    'color' => 'success',
                    'title' => 'Payment / Package Recharge',
                    'body' => htmlspecialchars($p['description'])
                ];
            }
            
            foreach ($voice_sms as $v) {
                $events[] = [
                    'time' => strtotime($v['created_at']),
                    'date_str' => date('d M Y, h:i A', strtotime($v['created_at'])),
                    'icon' => 'fa-bullhorn',
                    'color' => $v['status'] === 'Sent' ? 'success' : ($v['status'] === 'Failed' ? 'danger' : 'info'),
                    'title' => 'Voice SMS Campaign',
                    'body' => 'Campaign: <strong>' . htmlspecialchars($v['campaign_name']) . '</strong>. Status: <strong class="text-capitalize">' . $v['status'] . '</strong>.<br>' . 
                              ($v['template_name'] ? 'Template: ' . htmlspecialchars($v['template_name']) : 'Custom Audio Broadcast.') . 
                              (!empty($v['error_message']) ? '<br><span class="text-danger small">Error: ' . htmlspecialchars($v['error_message']) . '</span>' : '')
                ];
            }
            
            // Sort events chronologically descending
            usort($events, function($a, $b) {
                return $b['time'] - $a['time'];
            });
            
            // Generate clean HTML
            $html = '';
            if (empty($events)) {
                $html = '<div class="text-center text-muted py-5"><i class="fas fa-history fa-2x mb-2 opacity-50"></i><br>No Call Timeline logs found for this customer.</div>';
            } else {
                $html = '<div class="timeline-container py-3 px-2" style="position: relative; max-height: 600px; overflow-y: auto;">';
                $html .= '<div style="position: absolute; left: 31px; top: 0; bottom: 0; width: 2px; background: #e9ecef; z-index: 1;"></div>';
                
                foreach ($events as $ev) {
                    $html .= '
                    <div class="d-flex align-items-start mb-4" style="position: relative; z-index: 2;">
                        <div class="rounded-circle bg-' . $ev['color'] . ' text-white d-flex align-items-center justify-content-center me-3 shadow-sm" style="width: 36px; height: 36px; min-width:36px; font-size: 0.9rem;">
                            <i class="fas ' . $ev['icon'] . '"></i>
                        </div>
                        <div class="card shadow-none border rounded-3 p-3 flex-grow-1" style="background-color: #fafbfd;">
                            <div class="d-flex justify-content-between align-items-center mb-1 flex-wrap">
                                <h6 class="mb-0 fw-bold text-dark">' . $ev['title'] . '</h6>
                                <small class="text-muted"><i class="far fa-clock me-1"></i>' . $ev['date_str'] . '</small>
                            </div>
                            <p class="mb-0 text-muted small" style="line-height: 1.4;">' . $ev['body'] . '</p>
                        </div>
                    </div>';
                }
                $html .= '</div>';
            }
            
            echo json_encode(['success' => true, 'html' => $html]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'html' => 'Load error: ' . $e->getMessage()]);
        }
        exit;
        
    // CRUD Voice Template
    case 'save_voice_template':
        $template_id = intval($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        $type = trim($_POST['type'] ?? 'Due bill reminder');
        $message_text = trim($_POST['message_text'] ?? '');
        $language = trim($_POST['language'] ?? 'Bangla');
        
        if (empty($name) || empty($message_text)) {
            $_SESSION['flash_error'] = "Template name and voice transcript text are required.";
            header("Location: index.php?tab=voice_templates");
            exit;
        }
        
        $audio_file_path = null;
        
        // Handle audio file uploading
        if (isset($_FILES['audio_file']) && $_FILES['audio_file']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['audio_file'];
            $allowed_exts = ['mp3', 'wav', 'ogg'];
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            
            if (!in_array($ext, $allowed_exts)) {
                $_SESSION['flash_error'] = "Invalid file extension. Only MP3, WAV, and OGG are allowed.";
                header("Location: index.php?tab=voice_templates");
                exit;
            }
            
            $target_dir = __DIR__ . '/../uploads/voice_templates/';
            if (!is_dir($target_dir)) {
                mkdir($target_dir, 0755, true);
            }
            
            $filename = 'template_' . time() . '_' . rand(1000, 9999) . '.' . $ext;
            $audio_file_path = 'uploads/voice_templates/' . $filename;
            
            if (!move_uploaded_file($file['tmp_name'], $target_dir . $filename)) {
                $_SESSION['flash_error'] = "Failed to upload audio file. Check folder permissions.";
                header("Location: index.php?tab=voice_templates");
                exit;
            }
        }
        
        try {
            if ($template_id > 0) {
                // Verify ownership if not Admin
                if (!hasRole('Admin')) {
                    $verify = safeFetch($pdo, "SELECT id FROM voice_templates WHERE id = ? AND staff_id = ?", [$template_id, $owner_id]);
                    if (!$verify) {
                        throw new Exception("Access Denied: Voice Template not found or unauthorized.");
                    }
                }
                
                // If new audio file not uploaded, retain old path
                if ($audio_file_path === null) {
                    $stmt = $pdo->prepare("UPDATE voice_templates SET name=?, type=?, message_text=?, language=? WHERE id=?");
                    $stmt->execute([$name, $type, $message_text, $language, $template_id]);
                } else {
                    // Delete old file if exists
                    $old_path = $pdo->query("SELECT audio_file_path FROM voice_templates WHERE id = $template_id")->fetchColumn();
                    if ($old_path && file_exists(__DIR__ . '/../' . $old_path)) {
                        @unlink(__DIR__ . '/../' . $old_path);
                    }
                    
                    $stmt = $pdo->prepare("UPDATE voice_templates SET name=?, type=?, message_text=?, audio_file_path=?, language=? WHERE id=?");
                    $stmt->execute([$name, $type, $message_text, $audio_file_path, $language, $template_id]);
                }
                $_SESSION['flash_msg'] = "Voice template updated successfully!";
            } else {
                $stmt = $pdo->prepare("INSERT INTO voice_templates (staff_id, name, type, message_text, audio_file_path, language) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$owner_id, $name, $type, $message_text, $audio_file_path, $language]);
                $_SESSION['flash_msg'] = "Voice template created successfully!";
            }
        } catch (Exception $e) {
            $_SESSION['flash_error'] = "Database Error: " . $e->getMessage();
        }
        
        header("Location: index.php?tab=voice_templates");
        exit;
        
    case 'delete_voice_template':
        $template_id = intval($_GET['id'] ?? 0);
        if ($template_id > 0) {
            try {
                // Verify ownership if not Admin
                if (!hasRole('Admin')) {
                    $verify = safeFetch($pdo, "SELECT id FROM voice_templates WHERE id = ? AND staff_id = ?", [$template_id, $owner_id]);
                    if (!$verify) {
                        throw new Exception("Access Denied: Voice Template not found or unauthorized.");
                    }
                }
                
                $old_path = $pdo->query("SELECT audio_file_path FROM voice_templates WHERE id = $template_id")->fetchColumn();
                if ($old_path && file_exists(__DIR__ . '/../' . $old_path)) {
                    @unlink(__DIR__ . '/../' . $old_path);
                }
                $pdo->prepare("DELETE FROM voice_templates WHERE id=?")->execute([$template_id]);
                $_SESSION['flash_msg'] = "Voice template deleted successfully.";
            } catch (Exception $e) {
                $_SESSION['flash_error'] = "Error: " . $e->getMessage();
            }
        }
        header("Location: index.php?tab=voice_templates");
        exit;
        
    // Bulk Voice SMS / Campaigns Scheduler
    case 'create_voice_campaign':
        $campaign_name = trim($_POST['campaign_name'] ?? 'Custom Broadcast');
        $target = trim($_POST['target'] ?? 'expired'); // 'expired', 'due', 'all'
        $template_id = intval($_POST['template_id'] ?? 0);
        $scheduled_at = trim($_POST['scheduled_at'] ?? date('Y-m-d H:i:s'));
        
        if (empty($campaign_name) || $template_id <= 0) {
            $_SESSION['flash_error'] = "Campaign name and voice message template are required.";
            header("Location: index.php?tab=voice_sms");
            exit;
        }
        
        // Load Template and verify ownership
        if (hasRole('Admin')) {
            $template = safeFetch($pdo, "SELECT * FROM voice_templates WHERE id = ?", [$template_id]);
        } else {
            $template = safeFetch($pdo, "SELECT * FROM voice_templates WHERE id = ? AND staff_id = ?", [$template_id, $owner_id]);
        }
        
        if (!$template) {
            $_SESSION['flash_error'] = "Selected Voice Template not found.";
            header("Location: index.php?tab=voice_sms");
            exit;
        }
        
        // Setup client scope filtering
        $where_scope = "";
        $params_users = [];
        if ($managed_ids !== 'ALL') {
            $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
            $where_scope = " AND manager_id IN ($placeholders)";
            $params_users = $managed_ids;
        }
        
        // Find targeted users
        $today = date('Y-m-d');
        if ($target === 'expired') {
            // Packages whose expiration date has passed today
            $users = safeFetchAll($pdo, "SELECT id, name, phone, user_package, bill_amount, due, current_bill_date FROM " . TBL_USERS . " WHERE current_bill_date < ? AND status = 'Active' $where_scope", array_merge([$today], $params_users));
        } elseif ($target === 'due') {
            // Packages that have a positive due balance outstanding
            $users = safeFetchAll($pdo, "SELECT id, name, phone, user_package, bill_amount, due, current_bill_date FROM " . TBL_USERS . " WHERE due > 0 $where_scope", $params_users);
        } else {
            // Active users
            $users = safeFetchAll($pdo, "SELECT id, name, phone, user_package, bill_amount, due, current_bill_date FROM " . TBL_USERS . " WHERE status = 'Active' $where_scope", $params_users);
        }
        
        if (empty($users)) {
            $_SESSION['flash_error'] = "No clients matched the target criteria ('$target'). Campaign queue skipped.";
            header("Location: index.php?tab=voice_sms");
            exit;
        }
        
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("INSERT INTO voice_sms_queue (tenant_id, staff_id, customer_id, phone, template_id, campaign_name, audio_file, text_message, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            
            $count = 0;
            foreach ($users as $u) {
                if (empty($u['phone']) || !validate_phone($u['phone'])) continue;
                
                // Replace message dynamic placeholders
                $bill_amt = floatval($u['bill_amount']);
                $due_amt = floatval($u['due']);
                $expiry = !empty($u['current_bill_date']) ? date('d-m-Y', strtotime($u['current_bill_date'])) : 'N/A';
                
                $body_text = str_replace(
                    ['[NAME]', '[ID]', '[AMOUNT]', '[DATE]', '[PACKAGE]'],
                    [$u['name'], $u['phone'], $due_amt ?: $bill_amt, $expiry, $u['user_package']],
                    $template['message_text']
                );
                
                $stmt->execute([
                    $tenant_id,
                    $owner_id,
                    $u['id'],
                    $u['phone'],
                    $template_id,
                    $campaign_name,
                    $template['audio_file_path'],
                    $body_text,
                    $scheduled_at
                ]);
                $count++;
            }
            
            $pdo->commit();
            writeLog($pdo, $staff_name, 'Voice Campaign Queued', 0, "Created campaign '$campaign_name' ($target) with $count calls in queue.");
            $_SESSION['flash_msg'] = "Voice campaign created successfully! $count clients added to call queue.";
        } catch (Exception $e) {
            $pdo->rollBack();
            $_SESSION['flash_error'] = "DB Campaign Error: " . $e->getMessage();
        }
        
        header("Location: index.php?tab=voice_sms");
        exit;
        
    default:
        // Render nothing / bad request
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Invalid controller action.']);
        exit;
}
