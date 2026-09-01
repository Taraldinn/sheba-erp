<?php
ob_start();

// Custom error log handler to catch 500 errors
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        $log_message = "[" . date('Y-m-d H:i:s') . "] Fatal Error: " . $error['message'] . " in " . $error['file'] . " on line " . $error['line'] . "\n";
        file_put_contents(__DIR__ . '/debug_request.log', $log_message, FILE_APPEND);
    }
});

set_exception_handler(function($e) {
    $log_message = "[" . date('Y-m-d H:i:s') . "] Uncaught Exception: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine() . "\nStack trace:\n" . $e->getTraceAsString() . "\n";
    file_put_contents(__DIR__ . '/debug_request.log', $log_message, FILE_APPEND);
});

// MAIN ENTRY POINT
// file_put_contents(__DIR__ . '/debug_request.log', date('Y-m-d H:i:s') . " | URI: " . $_SERVER['REQUEST_URI'] . " | POST: " . json_encode($_POST) . " | User: " . ($_SESSION['admin_id'] ?? 'NONE') . "\n", FILE_APPEND);

require_once __DIR__ . '/includes/config.php';
// Auto-migrate schema
try {
    $colExists = $pdo->query("SHOW COLUMNS FROM tenant_payment_gateways LIKE 'account_type'")->rowCount() > 0;
    if (!$colExists) {
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN account_type ENUM('Merchant', 'Personal Retail', 'Personal') DEFAULT 'Personal'");
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN instruction_type ENUM('Payment', 'Send Money') DEFAULT 'Send Money'");
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN display_name VARCHAR(100) DEFAULT ''");
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN qr_image_url VARCHAR(255) NULL");
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN checkout_enabled TINYINT(1) DEFAULT 0");
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN checkout_expiry_mins INT DEFAULT 10");
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN min_amount DECIMAL(10,2) DEFAULT 10.00");
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN max_amount DECIMAL(10,2) DEFAULT 25000.00");
        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN auto_activate TINYINT(1) DEFAULT 1");
    }
} catch (Exception $e) {}

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS payment_intents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        public_token VARCHAR(64) NOT NULL UNIQUE,
        tenant_id VARCHAR(50) DEFAULT NULL,
        manager_id INT DEFAULT 0,
        customer_id INT DEFAULT 0,
        entity_type ENUM('customer', 'staff') DEFAULT 'customer',
        invoice_id VARCHAR(50) DEFAULT NULL,
        gateway_id INT NOT NULL,
        gateway_name VARCHAR(20) NOT NULL,
        payer_mobile VARCHAR(20) DEFAULT NULL,
        receiver_mobile VARCHAR(20) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'BDT',
        status ENUM('created', 'waiting', 'processing', 'paid', 'expired', 'cancelled', 'failed', 'review') DEFAULT 'created',
        provider_trx_id VARCHAR(50) DEFAULT NULL,
        matched_sms_log_id INT DEFAULT NULL,
        expires_at DATETIME NOT NULL,
        detected_at DATETIME NULL,
        paid_at DATETIME NULL,
        client_ip VARCHAR(45) NULL,
        user_agent TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX(public_token),
        INDEX(gateway_id),
        INDEX(status),
        INDEX(expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Exception $e) {}

require_once __DIR__ . '/includes/functions.php';

// Fetch Global Settings
$company_name = get_opt($pdo, 'company_name', 'ISP Billing');
$footer_text = get_opt($pdo, 'footer_text', '&copy; '.date('Y').' ISP Billing. All rights reserved.');
$piprapay_api_key = get_opt($pdo, 'piprapay_api_key', '');
$piprapay_url = get_opt($pdo, 'piprapay_url', 'https://pay.donet.work.gd/api/create-charge');

// --- CLIENT PANEL ROUTER ---
if (isset($_GET['panel']) && $_GET['panel'] === 'client') {
    require_once __DIR__ . '/controllers/client_controller.php';
    exit;
}


