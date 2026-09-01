<?php
// scratch/test_sms_webhook_api.php

header('Content-Type: text/plain; charset=UTF-8');
echo "=== API Webhook Controller End-to-End Test ===\n\n";

define('API_ROOT', __DIR__ . '/../api');
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../api/core/Request.php';
require_once __DIR__ . '/../api/core/Response.php';
require_once __DIR__ . '/../api/controllers/PaymentVerificationController.php';

// Mock Request Class to simulate incoming webhook request
class MockRequest extends Request {
    private $mockBody;
    private $mockHeaders;
    
    public function __construct($body, $headers = []) {
        $this->mockBody = json_encode($body);
        $this->mockHeaders = array_change_key_case($headers, CASE_LOWER);
    }
    
    public function getMethod() { return 'POST'; }
    public function getPath() { return '/api/v1/payment/sms'; }
    public function getHeader($key) { 
        $k = strtolower($key);
        if ($k === 'content-type') return 'application/json';
        return $this->mockHeaders[$k] ?? null; 
    }
    public function getRawBody() { return $this->mockBody; }
    public function getJsonBody() { return json_decode($this->mockBody, true); }
    public function getRequestId() { return 'req_mock_123'; }
    public function getSubdomain() { return 'minhaj'; }
}

// Override Response::end to collect output instead of exiting the process
class ResponseCollector extends Response {
    public static $collectedStatus = null;
    public static $collectedCode = null;
    public static $collectedData = null;

    public static function end($status, $dataOrMessage, $httpCode, $errorCode = null, $requestId = null) {
        self::$collectedStatus = $status;
        self::$collectedCode = $httpCode;
        if ($status === 'success' || $status === 'fail') {
            self::$collectedData = $dataOrMessage;
        } else {
            self::$collectedData = ['message' => $dataOrMessage, 'code' => $errorCode];
        }
        // Instead of exit, we just return or throw to halt controller execution nicely
        throw new Exception("ResponseEnded");
    }
}

// Helper to run mock requests
function runMockWebhook($body, $headers = []) {
    global $pdo;
    
    // Clear last response
    ResponseCollector::$collectedStatus = null;
    ResponseCollector::$collectedCode = null;
    ResponseCollector::$collectedData = null;
    
    $req = new MockRequest($body, $headers);
    // We use ResponseCollector as custom override but since controller calls Response directly, 
    // let's define our response endpoints or let's run it.
    // Wait, since Response class is already loaded, we cannot redeclare it.
    // However, Response::end is static and echoes the JSON and calls exit.
    // To prevent the test script from exiting, we can capture the output of the controller!
    // Since php exit halts the script, we can run it in a subprocess or use output buffering if we don't call exit.
    // Wait, let's see how Response is declared:
    // class Response { public static function end(...) { ... exit; } }
    // Because Response calls exit, any direct invocation of the controller will exit the php process!
    // So the cleanest way to run the test without exiting is to execute it as a standalone PHP subprocess 
    // and print the output! That is extremely easy and robust!
}

// Standalone subprocess script execution
// Let's write the test code that will run as a child process

