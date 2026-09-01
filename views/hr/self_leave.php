<?php
// views/hr/self_leave.php
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

$my_emp_id = $emp_check['id'];

// Fetch My Leaves
$leaves = safeFetchAll($pdo, "SELECT * FROM " . TBL_HR_LEAVES . " WHERE employee_id = ? ORDER BY id DESC", [$my_emp_id]);

// Fetch Leave Balance
$current_year = date('Y');
$balance = safeFetch($pdo, "SELECT * FROM " . TBL_HR_LEAVE_BALANCES . " WHERE employee_id = ? AND year = ?", [$my_emp_id, $current_year]);

$types = [];
if (getHRPolicy($pdo, 'enable_casual_leave', '1') == '1') $types[] = 'Casual leave';
if (getHRPolicy($pdo, 'enable_sick_leave', '1') == '1') $types[] = 'Sick leave';
if (getHRPolicy($pdo, 'enable_emergency_leave', '1') == '1') $types[] = 'Emergency leave';
if (getHRPolicy($pdo, 'enable_paid_leave', '1') == '1') $types[] = 'Paid leave';
if (getHRPolicy($pdo, 'enable_alternative_leave', '1') == '1') $types[] = 'Alternative Leave';

$policy = [
    'Casual leave' => getHRPolicy($pdo, 'casual_leave_quota', '10'),
    'Sick leave' => getHRPolicy($pdo, 'sick_leave_quota', '10'),
    'Emergency leave' => getHRPolicy($pdo, 'emergency_leave_quota', '5'),
    'Paid leave' => getHRPolicy($pdo, 'paid_leave_quota', '10'),
    'Alternative Leave' => getHRPolicy($pdo, 'alternative_leave_quota', '0')
];
?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">My Leave Requests</h1>
            <p class="text-muted small mb-0">View your leave history and request new time off.</p>
        </div>
        <button class="btn btn-primary shadow-sm rounded-pill px-4" data-bs-toggle="modal" data-bs-target="#requestLeaveModal">
            <i class="fas fa-plus-circle me-2"></i> Request Leave
        </button>
    </div>

    <!-- Flash Messages -->
    <?php if (isset($_SESSION['flash_msg'])): ?>
        <div class="alert alert-success alert-dismissible fade show shadow-sm" role="alert">
            <i class="fas fa-check-circle me-2"></i> <?= $_SESSION['flash_msg'] ?>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
        <?php unset($_SESSION['flash_msg']); ?>
    <?php endif; ?>
    <?php if (isset($_SESSION['flash_error'])): ?>
        <div class="alert alert-danger alert-dismissible fade show shadow-sm" role="alert">
            <i class="fas fa-exclamation-circle me-2"></i> <?= $_SESSION['flash_error'] ?>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
        <?php unset($_SESSION['flash_error']); ?>
    <?php endif; ?>

    <!-- Leave Balances -->
    <div class="row g-3 mb-4">
        <?php foreach ($types as $type): 
            $col = strtolower(str_replace(' ', '_', $type)) . '_used';
            $used = $balance[$col] ?? 0;
            $limit = $policy[$type];
            $available = max(0, $limit - $used);
            $icon = 'fa-umbrella-beach text-info';
            if ($type == 'Sick leave') $icon = 'fa-procedures text-danger';
            elseif ($type == 'Emergency leave') $icon = 'fa-ambulance text-warning';
            elseif ($type == 'Alternative Leave') $icon = 'fa-exchange-alt text-success';
        ?>
        <div class="col-md-auto col-sm-6 flex-fill">
            <div class="card border-0 shadow-sm h-100 bg-white">
                <div class="card-body p-3 text-center">
                    <i class="fas <?= $icon ?> fa-2x mb-2 opacity-75"></i>
                    <h6 class="fw-bold mb-1" style="font-size:0.9rem;"><?= $type ?></h6>
                    <div class="small text-muted mb-2">Used: <span class="text-danger fw-bold"><?= floatval($used) ?></span> | Limit: <?= $limit ?: '∞' ?></div>
                    <div class="badge bg-light text-dark border w-100 rounded-pill">
                        Available: <?= $limit ? $available : 'Unlimited' ?>
                    </div>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>

    <!-- My Leaves List -->
    <div class="card border-0 shadow-sm">
        <div class="card-header bg-white border-bottom py-3">
            <h6 class="mb-0 fw-bold"><i class="fas fa-history text-primary me-2"></i> Leave History</h6>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 text-center">
                    <thead class="bg-light">
                        <tr class="text-muted small text-uppercase">
                            <th>Type</th>
                            <th>Date Range</th>
                            <th>Total Days</th>
                            <th>Reason</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($leaves)): ?>
                            <tr>
                                <td colspan="5" class="text-center py-5 text-muted">
                                    <i class="fas fa-box-open fa-3x mb-3 text-light"></i>
                                    <h5>No leave requests found</h5>
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($leaves as $lv): ?>
                                <tr>
                                    <td class="fw-bold text-dark"><?= htmlspecialchars($lv['leave_type']) ?></td>
                                    <td>
                                        <div class="small fw-semibold"><?= date('d M, Y', strtotime($lv['start_date'])) ?></div>
                                        <div class="small text-muted">to <?= date('d M, Y', strtotime($lv['end_date'])) ?></div>
                                    </td>
                                    <td><span class="badge bg-secondary rounded-pill"><?= floatval($lv['total_days']) ?> Days</span></td>
                                    <td><span class="small text-muted"><?= htmlspecialchars($lv['reason']) ?></span></td>
                                    <td>
                                        <?php
                                        $badge = 'bg-warning text-dark';
                                        if ($lv['status'] === 'Approved') $badge = 'bg-success';
                                        elseif ($lv['status'] === 'Rejected') $badge = 'bg-danger';
                                        ?>
                                        <span class="badge <?= $badge ?> rounded-pill font-monospace"><?= $lv['status'] ?></span>
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

<!-- Request Leave Modal -->
<div class="modal fade" id="requestLeaveModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
            <form action="index.php?action=leave_request" method="POST">
                <input type="hidden" name="employee_id" value="<?= $my_emp_id ?>">
                <input type="hidden" name="from_self" value="1">
                <div class="modal-header bg-light border-bottom-0">
                    <h5 class="modal-title fw-bold"><i class="fas fa-plus-circle text-primary me-2"></i> Request Leave</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-4">
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Leave Type <span class="text-danger">*</span></label>
                        <select name="leave_type" class="form-select shadow-sm" required>
                            <option value="">Select Type</option>
                            <?php foreach ($types as $t): ?>
                                <option value="<?= $t ?>"><?= $t ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Start Date <span class="text-danger">*</span></label>
                            <input type="date" name="start_date" class="form-control shadow-sm" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">End Date <span class="text-danger">*</span></label>
                            <input type="date" name="end_date" class="form-control shadow-sm" required>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Reason for Leave <span class="text-danger">*</span></label>
                        <textarea name="reason" class="form-control shadow-sm" rows="3" placeholder="Briefly describe why you need this leave..." required></textarea>
                    </div>
                    
                    <div class="alert alert-info py-2 small mb-0 mt-3">
                        <i class="fas fa-info-circle me-1"></i> Alternative Leave is for requesting off days against duties performed on off days or holidays.
                    </div>
                </div>
                <div class="modal-footer bg-light border-top-0">
                    <button type="button" class="btn btn-secondary px-4 rounded-pill shadow-sm" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary px-4 rounded-pill shadow-sm"><i class="fas fa-paper-plane me-1"></i> Submit Request</button>
                </div>
            </form>
        </div>
    </div>
</div>
