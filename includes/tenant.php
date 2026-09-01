<?php
/**
 * Tenant Detection System
 * 
 * Logic:
 * 1. Get HTTP_HOST
 * 2. Parse subdomain
 * 3. Define CURRENT_TENANT or leave undefined for main domain
 */

function detect_tenant() {
    // 1. Get Host
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    
    // Remove www. if present
    $host = preg_replace('/^www\./', '', $host);

    // 2. Identify Domain Parts
    // We assume the main domain is the last two parts (e.g. site.com) 
    // OR matches a configured MAIN_DOMAIN constant if valid.
    
    // Validating against a known main domain is safer, but user asked for dynamic.
    // Let's assume standard `subdomain.domain.tld` or `subdomain.localhost`
    
    $parts = explode('.', $host);
    $count = count($parts);

    // Support local subdomain testing under .localhost domain (e.g. billing.localhost)
    $is_localhost = ($count > 1 && strtolower($parts[$count - 1]) === 'localhost');
    if ($is_localhost) {
        if ($count == 1) {
            return null; // Just 'localhost'
        }
        $subdomain = $parts[0];
    } else {
        // If we have 2 parts (e.g. myisp.com) -> Main Domain
        // If we have 1 part (localhost) -> Main Domain
        if ($count <= 2) {
            return null; // Main System
        }
        // If we have 3+ parts (e.g. client.myisp.com) -> Tenant is the first part
        $subdomain = $parts[0];
    }

    // 3. Security / Sanitization
    // Allow only alphanumeric and hyphens
    $tenant = preg_replace('/[^a-zA-Z0-9-]/', '', $subdomain);

    // Exclude reserved words if any (e.g. 'm', 'www', 'mail', 'admin' if you want them global)
    $reserved = ['www', 'mail', 'ftp', 'cpanel', 'webmail'];
    if (in_array($tenant, $reserved)) {
        return null;
    }

    return $tenant ? $tenant : null;
}

$detected_tenant = detect_tenant();

if ($detected_tenant) {
    if (!defined('CURRENT_TENANT')) {
        define('CURRENT_TENANT', $detected_tenant);
    }
}
?>
