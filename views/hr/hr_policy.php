<?php
// views/hr/hr_policy.php
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

$grace_time = getHRPolicy($pdo, 'grace_time', '10');
$late_allowed = getHRPolicy($pdo, 'late_allowed', '3');
$late_deduction_amount = getHRPolicy($pdo, 'late_deduction_amount', '50');
$late_count_salary_deduct = getHRPolicy($pdo, 'late_count_salary_deduct', '6');
$absent_deduction_percentage = getHRPolicy($pdo, 'absent_deduction_percentage', '100');
$half_day_deduction_percentage = getHRPolicy($pdo, 'half_day_deduction_percentage', '50');
$office_start_time = getHRPolicy($pdo, 'office_start_time', '09:00:00');
$office_ip_address = getHRPolicy($pdo, 'office_ip_address', '');
$min_checkout_hours = getHRPolicy($pdo, 'min_checkout_hours', '3');

$casual_leave_quota = getHRPolicy($pdo, 'casual_leave_quota', '10');
$sick_leave_quota = getHRPolicy($pdo, 'sick_leave_quota', '10');
$emergency_leave_quota = getHRPolicy($pdo, 'emergency_leave_quota', '5');
$paid_leave_quota = getHRPolicy($pdo, 'paid_leave_quota', '10');
$alternative_leave_quota = getHRPolicy($pdo, 'alternative_leave_quota', '0');

$enable_casual_leave = getHRPolicy($pdo, 'enable_casual_leave', '1');
$enable_sick_leave = getHRPolicy($pdo, 'enable_sick_leave', '1');
$enable_emergency_leave = getHRPolicy($pdo, 'enable_emergency_leave', '1');
$enable_paid_leave = getHRPolicy($pdo, 'enable_paid_leave', '1');
$enable_alternative_leave = getHRPolicy($pdo, 'enable_alternative_leave', '1');

$weekly_off_day = getHRPolicy($pdo, 'weekly_off_day', 'Friday');
$pf_percentage = getHRPolicy($pdo, 'pf_percentage', '0');
$festival_bonus_percentage = getHRPolicy($pdo, 'festival_bonus_percentage', '0');
$annual_bonus_percentage = getHRPolicy($pdo, 'annual_bonus_percentage', '0');

$hr_attendance_api_key = getHRPolicy($pdo, 'hr_attendance_api_key', '');

