<?php
require_once dirname(__DIR__) . '/includes/config.php';
try {
    $stmt = $pdo->query("SELECT t.id, t.name, t.subdomain, t.hmac_secret, a.token_hash, a.expires_at 
                         FROM tenants t 
                         LEFT JOIN api_tokens a ON t.id = a.tenant_id");
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($results, JSON_PRETTY_PRINT);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
