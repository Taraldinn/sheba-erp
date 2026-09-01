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
                    <?php if(hasRole('Admin') || isOffice()): ?>
                        <button class="nav-link active" id="v-pills-general-tab" data-bs-toggle="pill" data-bs-target="#v-pills-general" type="button" role="tab">
                            <i class="fas fa-sliders-h"></i> General
                        </button>
                    <?php endif; ?>
                    
                    <?php if(hasRole('Reseller') || hasRole('Admin') || isOffice()): ?>
                        <button class="nav-link <?= !hasRole('Admin') ? 'active' : '' ?>" id="v-pills-payment-tab" data-bs-toggle="pill" data-bs-target="#v-pills-payment" type="button" role="tab">
                            <i class="fas fa-credit-card"></i> Payment Gateways
                        </button>
                    <?php endif; ?>
                    
                    <?php if(hasRole('Reseller') && !hasRole('Admin')): ?>
                        <button class="nav-link" id="v-pills-invoice-tab" data-bs-toggle="pill" data-bs-target="#v-pills-invoice" type="button" role="tab">
                            <i class="fas fa-file-invoice"></i> Invoice Branding
                        </button>
                    <?php endif; ?>
                    
                    <?php if(hasRole('Admin') || isOffice() || hasRole('Reseller')): ?>
                        <button class="nav-link" id="v-pills-sms-tab" data-bs-toggle="pill" data-bs-target="#v-pills-sms" type="button" role="tab">
                            <i class="fas fa-sms"></i> SMS Configuration
                        </button>
                        <button class="nav-link" id="v-pills-templates-tab" data-bs-toggle="pill" data-bs-target="#v-pills-templates" type="button" role="tab">
                            <i class="fas fa-envelope-open-text"></i> SMS Templates
                        </button>
                        <button class="nav-link" id="v-pills-voice-tab" data-bs-toggle="pill" data-bs-target="#v-pills-voice" type="button" role="tab">
                            <i class="fas fa-phone-alt"></i> Voice Call Reminder
                        </button>
                    <?php endif; ?>
                    
                    <?php if(hasRole('Admin') || isOffice()): ?>
                        <button class="nav-link" id="v-pills-email-tab" data-bs-toggle="pill" data-bs-target="#v-pills-email" type="button" role="tab">
                            <i class="fas fa-at"></i> Email Settings
                        </button>
                        <button class="nav-link" id="v-pills-api-tab" data-bs-toggle="pill" data-bs-target="#v-pills-api" type="button" role="tab">
                            <i class="fas fa-key"></i> API Configuration
                        </button>
                    <?php endif; ?>

                    <button class="nav-link" id="v-pills-security-tab" data-bs-toggle="pill" data-bs-target="#v-pills-security" type="button" role="tab">
                        <i class="fas fa-shield-alt"></i> Security
                    </button>
                    
                    <?php if(hasRole('Admin') || isOffice()): ?>
                    <button class="nav-link" id="v-pills-funbox-tab" data-bs-toggle="pill" data-bs-target="#v-pills-funbox" type="button" role="tab">
                        <i class="fas fa-gamepad"></i> Fun Box
                    </button>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Content Area -->
    <div class="col-lg-9">
        <div class="tab-content" id="v-pills-tabContent">
            
            <?php if(hasRole('Admin') || isOffice()): ?>
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

                            <div class="row mb-3">
                                <div class="col-md-12">
                                    <label class="form-label">Company Address</label>
                                    <textarea name="company_address" class="form-control" rows="2" placeholder="Your ISP Corporate Office Address"><?= htmlspecialchars(get_opt($pdo, 'company_address', 'Your ISP Corporate Office Address')) ?></textarea>
                                </div>
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Company Phone</label>
                                    <input type="text" name="company_phone" class="form-control" value="<?= htmlspecialchars(get_opt($pdo, 'company_phone', '+880 1234-567890')) ?>" placeholder="+880 1234-567890">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Company Email</label>
                                    <input type="email" name="company_email" class="form-control" value="<?= htmlspecialchars(get_opt($pdo, 'company_email', 'billing@isp.com')) ?>" placeholder="billing@isp.com">
                                </div>
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Client Name (SaaS Client / Owner Name)</label>
                                    <input type="text" name="client_name" class="form-control" value="<?= htmlspecialchars(get_opt($pdo, 'client_name', '')) ?>" placeholder="Enter Client / Owner Name">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Date of Birth</label>
                                    <input type="date" name="client_date_of_birth" class="form-control" value="<?= htmlspecialchars(get_opt($pdo, 'client_date_of_birth', '')) ?>">
                                </div>
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-12">
                                    <label class="form-label">Payment Tutorial Video URL (YouTube)</label>
                                    <input type="url" name="payment_tutorial_video" class="form-control" value="<?= htmlspecialchars(get_opt($pdo, 'payment_tutorial_video', '')) ?>" placeholder="https://www.youtube.com/watch?v=...">
                                    <div class="form-text">This video will be shown in the self-care panel to guide users on how to pay their bills.</div>
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
                             <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Undo Recharge Penalty Threshold (Hours)</label>
                                    <input type="number" name="undo_recharge_deduct_hours" class="form-control" value="<?= get_opt($pdo, 'undo_recharge_deduct_hours', '2') ?>" placeholder="2" min="0">
                                    <small class="text-muted">If undo is done after this time, 1 day cost will be deducted.</small>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Direct Clients Expire Time</label>
                                    <input type="time" name="admin_expire_time" class="form-control" value="<?= get_opt($pdo, 'admin_expire_time', '23:59') ?>">
                                    <small class="text-muted">Time of day when Admin's direct active users reach expiry date gets disabling executed.</small>
                                </div>
                             </div>

                             <div class="row mb-3">
                                <div class="col-md-12">
                                    <div class="border rounded-3 p-3 bg-light d-flex flex-wrap align-items-center justify-content-between gap-3">
                                        <div class="me-3">
                                            <div class="fw-bold text-dark"><i class="fas fa-tags me-2 text-primary"></i>Recharge Discount Mode</div>
                                            <small class="text-muted d-block">Enable discount fields for Manual Recharge and user-wise Bulk Recharge in this tenant only.</small>
                                        </div>
                                        <div class="form-check form-switch m-0">
                                            <input type="hidden" name="recharge_discount_enabled" value="0">
                                            <input class="form-check-input" type="checkbox" role="switch" id="recharge_discount_enabled" name="recharge_discount_enabled" value="1" <?= get_opt($pdo, 'recharge_discount_enabled', '0') === '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label fw-bold" for="recharge_discount_enabled">Enable Discount</label>
                                        </div>
                                    </div>
                                </div>
                             </div>

                             <div class="row mb-3">
                                <div class="col-md-12">
                                    <div class="form-check form-switch mt-2">
                                        <input type="hidden" name="show_reseller_profile_speed" value="0">
                                        <input class="form-check-input" type="checkbox" name="show_reseller_profile_speed" id="show_reseller_profile_speed" value="1" <?= get_opt($pdo, 'show_reseller_profile_speed', '1') == '1' ? 'checked' : '' ?>>
                                        <label class="form-check-label fw-bold text-dark" for="show_reseller_profile_speed">Show "Profile / Speed" in Reseller My Rates Panel</label>
                                        <small class="text-muted d-block">If enabled, resellers can view the Profile / Speed column in their "My Rates" page. If disabled, this column is completely hidden.</small>
                                    </div>
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
            <?php endif; ?>

            <!-- Payment Gateways -->
            <?php if(hasRole('Reseller') || hasRole('Admin') || isOffice()): 
                $gwConfig = get_gateway_credentials($pdo, $_SESSION['admin_id']);
            ?>
            <div class="tab-pane fade <?= !hasRole('Admin') ? 'show active' : '' ?>" id="v-pills-payment" role="tabpanel">
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
                                            <input class="form-check-input" type="checkbox" name="bkash_sandbox" id="bkashSandbox" value="1" <?= ($gwConfig['bkash_sandbox'] ?? '') == '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label small text-dark fw-bold" for="bkashSandbox">Sandbox Active</label>
                                        </div>
                                    </div>
                                    
                                    <!-- bKash Shop Payment -->
                                    <div class="border-bottom pb-3 mb-3">
                                        <div class="fw-bold text-dark small mb-2"><i class="fas fa-store me-1"></i> bKash Shop Payment</div>
                                        <div class="row g-3">
                                            <div class="col-md-12">
                                                <div class="form-check form-switch">
                                                    <input class="form-check-input" type="checkbox" name="bkash_shop_enabled" id="bkashShopEnabled" value="1" <?= ($gwConfig['bkash_shop_enabled'] ?? '') == '1' ? 'checked' : '' ?>>
                                                    <label class="form-check-label small text-dark fw-bold" for="bkashShopEnabled">Enable bKash Shop Payment</label>
                                                </div>
                                            </div>
                                            <div class="col-md-12">
                                                <label class="form-label">bKash Shop Base URL</label>
                                                <input type="text" name="bkash_shop_base_url" class="form-control form-control-sm" placeholder="https://shop.bkash.com/merchant" value="<?= htmlspecialchars($gwConfig['bkash_shop_base_url'] ?? '') ?>">
                                                <div class="form-text">Must be a valid https://shop.bkash.com/ URL.</div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Production Credentials -->
                                    <div class="border-bottom pb-3 mb-3">
                                        <div class="fw-bold text-dark small mb-2"><i class="fas fa-lock me-1"></i> Production Credentials</div>
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label class="form-label">Production App Key</label>
                                                <input type="text" name="bkash_app_key" class="form-control form-control-sm" value="<?= htmlspecialchars($gwConfig['bkash_app_key'] ?? '') ?>">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Production App Secret</label>
                                                <input type="password" name="bkash_app_secret" class="form-control form-control-sm" value="<?= htmlspecialchars($gwConfig['bkash_app_secret'] ?? '') ?>">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Production Username</label>
                                                <input type="text" name="bkash_username" class="form-control form-control-sm" value="<?= htmlspecialchars($gwConfig['bkash_username'] ?? '') ?>">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Production Password</label>
                                                <input type="password" name="bkash_password" class="form-control form-control-sm" value="<?= htmlspecialchars($gwConfig['bkash_password'] ?? '') ?>">
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Sandbox Credentials -->
                                    <div>
                                        <div class="fw-bold text-dark small mb-2"><i class="fas fa-vial me-1"></i> Sandbox Credentials</div>
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label class="form-label">Sandbox App Key</label>
                                                <input type="text" name="bkash_sandbox_app_key" class="form-control form-control-sm" value="<?= htmlspecialchars($gwConfig['bkash_sandbox_app_key'] ?? '') ?>">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Sandbox App Secret</label>
                                                <input type="password" name="bkash_sandbox_app_secret" class="form-control form-control-sm" value="<?= htmlspecialchars($gwConfig['bkash_sandbox_app_secret'] ?? '') ?>">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Sandbox Username</label>
                                                <input type="text" name="bkash_sandbox_username" class="form-control form-control-sm" value="<?= htmlspecialchars($gwConfig['bkash_sandbox_username'] ?? '') ?>">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Sandbox Password</label>
                                                <input type="password" name="bkash_sandbox_password" class="form-control form-control-sm" value="<?= htmlspecialchars($gwConfig['bkash_sandbox_password'] ?? '') ?>">
                                            </div>
                                        </div>
                                    </div>

                                    <?php if (hasRole('Admin')): ?>
                                        <hr>
                                        <div class="mt-3">
                                            <div class="fw-bold text-dark small mb-2"><i class="fas fa-diagnoses me-1"></i> Test Connection (Admin Only)</div>
                                            <div class="d-flex gap-2">
                                                <button type="submit" name="test_bkash_token" class="btn btn-outline-primary btn-sm rounded-pill px-3">
                                                    <i class="fas fa-key me-1"></i> Test Token
                                                </button>
                                                <button type="submit" name="test_bkash_create" class="btn btn-outline-success btn-sm rounded-pill px-3">
                                                    <i class="fas fa-shopping-cart me-1"></i> Test Create Payment (10 BDT)
                                                </button>
                                            </div>
                                            <?php if (isset($_SESSION['bkash_test_result'])): ?>
                                                <div class="mt-3">
                                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                                        <label class="form-label small fw-bold text-muted mb-0">Test Response Output</label>
                                                        <button type="submit" name="clear_bkash_test" class="btn btn-xs btn-link text-danger p-0 small text-decoration-none" style="font-size: 0.75rem;">Clear Results</button>
                                                    </div>
                                                    <pre class="bg-dark text-light p-3 rounded small mb-0" style="max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all;"><?= htmlspecialchars($_SESSION['bkash_test_result']) ?></pre>
                                                </div>
                                            <?php endif; ?>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            </div>

                            <!-- Nagad -->
                            <div class="card bg-light border-0 mb-4">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="fw-bold mb-0" style="color: #F7941D;"><i class="fas fa-wallet me-2"></i> Nagad Configuration</h6>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="nagad_sandbox" id="nagadSandbox" value="1" <?= ($gwConfig['nagad_sandbox'] ?? '') == '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label small" for="nagadSandbox">Sandbox</label>
                                        </div>
                                    </div>
                                    
                                    <div class="row g-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Merchant ID</label>
                                            <input type="text" name="nagad_merchant_id" class="form-control" value="<?= htmlspecialchars($gwConfig['nagad_merchant_id'] ?? '') ?>">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Merchant Phone</label>
                                            <input type="text" name="nagad_merchant_phone" class="form-control" value="<?= htmlspecialchars($gwConfig['nagad_merchant_phone'] ?? '') ?>">
                                        </div>
                                        <div class="col-md-12">
                                            <label class="form-label">Public Key</label>
                                            <textarea name="nagad_public_key" class="form-control" rows="2"><?= htmlspecialchars($gwConfig['nagad_public_key'] ?? '') ?></textarea>
                                        </div>
                                        <div class="col-md-12">
                                            <label class="form-label">Private Key</label>
                                            <textarea name="nagad_private_key" class="form-control" rows="2"><?= htmlspecialchars($gwConfig['nagad_private_key'] ?? '') ?></textarea>
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
                                            <input class="form-check-input" type="checkbox" name="sslcz_enabled" id="sslczEnabled" value="1" <?= ($gwConfig['sslcz_enabled'] ?? '0') == '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label fw-bold small text-success" for="sslczEnabled">Enable SSLCOMMERZ</label>
                                        </div>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="sslcz_sandbox" id="sslczSandbox" value="1" <?= ($gwConfig['sslcz_sandbox'] ?? '') == '1' ? 'checked' : '' ?>>
                                            <label class="form-check-label small" for="sslczSandbox">Sandbox</label>
                                        </div>
                                    </div>
                                    
                                    <div class="row g-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Store ID</label>
                                            <input type="text" name="sslcz_store_id" class="form-control" value="<?= htmlspecialchars($gwConfig['sslcz_store_id'] ?? '') ?>">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Store Password</label>
                                            <input type="password" name="sslcz_store_passwd" class="form-control" value="<?= htmlspecialchars($gwConfig['sslcz_store_passwd'] ?? '') ?>">
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
            <?php endif; ?>
            
             <?php if(hasRole('Admin') || isOffice() || hasRole('Reseller')): ?>
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
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <label class="form-label fw-bold small text-uppercase text-muted mb-0">Welcome SMS</label>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="sms_enabled_welcome" value="1" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_enabled_welcome', hasRole('Admin')) == '1' ? 'checked' : '' ?>>
                                        </div>
                                    </div>
                                    <textarea name="sms_tpl_welcome" class="form-control" rows="3"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_welcome', hasRole('Admin')) ?: "Welcome [NAME]! Your [ID] is active. Password: [PASS]." ?></textarea>
                                </div>
                                <div class="col-md-6">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <label class="form-label fw-bold small text-uppercase text-muted mb-0">Payment Received</label>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="sms_enabled_payment" value="1" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_enabled_payment', hasRole('Admin')) == '1' ? 'checked' : '' ?>>
                                        </div>
                                    </div>
                                    <textarea name="sms_tpl_payment" class="form-control" rows="3"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_payment', hasRole('Admin')) ?: "Dear [NAME], we have received [AMOUNT]৳ for ID [ID]." ?></textarea>
                                </div>
                                <div class="col-md-6">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <label class="form-label fw-bold small text-uppercase text-muted mb-0">Advance Loan</label>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="sms_enabled_loan" value="1" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_enabled_loan', hasRole('Admin')) == '1' ? 'checked' : '' ?>>
                                        </div>
                                    </div>
                                    <textarea name="sms_tpl_loan" class="form-control" rows="3"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_loan', hasRole('Admin')) ?: "Dear [NAME], [DAYS] days credit added to ID [ID]." ?></textarea>
                                </div>
                                <div class="col-md-6">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <div class="d-flex align-items-center gap-2">
                                            <label class="form-label fw-bold small text-uppercase text-muted mb-0">Payment Reminder (27 Days)</label>
                                            <input type="time" name="sms_time_reminder" class="form-control form-control-sm" style="width: auto;" value="<?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_time_reminder', hasRole('Admin')) ?: '00:00' ?>" title="Scheduled Time">
                                        </div>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="sms_enabled_reminder" value="1" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_enabled_reminder', hasRole('Admin')) == '1' ? 'checked' : '' ?>>
                                        </div>
                                    </div>
                                    <textarea name="sms_tpl_reminder" class="form-control" rows="3"><?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_tpl_reminder', hasRole('Admin')) ?: "Dear [NAME], your bill ID [ID] is due in 3 days." ?></textarea>
                                </div>
                                <div class="col-md-12">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <div class="d-flex align-items-center gap-2">
                                            <label class="form-label fw-bold small text-uppercase text-muted mb-0">Expiry Reminder (30 Days)</label>
                                            <input type="time" name="sms_time_expiry" class="form-control form-control-sm" style="width: auto;" value="<?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_time_expiry', hasRole('Admin')) ?: '00:00' ?>" title="Scheduled Time">
                                        </div>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="sms_enabled_expiry" value="1" <?= get_sms_setting($pdo, $_SESSION['admin_id'], 'sms_enabled_expiry', hasRole('Admin')) == '1' ? 'checked' : '' ?>>
                                        </div>
                                    </div>
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

            <!-- Voice Call Reminder Settings -->
            <?php
            $staff_id = $_SESSION['admin_id'];
            
            // Masking helper
            if (!function_exists('mask_voice_token')) {
                function mask_voice_token($token) {
                    if (empty($token)) return '';
                    $len = strlen($token);
                    if ($len <= 8) {
                        return str_repeat('*', $len);
                    }
                    return substr($token, 0, 5) . str_repeat('*', $len - 9) . substr($token, -4);
                }
            }

            $voice_enabled = get_voice_setting($pdo, $staff_id, 'voice_enabled');
            $raw_voice_token = get_voice_setting($pdo, $staff_id, 'voice_api_token', false);
            $voice_api_token = mask_voice_token($raw_voice_token);
            $voice_sender = get_voice_setting($pdo, $staff_id, 'voice_sender');
            $voice_voice_name = get_voice_setting($pdo, $staff_id, 'voice_voice_name');
            $voice_enabled_expiry = get_voice_setting($pdo, $staff_id, 'voice_enabled_expiry');
            $voice_days_before_expiry = get_voice_setting($pdo, $staff_id, 'voice_days_before_expiry');
            if ($voice_days_before_expiry === '') $voice_days_before_expiry = 0;
            $voice_time_expiry = get_voice_setting($pdo, $staff_id, 'voice_time_expiry') ?: '10:00';
            $voice_retry_enabled = get_voice_setting($pdo, $staff_id, 'voice_retry_enabled');
            $voice_retry_max_attempts = get_voice_setting($pdo, $staff_id, 'voice_retry_max_attempts') ?: 1;
            $voice_retry_after_minutes = get_voice_setting($pdo, $staff_id, 'voice_retry_after_minutes') ?: 60;
            $voice_allowed_hours_start = get_voice_setting($pdo, $staff_id, 'voice_allowed_hours_start') ?: '09:00';
            $voice_allowed_hours_end = get_voice_setting($pdo, $staff_id, 'voice_allowed_hours_end') ?: '20:00';
            $voice_test_phone = get_voice_setting($pdo, $staff_id, 'voice_test_phone') ?: '';

            $cached_senders_json = get_voice_setting($pdo, $staff_id, 'voice_cached_senders');
            $cached_voices_json = get_voice_setting($pdo, $staff_id, 'voice_cached_voices');
            $cached_balance = get_voice_setting($pdo, $staff_id, 'voice_cached_balance') ?: '0.00';
            $cached_at = get_voice_setting($pdo, $staff_id, 'voice_cached_at') ?: '';

            $senders_list = json_decode($cached_senders_json, true) ?: [];
            $voices_list = json_decode($cached_voices_json, true) ?: [];

            // Stats
            $stats_manager_id = hasRole('Admin') ? 0 : $staff_id;
            $stats_params = [];
            $stats_where = "";
            if (!hasRole('Admin')) {
                $stats_where = " AND manager_id = ?";
                $stats_params[] = $stats_manager_id;
            }
            
            try {
                $calls_today = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM voice_call_logs WHERE created_at >= CURDATE()" . $stats_where, $stats_params)['cnt'] ?? 0;
                $answered_today = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM voice_call_logs WHERE created_at >= CURDATE() AND status = 'answered'" . $stats_where, $stats_params)['cnt'] ?? 0;
                $unanswered_today = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM voice_call_logs WHERE created_at >= CURDATE() AND status = 'not_answered'" . $stats_where, $stats_params)['cnt'] ?? 0;
                $rejected_today = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM voice_call_logs WHERE created_at >= CURDATE() AND status = 'rejected'" . $stats_where, $stats_params)['cnt'] ?? 0;
                $failed_today = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM voice_call_logs WHERE created_at >= CURDATE() AND status = 'failed'" . $stats_where, $stats_params)['cnt'] ?? 0;
                $pending_today = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM voice_call_logs WHERE status = 'pending'" . $stats_where, $stats_params)['cnt'] ?? 0;
            } catch (Throwable $e) {
                // Table might not exist yet, prevent fatal crash
                $calls_today = 0; $answered_today = 0; $unanswered_today = 0;
                $rejected_today = 0; $failed_today = 0; $pending_today = 0;
            }
            $answer_rate = $calls_today > 0 ? round(($answered_today / $calls_today) * 100) : 0;
            ?>
            <div class="tab-pane fade" id="v-pills-voice" role="tabpanel">
                <div class="card settings-card">
                    <div class="settings-header d-flex justify-content-between align-items-center">
                        <div>
                            <h5 class="mb-0 fw-bold text-dark">Voice Call Reminder Configuration</h5>
                            <p class="text-muted small mb-0">Manage automatic billing voice broadcasts and retry configurations.</p>
                        </div>
                        <div>
                            <span class="badge bg-success-subtle text-success border border-success px-3 py-2 fs-6">
                                Balance: ৳<span id="voice-display-balance"><?= htmlspecialchars($cached_balance) ?></span>
                            </span>
                        </div>
                    </div>
                    <div class="card-body p-4">
                        
                        <!-- Account Statistics Cards -->
                        <div class="row g-3 mb-4">
                            <div class="col-md col-6">
                                <div class="p-3 bg-light rounded border text-center">
                                    <div class="text-muted small">Calls Today</div>
                                    <h4 class="fw-bold mb-0 mt-1"><?= $calls_today ?></h4>
                                </div>
                            </div>
                            <div class="col-md col-6">
                                <div class="p-3 bg-light rounded border text-center">
                                    <div class="text-success small">Answered</div>
                                    <h4 class="fw-bold mb-0 mt-1 text-success"><?= $answered_today ?></h4>
                                </div>
                            </div>
                            <div class="col-md col-6">
                                <div class="p-3 bg-light rounded border text-center">
                                    <div class="text-warning small">Unanswered</div>
                                    <h4 class="fw-bold mb-0 mt-1 text-warning"><?= $unanswered_today ?></h4>
                                </div>
                            </div>
                            <div class="col-md col-6">
                                <div class="p-3 bg-light rounded border text-center">
                                    <div class="text-danger small">Failed</div>
                                    <h4 class="fw-bold mb-0 mt-1 text-danger"><?= $failed_today ?></h4>
                                </div>
                            </div>
                            <div class="col-md col-6">
                                <div class="p-3 bg-light rounded border text-center">
                                    <div class="small" style="color: #d63384;">Rejected</div>
                                    <h4 class="fw-bold mb-0 mt-1" style="color: #d63384;"><?= $rejected_today ?></h4>
                                </div>
                            </div>
                            <div class="col-md col-6">
                                <div class="p-3 bg-light rounded border text-center">
                                    <div class="text-info small">Pending</div>
                                    <h4 class="fw-bold mb-0 mt-1 text-info"><?= $pending_today ?></h4>
                                </div>
                            </div>
                            <div class="col-md col-6">
                                <div class="p-3 bg-light rounded border text-center">
                                    <div class="text-primary small">Answer Rate</div>
                                    <h4 class="fw-bold mb-0 mt-1 text-primary"><?= $answer_rate ?>%</h4>
                                </div>
                            </div>
                        </div>

                        <form method="POST" id="voiceSettingsForm">
                            <input type="hidden" name="csrf_token" value="<?= get_csrf_token() ?>">
                            <input type="hidden" name="action" value="update_voice_settings">

                            <div class="d-flex align-items-center mb-4 p-3 bg-light rounded border">
                                <div class="form-check form-switch mb-0">
                                    <input class="form-check-input" type="checkbox" name="voice_enabled" id="voiceEnabled" value="1" <?= $voice_enabled == '1' ? 'checked' : '' ?>>
                                    <label class="form-check-label fw-bold ms-2" for="voiceEnabled">Enable Voice Call System</label>
                                </div>
                                <div class="ms-auto text-muted small">Toggle system-wide voice reminders.</div>
                            </div>

                            <div class="row g-3 mb-4">
                                <div class="col-md-8">
                                    <label class="form-label fw-bold">API Bearer Token</label>
                                    <div class="input-group">
                                        <span class="input-group-text bg-white"><i class="fas fa-key text-muted"></i></span>
                                        <input type="text" name="voice_api_token" id="voiceApiToken" class="form-control" value="<?= htmlspecialchars($voice_api_token) ?>" placeholder="awaj_xxxxxxxxxxxxxxxxxxxxxxxx">
                                        <button type="button" id="btnTestVoiceConnection" class="btn btn-outline-secondary">
                                            <i class="fas fa-plug me-1"></i> Test Connection
                                        </button>
                                    </div>
                                    <div class="form-text mt-1 text-muted">Your token will be encrypted and stored securely.</div>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">&nbsp;</label>
                                    <button type="button" id="btnRefreshSendersVoices" class="btn btn-dark w-100 fw-bold shadow-sm">
                                        <i class="fas fa-sync-alt me-1"></i> Sync Senders & Voices
                                    </button>
                                </div>
                            </div>

                            <!-- Connection Status Result Card -->
                            <div class="alert alert-info border-0 rounded-3 mb-4 d-none" id="voiceConnectionResult">
                                <div class="d-flex align-items-center">
                                    <i class="fas fa-info-circle me-3 fa-lg"></i>
                                    <div id="voiceConnectionResultMessage"></div>
                                </div>
                            </div>

                            <div class="row g-3 mb-4">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Caller Sender ID (Sender)</label>
                                    <select name="voice_sender" id="voiceSender" class="form-select">
                                        <option value="">-- Select Active Sender --</option>
                                        <?php foreach($senders_list as $snd): ?>
                                            <?php if(isset($snd['status']) && strtolower($snd['status']) === 'active'): ?>
                                                <option value="<?= htmlspecialchars($snd['callingNumber']) ?>" <?= $voice_sender === $snd['callingNumber'] ? 'selected' : '' ?>>
                                                    <?= htmlspecialchars($snd['callingNumber']) ?>
                                                </option>
                                            <?php endif; ?>
                                        <?php endforeach; ?>
                                    </select>
                                    <div class="form-text">Active approved calling numbers from AwajDigital account.</div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Voice File (Audio Voice)</label>
                                    <select name="voice_voice_name" id="voiceVoiceName" class="form-select">
                                        <option value="">-- Select Approved Voice --</option>
                                        <?php foreach($voices_list as $vc): ?>
                                            <?php if(isset($vc['status']) && strtolower($vc['status']) === 'approved'): ?>
                                                <option value="<?= htmlspecialchars($vc['name']) ?>" <?= $voice_voice_name === $vc['name'] ? 'selected' : '' ?>>
                                                    <?= htmlspecialchars($vc['name']) ?>
                                                </option>
                                            <?php endif; ?>
                                        <?php endforeach; ?>
                                    </select>
                                    <div class="form-text">Only APPROVED voices can be used for automated reminders.</div>
                                </div>
                            </div>

                            <!-- Expiry Reminder configuration -->
                            <h6 class="text-muted border-bottom pb-2 fw-bold mb-3 mt-4">Expiry Call Schedule</h6>
                            <div class="row g-3 mb-4">
                                <div class="col-md-3 align-self-center">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" name="voice_enabled_expiry" id="voiceEnabledExpiry" value="1" <?= $voice_enabled_expiry == '1' ? 'checked' : '' ?>>
                                        <label class="form-check-label fw-bold" for="voiceEnabledExpiry">Enable Expiry Reminder</label>
                                    </div>
                                </div>
                                <div class="col-md-5">
                                    <label class="form-label fw-bold">Call When</label>
                                    <select name="voice_days_before_expiry" class="form-select">
                                        <option value="0" <?= $voice_days_before_expiry == 0 ? 'selected' : '' ?>>On Expiry Date</option>
                                        <option value="1" <?= $voice_days_before_expiry == 1 ? 'selected' : '' ?>>1 Day Before Expiry</option>
                                        <option value="2" <?= $voice_days_before_expiry == 2 ? 'selected' : '' ?>>2 Days Before Expiry</option>
                                        <option value="3" <?= $voice_days_before_expiry == 3 ? 'selected' : '' ?>>3 Days Before Expiry</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">Call Time (Asia/Dhaka timezone)</label>
                                    <input type="time" name="voice_time_expiry" class="form-control" value="<?= htmlspecialchars($voice_time_expiry) ?>">
                                </div>
                            </div>

                            <!-- Retry configuration -->
                            <h6 class="text-muted border-bottom pb-2 fw-bold mb-3 mt-4">Retry Settings</h6>
                            <div class="row g-3 mb-4">
                                <div class="col-md-3 align-self-center">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" name="voice_retry_enabled" id="voiceRetryEnabled" value="1" <?= $voice_retry_enabled == '1' ? 'checked' : '' ?>>
                                        <label class="form-check-label fw-bold" for="voiceRetryEnabled">Retry Unanswered Calls</label>
                                    </div>
                                </div>
                                <div class="col-md-5">
                                    <label class="form-label fw-bold">Maximum Attempts</label>
                                    <select name="voice_retry_max_attempts" class="form-select">
                                        <option value="1" <?= $voice_retry_max_attempts == 1 ? 'selected' : '' ?>>1 Attempt (No Retry)</option>
                                        <option value="2" <?= $voice_retry_max_attempts == 2 ? 'selected' : '' ?>>2 Attempts</option>
                                        <option value="3" <?= $voice_retry_max_attempts == 3 ? 'selected' : '' ?>>3 Attempts</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">Retry Delay</label>
                                    <select name="voice_retry_after_minutes" class="form-select">
                                        <option value="60" <?= $voice_retry_after_minutes == 60 ? 'selected' : '' ?>>1 Hour</option>
                                        <option value="120" <?= $voice_retry_after_minutes == 120 ? 'selected' : '' ?>>2 Hours</option>
                                        <option value="240" <?= $voice_retry_after_minutes == 240 ? 'selected' : '' ?>>4 Hours</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Calling Hours safety window -->
                            <h6 class="text-muted border-bottom pb-2 fw-bold mb-3 mt-4">Safe Calling Hours</h6>
                            <div class="row g-3 mb-4">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Allowed Calls Start From</label>
                                    <input type="time" name="voice_allowed_hours_start" class="form-control" value="<?= htmlspecialchars($voice_allowed_hours_start) ?>">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Allowed Calls Until</label>
                                    <input type="time" name="voice_allowed_hours_end" class="form-control" value="<?= htmlspecialchars($voice_allowed_hours_end) ?>">
                                </div>
                                <div class="col-12 mt-1">
                                    <small class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i> No automated calls will be initiated outside of these hours. Manual test calls can still run but will display a warning.</small>
                                </div>
                            </div>

                            <div class="mt-4 text-end">
                                <button type="submit" name="update_voice_settings" class="btn btn-dark px-4 fw-bold shadow-sm">
                                    <i class="fas fa-save me-2"></i> Save Voice Settings
                                </button>
                            </div>
                        </form>

                        <hr class="my-5">

                        <!-- Test Call Tool & Voice Upload Tool -->
                        <div class="row g-4 mt-2">
                            <div class="col-md-6">
                                <div class="p-3 bg-light rounded border">
                                    <h6 class="fw-bold mb-2 text-dark"><i class="fas fa-phone me-1"></i> Manual Test Call</h6>
                                    <form method="POST" id="voiceTestCallForm">
                                        <input type="hidden" name="csrf_token" value="<?= get_csrf_token() ?>">
                                        <input type="hidden" name="action" value="voice_make_test_call">
                                        <div class="mb-3">
                                            <label class="form-label small fw-bold">Phone Number</label>
                                            <input type="text" name="test_phone" class="form-control form-control-sm" placeholder="017XXXXXXXX" value="<?= htmlspecialchars($voice_test_phone) ?>" required>
                                        </div>
                                        <div class="row g-2 mb-3">
                                            <div class="col-6">
                                                <label class="form-label small fw-bold">Sender</label>
                                                <select name="test_sender" class="form-select form-select-sm" required>
                                                    <?php foreach($senders_list as $snd): ?>
                                                        <?php if(isset($snd['status']) && strtolower($snd['status']) === 'active'): ?>
                                                            <option value="<?= htmlspecialchars($snd['callingNumber']) ?>" <?= $voice_sender === $snd['callingNumber'] ? 'selected' : '' ?>><?= htmlspecialchars($snd['callingNumber']) ?></option>
                                                        <?php endif; ?>
                                                    <?php endforeach; ?>
                                                </select>
                                            </div>
                                            <div class="col-6">
                                                <label class="form-label small fw-bold">Voice</label>
                                                <select name="test_voice" class="form-select form-select-sm" required>
                                                    <?php foreach($voices_list as $vc): ?>
                                                        <?php if(isset($vc['status']) && strtolower($vc['status']) === 'approved'): ?>
                                                            <option value="<?= htmlspecialchars($vc['name']) ?>" <?= $voice_voice_name === $vc['name'] ? 'selected' : '' ?>><?= htmlspecialchars($vc['name']) ?></option>
                                                        <?php endif; ?>
                                                    <?php endforeach; ?>
                                                </select>
                                            </div>
                                        </div>
                                        <button type="submit" class="btn btn-outline-dark btn-sm fw-bold w-100">
                                            <i class="fas fa-phone-alt me-1"></i> Make Test Call
                                        </button>
                                    </form>
                                    <div class="alert alert-warning border-0 rounded-3 mt-3 d-none" id="voiceTestCallResult">
                                        <small id="voiceTestCallResultMessage"></small>
                                    </div>
                                </div>
                            </div>

                            <!-- Voice Upload Tool -->
                            <div class="col-md-6">
                                <div class="p-3 bg-light rounded border">
                                    <h6 class="fw-bold mb-2 text-dark"><i class="fas fa-upload me-1"></i> Upload Voice File</h6>
                                    <form method="POST" id="voiceUploadForm" enctype="multipart/form-data">
                                        <input type="hidden" name="csrf_token" value="<?= get_csrf_token() ?>">
                                        <input type="hidden" name="action" value="voice_upload_voice">
                                        <div class="mb-3">
                                            <label class="form-label small fw-bold">Voice Name</label>
                                            <input type="text" name="voice_upload_name" class="form-control form-control-sm" placeholder="my_reminder_voice" required>
                                            <div class="form-text small">Use letters, numbers, and underscores only.</div>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label small fw-bold">Audio File (Max 10MB)</label>
                                            <input type="file" name="voice_upload_file" class="form-control form-control-sm" accept="audio/*" required>
                                            <div class="form-text small">Allowed: mp3, wav, ogg, m4a, aac, webm, flac</div>
                                        </div>
                                        <button type="submit" class="btn btn-outline-info btn-sm fw-bold w-100">
                                            <i class="fas fa-cloud-upload-alt me-1"></i> Upload to AwajDigital
                                        </button>
                                    </form>
                                    <div class="alert alert-info border-0 rounded-3 mt-3 d-none" id="voiceUploadResult">
                                        <small id="voiceUploadResultMessage"></small>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
                
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    const btnTest = document.getElementById('btnTestVoiceConnection');
                    const btnRefresh = document.getElementById('btnRefreshSendersVoices');
                    const connCard = document.getElementById('voiceConnectionResult');
                    const connMsg = document.getElementById('voiceConnectionResultMessage');
                    const displayBalance = document.getElementById('voice-display-balance');

                    function showResult(success, message) {
                        connCard.classList.remove('d-none', 'alert-info', 'alert-success', 'alert-danger');
                        connCard.classList.add(success ? 'alert-success' : 'alert-danger');
                        connMsg.innerHTML = message;
                    }

                    if (btnTest) {
                        btnTest.addEventListener('click', function() {
                            const tokenVal = document.getElementById('voiceApiToken').value;
                            if (!tokenVal) {
                                alert('Please input an API Bearer Token first.');
                                return;
                            }
                            
                            btnTest.disabled = true;
                            btnTest.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Testing...';
                            
                            const formData = new FormData();
                            formData.append('csrf_token', '<?= get_csrf_token() ?>');
                            formData.append('action', 'voice_test_connection');
                            formData.append('voice_api_token', tokenVal);

                            fetch('index.php?ajax=1', {
                                method: 'POST',
                                body: formData
                            })
                            .then(res => res.json())
                            .then(res => {
                                btnTest.disabled = false;
                                btnTest.innerHTML = '<i class="fas fa-plug me-1"></i> Test Connection';
                                if (res.success) {
                                    showResult(true, `<strong>✓ API Connected</strong><br>Balance: ৳${res.balance}<br>Active Senders: ${res.active_senders}<br>Approved Voices: ${res.approved_voices}`);
                                    if(displayBalance) displayBalance.innerText = res.balance;
                                } else {
                                    showResult(false, `<strong>✗ Connection Failed</strong><br>${res.message}`);
                                }
                            })
                            .catch(err => {
                                btnTest.disabled = false;
                                btnTest.innerHTML = '<i class="fas fa-plug me-1"></i> Test Connection';
                                showResult(false, `<strong>✗ Network Error</strong><br>Failed to reach server.`);
                            });
                        });
                    }

                    if (btnRefresh) {
                        btnRefresh.addEventListener('click', function() {
                            const tokenVal = document.getElementById('voiceApiToken').value;
                            btnRefresh.disabled = true;
                            btnRefresh.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Syncing...';

                            const formData = new FormData();
                            formData.append('csrf_token', '<?= get_csrf_token() ?>');
                            formData.append('action', 'voice_refresh_senders_voices');
                            formData.append('voice_api_token', tokenVal);

                            fetch('index.php?ajax=1', {
                                method: 'POST',
                                body: formData
                            })
                            .then(res => res.json())
                            .then(res => {
                                btnRefresh.disabled = false;
                                btnRefresh.innerHTML = '<i class="fas fa-sync-alt me-1"></i> Sync Senders & Voices';
                                if (res.success) {
                                    alert('Senders and Voices synced successfully. Reloading settings page...');
                                    window.location.reload();
                                } else {
                                    alert('Sync Failed: ' + res.message);
                                }
                            })
                            .catch(err => {
                                btnRefresh.disabled = false;
                                btnRefresh.innerHTML = '<i class="fas fa-sync-alt me-1"></i> Sync Senders & Voices';
                                alert('Network error during sync.');
                            });
                        });
                    }

                    // Test Call Submit
                    const testCallForm = document.getElementById('voiceTestCallForm');
                    const testCallResult = document.getElementById('voiceTestCallResult');
                    const testCallMsg = document.getElementById('voiceTestCallResultMessage');
                    if (testCallForm) {
                        testCallForm.addEventListener('submit', function(e) {
                            e.preventDefault();
                            const submitBtn = testCallForm.querySelector('button[type="submit"]');
                            submitBtn.disabled = true;
                            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Calling...';
                            testCallResult.classList.add('d-none');

                            fetch('index.php?ajax=1', {
                                method: 'POST',
                                body: new FormData(testCallForm)
                            })
                            .then(res => res.json())
                            .then(res => {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = '<i class="fas fa-phone-alt me-1"></i> Make Test Call';
                                testCallResult.classList.remove('d-none', 'alert-warning', 'alert-success', 'alert-danger');
                                if (res.success) {
                                    testCallResult.classList.add('alert-success');
                                    testCallMsg.innerHTML = `<strong>✓ Call Broadcast Created!</strong><br>Broadcast ID: ${res.broadcast_id}`;
                                } else {
                                    testCallResult.classList.add('alert-danger');
                                    testCallMsg.innerHTML = `<strong>✗ Test Call Failed</strong><br>${res.message}`;
                                }
                            })
                            .catch(err => {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = '<i class="fas fa-phone-alt me-1"></i> Make Test Call';
                                testCallResult.classList.remove('d-none', 'alert-success');
                                testCallResult.classList.add('alert-danger');
                                testCallMsg.innerHTML = `<strong>✗ Network Error</strong><br>Failed to execute test call.`;
                            });
                        });
                    }

                    // Upload Voice Submit
                    const uploadForm = document.getElementById('voiceUploadForm');
                    const uploadResult = document.getElementById('voiceUploadResult');
                    const uploadMsg = document.getElementById('voiceUploadResultMessage');
                    if (uploadForm) {
                        uploadForm.addEventListener('submit', function(e) {
                            e.preventDefault();
                            const submitBtn = uploadForm.querySelector('button[type="submit"]');
                            submitBtn.disabled = true;
                            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Uploading...';
                            uploadResult.classList.add('d-none');

                            fetch('index.php?ajax=1', {
                                method: 'POST',
                                body: new FormData(uploadForm)
                            })
                            .then(res => res.json())
                            .then(res => {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> Upload to AwajDigital';
                                uploadResult.classList.remove('d-none', 'alert-info', 'alert-success', 'alert-danger');
                                if (res.success) {
                                    uploadResult.classList.add('alert-success');
                                    uploadMsg.innerHTML = `<strong>✓ Voice Uploaded!</strong><br>File Name: ${res.name}<br>Status: <strong>${res.status}</strong> (Pending approval from AwajDigital admin)`;
                                    uploadForm.reset();
                                } else {
                                    uploadResult.classList.add('alert-danger');
                                    uploadMsg.innerHTML = `<strong>✗ Upload Failed</strong><br>${res.message}`;
                                }
                            })
                            .catch(err => {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> Upload to AwajDigital';
                                uploadResult.classList.remove('d-none');
                                uploadResult.classList.add('alert-danger');
                                uploadMsg.innerHTML = `<strong>✗ Network Error</strong><br>Failed to upload file.`;
                            });
                        });
                    }
                });
                </script>
            </div>
            <?php endif; ?>

            <?php if(hasRole('Admin') || isOffice()): ?>
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

            <!-- API Configuration -->
            <div class="tab-pane fade" id="v-pills-api" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header">
                        <h5 class="mb-0 fw-bold text-dark">API Configuration</h5>
                        <p class="text-muted small mb-0">Manage API keys and Tenant logic for external REST integrations.</p>
                    </div>
                    <div class="card-body p-4">
                        <?php
                            $tenant = null;
                            $tokens = [];
                            try {
                                $tenant = safeFetch($pdo, "SELECT * FROM tenants LIMIT 1");
                                if ($tenant) {
                                    $stmt = $pdo->prepare("SELECT * FROM api_tokens WHERE tenant_id = ?");
                                    $stmt->execute([$tenant['id']]);
                                    $tokens = $stmt->fetchAll();
                                }
                            } catch (Exception $e) {
                                // Tables might not exist yet if migration failed or just started
                            }
                        ?>
                        
                        <!-- Tenant Binding Form -->
                        <div class="card bg-light border-0 mb-4">
                            <div class="card-body">
                                <h6 class="fw-bold mb-3"><i class="fas fa-server me-2"></i> Tenant Settings</h6>
                                <form method="POST">
                                    <div class="mb-3">
                                        <label class="form-label">Tenant Key (ID No)</label>
                                        <input type="text" class="form-control bg-light text-dark fw-bold" value="<?= htmlspecialchars($display_tenant_id) ?>" readonly>
                                        <small class="text-muted">The unique numeric identifier for this tenant (used in API headers like <code>X-Tenant-ID</code>)</small>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Subdomain Binding</label>
                                        <input type="text" name="api_subdomain" class="form-control" value="<?= $tenant['subdomain'] ?? $_SERVER['HTTP_HOST'] ?>" required>
                                        <small class="text-muted">The subdomain this API expects requests on (e.g. <code>api.yourdomain.com</code>)</small>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <label class="form-label">HMAC Secret Key</label>
                                        <div class="input-group">
                                            <input type="text" name="api_hmac" class="form-control" value="<?= $tenant['hmac_secret'] ?? '' ?>" readonly placeholder="Will be generated on saving">
                                            <button class="btn btn-outline-secondary" type="submit" name="regenerate_hmac" onclick="return confirm('Regenerating HMAC will invalidate current webhook signatures! Proceed?')">Regenerate</button>
                                        </div>
                                        <small class="text-muted">Used for signature verification on callbacks</small>
                                    </div>
                                    <div class="text-end">
                                        <button type="submit" name="update_api_tenant" class="btn btn-primary btn-sm px-3 fw-bold">Update Tenant</button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <?php if ($tenant): ?>
                        <hr>
                        <!-- Token Generation Form -->
                        <h6 class="fw-bold"><i class="fas fa-plus-circle me-1"></i> Generate New API Token</h6>
                        <form method="POST" class="mb-4">
                            <div class="row g-3">
                                <div class="col-md-5">
                                    <label class="form-label">
                                        Rate Limit (Req / Min)
                                        <i class="fas fa-question-circle text-muted ms-1" title="The maximum number of API requests allowed per minute for this token. '100' means 100 requests every 60 seconds." data-bs-toggle="tooltip"></i>
                                    </label>
                                    <input type="number" name="token_rate_limit" class="form-control" value="100" required>
                                </div>
                                <div class="col-md-4 d-flex align-items-end">
                                    <button type="submit" name="generate_api_token" class="btn btn-success w-100"><i class="fas fa-bolt me-1"></i> Generate</button>
                                </div>
                            </div>
                        </form>
                        
                        <?php if (isset($_SESSION['error'])): ?>
                            <div class="alert alert-danger mt-4 shadow-sm border-danger border-2">
                                <strong class="fs-5"><i class="fas fa-exclamation-circle me-2"></i> Error:</strong>
                                <hr>
                                <p class="mb-0"><?= $_SESSION['error'] ?></p>
                            </div>
                            <?php unset($_SESSION['error']); ?>
                        <?php endif; ?>
                        
                        <?php if (isset($_SESSION['new_api_token'])): ?>
                            <div class="alert alert-success mt-4 shadow-sm border-success border-2">
                                <strong class="fs-5"><i class="fas fa-check-circle me-2"></i> Token Generated Successfully!</strong>
                                <hr>
                                <p class="mb-2">Your new Bearer API Token is:</p>
                                <div class="bg-dark text-white p-3 rounded mb-2 user-select-all" style="font-family: monospace; font-size: 1.1em; word-break: break-all;" id="newApiTokenText">
                                    <?= $_SESSION['new_api_token'] ?>
                                </div>
                                <button type="button" class="btn btn-sm btn-outline-success fw-bold bg-white" onclick="navigator.clipboard.writeText('<?= $_SESSION['new_api_token'] ?>').then(() => { this.innerHTML = '<i=\'fas fa-check\'></i> Copied!'; setTimeout(() => this.innerHTML = '<i=\'fas fa-copy\'></i> Copy Token', 2000); })">
                                    <i class="fas fa-copy"></i> Copy Token
                                </button>
                                <p class="text-danger fw-bold small mb-0 mt-2"><i class="fas fa-exclamation-triangle me-1"></i> Please copy this token now. For security reasons, it cannot be shown again.</p>
                            </div>
                            <?php unset($_SESSION['new_api_token']); ?>
                        <?php endif; ?>

                        <?php if (!empty($tokens)): ?>
                            <h6 class="fw-bold mt-5"><i class="fas fa-list me-1"></i> Active Tokens</h6>
                            <div class="table-responsive">
                                <table class="table table-sm table-bordered table-hover align-middle">
                                    <thead class="bg-light">
                                        <tr>
                                            <th>ID</th>
                                            <th>Hash (Masked)</th>
                                            <th>Rate Limit</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($tokens as $t): ?>
                                        <tr>
                                            <td><?= $t['id'] ?></td>
                                            <td class="d-flex align-items-center justify-content-between">
                                                <code><?= substr($t['token_hash'], 0, 15) ?>...</code>
                                                <button type="button" class="btn btn-sm btn-light border p-0 ms-2" style="width:24px;height:24px;" 
                                                        onclick="navigator.clipboard.writeText('<?= $t['token_hash'] ?>').then(() => { this.innerHTML = '<i class=\'fas fa-check text-success\'></i>'; setTimeout(() => this.innerHTML = '<i class=\'far fa-copy text-muted\'></i>', 2000); })" 
                                                        title="Copy Hash">
                                                    <i class="far fa-copy text-muted"></i>
                                                </button>
                                            </td>
                                            <td>
                                                <?= $t['rate_limit'] ?> / min
                                                <i class="fas fa-question-circle text-muted ms-1 small" title="Max <?= $t['rate_limit'] ?> API requests per minute" data-bs-toggle="tooltip"></i>
                                            </td>
                                            <td>
                                                <a href="?tab=settings&action=delete_token&token_id=<?= $t['id'] ?>" class="btn btn-sm btn-outline-danger px-2 py-0" onclick="return confirm('Immediately revoke this API token? This action cannot be undone.')"><i class="fas fa-trash"></i></a>
                                            </td>
                                        </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                            </div>
                        <?php endif; ?>
                        
                        <!-- Customer Mobile App API Documentation -->
                        <div class="card border border-2 border-primary bg-light bg-opacity-10 mt-5">
                            <div class="card-header bg-primary text-white p-3 d-flex align-items-center">
                                <h6 class="mb-0 fw-bold"><i class="fas fa-mobile-alt me-2"></i> Customer Mobile App API Reference</h6>
                            </div>
                            <div class="card-body p-4">
                                <p class="text-muted small">Use these endpoints to integrate Android/iOS customer apps. All requests must either be routed to your dynamic subdomain or send the <code>X-Tenant-ID</code> header.</p>
                                
                                <div class="mb-3 small">
                                    <strong>Base URL:</strong> <code class="user-select-all">https://<?= htmlspecialchars($tenant['subdomain'] ?? 'your-subdomain') ?>.shebafi.com/api/v1/customer</code>
                                </div>

                                <div class="list-group list-group-flush">
                                    <!-- Endpoint 1 -->
                                    <div class="list-group-item bg-transparent py-3 px-0">
                                        <div class="d-flex align-items-center gap-2 mb-2">
                                            <span class="badge bg-success px-2 py-1">POST</span>
                                            <strong class="text-dark">/login</strong>
                                            <span class="badge bg-secondary ms-auto">Public</span>
                                        </div>
                                        <p class="text-muted small mb-1">Customer authentication by PPPoE ID, mobile number, or account ID + password.</p>
                                        <div class="bg-dark text-white p-2 rounded small" style="font-family: monospace; font-size: 11px;">
                                            Request Body: { "username": "mobile_or_id", "password": "password" }
                                        </div>
                                    </div>
                                    
                                    <!-- Endpoint 2 -->
                                    <div class="list-group-item bg-transparent py-3 px-0">
                                        <div class="d-flex align-items-center gap-2 mb-2">
                                            <span class="badge bg-primary px-2 py-1">GET</span>
                                            <strong class="text-dark">/profile</strong>
                                            <span class="badge bg-dark ms-auto">Bearer Token</span>
                                        </div>
                                        <p class="text-muted small mb-0">Retrieve subscriber details, dynamic zone/area, current package, monthly bill, due balance, and connection state.</p>
                                    </div>

                                    <!-- Endpoint 3 -->
                                    <div class="list-group-item bg-transparent py-3 px-0">
                                        <div class="d-flex align-items-center gap-2 mb-2">
                                            <span class="badge bg-primary px-2 py-1">GET</span>
                                            <strong class="text-dark">/live-usage</strong>
                                            <span class="badge bg-dark ms-auto">Bearer Token</span>
                                        </div>
                                        <p class="text-muted small mb-0">Query real-time upload/download speeds directly from the router (if online) and historical daily usage for today, last 7 days, and last 30 days.</p>
                                    </div>

                                    <!-- Endpoint 4 -->
                                    <div class="list-group-item bg-transparent py-3 px-0">
                                        <div class="d-flex align-items-center gap-2 mb-2">
                                            <span class="badge bg-primary px-2 py-1">GET</span>
                                            <strong class="text-dark">/bill/status</strong>
                                            <span class="badge bg-dark ms-auto">Bearer Token</span>
                                        </div>
                                        <p class="text-muted small mb-0">Fetch current billing statistics, total paid this month, active due, advance amount, and last payment details.</p>
                                    </div>

                                    <!-- Endpoint 5 -->
                                    <div class="list-group-item bg-transparent py-3 px-0">
                                        <div class="d-flex align-items-center gap-2 mb-2">
                                            <span class="badge bg-success px-2 py-1">POST</span>
                                            <strong class="text-dark">/payment/paybill</strong>
                                            <span class="badge bg-dark ms-auto">Bearer Token</span>
                                        </div>
                                        <p class="text-muted small mb-1">Process subscriber payments, recharge, auto-update ledger and cashbook, create transaction records, and enable connection on MikroTik.</p>
                                        <div class="bg-dark text-white p-2 rounded small" style="font-family: monospace; font-size: 11px;">
                                            Request Body: { "gateway": "bkash", "amount": 500, "trxid": "TRX123456", "paid_at": "YYYY-MM-DD HH:MM:SS" }
                                        </div>
                                    </div>

                                    <!-- Endpoint 6 -->
                                    <div class="list-group-item bg-transparent py-3 px-0">
                                        <div class="d-flex align-items-center gap-2 mb-2">
                                            <span class="badge bg-primary px-2 py-1">GET</span>
                                            <strong class="text-dark">/payment/history</strong>
                                            <span class="badge bg-dark ms-auto">Bearer Token</span>
                                        </div>
                                        <p class="text-muted small mb-0">Returns chronological list of customer payment/recharge records.</p>
                                    </div>

                                    <!-- Endpoint 7 -->
                                    <div class="list-group-item bg-transparent py-3 px-0">
                                        <div class="d-flex align-items-center gap-2 mb-2">
                                            <span class="badge bg-success px-2 py-1">POST</span>
                                            <strong class="text-dark">/ticket/create</strong>
                                            <span class="badge bg-dark ms-auto">Bearer Token</span>
                                        </div>
                                        <p class="text-muted small mb-1">Log customer complaints or support requests to the main ISP panel.</p>
                                        <div class="bg-dark text-white p-2 rounded small" style="font-family: monospace; font-size: 11px;">
                                            Request Body: { "subject": "Slow Speed", "message": "My connection is slow", "category": "technical" }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <?php endif; ?>
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

            <?php if(hasRole('Admin') || isOffice()): ?>
            <!-- Fun Box Settings -->
            <div class="tab-pane fade" id="v-pills-funbox" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header d-flex justify-content-between align-items-center">
                        <div>
                            <h5 class="mb-0 fw-bold text-dark">Fun Box Settings</h5>
                            <p class="text-muted small mb-0">Manage FTP, Movie, and TV URLs for client self-care portal.</p>
                        </div>
                        <button class="btn btn-primary btn-sm rounded-pill" data-bs-toggle="modal" data-bs-target="#addFunBoxModal">
                            <i class="fas fa-plus me-1"></i> Add New
                        </button>
                    </div>
                    <div class="card-body p-4">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle">
                                <thead class="bg-light">
                                    <tr>
                                        <th>Name</th>
                                        <th>URL</th>
                                        <th class="text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php 
                                    $funbox_links = json_decode(get_opt($pdo, 'funbox_links', '[]'), true);
                                    if (empty($funbox_links)): ?>
                                        <tr><td colspan="3" class="text-center py-4 text-muted">No entertainment links added yet.</td></tr>
                                    <?php else: foreach($funbox_links as $index => $link): ?>
                                        <tr>
                                            <td class="fw-semibold text-primary"><i class="fas fa-play-circle me-1"></i> <?= htmlspecialchars($link['name']) ?></td>
                                            <td><a href="<?= htmlspecialchars($link['url']) ?>" target="_blank" class="text-truncate d-inline-block" style="max-width: 300px;"><?= htmlspecialchars($link['url']) ?></a></td>
                                             <td class="text-end">
                                                <button class="btn btn-sm btn-outline-primary p-1 px-2 me-1" data-bs-toggle="modal" data-bs-target="#editFunBoxModal<?= $index ?>"><i class="fas fa-edit"></i></button>
                                                <a href="?tab=settings&action=delete_funbox&id=<?= $index ?>" class="btn btn-sm btn-outline-danger p-1 px-2" onclick="return confirm('Delete this entertainment link?')"><i class="fas fa-trash"></i></a>
                                                
                                                <!-- Edit FunBox Modal -->
                                                <div class="modal fade" id="editFunBoxModal<?= $index ?>" tabindex="-1">
                                                    <div class="modal-dialog text-start">
                                                        <form method="POST" class="modal-content">
                                                            <input type="hidden" name="action" value="edit_funbox">
                                                            <input type="hidden" name="funbox_id" value="<?= $index ?>">
                                                            <div class="modal-header">
                                                                <h5 class="modal-title">Edit Entertainment Link</h5>
                                                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                                            </div>
                                                            <div class="modal-body">
                                                                <div class="mb-3">
                                                                    <label class="form-label fw-bold">Name</label>
                                                                    <input type="text" name="funbox_name" class="form-control" value="<?= htmlspecialchars($link['name']) ?>" required>
                                                                </div>
                                                                <div class="mb-3">
                                                                    <label class="form-label fw-bold">URL</label>
                                                                    <input type="url" name="funbox_url" class="form-control" value="<?= htmlspecialchars($link['url']) ?>" required>
                                                                </div>
                                                            </div>
                                                            <div class="modal-footer">
                                                                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                                                                <button type="submit" class="btn btn-primary btn-sm">Update Details</button>
                                                            </div>
                                                        </form>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    <?php endforeach; endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add FunBox Modal -->
            <div class="modal fade" id="addFunBoxModal" tabindex="-1">
                <div class="modal-dialog">
                    <form method="POST" class="modal-content">
                        <input type="hidden" name="action" value="save_funbox">
                        <div class="modal-header">
                            <h5 class="modal-title">Add New Entertainment Link</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">Name</label>
                                <input type="text" name="funbox_name" class="form-control" placeholder="Ex: Movies, Live TV" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">URL</label>
                                <input type="url" name="funbox_url" class="form-control" placeholder="http://10.10.10.10:8080" required>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                            <button type="submit" class="btn btn-primary btn-sm">Save Entertainment</button>
                        </div>
                    </form>
                </div>
            </div>
            <?php endif; ?>
            
            <?php if(hasRole('Reseller') && !hasRole('Admin')): 
                $reseller_info = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id = ?", [$_SESSION['admin_id']]);
                $invoice_config = [];
                if ($reseller_info && !empty($reseller_info['invoice_config'])) {
                    $invoice_config = json_decode($reseller_info['invoice_config'], true) ?: [];
                }
            ?>
            <!-- Reseller Invoice Branding Settings -->
            <div class="tab-pane fade" id="v-pills-invoice" role="tabpanel">
                <div class="card settings-card h-100">
                    <div class="settings-header">
                        <h5 class="mb-0 fw-bold text-dark">Invoice Branding</h5>
                        <p class="text-muted small mb-0">Customize the contact information displayed on your clients' invoices.</p>
                    </div>
                    <div class="card-body p-4">
                        <form method="POST">
                            <div class="row mb-4">
                                <div class="col-md-12">
                                    <label class="form-label fw-bold text-dark">Reseller Company Name</label>
                                    <input type="text" name="invoice_company_name" class="form-control form-control-lg" value="<?= htmlspecialchars($invoice_config['name'] ?? '') ?>" placeholder="Enter company name">
                                    <small class="text-muted">If left blank, the global admin company name will be used.</small>
                                </div>
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-12">
                                    <label class="form-label fw-bold text-dark">Contact Address</label>
                                    <textarea name="invoice_company_address" class="form-control" rows="2" placeholder="Reseller Office Address"><?= htmlspecialchars($invoice_config['address'] ?? '') ?></textarea>
                                    <small class="text-muted">If left blank, the global admin office address will be used.</small>
                                </div>
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold text-dark">Contact Phone</label>
                                    <input type="text" name="invoice_company_phone" class="form-control" value="<?= htmlspecialchars($invoice_config['phone'] ?? '') ?>" placeholder="+880 1XXX-XXXXXX">
                                    <small class="text-muted">If left blank, the global admin phone will be used.</small>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold text-dark">Contact Email</label>
                                    <input type="email" name="invoice_company_email" class="form-control" value="<?= htmlspecialchars($invoice_config['email'] ?? '') ?>" placeholder="reseller@isp.com">
                                    <small class="text-muted">If left blank, the global admin email will be used.</small>
                                </div>
                            </div>

                            <div class="mt-4 text-end">
                                <button type="submit" name="update_reseller_invoice" class="btn btn-primary px-4 fw-bold shadow-sm">
                                    <i class="fas fa-check me-2"></i> Save Invoice Branding
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
            <?php endif; ?>
             
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // Restore active tab from localStorage if set
    var activeTab = localStorage.getItem('activeSettingsTab');
    if (activeTab) {
        var tabTrigger = document.querySelector('button[data-bs-target="' + activeTab + '"]');
        if (tabTrigger) {
            // Trigger bootstrap show
            var tab = new bootstrap.Tab(tabTrigger);
            tab.show();
        }
    }
    
    // Listen for tab shown events and persist in localStorage
    var tabElList = [].slice.call(document.querySelectorAll('button[data-bs-toggle="pill"]'));
    tabElList.forEach(function(tabEl) {
        tabEl.addEventListener('shown.bs.tab', function(event) {
            var target = event.target.getAttribute('data-bs-target');
            localStorage.setItem('activeSettingsTab', target);
        });
    });
});
</script>

