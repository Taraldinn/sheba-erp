<?php
if (session_status() == PHP_SESSION_NONE) {
    $is_secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || 
                 (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) || 
                 (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    ini_set('session.cookie_secure', $is_secure ? '1' : '0');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $is_secure,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}
header_remove('X-Powered-By');

// --- DEPLOYMENT AND SESSION UPGRADE GUARD ---
require_once __DIR__ . '/tenant.php'; // Ensure tenant detection runs first
if (!defined('APP_DEPLOYMENT_ID')) {
    define('APP_DEPLOYMENT_ID', '20260629_153151');
}
if (php_sapi_name() !== 'cli') {
    header("X-App-Deployment-Id: " . APP_DEPLOYMENT_ID);
}

if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    $expected_tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
    
    // 1. Upgrade missing tenant_id to preserve active sessions from old deployments
    if (!isset($_SESSION['tenant_id'])) {
        $_SESSION['tenant_id'] = $expected_tenant;
    }

    // 2. Structural compatibility check (ensure critical session fields exist)
    $required_keys = ['admin_id', 'admin_username', 'user_role'];
    $is_compatible = true;
    foreach ($required_keys as $key) {
        if (!isset($_SESSION[$key])) {
            $is_compatible = false;
            break;
        }
    }

    if (!$is_compatible) {
        // Destroy old invalid session and force clean login
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();
        header("Location: ./");
        exit;
    }

    // 3. Deployment check: regenerate CSRF token and update deployment ID
    if (!isset($_SESSION['app_deployment_id'])) {
        $_SESSION['app_deployment_id'] = APP_DEPLOYMENT_ID;
    } elseif ($_SESSION['app_deployment_id'] !== APP_DEPLOYMENT_ID) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        $_SESSION['app_deployment_id'] = APP_DEPLOYMENT_ID;
    }
}


// --- LOAD ROOT ENV ---
if (file_exists(__DIR__ . '/../.env')) {
    $env_lines = file(__DIR__ . '/../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($env_lines as $env_line) {
        $env_line = trim($env_line);
        if ($env_line === '' || strpos($env_line, '#') === 0) continue;
        if (strpos($env_line, '=') !== false) {
            list($name, $value) = explode('=', $env_line, 2);
            $name = trim($name);
            $value = trim($value);
            // Remove surrounding quotes from value
            $value = preg_replace('/^["\']|["\']$/', '', $value);
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
            putenv("$name=$value");
        }
    }
}

// --- CONFIG ERROR REPORTING ---
if (!defined('APP_ENV')) {
    define('APP_ENV', $_ENV['APP_ENV'] ?? 'production');
}
if (!defined('APP_DEBUG')) {
    define('APP_DEBUG', isset($_ENV['APP_DEBUG']) ? filter_var($_ENV['APP_DEBUG'], FILTER_VALIDATE_BOOLEAN) : false);
}

if (defined('APP_DEBUG') && APP_DEBUG) {
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    ini_set('display_startup_errors', '0');
    ini_set('log_errors', '1');
    error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
}

// Set global php error log path safely outside public directory
$log_dir = __DIR__ . '/../logs';
if (!is_dir($log_dir)) {
    @mkdir($log_dir, 0755, true);
    @file_put_contents($log_dir . '/.htaccess', "Order deny,allow\nDeny from all\n");
}
ini_set('error_log', $log_dir . '/php_error.log');


function get_csrf_token() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

define('LOG_PATH', __DIR__ . '/../logs');
if (!is_dir(LOG_PATH)) {
    @mkdir(LOG_PATH, 0755, true);
    @file_put_contents(LOG_PATH . '/.htaccess', "Order deny,allow\nDeny from all\n");
}

function inject_csp_nonce($buffer) {
    // Check if the response is HTML.
    $is_html = false;
    foreach (headers_list() as $header) {
        if (stripos($header, 'Content-Type:') === 0) {
            if (stripos($header, 'text/html') !== false) {
                $is_html = true;
            }
            break;
        }
    }
    if (!$is_html && (stripos($buffer, '<html') !== false || stripos($buffer, '<body') !== false || stripos($buffer, '<script') !== false)) {
        $is_html = true;
    }

    if (!$is_html) {
        return $buffer;
    }

    $token = get_csrf_token();

    // 1. Inject CSRF Token into all POST forms dynamically
    $buffer = preg_replace_callback('/(<form\b[^>]*method=["\']post["\'][^>]*>)/i', function($matches) use ($token) {
        return $matches[1] . "\n" . '<input type="hidden" name="csrf_token" value="' . $token . '">';
    }, $buffer);

    // 2. Inject CSRF helper script to automatically add X-CSRF-Token header to all jQuery/Fetch/XHR AJAX requests and monitor deployment version
    $ajax_script = "\n" . '<script>' . "
    document.addEventListener('DOMContentLoaded', function() {
        window.APP_DEPLOYMENT_ID = '" . APP_DEPLOYMENT_ID . "';
        
        function clearAppStorage() {
            if (window.localStorage) {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith('profile_session_') || key === 'app_deployment_id')) {
                        localStorage.removeItem(key);
                    }
                }
            }
            if (window.sessionStorage) {
                for (let i = sessionStorage.length - 1; i >= 0; i--) {
                    const key = sessionStorage.key(i);
                    if (key && (key.startsWith('profile_session_') || key === 'app_deployment_id')) {
                        sessionStorage.removeItem(key);
                    }
                }
            }
        }
        
        function handleDeploymentMismatch(newDepId) {
            clearAppStorage();
            if (window.localStorage) {
                localStorage.setItem('app_deployment_id', newDepId);
            }
            window.location.reload(true);
        }
        
        if (window.localStorage) {
            const lastVersion = localStorage.getItem('app_deployment_id');
            if (lastVersion && lastVersion !== window.APP_DEPLOYMENT_ID) {
                clearAppStorage();
                localStorage.setItem('app_deployment_id', window.APP_DEPLOYMENT_ID);
            } else {
                localStorage.setItem('app_deployment_id', window.APP_DEPLOYMENT_ID);
            }
        }

        if (window.jQuery) {
            jQuery(document).ajaxSend(function(event, xhr, settings) {
                if (!/^(GET|HEAD|OPTIONS|TRACE)$/i.test(settings.type)) {
                    xhr.setRequestHeader('X-CSRF-Token', '" . $token . "');
                }
            });
            jQuery(document).ajaxComplete(function(event, xhr, settings) {
                const depId = xhr.getResponseHeader('X-App-Deployment-Id');
                if (depId && depId !== window.APP_DEPLOYMENT_ID) {
                    handleDeploymentMismatch(depId);
                }
            });
        }
        if (window.fetch) {
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                let resource = args[0];
                let options = args[1];
                try {
                    if (resource instanceof Request) {
                        if (!/^(GET|HEAD|OPTIONS|TRACE)$/i.test(resource.method)) {
                            resource.headers.set('X-CSRF-Token', '" . $token . "');
                        }
                    } else if (options && options.method && !/^(GET|HEAD|OPTIONS|TRACE)$/i.test(options.method)) {
                        if (!options.headers) {
                            options.headers = {};
                        }
                        if (options.headers instanceof Headers) {
                            options.headers.set('X-CSRF-Token', '" . $token . "');
                        } else if (Array.isArray(options.headers)) {
                            let hasToken = false;
                            for (let h of options.headers) {
                                if (h[0].toLowerCase() === 'x-csrf-token') { hasToken = true; break; }
                            }
                            if (!hasToken) options.headers.push(['X-CSRF-Token', '" . $token . "']);
                        } else {
                            options.headers['X-CSRF-Token'] = '" . $token . "';
                        }
                    }
                } catch (e) {
                    // Safe guard
                }
                const response = await originalFetch.apply(this, args);
                try {
                    const depId = response.headers.get('X-App-Deployment-Id');
                    if (depId && depId !== window.APP_DEPLOYMENT_ID) {
                        handleDeploymentMismatch(depId);
                    }
                } catch (e) {}
                return response;
            };
        }
        if (window.XMLHttpRequest) {
            const open = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                this._method = method;
                return open.apply(this, arguments);
            };
            const send = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function(body) {
                try {
                    if (this._method && !/^(GET|HEAD|OPTIONS|TRACE)$/i.test(this._method)) {
                        this.setRequestHeader('X-CSRF-Token', '" . $token . "');
                    }
                } catch (e) {
                    // Safe guard
                }
                this.addEventListener('readystatechange', function() {
                    if (this.readyState === 4) {
                        try {
                            const depId = this.getResponseHeader('X-App-Deployment-Id');
                            if (depId && depId !== window.APP_DEPLOYMENT_ID) {
                                handleDeploymentMismatch(depId);
                            }
                        } catch (e) {}
                    }
                });
                return send.apply(this, arguments);
            };
        }
    });
    </script>\n";

    if (stripos($buffer, '</head>') !== false) {
        $buffer = str_ireplace('</head>', $ajax_script . '</head>', $buffer);
    } else {
        $buffer .= $ajax_script;
    }

    return $buffer;
}

