<?php
// views/hr/hr_dashboard.php
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

$today = date('Y-m-d');
$year = date('Y');

// 1. Retrieve KPI Stats
$total_employees = $pdo->query("SELECT COUNT(*) FROM " . TBL_HR_EMPLOYEES . " WHERE employment_status = 'Active'")->fetchColumn();

// Present / Late / Leave counts for today
$present_today = $pdo->query("SELECT COUNT(*) FROM " . TBL_HR_ATTENDANCE . " WHERE date = '$today' AND status IN ('Present', 'Late', 'Half-day')")->fetchColumn();
$leave_today = $pdo->query("SELECT COUNT(*) FROM " . TBL_HR_ATTENDANCE . " WHERE date = '$today' AND status = 'Leave'")->fetchColumn();

// Calculate absent count today dynamically
$absent_today = 0;
$day_of_week = date('w'); // 5 = Friday
if ($day_of_week != 5) {
    $absent_today = $total_employees - $present_today - $leave_today;
    if ($absent_today < 0) $absent_today = 0;
}

$pending_leaves = $pdo->query("SELECT COUNT(*) FROM " . TBL_HR_LEAVES . " WHERE status = 'Pending'")->fetchColumn();
$pending_advances = $pdo->query("SELECT COUNT(*) FROM " . TBL_HR_ADVANCE_SALARIES . " WHERE status = 'Pending'")->fetchColumn();

// 2. Fetch logged-in user employee profile
$my_emp = safeFetch($pdo, "SELECT * FROM " . TBL_HR_EMPLOYEES . " WHERE staff_user_id = ? LIMIT 1", [$user_id]);
$my_attendance = null;
if ($my_emp) {
    $my_attendance = safeFetch($pdo, "SELECT * FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date = ?", [$my_emp['id'], $today]);
}

// 3. Fetch Recent Attendance Activity (Today's Logs)
$recent_attendance_query = "
    SELECT a.*, e.full_name, e.designation, e.photo, e.staff_id 
    FROM " . TBL_HR_ATTENDANCE . " a 
    JOIN " . TBL_HR_EMPLOYEES . " e ON a.employee_id = e.id 
    WHERE a.date = ? 
    ORDER BY a.id DESC LIMIT 5";
$recent_attendance = safeFetchAll($pdo, $recent_attendance_query, [$today]);

// 4. Fetch Pending Leave Requests
$pending_leaves_list_query = "
    SELECT l.*, e.full_name, e.designation, e.staff_id 
    FROM " . TBL_HR_LEAVES . " l 
    JOIN " . TBL_HR_EMPLOYEES . " e ON l.employee_id = e.id 
    WHERE l.status = 'Pending' 
    ORDER BY l.id ASC LIMIT 5";
