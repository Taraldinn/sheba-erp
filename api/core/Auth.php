<?php
class Auth {
    public static function authenticate(Request $request, PDO $masterDb) {
        $authHeader = $request->getHeader('Authorization');
        
        if (!$authHeader || !preg_match('/Bearer\s+(\S+)/i', trim($authHeader), $matches)) {
            Response::error('Missing or invalid Authorization header', 'UNAUTHORIZED', 401, $request->getRequestId());
        }

        $plainToken = $matches[1];
        
        // Resolve Tenant by subdomain or header
        $subdomain = $request->getSubdomain();
        $hostHeader = $request->getHeader('Host') ?? $_SERVER['HTTP_HOST'];
        $headerTenant = $request->getHeader('X-Tenant-ID');
        
        $tenantIdentifier = $headerTenant ?: $subdomain;

        if (!$tenantIdentifier && !$hostHeader) {
            Response::error('Tenant processing failed. Subdomain or X-Tenant-ID missing.', 'TENANT_UNKNOWN', 400, $request->getRequestId());
        }

        // 1. Fetch ALL tokens for potential matches
        // Attempt match by subdomain, full host, or tenant name
        $stmt = $masterDb->prepare("
            SELECT t.id, t.name, t.db_name, t.db_user, t.db_pass, t.hmac_secret, t.status, t.subdomain,
                   a.token_hash, a.expires_at, a.rate_limit, a.ip_whitelist 
            FROM tenants t
            LEFT JOIN api_tokens a ON t.id = a.tenant_id
            WHERE t.subdomain = ? OR t.subdomain = ? OR t.subdomain = ? OR t.name = ? 
               OR t.subdomain LIKE ?
        ");
        $likeHost = '%' . $subdomain . '%';
        $stmt->execute([$tenantIdentifier, $headerTenant, $hostHeader, $tenantIdentifier, $likeHost]);
        $rows = $stmt->fetchAll();

        if (empty($rows)) {
            Response::error('Auth failed: No tenant found correlating with identifier: ' . $tenantIdentifier . ' or host: ' . $hostHeader, 'TENANT_NOT_FOUND', 404, $request->getRequestId());
        }

        $validTenantRow = null;
        $tenantFoundButNoTokens = true;
        $hashedToken = hash('sha256', $plainToken);
        
        // 2. Validate Token against all stored tokens
        foreach ($rows as $row) {
            if ($row['token_hash'] !== null) {
                $tenantFoundButNoTokens = false;
                
                $matched = false;
                $shouldUpgrade = false;
                
                // If stored token looks like a SHA-256 hash (64 hex characters), compare hashes
                if (preg_match('/^[a-f0-9]{64}$/i', $row['token_hash'])) {
                    if (hash_equals($row['token_hash'], $hashedToken)) {
                        $matched = true;
                    }
                } else {
                    // Otherwise it's a legacy plaintext token
                    if (hash_equals($row['token_hash'], $plainToken)) {
                        $matched = true;
                        $shouldUpgrade = true;
                    }
                }
                
                if ($matched) {
                    // Check Expiry
                    if (strtotime($row['expires_at']) >= time()) {
                        $validTenantRow = $row;
                        
                        if ($shouldUpgrade) {
                            try {
                                $updateStmt = $masterDb->prepare("UPDATE api_tokens SET token_hash = ? WHERE tenant_id = ? AND token_hash = ?");
                                $updateStmt->execute([$hashedToken, $row['id'], $row['token_hash']]);
                                Logger::audit("API Token upgraded to secure hash for tenant: " . $row['name']);
                            } catch (Exception $e) {
                                Logger::audit("Failed to upgrade API Token to secure hash: " . $e->getMessage());
                            }
                        }
                        
                        break;
                    }
                }
            }
        }

        if ($tenantFoundButNoTokens) {
             Response::error('Tenant authenticated but no active API tokens exist.', 'NO_API_TOKENS', 403, $request->getRequestId());
        }

        if (!$validTenantRow) {
            Response::error('Invalid or Expired API Token', 'UNAUTHORIZED', 401, $request->getRequestId());
        }

        $tenant = $validTenantRow;

        // Subdomain Match Enforcement
        $requestHost = $request->getHeader('Host') ?? $_SERVER['HTTP_HOST'];
        $tenantSubdomain = strtolower($tenant['subdomain']);
        $reqHostLower = strtolower($requestHost);
        
        // Relaxed matching to handle legacy aliases like ripa.shebafi.com => billing.ripaonline.net
        $matchesHost = (strpos($reqHostLower, $tenantSubdomain) !== false);
        $matchesName = (strpos($reqHostLower, strtolower($tenant['name'])) !== false);

        if (!$matchesHost && !$matchesName && $tenant['id'] != 2) {
             Logger::audit("Host mismatch attempt. Expected {$tenant['subdomain']} but got {$requestHost}");
             Response::error('Host mismatch for requested Tenant credentials', 'HOST_MISMATCH', 403, $request->getRequestId());
        }

        if ($tenant['status'] !== 'active') {
            Response::error('Tenant account is suspended', 'TENANT_SUSPENDED', 403, $request->getRequestId());
        }

        return $tenant;
    }
}
