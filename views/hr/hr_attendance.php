<?php
// views/hr/hr_attendance.php
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

$employees = safeFetchAll($pdo, "SELECT id, full_name, staff_id FROM " . TBL_HR_EMPLOYEES . " ORDER BY full_name ASC");

$filter_month = $_GET['filter_month'] ?? date('Y-m');
$filter_emp = intval($_GET['filter_emp'] ?? 0);

$start_date = $filter_month . '-01';
$end_date = date('Y-m-t', strtotime($start_date));

$where = "a.date BETWEEN ? AND ?";
$params = [$start_date, $end_date];

if ($filter_emp > 0) {
    $where .= " AND a.employee_id = ?";
    $params[] = $filter_emp;
}

$query = "
    SELECT a.*, e.full_name, e.staff_id, e.designation, e.photo 
    FROM " . TBL_HR_ATTENDANCE . " a 
    JOIN " . TBL_HR_EMPLOYEES . " e ON a.employee_id = e.id 
    WHERE $where 
    ORDER BY a.date DESC, e.full_name ASC
";
$logs = safeFetchAll($pdo, $query, $params);
?>

<div class="container-fluid px-0">
    <div class="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">Attendance Logs</h1>
            <p class="text-muted small mb-0">View and manage employee daily check-ins.</p>
        </div>
        <?php if (hasRole('Admin') || hasPermission('hr_attendance')): ?>
            <button type="button"
                    class="btn btn-primary fw-bold rounded-pill px-4 shadow-sm"
                    style="white-space: nowrap;"
                    data-bs-toggle="modal"
                    data-bs-target="#manualAttendanceModal">
                <i class="fas fa-plus-circle me-2"></i>Manual Log
            </button>
        <?php endif; ?>
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

    <!-- Filter Card -->
    <div class="card border-0 shadow-sm mb-4">
        <div class="card-body">
            <form method="GET" action="" class="row g-3 align-items-end">
                <input type="hidden" name="tab" value="hr_attendance">
                <div class="col-md-4">
                    <label class="form-label text-muted small fw-bold">Filter by Month</label>
                    <input type="month" name="filter_month" class="form-control" value="<?= htmlspecialchars($filter_month) ?>">
                </div>
                <div class="col-md-5">
                    <label class="form-label text-muted small fw-bold">Filter by Employee</label>
                    <select name="filter_emp" class="form-select">
                        <option value="0">All Employees</option>
                        <?php foreach ($employees as $emp): ?>
                            <option value="<?= $emp['id'] ?>" <?= $filter_emp == $emp['id'] ? 'selected' : '' ?>>
                                <?= htmlspecialchars($emp['full_name']) ?> (<?= htmlspecialchars($emp['staff_id']) ?>)
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="col-md-3">
                    <button type="submit" class="btn btn-primary w-100 fw-bold"><i class="fas fa-search me-2"></i>Filter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Logs Table -->
    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light">
                        <tr class="text-muted small text-uppercase">
                            <th class="ps-4">Date</th>
                            <th>Employee</th>
                            <th>Check In</th>
                            <th>Check Out</th>
                            <th>Hours</th>
                            <th>Status</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($logs)): ?>
                            <tr>
                                <td colspan="7" class="text-center py-5 text-muted">
                                    <i class="fas fa-search fa-3x mb-3 text-light"></i>
                                    <h5>No records found</h5>
                                    <p class="small">Try adjusting your filters.</p>
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($logs as $log): ?>
                                <tr>
                                    <td class="ps-4 fw-bold text-dark"><?= date('d M, Y', strtotime($log['date'])) ?></td>
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <?php if (!empty($log['photo']) && file_exists(__DIR__ . '/../../' . $log['photo'])): ?>
                                                <img src="<?= htmlspecialchars($log['photo']) ?>" alt="Pic" class="rounded-circle me-2" style="width: 35px; height: 35px; object-fit: cover;">
                                            <?php else: ?>
                                                <div class="rounded-circle bg-light d-flex align-items-center justify-content-center me-2 text-secondary" style="width: 35px; height: 35px;">
                                                    <i class="fas fa-user-circle"></i>
                                                </div>
                                            <?php endif; ?>
                                            <div>
                                                <div class="fw-bold text-dark mb-0"><?= htmlspecialchars($log['full_name']) ?></div>
                                                <span class="text-muted small" style="font-size:0.75rem;"><?= htmlspecialchars($log['staff_id']) ?> - <?= htmlspecialchars($log['designation']) ?></span>
                                            </div>
                                        </div>
                                    </td>
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
                                    <td><span class="small text-muted"><?= htmlspecialchars($log['note'] ?? '') ?></span></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Manual Attendance Modal -->
<div class="modal fade" id="manualAttendanceModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
            <form method="POST" action="">
                <input type="hidden" name="action" value="manual_attendance">
                <div class="modal-header bg-light border-0">
                    <h5 class="modal-title fw-bold text-dark"><i class="fas fa-pen-to-square text-primary me-2"></i>Add / Edit Manual Log</h5>
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
                        <label class="form-label text-muted small fw-bold">Date <span class="text-danger">*</span></label>
                        <input type="date" name="date" class="form-control" value="<?= date('Y-m-d') ?>" required>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Check In Time</label>
                            <input type="time" name="check_in" class="form-control">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Check Out Time</label>
                            <input type="time" name="check_out" class="form-control">
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Status <span class="text-danger">*</span></label>
                        <select name="status" class="form-select" required>
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                            <option value="Late">Late</option>
                            <option value="Half-day">Half-day</option>
                            <option value="Leave">Leave</option>
                            <option value="Holiday">Holiday</option>
                        </select>
                    </div>
                    <div class="mb-0">
                        <label class="form-label text-muted small fw-bold">Note / Reason</label>
                        <textarea name="note" class="form-control" rows="2" placeholder="Optional details..."></textarea>
                    </div>
                </div>
                <div class="modal-footer border-0 bg-light">
                    <button type="button" class="btn btn-secondary px-4 fw-bold" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary px-4 fw-bold"><i class="fas fa-save me-2"></i>Save Record</button>
                </div>
            </form>
        </div>
    </div>
</div>