// --- LOCALIZATION ---
if (!isset($_SESSION['lang'])) $_SESSION['lang'] = 'en'; 
if (isset($_GET['lang'])) {
    $_SESSION['lang'] = ($_GET['lang'] === 'bn') ? 'bn' : 'en';
    header("Location: " . strtok($_SERVER["REQUEST_URI"], '?') . '?' . http_build_query(array_diff_key($_GET, ['lang' => 0])));
    exit();
}

require_once __DIR__ . '/classes/MikrotikApp.php';
require_once __DIR__ . '/classes/PipraPayGateway.php';
$tab = $_GET['tab'] ?? '';

// Public Routes (Bypass logic.php redirects)
if ($tab === 'payment_callback' || isset($_GET['bkash_callback']) || isset($_GET['nagad_callback']) || isset($_GET['payment_callback']) || isset($_GET['sslcz_callback'])) {
    require_once __DIR__ . '/controllers/payment_callback.php';
    exit;
}
if ($tab === 'forgot_password') {
    require_once __DIR__ . '/views/auth/forgot_password.php';
    exit;
}
if ($tab === 'reset_password') {
    require_once __DIR__ . '/views/auth/reset_password.php';
    exit;
}
if ($tab === 'quick_pay') {
    require_once __DIR__ . '/views/auth/quick_pay.php';
    exit;
}
if (isLoggedIn()) {
    if (!isset($_SESSION['indexes_verified'])) {
        ensure_database_indexes($pdo);
        $_SESSION['indexes_verified'] = true;
    }
    require_once __DIR__ . '/controllers/store_controller.php';
    require_once __DIR__ . '/controllers/hr_controller.php';
    try {
        require_once __DIR__ . '/controllers/task_controller.php';
    } catch (Throwable $e) {
        error_log("Task Controller load failed: " . $e->getMessage());
    }
    

    // Usage Actions Route
    $current_action = $_GET['action'] ?? $_POST['action'] ?? '';
    $usage_actions = ['get_live_usage', 'get_usage_charts', 'get_usage_reports_data', 'check_router_status', 'sync_now'];
    if (in_array($current_action, $usage_actions)) {
        require_once __DIR__ . '/controllers/usage_controller.php';
    }
}

require_once __DIR__ . '/controllers/logic.php'; // Logic for POST/GET actions

