<?php
// SETTINGS VIEW
if(!hasRole('SubReseller')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }
$role = $_SESSION['user_role'] ?? 'Reseller';

$tenant = null;
$display_tenant_id = '1';

try {
    // 1. Fetch local tenant record first
    $tenant = safeFetch($pdo, "SELECT * FROM tenants LIMIT 1");
    
    // 2. Resolve current subdomain
    $current_subdomain = defined('CURRENT_TENANT') ? CURRENT_TENANT : null;
    if (!$current_subdomain) {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $parts = explode('.', $host);
        if (count($parts) > 2) {
            $current_subdomain = $parts[0];
        } else {
            $current_subdomain = 'billing'; // default fallback
        }
    }

    // 3. Locate and read api/.env for Master DB credentials
    $envPath = __DIR__ . '/../../api/.env';
    if (!file_exists($envPath)) {
        $envPath = __DIR__ . '/../api/.env';
    }
    if (!file_exists($envPath)) {
        $envPath = $_SERVER['DOCUMENT_ROOT'] . '/api/.env';
    }
    
    $masterPdo = null;
    if (file_exists($envPath)) {
        $masterHost = '127.0.0.1'; $masterDb = ''; $masterUser = ''; $masterPass = ''; $masterPort = 3306;
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            if (strpos($line, '=') === false) continue;
            list($name, $value) = explode('=', $line, 2);
            $name = trim($name); $value = trim($value);
            if ($name == 'MASTER_DB_HOST') $masterHost = $value;
            if ($name == 'MASTER_DB_NAME') $masterDb = $value;
            if ($name == 'MASTER_DB_USER') $masterUser = $value;
            if ($name == 'MASTER_DB_PASS') $masterPass = $value;
            if ($name == 'MASTER_DB_PORT') $masterPort = intval($value);
        }
        
        if (!empty($masterDb)) {
            $masterPdo = new PDO("mysql:host=" . $masterHost . ";port=" . $masterPort . ";dbname=" . $masterDb . ";charset=utf8", $masterUser, $masterPass);
            $masterPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $masterPdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        }
    }
    
    // 4. Query Master DB for the tenant record
    $masterTenant = null;
    if ($masterPdo) {
        $stmt = $masterPdo->prepare("SELECT * FROM tenants WHERE subdomain = ? OR db_name = ? LIMIT 1");
        $stmt->execute([$current_subdomain, DB_NAME]);
        $masterTenant = $stmt->fetch();
        
        if (!$masterTenant) {
            // Auto-register in Master DB if not found!
            $hmac = bin2hex(random_bytes(16));
            $tenant_name = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'Billing Tenant';
            $stmt = $masterPdo->prepare("INSERT INTO tenants (name, subdomain, db_name, db_user, db_pass, hmac_secret, status) VALUES (?, ?, ?, ?, ?, ?, 'active')");
            $stmt->execute([$tenant_name, $current_subdomain, DB_NAME, DB_USER, DB_PASS, $hmac]);
            
            // Refetch
            $stmt = $masterPdo->prepare("SELECT * FROM tenants WHERE subdomain = ? LIMIT 1");
            $stmt->execute([$current_subdomain]);
            $masterTenant = $stmt->fetch();
        }
    }
    
    // 5. Sync or resolve display ID
    if ($masterTenant) {
        $display_tenant_id = $masterTenant['id'];
        
        // Sync to local DB if local DB is empty
        if (!$tenant) {
            $pdo->prepare("INSERT INTO tenants (id, name, subdomain, db_name, db_user, db_pass, hmac_secret, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')")
                ->execute([$masterTenant['id'], $masterTenant['name'], $masterTenant['subdomain'], DB_NAME, DB_USER, DB_PASS, $masterTenant['hmac_secret']]);
            // Refetch local
            $tenant = safeFetch($pdo, "SELECT * FROM tenants LIMIT 1");
        }
    } else {
        // Master DB not accessible or failed: use local ID
        if (!$tenant) {
            // Auto-create local if both empty
            $hmac = bin2hex(random_bytes(16));
            $tenant_name = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'Billing Tenant';
            $pdo->prepare("INSERT INTO tenants (name, subdomain, db_name, db_user, db_pass, hmac_secret, status) VALUES (?, ?, ?, ?, ?, ?, 'active')")
                ->execute([$tenant_name, $current_subdomain, DB_NAME, DB_USER, DB_PASS, $hmac]);
            
            $tenant = safeFetch($pdo, "SELECT * FROM tenants LIMIT 1");
        }
        
        if ($tenant) {
            $display_tenant_id = $tenant['id'];
        }
    }
} catch (Exception $e) {
    if ($tenant) {
        $display_tenant_id = $tenant['id'];
    }
}
?>

