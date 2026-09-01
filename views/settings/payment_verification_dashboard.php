<?php
// views/settings/payment_verification_dashboard.php
if (!isLoggedIn()) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}

$error = isset($error) && !empty($error) ? $error : '';
$success = isset($success) && !empty($success) ? $success : (isset($msg) ? $msg : '');

// Handle Manual Actions
if (isset($_GET['action'])) {
    $action = $_GET['action'];
    $managed_ids = getManagedStaffIds($pdo, $_SESSION['admin_id'], $_SESSION['user_role']);
    
    if ($action === 'manual_verify' && isset($_GET['request_id'])) {
        $requestId = intval($_GET['request_id']);
        // Fetch request details
        $req = safeFetch($pdo, "SELECT pr.*, u.manager_id FROM payment_requests pr JOIN users u ON pr.customer_id = u.id WHERE pr.id = ? AND pr.status = 'pending'", [$requestId]);
        
        if ($req) {
            $authorized = true;
            if (!hasRole('Admin') && $managed_ids !== 'ALL') {
                if (!is_array($managed_ids) || !in_array((int)$req['manager_id'], $managed_ids)) {
                    $authorized = false;
                }
            }
            
            if (!$authorized) {
                $error = 'Access Denied: You are not authorized to verify this payment request.';
            } else {
                require_once __DIR__ . '/../../classes/PaymentMatchingEngine.php';
                // Trigger activation
                try {
                    $pdo->beginTransaction();
                    
                    // Set SMS Log matching if there is a matching SMS
                    $stmt = $pdo->prepare("SELECT id FROM payment_sms_logs WHERE UPPER(trx_id) = ? AND status = 'unmatched' LIMIT 1");
                    $stmt->execute([strtoupper($req['trx_id'])]);
                    $sms = $stmt->fetch();
                    if ($sms) {
                        $pdo->prepare("UPDATE payment_sms_logs SET status = 'matched' WHERE id = ?")->execute([$sms['id']]);
                    }

                    $apiMeta = json_encode(['method' => 'MANUAL_VERIFIED', 'gateway' => $req['gateway_name'], 'trx_id' => $req['trx_id'], 'by_admin' => ($_SESSION['admin_username'] ?? 'System')]);
                    $stmt = $pdo->prepare("INSERT INTO payment_gateway_logs (staff_id, amount, trx_id, status, payment_id, gateway_response) VALUES (?, ?, ?, 'COMPLETED', ?, ?)");
                    $stmt->execute([$req['customer_id'], $req['amount'], $req['trx_id'], $req['trx_id'], $apiMeta]);
                    
                    $activation = processOnlinePaymentSuccess($pdo, $req['customer_id'], $req['amount'], $req['gateway_name'] . '_MANUAL', json_decode($apiMeta, true));
                    
                    if ($activation) {
                        $pdo->prepare("UPDATE payment_requests SET status = 'verified', verified_at = ? WHERE id = ?")->execute([date('Y-m-d H:i:s'), $requestId]);
                        $pdo->commit();
                        $success = 'Payment request verified and client package activated successfully!';
                    } else {
                        $pdo->rollBack();
                        $error = 'Failed to activate client recharge. Please verify user status.';
                    }
                } catch (Exception $e) {
                    $pdo->rollBack();
                    $error = 'Activation Error: ' . $e->getMessage();
                }
            }
        } else {
            $error = 'Pending payment request not found.';
        }
    }
    
    if ($action === 'reject_request' && isset($_GET['request_id'])) {
        $requestId = intval($_GET['request_id']);
        // Fetch request details
        $req = safeFetch($pdo, "SELECT pr.*, u.manager_id FROM payment_requests pr JOIN users u ON pr.customer_id = u.id WHERE pr.id = ? AND pr.status = 'pending'", [$requestId]);
        
        if ($req) {
            $authorized = true;
            if (!hasRole('Admin') && $managed_ids !== 'ALL') {
                if (!is_array($managed_ids) || !in_array((int)$req['manager_id'], $managed_ids)) {
                    $authorized = false;
                }
            }
            
            if (!$authorized) {
                $error = 'Access Denied: You are not authorized to reject this payment request.';
            } else {
                $stmt = $pdo->prepare("UPDATE payment_requests SET status = 'rejected' WHERE id = ? AND status = 'pending'");
                $stmt->execute([$requestId]);
                if ($stmt->rowCount() > 0) {
                    $success = 'Payment request rejected.';
                } else {
                    $error = 'Request not found or not in pending status.';
                }
            }
        } else {
            $error = 'Pending payment request not found.';
        }
    }

    // manual_match_sms POST action has been moved to controllers/logic.php
}