ob_start('inject_csp_nonce');

date_default_timezone_set('Asia/Dhaka'); 

// --- AUTOLOAD ---
if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
    require_once __DIR__ . '/../vendor/autoload.php';
}

// --- SECURITY & CONFIGURATION ---
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mask_helper.php';

// Ensure PDO error mode is correct for migration script below
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT); 

// --- TABLE DEFINITIONS ---
if (!defined('TBL_USERS')) define('TBL_USERS', 'users');
if (!defined('TBL_ROUTERS')) define('TBL_ROUTERS', 'routers');
if (!defined('TBL_SERVICES')) define('TBL_SERVICES', 'mikrotik_services');
if (!defined('TBL_LOGS')) define('TBL_LOGS', 'audit_log');
if (!defined('TBL_STAFF')) define('TBL_STAFF', 'staff');
if (!defined('TBL_PRICING')) define('TBL_PRICING', 'service_pricing');
if (!defined('TBL_SELL_PRICING')) define('TBL_SELL_PRICING', 'staff_sell_pricing');
if (!defined('TBL_AGENT_COMM')) define('TBL_AGENT_COMM', 'agent_commissions');
if (!defined('TBL_AGENTS')) define('TBL_AGENTS', 'agents');
if (!defined('TBL_SETTINGS')) define('TBL_SETTINGS', 'settings');
if (!defined('TBL_TX')) define('TBL_TX', 'transactions');
if (!defined('TBL_ONLINE_PAY')) define('TBL_ONLINE_PAY', 'payment_gateway_logs');
if (!defined('TBL_ZONES')) define('TBL_ZONES', 'zones');
if (!defined('TBL_TJ_BOXES')) define('TBL_TJ_BOXES', 'tj_boxes');
if (!defined('TBL_OFFERS')) define('TBL_OFFERS', 'offers');
if (!defined('TBL_FIN_EXPENSES')) define('TBL_FIN_EXPENSES', 'fin_expenses');
if (!defined('TBL_FIN_CASHBOOK')) define('TBL_FIN_CASHBOOK', 'fin_cashbook');
if (!defined('TBL_STAFF_PROFIT')) define('TBL_STAFF_PROFIT', 'staff_profit_logs');
if (!defined('TBL_OLTS')) define('TBL_OLTS', 'olts');
if (!defined('TBL_SESSIONS')) define('TBL_SESSIONS', 'user_sessions');
if (!defined('TBL_DAILY_TRAFFIC')) define('TBL_DAILY_TRAFFIC', 'daily_traffic');
if (!defined('TBL_USAGE_LOGS')) define('TBL_USAGE_LOGS', 'user_usage_logs');
if (!defined('TBL_USAGE_LAST')) define('TBL_USAGE_LAST', 'user_usage_last');
if (!defined('TBL_SMS_LOGS')) define('TBL_SMS_LOGS', 'sms_logs');
if (!defined('TBL_TENANT_VPN')) define('TBL_TENANT_VPN', 'tenant_vpn');
if (!defined('TBL_STORE_CATEGORIES')) define('TBL_STORE_CATEGORIES', 'store_categories');
if (!defined('TBL_STORE_PRODUCTS')) define('TBL_STORE_PRODUCTS', 'store_products');
if (!defined('TBL_STORE_SALES')) define('TBL_STORE_SALES', 'store_sales');
if (!defined('TBL_STORE_SUPPORT')) define('TBL_STORE_SUPPORT', 'store_support_devices');
if (!defined('TBL_TENANT_PAYMENT_GATEWAYS')) define('TBL_TENANT_PAYMENT_GATEWAYS', 'tenant_payment_gateways');
if (!defined('TBL_PAYMENT_SMS_LOGS')) define('TBL_PAYMENT_SMS_LOGS', 'payment_sms_logs');
if (!defined('TBL_PAYMENT_REQUESTS')) define('TBL_PAYMENT_REQUESTS', 'payment_requests');
if (!defined('TBL_PAYMENT_INTENTS')) define('TBL_PAYMENT_INTENTS', 'payment_intents');
if (!defined('TBL_TENANT_WG')) define('TBL_TENANT_WG', 'tenant_wg');
if (!defined('TBL_TENANT_WG_SUBNETS')) define('TBL_TENANT_WG_SUBNETS', 'tenant_wg_subnets');

// --- HR & PAYROLL MODULE TABLE CONSTANTS ---
if (!defined('TBL_HR_EMPLOYEES')) define('TBL_HR_EMPLOYEES', 'hr_employees');
if (!defined('TBL_HR_ATTENDANCE')) define('TBL_HR_ATTENDANCE', 'hr_attendance');
if (!defined('TBL_HR_LEAVES')) define('TBL_HR_LEAVES', 'hr_leaves');
if (!defined('TBL_HR_LEAVE_BALANCES')) define('TBL_HR_LEAVE_BALANCES', 'hr_leave_balances');
if (!defined('TBL_HR_ADVANCE_SALARIES')) define('TBL_HR_ADVANCE_SALARIES', 'hr_advance_salaries');
if (!defined('TBL_HR_PAYROLL')) define('TBL_HR_PAYROLL', 'hr_payroll');
define('TBL_HR_HOLIDAYS', 'hr_holidays');
if (!defined('TBL_HR_POLICIES')) define('TBL_HR_POLICIES', 'hr_policies');

// --- CALL CENTER MODULE TABLE CONSTANTS ---
if (!defined('TBL_IP_PHONE_CONFIG')) define('TBL_IP_PHONE_CONFIG', 'ip_phone_configs');
if (!defined('TBL_IP_PHONE_NUMBERS')) define('TBL_IP_PHONE_NUMBERS', 'ip_phone_numbers');
if (!defined('TBL_CUSTOMER_FOLLOWUPS')) define('TBL_CUSTOMER_FOLLOWUPS', 'customer_followups');
if (!defined('TBL_CALL_LOGS')) define('TBL_CALL_LOGS', 'call_logs');
if (!defined('TBL_VOICE_TEMPLATES')) define('TBL_VOICE_TEMPLATES', 'voice_templates');
if (!defined('TBL_VOICE_SMS_QUEUE')) define('TBL_VOICE_SMS_QUEUE', 'voice_sms_queue');
if (!defined('TBL_VOICE_REMINDER_TRACKING')) define('TBL_VOICE_REMINDER_TRACKING', 'voice_reminder_tracking');
if (!defined('TBL_VOICE_BROADCASTS')) define('TBL_VOICE_BROADCASTS', 'voice_broadcasts');
if (!defined('TBL_VOICE_CALL_LOGS')) define('TBL_VOICE_CALL_LOGS', 'voice_call_logs');

