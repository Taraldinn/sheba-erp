<?php
// ajax/vpn_generate_mikrotik_script.php
// Secure endpoint to generate MikroTik WireGuard configuration script

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

// Set response content type to JSON
header('Content-Type: application/json');

// 1. Ensure user is logged in
if (!isLoggedIn()) {
    echo json_encode([
        'success' => false,
        'message' => 'Unauthorized: Please log in first.'
    ]);
    exit;
}

// 2. Validate permissions (vpn_script_generate)
if (!hasPermission('vpn_script_generate') && !hasRole('Admin') && !hasRole('Reseller')) {
    echo json_encode([
        'success' => false,
        'message' => 'Permission denied: vpn_script_generate permission is required.'
    ]);
    exit;
}

// 3. Determine owner (tenant isolation)
$current_uid = $_SESSION['admin_id'] ?? 0;
$cur_parent  = $_SESSION['parent_id'] ?? 0;
$my_owner_id = (isOffice() && $cur_parent > 0) ? $cur_parent : $current_uid;

// 4. Retrieve requested tenant_id
$req_tenant_id = isset($_GET['tenant_id']) ? intval($_GET['tenant_id']) : 0;

// 5. Security check:
// Super Admin (Admin or Super Admin role) can generate any tenant script.
// Tenant Admin (Reseller) or Staff can generate only their own tenant script.
if (hasRole('Admin')) {
    $tenant_id = ($req_tenant_id > 0) ? $req_tenant_id : $my_owner_id;
} else {
    if ($req_tenant_id > 0 && $req_tenant_id !== $my_owner_id) {
        echo json_encode([
            'success' => false,
            'message' => 'Security restriction: You can only generate the script for your own tenant.'
        ]);
        exit;
    }
    $tenant_id = $my_owner_id;
}

// 6. Fetch VPN settings for this tenant
$wg = safeFetch($pdo, "SELECT * FROM " . TBL_TENANT_WG . " WHERE staff_id = ?", [$tenant_id]);
if (!$wg) {
    echo json_encode([
        'success' => false,
        'message' => 'No VPN settings found. Please save settings first.'
    ]);
    exit;
}

// 7. Check if private key is saved
if (!($wg['mik_private_key_set'] ?? 0) || empty($wg['mik_private_key_enc'])) {
    echo json_encode([
        'success' => false,
        'message' => 'MikroTik private key is missing. Please save/generate key first.'
    ]);
    exit;
}

// 8. Decrypt private key
// Secure SHA-256 derived key and IV
$enc_key_secure = hash('sha256', 'wg_enc_' . $tenant_id . 'shebasoft2026');
$iv_secure      = substr(hash('sha256', 'iv_' . $tenant_id), 0, 16);
$decrypted_private_key = openssl_decrypt(base64_decode($wg['mik_private_key_enc']), 'AES-256-CBC', $enc_key_secure, 0, $iv_secure);

// Self-healing legacy fallback
if ($decrypted_private_key === false) {
    // Try legacy MD5 key & IV derivation
    // LEGACY COMPATIBILITY: Hardware expects md5. Safe to retain for existing compatibility.
    $enc_key_legacy = md5('wg_enc_' . $tenant_id . 'shebasoft2026');
    $iv_legacy      = substr(md5('iv_' . $tenant_id), 0, 16);
    $decrypted_private_key = openssl_decrypt(base64_decode($wg['mik_private_key_enc']), 'AES-256-CBC', $enc_key_legacy, 0, $iv_legacy);
    
    if ($decrypted_private_key !== false) {
        // Automatically migrate to the new SHA-256 encryption format
        $new_enc_data = base64_encode(openssl_encrypt($decrypted_private_key, 'AES-256-CBC', $enc_key_secure, 0, $iv_secure));
        $up_stmt = $pdo->prepare("UPDATE " . TBL_TENANT_WG . " SET mik_private_key_enc = ? WHERE staff_id = ?");
        $up_stmt->execute([$new_enc_data, $tenant_id]);
        
        // Log migration event securely
        safe_log('security_migration', "Automatically migrated WireGuard private key to secure SHA-256 encryption for tenant: $tenant_id");
    }
}

if ($decrypted_private_key === false) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: Failed to decrypt the saved MikroTik private key.'
    ]);
    exit;
}

// 9. Fetch OLT subnets
$subnets = safeFetchAll($pdo, "SELECT subnet FROM " . TBL_TENANT_WG_SUBNETS . " WHERE staff_id = ? ORDER BY id", [$tenant_id]);

// 10. Extract values
$wg_ip         = $wg['wg_ip'] ?? '';
$vps_pub_key   = $wg['vps_public_key'] ?? '';
$endpoint_ip   = $wg['endpoint_ip'] ?? '';
$endpoint_port = intval($wg['endpoint_port']) ?: 51820;
$allowed_ips   = $wg['allowed_ips'] ?? '';
$router_name   = $wg['router_name'] ?? 'MikroTik';

// 11. Generate script lines matching exact requirements
$script_lines = [];
$script_lines[] = '/interface wireguard remove [find name="wg-hub"]';
$script_lines[] = '/interface wireguard add name=wg-hub private-key="' . $decrypted_private_key . '" listen-port=51820';
$script_lines[] = '/ip address add address=' . $wg_ip . ' interface=wg-hub';
$script_lines[] = '/interface wireguard peers add interface=wg-hub public-key="' . $vps_pub_key . '" endpoint-address=' . $endpoint_ip . ' endpoint-port=' . $endpoint_port . ' allowed-address=' . $allowed_ips . ' persistent-keepalive=25s';

if (!empty($subnets)) {
    foreach ($subnets as $sub) {
        $subnet_ip = $sub['subnet'];
        $script_lines[] = '/ip firewall nat add chain=srcnat src-address=10.255.0.0/16 dst-address=' . $subnet_ip . ' action=masquerade';
    }
}

$final_script = implode("\n", $script_lines);

// 12. Return JSON response
echo json_encode([
    'success' => true,
    'script' => $final_script,
    'router_name' => $router_name
]);
exit;