if (!isLoggedIn()) {
    require_once __DIR__ . '/views/auth/login.php';
} else {
    // Load common data required for views
    require_once __DIR__ . '/controllers/view_data.php'; 
    
    // Header
    if (!isset($_GET['ajax'])) {
        require_once __DIR__ . '/views/layout/header.php';
    }
    
    // Route to View
    $tab = $_GET['tab'] ?? 'dashboard';
    if(isset($_GET['view_id'])) $tab = 'client_profile';
    
    // Specific routing logic
    if ($tab == 'dashboard') {
        if (!empty($is_pure_employee)) {
            require __DIR__ . '/views/dashboard/dashboard.php';
        } elseif (isOffice() && !hasRole('Admin') && !hasPermission('dashboard')) {
            if (hasPermission('resellers')) {
                require __DIR__ . '/views/staff/agents.php';
            } else {
                echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. You do not have permission to access the Dashboard.</div></div>";
            }
        } else {
            require __DIR__ . '/views/dashboard/dashboard.php';
        }
    }
    elseif ($tab == 'configuration' && (((hasRole('Reseller') || hasRole('SubReseller')) && !isOffice()) || hasPermission('config'))) {
        require __DIR__ . '/views/settings/configuration.php';
    }
    elseif ($tab == 'offers' && (((hasRole('SubReseller') || hasRole('Reseller')) && !isOffice()) || hasPermission('offers'))) {
        require __DIR__ . '/views/finance/offers.php';
    }
    elseif ($tab == 'add_client' && (((hasRole('SubReseller') || hasRole('Reseller')) && !isOffice()) || hasRole('Admin') || hasPermission('add_client'))) {
        require __DIR__ . '/views/clients/add_client.php';
    }
    elseif (in_array($tab, ['clients', 'due', 'due_clients', 'active', 'left_list', 'inactive', 'free_clients', 'new_clients', 'expire_today', 'expire_in_2days', 'expire_in_3days', 'total_clients', 'promise_active']) && (hasRole('Admin') || hasRole('Reseller') || 
        (in_array($tab, ['clients', 'active', 'free_clients', 'due_clients', 'new_clients', 'expire_today', 'expire_in_2days', 'expire_in_3days', 'total_clients', 'promise_active']) && hasPermission('clients_active')) ||
        ($tab == 'inactive' && hasPermission('clients_inactive')) ||
        ($tab == 'due' && hasPermission('clients_due')) ||
        ($tab == 'left_list' && hasPermission('clients_left'))
    )) {
        require __DIR__ . '/views/clients/clients.php'; 
    }
    elseif ($tab == 'client_profile' && (hasPermission('clients_active') || hasRole('Admin') || hasRole('Reseller'))) {
        require __DIR__ . '/views/profile.php';
    }
    elseif ($tab == 'edit_client' && (hasRole('Reseller') || hasRole('Admin') || hasPermission('clients_active'))) {
        require __DIR__ . '/views/clients/edit_client.php';
    }
    elseif ($tab == 'online_clients' && (hasPermission('monitoring') || hasRole('Reseller'))) {
        require __DIR__ . '/views/clients/online_clients.php';
    }
    elseif ($tab == 'usage_dashboard' && (hasRole('Admin') || hasPermission('monitoring')) && (!isOffice() || hasPermission('dashboard'))) {
        $curr_role = $_SESSION['user_role'] ?? '';
        $is_partner = (strcasecmp($curr_role, 'Reseller') === 0 || strcasecmp($curr_role, 'SubReseller') === 0 || strcasecmp($curr_role, 'Sub-Reseller') === 0);
        $is_reseller_branch = ($is_partner || (isOffice() && !isSystemAuthority()));
        if ($is_reseller_branch) {
            echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. Bandwidth Usage is not available for Reseller/Branch panels.</div></div>";
        } else {
            require __DIR__ . '/views/dashboard/usage_dashboard.php';
        }
    }
    elseif ($tab == 'usage_reports' && (hasRole('Admin') || hasPermission('monitoring'))) {
        $curr_role = $_SESSION['user_role'] ?? '';
        $is_partner = (strcasecmp($curr_role, 'Reseller') === 0 || strcasecmp($curr_role, 'SubReseller') === 0 || strcasecmp($curr_role, 'Sub-Reseller') === 0);
        $is_reseller_branch = ($is_partner || (isOffice() && !isSystemAuthority()));
        if ($is_reseller_branch) {
            echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. Bandwidth Usage is not available for Reseller/Branch panels.</div></div>";
        } else {
            require __DIR__ . '/views/reports/usage_reports.php';
        }
    }
    elseif ($tab == 'manage_agents' && hasPermission('manage_agents')) {
        require __DIR__ . '/views/staff/manage_agents.php';
    }
    elseif (in_array($tab, ['agents', 'left_resellers']) && (hasPermission('resellers') || hasRole('Admin'))) {
        if ($tab == 'agents') require __DIR__ . '/views/staff/agents.php';
        if ($tab == 'left_resellers') require __DIR__ . '/views/staff/left_resellers.php';
    }
    elseif (in_array($tab, ['routers', 'olt', 'olt_onus', 'network_topology']) && (hasPermission('routers_olt') || hasRole('Admin') || hasRole('Reseller'))) {
        if ($tab == 'routers') require __DIR__ . '/views/networking/routers.php';
        if ($tab == 'olt') require __DIR__ . '/views/networking/olt.php';
        if ($tab == 'olt_onus') require __DIR__ . '/views/networking/olt_onus.php';
        if ($tab == 'network_topology') require __DIR__ . '/views/networking/network_topology.php';
    }
    elseif ($tab == 'services' && (hasPermission('packages') || hasRole('Admin'))) {
        require __DIR__ . '/views/services/services.php';
    }
    elseif ($tab == 'reports' && (hasPermission('wallet_deposit') || hasRole('Admin'))) {
        require __DIR__ . '/views/reports/reports.php';
    }
    elseif ($tab == 'monthly_sales' && (hasPermission('wallet_deposit') || hasRole('Admin') || hasRole('Reseller'))) {
        require __DIR__ . '/views/reports/monthly_sales.php';
    }
    elseif ($tab == 'bulk_statement' && (hasPermission('wallet_deposit') || hasRole('Admin') || hasRole('Reseller') || hasRole('SubReseller'))) {
        require __DIR__ . '/views/reports/bulk_statement.php';
    }
    elseif ($tab == 'finance' && (hasPermission('wallet_deposit') || hasRole('Admin'))) {
        require __DIR__ . '/views/finance/finance.php';
    }
    elseif ($tab == 'tickets') {
        require __DIR__ . '/views/tickets.php';
    }
    elseif ($tab == 'recharge_invoice' && (hasPermission('clients_active') || hasRole('Admin') || hasRole('Reseller'))) {
        require __DIR__ . '/views/client/recharge_invoice.php';
    }

    elseif (in_array($tab, ['store_inventory', 'store_sales', 'store_support', 'store_reports', 'store_sales_invoice'])) {
        require __DIR__ . '/views/store/' . str_replace('store_', '', $tab) . '.php';
    }
    elseif ($tab == 'settings' && (hasPermission('settings') || hasRole('Admin') || hasRole('Reseller'))) {

        require __DIR__ . '/views/settings/settings.php';
    }
    elseif (in_array($tab, ['payment_verification_dashboard', 'payment_verification_gateways']) && (hasPermission('settings') || hasRole('Admin') || hasRole('Reseller'))) {
        require __DIR__ . '/views/settings/' . $tab . '.php';
    }
    elseif ($tab == 'activity' && (hasPermission('activity_log') || hasRole('Admin') || ((hasRole('Reseller') || hasRole('SubReseller')) && !isOffice()) || (isset($_SESSION['user_role']) && in_array(strtolower(trim($_SESSION['user_role'])), ['pop', 'branch'])))) {
        require __DIR__ . '/views/reports/activity.php';
    }
    elseif ($tab == 'error_logs' && (hasPermission('activity_log') || hasRole('Admin') || (hasRole('Reseller') && !isOffice()))) {
        require __DIR__ . '/views/reports/error_logs.php';
    }
    elseif ($tab == 'sms_logs' && (hasPermission('activity_log') || hasRole('Admin') || (hasRole('Reseller') && !isOffice()))) {
        require __DIR__ . '/views/reports/sms_logs.php';
    }
    elseif ($tab == 'voice_logs' && (hasPermission('voice_logs') || hasRole('Admin') || (hasRole('Reseller') && !isOffice()))) {
        require __DIR__ . '/views/reports/voice_logs.php';
    }
    elseif ($tab == 'profile' && (hasPermission('settings') || hasRole('Admin') || hasRole('Reseller'))) {
        require __DIR__ . '/views/settings/profile.php';
    }
    elseif (in_array($tab, ['hr_dashboard', 'hr_employees', 'hr_attendance', 'hr_leaves', 'hr_payroll', 'hr_advance', 'hr_policy', 'hr_reports'])) {
        if (hasRole('Admin') || hasPermission('hr_view_employees') || hasPermission('hr_attendance') || hasPermission('hr_payroll') || hasPermission('hr_policy')) {
            if ($tab === 'hr_dashboard' && isOffice() && !hasRole('Admin') && !hasPermission('dashboard')) {
                echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. You do not have permission to access the Dashboard.</div></div>";
            } else {
                require __DIR__ . '/views/hr/' . $tab . '.php';
            }
        } else {
            echo "<div class='alert alert-danger'>Access Denied.</div>";
        }
    }
    elseif ($tab == 'office_staff' && (hasRole('Admin') || hasRole('Reseller') || hasPermission('office_staff'))) {
        require __DIR__ . '/views/staff/office_staff.php';
    }
    elseif (in_array($tab, ['staff', 'left_staff']) && (hasRole('Reseller') || hasRole('Admin'))) {
        require __DIR__ . '/views/staff/staff.php';
    }
    elseif ($tab == 'accounts' && (strcasecmp($_SESSION['user_role'] ?? '', 'Reseller') === 0 || strcasecmp($_SESSION['user_role'] ?? '', 'SubReseller') === 0 || (isOffice() && !isSystemAuthority() && hasPermission('wallet_deposit')))) {
        require __DIR__ . '/views/finance/accounts.php';
    }
    elseif ($tab == 'my_rates' && (strcasecmp($_SESSION['user_role'] ?? '', 'Reseller') === 0 || strcasecmp($_SESSION['user_role'] ?? '', 'SubReseller') === 0 || strcasecmp($_SESSION['user_role'] ?? '', 'Sub-Reseller') === 0 || (isOffice() && !isSystemAuthority()))) {
        require __DIR__ . '/views/finance/my_rates.php';
    }
    elseif ($tab == 'reseller_statement' && (hasRole('Reseller') || hasRole('Admin') || hasRole('Supervisor'))) {
        require __DIR__ . '/views/finance/reseller_statement.php';
    }
    elseif (in_array($tab, ['self_profile', 'self_leave', 'self_salary'])) {
        $emp_check = safeFetch($pdo, "SELECT id FROM " . TBL_HR_EMPLOYEES . " WHERE staff_user_id = ? AND employment_status='Active'", [$_SESSION['admin_id'] ?? 0]);
        if ($emp_check) {
            require __DIR__ . '/views/hr/' . $tab . '.php';
        } else {
            echo "<div class='alert alert-danger'>Access Denied. You are not mapped to an active employee profile.</div>";
        }
    }
    elseif (in_array($tab, ['task_dashboard', 'tasks_all', 'tasks_my', 'tasks_create', 'tasks_calendar', 'tasks_recurring', 'tasks_templates', 'tasks_completed', 'tasks_reports', 'tasks_settings', 'tasks_details'])) {
        $view_map = [
            'task_dashboard' => 'dashboard',
            'tasks_all' => 'all',
            'tasks_my' => 'my',
            'tasks_create' => 'create',
            'tasks_calendar' => 'calendar',
            'tasks_recurring' => 'recurring',
            'tasks_templates' => 'templates',
            'tasks_completed' => 'completed',
            'tasks_reports' => 'reports',
            'tasks_settings' => 'settings',
            'tasks_details' => 'details'
        ];
        $target_view = $view_map[$tab];
        if (hasRole('Admin') || hasRole('Reseller') || hasPermission('task.view') || in_array($tab, ['tasks_my', 'tasks_details', 'task_dashboard', 'tasks_calendar'])) {
            try {
                require __DIR__ . '/views/tasks/' . $target_view . '.php';
            } catch (Throwable $e) {
                echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><h5 class='fw-semibold'><i class='fas fa-exclamation-triangle me-2'></i>Error Loading Task Panel:</h5><p class='mb-0'>" . htmlspecialchars($e->getMessage()) . "</p><pre class='mt-2 bg-light p-2 rounded small text-dark' style='white-space: pre-wrap;'>" . htmlspecialchars($e->getTraceAsString()) . "</pre></div></div>";
            }
        } else {
            echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. You do not have permission to access this page.</div></div>";
        }
    }
    else {
        // Default fallbacks
        $office_roles = ['administrator', 'supervisor', 'office manager', 'system admin', 'tl', 'executive', 'staff'];
        if (!empty($is_pure_employee)) {
             require_once __DIR__ . '/views/dashboard/dashboard.php';
        } elseif (in_array(strtolower($role), $office_roles) || (hasRole('Supervisor') && !hasRole('Admin'))) {
             if (hasPermission('dashboard')) {
                 require_once __DIR__ . '/views/dashboard/dashboard.php';
             } elseif (hasPermission('resellers')) {
                 require_once __DIR__ . '/views/staff/agents.php';
             } else {
                 echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. You do not have permission to access this page.</div></div>";
             }
        } else {
             require_once __DIR__ . '/views/dashboard/dashboard.php';
        }
    }

    // Footer
    if (!isset($_GET['ajax'])) {
        require_once __DIR__ . '/views/layout/footer.php';
    }
}
?>