<style>
    .settings-nav .nav-link {
        color: #495057;
        padding: 15px 20px;
        border-radius: 8px;
        margin-bottom: 5px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        font-weight: 500;
        border: 1px solid transparent;
        text-align: left;
        justify-content: flex-start;
    }
    .settings-nav .nav-link:hover {
        background-color: #f8f9fa;
        color: #212529;
    }
    .settings-nav .nav-link.active {
        background-color: #e7f1ff;
        color: #0d6efd;
        border-color: #cff4fc;
        font-weight: 600;
    }
    .settings-nav .nav-link i {
        width: 24px;
        text-align: center;
        margin-right: 10px;
    }
    .settings-card {
        border: none;
        box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
        border-radius: 12px;
        overflow: hidden;
    }
    .col-lg-3 .settings-card {
        position: sticky;
        top: 20px;
        z-index: 100;
    }
    .settings-header {
        background-color: #fff;
        border-bottom: 1px solid #eee;
        padding: 20px;
    }
    .form-label {
        font-weight: 500;
        font-size: 0.9rem;
        color: #555;
    }
    .form-control:focus {
        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.15);
        border-color: #aebbce;
    }
</style>

<div class="row g-4">
    <!-- Sidebar Navigation -->
    <div class="col-lg-3">
        <div class="card settings-card">
            <div class="card-body p-3">
                <div class="nav flex-column nav-pills settings-nav" id="v-pills-tab" role="tablist" aria-orientation="vertical">
                    <?php if(hasRole('Admin')): ?>
                        <button class="nav-link active" id="v-pills-general-tab" data-bs-toggle="pill" data-bs-target="#v-pills-general" type="button" role="tab">
                            <i class="fas fa-sliders-h"></i> General
                        </button>
                        <button class="nav-link" id="v-pills-payment-tab" data-bs-toggle="pill" data-bs-target="#v-pills-payment" type="button" role="tab">
                            <i class="fas fa-credit-card"></i> Payment Gateways
                        </button>
                        <button class="nav-link" id="v-pills-sms-tab" data-bs-toggle="pill" data-bs-target="#v-pills-sms" type="button" role="tab">
                            <i class="fas fa-sms"></i> SMS Configuration
                        </button>
                        <button class="nav-link" id="v-pills-templates-tab" data-bs-toggle="pill" data-bs-target="#v-pills-templates" type="button" role="tab">
                            <i class="fas fa-envelope-open-text"></i> SMS Templates
                        </button>
                        <button class="nav-link" id="v-pills-email-tab" data-bs-toggle="pill" data-bs-target="#v-pills-email" type="button" role="tab">
                            <i class="fas fa-at"></i> Email Settings
                        </button>
                    <?php endif; ?>
                    <button class="nav-link <?= !hasRole('Admin') ? 'active' : '' ?>" id="v-pills-security-tab" data-bs-toggle="pill" data-bs-target="#v-pills-security" type="button" role="tab">
                        <i class="fas fa-shield-alt"></i> Security
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Content Area -->
    <div class="col-lg-9">
        <div class="tab-content" id="v-pills-tabContent">
            
            <?php if(hasRole('Admin')): ?>
            <!-- General Settings -->
            <div class="tab-pane fade show active" id="v-pills-general" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header">
                        <h5 class="mb-0 fw-bold text-dark">General Settings</h5>
                        <p class="text-muted small mb-0">Basic information about your ISP branding.</p>
                    </div>
                    <div class="card-body p-4">
                        <form method="POST" enctype="multipart/form-data">
                            <div class="row mb-4">
                                <div class="col-md-8">
                                    <label class="form-label">Company Name</label>
                                    <input type="text" name="company_name" class="form-control form-control-lg" value="<?= $company_name ?>" placeholder="Enter company name">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Tenant Key (ID No)</label>
                                    <input type="text" class="form-control form-control-lg bg-light text-dark fw-bold" value="<?= htmlspecialchars($display_tenant_id) ?>" readonly>
                                </div>
                            </div>
                            
                            <div class="row mb-4">
                                <div class="col-12">
                                    <div class="border rounded-3 p-3 bg-light d-flex flex-wrap align-items-center justify-content-between gap-3">
                                        <div>
                                            <div class="fw-bold text-dark"><i class="fas fa-tags me-2 text-primary"></i>Recharge Discount Mode</div>
                                            <div class="small text-muted">Enable manual and bulk recharge discount for this tenant only. When disabled, discount inputs are hidden everywhere.</div>
                                        </div>
                                        <div class="form-check form-switch m-0">
                                            <input type="hidden" name="recharge_discount_enabled" value="0">
                                            <input class="form-check-input" type="checkbox" role="switch" id="rechargeDiscountEnabled" name="recharge_discount_enabled" value="1" <?= get_opt($pdo, 'recharge_discount_enabled') === '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label fw-bold" for="rechargeDiscountEnabled">Enable Discount</label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Company Logo</label>
                                    <div class="input-group">
                                        <input type="file" name="logo" class="form-control" accept="image/*">
                                    </div>
                                    <small class="text-muted d-block mt-1">Recommended: PNG, Transparent, Max 200px height.</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Favicon</label>
                                    <div class="input-group">
                                        <input type="file" name="favicon" class="form-control" accept="image/*">
                                    </div>
                                    <small class="text-muted d-block mt-1">Recommended: 32x32 ICO or PNG.</small>
                                </div>
                            </div>

                            <div class="mt-4 text-end">
                                <button type="submit" name="update_settings" class="btn btn-primary px-4 fw-bold shadow-sm">
                                    <i class="fas fa-check me-2"></i> Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Payment Gateways -->
            <div class="tab-pane fade" id="v-pills-payment" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header">
                        <h5 class="mb-0 fw-bold text-dark">Payment Gateways</h5>
                        <p class="text-muted small mb-0">Configure online payment methods for automatic balance loading.</p>
                    </div>
                    <div class="card-body p-4">
                        <form method="POST">

                            <!-- bKash -->
                            <div class="card bg-light border-0 mb-4">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="fw-bold text-pink mb-0" style="color: #E2136E;"><i class="fas fa-money-bill-wave me-2"></i> bKash Configuration</h6>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="bkash_sandbox" id="bkashSandbox" value="1" <?= get_opt($pdo, 'bkash_sandbox') == '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label small" for="bkashSandbox">Sandbox</label>
                                        </div>
                                    </div>
                                    
                                    <div class="row g-3">
                                        <div class="col-md-6">
                                            <label class="form-label">App Key</label>
                                            <input type="text" name="bkash_app_key" class="form-control" value="<?= get_opt($pdo, 'bkash_app_key') ?>">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">App Secret</label>
                                            <input type="password" name="bkash_app_secret" class="form-control" value="<?= get_opt($pdo, 'bkash_app_secret') ?>">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Username</label>
                                            <input type="text" name="bkash_username" class="form-control" value="<?= get_opt($pdo, 'bkash_username') ?>">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Password</label>
                                            <input type="password" name="bkash_password" class="form-control" value="<?= get_opt($pdo, 'bkash_password') ?>">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Nagad -->
                            <div class="card bg-light border-0 mb-4">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="fw-bold mb-0" style="color: #F7941D;"><i class="fas fa-wallet me-2"></i> Nagad Configuration</h6>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="nagad_sandbox" id="nagadSandbox" value="1" <?= get_opt($pdo, 'nagad_sandbox') == '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label small" for="nagadSandbox">Sandbox</label>
                                        </div>
                                    </div>
                                    
                                    <div class="row g-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Merchant ID</label>
                                            <input type="text" name="nagad_merchant_id" class="form-control" value="<?= get_opt($pdo, 'nagad_merchant_id') ?>">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Merchant Phone</label>
                                            <input type="text" name="nagad_merchant_phone" class="form-control" value="<?= get_opt($pdo, 'nagad_merchant_phone') ?>">
                                        </div>
                                        <div class="col-md-12">
                                            <label class="form-label">Public Key</label>
                                            <textarea name="nagad_public_key" class="form-control" rows="2"><?= get_opt($pdo, 'nagad_public_key') ?></textarea>
                                        </div>
                                        <div class="col-md-12">
                                            <label class="form-label">Private Key</label>
                                            <textarea name="nagad_private_key" class="form-control" rows="2"><?= get_opt($pdo, 'nagad_private_key') ?></textarea>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- SSLCOMMERZ -->
                            <div class="card bg-light border-0 mb-4">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="fw-bold mb-0" style="color: #005A9C;"><i class="fas fa-credit-card me-2"></i> SSLCOMMERZ Configuration</h6>
                                        <div class="form-check form-switch me-3">
                                            <input class="form-check-input" type="checkbox" name="sslcz_enabled" id="sslczEnabled" value="1" <?= get_opt($pdo, 'sslcz_enabled', '0') == '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label fw-bold small text-success" for="sslczEnabled">Enable SSLCOMMERZ</label>
                                        </div>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="sslcz_sandbox" id="sslczSandbox" value="1" <?= get_opt($pdo, 'sslcz_sandbox') == '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label small" for="sslczSandbox">Sandbox</label>
                                        </div>
                                    </div>
                                    
                                    <div class="row g-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Store ID</label>
                                            <input type="text" name="sslcz_store_id" class="form-control" value="<?= get_opt($pdo, 'sslcz_store_id') ?>">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Store Password</label>
                                            <input type="password" name="sslcz_store_passwd" class="form-control" value="<?= get_opt($pdo, 'sslcz_store_passwd') ?>">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="text-end">
                                <button type="submit" name="update_settings" class="btn btn-primary px-4 fw-bold shadow-sm">
                                    <i class="fas fa-save me-2"></i> Save Gateway Settings
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- SMS Configuration -->
            <div class="tab-pane fade" id="v-pills-sms" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header">
                        <h5 class="mb-0 fw-bold text-dark">SMS Configuration</h5>
                        <p class="text-muted small mb-0">Set up your SMS provider to send notifications.</p>
                    </div>
                    <div class="card-body p-4">
                        <form method="POST">
                            <div class="d-flex align-items-center mb-4 p-3 bg-light rounded border">
                                <div class="form-check form-switch mb-0">
                                    <input class="form-check-input" type="checkbox" name="sms_enabled" id="smsEnabled" value="1" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_enabled', hasRole('Admin')) == '1' ? 'checked' : '' ?>>
                                    <label class="form-check-label fw-bold ms-2" for="smsEnabled">Enable SMS System</label>
                                </div>
                                <div class="ms-auto text-muted small">Toggle system-wide SMS sending.</div>
                            </div>

                            <div class="mb-4">
                                <label class="form-label fw-bold">SMS Gateway Type</label>
                                <select name="sms_gateway_type" id="smsGatewayType" class="form-select">
                                    <option value="custom" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_gateway_type', hasRole('Admin')) == 'custom' ? 'selected' : '' ?>>Custom URL Gateway</option>
                                    <option value="sheba_http" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_gateway_type', hasRole('Admin')) == 'sheba_http' ? 'selected' : '' ?>>Sheba SMS (HTTP GET)</option>
                                    <option value="sheba_json" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_gateway_type', hasRole('Admin')) == 'sheba_json' ? 'selected' : '' ?>>Sheba SMS (JSON POST)</option>
                                </select>
                            </div>
                            
                            <div class="mb-4" id="smsUrlContainer">
                                <label class="form-label fw-bold">API Gateway URL</label>
                                <div class="input-group">
                                    <span class="input-group-text bg-white"><i class="fas fa-link text-muted"></i></span>
                                    <input type="text" name="sms_api_url" class="form-control" value="<?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_api_url', hasRole('Admin')) ?>" placeholder="https://api.provider.com/send">
                                </div>
                                <div class="form-text mt-2"><i class="fas fa-info-circle me-1"></i> Use placeholders: <code>{KEY}, {SENDER}, {MSG}, {NUMBER}</code></div>
                            </div>
                            
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">API Key</label>
                                    <input type="text" name="sms_api_key" class="form-control" value="<?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_api_key', hasRole('Admin')) ?>">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Sender ID</label>
                                    <input type="text" name="sms_sender_id" class="form-control" value="<?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_sender_id', hasRole('Admin')) ?>">
                                </div>
                            </div>
                            
                            <div class="mt-4 text-end">
                                <button type="submit" name="update_sms_gateway" class="btn btn-dark px-4 fw-bold shadow-sm">
                                    <i class="fas fa-save me-2"></i> Save SMS Settings
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    const gatewaySelect = document.getElementById('smsGatewayType');
                    const urlContainer = document.getElementById('smsUrlContainer');
                    
                    function toggleUrlField() {
                        if (gatewaySelect && urlContainer) {
                            if (gatewaySelect.value === 'custom') {
                                urlContainer.style.display = 'block';
                            } else {
                                urlContainer.style.display = 'none';
                            }
                        }
                    }
                    
                    if (gatewaySelect && urlContainer) {
                        gatewaySelect.addEventListener('change', toggleUrlField);
                        toggleUrlField();
                    }
                });
                </script>
            </div>

            <!-- SMS Templates -->
            <div class="tab-pane fade" id="v-pills-templates" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header">
                        <h5 class="mb-0 fw-bold text-dark">SMS Templates</h5>
                        <p class="text-muted small mb-0">Customize the automated messages sent to clients.</p>
                    </div>
                    <div class="card-body p-4">
                        <div class="alert alert-info border-0 bg-info bg-opacity-10 mb-4 rounded-3 d-flex align-items-center">
                            <i class="fas fa-lightbulb text-info fa-lg me-3"></i>
                            <div>
                                <h6 class="fw-bold mb-1">Available Shortcodes</h6>
                                <small class="text-muted">Use <code>[NAME], [ID], [PASS], [AMOUNT], [DAYS], [DATE]</code> to dynamically insert data.</small>
                            </div>
                        </div>

                        <form method="POST">
                            <div class="row g-4">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold small text-uppercase text-muted">Welcome SMS</label>
                                    <textarea name="sms_tpl_welcome" class="form-control" rows="3"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_welcome', hasRole('Admin')) ?: "Welcome [NAME]! Your [ID] is active. Password: [PASS]." ?></textarea>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold small text-uppercase text-muted">Payment Received</label>
                                    <textarea name="sms_tpl_payment" class="form-control" rows="3"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_payment', hasRole('Admin')) ?: "Dear [NAME], we have received [AMOUNT]৳ for ID [ID]." ?></textarea>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold small text-uppercase text-muted">Advance Loan</label>
                                    <textarea name="sms_tpl_loan" class="form-control" rows="3"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_loan', hasRole('Admin')) ?: "Dear [NAME], [DAYS] days credit added to ID [ID]." ?></textarea>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold small text-uppercase text-muted">Payment Reminder (27 Days)</label>
                                    <textarea name="sms_tpl_reminder" class="form-control" rows="3"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_reminder', hasRole('Admin')) ?: "Dear [NAME], your bill ID [ID] is due in 3 days." ?></textarea>
                                </div>
                                <div class="col-md-12">
                                    <label class="form-label fw-bold small text-uppercase text-muted">Expiry Reminder (30 Days)</label>
                                    <textarea name="sms_tpl_expiry" class="form-control" rows="2"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_expiry', hasRole('Admin')) ?: "Dear [NAME], your service ID [ID] expires today." ?></textarea>
                                </div>
                            </div>
                            
                            <div class="mt-4 text-end">
                                <button type="submit" name="update_sms_templates" class="btn btn-info text-white px-4 fw-bold shadow-sm">
                                    <i class="fas fa-check-double me-2"></i> Save All Templates
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Email Settings -->
            <div class="tab-pane fade" id="v-pills-email" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header">
                        <h5 class="mb-0 fw-bold text-dark">Email Configuration (SMTP)</h5>
                        <p class="text-muted small mb-0">Configure your email provider to send system emails.</p>
                    </div>
                    <div class="card-body p-4">
                        <form method="POST">
                            <div class="row g-3">
                                <div class="col-md-9">
                                    <label class="form-label">SMTP Host</label>
                                    <input type="text" name="smtp_host" class="form-control" value="<?= get_opt($pdo, 'smtp_host', 'smtp.gmail.com') ?>" placeholder="smtp.example.com">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Port</label>
                                    <input type="text" name="smtp_port" class="form-control" value="<?= get_opt($pdo, 'smtp_port', '587') ?>" placeholder="587">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">SMTP Username (Email)</label>
                                    <input type="text" name="smtp_user" class="form-control" value="<?= get_opt($pdo, 'smtp_user') ?>" placeholder="user@example.com">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">SMTP Password</label>
                                    <input type="password" name="smtp_pass" class="form-control" value="<?= get_opt($pdo, 'smtp_pass') ?>">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Encryption</label>
                                    <select name="smtp_secure" class="form-select">
                                        <option value="tls" <?= get_opt($pdo, 'smtp_secure') == 'tls' ? 'selected' : '' ?>>TLS (Recommended)</option>
                                        <option value="ssl" <?= get_opt($pdo, 'smtp_secure') == 'ssl' ? 'selected' : '' ?>>SSL</option>
                                        <option value="" <?= get_opt($pdo, 'smtp_secure') == '' ? 'selected' : '' ?>>None</option>
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">From Name</label>
                                    <input type="text" name="smtp_from_name" class="form-control" value="<?= get_opt($pdo, 'smtp_from_name', $company_name) ?>">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">From Email</label>
                                    <input type="email" name="smtp_from_email" class="form-control" value="<?= get_opt($pdo, 'smtp_from_email') ?>" placeholder="admin@example.com">
                                </div>
                            </div>
                            
                            <div class="mt-4 text-end">
                                <button type="submit" name="update_email_settings" class="btn btn-primary px-4 fw-bold shadow-sm">
                                    <i class="fas fa-save me-2"></i> Save Email Settings
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
            <?php endif; ?>

            <!-- Security Settings -->
            <div class="tab-pane fade <?= !hasRole('Admin') ? 'show active' : '' ?>" id="v-pills-security" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header">
                        <h5 class="mb-0 fw-bold text-dark">Account Security</h5>
                        <p class="text-muted small mb-0">Update your password to keep your account safe.</p>
                    </div>
                    <div class="card-body p-5">
                        <form method="POST" class="col-md-8 mx-auto">
                            <div class="text-center mb-4">
                                <div class="bg-light rounded-circle d-inline-flex align-items-center justify-content-center" style="width: 80px; height: 80px;">
                                    <i class="fas fa-user-lock fa-3x text-secondary"></i>
                                </div>
                            </div>
                            
                            <div class="mb-4">
                                <label class="form-label">Recovery Email</label>
                                <div class="input-group">
                                    <span class="input-group-text bg-white"><i class="fas fa-envelope text-muted"></i></span>
                                    <input type="email" name="email" class="form-control form-control-lg" placeholder="admin@example.com" value="<?= safeFetch($pdo, "SELECT email FROM ".TBL_STAFF." WHERE id=?", [$user])['email'] ?? '' ?>">
                                </div>
                                <div class="form-text">Used for password recovery only.</div>
                            </div>
                            
                            <div class="mb-4">
                                <label class="form-label">Current Password</label>
                                <div class="input-group">
                                    <span class="input-group-text bg-white"><i class="fas fa-lock text-muted"></i></span>
                                    <input type="password" name="old_password" class="form-control form-control-lg" placeholder="••••••" required>
                                </div>
                            </div>
                            <div class="mb-4">
                                <label class="form-label">New Password</label>
                                <div class="input-group">
                                    <span class="input-group-text bg-white"><i class="fas fa-key text-muted"></i></span>
                                    <input type="password" name="new_password" class="form-control form-control-lg" placeholder="New secure password" required>
                                </div>
                            </div>
                            
                            <button type="submit" name="change_own_password" class="btn btn-secondary w-100 py-3 fw-bold shadow-sm">
                                <i class="fas fa-shield-alt me-2"></i> Update Password
                            </button>
                        </form>
                    </div>
                </div>
            </div>

        </div>
    </div>
</div>
