<?php
class CustomerController {
    private $request;
    private $db;
    private $masterDb;

    public function __construct(Request $request, PDO $tenantDb = null, PDO $masterDb = null) {
        $this->request = $request;
        $this->db = $tenantDb;
        $this->masterDb = $masterDb;
    }

    /**
     * 1. Customer Login API
     * POST /api/v1/customer/login
     */
    public function login() {
        $body = $this->request->getJsonBody();
        $username = trim($body['username'] ?? '');
        $password = trim($body['password'] ?? '');

        if ($username === '' || $password === '') {
            Response::fail(['error' => 'Username and password are required'], 400, $this->request->getRequestId());
        }

        // Search user by mobile, customer_id (id), or pppoe_username (user_id)
        $stmt = $this->db->prepare("
            SELECT id, name, user_id, phone, self_care_password, status 
            FROM users 
            WHERE user_id = ? OR phone = ? OR id = ? 
            LIMIT 1
        ");
        $stmt->execute([$username, $username, $username]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('Invalid credentials', 'UNAUTHORIZED', 401, $this->request->getRequestId());
        }

        $authenticated = false;
        if (!empty($user['self_care_password'])) {
            if (strpos($user['self_care_password'], '$2y$') === 0) {
                $authenticated = password_verify($password, $user['self_care_password']);
            } else {
                $authenticated = ($password === $user['self_care_password']);
                if ($authenticated) {
                    // Auto-upgrade password hash to bcrypt
                    $new_hash = password_hash($password, PASSWORD_BCRYPT);
                    $up_stmt = $this->db->prepare("UPDATE users SET self_care_password = ? WHERE id = ?");
                    $up_stmt->execute([$new_hash, $user['id']]);
                }
            }
        } else {
            // Default password is phone number
            if ($password === $user['phone']) {
                $authenticated = true;
            }
        }

        if (!$authenticated) {
            Response::error('Invalid credentials', 'UNAUTHORIZED', 401, $this->request->getRequestId());
        }

        // Generate dynamic access token
        $plainToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $plainToken);
        $expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));

        // Auto-create customer_tokens table in tenant DB if it doesn't exist
        try {
            $this->db->exec("CREATE TABLE IF NOT EXISTS customer_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NOT NULL,
                token_hash VARCHAR(64) UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_customer (customer_id),
                INDEX idx_token (token_hash)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch (Exception $e) {}

        // Insert new token
        $stmt = $this->db->prepare("INSERT INTO customer_tokens (customer_id, token_hash, expires_at) VALUES (?, ?, ?)");
        $stmt->execute([$user['id'], $tokenHash, $expiresAt]);

        Response::success([
            'status' => 'success',
            'message' => 'Login successful',
            'access_token' => $plainToken,
            'token_type' => 'Bearer',
            'customer_id' => (int)$user['id'],
            'customer_name' => $user['name']
        ], 200, $this->request->getRequestId());
    }

    /**
     * 2. Customer Profile API
     * GET /api/v1/customer/profile
     */
    public function profile() {
        $customer = $this->request->getCustomer();

        // Get zone name
        $zoneName = 'N/A';
        if (!empty($customer['zone_id'])) {
            $stmt = $this->db->prepare("SELECT name FROM zones WHERE id = ?");
            $stmt->execute([$customer['zone_id']]);
            $zoneName = $stmt->fetchColumn() ?: 'N/A';
        }

        // Get package speed (rate_limit_profile)
        $speed = 'N/A';
        if (!empty($customer['user_package'])) {
            $stmt = $this->db->prepare("SELECT rate_limit_profile FROM mikrotik_services WHERE name = ?");
            $stmt->execute([$customer['user_package']]);
            $speed = $stmt->fetchColumn() ?: 'N/A';
        }

        $due = (float)($customer['due'] ?? 0);
        $monthlyBill = (float)($customer['bill_amount'] ?? 0);

        // Calculate advance balance (if due is negative)
        $advance = 0.00;
        if ($due < 0) {
            $advance = abs($due);
            $due = 0.00;
        }

        Response::success([
            'customer_id' => (int)$customer['id'],
            'name' => $customer['name'],
            'mobile' => $customer['phone'],
            'email' => $customer['email'] ?? null, // Fallback if column absent
            'address' => $customer['address'],
            'area' => $zoneName,
            'pppoe_username' => $customer['user_id'],
            'package_name' => $customer['user_package'],
            'package_speed' => $speed,
            'monthly_bill' => $monthlyBill,
            'connection_status' => $customer['status'],
            'expire_date' => $customer['current_bill_date'],
            'due_amount' => $due,
            'advance_amount' => $advance
        ], 200, $this->request->getRequestId());
    }

    /**
     * 3. Live Usage API
     * GET /api/v1/customer/live-usage
     */
    public function liveUsage() {
        $customer = $this->request->getCustomer();
        $userId = $customer['user_id'];
        $routerId = (int)$customer['router_id'];

        $currentRx = 0.00;
        $currentTx = 0.00;
        $status = 'offline';

        // Fetch live stats from MikroTik
        if ($routerId > 0) {
            $stmt = $this->db->prepare("SELECT * FROM routers WHERE id = ?");
            $stmt->execute([$routerId]);
            $router = $stmt->fetch();
            
            if ($router) {
                require_once API_ROOT . '/../classes/MikrotikApp.php';
                $mk = new MikrotikApp($router, 2); // 2 second timeout for mobile responsiveness
                if ($mk->isOnline()) {
                    $traffic = $mk->traffic($userId, true);
                    if ($traffic && isset($traffic['status']) && $traffic['status'] === 'online') {
                        $currentRx = (float)($traffic['down_speed'] ?? 0);
                        $currentTx = (float)($traffic['up_speed'] ?? 0);
                        $status = 'online';
                    }
                }
            }
        }

        // Fetch daily traffic statistics
        // Today
        $stmt = $this->db->prepare("
            SELECT SUM(download_bytes) as download, SUM(upload_bytes) as upload 
            FROM user_usage_logs 
            WHERE customer_id = ? AND usage_date = CURDATE()
        ");
        $stmt->execute([$customer['id']]);
        $today = $stmt->fetch();
        $dlToday = (float)($today['download'] ?? 0);
        $ulToday = (float)($today['upload'] ?? 0);

        // Last 7 Days
        $stmt = $this->db->prepare("
            SELECT SUM(download_bytes) as download, SUM(upload_bytes) as upload 
            FROM user_usage_logs 
            WHERE customer_id = ? AND usage_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        ");
        $stmt->execute([$customer['id']]);
        $sevenDays = $stmt->fetch();
        $dl7 = (float)($sevenDays['download'] ?? 0);
        $ul7 = (float)($sevenDays['upload'] ?? 0);

        // Last 30 Days
        $stmt = $this->db->prepare("
            SELECT SUM(download_bytes) as download, SUM(upload_bytes) as upload 
            FROM user_usage_logs 
            WHERE customer_id = ? AND usage_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ");
        $stmt->execute([$customer['id']]);
        $thirtyDays = $stmt->fetch();
        $dl30 = (float)($thirtyDays['download'] ?? 0);
        $ul30 = (float)($thirtyDays['upload'] ?? 0);

        Response::success([
            'current_rx' => $currentRx, // Mbps
            'current_tx' => $currentTx, // Mbps
            'download_today' => $dlToday,
            'upload_today' => $ulToday,
            'total_today' => $dlToday + $ulToday,
            'download_7days' => $dl7,
            'upload_7days' => $ul7,
            'total_7days' => $dl7 + $ul7,
            'download_30days' => $dl30,
            'upload_30days' => $ul30,
            'total_30days' => $dl30 + $ul30,
            'last_updated' => date('Y-m-d H:i:s')
        ], 200, $this->request->getRequestId());
    }

    /**
     * 4. Bill Status API
     * GET /api/v1/customer/bill/status
     */
    public function billStatus() {
        $customer = $this->request->getCustomer();
        $customerId = $customer['id'];
        $due = (float)($customer['due'] ?? 0);
        $monthlyBill = (float)($customer['bill_amount'] ?? 0);

        // Calculate advance (if due is negative)
        $advance = 0.00;
        if ($due < 0) {
            $advance = abs($due);
            $due = 0.00;
        }

        // Sum of payments this month
        $stmt = $this->db->prepare("
            SELECT SUM(amount) 
            FROM payment_gateway_logs 
            WHERE staff_id = ? AND status = 'COMPLETED' AND created_at >= DATE_FORMAT(NOW() ,'%Y-%m-01')
        ");
        $stmt->execute([$customerId]);
        $paidAmount = (float)$stmt->fetchColumn();

        // Get last successful payment details
        $stmt = $this->db->prepare("
            SELECT amount, created_at 
            FROM payment_gateway_logs 
            WHERE staff_id = ? AND status = 'COMPLETED' 
            ORDER BY id DESC LIMIT 1
        ");
        $stmt->execute([$customerId]);
        $lastPay = $stmt->fetch();
        
        $lastPaymentAmount = $lastPay ? (float)$lastPay['amount'] : 0.00;
        $lastPaymentDate = $lastPay ? $lastPay['created_at'] : null;

        $invoiceStatus = ($due > 0) ? 'Unpaid' : 'Paid';

        Response::success([
            'customer_id' => (int)$customer['id'],
            'monthly_bill' => $monthlyBill,
            'current_month_bill' => $monthlyBill,
            'paid_amount' => $paidAmount,
            'due_amount' => $due,
            'advance_amount' => $advance,
            'last_payment_amount' => $lastPaymentAmount,
            'last_payment_date' => $lastPaymentDate,
            'next_bill_date' => $customer['current_bill_date'],
            'expire_date' => $customer['current_bill_date'],
            'invoice_status' => $invoiceStatus,
            'connection_status' => $customer['status']
        ], 200, $this->request->getRequestId());
    }
}
