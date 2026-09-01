<?php
// views/hr/hr_leaves.php
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

$cur_year = date('Y');

$enable_casual_leave = getHRPolicy($pdo, 'enable_casual_leave', '1');
$enable_sick_leave = getHRPolicy($pdo, 'enable_sick_leave', '1');
$enable_emergency_leave = getHRPolicy($pdo, 'enable_emergency_leave', '1');
$enable_paid_leave = getHRPolicy($pdo, 'enable_paid_leave', '1');
$enable_alternative_leave = getHRPolicy($pdo, 'enable_alternative_leave', '1');

$employees = safeFetchAll($pdo, "SELECT id, full_name, staff_id FROM " . TBL_HR_EMPLOYEES . " WHERE employment_status = 'Active' ORDER BY full_name ASC");

// Fetch Leave Requests
$query = "
    SELECT l.*, e.full_name, e.staff_id, e.designation, e.photo, a.username as approved_by_name
    FROM " . TBL_HR_LEAVES . " l 
    JOIN " . TBL_HR_EMPLOYEES . " e ON l.employee_id = e.id 
    LEFT JOIN staff a ON l.approved_by = a.id
    ORDER BY l.id DESC
";
$leaves = safeFetchAll($pdo, $query);

// Fetch Leave Balances
$bal_query = "
    SELECT b.*, e.full_name, e.staff_id 
    FROM " . TBL_HR_LEAVE_BALANCES . " b 
    JOIN " . TBL_HR_EMPLOYEES . " e ON b.employee_id = e.id 
    WHERE b.year = ?
    ORDER BY e.full_name ASC