// Fetch lists
$managed_ids = getManagedStaffIds($pdo, $_SESSION['admin_id'], $_SESSION['user_role']);

// 1. Fetch SMS Logs
if (hasRole('Admin') || $managed_ids === 'ALL') {
    $sms_logs = safeFetchAll($pdo, "SELECT * FROM payment_sms_logs ORDER BY id DESC LIMIT 50");
} else {
    $sms_logs = safeFetchAll($pdo, "SELECT * FROM payment_sms_logs WHERE staff_id = ? ORDER BY id DESC LIMIT 50", [$_SESSION['admin_id']]);
}

// 2. Fetch Requests
if (hasRole('Admin') || $managed_ids === 'ALL') {
    $requests = safeFetchAll($pdo, "SELECT pr.*, u.name as customer_name, u.user_id as pppoe_id FROM payment_requests pr JOIN users u ON pr.customer_id = u.id ORDER BY pr.id DESC LIMIT 50");
} else {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $requests = safeFetchAll($pdo, "SELECT pr.*, u.name as customer_name, u.user_id as pppoe_id FROM payment_requests pr JOIN users u ON pr.customer_id = u.id WHERE u.manager_id IN ($placeholders) ORDER BY pr.id DESC LIMIT 50", $managed_ids);
}

// 3. Fetch Gateways
if (hasRole('Admin') || $managed_ids === 'ALL') {
    $gateways = safeFetchAll($pdo, "SELECT * FROM tenant_payment_gateways");
} else {
    $gateways = safeFetchAll($pdo, "SELECT * FROM tenant_payment_gateways WHERE staff_id = ?", [$_SESSION['admin_id']]);
}

// 4. Fetch Active Clients
if (hasRole('Admin') || $managed_ids === 'ALL') {
    $active_clients = safeFetchAll($pdo, "SELECT id, name, user_id FROM users WHERE status = 'Active' ORDER BY user_id ASC");
} else {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $active_clients = safeFetchAll($pdo, "SELECT id, name, user_id FROM users WHERE status = 'Active' AND manager_id IN ($placeholders) ORDER BY user_id ASC", $managed_ids);
}

// Calculate stats
$total_gateways = count($gateways);
$active_devices = count(array_filter($gateways, fn($g) => $g['status'] === 'active'));
$pending_requests = count(array_filter($requests, fn($r) => $r['status'] === 'pending'));
$verified_payments = count(array_filter($requests, fn($r) => $r['status'] === 'verified'));
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <div>
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-sms text-primary me-2"></i> Payment Verification Dashboard</h4>
        <p class="text-muted small mb-0">Monitor incoming payment SMS feeds, customer match requests, and device statuses.</p>
    </div>
    <div class="d-flex gap-2">
        <a href="?tab=payment_verification_gateways" class="btn btn-primary btn-sm">
            <i class="fas fa-cog me-1"></i> Manage Devices
        </a>
    </div>
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