// Fetch Public Holidays
$holidays = [];
try {
    $holidays = $pdo->query("SELECT * FROM " . TBL_HR_HOLIDAYS . " ORDER BY holiday_date ASC")->fetchAll();
} catch (PDOException $e) {
    // Table might not be ready yet
}
?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">Company Policy</h1>
            <p class="text-muted small mb-0">Configure rules for late attendance, grace periods, and absence deductions.</p>
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

    <div class="row g-4">
        <div class="col-xl-8 col-lg-10">
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white border-0 py-3">
                    <h5 class="card-title mb-0 fw-bold"><i class="fas fa-cogs text-primary me-2"></i>Global HR Rules</h5>
                </div>
                <div class="card-body px-4 pb-4">
                    <form method="POST" action="">
                        <input type="hidden" name="action" value="policy_update">
                        
                        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-clock text-secondary me-2"></i>Office Timing</h6>
                        <div class="row g-3 mb-4">
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Office Start Time</label>
                                <input type="time" name="office_start_time" class="form-control" value="<?= htmlspecialchars($office_start_time) ?>" required>
                                <div class="form-text small">Standard starting time for all employees.</div>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Late Grace Time (Minutes)</label>
                                <input type="number" name="grace_time" class="form-control" value="<?= htmlspecialchars($grace_time) ?>" required>
                                <div class="form-text small">e.g., 10 minutes. Arriving after 09:10 will mark as Late.</div>
                            </div>
                        </div>
                        
                        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-network-wired text-secondary me-2"></i>Attendance Restrictions</h6>
                        <div class="row g-3 mb-4">
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Office Public IP Address</label>
                                <input type="text" name="office_ip_address" class="form-control" value="<?= htmlspecialchars($office_ip_address) ?>">
                                <div class="form-text small">Restrict attendance check-ins to this IP (e.g. 103.123.45.67). Leave empty to allow any IP.</div>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Min Work Hours Before Checkout</label>
                                <input type="number" step="0.1" name="min_checkout_hours" class="form-control" value="<?= htmlspecialchars($min_checkout_hours) ?>" required>
                                <div class="form-text small">e.g., 3. Employees cannot check out before this many hours.</div>
                            </div>
                        </div>

                        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-money-bill-wave text-secondary me-2"></i>Late Deduction Rules</h6>
                        <div class="row g-3 mb-4">
                            <div class="col-md-4">
                                <label class="form-label text-muted small fw-bold">Allowed Late Days</label>
                                <input type="number" name="late_allowed" class="form-control" value="<?= htmlspecialchars($late_allowed) ?>" required>
                                <div class="form-text small">Number of late days before fixed fine. e.g., 3</div>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label text-muted small fw-bold">Fine Amount (৳)</label>
                                <input type="number" step="0.01" name="late_deduction_amount" class="form-control" value="<?= htmlspecialchars($late_deduction_amount) ?>" required>
                                <div class="form-text small">Fine deducted per limit crossed. e.g., ৳50</div>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label text-muted small fw-bold">1-Day Salary Cut Trigger</label>
                                <input type="number" name="late_count_salary_deduct" class="form-control" value="<?= htmlspecialchars($late_count_salary_deduct) ?>" required>
                                <div class="form-text small">Number of late days to deduct 1 day basic. e.g., 6</div>
                            </div>
                        </div>

                        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-calendar-alt text-secondary me-2"></i>Default Annual Leave Quotas</h6>
                        <div class="row g-3 mb-4">
                            <div class="col-md-4">
                                <label class="form-label text-muted small fw-bold">Casual Leave (Days)</label>
                                <input type="number" name="casual_leave_quota" class="form-control" value="<?= htmlspecialchars($casual_leave_quota) ?>" required>
                                <div class="form-check mt-1">
                                    <input type="hidden" name="enable_casual_leave" value="0">
                                    <input class="form-check-input" type="checkbox" name="enable_casual_leave" value="1" id="enable_casual_leave" <?= $enable_casual_leave == '1' ? 'checked' : '' ?>>
                                    <label class="form-check-label small" for="enable_casual_leave">Enable Casual Leave</label>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label text-muted small fw-bold">Sick Leave (Days)</label>
                                <input type="number" name="sick_leave_quota" class="form-control" value="<?= htmlspecialchars($sick_leave_quota) ?>" required>
                                <div class="form-check mt-1">
                                    <input type="hidden" name="enable_sick_leave" value="0">
                                    <input class="form-check-input" type="checkbox" name="enable_sick_leave" value="1" id="enable_sick_leave" <?= $enable_sick_leave == '1' ? 'checked' : '' ?>>
                                    <label class="form-check-label small" for="enable_sick_leave">Enable Sick Leave</label>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label text-muted small fw-bold">Emergency Leave (Days)</label>
                                <input type="number" name="emergency_leave_quota" class="form-control" value="<?= htmlspecialchars($emergency_leave_quota) ?>" required>
                                <div class="form-check mt-1">
                                    <input type="hidden" name="enable_emergency_leave" value="0">
                                    <input class="form-check-input" type="checkbox" name="enable_emergency_leave" value="1" id="enable_emergency_leave" <?= $enable_emergency_leave == '1' ? 'checked' : '' ?>>
                                    <label class="form-check-label small" for="enable_emergency_leave">Enable Emergency Leave</label>
                                </div>
                            </div>
                            <div class="col-md-6 mt-3">
                                <label class="form-label text-muted small fw-bold">Paid Leave / Earned Leave (Days)</label>
                                <input type="number" name="paid_leave_quota" class="form-control" value="<?= htmlspecialchars($paid_leave_quota) ?>" required>
                                <div class="form-check mt-1">
                                    <input type="hidden" name="enable_paid_leave" value="0">
                                    <input class="form-check-input" type="checkbox" name="enable_paid_leave" value="1" id="enable_paid_leave" <?= $enable_paid_leave == '1' ? 'checked' : '' ?>>
                                    <label class="form-check-label small" for="enable_paid_leave">Enable Paid Leave</label>
                                </div>
                            </div>
                            <div class="col-md-6 mt-3">
                                <label class="form-label text-muted small fw-bold">Alternative Leave (Days)</label>
                                <input type="number" name="alternative_leave_quota" class="form-control" value="<?= htmlspecialchars($alternative_leave_quota) ?>" required>
                                <div class="form-check mt-1">
                                    <input type="hidden" name="enable_alternative_leave" value="0">
                                    <input class="form-check-input" type="checkbox" name="enable_alternative_leave" value="1" id="enable_alternative_leave" <?= $enable_alternative_leave == '1' ? 'checked' : '' ?>>
                                    <label class="form-check-label small" for="enable_alternative_leave">Enable Alternative Leave</label>
                                </div>
                            </div>
                        </div>

                        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-user-times text-secondary me-2"></i>Absence & Leave Deduction Rules</h6>
                        <div class="row g-3 mb-4">
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Full Absent Deduction (%)</label>
                                <div class="input-group">
                                    <input type="number" name="absent_deduction_percentage" class="form-control" value="<?= htmlspecialchars($absent_deduction_percentage) ?>" required>
                                    <span class="input-group-text">% of Daily Basic</span>
                                </div>
                                <div class="form-text small">Normally 100% (deducts 1 day salary).</div>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Half-Day Deduction (%)</label>
                                <div class="input-group">
                                    <input type="number" name="half_day_deduction_percentage" class="form-control" value="<?= htmlspecialchars($half_day_deduction_percentage) ?>" required>
                                    <span class="input-group-text">% of Daily Basic</span>
                                </div>
                                <div class="form-text small">Normally 50% (deducts half day salary).</div>
                            </div>
                        </div>

                        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3"><i class="fas fa-calendar-week text-secondary me-2"></i>Weekly Holiday & Bonus Rules</h6>
                        <div class="row g-3 mb-4">
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Weekly Off Day</label>
                                <select name="weekly_off_day" class="form-select">
                                    <?php
                                    $days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
                                    foreach ($days as $d) {
                                        $sel = ($weekly_off_day === $d) ? 'selected' : '';
                                        echo "<option value=\"$d\" $sel>$d</option>";
                                    }
                                    ?>
                                </select>
                                <div class="form-text small">Absences on this day are automatically ignored.</div>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Provident Fund (PF) Deduction (%)</label>
                                <div class="input-group">
                                    <input type="number" step="0.1" name="pf_percentage" class="form-control" value="<?= htmlspecialchars($pf_percentage) ?>" required>
                                    <span class="input-group-text">% of Basic</span>
                                </div>
                                <div class="form-text small">Deducted from monthly salary if > 0.</div>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Festival Bonus (%)</label>
                                <div class="input-group">
                                    <input type="number" step="0.1" name="festival_bonus_percentage" class="form-control" value="<?= htmlspecialchars($festival_bonus_percentage) ?>" required>
                                    <span class="input-group-text">% of Basic</span>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label text-muted small fw-bold">Annual Bonus (%)</label>
                                <div class="input-group">
                                    <input type="number" step="0.1" name="annual_bonus_percentage" class="form-control" value="<?= htmlspecialchars($annual_bonus_percentage) ?>" required>
                                    <span class="input-group-text">% of Basic</span>
                                </div>
                            </div>
                        </div>

                        <?php if (hasRole('Admin') || hasPermission('hr_policy')): ?>
                            <div class="text-end border-top pt-3 mt-4">
                                <button type="submit" class="btn btn-primary fw-bold px-4 shadow-sm" onclick="return confirm('Are you sure you want to update the HR Policy? This will affect upcoming payroll generations.');">
                                    <i class="fas fa-save me-2"></i>Save Policy Rules
                                </button>
                            </div>
                        <?php else: ?>
                            <div class="alert alert-warning mt-4 small border-0 mb-0">
                                <i class="fas fa-lock me-2"></i>You do not have permission to change these settings.
                            </div>
                        <?php endif; ?>
                    </form>
                </div>
            </div>
        </div>
        
        <div class="col-xl-4 col-lg-12">
            <!-- Biometric API Settings -->
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-white border-0 py-3">
                    <h5 class="card-title mb-0 fw-bold"><i class="fas fa-fingerprint text-success me-2"></i>Biometric API Setup</h5>
                </div>
                <div class="card-body">
                    <p class="small text-muted mb-3">Connect ZKTeco or other biometric devices to automatically sync attendance logs.</p>
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-dark">API Endpoint URL</label>
                        <div class="input-group input-group-sm shadow-sm">
                            <?php 
                                $scheme = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
                                $host = $_SERVER['HTTP_HOST'];
                                $api_url = $scheme . '://' . $host . '/api/attendance.php';
                            ?>
                            <input type="text" class="form-control bg-light" value="<?= htmlspecialchars($api_url) ?>" readonly id="apiUrlStr">
                            <button class="btn btn-outline-secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('apiUrlStr').value); alert('Copied!');"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>
                    
                    <form method="POST" action="">
                        <input type="hidden" name="action" value="save_api_key">
                        <div class="mb-2">
                            <label class="form-label small fw-bold text-dark">Secret API Key</label>
                            <input type="text" name="hr_attendance_api_key" class="form-control form-control-sm" value="<?= htmlspecialchars($hr_attendance_api_key) ?>" placeholder="Generate or enter a strong key">
                        </div>
                        <?php if (hasRole('Admin') || hasPermission('hr_policy')): ?>
                            <div class="d-flex gap-2 mt-3">
                                <button type="button" class="btn btn-sm btn-outline-primary flex-fill fw-bold" onclick="document.getElementsByName('hr_attendance_api_key')[0].value = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');">Generate Random</button>
                                <button type="submit" class="btn btn-sm btn-success flex-fill fw-bold">Save Key</button>
                            </div>
                        <?php endif; ?>
                    </form>
                </div>
            </div>

            <!-- Public Holidays Manager -->
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-white border-0 py-3">
                    <h5 class="card-title mb-0 fw-bold"><i class="fas fa-calendar-day text-primary me-2"></i>Public & Govt. Holidays</h5>
                </div>
                <div class="card-body">
                    <?php if (hasRole('Admin') || hasPermission('hr_policy')): ?>
                    <form method="POST" action="" class="mb-4 bg-light p-3 rounded-3 border">
                        <input type="hidden" name="action" value="add_holiday">
                        <div class="mb-2">
                            <label class="form-label small fw-bold text-muted">Holiday Name</label>
                            <input type="text" name="holiday_name" class="form-control form-control-sm" placeholder="e.g. Eid-ul-Fitr" required>
                        </div>
                        <div class="mb-2">
                            <label class="form-label small fw-bold text-muted">Date</label>
                            <input type="date" name="holiday_date" class="form-control form-control-sm" required>
                        </div>
                        <button type="submit" class="btn btn-sm btn-primary w-100 fw-bold mt-1">Add Holiday</button>
                    </form>
                    <?php endif; ?>

                    <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                        <table class="table table-sm table-hover mb-0">
                            <thead class="table-light sticky-top">
                                <tr>
                                    <th>Date</th>
                                    <th>Holiday</th>
                                    <th class="text-end">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (!empty($holidays)): ?>
                                    <?php foreach ($holidays as $h): ?>
                                        <tr>
                                            <td class="fw-bold text-dark" style="font-size:0.85rem;"><?= date('d M, Y', strtotime($h['holiday_date'])) ?></td>
                                            <td style="font-size:0.85rem;"><?= htmlspecialchars($h['holiday_name']) ?></td>
                                            <td class="text-end">
                                                <?php if (hasRole('Admin') || hasPermission('hr_policy')): ?>
                                                <form method="POST" action="" onsubmit="return confirm('Delete this holiday?');" style="display:inline;">
                                                    <input type="hidden" name="action" value="delete_holiday">
                                                    <input type="hidden" name="holiday_id" value="<?= $h['id'] ?>">
                                                    <button type="submit" class="btn btn-sm btn-outline-danger py-0 px-1"><i class="fas fa-trash-alt"></i></button>
                                                </form>
                                                <?php endif; ?>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <tr>
                                        <td colspan="3" class="text-muted small text-center py-3">No public holidays configured.</td>
                                    </tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="card border-0 shadow-sm mb-4" style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);">
                <div class="card-body text-center p-4">
                    <i class="fas fa-shield-alt fa-3x text-secondary mb-3 opacity-50"></i>
                    <h5 class="fw-bold text-dark">Automated Calculations</h5>
                    <p class="small text-muted mb-0">The system uses these values dynamically when you click "Generate Payroll". It evaluates attendance records, leaves, and absences accurately to compute auto-deductions.</p>
                </div>
            </div>
        </div>
    </div>
</div>
