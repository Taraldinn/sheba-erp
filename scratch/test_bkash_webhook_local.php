<?php
// g:\Shebafi 29 may 26\scratch\test_bkash_webhook_local.php

define('API_ROOT', dirname(__DIR__) . '/api');

// Include core classes except Database.php (which we mock below)
require_once API_ROOT . '/core/ExceptionHandler.php';
require_once API_ROOT . '/core/Logger.php';
require_once API_ROOT . '/core/Request.php';
require_once API_ROOT . '/core/Response.php';
require_once API_ROOT . '/core/TenantResolver.php';
require_once API_ROOT . '/controllers/PaymentController.php';

// Define Table names if not defined
if (!defined('TBL_ONLINE_PAY')) define('TBL_ONLINE_PAY', 'payment_gateway_logs');
if (!defined('TBL_USERS')) define('TBL_USERS', 'users');
if (!defined('TBL_STAFF')) define('TBL_STAFF', 'staff');
if (!defined('TBL_SERVICES')) define('TBL_SERVICES', 'services');
if (!defined('TBL_LOGS')) define('TBL_LOGS', 'logs');
if (!defined('TBL_TX')) define('TBL_TX', 'transactions');
if (!defined('TBL_FIN_CASHBOOK')) define('TBL_FIN_CASHBOOK', 'fin_cashbook');
if (!defined('TBL_STAFF_PROFIT')) define('TBL_STAFF_PROFIT', 'staff_profit_logs');
if (!defined('TBL_SETTINGS')) define('TBL_SETTINGS', 'settings');
if (!defined('TBL_SMS_LOGS')) define('TBL_SMS_LOGS', 'sms_logs');
if (!defined('TBL_PRICING')) define('TBL_PRICING', 'service_pricing');
if (!defined('TBL_SELL_PRICING')) define('TBL_SELL_PRICING', 'staff_sell_pricing');

// Setup Env mock
$_ENV['MASTER_DB_HOST'] = 'localhost';

// 1. Mock Request Class
class MockRequest extends Request {
    private $mockBody;
    private $mockSubdomain;

    public function __construct($body, $subdomain = 'client1') {
        $this->mockBody = $body;
        $this->mockSubdomain = $subdomain;
    }

    public function getMethod() { return 'POST'; }
    public function getPath() { return '/api/v1/bkash/webhook'; }
    public function getRawBody() { return $this->mockBody; }
    public function getSubdomain() { return $this->mockSubdomain; }
    
    public function getHeader($key) {
        if (strtolower($key) === 'host') {
            return $this->mockSubdomain . '.shebafi.com';
        }
        if (strtolower($key) === 'content-type') {
            return 'application/json';
        }
        return null;
    }

    public function getJsonBody() {
        return json_decode($this->mockBody, true);
    }
}

// 2. Mock Database Class (Intercepts real DB Connection attempts)
class Database {
    public static $mockMasterDb;
    public static $mockTenantDb;

    public static function getConnection($host, $db, $user, $pass, $port = 3306) {
        // Return appropriate mock DB
        if ($db === 'shebafi_minhaj') {
            return self::$mockMasterDb;
        }
        return self::$mockTenantDb;
    }
}

// 3. Mock PDO Statement & Database
class MockPDOStatement {
    private $data;
    private $hasRun = false;

    public function __construct($data) {
        $this->data = $data;
    }

    public function execute($params = []) {
        return true;
    }

    public function fetch($mode = null) {
        if ($this->hasRun && is_array($this->data) && isset($this->data[0])) {
            return null; // Simulate end of fetch for loops
        }
        $this->hasRun = true;
        return $this->data;
    }

    public function fetchAll($mode = null) {
        return is_array($this->data) && isset($this->data[0]) ? $this->data : [$this->data];
    }

    public function fetchColumn() {
        if (is_array($this->data)) {
            return reset($this->data);
        }
        return $this->data;
    }
}

class MockPDO extends PDO {
    private $mocks = [];

    public function __construct() {}

    public function setMock($queryPattern, $responseData) {
        $this->mocks[$queryPattern] = $responseData;
    }

    public function prepare($query, $options = []) {
        foreach ($this->mocks as $pattern => $data) {
            if (preg_match($pattern, $query)) {
                return new MockPDOStatement($data);
            }
        }
        // Default mock returning empty or successful state
        return new MockPDOStatement(['running_balance' => 1000.00, 'balance' => 500.00, 'custom_price' => 400.00, 'buying_price' => 400.00, 'price' => 500.00]);
    }

