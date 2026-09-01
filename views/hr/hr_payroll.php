<?php
// views/hr/hr_payroll.php
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

$salary_month = $_GET['salary_month'] ?? date('Y-m');

$query = "
    SELECT p.*, e.full_name, e.staff_id, e.designation, e.photo 
    FROM " . TBL_HR_PAYROLL . " p 
    JOIN " . TBL_HR_EMPLOYEES . " e ON p.employee_id = e.id 
    WHERE p.salary_month = ?
    ORDER BY e.full_name ASC
";
$payrolls = safeFetchAll($pdo, $query, [$salary_month]);
?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">Payroll & Salary</h1>
            <p class="text-muted small mb-0">Generate monthly salaries, apply bonuses/fines, and process payouts.</p>
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

    <!-- Generator & Filter Card -->
    <div class="card border-0 shadow-sm mb-4">
        <div class="card-body bg-light rounded">
            <div class="row align-items-center">
                <div class="col-md-6">
                    <form method="GET" action="" class="d-flex gap-2">
                        <input type="hidden" name="tab" value="hr_payroll">
                        <div class="input-group shadow-sm">
                            <span class="input-group-text bg-white border-end-0 text-muted"><i class="fas fa-calendar-alt"></i></span>
                            <input type="month" name="salary_month" class="form-control border-start-0" value="<?= htmlspecialchars($salary_month) ?>" required>
                            <button type="submit" class="btn btn-primary fw-bold px-4">View Records</button>
                        </div>
                    </form>
                </div>
                <div class="col-md-6 text-end">
                    <?php if (hasRole('Admin') || hasPermission('hr_payroll')): ?>
                        <form method="POST" action="" class="d-inline" onsubmit="return confirm('Generate/Refresh payroll for <?= htmlspecialchars($salary_month) ?>? This will auto-calculate deductions and add any selected bonuses.');">
                            <input type="hidden" name="action" value="payroll_generate">
                            <input type="hidden" name="salary_month" value="<?= htmlspecialchars($salary_month) ?>">
                            
                            <div class="input-group d-inline-flex w-auto me-2 shadow-sm align-middle">
                                <span class="input-group-text bg-white text-muted fw-bold border-end-0"><i class="fas fa-gift"></i></span>
                                <select name="apply_bonus" class="form-select border-start-0" style="max-width: 140px;">
                                    <option value="None">No Bonus</option>
                                    <option value="Festival">Festival Bonus</option>
                                    <option value="Annual">Annual Bonus</option>
                                </select>
                            </div>
                            
                            <button type="submit" class="btn btn-success fw-bold px-4 shadow-sm align-middle" style="background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%) !important; border:0;">
                                <i class="fas fa-calculator me-2"></i>Generate / Refresh
                            </button>
                        </form>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Payroll Records Table -->
    <div class="card border-0 shadow-sm">
        <div class="card-header bg-white border-0 py-3">
            <h5 class="card-title mb-0 fw-bold"><i class="fas fa-file-invoice-dollar text-primary me-2"></i>Salary Sheet : <?= date('F Y', strtotime($salary_month . '-01')) ?></h5>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-bordered table-hover align-middle mb-0">
                    <thead class="bg-light align-middle text-center">
                        <tr class="text-muted small text-uppercase">
                            <th class="text-start ps-4">Employee</th>
                            <th>Basic</th>
                            <th class="bg-danger-subtle text-danger">Auto Deductions<br><small>(Late+Absent+Adv+PF)</small></th>
                            <th class="bg-success-subtle text-success">Allowances<br><small>(Bonus+Inc)</small></th>
                            <th class="bg-warning-subtle text-warning">Manual Ded.</th>
                            <th class="bg-primary text-white">Net Salary</th>
                            <th>Status</th>
                            <th>Due</th>
                            <th class="text-end pe-4">Action</th>
                        </tr>
                    </thead>
                    <tbody class="text-center">
                        <?php if (empty($payrolls)): ?>
                            <tr>
                                <td colspan="9" class="text-center py-5 text-muted">
                                    <i class="fas fa-receipt fa-3x mb-3 text-light"></i>
                                    <h5>No payroll records generated yet</h5>
                                    <p class="small">Click 'Generate / Refresh Payroll' to calculate salaries for this month.</p>
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($payrolls as $p): 
                                $pf_deduction = isset($p['pf_deduction']) ? $p['pf_deduction'] : 0;
                                $auto_deduct = $p['late_deduction'] + $p['absent_deduction'] + $p['advance_deduction'] + $pf_deduction;
                                $allowances = $p['bonus'] + $p['incentive'];
                            ?>
                                <tr>
                                    <td class="text-start ps-4">
                                        <div class="fw-bold text-dark mb-0"><?= htmlspecialchars($p['full_name']) ?></div>
                                        <div class="text-muted small" style="font-size:0.75rem;"><?= htmlspecialchars($p['staff_id']) ?> - <?= htmlspecialchars($p['designation']) ?></div>
                                    </td>
                                    <td class="fw-bold text-secondary">৳ <?= number_format($p['basic_salary'], 2) ?></td>
                                    <td class="text-danger fw-bold">
                                        - ৳ <?= number_format($auto_deduct, 2) ?>
                                        <div class="small" style="font-size:0.65rem;">
                                            (L:<?= $p['late_deduction'] ?>, A:<?= $p['absent_deduction'] ?>, Adv:<?= $p['advance_deduction'] ?>, PF:<?= $pf_deduction ?>)
                                        </div>
                                    </td>
                                    <td class="text-success fw-bold">+ ৳ <?= number_format($allowances, 2) ?></td>
                                    <td class="text-warning fw-bold">- ৳ <?= number_format($p['other_deduction'], 2) ?></td>
                                    <td class="bg-light fw-bold text-primary fs-6">৳ <?= number_format($p['net_salary'], 2) ?></td>
                                    <td>
                                        <?php
                                        $badge = 'bg-secondary';
                                        if ($p['payment_status'] === 'Paid') $badge = 'bg-success';
                                        elseif ($p['payment_status'] === 'Due') $badge = 'bg-danger';
                                        elseif ($p['payment_status'] === 'Partial') $badge = 'bg-warning text-dark';
                                        ?>
                                        <span class="badge <?= $badge ?> rounded-pill font-monospace" style="font-size:0.75rem;"><?= $p['payment_status'] ?></span>
                                    </td>
                                    <td class="fw-bold <?= $p['due_amount'] > 0 ? 'text-danger' : 'text-success' ?>">
                                        ৳ <?= number_format($p['due_amount'], 2) ?>
                                    </td>
                                    <td class="text-end pe-4">
                                        <?php if (hasRole('Admin') || hasPermission('hr_payroll')): ?>
                                            <div class="d-flex justify-content-end gap-1">
                                                <?php if ($p['payment_status'] !== 'Paid'): ?>
                                                    <button class="btn btn-sm btn-outline-secondary py-1 px-2 fw-bold shadow-sm" style="font-size:0.75rem;" onclick="openAdjustModal(<?= htmlspecialchars(json_encode($p)) ?>)">
                                                        <i class="fas fa-edit"></i> Adjust
                                                    </button>
                                                    <button class="btn btn-sm btn-primary py-1 px-2 fw-bold shadow-sm" style="font-size:0.75rem;" onclick="openPayModal(<?= htmlspecialchars(json_encode($p)) ?>)">
                                                        <i class="fas fa-hand-holding-usd"></i> Pay
                                                    </button>
                                                <?php else: ?>
                                                    <button class="btn btn-sm btn-light border text-muted disabled py-1 px-2 fw-bold shadow-sm" style="font-size:0.75rem;"><i class="fas fa-check-circle text-success me-1"></i>Cleared</button>
                                                <?php endif; ?>
                                            </div>
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