";
$balances = safeFetchAll($pdo, $bal_query, [$cur_year]);
?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">Leave Management</h1>
            <p class="text-muted small mb-0">Manage employee leave requests and track yearly balances.</p>
        </div>
        <div class="text-end">
            <button type="button" class="btn btn-primary fw-bold rounded-pill px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#leaveRequestModal">
                <i class="fas fa-calendar-plus me-2"></i>New Leave Request
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

    <!-- Tabs for Requests and Balances -->
    <ul class="nav nav-tabs mb-4" id="leaveTabs" role="tablist">
        <li class="nav-item" role="presentation">
            <button class="nav-link active fw-bold px-4" id="requests-tab" data-bs-toggle="tab" data-bs-target="#requests" type="button" role="tab">Leave Requests</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link fw-bold px-4" id="balances-tab" data-bs-toggle="tab" data-bs-target="#balances" type="button" role="tab">Yearly Balances (<?= $cur_year ?>)</button>
        </li>
    </ul>

    <div class="tab-content" id="leaveTabsContent">
        <!-- Leave Requests Tab -->
        <div class="tab-pane fade show active" id="requests" role="tabpanel">
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="bg-light">
                                <tr class="text-muted small text-uppercase">
                                    <th class="ps-4">Employee</th>
                                    <th>Leave Type</th>
                                    <th>Duration</th>
                                    <th>Days</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                    <th class="text-end pe-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($leaves)): ?>
                                    <tr>
                                        <td colspan="7" class="text-center py-5 text-muted">
                                            <i class="fas fa-folder-open fa-3x mb-3 text-light"></i>
                                            <h5>No leave requests found</h5>
                                        </td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($leaves as $lv): ?>
                                        <tr>
                                            <td class="ps-4">
                                                <div class="d-flex align-items-center">
                                                    <?php if (!empty($lv['photo']) && file_exists(__DIR__ . '/../../' . $lv['photo'])): ?>
                                                        <img src="<?= htmlspecialchars($lv['photo']) ?>" alt="Pic" class="rounded-circle me-2" style="width: 35px; height: 35px; object-fit: cover;">
                                                    <?php else: ?>
                                                        <div class="rounded-circle bg-light d-flex align-items-center justify-content-center me-2 text-secondary" style="width: 35px; height: 35px;">
                                                            <i class="fas fa-user-circle"></i>
                                                        </div>
                                                    <?php endif; ?>
                                                    <div>
                                                        <div class="fw-bold text-dark mb-0"><?= htmlspecialchars($lv['full_name']) ?></div>
                                                        <span class="text-muted small" style="font-size:0.75rem;"><?= htmlspecialchars($lv['staff_id']) ?> - <?= htmlspecialchars($lv['designation']) ?></span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td><span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle font-monospace"><?= htmlspecialchars($lv['leave_type']) ?></span></td>
                                            <td>
                                                <div class="small text-dark fw-bold"><?= date('d M Y', strtotime($lv['start_date'])) ?> <i class="fas fa-arrow-right text-muted mx-1"></i> <?= date('d M Y', strtotime($lv['end_date'])) ?></div>
                                            </td>
                                            <td><span class="fw-bold"><?= $lv['total_days'] ?></span> <span class="small text-muted">Days</span></td>
                                            <td>
                                                <span class="d-inline-block text-truncate small text-muted" style="max-width: 150px;" title="<?= htmlspecialchars($lv['reason']) ?>">
                                                    <?= htmlspecialchars($lv['reason']) ?: '-' ?>
                                                </span>
                                            </td>
                                            <td>
                                                <?php
                                                $badge = 'bg-warning text-dark';
                                                $icon = 'fa-clock';
                                                if ($lv['status'] === 'Approved') { $badge = 'bg-success'; $icon = 'fa-check-circle'; }
                                                elseif ($lv['status'] === 'Rejected') { $badge = 'bg-danger'; $icon = 'fa-times-circle'; }
                                                ?>
                                                <span class="badge <?= $badge ?> rounded-pill font-monospace" style="font-size:0.75rem;"><i class="fas <?= $icon ?> me-1"></i><?= $lv['status'] ?></span>
                                                <?php if ($lv['status'] !== 'Pending'): ?>
                                                    <div class="small text-muted mt-1" style="font-size:0.65rem;">by <?= htmlspecialchars($lv['approved_by_name'] ?? 'Admin') ?></div>
                                                <?php endif; ?>
                                            </td>
                                            <td class="text-end pe-4">
                                                <?php if ($lv['status'] === 'Pending' && (hasRole('Admin') || hasPermission('hr_manage_employees'))): ?>
                                                    <div class="d-flex justify-content-end gap-1">
                                                        <form method="POST" action="" class="d-inline">
                                                            <input type="hidden" name="action" value="leave_action">
                                                            <input type="hidden" name="leave_id" value="<?= $lv['id'] ?>">
                                                            <input type="hidden" name="status" value="Approved">
                                                            <button type="submit" class="btn btn-sm btn-success fw-bold px-3 py-1 shadow-sm" onclick="return confirm('Approve leave request? This will deduct the balance and set attendance to Leave.')"><i class="fas fa-check me-1"></i>Approve</button>
                                                        </form>
                                                        <form method="POST" action="" class="d-inline">
                                                            <input type="hidden" name="action" value="leave_action">
                                                            <input type="hidden" name="leave_id" value="<?= $lv['id'] ?>">
                                                            <input type="hidden" name="status" value="Rejected">
                                                            <button type="submit" class="btn btn-sm btn-danger fw-bold px-3 py-1 shadow-sm" onclick="return confirm('Reject leave request?')"><i class="fas fa-times me-1"></i>Reject</button>
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

        <!-- Balances Tab -->
        <div class="tab-pane fade" id="balances" role="tabpanel">
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-bordered table-hover align-middle mb-0 text-center">
                            <thead class="bg-light align-middle">
                                <tr class="text-muted small text-uppercase">
                                    <th rowspan="2" class="text-start ps-4">Employee</th>
                                    <th colspan="3" class="bg-primary-subtle text-primary border-primary-subtle">Casual Leave</th>
                                    <th colspan="3" class="bg-info-subtle text-info border-info-subtle">Sick Leave</th>
                                    <th colspan="3" class="bg-warning-subtle text-warning border-warning-subtle">Emergency Leave</th>
                                    <th colspan="3" class="bg-success-subtle text-success border-success-subtle">Paid Leave</th>
                                    <th colspan="3" class="bg-secondary-subtle text-secondary border-secondary-subtle">Alternative Leave</th>
                                </tr>
                                <tr class="text-muted" style="font-size:0.75rem;">
                                    <th>Total</th><th>Used</th><th>Rem</th>
                                    <th>Total</th><th>Used</th><th>Rem</th>
                                    <th>Total</th><th>Used</th><th>Rem</th>
                                    <th>Total</th><th>Used</th><th>Rem</th>
                                    <th>Total</th><th>Used</th><th>Rem</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($balances)): ?>
                                    <tr>
                                        <td colspan="13" class="text-center py-5 text-muted">No balances initialized for <?= $cur_year ?>.</td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($balances as $b): ?>
                                        <tr>
                                            <td class="text-start ps-4">
                                                <div class="fw-bold text-dark"><?= htmlspecialchars($b['full_name']) ?></div>
                                                <div class="text-muted small" style="font-size:0.75rem;"><?= htmlspecialchars($b['staff_id']) ?></div>
                                            </td>
                                            <td class="bg-light"><?= $b['casual_leave_limit'] ?></td>
                                            <td class="text-danger fw-bold"><?= $b['casual_leave_used'] ?></td>
                                            <td class="text-success fw-bold"><?= $b['casual_leave_limit'] - $b['casual_leave_used'] ?></td>
                                            
                                            <td class="bg-light"><?= $b['sick_leave_limit'] ?></td>
                                            <td class="text-danger fw-bold"><?= $b['sick_leave_used'] ?></td>
                                            <td class="text-success fw-bold"><?= $b['sick_leave_limit'] - $b['sick_leave_used'] ?></td>
                                            
                                            <td class="bg-light"><?= $b['emergency_leave_limit'] ?></td>
                                            <td class="text-danger fw-bold"><?= $b['emergency_leave_used'] ?></td>
                                            <td class="text-success fw-bold"><?= $b['emergency_leave_limit'] - $b['emergency_leave_used'] ?></td>
                                            
                                            <td class="bg-light"><?= $b['paid_leave_limit'] ?></td>
                                            <td class="text-danger fw-bold"><?= $b['paid_leave_used'] ?></td>
                                            <td class="text-success fw-bold"><?= $b['paid_leave_limit'] - $b['paid_leave_used'] ?></td>
                                            
                                            <td class="bg-light"><?= $b['alternative_leave_limit'] ?? 0 ?></td>
                                            <td class="text-danger fw-bold"><?= $b['alternative_leave_used'] ?? 0 ?></td>
                                            <td class="text-success fw-bold"><?= ($b['alternative_leave_limit'] ?? 0) - ($b['alternative_leave_used'] ?? 0) ?></td>
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
</div>