// Seed a temporary customer and device for webhook test
$testUserId = 'webhook_client_test';
$pdo->prepare("DELETE FROM users WHERE user_id = ?")->execute([$testUserId]);
$pdo->prepare("INSERT INTO users (name, phone, user_id, password, user_package, bill_amount, status, due, current_bill_date) 
    VALUES ('Webhook Test Client', '01799998888', ?, '123456', '5Mbps_Package', 500.00, 'Active', 0.00, ?)")
    ->execute([$testUserId, date('Y-m-d', strtotime('-2 days'))]);
$customer = safeFetch($pdo, "SELECT id FROM users WHERE user_id = ?", [$testUserId]);
$customerId = $customer['id'];

// Seed test gateway
$pdo->prepare("DELETE FROM tenant_payment_gateways WHERE device_id = 'WEBHOOK_DEV'")->execute();
$pdo->prepare("INSERT INTO tenant_payment_gateways (gateway_name, merchant_number, device_id, api_token, status) 
    VALUES ('bKash', '01711223344', 'WEBHOOK_DEV', 'webhook_token_xyz', 'active')")->execute();

// Seed a pending request for customer
$trxId = 'WHBKASH1002';
$pdo->prepare("DELETE FROM payment_requests WHERE trx_id = ?")->execute([$trxId]);
$pdo->prepare("INSERT INTO payment_requests (customer_id, invoice_id, gateway_name, amount, trx_id, status) 
    VALUES (?, 'RECHARGE', 'bKash', 500.00, ?, 'pending')")->execute([$customerId, $trxId]);

echo "1. Seeded client, gateway and pending payment request (TrxID: $trxId).\n";

// Execute webhook call in a subprocess to allow captured exit
$webhook_payload = [
    'device_id'   => 'WEBHOOK_DEV',
    'api_token'   => 'webhook_token_xyz',
    'gateway'     => 'bKash',
    'sms_text'    => "You have received Tk 500.00 from 01700112233. TrxID $trxId.",
    'received_at' => date('Y-m-d H:i:s')
];

$tmp_file = __DIR__ . '/temp_webhook_test.php';
$payload_json = json_encode($webhook_payload);

$code = <<<PHP
<?php
define('API_ROOT', __DIR__ . '/../api');
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../api/core/Request.php';
require_once __DIR__ . '/../api/core/Response.php';
require_once __DIR__ . '/../api/core/Database.php';
require_once __DIR__ . '/../api/controllers/PaymentVerificationController.php';

// Stub request
class WebhookRequest extends Request {
    public function __construct() {}
    public function getMethod() { return 'POST'; }
    public function getPath() { return '/api/v1/payment/sms'; }
    public function getHeader(\$key) {
        if (strtolower(\$key) === 'content-type') return 'application/json';
        return null;
    }
    public function getRawBody() { return '{$payload_json}'; }
    public function getJsonBody() { return json_decode(\$this->getRawBody(), true); }
    public function getRequestId() { return 'req_webhook_123'; }
    public function getSubdomain() { return 'minhaj'; }
}

try {
    \$req = new WebhookRequest();
    \$controller = new PaymentVerificationController(\$req, \$pdo);
    \$controller->receiveSms();
} catch (Exception \$e) {
    echo "ERROR: " . \$e->getMessage();
}
PHP;

file_put_contents($tmp_file, $code);

echo "2. Dispatching simulated Webhook request to controller...\n";
$output = shell_exec("C:\\xampp2\\php\\php.exe " . escapeshellarg($tmp_file));
unlink($tmp_file);

echo "3. Controller Webhook Response:\n";
echo "   $output\n";

// Verify matching results
$requestStatus = safeFetch($pdo, "SELECT status, verified_at FROM payment_requests WHERE trx_id = ?", [$trxId]);
$smsLogStatus = safeFetch($pdo, "SELECT status FROM payment_sms_logs WHERE trx_id = ?", [$trxId]);
$userExpiry = safeFetch($pdo, "SELECT current_bill_date FROM users WHERE id = ?", [$customerId]);

echo "4. Verification DB checks:\n";
echo "   - Payment Request: " . ($requestStatus ? $requestStatus['status'] : 'NOT_FOUND') . " (Expected: verified)\n";
echo "   - SMS Log: " . ($smsLogStatus ? $smsLogStatus['status'] : 'NOT_FOUND') . " (Expected: matched)\n";
echo "   - User Expiry extended? " . ($userExpiry['current_bill_date'] > date('Y-m-d', strtotime('-2 days')) ? 'YES' : 'NO') . " (New Expiry: {$userExpiry['current_bill_date']})\n";

// Cleanup
$pdo->prepare("DELETE FROM users WHERE user_id = ?")->execute([$testUserId]);
$pdo->prepare("DELETE FROM tenant_payment_gateways WHERE device_id = 'WEBHOOK_DEV'")->execute();
$pdo->prepare("DELETE FROM payment_requests WHERE trx_id = ?")->execute([$trxId]);
$pdo->prepare("DELETE FROM payment_sms_logs WHERE trx_id = ?")->execute([$trxId]);
echo "\n=== Webhook API Test Completed ===\n";
