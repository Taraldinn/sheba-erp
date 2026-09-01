<?php
// views/hr/hr_advance.php
if (session_status() == PHP_SESSION_NONE) {
    ini_set('session.cookie_secure', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

$employees = safeFetchAll($pdo, "SELECT id, full_name, staff_id FROM " . TBL_HR_EMPLOYEES . " WHERE employment_status = 'Active' ORDER BY full_name ASC");

// Fetch Advance Requests
$query = "
    SELECT a.*, e.full_name, e.staff_id, e.designation, e.photo, u.username as approved_by_name
    FROM " . TBL_HR_ADVANCE_SALARIES . " a 
    JOIN " . TBL_HR_EMPLOYEES . " e ON a.employee_id = e.id 
    LEFT JOIN staff u ON a.approved_by = u.id
    ORDER BY a.id DESC
";
$advances = safeFetchAll($pdo, $query);
?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">Advance Salary</h1>
            <p class="text-muted small mb-0">Manage employee advance salary requests and installment deductions.</p>
        </div>
        <div class="text-end">
            <button type="button" class="btn btn-primary fw-bold rounded-pill px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#advanceRequestModal">
                <i class="fas fa-hand-holding-usd me-2"></i>Request Advance
            </button>
        </div>
    </div>

    <!-- Flash Messages -->
    <?php if (isset($_SESSION['flash_msg'])): ?>
        <div class="alert alert-success alert-dismissible fade show border-start border-4 border-success shadow-sm mb-4" role="alert">
            <i class="fas fa-check-circle me-2 text-success"></i> <?= htmlspecialchars($_SESSION['flash_msg']) ?>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
        <?php unset($_SESSION['flash_msg']); ?>
    <?php endif; ?>

    <?php if (isset($_SESSION['flash_error'])): ?>
        <div class="alert alert-danger alert-dismissible fade show border-start border-4 border-danger shadow-sm mb-4" role="alert">
            <i class="fas fa-exclamation-circle me-2 text-danger"></i> <?= htmlspecialchars($_SESSION['flash_error']) ?>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
        <?php unset($_SESSION['flash_error']); ?>
    <?php endif; ?>

    <!-- Data Table -->
    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light">
                        <tr class="text-muted small text-uppercase">
                            <th class="ps-4">Employee</th>
                            <th>Amount</th>
                            <th>Request Date</th>
                            <th>Return Type</th>
                            <th>Deduction Start</th>
                            <th>Balance</th>
                            <th>Status</th>
                            <th class="text-end pe-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($advances)): ?>
                            <tr>
                                <td colspan="8" class="text-center py-5 text-muted">
                                    <i class="fas fa-money-bill-wave fa-3x mb-3 text-light"></i>
                                    <h5>No advance requests found</h5>
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($advances as $adv): ?>
                                <tr>
                                    <td class="ps-4">
                                        <div class="d-flex align-items-center">
                                            <?php if (!empty($adv['photo']) && file_exists(__DIR__ . '/../../' . $adv['photo'])): ?>
                                                <img src="<?= htmlspecialchars($adv['photo']) ?>" alt="Pic" class="rounded-circle me-2" style="width: 35px; height: 35px; object-fit: cover;">
                                            <?php else: ?>
                                                <div class="rounded-circle bg-light d-flex align-items-center justify-content-center me-2 text-secondary" style="width: 35px; height: 35px;">
                                                    <i class="fas fa-user-circle"></i>
                                                </div>
                                            <?php endif; ?>
                                            <div>
                                                <div class="fw-bold text-dark mb-0"><?= htmlspecialchars($adv['full_name']) ?></div>
                                                <span class="text-muted small" style="font-size:0.75rem;"><?= htmlspecialchars($adv['staff_id']) ?> - <?= htmlspecialchars($adv['designation']) ?></span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <h6 class="mb-0 fw-bold text-primary">৳ <?= number_format($adv['amount'], 2) ?></h6>
                                        <span class="small text-muted" title="<?= htmlspecialchars($adv['purpose']) ?>"><i class="fas fa-info-circle me-1"></i>Purpose</span>
                                    </td>
                                    <td><span class="fw-bold small"><?= date('d M Y', strtotime($adv['request_date'])) ?></span></td>
                                    <td>
                                        <?php if ($adv['return_type'] === 'Instant'): ?>
                                            <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">1-Time Deduct</span>
                                        <?php else: ?>
                                            <span class="badge bg-info-subtle text-info border border-info-subtle">Installments (<?= $adv['installment_count'] ?>)</span>
                                            <div class="small text-muted mt-1" style="font-size:0.7rem;">৳ <?= number_format($adv['monthly_deduction'], 2) ?> /mo</div>
                                        <?php endif; ?>
                                    </td>
                                    <td><span class="fw-bold small"><?= date('M Y', strtotime($adv['deduction_start_month'] . '-01')) ?></span></td>
                                    <td>
                                        <?php if ($adv['status'] === 'Approved'): ?>
                                            <span class="fw-bold <?= $adv['remaining_balance'] > 0 ? 'text-danger' : 'text-success' ?>">৳ <?= number_format($adv['remaining_balance'], 2) ?></span>
                                        <?php else: ?>
                                            <span class="text-muted">--</span>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?php
                                        $badge = 'bg-warning text-dark';
                                        $icon = 'fa-clock';
                                        if ($adv['status'] === 'Approved') { $badge = 'bg-success'; $icon = 'fa-check-circle'; }
                                        elseif ($adv['status'] === 'Rejected') { $badge = 'bg-danger'; $icon = 'fa-times-circle'; }
                                        ?>
                                        <span class="badge <?= $badge ?> rounded-pill font-monospace" style="font-size:0.75rem;"><i class="fas <?= $icon ?> me-1"></i><?= $adv['status'] ?></span>
                                        <?php if ($adv['status'] !== 'Pending'): ?>
                                            <div class="small text-muted mt-1" style="font-size:0.65rem;">by <?= htmlspecialchars($adv['approved_by_name'] ?? 'Admin') ?></div>
                                        <?php endif; ?>
                                    </td>
                                    <td class="text-end pe-4">
                                        <?php if ($adv['status'] === 'Pending' && (hasRole('Admin') || hasPermission('hr_payroll'))): ?>
                                            <div class="d-flex justify-content-end gap-1">
                                                <form method="POST" action="" class="d-inline">
                                                    <input type="hidden" name="action" value="advance_action">
                                                    <input type="hidden" name="advance_id" value="<?= $adv['id'] ?>">
                                                    <input type="hidden" name="status" value="Approved">
                                                    <button type="submit" class="btn btn-sm btn-success fw-bold px-3 py-1 shadow-sm" onclick="return confirm('Approve this advance salary? The amount will be logged as an expense payout.')"><i class="fas fa-check me-1"></i>Approve</button>
                                                </form>
                                                <form method="POST" action="" class="d-inline">
                                                    <input type="hidden" name="action" value="advance_action">
                                                    <input type="hidden" name="advance_id" value="<?= $adv['id'] ?>">
                                                    <input type="hidden" name="status" value="Rejected">
                                                    <button type="submit" class="btn btn-sm btn-danger fw-bold px-3 py-1 shadow-sm" onclick="return confirm('Reject advance request?')"><i class="fas fa-times me-1"></i>Reject</button>
                                                </form>
                                            </div>
                                        <?php else: ?>
                                            <button class="btn btn-sm btn-light border text-muted disabled"><i class="fas fa-lock me-1"></i>Locked</button>
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

<!-- Advance Request Modal -->
<div class="modal fade" id="advanceRequestModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
            <form method="POST" action="">
                <input type="hidden" name="action" value="advance_request">
                <div class="modal-header bg-light border-0">
                    <h5 class="modal-title fw-bold text-dark"><i class="fas fa-money-check-alt text-primary me-2"></i>Advance Salary Request</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-4">
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Employee <span class="text-danger">*</span></label>
                        <select name="employee_id" class="form-select" required>
                            <option value="">Select Employee</option>
                            <?php foreach ($employees as $emp): ?>
                                <option value="<?= $emp['id'] ?>"><?= htmlspecialchars($emp['full_name']) ?> (<?= htmlspecialchars($emp['staff_id']) ?>)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Advance Amount (৳) <span class="text-danger">*</span></label>
                            <input type="number" step="0.01" name="amount" class="form-control" placeholder="0.00" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Request Date <span class="text-danger">*</span></label>
                            <input type="date" name="request_date" class="form-control" value="<?= date('Y-m-d') ?>" required>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Purpose</label>
                        <textarea name="purpose" class="form-control" rows="2" placeholder="Why is the advance requested?"></textarea>
                    </div>
                    
                    <hr class="text-muted">
                    <h6 class="fw-bold mb-3">Return Policy</h6>
                    
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Return Type <span class="text-danger">*</span></label>
                        <select name="return_type" id="returnTypeSelect" class="form-select" required onchange="toggleInstallmentBox()">
                            <option value="Instant">1-Time Deduction (Next Salary)</option>
                            <option value="Installment">Multiple Installments</option>
                        </select>
                    </div>
                    
                    <div class="row g-3 mb-3" id="installmentBox" style="display: none;">
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">No. of Installments</label>
                            <input type="number" name="installment_count" class="form-control" value="1" min="1">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Start Month <span class="text-danger">*</span></label>
                            <input type="month" name="deduction_start_month" class="form-control" value="<?= date('Y-m') ?>" required>
                        </div>
                    </div>
                    <div class="row g-3" id="instantBox">
                        <div class="col-md-12">
                            <label class="form-label text-muted small fw-bold">Deduction Month <span class="text-danger">*</span></label>
                            <input type="month" name="deduction_start_month" id="instantStartMonth" class="form-control" value="<?= date('Y-m') ?>" required>
                        </div>
                    </div>
                    
                </div>
                <div class="modal-footer border-0 bg-light">
                    <button type="button" class="btn btn-secondary px-4 fw-bold" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary px-4 fw-bold"><i class="fas fa-paper-plane me-2"></i>Submit Request</button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
function toggleInstallmentBox() {
    const val = document.getElementById('returnTypeSelect').value;
    const instBox = document.getElementById('installmentBox');
    const instantBox = document.getElementById('instantBox');
    const instantMonth = document.getElementById('instantStartMonth');
    
    if (val === 'Installment') {
        instBox.style.display = 'flex';
        instantBox.style.display = 'none';
        instantMonth.disabled = true; // prevent duplicate POST keys
    } else {
        instBox.style.display = 'none';
        instantBox.style.display = 'flex';
        instantMonth.disabled = false;
    }
}
</script>
