<?php
// diag_api.php
// Diagnostic script to check API tenant configuration

$masterHost = '127.0.0.1';
$masterDb = 'shebafi_master';
$masterUser = 'shebafi_master';
$masterPass = 'Mother519466@';

header('Content-Type: application/json');

try {
    $pdo = new PDO("mysql:host=" . $masterHost . ";dbname=" . $masterDb . ";charset=utf8", $masterUser, $masterPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // 1. Check all tenants
    $tenants = $pdo->query("SELECT id, name, subdomain, status FROM tenants")->fetchAll();
    
    // 2. Check tokens for each tenant
    foreach ($tenants as &$tenant) {
        $stmt = $pdo->prepare("SELECT COUNT(*) as token_count FROM api_tokens WHERE tenant_id = ?");
        $stmt->execute([$tenant['id']]);
        $tenant['token_count'] = $stmt->fetch()['token_count'];
    }

    echo json_encode([
        'status' => 'success',
        'data' => [
            'tenants' => $tenants,
            'detected_host' => $_SERVER['HTTP_HOST'] ?? 'unknown',
            'server_ip' => $_SERVER['SERVER_ADDR'] ?? 'unknown'
        ]
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
