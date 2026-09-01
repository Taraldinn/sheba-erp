<?php
class RateLimiter {
    public static function check(PDO $tenantDb, $tenantId, Request $request) {
        // Implement token bucket or fixed window against a DB table or Redis
        // For pure PHP+MySQL without Redis:
        
        $clientIp = $_SERVER['REMOTE_ADDR'];
        $window = 60; // 1 minute
        $limit = $request->getTenant()['rate_limit'] ?? 100;

        // Cleanup old
        $tenantDb->prepare("DELETE FROM rate_limits WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)")->execute();

        // Count current window
        $stmt = $tenantDb->prepare("SELECT COUNT(*) FROM rate_limits WHERE ip_address = ? AND tenant_id = ?");
        $stmt->execute([$clientIp, $tenantId]);
        $requests = $stmt->fetchColumn();

        if ($requests >= $limit) {
            Logger::performance("Rate limit exceeded for IP: $clientIp, Tenant: $tenantId");
            Response::error('Too many requests, slow down.', 'RATE_LIMIT_EXCEEDED', 429, $request->getRequestId());
        }

        // Insert new request
        $tenantDb->prepare("INSERT INTO rate_limits (tenant_id, ip_address) VALUES (?, ?)")->execute([$tenantId, $clientIp]);
    }
}
