<?php
require_once dirname(__DIR__) . '/../includes/db_config.php';
try {
    $masterPdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8", DB_USER, DB_PASS);
    
    // Update tenant 2 subdomain
    $masterPdo->query("UPDATE tenants SET subdomain = 'ripa.shebafi.com', name = 'ripa' WHERE id = 2");
    echo "Updated subdomain to ripa.shebafi.com\n";
    
    // Add correct token if missing
    $tsc = $masterPdo->query("SELECT COUNT(*) FROM api_tokens WHERE tenant_id = 2");
    if ($tsc->fetchColumn() == 0) {
        $masterPdo->query("INSERT INTO api_tokens (tenant_id, token_hash, expires_at, rate_limit) VALUES (2, 'test_token_ripa_2026', '2036-04-04 12:00:00', 100)");
        echo "Inserted token.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
