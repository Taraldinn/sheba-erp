<?php
// views/hr/self_salary.php
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

// Fetch Salary Slips
$salaries = safeFetchAll($pdo, "SELECT * FROM " . TBL_HR_PAYROLL . " WHERE employee_id = ? ORDER BY salary_month DESC", [$my_emp_id]);

?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">My Salary Slips</h1>
            <p class="text-muted small mb-0">View your monthly salary breakdown and payment status.</p>
        </div>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-header bg-white border-bottom py-3">
            <h6 class="mb-0 fw-bold"><i class="fas fa-file-invoice-dollar text-primary me-2"></i> Payroll History</h6>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 text-center">
                    <thead class="bg-light">
                        <tr class="text-muted small text-uppercase">
                            <th class="text-start ps-4">Month</th>
                            <th>Basic Salary</th>
                            <th>Additions</th>
                            <th>Deductions</th>
                            <th>Net Payable</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($salaries)): ?>
                            <tr>
                                <td colspan="6" class="text-center py-5 text-muted">
                                    <i class="fas fa-wallet fa-3x mb-3 text-light"></i>
                                    <h5>No salary records found</h5>
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($salaries as $sal): 
                                $additions = floatval($sal['bonus']) + floatval($sal['incentive']);
                                $deductions = floatval($sal['late_deduction']) + floatval($sal['absent_deduction']) + floatval($sal['advance_deduction']) + floatval($sal['other_deduction']);
                            ?>
                                <tr>
                                    <td class="text-start ps-4 fw-bold text-dark">
                                        <i class="far fa-calendar-alt text-muted me-2"></i><?= date('F, Y', strtotime($sal['salary_month'] . '-01')) ?>
                                    </td>
                                    <td><span class="text-muted">৳ <?= number_format($sal['basic_salary'], 2) ?></span></td>
                                    <td><span class="text-success">+ ৳ <?= number_format($additions, 2) ?></span></td>
                                    <td><span class="text-danger">- ৳ <?= number_format($deductions, 2) ?></span></td>
                                    <td>
                                        <div class="fw-bold fs-6 text-primary">৳ <?= number_format($sal['net_salary'], 2) ?></div>
                                    </td>
                                    <td>
                                        <?php
                                        $badge = 'bg-warning text-dark';
                                        if ($sal['status'] === 'Paid') $badge = 'bg-success';
                                        elseif ($sal['status'] === 'Partial') $badge = 'bg-info text-dark';
                                        ?>
                                        <span class="badge <?= $badge ?> rounded-pill font-monospace" style="font-size:0.75rem;"><?= $sal['status'] ?></span>
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