$pending_leaves_list = safeFetchAll($pdo, $pending_leaves_list_query);
?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">HR & Payroll Dashboard</h1>
            <p class="text-muted small mb-0">Overview of staff statistics, attendance check-ins, and leave requests.</p>
        </div>
        <div class="text-end">
            <span class="badge bg-light text-dark shadow-sm border py-2 px-3 fw-bold">
                <i class="far fa-clock me-2 text-primary"></i><?= date('h:i A') ?>
            </span>
            <span class="badge bg-light text-dark shadow-sm border py-2 px-3 fw-bold ms-2">
                <i class="far fa-calendar-alt me-2 text-success"></i><?= date('d M, Y') ?>
            </span>
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

    <!-- KPI Metrics -->
    <div class="row g-3 mb-4">
        <!-- Active Employees -->
        <div class="col-6 col-md-3 col-xl-2">
            <div class="card border-0 text-white shadow-sm h-100" style="background: linear-gradient(135deg, #4dabf7 0%, #228be6 100%) !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Total Active</div>
                            <h3 class="mb-0 fw-bold"><?= $total_employees ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-users fa-lg"></i></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Today Present -->
        <div class="col-6 col-md-3 col-xl-2">
            <div class="card border-0 text-white shadow-sm h-100" style="background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%) !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Today Present</div>
                            <h3 class="mb-0 fw-bold"><?= $present_today ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-user-check fa-lg"></i></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Today Absent -->
        <div class="col-6 col-md-3 col-xl-2">
            <div class="card border-0 text-white shadow-sm h-100" style="background: linear-gradient(135deg, #ff8787 0%, #fa5252 100%) !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Today Absent</div>
                            <h3 class="mb-0 fw-bold"><?= $absent_today ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-user-times fa-lg"></i></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- On Leave -->
        <div class="col-6 col-md-3 col-xl-2">
            <div class="card border-0 text-white shadow-sm h-100" style="background: linear-gradient(135deg, #e599f7 0%, #cc5de8 100%) !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">On Leave</div>
                            <h3 class="mb-0 fw-bold"><?= $leave_today ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-calendar-minus fa-lg"></i></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Pending Leaves -->
        <div class="col-6 col-md-3 col-xl-2">
            <div class="card border-0 text-white shadow-sm h-100" style="background: linear-gradient(135deg, #ffc078 0%, #f59f00 100%) !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Leave Requests</div>
                            <h3 class="mb-0 fw-bold"><?= $pending_leaves ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-plane-departure fa-lg"></i></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Pending Advances -->
        <div class="col-6 col-md-3 col-xl-2">
            <div class="card border-0 text-white shadow-sm h-100" style="background: linear-gradient(135deg, #94d82d 0%, #74b816 100%) !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Salary Advances</div>
                            <h3 class="mb-0 fw-bold"><?= $pending_advances ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-hand-holding-usd fa-lg"></i></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="row g-4">
        <!-- Self Check-in Widget (if user has mapped profile) -->
        <div class="col-lg-4">
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-white border-0 py-3">
                    <h5 class="card-title mb-0 fw-bold"><i class="fas fa-business-time me-2 text-primary"></i>Attendance Board</h5>
                </div>
                <div class="card-body pt-0 pb-4 text-center">
                    <?php if ($my_emp): ?>
                        <div class="mb-4">
                            <div class="d-inline-block position-relative mb-3">
                                <?php if (!empty($my_emp['photo']) && file_exists(__DIR__ . '/../../' . $my_emp['photo'])): ?>
                                    <img src="<?= htmlspecialchars($my_emp['photo']) ?>" alt="Profile" class="rounded-circle shadow-sm border border-2 border-primary" style="width: 90px; height: 90px; object-fit: cover;">
                                <?php else: ?>
                                    <div class="rounded-circle bg-light border border-2 border-primary d-flex align-items-center justify-content-center shadow-sm" style="width: 90px; height: 90px;">
                                        <i class="fas fa-user-tie fa-3x text-secondary"></i>
                                    </div>
                                <?php endif; ?>
                            </div>
                            <h5 class="fw-bold mb-1"><?= htmlspecialchars($my_emp['full_name']) ?></h5>
                            <span class="badge bg-primary-subtle text-primary border border-primary-subtle mb-1"><?= htmlspecialchars($my_emp['designation']) ?></span>
                            <div class="text-muted small"><?= htmlspecialchars($my_emp['staff_id']) ?></div>
                        </div>

                        <!-- Check-in Status Display -->
                        <div class="d-flex justify-content-center bg-light rounded-3 p-3 mx-auto shadow-sm" style="max-width: 300px;">
                            <div class="px-3 border-end">
                                <div class="small text-muted mb-1 fw-bold">Check In</div>
                                <h5 class="fw-bold text-dark mb-0">
                                    <?= $my_attendance && $my_attendance['check_in'] ? date('h:i A', strtotime($my_attendance['check_in'])) : '--:--' ?>
                                    <?php if ($my_attendance && $my_attendance['status'] === 'Late'): ?>
                                        <br><span class="badge bg-warning text-dark mt-1" style="font-size:0.65rem;">Late</span>
                                    <?php endif; ?>
                                </h5>
                            </div>
                            <div class="px-3">
                                <div class="small text-muted mb-1 fw-bold">Check Out</div>
                                <h6 class="fw-bold text-dark mb-0"><?= $my_attendance && $my_attendance['check_out'] ? date('h:i A', strtotime($my_attendance['check_out'])) : '--:--' ?></h6>
                            </div>
                        </div>

                        <!-- Action Button -->
                        <?php if (!$my_attendance): ?>
                            <button id="btn-self-attendance" class="btn btn-lg btn-success w-100 py-3 shadow fw-bold border-0" style="background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%) !important;">
                                <i class="fas fa-sign-in-alt me-2"></i>Check-in Now
                            </button>
                        <?php elseif (empty($my_attendance['check_out'])): ?>
                            <button id="btn-self-attendance" class="btn btn-lg btn-danger w-100 py-3 shadow fw-bold border-0" style="background: linear-gradient(135deg, #ff8787 0%, #f03e3e 100%) !important;">
                                <i class="fas fa-sign-out-alt me-2"></i>Check-out Now
                            </button>
                        <?php else: ?>
                            <div class="alert alert-success border-0 shadow-sm mb-0">
                                <i class="fas fa-check-circle me-2"></i>You have completed attendance for today.
                                <div class="small mt-1 text-muted">Hours Worked: <strong><?= $my_attendance['working_hours'] ?> Hrs</strong></div>
                            </div>
                        <?php endif; ?>

                    <?php else: ?>
                        <!-- Staff Profile Not Linked -->
                        <div class="py-4">
                            <i class="fas fa-link-slash text-warning fa-3x mb-3"></i>
                            <h6 class="fw-bold text-dark">Self Attendance Disabled</h6>
                            <p class="text-muted small px-3">Your active administrator login account is not linked to any Employee Profile. Map your account in Employee Settings.</p>
                            <?php if (hasRole('Admin') || hasPermission('hr_manage_employees')): ?>
                                <a href="?tab=hr_employees" class="btn btn-sm btn-outline-primary mt-2">Map Employee Profiles</a>
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Policy Highlights -->
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white border-0 py-3">
                    <h5 class="card-title mb-0 fw-bold"><i class="fas fa-circle-info me-2 text-primary"></i>Rules & Policy Highlights</h5>
                </div>
                <div class="card-body pt-0 pb-4 small">
                    <ul class="list-group list-group-flush">
                        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-0 bg-transparent">
                            <span class="text-muted">Office Start Time</span>
                            <span class="fw-bold"><?= date('h:i A', strtotime(getHRPolicy($pdo, 'office_start_time', '09:00:00'))) ?></span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-0 bg-transparent">
                            <span class="text-muted">Late Grace Period</span>
                            <span class="fw-bold"><?= getHRPolicy($pdo, 'grace_time', '10') ?> Min</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-0 bg-transparent">
                            <span class="text-muted">Late Count limit before fine</span>
                            <span class="fw-bold badge bg-warning text-dark"><?= getHRPolicy($pdo, 'late_allowed', '3') ?> Days</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-0 bg-transparent">
                            <span class="text-muted">Late Fine (per 3 lates)</span>
                            <span class="fw-bold">৳<?= getHRPolicy($pdo, 'late_deduction_amount', '50') ?></span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-0 bg-transparent">
                            <span class="text-muted">Absent Fine</span>
                            <span class="fw-bold"><?= getHRPolicy($pdo, 'absent_deduction_percentage', '100') ?>% Basic / Day</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- Tables & Activity -->
        <div class="col-lg-8">
            <!-- Today's Attendance Activity -->
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center">
                    <h5 class="card-title mb-0 fw-bold"><i class="fas fa-clock-rotate-left me-2 text-primary"></i>Today's Attendance Logs</h5>
                    <a href="?tab=hr_attendance" class="btn btn-sm btn-outline-primary py-1 px-3 fw-bold rounded-pill">View All Logs</a>
                </div>
                <div class="card-body pt-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead>
                                <tr class="text-muted small">
                                    <th>Staff</th>
                                    <th>Designation</th>
                                    <th>Check In</th>
                                    <th>Check Out</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (!empty($recent_attendance)): ?>
                                    <?php foreach ($recent_attendance as $att): ?>
                                        <tr>
                                            <td>
                                                <div class="d-flex align-items-center">
                                                    <?php if (!empty($att['photo']) && file_exists(__DIR__ . '/../../' . $att['photo'])): ?>
                                                        <img src="<?= htmlspecialchars($att['photo']) ?>" alt="Pic" class="rounded-circle me-2" style="width: 35px; height: 35px; object-fit: cover;">
                                                    <?php else: ?>
                                                        <div class="rounded-circle bg-light d-flex align-items-center justify-content-center me-2 text-secondary" style="width: 35px; height: 35px;">
                                                            <i class="fas fa-user-circle"></i>
                                                        </div>
                                                    <?php endif; ?>
                                                    <div>
                                                        <div class="fw-bold text-dark mb-0"><?= htmlspecialchars($att['full_name']) ?></div>
                                                        <span class="text-muted small" style="font-size:0.75rem;"><?= htmlspecialchars($att['staff_id']) ?></span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td><span class="text-secondary small"><?= htmlspecialchars($att['designation']) ?></span></td>
                                            <td><div class="fw-bold small"><?= $att['check_in'] ? date('h:i A', strtotime($att['check_in'])) : '--:--' ?></div></td>
                                            <td><div class="fw-bold small"><?= $att['check_out'] ? date('h:i A', strtotime($att['check_out'])) : '--:--' ?></div></td>
                                            <td>
                                                <?php
                                                $badge = 'bg-success';
                                                if ($att['status'] === 'Late') $badge = 'bg-warning text-dark';
                                                elseif ($att['status'] === 'Absent') $badge = 'bg-danger';
                                                elseif ($att['status'] === 'Leave') $badge = 'bg-info text-dark';
                                                elseif ($att['status'] === 'Half-day') $badge = 'bg-secondary';
                                                ?>
                                                <span class="badge <?= $badge ?> rounded-pill font-monospace" style="font-size:0.75rem;"><?= $att['status'] ?></span>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <tr>
                                        <td colspan="5" class="text-center py-4 text-muted small">No check-ins logged today yet.</td>
                                    </tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Leave Requests Pending Action -->
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center">
                    <h5 class="card-title mb-0 fw-bold"><i class="fas fa-envelope-open-text me-2 text-primary"></i>Pending Leave Requests</h5>
                    <a href="?tab=hr_leaves" class="btn btn-sm btn-outline-primary py-1 px-3 fw-bold rounded-pill">Manage Leaves</a>
                </div>
                <div class="card-body pt-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead>
                                <tr class="text-muted small">
                                    <th>Staff</th>
                                    <th>Leave Type</th>
                                    <th>Duration</th>
                                    <th>Days</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (!empty($pending_leaves_list)): ?>
                                    <?php foreach ($pending_leaves_list as $lv): ?>
                                        <tr>
                                            <td>
                                                <div>
                                                    <div class="fw-bold text-dark mb-0"><?= htmlspecialchars($lv['full_name']) ?></div>
                                                    <span class="text-muted small" style="font-size:0.75rem;"><?= htmlspecialchars($lv['staff_id']) ?> - <?= htmlspecialchars($lv['designation']) ?></span>
                                                </div>
                                            </td>
                                            <td><span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle font-monospace"><?= htmlspecialchars($lv['leave_type']) ?></span></td>
                                            <td>
                                                <div class="small text-dark fw-bold"><?= date('d M', strtotime($lv['start_date'])) ?> - <?= date('d M, Y', strtotime($lv['end_date'])) ?></div>
                                            </td>
                                            <td class="fw-bold small"><?= $lv['total_days'] ?> Days</td>
                                            <td>
                                                <?php if (hasRole('Admin') || hasPermission('hr_manage_employees')): ?>
                                                    <div class="d-flex gap-1">
                                                        <form method="POST" action="">
                                                            <input type="hidden" name="action" value="leave_action">
                                                            <input type="hidden" name="leave_id" value="<?= $lv['id'] ?>">
                                                            <input type="hidden" name="status" value="Approved">
                                                            <button type="submit" class="btn btn-xs btn-success py-1 px-2 small border-0 text-white" style="font-size:0.75rem;" onclick="return confirm('Approve leave request?')">Approve</button>
                                                        </form>
                                                        <form method="POST" action="">
                                                            <input type="hidden" name="action" value="leave_action">
                                                            <input type="hidden" name="leave_id" value="<?= $lv['id'] ?>">
                                                            <input type="hidden" name="status" value="Rejected">
                                                            <button type="submit" class="btn btn-xs btn-danger py-1 px-2 small border-0 text-white" style="font-size:0.75rem;" onclick="return confirm('Reject leave request?')">Reject</button>
                                                        </form>
                                                    </div>
                                                <?php else: ?>
                                                    <span class="badge bg-warning text-dark">Pending</span>
                                                <?php endif; ?>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <tr>
                                        <td colspan="5" class="text-center py-4 text-muted small">No pending leave requests at this time.</td>
                                    </tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener("DOMContentLoaded", function() {
    const attBtn = document.getElementById("btn-self-attendance");
    if (attBtn) {
        attBtn.addEventListener("click", function() {
            attBtn.disabled = true;
            attBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
            
            // Call via AJAX
            fetch("index.php?action=self_check_in_out&ajax=1")
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert(data.message);
                        window.location.reload();
                    } else {
                        alert("Error: " + data.message);
                        attBtn.disabled = false;
                        attBtn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Retry';
                    }
                })
                .catch(err => {
                    alert("Network error processing attendance.");
                    attBtn.disabled = false;
                    attBtn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Retry';
                });
        });
    }
});
</script>