<!-- Leave Request Modal -->
<div class="modal fade" id="leaveRequestModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
            <form method="POST" action="">
                <input type="hidden" name="action" value="leave_request">
                <div class="modal-header bg-light border-0">
                    <h5 class="modal-title fw-bold text-dark"><i class="fas fa-file-signature text-primary me-2"></i>Apply for Leave</h5>
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
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Leave Type <span class="text-danger">*</span></label>
                        <select name="leave_type" class="form-select" required>
                            <option value="">Select Type</option>
                            <?php if ($enable_casual_leave == '1'): ?><option value="Casual leave">Casual leave</option><?php endif; ?>
                            <?php if ($enable_sick_leave == '1'): ?><option value="Sick leave">Sick leave</option><?php endif; ?>
                            <?php if ($enable_emergency_leave == '1'): ?><option value="Emergency leave">Emergency leave</option><?php endif; ?>
                            <?php if ($enable_paid_leave == '1'): ?><option value="Paid leave">Paid leave</option><?php endif; ?>
                            <option value="Unpaid leave">Unpaid leave</option>
                            <?php if ($enable_alternative_leave == '1'): ?><option value="Alternative Leave">Alternative Leave</option><?php endif; ?>
                        </select>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Start Date <span class="text-danger">*</span></label>
                            <input type="date" name="start_date" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">End Date <span class="text-danger">*</span></label>
                            <input type="date" name="end_date" class="form-control" required>
                        </div>
                    </div>
                    <div class="mb-0">
                        <label class="form-label text-muted small fw-bold">Reason / Note</label>
                        <textarea name="reason" class="form-control" rows="3" placeholder="Explain the reason for taking leave..."></textarea>
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
