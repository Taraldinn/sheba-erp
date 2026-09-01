<?php
// views/hr/self_profile.php
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

// Fetch Employee Profile
$emp = safeFetch($pdo, "SELECT * FROM " . TBL_HR_EMPLOYEES . " WHERE id = ?", [$my_emp_id]);

// Fetch Attendance Log for current month
$filter_month = $_GET['filter_month'] ?? date('Y-m');
$start_date = $filter_month . '-01';
$end_date = date('Y-m-t', strtotime($start_date));

$query = "
    SELECT * FROM " . TBL_HR_ATTENDANCE . " 
    WHERE employee_id = ? AND date BETWEEN ? AND ? 
    ORDER BY date DESC
";
$logs = safeFetchAll($pdo, $query, [$my_emp_id, $start_date, $end_date]);

?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">My Profile & Attendance</h1>
            <p class="text-muted small mb-0">View your personal information and daily attendance log.</p>
        </div>
    </div>

    <!-- Profile Overview Card -->
    <div class="card border-0 shadow-sm mb-4" style="background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);">
        <div class="card-body">
            <div class="row align-items-center">
                <div class="col-md-3 text-center border-end">
                    <?php if (!empty($emp['photo']) && file_exists(__DIR__ . '/../../' . $emp['photo'])): ?>
                        <img src="<?= htmlspecialchars($emp['photo']) ?>" alt="Profile" class="rounded-circle shadow-sm border border-3 border-primary mb-3" style="width: 120px; height: 120px; object-fit: cover;">
                    <?php else: ?>
                        <div class="rounded-circle bg-white border border-3 border-primary d-flex align-items-center justify-content-center shadow-sm mx-auto mb-3" style="width: 120px; height: 120px;">
                            <i class="fas fa-user-tie fa-4x text-secondary"></i>
                        </div>
                    <?php endif; ?>
                    <h5 class="fw-bold mb-1"><?= htmlspecialchars($emp['full_name']) ?></h5>
                    <span class="badge bg-primary rounded-pill"><?= htmlspecialchars($emp['designation']) ?></span>
                </div>
                <div class="col-md-9 ps-md-4 mt-4 mt-md-0">
                    <h6 class="fw-bold text-secondary mb-3 border-bottom pb-2"><i class="fas fa-info-circle me-2"></i> Employee Details</h6>
                    <div class="row g-3">
                        <div class="col-sm-6">
                            <div class="small text-muted fw-bold">Employee ID</div>
                            <div class="fw-semibold text-dark"><?= htmlspecialchars($emp['staff_id']) ?></div>
                        </div>
                        <div class="col-sm-6">
                            <div class="small text-muted fw-bold">Joining Date</div>
                            <div class="fw-semibold text-dark"><?= !empty($emp['joining_date']) ? date('d M, Y', strtotime($emp['joining_date'])) : '--' ?></div>
                        </div>
                        <div class="col-sm-6">
                            <div class="small text-muted fw-bold">Phone Number</div>
                            <div class="fw-semibold text-dark"><i class="fas fa-phone-alt me-1 text-success"></i> <?= htmlspecialchars($emp['phone1'] ?? 'N/A') ?></div>
                        </div>
                        <div class="col-sm-6">
                            <div class="small text-muted fw-bold">Email Address</div>
                            <div class="fw-semibold text-dark"><i class="fas fa-envelope me-1 text-danger"></i> <?= htmlspecialchars($emp['email'] ?? 'N/A') ?></div>
                        </div>
                        <div class="col-sm-6">
                            <div class="small text-muted fw-bold">Duty Shift</div>
                            <div class="fw-semibold text-dark"><i class="fas fa-clock me-1 text-warning"></i> <?= !empty($emp['shift_start_time']) ? date('h:i A', strtotime($emp['shift_start_time'])) : '09:00 AM' ?> - <?= !empty($emp['shift_end_time']) ? date('h:i A', strtotime($emp['shift_end_time'])) : '05:00 PM' ?></div>
                        </div>
                        <div class="col-sm-6">
                            <div class="small text-muted fw-bold">Department</div>
                            <div class="fw-semibold text-dark"><i class="fas fa-building me-1 text-primary"></i> <?= htmlspecialchars($emp['department']) ?></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Filter Logs -->
    <div class="card border-0 shadow-sm mb-4">
        <div class="card-body bg-light rounded">
            <form method="GET" action="" class="row g-3 align-items-center">
                <input type="hidden" name="tab" value="self_profile">
                <div class="col-md-4">
                    <label class="form-label text-muted small fw-bold">View Log For Month</label>
                    <input type="month" name="filter_month" class="form-control shadow-sm submit-on-change" value="<?= htmlspecialchars($filter_month) ?>">
                </div>
            </form>
        </div>
    </div>

    <!-- Personal Attendance Log -->
    <div class="card border-0 shadow-sm">
        <div class="card-header bg-white border-bottom py-3">
            <h6 class="mb-0 fw-bold"><i class="fas fa-calendar-check text-primary me-2"></i> Attendance Log - <?= date('F Y', strtotime($start_date)) ?></h6>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 text-center">
                    <thead class="bg-light">
                        <tr class="text-muted small text-uppercase">
                            <th class="text-start ps-4">Date</th>
                            <th>Check In</th>
                            <th>Check Out</th>
                            <th>Working Hours</th>
                            <th>Status</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($logs)): ?>
                            <tr>
                                <td colspan="6" class="text-center py-5 text-muted">
                                    <i class="fas fa-search fa-3x mb-3 text-light"></i>
                                    <h5>No attendance logs found for this month</h5>
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($logs as $log): ?>
                                <tr>
                                    <td class="text-start ps-4 fw-bold text-dark"><?= date('l, d M Y', strtotime($log['date'])) ?></td>
                                    <td>
                                        <?php if ($log['check_in']): ?>
                                            <span class="fw-bold text-success"><i class="fas fa-arrow-right-to-bracket me-1"></i> <?= date('h:i A', strtotime($log['check_in'])) ?></span>
                                        <?php else: ?>
                                            <span class="text-muted">--:--</span>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?php if ($log['check_out']): ?>
                                            <span class="fw-bold text-danger"><i class="fas fa-arrow-right-from-bracket me-1"></i> <?= date('h:i A', strtotime($log['check_out'])) ?></span>
                                        <?php else: ?>
                                            <span class="text-muted">--:--</span>
                                        <?php endif; ?>
                                    </td>
                                    <td><span class="fw-bold"><?= $log['working_hours'] ?></span> <span class="small text-muted">Hrs</span></td>
                                    <td>
                                        <?php
                                        $badge = 'bg-success';
                                        if ($log['status'] === 'Late') $badge = 'bg-warning text-dark';
                                        elseif ($log['status'] === 'Absent') $badge = 'bg-danger';
                                        elseif ($log['status'] === 'Leave') $badge = 'bg-info text-dark';
                                        elseif ($log['status'] === 'Half-day') $badge = 'bg-secondary';
                                        ?>
                                        <span class="badge <?= $badge ?> rounded-pill font-monospace" style="font-size:0.75rem;"><?= $log['status'] ?></span>
                                    </td>
                                    <td><span class="small text-muted"><?= htmlspecialchars($log['note'] ?? '--') ?></span></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.submit-on-change').forEach(el => {
        el.addEventListener('change', function() {
            this.form.submit();
        });
    });
});
</script>

