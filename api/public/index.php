<?php
define('API_ROOT', dirname(__DIR__));

// Load core files
require_once API_ROOT . '/core/ExceptionHandler.php';
require_once API_ROOT . '/core/Logger.php';
require_once API_ROOT . '/core/Request.php';
require_once API_ROOT . '/core/Response.php';
require_once API_ROOT . '/core/Database.php';
require_once API_ROOT . '/core/TenantResolver.php';
require_once API_ROOT . '/core/Auth.php';
require_once API_ROOT . '/core/Router.php';

// Define table constants for core helpers
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

// Disable Caching for the API at CDN level
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

// Controllers
require_once API_ROOT . '/controllers/BillController.php';
require_once API_ROOT . '/controllers/PaymentController.php';
require_once API_ROOT . '/controllers/HealthController.php';
require_once API_ROOT . '/controllers/PaymentVerificationController.php';
require_once API_ROOT . '/controllers/CustomerController.php';
require_once API_ROOT . '/controllers/CustomerPaymentController.php';
require_once API_ROOT . '/controllers/CustomerTicketController.php';

// Models
require_once API_ROOT . '/models/Tenant.php';
require_once API_ROOT . '/models/Customer.php';
require_once API_ROOT . '/models/Invoice.php';
require_once API_ROOT . '/models/Ledger.php';

// Middleware
require_once API_ROOT . '/middleware/RateLimiter.php';
require_once API_ROOT . '/middleware/IpWhitelist.php';
require_once API_ROOT . '/middleware/SignatureCheck.php';
require_once API_ROOT . '/middleware/CustomerTenant.php';
require_once API_ROOT . '/middleware/CustomerAuth.php';
require_once API_ROOT . '/../includes/mask_helper.php';

// Load Env manually since no external libraries allowed
if (file_exists(API_ROOT . '/.env')) {
    $lines = file(API_ROOT . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[trim($name)] = trim($value);
    }
}

// Error Reporting based on Env
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

// Route error logs securely
$log_dir = API_ROOT . '/../logs';
if (!is_dir($log_dir)) {
    @mkdir($log_dir, 0755, true);
    @file_put_contents($log_dir . '/.htaccess', "Order deny,allow\nDeny from all\n");
}
ini_set('error_log', $log_dir . '/php_error.log');

// Set global exception handler
set_exception_handler(['ExceptionHandler', 'handle']);
set_error_handler(['ExceptionHandler', 'handleError']);

// Initialize Request
$request = new Request();

// Master DB Connection
$masterDb = Database::getConnection(
    $_ENV['MASTER_DB_HOST'],
    $_ENV['MASTER_DB_NAME'],
    $_ENV['MASTER_DB_USER'],
    $_ENV['MASTER_DB_PASS'],
    $_ENV['MASTER_DB_PORT'] ?? 3306
);

// Router
$router = new Router($request, $masterDb);

// Register Routes
$router->get('/api/v1/health-check', 'HealthController@check');
$router->get('/api/v1/diag', 'HealthController@diag');

// Secured Routes
$router->post('/api/v1/debug-headers', 'HealthController@debugHeaders');
$router->post('/api/v1/bkash/webhook', 'PaymentController@bkashWebhook');
$router->post('/api/v1/payment/sms', 'PaymentVerificationController@receiveSms');
$router->get('/api/v1/bill/query', 'BillController@query', ['auth', 'rate_limit', 'ip_whitelist']);
$router->post('/api/v1/bill/post', 'BillController@post', ['auth', 'rate_limit', 'ip_whitelist', 'signature']);
$router->get('/api/v1/bill/status', 'BillController@status', ['auth', 'rate_limit', 'ip_whitelist']);
$router->post('/api/v1/bill/pay', 'PaymentController@pay', ['auth', 'rate_limit', 'ip_whitelist', 'signature']);

// Customer Mobile App Routes
$router->post('/api/v1/customer/login', 'CustomerController@login', ['customer_tenant']);
$router->get('/api/v1/customer/profile', 'CustomerController@profile', ['customer_auth']);
$router->get('/api/v1/customer/live-usage', 'CustomerController@liveUsage', ['customer_auth']);
$router->get('/api/v1/customer/bill/status', 'CustomerController@billStatus', ['customer_auth']);
$router->post('/api/v1/customer/payment/paybill', 'CustomerPaymentController@payBill', ['customer_auth']);
$router->get('/api/v1/customer/payment/history', 'CustomerPaymentController@history', ['customer_auth']);
$router->post('/api/v1/customer/ticket/create', 'CustomerTicketController@createTicket', ['customer_auth']);

// Dispatch
$router->dispatch();
// Touch for opcache invalidate