// --- TASK MANAGEMENT SYSTEM MODULE TABLE CONSTANTS ---
if (!defined('TBL_TASK_CATEGORIES')) define('TBL_TASK_CATEGORIES', 'task_categories');
if (!defined('TBL_TASKS')) define('TBL_TASKS', 'tasks');
if (!defined('TBL_TASK_ASSIGNEES')) define('TBL_TASK_ASSIGNEES', 'task_assignees');
if (!defined('TBL_TASK_RECURRING_RULES')) define('TBL_TASK_RECURRING_RULES', 'task_recurring_rules');
if (!defined('TBL_TASK_ACTIVITY_LOGS')) define('TBL_TASK_ACTIVITY_LOGS', 'task_activity_logs');
if (!defined('TBL_TASK_ATTACHMENTS')) define('TBL_TASK_ATTACHMENTS', 'task_attachments');
if (!defined('TBL_TASK_TEMPLATES')) define('TBL_TASK_TEMPLATES', 'task_templates');
if (!defined('TBL_TASK_TEMPLATE_ITEMS')) define('TBL_TASK_TEMPLATE_ITEMS', 'task_template_items');

// --- DATABASE MIGRATION ---
try {
    // Session Tracking Tables
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_SESSIONS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        mikrotik_username VARCHAR(50) NOT NULL,
        router_id INT NOT NULL,
        session_key VARCHAR(64) NOT NULL,
        start_rx_bytes BIGINT DEFAULT 0,
        start_tx_bytes BIGINT DEFAULT 0,
        last_rx_bytes BIGINT DEFAULT 0,
        last_tx_bytes BIGINT DEFAULT 0,
        started_at DATETIME NOT NULL,
        ended_at DATETIME NULL,
        status ENUM('active', 'closed') DEFAULT 'active',
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX(client_id),
        INDEX(mikrotik_username),
        INDEX(status),
        UNIQUE KEY(session_key)
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_DAILY_TRAFFIC." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        traffic_date DATE NOT NULL,
        rx_bytes BIGINT DEFAULT 0,
        tx_bytes BIGINT DEFAULT 0,
        UNIQUE KEY(client_id, traffic_date)
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_USAGE_LOGS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT NULL,
        customer_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        router_id INT NOT NULL,
        usage_date DATE NOT NULL,
        download_bytes BIGINT DEFAULT 0,
        upload_bytes BIGINT DEFAULT 0,
        uptime_seconds INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_customer_date_router (customer_id, usage_date, router_id),
        INDEX idx_date (usage_date),
        INDEX idx_tenant (tenant_id),
        INDEX idx_customer (customer_id),
        INDEX idx_router (router_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_USAGE_LAST." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        router_id INT NOT NULL,
        last_bytes_in BIGINT DEFAULT 0,
        last_bytes_out BIGINT DEFAULT 0,
        last_uptime INT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_customer_router (customer_id, router_id),
        INDEX idx_customer_last (customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_USERS." (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), phone VARCHAR(20), address TEXT, user_id VARCHAR(50) UNIQUE, client_code VARCHAR(50) NULL, password VARCHAR(50), user_package VARCHAR(50), bill_amount DECIMAL(10,2), joining_date DATE, status VARCHAR(20) DEFAULT 'Active', router_id INT, manager_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, current_bill_date DATE, bill_position VARCHAR(20) DEFAULT 'Active', credit_taken TINYINT(1) DEFAULT 0, credit_days INT DEFAULT 0, phone2 VARCHAR(20), nid VARCHAR(50), onu_mac VARCHAR(50), connection_type VARCHAR(20), remarks TEXT, monthly_payments LONGTEXT, assigned_ip VARCHAR(50), zone_id INT DEFAULT 0, tj_box_name VARCHAR(100), due DECIMAL(10,2) DEFAULT 0, discount DECIMAL(10,2) DEFAULT 0)");
    
    // Migration: Add client_code if it doesn't exist
    $check_client_code = $pdo->query("SHOW COLUMNS FROM ".TBL_USERS." LIKE 'client_code'")->fetch();
    if (!$check_client_code) {
        $pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN client_code VARCHAR(50) NULL AFTER user_id");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_ROUTERS." (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), ip_address VARCHAR(50), username VARCHAR(50), api_password VARCHAR(50), port INT DEFAULT 8728, use_ssl BOOLEAN DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_SERVICES." (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), price DECIMAL(10,2), buying_price DECIMAL(10,2) DEFAULT 0, mikrotik_profile_name VARCHAR(100), rate_limit_profile VARCHAR(100), router_id INT DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_LOGS." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT DEFAULT 0, admin_user VARCHAR(50), action_type VARCHAR(50), target_id INT, description TEXT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(staff_id))");
    
    // Migration: Add staff_id if it doesn't exist
    $check_col = $pdo->query("SHOW COLUMNS FROM ".TBL_LOGS." LIKE 'staff_id'")->fetch();
    if (!$check_col) {
        $pdo->exec("ALTER TABLE ".TBL_LOGS." ADD COLUMN staff_id INT DEFAULT 0 AFTER id");
        $pdo->exec("ALTER TABLE ".TBL_LOGS." ADD INDEX(staff_id)");
    }
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_STAFF." (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), username VARCHAR(50) UNIQUE, password VARCHAR(50), role VARCHAR(20) DEFAULT 'Reseller', parent_id INT DEFAULT 0, balance DECIMAL(10,2) DEFAULT 0, advance_balance_limit DECIMAL(10,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'Active', router_id INT DEFAULT 0, due_balance DECIMAL(10,2) DEFAULT 0, agent_id INT DEFAULT 0, agent_commission DECIMAL(5,2) DEFAULT 0, commission_type VARCHAR(20) DEFAULT 'Percentage', phone VARCHAR(20), nid VARCHAR(50), address TEXT, supervisor_id INT DEFAULT 0, allowed_packages TEXT, can_undo_recharge TINYINT(1) DEFAULT 0, expire_time TIME, permissions TEXT)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_PRICING." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT, service_id INT, custom_price DECIMAL(10,2), UNIQUE KEY(staff_id, service_id))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_SELL_PRICING." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT, service_id INT, price DECIMAL(10,2), UNIQUE KEY(staff_id, service_id))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_AGENT_COMM." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT, service_id INT, commission DECIMAL(10,2), UNIQUE KEY(staff_id, service_id))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_AGENTS." (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), phone VARCHAR(20), email VARCHAR(100), address TEXT, bank_name VARCHAR(100), account_name VARCHAR(100), account_no VARCHAR(50), branch_name VARCHAR(100), routing_no VARCHAR(50))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_SETTINGS." (id INT AUTO_INCREMENT PRIMARY KEY, key_name VARCHAR(50) UNIQUE, key_value TEXT)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TX." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT, type VARCHAR(20), amount DECIMAL(10,2), description TEXT, method VARCHAR(20) DEFAULT 'Cash', running_balance DECIMAL(10,2) DEFAULT 0, running_due DECIMAL(10,2) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_STAFF_PROFIT." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT, client_id INT, client_user_id VARCHAR(50), bill_amount DECIMAL(10,2) DEFAULT 0, package_cost DECIMAL(10,2) DEFAULT 0, profit DECIMAL(10,2) DEFAULT 0, source VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_ONLINE_PAY." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT, amount DECIMAL(10,2), trx_id VARCHAR(50), status VARCHAR(20), payment_id VARCHAR(100), gateway_response TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    
    // Clean up duplicates and add unique constraint on trx_id in payment_gateway_logs
    try {
        $pdo->exec("UPDATE " . TBL_ONLINE_PAY . " SET trx_id = NULL WHERE trx_id = ''");
        $check_index = $pdo->query("SHOW INDEX FROM " . TBL_ONLINE_PAY . " WHERE Key_name = 'uq_gateway_trx'")->fetch();
        if (!$check_index) {
            $stmt = $pdo->query("SELECT trx_id, COUNT(*) as cnt FROM " . TBL_ONLINE_PAY . " WHERE trx_id IS NOT NULL GROUP BY trx_id HAVING cnt > 1");
            $duplicates = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($duplicates as $dup) {
                $trx_id = $dup['trx_id'];
                $stmt_rec = $pdo->prepare("SELECT id FROM " . TBL_ONLINE_PAY . " WHERE trx_id = ? ORDER BY id ASC");
                $stmt_rec->execute([$trx_id]);
                $records = $stmt_rec->fetchAll(PDO::FETCH_COLUMN);
                array_shift($records);
                $update_stmt = $pdo->prepare("UPDATE " . TBL_ONLINE_PAY . " SET trx_id = CONCAT(trx_id, '-dup-', id) WHERE id = ?");
                foreach ($records as $rec_id) {
                    $update_stmt->execute([$rec_id]);
                }
            }
            $pdo->exec("ALTER TABLE " . TBL_ONLINE_PAY . " ADD UNIQUE KEY uq_gateway_trx (trx_id)");
        }
    } catch (PDOException $e) {
        error_log("Payment Gateway Logs Unique Key Migration Warning: " . $e->getMessage());
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_ZONES." (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), staff_id INT DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TJ_BOXES." (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), staff_id INT DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_OFFERS." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT, name VARCHAR(100), buy_days INT, free_days INT, status VARCHAR(20) DEFAULT 'Active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_FIN_EXPENSES." (id INT AUTO_INCREMENT PRIMARY KEY, category VARCHAR(100), amount DECIMAL(10,2), method VARCHAR(20), description TEXT, staff_id INT, date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_FIN_CASHBOOK." (id INT AUTO_INCREMENT PRIMARY KEY, entry_type ENUM('Income', 'Expense', 'Transfer') NOT NULL, amount DECIMAL(10,2) NOT NULL, method VARCHAR(20), source VARCHAR(100), ref_id INT, description TEXT, running_balance DECIMAL(10,2), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_OLTS." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT DEFAULT 0, name VARCHAR(100), location VARCHAR(150), ip VARCHAR(50), port VARCHAR(10), protocol VARCHAR(10) DEFAULT 'http', telnet_port INT DEFAULT 23, user VARCHAR(50), pass VARCHAR(100), brand VARCHAR(50) DEFAULT 'bdcom', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TENANT_VPN." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT NULL,
        pptp_server VARCHAR(150) NOT NULL,
        pptp_username VARCHAR(100) NOT NULL,
        pptp_password VARCHAR(100) NOT NULL,
        olt_lan VARCHAR(50) NOT NULL,
        vpn_status VARCHAR(20) DEFAULT 'disconnected',
        ppp_interface VARCHAR(20) DEFAULT NULL,
        error_message TEXT DEFAULT NULL,
        last_connected_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    // --- WIREGUARD VPN MODULE TABLES ---
    $pdo->exec("CREATE TABLE IF NOT EXISTS tenant_wg (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        wg_ip VARCHAR(50) DEFAULT NULL,
        vps_public_key VARCHAR(100) DEFAULT NULL,
        endpoint_ip VARCHAR(50) DEFAULT NULL,
        endpoint_port INT DEFAULT 51820,
        allowed_ips VARCHAR(100) DEFAULT NULL,
        router_name VARCHAR(100) DEFAULT 'MikroTik',
        mik_private_key_enc TEXT DEFAULT NULL,
        mik_private_key_set TINYINT(1) DEFAULT 0,
        vpn_status VARCHAR(20) DEFAULT 'unknown',
        last_handshake DATETIME DEFAULT NULL,
        last_test_result TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wg_staff (staff_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS tenant_wg_subnets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL,
        olt_id INT DEFAULT NULL,
        subnet VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wg_subnets_staff (staff_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS tickets (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT, category VARCHAR(100), message TEXT, status VARCHAR(20) DEFAULT 'Open', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ticket_replies (id INT AUTO_INCREMENT PRIMARY KEY, ticket_id INT, sender_type VARCHAR(20) NOT NULL, sender_id INT NOT NULL, message TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");

    // Migration: Ensure ticket_replies has sender_type and sender_id (refactored schema)
    try {
        $check_sender = $pdo->query("SHOW COLUMNS FROM ticket_replies LIKE 'sender_type'")->fetch();
        if (!$check_sender) {
            $pdo->exec("ALTER TABLE ticket_replies ADD COLUMN sender_type VARCHAR(20) NOT NULL AFTER ticket_id");
            $pdo->exec("ALTER TABLE ticket_replies ADD COLUMN sender_id INT NOT NULL AFTER sender_type");
            
            // Migrate old columns data
            $check_old_staff = $pdo->query("SHOW COLUMNS FROM ticket_replies LIKE 'staff_id'")->fetch();
            if ($check_old_staff) {
                $pdo->exec("UPDATE ticket_replies SET sender_type = 'Staff', sender_id = staff_id WHERE staff_id IS NOT NULL AND staff_id > 0");
                $pdo->exec("UPDATE ticket_replies SET sender_type = 'Client', sender_id = client_id WHERE client_id IS NOT NULL AND client_id > 0");
                $pdo->exec("ALTER TABLE ticket_replies DROP COLUMN staff_id");
                $pdo->exec("ALTER TABLE ticket_replies DROP COLUMN client_id");
            }
        }
    } catch (PDOException $e) { }

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_SMS_LOGS." (id INT AUTO_INCREMENT PRIMARY KEY, staff_id INT DEFAULT 0, phone VARCHAR(20), message TEXT, response TEXT, status VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");

    // API Framework Tables
    $pdo->exec("CREATE TABLE IF NOT EXISTS tenants (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, subdomain VARCHAR(50) UNIQUE NOT NULL, db_name VARCHAR(50) NOT NULL, db_user VARCHAR(50) NOT NULL, db_pass VARCHAR(100) NOT NULL, hmac_secret VARCHAR(100) NOT NULL, status ENUM('active', 'suspended') DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS api_tokens (id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, token_hash VARCHAR(255) NOT NULL, expires_at DATETIME NOT NULL, rate_limit INT DEFAULT 100, ip_whitelist JSON, FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS rate_limits (id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, ip_address VARCHAR(45) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_tenant_ip (tenant_id, ip_address), INDEX idx_created_at (created_at))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS request_replay (id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL, replay_hash VARCHAR(64) UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE)");

    // Store Module Tables
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_STORE_CATEGORIES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL DEFAULT 1,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (staff_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_STORE_PRODUCTS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL DEFAULT 1,
        category_id INT NOT NULL,
        brand_model VARCHAR(100) DEFAULT NULL,
        name VARCHAR(150) NOT NULL,
        serial_mac VARCHAR(100) UNIQUE NOT NULL,
        purchase_price DECIMAL(10,2) DEFAULT 0.00,
        selling_price DECIMAL(10,2) DEFAULT 0.00,
        supplier VARCHAR(150) DEFAULT NULL,
        warranty VARCHAR(100) DEFAULT NULL,
        stock_status ENUM('Available', 'Sold', 'Support Issued', 'Returned', 'Damaged', 'Missing') DEFAULT 'Available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (staff_id),
        FOREIGN KEY (category_id) REFERENCES ".TBL_STORE_CATEGORIES."(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migration: Add staff_id to store_categories and store_products
    try {
        $check_cat_staff = $pdo->query("SHOW COLUMNS FROM ".TBL_STORE_CATEGORIES." LIKE 'staff_id'")->fetch();
        if (!$check_cat_staff) {
            $pdo->exec("ALTER TABLE ".TBL_STORE_CATEGORIES." ADD COLUMN staff_id INT NOT NULL DEFAULT 1 AFTER id");
            $pdo->exec("ALTER TABLE ".TBL_STORE_CATEGORIES." ADD INDEX (staff_id)");
        }
    } catch (PDOException $e) { }

    try {
        $check_prod_staff = $pdo->query("SHOW COLUMNS FROM ".TBL_STORE_PRODUCTS." LIKE 'staff_id'")->fetch();
        if (!$check_prod_staff) {
            $pdo->exec("ALTER TABLE ".TBL_STORE_PRODUCTS." ADD COLUMN staff_id INT NOT NULL DEFAULT 1 AFTER id");
            $pdo->exec("ALTER TABLE ".TBL_STORE_PRODUCTS." ADD INDEX (staff_id)");
        }
    } catch (PDOException $e) { }

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_STORE_SALES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        customer_id INT NOT NULL,
        invoice_no VARCHAR(50) UNIQUE NOT NULL,
        sold_price DECIMAL(10,2) NOT NULL,
        paid_amount DECIMAL(10,2) DEFAULT 0.00,
        due_amount DECIMAL(10,2) DEFAULT 0.00,
        payment_status ENUM('Paid', 'Due', 'Partial') DEFAULT 'Paid',
        sold_by_staff INT NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT DEFAULT NULL,
        FOREIGN KEY (product_id) REFERENCES ".TBL_STORE_PRODUCTS."(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES ".TBL_USERS."(id) ON DELETE CASCADE,
        FOREIGN KEY (sold_by_staff) REFERENCES ".TBL_STAFF."(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_STORE_SUPPORT." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        customer_id INT NOT NULL,
        ticket_id INT DEFAULT NULL,
        given_date DATE NOT NULL,
        expected_return_date DATE NULL,
        return_date DATE DEFAULT NULL,
        given_condition VARCHAR(255) DEFAULT NULL,
        return_condition VARCHAR(255) DEFAULT NULL,
        given_by_staff INT NOT NULL,
        received_by_staff INT DEFAULT NULL,
        status ENUM('Issued', 'Returned', 'Overdue', 'Damaged', 'Missing') DEFAULT 'Issued',
        remarks TEXT DEFAULT NULL,
        FOREIGN KEY (product_id) REFERENCES ".TBL_STORE_PRODUCTS."(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES ".TBL_USERS."(id) ON DELETE CASCADE,
        FOREIGN KEY (given_by_staff) REFERENCES ".TBL_STAFF."(id) ON DELETE RESTRICT,
        FOREIGN KEY (received_by_staff) REFERENCES ".TBL_STAFF."(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // --- HR & PAYROLL MODULE TABLES ---
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_HR_POLICIES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_name VARCHAR(50) UNIQUE NOT NULL,
        key_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_HR_EMPLOYEES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id VARCHAR(30) UNIQUE NOT NULL,
        staff_user_id INT NULL,
        photo VARCHAR(255) NULL,
        full_name VARCHAR(100) NOT NULL,
        father_name VARCHAR(100) NULL,
        mother_name VARCHAR(100) NULL,
        present_address TEXT NULL,
        permanent_address TEXT NULL,
        nid_number VARCHAR(30) NULL,
        phone1 VARCHAR(20) NOT NULL,
        phone2 VARCHAR(20) NULL,
        email VARCHAR(100) NULL,
        blood_group VARCHAR(5) NULL,
        gender VARCHAR(10) NULL,
        date_of_birth DATE NULL,
        joining_date DATE NOT NULL,
        designation VARCHAR(100) NOT NULL,
        department VARCHAR(100) NOT NULL,
        employment_status ENUM('Active', 'Resigned', 'Suspended', 'Terminated') DEFAULT 'Active',
        family_phone VARCHAR(20) NULL,
        emergency_phone VARCHAR(20) NULL,
        emergency_contact_person VARCHAR(100) NULL,
        emergency_relationship VARCHAR(50) NULL,
        ref_name VARCHAR(100) NULL,
        ref_address TEXT NULL,
        ref_phone VARCHAR(20) NULL,
        ref_nid VARCHAR(30) NULL,
        ref_relationship VARCHAR(50) NULL,
        prev_company VARCHAR(150) NULL,
        prev_designation VARCHAR(100) NULL,
        prev_working_period VARCHAR(50) NULL,
        prev_experience_note TEXT NULL,
        monthly_salary DECIMAL(10,2) DEFAULT 0.00,
        salary_type VARCHAR(30) DEFAULT 'Monthly',
        nid_copy VARCHAR(255) NULL,
        cv_resume VARCHAR(255) NULL,
        appointment_letter VARCHAR(255) NULL,
        certificates VARCHAR(255) NULL,
        other_docs VARCHAR(255) NULL,
        shift_start_time TIME NULL,
        shift_end_time TIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(staff_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_HR_ATTENDANCE." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        date DATE NOT NULL,
        check_in TIME NULL,
        check_out TIME NULL,
        working_hours DECIMAL(5,2) DEFAULT 0.00,
        status ENUM('Present', 'Absent', 'Late', 'Half-day', 'Leave', 'Holiday') DEFAULT 'Present',
        note VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY(employee_id, date),
        FOREIGN KEY (employee_id) REFERENCES ".TBL_HR_EMPLOYEES."(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_HR_LEAVES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        leave_type ENUM('Casual leave', 'Sick leave', 'Emergency leave', 'Paid leave', 'Unpaid leave', 'Alternative Leave') NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_days INT NOT NULL,
        reason TEXT NULL,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        approved_by INT NULL,
        action_date DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES ".TBL_HR_EMPLOYEES."(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_HR_LEAVE_BALANCES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        year INT NOT NULL,
        casual_leave_limit INT DEFAULT 10,
        casual_leave_used INT DEFAULT 0,
        sick_leave_limit INT DEFAULT 10,
        sick_leave_used INT DEFAULT 0,
        emergency_leave_limit INT DEFAULT 5,
        emergency_leave_used INT DEFAULT 0,
        paid_leave_limit INT DEFAULT 10,
        paid_leave_used INT DEFAULT 0,
        alternative_leave_limit INT DEFAULT 0,
        alternative_leave_used INT DEFAULT 0,
        UNIQUE KEY(employee_id, year),
        FOREIGN KEY (employee_id) REFERENCES ".TBL_HR_EMPLOYEES."(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_HR_ADVANCE_SALARIES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        request_date DATE NOT NULL,
        purpose TEXT NULL,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        return_type ENUM('Instant', 'Installment') DEFAULT 'Instant',
        installment_count INT DEFAULT 1,
        monthly_deduction DECIMAL(10,2) DEFAULT 0.00,
        remaining_balance DECIMAL(10,2) DEFAULT 0.00,
        deduction_start_month VARCHAR(7) NULL,
        approved_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES ".TBL_HR_EMPLOYEES."(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_HR_PAYROLL." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        salary_month VARCHAR(7) NOT NULL,
        basic_salary DECIMAL(10,2) NOT NULL,
        late_deduction DECIMAL(10,2) DEFAULT 0.00,
        absent_deduction DECIMAL(10,2) DEFAULT 0.00,
        advance_deduction DECIMAL(10,2) DEFAULT 0.00,
        pf_deduction DECIMAL(10,2) DEFAULT 0.00,
        bonus DECIMAL(10,2) DEFAULT 0.00,
        incentive DECIMAL(10,2) DEFAULT 0.00,
        other_deduction DECIMAL(10,2) DEFAULT 0.00,
        net_salary DECIMAL(10,2) NOT NULL,
        payment_status ENUM('Paid', 'Partial', 'Due') DEFAULT 'Due',
        paid_amount DECIMAL(10,2) DEFAULT 0.00,
        due_amount DECIMAL(10,2) DEFAULT 0.00,
        payment_date DATE NULL,
        payment_method VARCHAR(20) DEFAULT 'Cash',
        remarks TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY(employee_id, salary_month),
        FOREIGN KEY (employee_id) REFERENCES ".TBL_HR_EMPLOYEES."(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Add pf_deduction to TBL_HR_PAYROLL if it doesn't exist
    try {
        $pdo->exec("ALTER TABLE ".TBL_HR_PAYROLL." ADD COLUMN pf_deduction DECIMAL(10,2) DEFAULT 0.00 AFTER advance_deduction");
    } catch (PDOException $e) {
        // Ignore if column already exists
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_HR_HOLIDAYS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        holiday_date DATE NOT NULL UNIQUE,
        holiday_name VARCHAR(150) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Seed default policy values if table is empty
    $p_check = $pdo->query("SELECT COUNT(*) FROM ".TBL_HR_POLICIES)->fetchColumn();
    if ($p_check == 0) {
        $default_policies = [
            'grace_time' => '10',
            'late_allowed' => '3',
            'late_deduction_amount' => '50',
            'late_count_salary_deduct' => '6',
            'absent_deduction_percentage' => '100',
            'half_day_deduction_percentage' => '50'
        ];
        $stmt_pol = $pdo->prepare("INSERT INTO ".TBL_HR_POLICIES." (key_name, key_value) VALUES (?, ?)");
        foreach ($default_policies as $k => $v) {
            $stmt_pol->execute([$k, $v]);
        }
    }

    // Index/Column Cleanup - Silenced to prevent warnings on already migrated DBs
    $old_err = $pdo->getAttribute(PDO::ATTR_ERRMODE);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);
    
    // --- VITAL UPDATES (AUTO MIGRATION) ---
    @$pdo->exec("ALTER TABLE ".TBL_STORE_PRODUCTS." ADD COLUMN quantity INT DEFAULT 1");
    @$pdo->exec("ALTER TABLE ".TBL_TENANT_PAYMENT_GATEWAYS." ADD COLUMN staff_id INT DEFAULT 0 AFTER tenant_id");
    @$pdo->exec("ALTER TABLE ".TBL_PAYMENT_SMS_LOGS." ADD COLUMN staff_id INT DEFAULT 0 AFTER tenant_id");
    @$pdo->exec("ALTER TABLE ".TBL_PAYMENT_SMS_LOGS." ADD COLUMN reference_id VARCHAR(50) DEFAULT NULL AFTER trx_id");
    @$pdo->exec("ALTER TABLE ".TBL_STORE_SALES." ADD COLUMN item_serial_mac VARCHAR(100) DEFAULT NULL");
    @$pdo->exec("ALTER TABLE ".TBL_STORE_SUPPORT." ADD COLUMN item_serial_mac VARCHAR(100) DEFAULT NULL");
    @$pdo->exec("ALTER TABLE ".TBL_SERVICES." ADD COLUMN vat_percent DECIMAL(5,2) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_SERVICES." ADD COLUMN buying_price DECIMAL(10,2) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN lock_status ENUM('None','Panel','Full') DEFAULT 'None'");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN lock_note TEXT DEFAULT NULL");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN gateway_config TEXT NULL");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN staff_id INT DEFAULT 0 AFTER id");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN location VARCHAR(150)");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN ip VARCHAR(50)");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN port VARCHAR(10)");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN protocol VARCHAR(10) DEFAULT 'http'");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN telnet_port INT DEFAULT 23");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN user VARCHAR(50)");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN pass VARCHAR(100)");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN brand VARCHAR(50) DEFAULT 'bdcom'");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN snmp_community VARCHAR(50) DEFAULT 'public'");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN timeout INT DEFAULT 10");
    @$pdo->exec("ALTER TABLE ".TBL_OLTS." ADD COLUMN enabled TINYINT(1) DEFAULT 1");
    @$pdo->exec("ALTER TABLE ".TBL_ZONES." DROP INDEX name");
    @$pdo->exec("ALTER TABLE ".TBL_TJ_BOXES." DROP INDEX name");
    @$pdo->exec("ALTER TABLE ".TBL_TJ_BOXES." ADD COLUMN zone_id INT DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_TJ_BOXES." ADD COLUMN lat_long VARCHAR(150)");
    @$pdo->exec("ALTER TABLE ".TBL_TJ_BOXES." ADD COLUMN fiber_code VARCHAR(100)");
    @$pdo->exec("ALTER TABLE ".TBL_TJ_BOXES." MODIFY COLUMN fiber_code TEXT");
    @$pdo->exec("ALTER TABLE ".TBL_TJ_BOXES." ADD COLUMN box_category VARCHAR(50) DEFAULT 'Master Box'");
    @$pdo->exec("ALTER TABLE ".TBL_TJ_BOXES." ADD COLUMN notes TEXT");
    @$pdo->exec("ALTER TABLE ".TBL_OFFERS." ADD COLUMN description TEXT");
    @$pdo->exec("ALTER TABLE ".TBL_OFFERS." ADD COLUMN valid_until DATE");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN lat_long VARCHAR(100)");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN client_type ENUM('Home', 'Office') DEFAULT 'Home'");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN due DECIMAL(10,2) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN discount DECIMAL(10,2) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN district VARCHAR(100)");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN thana VARCHAR(100)");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN intended_router_name VARCHAR(100)");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN profile_pic VARCHAR(255) DEFAULT NULL");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN last_seen DATETIME NULL");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN ip_cost DECIMAL(10,2) DEFAULT 0.00 AFTER assigned_ip");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN promise_enabled TINYINT(1) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN promise_date DATE DEFAULT NULL");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN needs_sync TINYINT(1) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN email VARCHAR(100)");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN reset_token VARCHAR(100)");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN reset_expiry DATETIME");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN sms_balance DECIMAL(10,2) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN sms_rate DECIMAL(10,2) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN sms_config TEXT NULL");

    // --- RESELLER COST PRICE & ADMIN PROFIT TRACKING ENHANCEMENT ---
    @$pdo->exec("ALTER TABLE ".TBL_TX." ADD COLUMN admin_cost DECIMAL(10,2) DEFAULT 0.00");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF_PROFIT." ADD COLUMN admin_cost DECIMAL(10,2) DEFAULT 0.00");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF_PROFIT." ADD COLUMN admin_profit DECIMAL(10,2) DEFAULT 0.00");
    
    // Initialize old records for backward compatibility
    @$pdo->exec("UPDATE ".TBL_STAFF_PROFIT." SET admin_cost = package_cost WHERE admin_cost = 0.00 OR admin_cost IS NULL");
    @$pdo->exec("UPDATE ".TBL_TX." SET admin_cost = amount WHERE (admin_cost = 0.00 OR admin_cost IS NULL) AND type = 'Expense'");

    // --- SESSION TRAFFIC TRACKING COLUMNS ---
    @$pdo->exec("ALTER TABLE ".TBL_SESSIONS." ADD COLUMN total_rx_bytes BIGINT DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_SESSIONS." ADD COLUMN total_tx_bytes BIGINT DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_SESSIONS." ADD INDEX idx_client_status (client_id, status)");

    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN advance_balance_limit DECIMAL(10,2) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN commission_type VARCHAR(20) DEFAULT 'Percentage'");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN phone VARCHAR(20)");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN nid VARCHAR(50)");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN address TEXT");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN supervisor_id INT DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN allowed_packages TEXT");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN can_undo_recharge TINYINT(1) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN expire_time TIME");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN permissions TEXT");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN can_use_global_sms TINYINT(1) DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN invoice_config TEXT DEFAULT NULL");
    
    // --- SECURITY RESOLUTION: INCREASE PASSWORD COLUMN WIDHTS FOR BCRYPT HASHES ---
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." MODIFY COLUMN password VARCHAR(255)");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." MODIFY COLUMN self_care_password VARCHAR(255) DEFAULT NULL");
    @$pdo->exec("ALTER TABLE ".TBL_FIN_CASHBOOK." ADD COLUMN staff_id INT DEFAULT 0");
    @$pdo->exec("ALTER TABLE ".TBL_TENANT_VPN." ADD COLUMN require_encryption TINYINT(1) DEFAULT 1");
    @$pdo->exec("ALTER TABLE ".TBL_STORE_SUPPORT." MODIFY expected_return_date DATE NULL");
    @$pdo->exec("ALTER TABLE ".TBL_HR_EMPLOYEES." ADD COLUMN monthly_salary DECIMAL(10,2) DEFAULT 0.00 AFTER employment_status");
    @$pdo->exec("ALTER TABLE ".TBL_HR_EMPLOYEES." ADD COLUMN salary_type VARCHAR(30) DEFAULT 'Monthly' AFTER monthly_salary");
    @$pdo->exec("ALTER TABLE ".TBL_HR_EMPLOYEES." ADD COLUMN shift_start_time TIME NULL AFTER other_docs");
    @$pdo->exec("ALTER TABLE ".TBL_HR_EMPLOYEES." ADD COLUMN shift_end_time TIME NULL AFTER shift_start_time");
    
    // --- BANDWIDTH LOGS INDEX MIGRATIONS ---
    @$pdo->exec("ALTER TABLE ".TBL_USAGE_LOGS." ADD INDEX idx_usage_date (usage_date)");
    @$pdo->exec("ALTER TABLE ".TBL_USAGE_LOGS." ADD INDEX idx_router_id (router_id)");
    @$pdo->exec("ALTER TABLE ".TBL_USAGE_LOGS." ADD INDEX idx_customer_id (customer_id)");
    
    // Modify Leave ENUM
    @$pdo->exec("ALTER TABLE ".TBL_HR_LEAVES." MODIFY COLUMN leave_type ENUM('Casual leave', 'Sick leave', 'Emergency leave', 'Paid leave', 'Unpaid leave', 'Alternative Leave') NOT NULL");
    @$pdo->exec("ALTER TABLE ".TBL_HR_LEAVE_BALANCES." ADD COLUMN alternative_leave_limit INT DEFAULT 0 AFTER paid_leave_used");
    @$pdo->exec("ALTER TABLE ".TBL_HR_LEAVE_BALANCES." ADD COLUMN alternative_leave_used INT DEFAULT 0 AFTER alternative_leave_limit");
    
    // Drop unique constraint on (device_id, api_token) to allow multiple MFS wallets on the same physical forwarding device
    @$pdo->exec("ALTER TABLE ".TBL_TENANT_PAYMENT_GATEWAYS." DROP INDEX uq_device_token");
    @$pdo->exec("ALTER TABLE ".TBL_TENANT_PAYMENT_GATEWAYS." ADD INDEX idx_device_token (device_id, api_token)");
    
    // --- CALL CENTER MIGRATIONS ---
    @$pdo->exec("ALTER TABLE ".TBL_IP_PHONE_CONFIG." ADD COLUMN staff_id INT NOT NULL DEFAULT 1 AFTER id");
    @$pdo->exec("ALTER TABLE ".TBL_IP_PHONE_NUMBERS." ADD COLUMN staff_id INT NOT NULL DEFAULT 1 AFTER id");
    @$pdo->exec("ALTER TABLE ".TBL_VOICE_TEMPLATES." ADD COLUMN staff_id INT NOT NULL DEFAULT 1 AFTER id");
    @$pdo->exec("ALTER TABLE ".TBL_VOICE_SMS_QUEUE." ADD COLUMN staff_id INT NOT NULL DEFAULT 1 AFTER id");
    @$pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN send_voice_call TINYINT(1) DEFAULT 1");
    @$pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN voice_config TEXT NULL");

    // --- CALL CENTER MODULE TABLES ---
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_IP_PHONE_CONFIG." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL DEFAULT 1,
        driver VARCHAR(50) NOT NULL DEFAULT 'generic_rest',
        base_url VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        password_token VARCHAR(255) NOT NULL,
        caller_id VARCHAR(50) NOT NULL,
        extension VARCHAR(50) NULL,
        enabled TINYINT(1) DEFAULT 1,
        test_mode TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_IP_PHONE_NUMBERS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL DEFAULT 1,
        tenant_id VARCHAR(50) DEFAULT 'main',
        ip_number VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL,
        sip_server VARCHAR(150) NOT NULL,
        port INT NOT NULL DEFAULT 5060,
        is_main TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_CUSTOMER_FOLLOWUPS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        staff_id INT NOT NULL,
        note TEXT NOT NULL,
        followup_date DATETIME NOT NULL,
        type ENUM('Billing', 'Expired', 'Complaint', 'Sales', 'Package Upgrade', 'New Connection') NOT NULL,
        status ENUM('Pending', 'Done', 'Call Back Later', 'Interested', 'Not Interested') DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES ".TBL_USERS."(id) ON DELETE CASCADE,
        FOREIGN KEY (staff_id) REFERENCES ".TBL_STAFF."(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_CALL_LOGS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT NULL,
        customer_id INT NULL,
        customer_name VARCHAR(100) NULL,
        customer_mobile VARCHAR(20) NOT NULL,
        staff_id INT NOT NULL,
        staff_name VARCHAR(100) NULL,
        ip_phone_extension VARCHAR(50) NULL,
        call_type ENUM('Manual', 'Auto Reminder', 'Voice Broadcast') DEFAULT 'Manual',
        call_start_time DATETIME NOT NULL,
        call_end_time DATETIME NULL,
        duration INT DEFAULT 0,
        call_status VARCHAR(50) DEFAULT 'Failed',
        api_response TEXT NULL,
        recording_url VARCHAR(255) NULL,
        remarks TEXT NULL,
        next_followup_date DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(customer_id),
        INDEX(staff_id),
        INDEX(call_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_VOICE_TEMPLATES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL DEFAULT 1,
        name VARCHAR(100) NOT NULL,
        type ENUM('Expired package reminder', 'Due bill reminder', 'New offer campaign', 'Service notice', 'Complaint follow-up', 'Maintenance notice') NOT NULL,
        message_text TEXT NOT NULL,
        audio_file_path VARCHAR(255) NULL,
        language ENUM('English', 'Bangla') DEFAULT 'Bangla',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_VOICE_SMS_QUEUE." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id INT NOT NULL DEFAULT 1,
        tenant_id VARCHAR(50) DEFAULT NULL,
        customer_id INT NOT NULL,
        phone VARCHAR(20) NOT NULL,
        template_id INT NULL,
        campaign_name VARCHAR(100) DEFAULT 'System Broadcast',
        audio_file VARCHAR(255) NULL,
        text_message TEXT NULL,
        status ENUM('Pending', 'Sending', 'Sent', 'Failed', 'Cancelled') DEFAULT 'Pending',
        attempts INT DEFAULT 0,
        max_attempts INT DEFAULT 3,
        error_message TEXT NULL,
        scheduled_at DATETIME NOT NULL,
        sent_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES ".TBL_USERS."(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES ".TBL_VOICE_TEMPLATES."(id) ON DELETE SET NULL,
        INDEX(status),
        INDEX(scheduled_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TENANT_PAYMENT_GATEWAYS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT NULL,
        staff_id INT DEFAULT 0,
        gateway_name ENUM('bKash', 'Nagad', 'Rocket', 'Upay') NOT NULL,
        merchant_number VARCHAR(20) NOT NULL,
        device_id VARCHAR(100) NOT NULL,
        api_token VARCHAR(100) NOT NULL,
        account_type ENUM('Merchant', 'Personal Retail', 'Personal') DEFAULT 'Personal',
        instruction_type ENUM('Payment', 'Send Money') DEFAULT 'Send Money',
        display_name VARCHAR(100) DEFAULT '',
        qr_image_url VARCHAR(255) NULL,
        checkout_enabled TINYINT(1) DEFAULT 0,
        checkout_expiry_mins INT DEFAULT 10,
        min_amount DECIMAL(10,2) DEFAULT 10.00,
        max_amount DECIMAL(10,2) DEFAULT 25000.00,
        auto_activate TINYINT(1) DEFAULT 1,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_merchant_gw (merchant_number, gateway_name),
        INDEX idx_device_token (device_id, api_token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_PAYMENT_SMS_LOGS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT NULL,
        staff_id INT DEFAULT 0,
        gateway_name VARCHAR(20) NOT NULL,
        sender_mobile VARCHAR(20) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        trx_id VARCHAR(50) NOT NULL,
        reference_id VARCHAR(50) DEFAULT NULL,
        raw_sms TEXT NOT NULL,
        sms_received_at DATETIME NOT NULL,
        status ENUM('matched', 'unmatched', 'duplicate', 'failed_parse') DEFAULT 'unmatched',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_trx_id (trx_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_PAYMENT_REQUESTS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT NULL,
        customer_id INT NOT NULL,
        invoice_id VARCHAR(50) NOT NULL,
        gateway_name VARCHAR(20) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        trx_id VARCHAR(50) NOT NULL,
        status ENUM('pending', 'verified', 'rejected', 'failed') DEFAULT 'pending',
        verified_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_request_trx (trx_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_PAYMENT_INTENTS." (
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_VOICE_REMINDER_TRACKING." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        manager_id INT NOT NULL DEFAULT 0,
        user_id VARCHAR(50) NOT NULL,
        reminder_type ENUM('expiry', '1_day_before', '2_days_before', '3_days_before') NOT NULL,
        billing_cycle_date DATE NOT NULL,
        normalized_phone VARCHAR(20) NOT NULL,
        request_id VARCHAR(64) NULL,
        broadcast_id INT NULL,
        status ENUM('processing', 'sent', 'failed', 'permanently_failed') NOT NULL DEFAULT 'processing',
        call_status ENUM('answered', 'not_answered', 'rejected', 'busy', 'failed', 'pending', 'unknown') NOT NULL DEFAULT 'pending',
        retry_count INT DEFAULT 0,
        next_retry_at DATETIME NULL,
        reserved_by VARCHAR(64) NULL,
        processing_started_at DATETIME NULL,
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_voice_reminder (user_id, manager_id, reminder_type, billing_cycle_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_VOICE_BROADCASTS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        manager_id INT NOT NULL DEFAULT 0,
        request_id VARCHAR(64) NOT NULL,
        awaj_broadcast_id INT NULL,
        reminder_type VARCHAR(20) NOT NULL,
        billing_cycle_date DATE NOT NULL,
        voice VARCHAR(100) NOT NULL,
        sender VARCHAR(50) NOT NULL,
        total_numbers INT NOT NULL DEFAULT 0,
        status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        api_response TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_request_id (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_VOICE_CALL_LOGS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        manager_id INT NOT NULL DEFAULT 0,
        user_id VARCHAR(50) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        broadcast_id INT NULL,
        request_id VARCHAR(64) NULL,
        reminder_type VARCHAR(20) NOT NULL,
        billing_cycle_date DATE NOT NULL,
        status ENUM('answered', 'not_answered', 'rejected', 'busy', 'failed', 'pending', 'unknown') DEFAULT 'pending',
        duration INT DEFAULT 0,
        attempt INT DEFAULT 1,
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_manager (manager_id),
        INDEX idx_user (user_id),
        INDEX idx_phone (phone),
        INDEX idx_broadcast (broadcast_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // --- TASK MODULE MIGRATIONS ---
    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TASK_CATEGORIES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'main',
        name VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TASKS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'main',
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        category_id INT NULL,
        priority ENUM('Low', 'Medium', 'High', 'Urgent') DEFAULT 'Medium',
        schedule_type ENUM('One-Time', 'Daily', 'Weekly', 'Monthly', 'Specific Date') DEFAULT 'One-Time',
        start_date DATE NULL,
        due_date DATE NULL,
        due_time TIME NULL,
        status ENUM('Pending', 'In Progress', 'Completed', 'Cancelled', 'Overdue') DEFAULT 'Pending',
        created_by INT NOT NULL,
        parent_recurring_task_id INT DEFAULT 0,
        recurring_rule_id INT DEFAULT 0,
        reminder_type VARCHAR(50) DEFAULT 'No Reminder',
        completed_at DATETIME NULL,
        completed_by INT NULL,
        completion_note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_due_date (due_date),
        INDEX idx_status (status),
        INDEX idx_category (category_id),
        INDEX idx_recurring (recurring_rule_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TASK_ASSIGNEES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'main',
        task_id INT NOT NULL,
        user_id INT NOT NULL,
        assigned_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_task_user (task_id, user_id),
        INDEX idx_tenant (tenant_id),
        INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TASK_RECURRING_RULES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'main',
        task_id INT NOT NULL,
        recurrence_type ENUM('Daily', 'Weekly', 'Monthly', 'Yearly') NOT NULL,
        recurrence_interval INT DEFAULT 1,
        day_of_week VARCHAR(50) NULL,
        day_of_month INT NULL,
        month_of_year INT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        next_run_at DATETIME NULL,
        last_run_at DATETIME NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_task (task_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TASK_ACTIVITY_LOGS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'main',
        task_id INT NOT NULL,
        user_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_task (task_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TASK_ATTACHMENTS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'main',
        task_id INT NOT NULL,
        uploaded_by INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        file_type VARCHAR(10) NOT NULL,
        file_size INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_task (task_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TASK_TEMPLATES." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'main',
        name VARCHAR(150) NOT NULL,
        description TEXT NULL,
        created_by INT NOT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ".TBL_TASK_TEMPLATE_ITEMS." (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(50) DEFAULT 'main',
        template_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        category_id INT NULL,
        priority ENUM('Low', 'Medium', 'High', 'Urgent') DEFAULT 'Medium',
        relative_day INT DEFAULT 0,
        due_time TIME NULL,
        assigned_role VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_template (template_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Insert Default Categories if none exist
    $cat_count = $pdo->query("SELECT COUNT(*) FROM ".TBL_TASK_CATEGORIES)->fetchColumn();
    if ($cat_count == 0) {
        $default_categories = [
            'Billing', 'Customer Collection', 'Customer Support', 'Network / NOC', 
            'MikroTik', 'OLT / Fiber', 'Accounts', 'Bandwidth Purchase', 
            'Upstream Payment', 'HR', 'Payroll', 'Office Management', 
            'Inventory', 'Marketing', 'Sales', 'Maintenance', 'Management', 'Other'
        ];
        $stmt_cat = $pdo->prepare("INSERT INTO ".TBL_TASK_CATEGORIES." (tenant_id, name) VALUES (?, ?)");
        $cur_tenant = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
        foreach ($default_categories as $cat_name) {
            $stmt_cat->execute([$cur_tenant, $cat_name]);
        }
    }
    
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Check for Admin
    $chk = $pdo->query("SELECT COUNT(*) FROM ".TBL_STAFF)->fetchColumn();
    if ($chk == 0) {
        $pdo->prepare("INSERT INTO ".TBL_STAFF." (username, password, role, name, balance) VALUES (?, ?, 'Admin', 'Super Admin', 0)")->execute(['admin', 'bo1125@']);
    }

} catch (Exception $e) { 
    error_log("Migration Error: " . $e->getMessage());
}

// --- SAAS LICENSE CHECK ---
if (file_exists(__DIR__ . '/license.php')) {
    require_once __DIR__ . '/license.php';
}
?>