    public function query($query, $mode = PDO::ATTR_DEFAULT_FETCH_MODE, ...$args) {
        return $this->prepare($query);
    }

    public function beginTransaction() { return true; }
    public function commit() { return true; }
    public function rollBack() { return true; }
    public function lastInsertId($name = null) { return 42; }
}

// 4. Subclass PaymentController to bypass SNS signature verification locally
class TestPaymentController extends PaymentController {
    public function verifySnsSignature($data) {
        // We override signature verification to always succeed for mock tests
        return true;
    }
}

// Setup Mock Databases
$masterDb = new MockPDO();
$tenantDb = new MockPDO();

Database::$mockMasterDb = $masterDb;
Database::$mockTenantDb = $tenantDb;

// Register mock results
// Master Database Mocks
$masterDb->setMock('/FROM tenants/i', [
    'id' => 1,
    'name' => 'Client 1',
    'subdomain' => 'client1',
    'db_name' => 'tenant_client1',
    'db_user' => 'root',
    'db_pass' => '',
    'status' => 'active'
]);

// Tenant Database Mocks
$tenantDb->setMock('/FROM payment_gateway_logs/i', [
    'id' => 123,
    'status' => 'Pending',
    'staff_id' => 10 // User ID mapping
]);

$tenantDb->setMock('/FROM users/i', [
    'id' => 10,
    'user_id' => 'AG40023',
    'name' => 'Test Customer',
    'phone' => '01712345678',
    'manager_id' => 2,
    'user_package' => '10 Mbps',
    'bill_amount' => 500.00,
    'discount' => 0.00,
    'due' => 0.00,
    'current_bill_date' => '2026-05-20',
    'credit_taken' => 0,
    'credit_days' => 0,
    'router_id' => 0,
    'password' => 'secret123'
]);

$tenantDb->setMock('/FROM staff/i', [
    'id' => 2,
    'role' => 'Reseller',
    'balance' => 1000.00,
    'advance_balance_limit' => 0.00
]);

$tenantDb->setMock('/FROM services/i', [
    'id' => 5,
    'name' => '10 Mbps',
    'price' => 500.00,
    'buying_price' => 400.00
]);

// Helper to run a test
function executeTest($name, $payload, $masterDb) {
    echo "\n=== Running Test: $name ===\n";
    $request = new MockRequest(json_encode($payload));
    $controller = new TestPaymentController($request, $masterDb);
    
    // We expect the script to exit with Response::success() which prints JSON and exits PHP.
    // If it prints JSON and exits, it's a complete success!
    $controller->bkashWebhook();
}

// 5. Select Test Case via command-line argument
$testCase = isset($argv[1]) ? trim($argv[1]) : '';

if ($testCase === 'sub') {
    // Subscription Test Payload
    $subPayload = [
        'Type' => 'SubscriptionConfirmation',
        'MessageId' => 'sub-12345',
        'SubscribeURL' => 'https://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription&Mock=1',
        'Timestamp' => '2026-05-29T12:00:00Z',
        'Token' => 'token123',
        'TopicArn' => 'arn:aws:sns:ap-southeast-1:123:Topic',
        'Signature' => 'mock_sig_123',
        'SignatureVersion' => '1',
        'SigningCertURL' => 'https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-mock.pem'
    ];
    executeTest('Subscription Confirmation', $subPayload, $masterDb);

} elseif ($testCase === 'notify') {
    // Notification Test Payload
    $notificationPayload = [
        'Type' => 'Notification',
        'MessageId' => 'msg-99999',
        'TopicArn' => 'arn:aws:sns:ap-southeast-1:123:Topic',
        'Message' => json_encode([
            'dateTime' => '20260529120000',
            'debitMSISDN' => '8801700000001',
            'creditShortCode' => '01899999***',
            'trxID' => 'BKASH_TRX_999',
            'transactionStatus' => 'Completed',
            'amount' => '500.00',
            'currency' => 'BDT',
            'merchantInvoiceNumber' => 'QP_MOCK_TRX'
        ]),
        'Timestamp' => '2026-05-29T12:00:00Z',
        'Signature' => 'mock_sig_456',
        'SignatureVersion' => '1',
        'SigningCertURL' => 'https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-mock.pem'
    ];
    executeTest('Payment Success Notification', $notificationPayload, $masterDb);

} else {
    echo "Usage: php scratch/test_bkash_webhook_local.php [sub|notify]\n";
}
