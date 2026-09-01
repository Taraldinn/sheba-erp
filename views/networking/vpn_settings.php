<?php
// VPN Settings View — WireGuard Per-Tenant Panel
// Tenant isolation: staff_id from session (DB-per-tenant + staff_id scoping)

require_once __DIR__ . '/../../classes/OLTManager.php';

// --- Determine owner (tenant isolation) ---
$current_uid = $_SESSION['admin_id'] ?? 0;
$cur_parent  = $_SESSION['parent_id'] ?? 0;
$owner_id    = (isOffice() && $cur_parent > 0) ? $cur_parent : $current_uid;

// Handle POST actions first
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // CSRF Check
    $token = $_POST['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (empty($token) || $token !== ($_SESSION['csrf_token'] ?? '')) {
        $_SESSION['flash_err'] = "Invalid CSRF Token.";
        header("Location: ?tab=vpn_settings");
        exit;
    }

    // Action 1: Save WG Settings
    if (isset($_POST['save_wg_settings'])) {
        if (!hasPermission('vpn_settings_edit') && !hasRole('Admin') && !hasRole('Reseller')) {
            $_SESSION['flash_err'] = "Access denied: You do not have permission to edit VPN settings.";
            header("Location: ?tab=vpn_settings");
            exit;
        }

        $wg_ip = trim($_POST['wg_ip'] ?? '');
        $mik_public_key = trim($_POST['mik_public_key'] ?? '');
        $vps_public_key = trim($_POST['vps_public_key'] ?? '');
        $endpoint_ip = trim($_POST['endpoint_ip'] ?? '');
        $endpoint_port = intval($_POST['endpoint_port'] ?? 51820);
        $allowed_ips = trim($_POST['allowed_ips'] ?? '0.0.0.0/0');
        $snmp_community = trim($_POST['snmp_community'] ?? 'public');
        $router_name = trim($_POST['router_name'] ?? 'MikroTik');
        $router_location = trim($_POST['router_location'] ?? '');
        
        // Handle private key encryption
        $mik_private_key = trim($_POST['mik_private_key'] ?? '');
        
        // Fetch existing config
        $existing = safeFetch($pdo, "SELECT * FROM " . TBL_TENANT_WG . " WHERE staff_id = ?", [$owner_id]);
        
        if ($existing) {
            // Update
            $sql = "UPDATE " . TBL_TENANT_WG . " SET wg_ip = ?, mik_public_key = ?, vps_public_key = ?, endpoint_ip = ?, endpoint_port = ?, allowed_ips = ?, snmp_community = ?, router_name = ?, router_location = ? WHERE staff_id = ?";
            $params = [$wg_ip, $mik_public_key, $vps_public_key, $endpoint_ip, $endpoint_port, $allowed_ips, $snmp_community, $router_name, $router_location, $owner_id];
            $pdo->prepare($sql)->execute($params);
            
            if (!empty($mik_private_key)) {
                $enc_key_secure = hash('sha256', 'wg_enc_' . $owner_id . 'shebasoft2026');
                $iv_secure      = substr(hash('sha256', 'iv_' . $owner_id), 0, 16);
                $mik_private_key_enc = base64_encode(openssl_encrypt($mik_private_key, 'AES-256-CBC', $enc_key_secure, 0, $iv_secure));
                
                $pdo->prepare("UPDATE " . TBL_TENANT_WG . " SET mik_private_key_enc = ?, mik_private_key_set = 1 WHERE staff_id = ?")->execute([$mik_private_key_enc, $owner_id]);
            }
        } else {
            // Insert
            $enc_key_secure = hash('sha256', 'wg_enc_' . $owner_id . 'shebasoft2026');
            $iv_secure      = substr(hash('sha256', 'iv_' . $owner_id), 0, 16);
            $mik_private_key_enc = !empty($mik_private_key) ? base64_encode(openssl_encrypt($mik_private_key, 'AES-256-CBC', $enc_key_secure, 0, $iv_secure)) : null;
            $mik_private_key_set = !empty($mik_private_key) ? 1 : 0;
            
            $sql = "INSERT INTO " . TBL_TENANT_WG . " (staff_id, wg_ip, mik_public_key, mik_private_key_enc, mik_private_key_set, vps_public_key, endpoint_ip, endpoint_port, allowed_ips, snmp_community, router_name, router_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $params = [$owner_id, $wg_ip, $mik_public_key, $mik_private_key_enc, $mik_private_key_set, $vps_public_key, $endpoint_ip, $endpoint_port, $allowed_ips, $snmp_community, $router_name, $router_location];
            $pdo->prepare($sql)->execute($params);
        }
        
        $_SESSION['flash_msg'] = "WireGuard settings saved successfully!";
        header("Location: ?tab=vpn_settings");
        exit;
    }

    // Action 2: Add Subnet
    if (isset($_POST['add_wg_subnet'])) {
        if (!hasPermission('vpn_olt_add') && !hasRole('Admin') && !hasRole('Reseller')) {
            $_SESSION['flash_err'] = "Access denied: You do not have permission to add subnets.";
            header("Location: ?tab=vpn_settings");
            exit;
        }

        $olt_id = !empty($_POST['olt_id']) ? intval($_POST['olt_id']) : null;
        $subnet = trim($_POST['subnet'] ?? '');
        $label = trim($_POST['label'] ?? '');

        if (!empty($subnet)) {
            $sql = "INSERT INTO " . TBL_TENANT_WG_SUBNETS . " (staff_id, olt_id, subnet, created_at) VALUES (?, ?, ?, NOW())";
            $pdo->prepare($sql)->execute([$owner_id, $olt_id, $subnet]);
            $_SESSION['flash_msg'] = "OLT subnet added successfully!";
        } else {
            $_SESSION['flash_err'] = "Subnet CIDR is required.";
        }
        header("Location: ?tab=vpn_settings");
        exit;
    }

    // Action 3: Delete Subnet
    if (isset($_POST['delete_wg_subnet'])) {
        if (!hasPermission('vpn_olt_delete') && !hasRole('Admin') && !hasRole('Reseller')) {
            $_SESSION['flash_err'] = "Access denied: You do not have permission to delete subnets.";
            header("Location: ?tab=vpn_settings");
            exit;
        }

        $subnet_id = intval($_POST['subnet_id'] ?? 0);
        
        // Ensure tenant isolation
        $check = safeFetch($pdo, "SELECT id FROM " . TBL_TENANT_WG_SUBNETS . " WHERE id = ? AND staff_id = ?", [$subnet_id, $owner_id]);
        if ($check) {
            $pdo->prepare("DELETE FROM " . TBL_TENANT_WG_SUBNETS . " WHERE id = ?")->execute([$subnet_id]);
            $_SESSION['flash_msg'] = "OLT subnet removed successfully!";
        } else {
            $_SESSION['flash_err'] = "Subnet not found or access denied.";
        }
        header("Location: ?tab=vpn_settings");
        exit;
    }
}

