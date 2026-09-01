<?php
// views/settings/payment_verification_gateways.php
file_put_contents(dirname(__DIR__, 2) . '/debug_view.log', date('Y-m-d H:i:s') . " | METHOD: " . $_SERVER['REQUEST_METHOD'] . " | POST: " . json_encode($_POST) . " | GET: " . json_encode($_GET) . "\n", FILE_APPEND);
if (!isLoggedIn()) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}

$error = $error ?? '';
$success = $msg ?? '';

// Fetch gateways
$managed_ids = getManagedStaffIds($pdo, $_SESSION['admin_id'], $_SESSION['user_role']);
if (hasRole('Admin') || $managed_ids === 'ALL') {
    $gateways = safeFetchAll($pdo, "SELECT * FROM tenant_payment_gateways ORDER BY id DESC");
} else {
    $gateways = safeFetchAll($pdo, "SELECT * FROM tenant_payment_gateways WHERE staff_id = ? ORDER BY id DESC", [$_SESSION['admin_id']]);
}

// Fetch single gateway for editing if requested
$edit_gw = null;
if (isset($_GET['edit_id'])) {
    $edit_id = intval($_GET['edit_id']);
    if (hasRole('Admin') || $managed_ids === 'ALL') {
        $edit_gw = safeFetch($pdo, "SELECT * FROM tenant_payment_gateways WHERE id = ?", [$edit_id]);
    } else {
        $edit_gw = safeFetch($pdo, "SELECT * FROM tenant_payment_gateways WHERE id = ? AND staff_id = ?", [$edit_id, $_SESSION['admin_id']]);
    }
}

// Fetch default device_id and api_token from any existing gateway if not editing
$default_device_id = '';
$default_api_token = '';
if (!empty($gateways)) {
    $default_device_id = $gateways[0]['device_id'];
    $default_api_token = $gateways[0]['api_token'];
}
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <div>
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-shield-alt text-primary me-2"></i> SMS Gateways & Devices</h4>
        <p class="text-muted small mb-0">Manage merchant gateway accounts and Android SMS forwarding tokens.</p>
    </div>
    <a href="?tab=payment_verification_dashboard" class="btn btn-outline-secondary btn-sm">
        <i class="fas fa-arrow-left me-1"></i> Back to Dashboard
    </a>
</div>

<?php if ($error): ?>
    <div class="alert alert-danger border-0 bg-danger bg-opacity-10 text-danger rounded-3 mb-4 d-flex align-items-center">
        <i class="fas fa-times-circle me-2"></i> <?= htmlspecialchars($error) ?>
    </div>
<?php endif; ?>

<?php if ($success): ?>
    <div class="alert alert-success border-0 bg-success bg-opacity-10 text-success rounded-3 mb-4 d-flex align-items-center">
        <i class="fas fa-check-circle me-2"></i> <?= htmlspecialchars($success) ?>
    </div>
<?php endif; ?>

