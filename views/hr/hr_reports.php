<?php
// views/hr/hr_reports.php
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

$report_type = $_GET['report_type'] ?? '';
$report_month = $_GET['report_month'] ?? date('Y-m');
$report_status = $_GET['report_status'] ?? 'Active';

$report_data = [];
$report_title = '';

if ($report_type === 'employees') {
    $report_title = "Employee Directory (" . htmlspecialchars($report_status) . ")";
    $report_data = safeFetchAll($pdo, "SELECT * FROM " . TBL_HR_EMPLOYEES . " WHERE employment_status = ? ORDER BY full_name ASC", [$report_status]);
} elseif ($report_type === 'attendance') {
    $report_title = "Attendance Registry (" . date('F Y', strtotime($report_month . '-01')) . ")";
    $start_date = $report_month . '-01';
    $end_date = date('Y-m-t', strtotime($start_date));
    $query = "
        SELECT a.*, e.full_name, e.staff_id, e.designation 
        FROM " . TBL_HR_ATTENDANCE . " a 
        JOIN " . TBL_HR_EMPLOYEES . " e ON a.employee_id = e.id 
        WHERE a.date BETWEEN ? AND ? 
        ORDER BY a.date ASC, e.full_name ASC
    ";
    $report_data = safeFetchAll($pdo, $query, [$start_date, $end_date]);
} elseif ($report_type === 'payroll') {
    $report_title = "Payroll Summary (" . date('F Y', strtotime($report_month . '-01')) . ")";
    $query = "
        SELECT p.*, e.full_name, e.staff_id, e.designation 
        FROM " . TBL_HR_PAYROLL . " p 
        JOIN " . TBL_HR_EMPLOYEES . " e ON p.employee_id = e.id 
        WHERE p.salary_month = ?
        ORDER BY e.full_name ASC
    ";
    $report_data = safeFetchAll($pdo, $query, [$report_month]);
}
?>