<!-- Adjustments Modal -->
<div class="modal fade" id="adjustModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
            <form method="POST" action="">
                <input type="hidden" name="action" value="payroll_adjustments">
                <input type="hidden" name="payroll_id" id="adj_payroll_id">
                <div class="modal-header bg-light border-0">
                    <h5 class="modal-title fw-bold text-dark"><i class="fas fa-sliders-h text-primary me-2"></i>Salary Adjustments</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-4">
                    <div class="alert alert-info border-0 shadow-sm small">
                        <strong>Employee:</strong> <span id="adj_emp_name"></span><br>
                        <strong>Basic:</strong> ৳<span id="adj_basic"></span> | <strong>Auto-Deductions:</strong> ৳<span id="adj_auto"></span>
                    </div>
                    
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Bonus (৳)</label>
                            <input type="number" step="0.01" name="bonus" id="adj_bonus" class="form-control" value="0">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small fw-bold">Incentives (৳)</label>
                            <input type="number" step="0.01" name="incentive" id="adj_incentive" class="form-control" value="0">
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold text-danger">Manual Other Deduction (৳)</label>
                        <input type="number" step="0.01" name="other_deduction" id="adj_other" class="form-control border-danger" value="0">
                    </div>
                    <div class="mb-0">
                        <label class="form-label text-muted small fw-bold">Remarks</label>
                        <textarea name="remarks" id="adj_remarks" class="form-control" rows="2" placeholder="Note for adjustment..."></textarea>
                    </div>
                </div>
                <div class="modal-footer border-0 bg-light">
                    <button type="button" class="btn btn-secondary px-4 fw-bold" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary px-4 fw-bold"><i class="fas fa-save me-2"></i>Update Adjustments</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Pay Modal -->
