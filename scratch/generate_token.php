<?php
require_once dirname(__DIR__) . '/includes/config.php';
try {
    // 1. Delete any expired or existing tokens for tenant ID 1
    $pdo->prepare("DELETE FROM api_tokens WHERE tenant_id = 1")->execute();

    // 2. Insert a fresh active token
    $token = 'test_api_token_123';
    $expires = '2036-06-14 00:00:00';
    $stmt = $pdo->prepare("INSERT INTO api_tokens (tenant_id, token_hash, expires_at, rate_limit, ip_whitelist) VALUES (1, ?, ?, 1000, NULL)");
    $stmt->execute([$token, $expires]);

    // 3. Select and print info
    $stmt = $pdo->query("SELECT t.subdomain, t.hmac_secret, a.token_hash, a.expires_at 
                         FROM tenants t 
                         JOIN api_tokens a ON t.id = a.tenant_id 
                         WHERE t.id = 1");
    $info = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo "=== API Token Generated Successfully ===\n";
    echo "X-Tenant-Key: " . $info['subdomain'] . "\n";
    echo "Authorization: Bearer " . $info['token_hash'] . "\n";
    echo "HMAC Secret Key: " . $info['hmac_secret'] . "\n";
    echo "Expires: " . $info['expires_at'] . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