<style>
/* Print Styles */
@media print {
    body * {
        visibility: hidden;
    }
    #printableArea, #printableArea * {
        visibility: visible;
    }
    #printableArea {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
    }
    .no-print {
        display: none !important;
    }
    .card {
        border: none !important;
        box-shadow: none !important;
    }
    .table {
        border-color: #000 !important;
    }
    .table th, .table td {
        border-color: #000 !important;
        padding: 4px !important;
        font-size: 12px !important;
        color: #000 !important;
    }
    .badge {
        border: 1px solid #000 !important;
        color: #000 !important;
        background: transparent !important;
    }
}
</style>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4 no-print">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">Reports & Analytics</h1>
            <p class="text-muted small mb-0">Generate, print, and export HR data sheets.</p>
        </div>
    </div>

    <!-- Filter Form -->
    <div class="card border-0 shadow-sm mb-4 no-print">
        <div class="card-body">
            <form method="GET" action="" class="row g-3 align-items-end">
                <input type="hidden" name="tab" value="hr_reports">
                
                <div class="col-md-3">
                    <label class="form-label text-muted small fw-bold">Report Type</label>
                    <select name="report_type" id="report_type" class="form-select fw-bold" required onchange="toggleFilters()">
                        <option value="">Select Report...</option>
                        <option value="employees" <?= $report_type === 'employees' ? 'selected' : '' ?>>Employee Directory</option>
                        <option value="attendance" <?= $report_type === 'attendance' ? 'selected' : '' ?>>Attendance Registry</option>
                        <option value="payroll" <?= $report_type === 'payroll' ? 'selected' : '' ?>>Payroll Summary</option>
                    </select>
                </div>
                
                <div class="col-md-3 filter-group filter-month" style="display: none;">
                    <label class="form-label text-muted small fw-bold">Target Month</label>
                    <input type="month" name="report_month" class="form-control" value="<?= htmlspecialchars($report_month) ?>">
                </div>
                
                <div class="col-md-3 filter-group filter-status" style="display: none;">
                    <label class="form-label text-muted small fw-bold">Status</label>
                    <select name="report_status" class="form-select">
                        <option value="Active" <?= $report_status === 'Active' ? 'selected' : '' ?>>Active</option>
                        <option value="Resigned" <?= $report_status === 'Resigned' ? 'selected' : '' ?>>Resigned</option>
                        <option value="Terminated" <?= $report_status === 'Terminated' ? 'selected' : '' ?>>Terminated</option>
                    </select>
                </div>
                
                <div class="col-md-3">
                    <button type="submit" class="btn btn-primary w-100 fw-bold shadow-sm"><i class="fas fa-file-invoice me-2"></i>Generate Report</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Report Area -->
    <?php if (!empty($report_type)): ?>
        <div class="card border-0 shadow-sm" id="printableArea">
            <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                <div>
                    <h4 class="card-title mb-0 fw-bold text-dark"><?= htmlspecialchars($report_title) ?></h4>
                    <div class="small text-muted mt-1 no-print">Generated on <?= date('d M, Y h:i A') ?></div>
                </div>
                <div class="no-print d-flex gap-2">
                    <button onclick="exportTableToCSV('hr_report.csv')" class="btn btn-outline-success fw-bold px-3">
                        <i class="fas fa-file-csv me-2"></i>Export CSV
                    </button>
                    <button onclick="window.print()" class="btn btn-outline-primary fw-bold px-3">
                        <i class="fas fa-print me-2"></i>Print / PDF
                    </button>
                </div>
            </div>
            
            <div class="card-body p-4">
                <!-- Print Header (Only visible in print) -->
                <div class="d-none d-print-block text-center mb-4 pb-3 border-bottom">
                    <h2 class="fw-bold mb-1">Company Name</h2>
                    <h5 class="mb-2"><?= htmlspecialchars($report_title) ?></h5>
                    <div class="small">Generated by <?= htmlspecialchars($_SESSION['admin_username'] ?? 'System') ?> on <?= date('d M, Y h:i A') ?></div>
                </div>

                <div class="table-responsive">
                    <table class="table table-bordered table-striped align-middle mb-0" id="reportTable">
                        <thead class="table-dark">
                            <?php if ($report_type === 'employees'): ?>
                                <tr>
                                    <th>Staff ID</th>
                                    <th>Name</th>
                                    <th>Designation</th>
                                    <th>Department</th>
                                    <th>Phone</th>
                                    <th>Joining Date</th>
                                    <th>Basic Salary</th>
                                    <th>Status</th>
                                </tr>
                            <?php elseif ($report_type === 'attendance'): ?>
                                <tr>
                                    <th>Date</th>
                                    <th>Staff ID</th>
                                    <th>Name</th>
                                    <th>Designation</th>
                                    <th>Check In</th>
                                    <th>Check Out</th>
                                    <th>Hours</th>
                                    <th>Status</th>
                                </tr>
                            <?php elseif ($report_type === 'payroll'): ?>
                                <tr>
                                    <th>Staff ID</th>
                                    <th>Name</th>
                                    <th>Designation</th>
                                    <th>Basic Salary</th>
                                    <th>Late Ded.</th>
                                    <th>Abs/Leave Ded.</th>
                                    <th>Adv. Ded.</th>
                                    <th>Allowances</th>
                                    <th>Net Salary</th>
                                    <th>Status</th>
                                    <th>Due Amount</th>
                                </tr>
                            <?php endif; ?>
                        </thead>
                        <tbody>
                            <?php if (empty($report_data)): ?>
                                <tr>
                                    <td colspan="12" class="text-center py-4 text-muted">No data available for the selected criteria.</td>
                                </tr>
                            <?php else: ?>
                                <?php foreach ($report_data as $row): ?>
                                    <?php if ($report_type === 'employees'): ?>
                                        <tr>
                                            <td><?= htmlspecialchars($row['staff_id']) ?></td>
                                            <td class="fw-bold"><?= htmlspecialchars($row['full_name']) ?></td>
                                            <td><?= htmlspecialchars($row['designation']) ?></td>
                                            <td><?= htmlspecialchars($row['department']) ?></td>
                                            <td><?= htmlspecialchars($row['phone1']) ?></td>
                                            <td><?= date('d M Y', strtotime($row['joining_date'])) ?></td>
                                            <td class="text-end">৳ <?= number_format($row['monthly_salary'], 2) ?></td>
                                            <td><?= htmlspecialchars($row['employment_status']) ?></td>
                                        </tr>
                                    <?php elseif ($report_type === 'attendance'): ?>
                                        <tr>
                                            <td><?= date('d M Y', strtotime($row['date'])) ?></td>
                                            <td><?= htmlspecialchars($row['staff_id']) ?></td>
                                            <td class="fw-bold"><?= htmlspecialchars($row['full_name']) ?></td>
                                            <td><?= htmlspecialchars($row['designation']) ?></td>
                                            <td><?= $row['check_in'] ? date('h:i A', strtotime($row['check_in'])) : '-' ?></td>
                                            <td><?= $row['check_out'] ? date('h:i A', strtotime($row['check_out'])) : '-' ?></td>
                                            <td><?= $row['working_hours'] ?></td>
                                            <td><span class="badge bg-secondary rounded-pill"><?= htmlspecialchars($row['status']) ?></span></td>
                                        </tr>
                                    <?php elseif ($report_type === 'payroll'): ?>
                                        <tr>
                                            <td><?= htmlspecialchars($row['staff_id']) ?></td>
                                            <td class="fw-bold"><?= htmlspecialchars($row['full_name']) ?></td>
                                            <td><?= htmlspecialchars($row['designation']) ?></td>
                                            <td class="text-end">৳ <?= number_format($row['basic_salary'], 2) ?></td>
                                            <td class="text-end text-danger">-<?= number_format($row['late_deduction'], 2) ?></td>
                                            <td class="text-end text-danger">-<?= number_format($row['absent_deduction'], 2) ?></td>
                                            <td class="text-end text-danger">-<?= number_format($row['advance_deduction'], 2) ?></td>
                                            <td class="text-end text-success">+<?= number_format($row['bonus'] + $row['incentive'], 2) ?></td>
                                            <td class="text-end fw-bold text-primary">৳ <?= number_format($row['net_salary'], 2) ?></td>
                                            <td><span class="badge bg-secondary rounded-pill"><?= htmlspecialchars($row['payment_status']) ?></span></td>
                                            <td class="text-end fw-bold">৳ <?= number_format($row['due_amount'], 2) ?></td>
                                        </tr>
                                    <?php endif; ?>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    <?php endif; ?>
</div>

<script>
function toggleFilters() {
    const rType = document.getElementById('report_type').value;
    document.querySelectorAll('.filter-group').forEach(el => el.style.display = 'none');
    
    if (rType === 'employees') {
        document.querySelectorAll('.filter-status').forEach(el => el.style.display = 'block');
    } else if (rType === 'attendance' || rType === 'payroll') {
        document.querySelectorAll('.filter-month').forEach(el => el.style.display = 'block');
    }
}

// Simple Export Table to CSV
function exportTableToCSV(filename) {
    let csv = [];
    let rows = document.querySelectorAll("#reportTable tr");
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll("td, th");
        
        for (let j = 0; j < cols.length; j++) {
            let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
            // Escape double quotes
            data = data.replace(/"/g, '""');
            row.push('"' + data + '"');
        }
        csv.push(row.join(","));
    }

    downloadCSV(csv.join("\n"), filename);
}

function downloadCSV(csv, filename) {
    let csvFile;
    let downloadLink;
    
    csvFile = new Blob([csv], {type: "text/csv"});
    downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// Run on page load
document.addEventListener("DOMContentLoaded", toggleFilters);
</script>