<div class="modal fade" id="payModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow">
            <form method="POST" action="">
                <input type="hidden" name="action" value="payroll_pay">
                <input type="hidden" name="payroll_id" id="pay_payroll_id">
                <div class="modal-header bg-success text-white border-0">
                    <h5 class="modal-title fw-bold"><i class="fas fa-money-bill-wave me-2"></i>Process Payout</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-4">
                    <h6 class="fw-bold mb-3 text-center" id="pay_emp_name"></h6>
                    
                    <div class="card bg-light border-0 mb-4 rounded">
                        <div class="card-body text-center">
                            <div class="small text-muted mb-1 text-uppercase fw-bold">Total Due Amount</div>
                            <h2 class="mb-0 text-danger fw-bold">৳ <span id="pay_due_amt">0.00</span></h2>
                            <div class="small text-muted mt-2">Net Salary: ৳<span id="pay_net_amt"></span> | Already Paid: ৳<span id="pay_paid_amt"></span></div>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Payment Amount (৳) <span class="text-danger">*</span></label>
                        <input type="number" step="0.01" name="amount_to_pay" id="pay_input_amt" class="form-control form-control-lg fw-bold text-success" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label text-muted small fw-bold">Payment Method <span class="text-danger">*</span></label>
                        <select name="payment_method" class="form-select" required>
                            <option value="Cash">Cash</option>
                            <option value="Bank">Bank Transfer</option>
                            <option value="Mobile Banking">Mobile Banking</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <div class="mb-0">
                        <label class="form-label text-muted small fw-bold">Remarks / TrxID</label>
                        <input type="text" name="remarks" class="form-control" placeholder="Optional reference info...">
                    </div>
                </div>
                <div class="modal-footer border-0 bg-light">
                    <button type="button" class="btn btn-secondary px-4 fw-bold" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success px-4 fw-bold shadow-sm"><i class="fas fa-check-circle me-2"></i>Confirm Payment</button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
function openAdjustModal(data) {
    document.getElementById('adj_payroll_id').value = data.id;
    document.getElementById('adj_emp_name').innerText = data.full_name;
    document.getElementById('adj_basic').innerText = parseFloat(data.basic_salary).toFixed(2);
    
    let auto_deduct = parseFloat(data.late_deduction) + parseFloat(data.absent_deduction) + parseFloat(data.advance_deduction);
    document.getElementById('adj_auto').innerText = auto_deduct.toFixed(2);
    
    document.getElementById('adj_bonus').value = data.bonus;
    document.getElementById('adj_incentive').value = data.incentive;
    document.getElementById('adj_other').value = data.other_deduction;
    document.getElementById('adj_remarks').value = data.remarks || '';
    
    new bootstrap.Modal(document.getElementById('adjustModal')).show();
}

function openPayModal(data) {
    document.getElementById('pay_payroll_id').value = data.id;
    document.getElementById('pay_emp_name').innerText = data.full_name + ' (' + data.salary_month + ')';
    
    document.getElementById('pay_due_amt').innerText = parseFloat(data.due_amount).toFixed(2);
    document.getElementById('pay_net_amt').innerText = parseFloat(data.net_salary).toFixed(2);
    document.getElementById('pay_paid_amt').innerText = parseFloat(data.paid_amount).toFixed(2);
    
    document.getElementById('pay_input_amt').value = parseFloat(data.due_amount).toFixed(2);
    document.getElementById('pay_input_amt').max = parseFloat(data.due_amount).toFixed(2);
    
    new bootstrap.Modal(document.getElementById('payModal')).show();
}
</script>
