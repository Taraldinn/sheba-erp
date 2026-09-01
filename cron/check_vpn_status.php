<?php
require_once __DIR__ . '/../includes/config.php';
$pdo = $pdo; // from config
$stmt = $pdo->query('SELECT id, vpn_status, require_encryption FROM tenant_vpn LIMIT 1');
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if ($row) {
    echo "ID: {$row['id']}\nStatus: {$row['vpn_status']}\nRequireEncryption: {$row['require_encryption']}\n";
} else {
    echo "No VPN record found.\n";
}
?>
