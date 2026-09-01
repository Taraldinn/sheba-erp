<?php
require_once __DIR__ . '/includes/db_config.php';
try {
    $masterPdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8", DB_USER, DB_PASS);
    $stmt = $masterPdo->query("SELECT id, name, subdomain FROM tenants");
    $tenants = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($tenants as &$t) {
        $tsc = $masterPdo->prepare("SELECT COUNT(*) FROM api_tokens WHERE tenant_id = ?");
        $tsc->execute([$t['id']]);
        $t['token_count'] = $tsc->fetchColumn();
    }
    print_r($tenants);

    echo "\nFixing tenant 2...\n";
    $masterPdo->query("UPDATE tenants SET subdomain = 'ripa.shebafi.com', name = 'ripa' WHERE id = 2");
    
    // Check if token exists
    $tsc = $masterPdo->query("SELECT COUNT(*) FROM api_tokens WHERE tenant_id = 2");
    if ($tsc->fetchColumn() == 0) {
        $masterPdo->query("INSERT INTO api_tokens (tenant_id, token_hash, expires_at, rate_limit) VALUES (2, 'test_token_ripa_2026', '2036-04-04 12:00:00', 100)");
        echo "Inserted token.\n";
    }
    echo "Done resolving ripa tenant in DB.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
