<?php
require_once 'includes/config.php';

try {
    $stmt = $pdo->query("SELECT * FROM " . TBL_TENANT_VPN);
    $vpns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "--- VPN CONFIGURATIONS ---\n";
    foreach ($vpns as $vpn) {
        print_r($vpn);
    }
} catch (Exception $e) {
    echo "Error fetching VPN: " . $e->getMessage() . "\n";
}
?>
