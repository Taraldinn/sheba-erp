<?php
class CustomerAuth {
    public static function authenticate(Request $request, PDO $tenantDb) {
        // Auto-create customer_tokens table in tenant DB if it doesn't exist
        try {
            $tenantDb->exec("CREATE TABLE IF NOT EXISTS customer_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NOT NULL,
                token_hash VARCHAR(64) UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_customer (customer_id),
                INDEX idx_token (token_hash)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch (Exception $e) {
            // Silently ignore or log
        }

        $authHeader = $request->getHeader('Authorization');
        if (!$authHeader || !preg_match('/Bearer\s+(\S+)/i', trim($authHeader), $matches)) {
            Response::error('Missing or invalid Authorization token', 'UNAUTHORIZED', 401, $request->getRequestId());
        }

        $plainToken = $matches[1];
        $tokenHash = hash('sha256', $plainToken);

        $stmt = $tenantDb->prepare("
            SELECT customer_id, expires_at 
            FROM customer_tokens 
            WHERE token_hash = ?
        ");
        $stmt->execute([$tokenHash]);
        $tokenRow = $stmt->fetch();

        if (!$tokenRow) {
            Response::error('Invalid or Expired Access Token', 'UNAUTHORIZED', 401, $request->getRequestId());
        }

        if (strtotime($tokenRow['expires_at']) < time()) {
            // Delete expired token
            $tenantDb->prepare("DELETE FROM customer_tokens WHERE token_hash = ?")->execute([$tokenHash]);
            Response::error('Token has expired', 'TOKEN_EXPIRED', 401, $request->getRequestId());
        }

        // Fetch customer data
        $stmt = $tenantDb->prepare("
            SELECT id, name, phone, address, user_id, user_package, status, bill_amount, current_bill_date, router_id, zone_id, due, discount
            FROM users 
            WHERE id = ?
        ");
        $stmt->execute([$tokenRow['customer_id']]);
        $customer = $stmt->fetch();

        if (!$customer) {
            Response::error('Customer account not found', 'CUSTOMER_NOT_FOUND', 404, $request->getRequestId());
        }

        return $customer;
    }
}