<div class="row g-4">
    <!-- Form Card (Add/Edit) -->
    <div class="col-lg-4">
        <div class="card shadow-sm border-0 h-100">
            <div class="card-header bg-transparent py-3 border-bottom">
                <h6 class="mb-0 fw-bold text-dark">
                    <i class="fas <?= $edit_gw ? 'fa-edit text-warning' : 'fa-plus text-success' ?> me-2"></i>
                    <?= $edit_gw ? 'Edit Device Gateway' : 'Add New Device Gateway' ?>
                </h6>
            </div>
            <div class="card-body">
                <form method="POST" action="?tab=payment_verification_gateways">
                    <input type="hidden" name="id" value="<?= $edit_gw ? $edit_gw['id'] : 0 ?>">

                    <div class="mb-3">
                        <label class="form-label small fw-semibold text-secondary">MFS Provider</label>
                        <select name="gateway_name" class="form-select" required>
                            <option value="">-- Select Provider --</option>
                            <option value="bKash" <?= ($edit_gw && $edit_gw['gateway_name'] === 'bKash') ? 'selected' : '' ?>>bKash</option>
                            <option value="Nagad" <?= ($edit_gw && $edit_gw['gateway_name'] === 'Nagad') ? 'selected' : '' ?>>Nagad</option>
                            <option value="Rocket" <?= ($edit_gw && $edit_gw['gateway_name'] === 'Rocket') ? 'selected' : '' ?>>Rocket</option>
                            <option value="Upay" <?= ($edit_gw && $edit_gw['gateway_name'] === 'Upay') ? 'selected' : '' ?>>Upay</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-semibold text-secondary">Merchant Mobile Number</label>
                        <input type="text" name="merchant_number" class="form-control" placeholder="e.g. 01700000000" value="<?= $edit_gw ? htmlspecialchars($edit_gw['merchant_number']) : '' ?>" required>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-semibold text-secondary">Android Device ID</label>
                        <input type="text" name="device_id" id="device_id" class="form-control" placeholder="e.g. Pixel_5_A12" value="<?= $edit_gw ? htmlspecialchars($edit_gw['device_id']) : htmlspecialchars($default_device_id) ?>" required>
                        <small class="text-muted d-block mt-1">Unique identifier matching your Android forwarding app settings.</small>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-semibold text-secondary">Webhook API Token</label>
                        <div class="input-group">
                            <input type="text" name="api_token" id="api_token" class="form-control font-monospace" placeholder="Click generate or enter token" value="<?= $edit_gw ? htmlspecialchars($edit_gw['api_token']) : htmlspecialchars($default_api_token) ?>" required>
                            <button class="btn btn-outline-secondary" type="button" id="generate_token_btn"><i class="fas fa-key"></i></button>
                        </div>
                        <small class="text-muted d-block mt-1">Used to authorize incoming SMS webhooks for this device.</small>
                    </div>

                    <hr class="my-4 text-muted">
                    <h6 class="mb-3 fw-bold text-dark"><i class="fas fa-shopping-cart text-primary me-2"></i> Automated Checkout Options</h6>

                    <div class="mb-3">
                        <label class="form-label small fw-semibold text-secondary">Checkout Enabled</label>
                        <select name="checkout_enabled" class="form-select" required>
                            <option value="1" <?= ($edit_gw && $edit_gw['checkout_enabled'] == 1) ? 'selected' : '' ?>>Enabled</option>
                            <option value="0" <?= ($edit_gw && $edit_gw['checkout_enabled'] == 0) ? 'selected' : '' ?>>Disabled</option>
                        </select>
                        <small class="text-muted d-block mt-1">Allow customers to use this gateway for automated SMS checkout.</small>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-semibold text-secondary">Account Type</label>
                        <select name="account_type" class="form-select" required>
                            <option value="Personal" <?= ($edit_gw && $edit_gw['account_type'] === 'Personal') ? 'selected' : '' ?>>Personal</option>
                            <option value="Personal Retail" <?= ($edit_gw && $edit_gw['account_type'] === 'Personal Retail') ? 'selected' : '' ?>>Personal Retail (PRA)</option>
                            <option value="Merchant" <?= ($edit_gw && $edit_gw['account_type'] === 'Merchant') ? 'selected' : '' ?>>Merchant</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-semibold text-secondary">Instruction Type</label>
                        <select name="instruction_type" class="form-select" required>
                            <option value="Send Money" <?= ($edit_gw && $edit_gw['instruction_type'] === 'Send Money') ? 'selected' : '' ?>>Send Money</option>
                            <option value="Payment" <?= ($edit_gw && $edit_gw['instruction_type'] === 'Payment') ? 'selected' : '' ?>>Payment</option>
                        </select>
                        <small class="text-muted d-block mt-1">Used to guide the user on the checkout page.</small>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-semibold text-secondary">Checkout Expiry (Minutes)</label>
                        <input type="number" name="checkout_expiry_mins" class="form-control" value="<?= $edit_gw ? htmlspecialchars($edit_gw['checkout_expiry_mins']) : '10' ?>" min="5" max="60" required>
                    </div>

                    <hr class="my-4 text-muted">

                    <div class="mb-4">
                        <label class="form-label small fw-semibold text-secondary">Gateway Status</label>
                        <select name="status" class="form-select" required>
                            <option value="active" <?= ($edit_gw && $edit_gw['status'] === 'active') ? 'selected' : '' ?>>Active</option>
                            <option value="inactive" <?= ($edit_gw && $edit_gw['status'] === 'inactive') ? 'selected' : '' ?>>Inactive</option>
                        </select>
                    </div>

                    <div class="d-flex gap-2">
                        <button type="submit" name="save_gateway" class="btn btn-primary w-100 fw-bold">
                            <i class="fas fa-save me-1"></i> Save
                        </button>
                        <?php if ($edit_gw): ?>
                            <a href="?tab=payment_verification_gateways" class="btn btn-secondary w-100 fw-bold">Cancel</a>
                        <?php endif; ?>
                    </div>
                </form>
            </div>
        </div>

        <!-- Android Integration Instructions -->
        <div class="card shadow-sm border-0 mt-4">
            <div class="card-header bg-transparent py-3 border-bottom">
                <h6 class="mb-0 fw-bold text-dark">
                    <i class="fab fa-android text-success me-2"></i> Android Integration
                </h6>
            </div>
            <div class="card-body">
                <p class="text-muted small">Configure your Android SMS Forwarder App with the following details to log payment SMS feeds automatically:</p>
                
                <div class="mb-3">
                    <label class="form-label small fw-bold text-secondary mb-1">API Endpoint URL</label>
                    <div class="input-group input-group-sm">
                        <?php
                            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || ($_SERVER['SERVER_PORT'] ?? '') == 443) ? "https://" : "http://";
                            $current_host = $_SERVER['HTTP_HOST'] ?? 'localhost';
                            $base_path = rtrim(dirname($_SERVER['PHP_SELF'] ?? ''), '/\\');
                            $api_url = $protocol . $current_host . $base_path . "/api/v1/payment/sms";
                        ?>
                        <input type="text" class="form-control font-monospace bg-light border-end-0 text-truncate" id="android_api_url" value="<?= htmlspecialchars($api_url) ?>" readonly>
                        <button class="btn btn-outline-secondary" type="button" id="copy_api_url_btn">
                            <i class="far fa-copy"></i>
                        </button>
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold text-secondary mb-1">Request Headers</label>
                    <div class="bg-light p-2 rounded border small">
                        <span class="d-block"><strong>Method:</strong> <span class="badge bg-primary">POST</span></span>
                        <span class="d-block mt-1"><strong>Content-Type:</strong> <code>application/json</code></span>
                    </div>
                </div>

                <div>
                    <label class="form-label small fw-bold text-secondary mb-1">Expected JSON Body</label>
                    <pre class="bg-dark text-light p-2 rounded small mb-0 font-monospace" style="font-size: 0.75rem; overflow-x: auto;">{
  "device_id": "<span class="text-info">DEVICE_ID</span>",
  "api_token": "<span class="text-info">API_TOKEN</span>",
  "gateway": "<span class="text-warning">bKash</span>",
  "sms_text": "<span class="text-success">Sender SMS content...</span>",
  "received_at": "<span class="text-success"><?= date('Y-m-d H:i:s') ?></span>"
}</pre>
                    <small class="text-muted d-block mt-1.5" style="font-size: 0.75rem;">Supported gateway values: <code>bKash</code>, <code>Nagad</code>, <code>Rocket</code>, <code>Upay</code></small>
                </div>
            </div>
        </div>
    </div>

    <!-- Table Card -->
    <div class="col-lg-8">
        <div class="card shadow-sm border-0 h-100">
            <div class="card-header bg-transparent py-3 border-bottom">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-list me-2"></i> Configured Gateway Devices</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0 small">
                        <thead class="table-light">
                            <tr>
                                <th>Gateway</th>
                                <th>Merchant Number</th>
                                <th>Device ID</th>
                                <th>API Token</th>
                                <th>Status</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($gateways)): ?>
                                <tr>
                                    <td colspan="6" class="text-center text-muted py-5">
                                        <i class="fas fa-tablet-alt fa-3x mb-3 text-light d-block"></i>
                                        No gateway devices configured. Add a device on the left to start receiving payment verification SMS.
                                    </td>
                                </tr>
                            <?php else: ?>
                                <?php foreach ($gateways as $gw): ?>
                                    <tr>
                                        <td>
                                            <span class="badge py-1.5 px-2.5 rounded-pill bg-opacity-10 
                                                <?= $gw['gateway_name'] == 'bKash' ? 'bg-danger text-danger' : '' ?>
                                                <?= $gw['gateway_name'] == 'Nagad' ? 'bg-warning text-warning' : '' ?>
                                                <?= $gw['gateway_name'] == 'Rocket' ? 'bg-primary text-primary' : '' ?>
                                                <?= $gw['gateway_name'] == 'Upay' ? 'bg-info text-info' : '' ?>">
                                                <?= htmlspecialchars($gw['gateway_name']) ?>
                                            </span>
                                        </td>
                                        <td><strong><?= htmlspecialchars($gw['merchant_number']) ?></strong></td>
                                        <td><code><?= htmlspecialchars($gw['device_id']) ?></code></td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <code class="font-monospace text-truncate me-2" style="max-width: 100px;"><?= htmlspecialchars($gw['api_token']) ?></code>
                                                <button class="btn btn-xs btn-link p-0 text-muted copy-token-btn" data-token="<?= htmlspecialchars($gw['api_token']) ?>" title="Copy Token">
                                                    <i class="far fa-copy"></i>
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="badge bg-<?= $gw['status'] == 'active' ? 'success' : 'secondary' ?> py-1 px-2">
                                                <?= $gw['status'] ?>
                                            </span>
                                        </td>
                                        <td class="text-end">
                                            <a href="?tab=payment_verification_gateways&edit_id=<?= $gw['id'] ?>" class="btn btn-sm btn-outline-warning me-1">
                                                <i class="fas fa-edit"></i>
                                            </a>
                                            <a href="?tab=payment_verification_gateways&action=delete_gateway&delete_id=<?= $gw['id'] ?>" class="btn btn-sm btn-outline-danger" onclick="return confirm('Are you sure you want to delete this gateway configuration? Devices using this token will fail to log SMS.');">
                                                <i class="fas fa-trash-alt"></i>
                                            </a>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function generateSecureToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'tok_';
    for (let i = 0; i < 20; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('api_token').value = token;
}

document.addEventListener('DOMContentLoaded', function() {
    // 1. Generate Token Button Click
    const genBtn = document.getElementById('generate_token_btn');
    if (genBtn) {
        genBtn.addEventListener('click', generateSecureToken);
    }
    
    // 2. Copy API Endpoint URL Button Click
    const copyUrlBtn = document.getElementById('copy_api_url_btn');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', function() {
            const apiUrlInput = document.getElementById('android_api_url');
            if (apiUrlInput) {
                navigator.clipboard.writeText(apiUrlInput.value).then(() => {
                    alert('API URL copied!');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            }
        });
    }
    
    // 3. Copy Token Button Click (via event delegation)
    document.addEventListener('click', function(e) {
        const copyTokenBtn = e.target.closest('.copy-token-btn');
        if (copyTokenBtn) {
            const token = copyTokenBtn.getAttribute('data-token');
            if (token) {
                navigator.clipboard.writeText(token).then(() => {
                    alert('Token copied!');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            }
        }
    });
});
</script>
