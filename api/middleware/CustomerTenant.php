<?php
class CustomerTenant {
    public static function resolve(Request $request, PDO $masterDb) {
        $subdomain = $request->getSubdomain();
        $hostHeader = $request->getHeader('Host') ?? $_SERVER['HTTP_HOST'];
        $headerTenant = $request->getHeader('X-Tenant-ID') ?? $request->getHeader('X-Tenant-Key');
        
        $tenantIdentifier = $headerTenant ?: $subdomain;

        if (!$tenantIdentifier && !$hostHeader) {
            Response::error('Tenant resolution failed. Subdomain or X-Tenant-ID missing.', 'TENANT_UNKNOWN', 400, $request->getRequestId());
        }

        $stmt = $masterDb->prepare("
            SELECT id, name, db_name, db_user, db_pass, hmac_secret, status, subdomain
            FROM tenants
            WHERE subdomain = ? OR subdomain = ? OR name = ? 
               OR subdomain LIKE ? OR ? LIKE CONCAT('%', subdomain, '%')
            LIMIT 1
        ");
        $stmt->execute([$tenantIdentifier, $headerTenant, $tenantIdentifier, '%' . $subdomain . '%', $hostHeader]);
        $tenant = $stmt->fetch();

        if (!$tenant) {
            Response::error('Tenant not found correlating with identifier: ' . $tenantIdentifier, 'TENANT_NOT_FOUND', 404, $request->getRequestId());
        }

        if ($tenant['status'] !== 'active') {
            Response::error('Tenant account is suspended', 'TENANT_SUSPENDED', 403, $request->getRequestId());
        }

        return $tenant;
    }
}
