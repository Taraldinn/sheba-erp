<?php
class PaymentVerificationController {
    private $request;
    private $masterDb;

    public function __construct(Request $request, PDO $masterDb) {
        $this->request = $request;
        $this->masterDb = $masterDb;
    }

    public function receiveSms() {
        $body = $this->request->getJsonBody();
        $required = ['device_id', 'api_token', 'gateway', 'sms_text', 'received_at'];
        $errors = [];
        
        foreach ($required as $field) {
            if (!isset($body[$field]) || $body[$field] === '') {
                $errors[$field] = "$field is required";
            }
        }
        if (!empty($errors)) {
            Response::fail($errors, 422, $this->request->getRequestId());
        }

        // 1. Resolve Tenant database dynamic connection
        require_once API_ROOT . '/core/TenantResolver.php';
        $tenantData = TenantResolver::resolve($this->request, $this->masterDb);
        if (!$tenantData || $tenantData['status'] !== 'active') {
             Response::error("Tenant not found or inactive", "TENANT_NOT_FOUND", 404, $this->request->getRequestId());
        }

        // Connect to tenant DB dynamically
        try {
            $tenantDb = Database::getConnection(
                $_ENV['MASTER_DB_HOST'] ?? '127.0.0.1',
                $tenantData['db_name'],
                $tenantData['db_user'],
                $tenantData['db_pass']
            );
        } catch (Exception $e) {
            Response::error("Failed to connect to tenant database", "DB_CONNECTION_FAILED", 500, $this->request->getRequestId());
        }

        // 2. Authenticate Device/Token inside Tenant's Database
        // Safely bind the normalized gateway name from the payload so shared tokens target the correct row
        $parsedGateway = trim($body['gateway']);
        $stmt = $tenantDb->prepare("SELECT id, staff_id, merchant_number, gateway_name FROM tenant_payment_gateways WHERE device_id = ? AND api_token = ? AND LOWER(gateway_name) = LOWER(?) AND status = 'active'");
        $stmt->execute([$body['device_id'], $body['api_token'], $parsedGateway]);
        $gw = $stmt->fetch();
        if (!$gw) {
            Response::error("Unauthorized device or API token", "UNAUTHORIZED", 401, $this->request->getRequestId());
        }

        // 3. Parse SMS
        require_once API_ROOT . '/../classes/SmsParserService.php';
        $parsed = SmsParserService::parse($body['gateway'], $body['sms_text']);
        
        $receivedAt = date('Y-m-d H:i:s', strtotime($body['received_at']));
        
        if (!$parsed) {
            // Log parse failure inside tenant DB
            $gatewayStaffId = isset($gw['staff_id']) ? intval($gw['staff_id']) : 0;
            $stmt = $tenantDb->prepare("INSERT INTO payment_sms_logs (staff_id, gateway_name, sender_mobile, amount, trx_id, raw_sms, sms_received_at, status) VALUES (?, ?, 'Unknown', 0.00, 'Unknown', ?, ?, 'failed_parse')");
            $stmt->execute([$gatewayStaffId, $body['gateway'], $body['sms_text'], $receivedAt]);
            
            Response::success(['success' => true, 'message' => 'SMS logged with parse failure'], 200, $this->request->getRequestId());
        }

        // 4. Process with Matching Engine inside Tenant DB
        require_once API_ROOT . '/../classes/PaymentMatchingEngine.php';
        $engine = new PaymentMatchingEngine($tenantDb);
        $result = $engine->processIncomingSms($parsed, $body['sms_text'], $receivedAt, $gw);

        Response::success(['success' => true, 'matched' => $result], 200, $this->request->getRequestId());
    }
}