<!-- Stats Cards -->
<div class="row g-4 mb-4">
    <div class="col-md-3">
        <div class="card shadow-sm border-0 border-start border-4 border-info h-100">
            <div class="card-body">
                <h6 class="text-muted small fw-bold text-uppercase mb-1">Active Devices</h6>
                <h3 class="fw-bold mb-0 text-info"><?= $active_devices ?> <small class="fs-6 text-muted">/ <?= $total_gateways ?></small></h3>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card shadow-sm border-0 border-start border-4 border-warning h-100">
            <div class="card-body">
                <h6 class="text-muted small fw-bold text-uppercase mb-1">Pending Requests</h6>
                <h3 class="fw-bold mb-0 text-warning"><?= $pending_requests ?></h3>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card shadow-sm border-0 border-start border-4 border-success h-100">
            <div class="card-body">
                <h6 class="text-muted small fw-bold text-uppercase mb-1">Verified Payments</h6>
                <h3 class="fw-bold mb-0 text-success"><?= $verified_payments ?></h3>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card shadow-sm border-0 border-start border-4 border-primary h-100">
            <div class="card-body">
                <h6 class="text-muted small fw-bold text-uppercase mb-1">Success Match Rate</h6>
                <h3 class="fw-bold mb-0 text-primary">
                    <?php
                    $total_req = count($requests);
                    echo $total_req > 0 ? round(($verified_payments / $total_req) * 100, 1) . '%' : '0%';
                    ?>
                </h3>
            </div>
        </div>
    </div>
</div>

<!-- Navigation Tabs -->
<ul class="nav nav-tabs mb-4 border-bottom-0" id="verifyTab" role="tablist">
    <li class="nav-item">
        <button class="nav-link active fw-bold px-4 rounded-3 border-0 me-2 shadow-sm" id="requests-tab" data-bs-toggle="tab" data-bs-target="#requests-pane" type="button" role="tab"><i class="fas fa-user-clock me-2"></i>Customer Requests</button>
    </li>
    <li class="nav-item">
        <button class="nav-link fw-bold px-4 rounded-3 border-0 shadow-sm" id="sms-tab" data-bs-toggle="tab" data-bs-target="#sms-pane" type="button" role="tab"><i class="fas fa-envelope-open-text me-2"></i>Incoming SMS Logs</button>
    </li>
</ul>