// --- Access Control ---
if (!hasPermission('vpn_settings_view') && !hasRole('Admin') && !hasRole('Reseller')) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm'><i class='fas fa-lock me-2'></i> Access Denied: You do not have permission to view VPN Settings.</div></div>";
    return;
}

// Fetch staff/tenant info
$tenant_info = safeFetch($pdo, "SELECT name, username FROM " . TBL_STAFF . " WHERE id = ?", [$owner_id]);
$tenant_name = $tenant_info['name'] ?? 'Unknown';

// Fetch WG settings
$wg = safeFetch($pdo, "SELECT * FROM " . TBL_TENANT_WG . " WHERE staff_id = ?", [$owner_id]);

// Fetch OLT subnets for this tenant
$subnets = safeFetchAll($pdo, "SELECT s.*, o.name as olt_name FROM " . TBL_TENANT_WG_SUBNETS . " s LEFT JOIN " . TBL_OLTS . " o ON o.id = s.olt_id WHERE s.staff_id = ? ORDER BY s.id", [$owner_id]);

// Fetch existing OLTs for this tenant (for autocomplete)
$oltMgr = new OLTManager($pdo);
$my_olts = $oltMgr->getAllOLTs(hasRole('Admin') ? null : $owner_id);

// Parse last test result
$last_test = null;
if ($wg && !empty($wg['last_test_result'])) {
    $last_test = json_decode($wg['last_test_result'], true);
}

// Format bytes helper
function fmt_bytes($bytes) {
    if ($bytes >= 1073741824) return round($bytes / 1073741824, 2) . ' GB';
    if ($bytes >= 1048576)    return round($bytes / 1048576, 2) . ' MB';
    if ($bytes >= 1024)       return round($bytes / 1024, 2) . ' KB';
    return $bytes . ' B';
}

// VPN status info
$vpn_status  = $wg['vpn_status'] ?? 'unknown';
$status_map  = [
    'connected'    => ['badge' => 'success', 'icon' => 'fa-circle text-success', 'label' => 'Connected'],
    'disconnected' => ['badge' => 'danger',  'icon' => 'fa-circle text-danger',  'label' => 'Disconnected'],
    'unknown'      => ['badge' => 'secondary','icon' => 'fa-circle text-secondary','label' => 'Unknown'],
];
$s_info = $status_map[$vpn_status] ?? $status_map['unknown'];

// Last handshake human-readable
$last_hs = '';
if (!empty($wg['last_handshake'])) {
    $diff = time() - strtotime($wg['last_handshake']);
    if ($diff < 60)         $last_hs = $diff . 's ago';
    elseif ($diff < 3600)   $last_hs = floor($diff/60) . 'm ago';
    elseif ($diff < 86400)  $last_hs = floor($diff/3600) . 'h ago';
    else                    $last_hs = date('Y-m-d H:i', strtotime($wg['last_handshake']));
}

