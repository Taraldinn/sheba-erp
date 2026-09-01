<?php
// REPORTS VIEW
$from = $_GET['from'] ?? date('Y-m-01');
$to = $_GET['to'] ?? date('Y-m-t');

$query = "SELECT t.*, s.name as staff_name FROM ".TBL_TX." t LEFT JOIN ".TBL_STAFF." s ON t.staff_id = s.id WHERE DATE(t.created_at) BETWEEN ? AND ?";
$params = [$from, $to];

if (!hasRole('Admin')) {
    $query .= " AND t.staff_id = ?";
    $params[] = $user;
}

$query .= " ORDER BY t.id DESC";
$report = safeFetchAll($pdo, $query, $params);

$total_income = 0;
$total_expense = 0;
foreach($report as $r) {
    if($r['type'] == 'Income') $total_income += $r['amount'];
    else $total_expense += $r['amount'];
}
?>

<div class="card mb-4 shadow-sm border-0">
    <div class="card-body">
        <form class="row g-3 align-items-end">
            <input type="hidden" name="tab" value="reports">
            <div class="col-md-3">
                <label class="form-label small fw-bold">From Date</label>
                <input type="date" name="from" class="form-control" value="<?= $from ?>">
            </div>
            <div class="col-md-3">
                <label class="form-label small fw-bold">To Date</label>
                <input type="date" name="to" class="form-control" value="<?= $to ?>">
            </div>
            <div class="col-md-2">
                <button type="submit" class="btn btn-primary w-100">Filter</button>
            </div>
            <div class="col-md-4 text-end">
                <button type="button" class="btn btn-outline-success" onclick="window.print()"><i class="fas fa-print me-1"></i> Print Report</button>
            </div>
        </form>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-md-6">
        <div class="card bg-success text-white border-0 shadow-sm">
            <div class="card-body py-4">
                <h6 class="opacity-75">Total Revenue</h6>
                <h2 class="mb-0">৳<?= number_format($total_income, 2) ?></h2>
            </div>
        </div>
    </div>
    <div class="col-md-6">
        <div class="card bg-danger text-white border-0 shadow-sm">
            <div class="card-body py-4">
                <h6 class="opacity-75">Total Expenses</h6>
                <h2 class="mb-0">৳<?= number_format($total_expense, 2) ?></h2>
            </div>
        </div>
    </div>
</div>

<div class="card shadow-sm border-0">
    <div class="card-header bg-white py-3 border-bottom">
        <h6 class="mb-0 fw-bold">Transaction Details</h6>
    </div>
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Date</th>
                        <th>Agent / Staff</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th class="text-end pe-3">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($report)): ?>
                        <tr><td colspan="5" class="text-center py-5 text-muted">No transactions found for this period</td></tr>
                    <?php else: foreach($report as $r): ?>
                        <tr>
                            <td class="ps-3 small"><?= date('d M Y, H:i', strtotime($r['created_at'])) ?></td>
                            <td><?= $r['staff_name'] ?></td>
                            <td><span class="badge <?= $r['type']=='Income'?'bg-success':'bg-danger' ?>"><?= $r['type'] ?></span></td>
                            <td><?= $r['description'] ?></td>
                            <td class="text-end pe-3 fw-bold">৳<?= number_format($r['amount'], 2) ?></td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