<div class="tab-content" id="verifyTabContent">
    <!-- Customer Requests Pane -->
    <div class="tab-pane fade show active" id="requests-pane" role="tabpanel">
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white py-3">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-history me-1"></i> Customer Verification Requests (Last 50)</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0 small">
                        <thead class="table-light">
                            <tr>
                                <th>Client / PPPoE ID</th>
                                <th>Invoice ID</th>
                                <th>Gateway</th>
                                <th>Amount</th>
                                <th>Transaction ID</th>
                                <th>Status</th>
                                <th>Submitted At</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($requests)): ?>
                                <tr>
                                    <td colspan="8" class="text-center py-5 text-muted">
                                        <i class="fas fa-history fa-3x mb-3 text-light d-block"></i>
                                        No customer verification requests submitted yet.
                                    </td>
                                </tr>
                            <?php else: ?>
                                <?php foreach ($requests as $r): ?>
                                    <tr>
                                        <td>
                                            <strong><?= htmlspecialchars($r['customer_name']) ?></strong>
                                            <div class="text-muted small">ID: <?= htmlspecialchars($r['pppoe_id']) ?></div>
                                        </td>
                                        <td><code><?= htmlspecialchars($r['invoice_id']) ?></code></td>
                                        <td><strong><?= htmlspecialchars($r['gateway_name']) ?></strong></td>
                                        <td><strong>৳<?= number_format($r['amount'], 2) ?></strong></td>
                                        <td><code class="font-monospace fw-bold text-dark"><?= htmlspecialchars($r['trx_id']) ?></code></td>
                                        <td>
                                            <span class="badge py-1.5 px-2.5 rounded-pill 
                                                <?= $r['status'] == 'pending' ? 'bg-warning text-dark' : '' ?>
                                                <?= $r['status'] == 'verified' ? 'bg-success text-white' : '' ?>
                                                <?= $r['status'] == 'rejected' ? 'bg-danger text-white' : '' ?>
                                                <?= $r['status'] == 'failed' ? 'bg-secondary text-white' : '' ?>">
                                                <?= ucfirst($r['status']) ?>
                                            </span>
                                            <?php if ($r['verified_at']): ?>
                                                <div class="text-muted" style="font-size: 0.75rem;"><?= date('d-m H:i', strtotime($r['verified_at'])) ?></div>
                                            <?php endif; ?>
                                        </td>
                                        <td><?= date('d-m-Y H:i', strtotime($r['created_at'])) ?></td>
                                        <td class="text-end">
                                            <?php if ($r['status'] == 'pending'): ?>
                                                <a href="?tab=payment_verification_dashboard&action=manual_verify&request_id=<?= $r['id'] ?>" class="btn btn-xs btn-success rounded-pill px-2.5 me-1" onclick="return confirm('Manually verify and activate connection for client <?= htmlspecialchars($r['pppoe_id']) ?>?');">
                                                    <i class="fas fa-check"></i> Approve
                                                </a>
                                                <a href="?tab=payment_verification_dashboard&action=reject_request&request_id=<?= $r['id'] ?>" class="btn btn-xs btn-outline-danger rounded-pill px-2.5" onclick="return confirm('Reject this request?');">
                                                    <i class="fas fa-times"></i> Reject
                                                </a>
                                            <?php else: ?>
                                                <span class="text-muted small">No actions</span>
                                            <?php endif; ?>
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

    <!-- Incoming SMS logs Pane -->
    <div class="tab-pane fade" id="sms-pane" role="tabpanel">
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white py-3">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-mobile-alt me-1"></i> Webhook Forwarded SMS Feed (Last 50)</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0 small">
                        <thead class="table-light">
                            <tr>
                                <th>Gateway</th>
                                <th>Sender</th>
                                <th>Amount</th>
                                <th>Transaction ID</th>
                                <th>Reference ID</th>
                                <th>Raw SMS</th>
                                <th>Status</th>
                                <th>Time</th>
                                <th class="text-end">Manual Match</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($sms_logs)): ?>
                                <tr>
                                    <td colspan="9" class="text-center py-5 text-muted">
                                        <i class="fas fa-envelope fa-3x mb-3 text-light d-block"></i>
                                        No payment SMS logs found. Ensure your Android device forwarding webhook is active.
                                    </td>
                                </tr>
                            <?php else: ?>
                                <?php foreach ($sms_logs as $s): ?>
                                    <tr>
                                        <td>
                                            <?php
                                            $gname = strtolower($s['gateway_name'] ?? '');
                                            $badge_class = 'bg-secondary text-dark';
                                            if ($gname === 'bkash') $badge_class = 'bg-danger text-danger';
                                            elseif ($gname === 'nagad') $badge_class = 'bg-warning text-warning';
                                            elseif ($gname === 'rocket') $badge_class = 'bg-primary text-primary';
                                            elseif ($gname === 'upay') $badge_class = 'bg-info text-info';
                                            ?>
                                            <span class="badge py-1 px-2 rounded-pill bg-opacity-10 <?= $badge_class ?>">
                                                <?= htmlspecialchars($s['gateway_name']) ?>
                                            </span>
                                        </td>
                                        <td><strong><?= htmlspecialchars($s['sender_mobile']) ?></strong></td>
                                        <td><strong>৳<?= number_format($s['amount'], 2) ?></strong></td>
                                        <td><code class="font-monospace fw-bold text-dark"><?= htmlspecialchars($s['trx_id']) ?></code></td>
                                        <td>
                                            <?php if (!empty($s['reference_id'])): ?>
                                                <span class="badge bg-light text-dark border"><i class="fas fa-bookmark text-muted me-1"></i> <?= htmlspecialchars($s['reference_id']) ?></span>
                                            <?php else: ?>
                                                <span class="text-muted">-</span>
                                            <?php endif; ?>
                                        </td>
                                        <td style="max-width: 200px;" title="<?= htmlspecialchars($s['raw_sms']) ?>">
                                            <div class="text-truncate text-muted"><?= htmlspecialchars($s['raw_sms']) ?></div>
                                        </td>
                                        <td>
                                            <span class="badge py-1.5 px-2 rounded 
                                                <?= $s['status'] == 'matched' ? 'bg-success text-white' : '' ?>
                                                <?= $s['status'] == 'unmatched' ? 'bg-warning text-dark' : '' ?>
                                                <?= $s['status'] == 'duplicate' ? 'bg-secondary text-white' : '' ?>
                                                <?= $s['status'] == 'failed_parse' ? 'bg-danger text-white' : '' ?>">
                                                <?= htmlspecialchars($s['status']) ?>
                                            </span>
                                        </td>
                                        <td><?= date('d-m-Y H:i', strtotime($s['sms_received_at'])) ?></td>
                                        <td class="text-end">
                                            <?php if ($s['status'] == 'unmatched'): ?>
                                                <button type="button" class="btn btn-xs btn-outline-primary btn-match-sms" 
                                                        data-sms-id="<?= $s['id'] ?>" 
                                                        data-trx-id="<?= htmlspecialchars($s['trx_id']) ?>" 
                                                        data-amount="<?= number_format($s['amount'], 2) ?>">
                                                    <i class="fas fa-link"></i> Match
                                                </button>
                                            <?php else: ?>
                                                <span class="text-muted small">-</span>
                                            <?php endif; ?>
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

