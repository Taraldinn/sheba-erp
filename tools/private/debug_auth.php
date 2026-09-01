<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/api/core/Request.php';
require_once __DIR__ . '/includes/db_config.php';

try {
    $masterDb = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8", DB_USER, DB_PASS);
    $masterDb->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $masterDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $request = new Request();
    
    $subdomain = $request->getSubdomain();
    $hostHeader = $request->getHeader('Host') ?? $_SERVER['HTTP_HOST'] ?? 'unknown_host';
    $headerTenant = $request->getHeader('X-Tenant-ID');
    $tenantIdentifier = $headerTenant ?: $subdomain;
    
    echo "<h1>Debug Info</h1>";
    echo "<h3>Request Parsed Identifiers:</h3>";
    echo "<pre>";
    print_r([
        'Subdomain (from Request->getSubdomain())' => $subdomain,
        'Host Header' => $hostHeader,
        'X-Tenant-ID Header' => $headerTenant,
        'Final Tenant Identifier' => $tenantIdentifier,
        'Raw Auth Header' => $request->getHeader('Authorization')
    ]);
    echo "</pre>";
    
    echo "<h3>Database Tenants Table:</h3>";
    $stmt = $masterDb->query("SELECT id, name, subdomain FROM tenants");
    echo "<pre>";
    print_r($stmt->fetchAll());
    echo "</pre>";

    echo "<h3>Database API Tokens Table:</h3>";
    $stmt = $masterDb->query("SELECT id, tenant_id FROM api_tokens");
    echo "<pre>";
    print_r($stmt->fetchAll());
    echo "</pre>";
    
    echo "<h3>Auth Query Match Result:</h3>";
    $stmt = $masterDb->prepare("
        SELECT t.id, t.name, t.subdomain, a.id as token_id
        FROM tenants t
        LEFT JOIN api_tokens a ON t.id = a.tenant_id
        WHERE t.subdomain = ? OR t.subdomain = ? OR t.subdomain = ? OR t.name = ?
    ");
    $stmt->execute([$tenantIdentifier, $headerTenant, $hostHeader, $tenantIdentifier]);
    echo "<pre>";
    print_r($stmt->fetchAll());
    echo "</pre>";

} catch (Exception $e) {
    echo "DB Error: " . $e->getMessage();
}