$can_edit    = hasPermission('vpn_settings_edit') || hasRole('Admin') || hasRole('Reseller');
$can_subnet_add = hasPermission('vpn_olt_add') || hasRole('Admin') || hasRole('Reseller');
$can_subnet_del = hasPermission('vpn_olt_delete') || hasRole('Admin') || hasRole('Reseller');
$can_test    = hasPermission('vpn_test_connection') || hasRole('Admin') || hasRole('Reseller');
$can_script  = hasPermission('vpn_script_generate') || hasRole('Admin') || hasRole('Reseller');
?>

<style>
.vpn-glass {
    background: linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(248,250,255,0.95) 100%);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(99,102,241,0.15);
    border-radius: 16px;
}
.vpn-header-gradient {
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%);
    border-radius: 16px 16px 0 0;
}
.stat-pill {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 14px 20px;
    transition: all 0.3s ease;
}
.stat-pill:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
.wg-field-label {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6366f1;
    margin-bottom: 4px;
}
.vpn-input {
    background: rgba(99,102,241,0.04);
    border: 1.5px solid rgba(99,102,241,0.2);
    border-radius: 10px;
    padding: 10px 14px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.88rem;
    transition: border-color 0.2s, box-shadow 0.2s;
}
.vpn-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
    background: #fff;
    outline: none;
}
.vpn-input[readonly] {
    background: rgba(0,0,0,0.03);
    cursor: not-allowed;
    color: #64748b;
}
.section-title {
    font-size: 0.9rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #4338ca;
    border-left: 4px solid #6366f1;
    padding-left: 12px;
    margin-bottom: 20px;
}
.subnet-badge {
    background: linear-gradient(135deg, #ede9fe, #ddd6fe);
    border: 1px solid #a5b4fc;
    color: #4338ca;
    border-radius: 8px;
    padding: 4px 12px;
    font-family: monospace;
    font-size: 0.83rem;
    font-weight: 600;
}
.btn-vpn-primary {
    background: linear-gradient(135deg, #4338ca, #6366f1);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 10px 24px;
    font-weight: 700;
    letter-spacing: 0.03em;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(99,102,241,0.35);
}
.btn-vpn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(99,102,241,0.45); color: #fff; }
.btn-vpn-secondary {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #94a3b8;
    border: none;
    border-radius: 10px;
    padding: 10px 24px;
    font-weight: 700;
    transition: all 0.2s;
}
.btn-vpn-secondary:hover { color: #fff; transform: translateY(-1px); }
.key-set-badge {
    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    border: 1px solid #6ee7b7;
    color: #065f46;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 0.85rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.vpn-status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
    animation: vpn-pulse 2s infinite;
}
.vpn-status-dot.connected    { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.25); }
.vpn-status-dot.disconnected { background: #ef4444; animation: none; }
.vpn-status-dot.unknown      { background: #94a3b8; animation: none; }
@keyframes vpn-pulse {
    0%,100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.25); }
    50%      { box-shadow: 0 0 0 6px rgba(34,197,94,0.1); }
}
.script-code {
    background: #0f172a;
    color: #94a3b8;
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 0.8rem;
    border-radius: 12px;
    padding: 20px;
    max-height: 440px;
    overflow-y: auto;
    white-space: pre;
    line-height: 1.6;
}
.script-code .hl-comment { color: #64748b; }
.script-code .hl-cmd    { color: #818cf8; }
.script-code .hl-value  { color: #34d399; }
.olt-suggest-item {
    cursor: pointer;
    padding: 8px 14px;
    border-radius: 8px;
    transition: background 0.15s;
    font-size: 0.85rem;
}
.olt-suggest-item:hover { background: rgba(99,102,241,0.08); }
</style>

<div class="container-fluid px-4 py-3">

    <!-- ═══ PAGE HEADER ═══ -->
    <div class="vpn-glass mb-4" style="overflow:hidden;">
        <div class="vpn-header-gradient p-4 d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
                <div class="d-flex align-items-center gap-3 mb-1">
                    <span class="vpn-status-dot <?= $vpn_status ?>"></span>
                    <span class="text-white fw-bold fs-5">
                        <i class="fas fa-shield-alt me-2 text-indigo-200" style="color:#a5b4fc;"></i>
                        WireGuard VPN Settings
                    </span>
                    <span class="badge bg-<?= $s_info['badge'] ?> px-3 py-1"><?= $s_info['label'] ?></span>
                </div>
                <div class="text-white-50 small">
                    Tenant: <strong class="text-white"><?= htmlspecialchars($tenant_name) ?></strong>
                    &nbsp;|&nbsp; ID: <code class="text-info"><?= $owner_id ?></code>
                    &nbsp;|&nbsp; WG IP: <code class="text-info"><?= htmlspecialchars($wg['wg_ip'] ?? '—') ?></code>
                </div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
                <?php if ($can_test): ?>
                <button class="btn btn-sm btn-light fw-bold" id="btnTestVpn" onclick="testVpnConnection()">
                    <i class="fas fa-plug me-1"></i> Test Connection
                </button>
                <?php endif; ?>
                <?php if ($can_script): ?>
                <button class="btn btn-sm fw-bold" style="background:#818cf8;color:#fff;border:none;" onclick="generateWgScript(<?= $owner_id ?>)" data-bs-toggle="modal" data-bs-target="#wgScriptModal">
                    <i class="fas fa-code me-1"></i> Generate MikroTik Script
                </button>
                <?php endif; ?>
            </div>
        </div>

        <!-- Status Bar -->
        <div class="d-flex flex-wrap gap-3 p-3 bg-white border-top" style="border-color:rgba(99,102,241,0.1)!important;">
            <div class="stat-pill flex-grow-1" style="background:linear-gradient(135deg,rgba(99,102,241,0.06),rgba(99,102,241,0.02));">
                <div class="text-muted small mb-1"><i class="fas fa-handshake me-1 text-indigo-500" style="color:#6366f1;"></i> Last Handshake</div>
                <div class="fw-bold text-dark"><?= $last_hs ?: '—' ?></div>
            </div>
            <div class="stat-pill flex-grow-1" style="background:linear-gradient(135deg,rgba(34,197,94,0.06),rgba(34,197,94,0.02));">
                <div class="text-muted small mb-1"><i class="fas fa-arrow-down me-1 text-success"></i> Data RX</div>
                <div class="fw-bold text-dark"><?= fmt_bytes($wg['data_rx'] ?? 0) ?></div>
            </div>
            <div class="stat-pill flex-grow-1" style="background:linear-gradient(135deg,rgba(59,130,246,0.06),rgba(59,130,246,0.02));">
                <div class="text-muted small mb-1"><i class="fas fa-arrow-up me-1 text-primary"></i> Data TX</div>
                <div class="fw-bold text-dark"><?= fmt_bytes($wg['data_tx'] ?? 0) ?></div>
            </div>
            <div class="stat-pill flex-grow-1" style="background:linear-gradient(135deg,rgba(245,158,11,0.06),rgba(245,158,11,0.02));">
                <div class="text-muted small mb-1"><i class="fas fa-vial me-1 text-warning"></i> Last Test Result</div>
                <div class="fw-bold text-dark" id="lastTestDisplay">
                    <?php if ($last_test): ?>
                        <span class="text-<?= $last_test['ok'] ? 'success' : 'danger' ?>">
                            <i class="fas fa-<?= $last_test['ok'] ? 'check-circle' : 'times-circle' ?> me-1"></i>
                            <?= htmlspecialchars($last_test['msg'] ?? '') ?>
                        </span>
                        <?php if (!empty($wg['last_test_at'])): ?>
                        <br><small class="text-muted"><?= date('d M Y H:i', strtotime($wg['last_test_at'])) ?></small>
                        <?php endif; ?>
                    <?php else: ?>
                        <span class="text-muted">No test run yet</span>
                    <?php endif; ?>
                </div>
            </div>
            <div class="stat-pill flex-grow-1" style="background:linear-gradient(135deg,rgba(139,92,246,0.06),rgba(139,92,246,0.02));">
                <div class="text-muted small mb-1"><i class="fas fa-sitemap me-1 text-purple" style="color:#8b5cf6;"></i> OLT Subnets</div>
                <div class="fw-bold text-dark"><?= count($subnets) ?> subnet<?= count($subnets) != 1 ? 's' : '' ?></div>
            </div>
        </div>
    </div>

    <div class="row g-4">

        <!-- ═══ LEFT: VPN Config Form ═══ -->
        <div class="col-lg-7">
            <div class="vpn-glass p-4 h-100">
                <div class="section-title">
                    <i class="fas fa-cog me-2"></i> WireGuard Configuration
                </div>

                <?php if (!$can_edit): ?>
                <div class="alert alert-info border-0 rounded-3 mb-4">
                    <i class="fas fa-info-circle me-2"></i> You have view-only access. Contact your administrator to edit VPN settings.
                </div>
                <?php endif; ?>

                <form method="POST" action="?tab=vpn_settings" autocomplete="off">
                    <input type="hidden" name="save_wg_settings" value="1">
                    <input type="hidden" name="ajax_action_flag" value="0">

                    <!-- Row: Tenant Info (readonly) -->
                    <div class="row g-3 mb-3">
                        <div class="col-md-7">
                            <div class="wg-field-label">Tenant Name</div>
                            <input type="text" class="form-control vpn-input" value="<?= htmlspecialchars($tenant_name) ?>" readonly>
                        </div>
                        <div class="col-md-5">
                            <div class="wg-field-label">Tenant ID (staff_id)</div>
                            <input type="text" class="form-control vpn-input" value="<?= $owner_id ?>" readonly>
                        </div>
                    </div>

                    <!-- Row: WG IP -->
                    <div class="mb-3">
                        <div class="wg-field-label">WireGuard IP (CIDR) <span class="text-danger">*</span></div>
                        <input type="text" name="wg_ip" class="form-control vpn-input" placeholder="10.255.1.1/32"
                               value="<?= htmlspecialchars($wg['wg_ip'] ?? '') ?>"
                               <?= $can_edit ? '' : 'readonly' ?> required>
                        <div class="form-text text-muted">e.g. 10.255.1.1/32 — unique per tenant</div>
                    </div>

                    <!-- Row: Public Keys -->
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <div class="wg-field-label">MikroTik Public Key</div>
                            <textarea name="mik_public_key" class="form-control vpn-input" rows="3"
                                      placeholder="MikroTik WG public key (base64)..."
                                      <?= $can_edit ? '' : 'readonly' ?>><?= htmlspecialchars($wg['mik_public_key'] ?? '') ?></textarea>
                        </div>
                        <div class="col-md-6">
                            <div class="wg-field-label">
                                MikroTik Private Key
                                <?php if ($wg['mik_private_key_set'] ?? 0): ?>
                                <span class="badge bg-success ms-1 py-1">SET</span>
                                <?php endif; ?>
                            </div>
                            <?php if ($wg['mik_private_key_set'] ?? 0): ?>
                            <div class="key-set-badge mb-2">
                                <i class="fas fa-key"></i> Key is configured — enter new key to replace
                            </div>
                            <input type="password" name="mik_private_key" class="form-control vpn-input"
                                   placeholder="Enter new private key to replace..."
                                   autocomplete="new-password"
                                   <?= $can_edit ? '' : 'readonly' ?>>
                            <div class="form-text text-danger"><i class="fas fa-eye-slash me-1"></i> Private key is never displayed after save.</div>
                            <?php else: ?>
                            <textarea name="mik_private_key" class="form-control vpn-input" rows="3"
                                      placeholder="MikroTik WG private key (base64)... Will be encrypted."
                                      autocomplete="new-password"
                                      <?= $can_edit ? '' : 'readonly' ?>></textarea>
                            <div class="form-text text-warning"><i class="fas fa-lock me-1"></i> Stored encrypted. Never shown after save.</div>
                            <?php endif; ?>
                        </div>
                    </div>

                    <!-- VPS Public Key -->
                    <div class="mb-3">
                        <div class="wg-field-label">VPS Public Key (Server Side) <span class="text-danger">*</span></div>
                        <textarea name="vps_public_key" class="form-control vpn-input" rows="2"
                                  placeholder="VPS WireGuard server public key (base64)..."
                                  <?= $can_edit ? '' : 'readonly' ?>><?= htmlspecialchars($wg['vps_public_key'] ?? '') ?></textarea>
                    </div>

                    <!-- Endpoint -->
                    <div class="row g-3 mb-3">
                        <div class="col-md-8">
                            <div class="wg-field-label">Endpoint IP / Hostname <span class="text-danger">*</span></div>
                            <input type="text" name="endpoint_ip" class="form-control vpn-input"
                                   placeholder="1.2.3.4 or vpn.yourserver.com"
                                   value="<?= htmlspecialchars($wg['endpoint_ip'] ?? '') ?>"
                                   <?= $can_edit ? '' : 'readonly' ?>>
                        </div>
                        <div class="col-md-4">
                            <div class="wg-field-label">Endpoint Port</div>
                            <input type="number" name="endpoint_port" class="form-control vpn-input"
                                   placeholder="51820" min="1" max="65535"
                                   value="<?= intval($wg['endpoint_port'] ?? 51820) ?>"
                                   <?= $can_edit ? '' : 'readonly' ?>>
                        </div>
                    </div>

                    <!-- Allowed IPs -->
                    <div class="mb-3">
                        <div class="wg-field-label">Allowed IPs</div>
                        <input type="text" name="allowed_ips" class="form-control vpn-input"
                               placeholder="0.0.0.0/0 or 10.0.0.0/8,192.168.0.0/16"
                               value="<?= htmlspecialchars($wg['allowed_ips'] ?? '0.0.0.0/0') ?>"
                               <?= $can_edit ? '' : 'readonly' ?>>
                        <div class="form-text text-muted">Comma-separated CIDRs. Use 0.0.0.0/0 to route all traffic.</div>
                    </div>

                    <!-- SNMP + Router Info -->
                    <div class="row g-3 mb-3">
                        <div class="col-md-4">
                            <div class="wg-field-label">SNMP Community</div>
                            <input type="text" name="snmp_community" class="form-control vpn-input"
                                   placeholder="public"
                                   value="<?= htmlspecialchars($wg['snmp_community'] ?? 'public') ?>"
                                   <?= $can_edit ? '' : 'readonly' ?>>
                        </div>
                        <div class="col-md-4">
                            <div class="wg-field-label">Router Name</div>
                            <input type="text" name="router_name" class="form-control vpn-input"
                                   placeholder="MikroTik-Main"
                                   value="<?= htmlspecialchars($wg['router_name'] ?? '') ?>"
                                   <?= $can_edit ? '' : 'readonly' ?>>
                        </div>
                        <div class="col-md-4">
                            <div class="wg-field-label">Router Location</div>
                            <input type="text" name="router_location" class="form-control vpn-input"
                                   placeholder="Server Room, Dhaka"
                                   value="<?= htmlspecialchars($wg['router_location'] ?? '') ?>"
                                   <?= $can_edit ? '' : 'readonly' ?>>
                        </div>
                    </div>

                    <?php if ($can_edit): ?>
                    <div class="d-flex gap-2 pt-2">
                        <button type="submit" class="btn btn-vpn-primary">
                            <i class="fas fa-save me-2"></i> Save VPN Settings
                        </button>
                        <button type="reset" class="btn btn-light border fw-semibold">
                            <i class="fas fa-undo me-1"></i> Reset
                        </button>
                    </div>
                    <?php endif; ?>
                </form>
            </div>
        </div>

        <!-- ═══ RIGHT: Subnet Manager ═══ -->
        <div class="col-lg-5">
            <div class="vpn-glass p-4 mb-4">
                <div class="section-title">
                    <i class="fas fa-network-wired me-2"></i> OLT Subnet List
                </div>

                <!-- Existing Subnets Table -->
                <?php if (!empty($subnets)): ?>
                <div class="table-responsive mb-3">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr class="text-muted" style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">
                                <th>Subnet</th>
                                <th>Label / OLT</th>
                                <?php if ($can_subnet_del): ?><th class="text-end">Del</th><?php endif; ?>
                            </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($subnets as $sub): ?>
                            <tr>
                                <td><span class="subnet-badge"><?= htmlspecialchars($sub['subnet']) ?></span></td>
                                <td class="small text-muted">
                                    <?php if ($sub['olt_name']): ?>
                                    <i class="fas fa-server me-1 text-primary"></i><?= htmlspecialchars($sub['olt_name']) ?>
                                    <?php else: ?>
                                    <?= htmlspecialchars($sub['label'] ?? '—') ?>
                                    <?php endif; ?>
                                </td>
                                <?php if ($can_subnet_del): ?>
                                <td class="text-end">
                                    <form method="POST" action="?tab=vpn_settings" onsubmit="return confirm('Remove subnet <?= htmlspecialchars($sub['subnet']) ?>?')">
                                        <input type="hidden" name="delete_wg_subnet" value="1">
                                        <input type="hidden" name="subnet_id" value="<?= $sub['id'] ?>">
                                        <input type="hidden" name="ajax_action_flag" value="0">
                                        <button type="submit" class="btn btn-sm btn-outline-danger border-0 px-2 py-0">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    </form>
                                </td>
                                <?php endif; ?>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <?php else: ?>
                <div class="text-muted text-center py-4 mb-3 border rounded-3" style="border-style:dashed!important;">
                    <i class="fas fa-network-wired fa-2x mb-2 d-block text-muted opacity-50"></i>
                    No OLT subnets added yet.<br>
                    <small>Add subnets below to route OLT traffic through the VPN tunnel.</small>
                </div>
                <?php endif; ?>

                <!-- Add Subnet Form -->
                <?php if ($can_subnet_add): ?>
                <div class="section-title mt-3" style="font-size:0.78rem;">
                    <i class="fas fa-plus me-1"></i> Add New Subnet
                </div>
                <form method="POST" action="?tab=vpn_settings" id="addSubnetForm">
                    <input type="hidden" name="add_wg_subnet" value="1">
                    <input type="hidden" name="ajax_action_flag" value="0">

                    <!-- OLT Quick-Select -->
                    <?php if (!empty($my_olts)): ?>
                    <div class="mb-2">
                        <div class="wg-field-label">Quick-select from your OLTs</div>
                        <div class="border rounded-3 p-2" style="max-height:120px;overflow-y:auto;background:rgba(99,102,241,0.03);">
                            <?php foreach ($my_olts as $olt): ?>
                            <div class="olt-suggest-item d-flex align-items-center justify-content-between"
                                 onclick="fillSubnetFromOlt('<?= htmlspecialchars($olt['name']) ?>', '<?= $olt['id'] ?>')">
                                <span><i class="fas fa-server me-2 text-primary small"></i><?= htmlspecialchars($olt['name']) ?></span>
                                <span class="badge bg-light text-muted border small"><?= htmlspecialchars($olt['ip'] ?? '') ?></span>
                            </div>
                            <?php endforeach; ?>
                        </div>
                        <input type="hidden" name="olt_id" id="selectedOltId" value="">
                    </div>
                    <?php else: ?>
                    <input type="hidden" name="olt_id" value="">
                    <?php endif; ?>

                    <div class="mb-2">
                        <div class="wg-field-label">Subnet (CIDR) <span class="text-danger">*</span></div>
                        <input type="text" name="subnet" id="subnetInput" class="form-control vpn-input"
                               placeholder="172.25.28.0/24" required>
                    </div>
                    <div class="mb-3">
                        <div class="wg-field-label">Label (optional)</div>
                        <input type="text" name="label" id="labelInput" class="form-control vpn-input"
                               placeholder="OLT-Main-BDCOM">
                    </div>
                    <button type="submit" class="btn btn-vpn-primary w-100 py-2">
                        <i class="fas fa-plus me-2"></i> Add Subnet
                    </button>
                </form>
                <?php endif; ?>
            </div>

            <!-- Quick Info Card -->
            <div class="vpn-glass p-4">
                <div class="section-title"><i class="fas fa-info-circle me-2"></i> Permission Status</div>
                <div class="d-flex flex-column gap-2">
                    <?php
                    $perms_list = [
                        'vpn_settings_view'   => ['View Page',          $can_edit || hasPermission('vpn_settings_view')],
                        'vpn_settings_edit'   => ['Edit Settings',       $can_edit],
                        'vpn_olt_add'         => ['Add Subnets',         $can_subnet_add],
                        'vpn_olt_delete'      => ['Delete Subnets',      $can_subnet_del],
                        'vpn_test_connection' => ['Test Connection',     $can_test],
                        'vpn_script_generate' => ['Generate Script',     $can_script],
                    ];
                    foreach ($perms_list as $slug => [$label, $has]): ?>
                    <div class="d-flex align-items-center justify-content-between p-2 rounded-3"
                         style="background:<?= $has ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.06)' ?>;">
                        <span class="small text-dark fw-semibold"><?= $label ?></span>
                        <span class="badge bg-<?= $has ? 'success' : 'secondary' ?> py-1 px-2">
                            <?= $has ? '✓ Granted' : '✗ Denied' ?>
                        </span>
                    </div>
                    <?php endforeach; ?>
                </div>
                <div class="mt-3 p-3 rounded-3" style="background:rgba(99,102,241,0.06);border:1px dashed rgba(99,102,241,0.3);">
                    <div class="small text-muted"><i class="fas fa-lock me-1 text-indigo-500" style="color:#6366f1;"></i>
                        <strong>Isolation:</strong> These settings are scoped to Tenant ID <code><?= $owner_id ?></code> only. Other tenants cannot access this data.
                    </div>
                </div>
            </div>
        </div>
    </div><!-- /row -->
</div>

<!-- ═══ WIREGUARD SCRIPT MODAL ═══ -->
<div class="modal fade" id="wgScriptModal" tabindex="-1" aria-labelledby="wgScriptModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content border-0 shadow-lg" style="border-radius:16px;overflow:hidden;">
            <div class="modal-header vpn-header-gradient text-white border-0 px-4 py-3">
                <h5 class="modal-title fw-bold" id="wgScriptModalLabel">
                    <i class="fas fa-code me-2"></i> MikroTik WireGuard Script
                    <small class="ms-2 fw-normal opacity-75" id="scriptRouterName"></small>
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
                <div id="scriptLoading" class="text-center py-5">
                    <div class="spinner-border text-indigo" style="color:#6366f1;"></div>
                    <div class="mt-2 text-muted">Generating script...</div>
                </div>
                <div id="scriptError" class="alert alert-danger d-none"></div>
                <pre class="script-code d-none" id="scriptContent"></pre>
            </div>
            <div class="modal-footer bg-light border-0 px-4 py-3">
                <button class="btn btn-sm btn-outline-secondary" id="btnDownloadScript" onclick="downloadScript()" disabled>
                    <i class="fas fa-download me-1"></i> Download .rsc
                </button>
                <button class="btn btn-vpn-primary btn-sm" id="btnCopyScript" onclick="copyScript()" disabled>
                    <i class="fas fa-copy me-1"></i> Copy to Clipboard
                </button>
                <button type="button" class="btn btn-sm btn-light border" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<!-- ═══ TEST RESULT TOAST ═══ -->
<div class="position-fixed bottom-0 end-0 p-3" style="z-index:9999;">
    <div id="vpnTestToast" class="toast align-items-center border-0 shadow-lg" role="alert"
         style="border-radius:12px;min-width:320px;display:none;">
        <div class="d-flex align-items-center p-3">
            <div id="vpnToastIcon" class="me-3 fs-4"></div>
            <div>
                <div id="vpnToastTitle" class="fw-bold mb-0"></div>
                <div id="vpnToastMsg" class="small"></div>
            </div>
            <button type="button" class="btn-close ms-auto" onclick="document.getElementById('vpnTestToast').style.display='none'"></button>
        </div>
    </div>
</div>

<script>
// ─── Test VPN Connection ───
function testVpnConnection() {
    const btn = document.getElementById('btnTestVpn');
    if (!btn) return;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Testing...';
    btn.disabled = true;

    fetch('?ajax_wg_test=1', { method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' }})
        .then(r => r.json())
        .then(data => {
            const toast = document.getElementById('vpnTestToast');
            const icon  = document.getElementById('vpnToastIcon');
            const title = document.getElementById('vpnToastTitle');
            const msg   = document.getElementById('vpnToastMsg');
            const display = document.getElementById('lastTestDisplay');

            if (data.ok) {
                toast.style.background = 'linear-gradient(135deg,#d1fae5,#a7f3d0)';
                icon.innerHTML  = '<i class="fas fa-check-circle text-success"></i>';
                title.textContent = 'Connection Reachable';
                title.className = 'fw-bold mb-0 text-success';
                if (display) display.innerHTML = '<span class="text-success"><i class="fas fa-check-circle me-1"></i>' + (data.msg || 'Host reachable') + '</span><br><small class="text-muted">Just now</small>';
            } else {
                toast.style.background = 'linear-gradient(135deg,#fee2e2,#fecaca)';
                icon.innerHTML  = '<i class="fas fa-times-circle text-danger"></i>';
                title.textContent = 'Connection Failed';
                title.className = 'fw-bold mb-0 text-danger';
                if (display) display.innerHTML = '<span class="text-danger"><i class="fas fa-times-circle me-1"></i>' + (data.msg || 'Unreachable') + '</span><br><small class="text-muted">Just now</small>';
            }
            msg.textContent = data.msg || '';
            toast.style.display = 'flex';
            setTimeout(() => { toast.style.display = 'none'; }, 6000);
        })
        .catch(() => {
            alert('Test request failed. Check network or PHP error log.');
        })
        .finally(() => {
            btn.innerHTML = '<i class="fas fa-plug me-1"></i> Test Connection';
            btn.disabled = false;
        });
}

// ─── Generate MikroTik Script ───
let generatedScript = '';
function generateWgScript(tenantId) {
    const loadingEl = document.getElementById('scriptLoading');
    const contentEl = document.getElementById('scriptContent');
    const errorEl   = document.getElementById('scriptError');
    const routerNameEl = document.getElementById('scriptRouterName');
    const btnCopy   = document.getElementById('btnCopyScript');
    const btnDl     = document.getElementById('btnDownloadScript');

    // Reset visibility states
    loadingEl.classList.remove('d-none');
    contentEl.classList.add('d-none');
    errorEl.classList.add('d-none');
    contentEl.textContent = '';
    
    // Disable action buttons
    btnCopy.disabled = true;
    btnDl.disabled = true;

    fetch('ajax/vpn_generate_mikrotik_script.php?tenant_id=' + tenantId, {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(r => {
        if (!r.ok) {
            throw new Error('HTTP error ' + r.status);
        }
        return r.json();
    })
    .then(data => {
        loadingEl.classList.add('d-none');
        if (data.success) {
            generatedScript = data.script;
            contentEl.textContent = data.script;
            contentEl.classList.remove('d-none');
            routerNameEl.textContent = '— ' + (data.router_name || '');
            btnCopy.disabled = false;
            btnDl.disabled = false;
        } else {
            errorEl.textContent = data.message || 'Error generating script.';
            errorEl.classList.remove('d-none');
        }
    })
    .catch(err => {
        loadingEl.classList.add('d-none');
        errorEl.textContent = 'Network or server error: ' + err.message;
        errorEl.classList.remove('d-none');
    });
}

// ─── Copy Script ───
function copyScript() {
    const text = document.getElementById('scriptContent').textContent;
    if (!text || text === 'Loading...' || text === 'Generating...') return;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target.closest('button');
        btn.innerHTML = '<i class="fas fa-check me-1"></i> Copied!';
        btn.style.background = '#16a34a';
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-copy me-1"></i> Copy to Clipboard';
            btn.style.background = '';
        }, 2000);
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('Copied!');
    });
}

// ─── Download Script ───
function downloadScript() {
    const text = document.getElementById('scriptContent').textContent;
    if (!text || text === 'Loading...' || text === 'Generating...') return;
    const routerName = (document.getElementById('scriptRouterName').textContent || 'wg-config').replace(/[^a-z0-9\-]/gi, '_');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wireguard_' + routerName + '.rsc';
    a.click();
    URL.revokeObjectURL(a.href);
}

// ─── OLT Quick-Select ───
function fillSubnetFromOlt(name, oltId) {
    document.getElementById('labelInput').value = name;
    document.getElementById('selectedOltId').value = oltId;
    // Highlight selection
    document.querySelectorAll('.olt-suggest-item').forEach(el => {
        el.style.background = '';
        el.style.fontWeight  = '';
    });
    event.currentTarget.style.background = 'rgba(99,102,241,0.15)';
    event.currentTarget.style.fontWeight  = '700';
}

// Auto-open modal if script was requested via button (already handled by data-bs-toggle)
document.addEventListener('DOMContentLoaded', function() {
    // If we came back after form submit, scroll to top
    if (window.location.search.includes('tab=vpn_settings')) {
        window.scrollTo(0, 0);
    }
});
</script>