<!-- Single Match SMS Modal (Rendered once for ultimate performance) -->
<div class="modal fade text-start" id="matchSmsModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg">
            <div class="modal-header bg-light border-0">
                <h6 class="modal-title fw-bold text-dark">Manually Match Transaction ID: <span class="modal-trx-id"></span></h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <form method="POST" action="?tab=payment_verification_dashboard&action=manual_match_sms">
                <input type="hidden" name="sms_id" value="">
                <div class="modal-body p-4">
                    <div class="alert alert-warning border-0 bg-warning bg-opacity-10 small rounded-3 mb-3">
                        Assigning this unmatched payment of <strong>৳<span class="modal-amount"></span></strong> will recharge and activate the selected client.
                    </div>
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Select Client to Recharge</label>
                        <select name="customer_id" class="form-select select2-client-single" style="width: 100%;" required>
                            <option value="">-- Search / Select Client --</option>
                            <?php foreach ($active_clients as $ac): ?>
                                <option value="<?= $ac['id'] ?>"><?= htmlspecialchars($ac['user_id']) ?> (<?= htmlspecialchars($ac['name']) ?>)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>
                <div class="modal-footer bg-light border-0">
                    <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" name="submit_manual_match" class="btn btn-primary btn-sm">Assign & Recharge</button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // If Select2 is available, apply it
    if (typeof jQuery !== 'undefined' && jQuery.fn.select2) {
        jQuery('.select2-client-single').select2({
            theme: 'bootstrap-5',
            dropdownParent: jQuery('#matchSmsModal')
        });
    }

    // Populate and open the shared Match modal when clicking any Match button
    if (typeof jQuery !== 'undefined') {
        jQuery('.btn-match-sms').on('click', function(e) {
            e.preventDefault();
            var smsId = jQuery(this).data('sms-id');
            var trxId = jQuery(this).data('trx-id');
            var amount = jQuery(this).data('amount');
            
            var $modal = jQuery('#matchSmsModal');
            $modal.find('input[name="sms_id"]').val(smsId);
            $modal.find('.modal-trx-id').text(trxId);
            $modal.find('.modal-amount').text(amount);
            
            // Reset Select2 selection
            $modal.find('.select2-client-single').val('').trigger('change');
            
            $modal.modal('show');
        });
    }
});
</script>
