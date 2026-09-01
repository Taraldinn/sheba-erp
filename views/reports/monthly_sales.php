<?php
// MONTHLY SALES REPORT VIEW
if (!hasRole('Admin') && !isOffice() && !hasRole('Reseller')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

// --- AJAX Endpoints ---
if (isset($_GET['ajax']) && $_GET['ajax'] == 'get_transactions') {
    $yr = (int)($_GET['y'] ?? date('Y'));
    $mo = (int)($_GET['m'] ?? date('n'));

    // Optional date-range filter. The range is intersected with the selected month.
    $from_raw = trim((string)($_GET['from'] ?? ''));
    $to_raw   = trim((string)($_GET['to'] ?? ''));
    $month_start = sprintf('%04d-%02d-01', $yr, $mo);
    $month_end   = date('Y-m-t', strtotime($month_start));
    $from_date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $from_raw) ? $from_raw : $month_start;
    $to_date   = preg_match('/^\d{4}-\d{2}-\d{2}$/', $to_raw) ? $to_raw : $month_end;
    if ($from_date < $month_start) $from_date = $month_start;
    if ($to_date > $month_end) $to_date = $month_end;

    // Authorization filter
    $user_id = $_SESSION['admin_id'];
    $role = $_SESSION['user_role'] ?? '';
    $managed_ids = getManagedStaffIds($pdo, $user_id, $role);
    $effective_ids = [$user_id];
    if ($managed_ids === 'ALL') {
        $effective_ids = 'ALL';
    }
    
    try {
        if ($effective_ids === 'ALL') {
            $query = "SELECT t.* FROM ".TBL_TX." t
                      WHERE t.created_at >= ? AND t.created_at < DATE_ADD(?, INTERVAL 1 DAY)
                      ORDER BY t.id DESC";
            $params = [$from_date, $to_date];
        } else {
            $placeholders = implode(',', array_fill(0, count($effective_ids), '?'));
            $query = "SELECT t.* FROM ".TBL_TX." t
                      WHERE t.created_at >= ? AND t.created_at < DATE_ADD(?, INTERVAL 1 DAY) AND t.staff_id IN ($placeholders)
                      ORDER BY t.id DESC";
            $params = array_merge([$from_date, $to_date], $effective_ids);
        }
        
        $txs = safeFetchAll($pdo, $query, $params);
        
        if (empty($txs)) {
            echo "<tr><td colspan='5' class='text-center py-4 text-muted'>No transactions found for this date range.</td></tr>";
        } else {
            foreach ($txs as $t) {
                $color = $t['type'] == 'Income' ? 'text-success' : 'text-danger';
                $sign = $t['type'] == 'Income' ? '+' : '-';
                $date = date('d M Y, h:i A', strtotime($t['created_at']));
                
                $method = htmlspecialchars($t['method'] ?? '-'); // Fixed column name from payment_method to method
                $desc = htmlspecialchars($t['description'] ?? '-');
                
                $amt = (isAdminRole($role) && $t['type'] == 'Expense') ? floatval($t['admin_cost']) : floatval($t['amount']);
                
                echo "<tr data-type='" . htmlspecialchars($t['type']) . "' data-amount='" . htmlspecialchars((string)$amt) . "'>";
                echo "<td class='small'>{$date}</td>";
                echo "<td><div class='small text-wrap' style='max-width:300px;'>{$desc}</div></td>";
                echo "<td><span class='badge bg-light text-dark border'>{$t['type']}</span></td>";
                echo "<td class='{$color} fw-bold'>{$sign}৳" . number_format($amt, 2) . "</td>";
                echo "<td class='small'>{$method}</td>";
                echo "</tr>";
            }
        }
    } catch (Exception $e) {
        echo "<tr><td colspan='5' class='text-center py-4 text-danger'>Error: " . $e->getMessage() . "</td></tr>";
    }
    exit;
}
// ---


$year = (int)($_GET['year'] ?? date('Y'));
if ($year < 2000 || $year > 2100) $year = (int)date('Y');

// Date filter defaults to the full selected year.
$default_from = sprintf('%04d-01-01', $year);
$default_to   = sprintf('%04d-12-31', $year);
$from_date = trim((string)($_GET['from'] ?? $default_from));
$to_date   = trim((string)($_GET['to'] ?? $default_to));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from_date) || !strtotime($from_date)) $from_date = $default_from;
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $to_date) || !strtotime($to_date)) $to_date = $default_to;
if ($from_date > $to_date) { $tmp = $from_date; $from_date = $to_date; $to_date = $tmp; }

$filter_active = ($from_date !== $default_from || $to_date !== $default_to);
$report_range_label = date('d M Y', strtotime($from_date)) . ' - ' . date('d M Y', strtotime($to_date));

// Initialize monthly data
$monthly_data = [];
for ($m = 1; $m <= 12; $m++) {
    $monthly_data[$m] = [
        'income' => 0,
        'expense' => 0,
        'profit' => 0
    ];
}

// Fetch Income & Expenses from Transactions
$user_id = $_SESSION['admin_id'];
$role = $_SESSION['user_role'] ?? '';
$managed_ids = getManagedStaffIds($pdo, $user_id, $role);
$effective_ids = [$user_id];

if ($managed_ids === 'ALL') {
    $effective_ids = 'ALL';
}

if ($effective_ids === 'ALL') {
    $sum_expr = isAdminRole($role) ? "IF(type='Expense', admin_cost, amount)" : "amount";
    $query = "SELECT MONTH(created_at) as m, type, SUM($sum_expr) as total 
              FROM ".TBL_TX." 
              WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
              GROUP BY m, type";
    $stmt = $pdo->prepare($query);
    $stmt->execute([$from_date, $to_date]);
} else {
    $sum_expr = isAdminRole($role) ? "IF(t.type='Expense', t.admin_cost, t.amount)" : "t.amount";
    $placeholders = implode(',', array_fill(0, count($effective_ids), '?'));
    $query = "SELECT MONTH(t.created_at) as m, t.type, SUM($sum_expr) as total 
              FROM ".TBL_TX." t
              WHERE t.created_at >= ? AND t.created_at < DATE_ADD(?, INTERVAL 1 DAY) AND t.staff_id IN ($placeholders)
              GROUP BY m, t.type";
    $stmt = $pdo->prepare($query);
    $params = array_merge([$from_date, $to_date], $effective_ids);
    $stmt->execute($params);
}

while($row = $stmt->fetch()) {
    $m = (int)$row['m'];
    if($row['type'] == 'Income') {
        $monthly_data[$m]['income'] = (float)$row['total'];
    } else {
        $monthly_data[$m]['expense'] = (float)$row['total'];
    }
}

// Calculate Profit
foreach($monthly_data as $m => &$data) {
    $data['profit'] = $data['income'] - $data['expense'];
}

$total_yearly_income = array_sum(array_column($monthly_data, 'income'));
$total_yearly_expense = array_sum(array_column($monthly_data, 'expense'));
$total_yearly_profit = $total_yearly_income - $total_yearly_expense;
?>

<div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
    <div>
        <h4 class="mb-1 fw-bold"><i class="fas fa-chart-line me-2 text-primary"></i> Month-wise Sales Report (<?= $year ?>)</h4>
        <div class="small text-muted"><i class="far fa-calendar-alt me-1"></i> Report Period: <strong><?= htmlspecialchars($report_range_label) ?></strong></div>
    </div>
</div>

<div class="card border-0 shadow-sm mb-4 no-print">
    <div class="card-body py-3">
        <form method="get" class="row g-2 align-items-end" id="salesDateFilterForm">
            <input type="hidden" name="tab" value="monthly_sales">
            <div class="col-6 col-md-2">
                <label class="form-label small fw-semibold mb-1">Year</label>
                <select name="year" class="form-select form-select-sm" id="salesYearSelect">
                    <?php for($y = date('Y'); $y >= date('Y')-5; $y--): ?>
                        <option value="<?= $y ?>" <?= $year == $y ? 'selected' : '' ?>><?= $y ?></option>
                    <?php endfor; ?>
                </select>
            </div>
            <div class="col-6 col-md-3">
                <label class="form-label small fw-semibold mb-1">From Date</label>
                <input type="date" name="from" class="form-control form-control-sm" value="<?= htmlspecialchars($from_date) ?>">
            </div>
            <div class="col-6 col-md-3">
                <label class="form-label small fw-semibold mb-1">To Date</label>
                <input type="date" name="to" class="form-control form-control-sm" value="<?= htmlspecialchars($to_date) ?>">
            </div>
            <div class="col-6 col-md-4 d-flex gap-2">
                <button type="submit" class="btn btn-primary btn-sm flex-grow-1"><i class="fas fa-filter me-1"></i> Apply Date Filter</button>
                <a href="?tab=monthly_sales&year=<?= $year ?>" class="btn btn-outline-secondary btn-sm"><i class="fas fa-undo me-1"></i> Reset</a>
            </div>
        </form>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-md-4">
        <div class="card border-0 shadow-sm bg-success text-white">
            <div class="card-body">
                <small class="opacity-75"><?= $filter_active ? 'Filtered Revenue' : 'Yearly Revenue' ?></small>
                <h3 class="fw-bold mb-0">৳<?= number_format($total_yearly_income, 2) ?></h3>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card border-0 shadow-sm bg-danger text-white">
            <div class="card-body">
                <small class="opacity-75"><?= $filter_active ? 'Filtered Expenses' : 'Yearly Expenses' ?></small>
                <h3 class="fw-bold mb-0">৳<?= number_format($total_yearly_expense, 2) ?></h3>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card border-0 shadow-sm bg-primary text-white">
            <div class="card-body">
                <small class="opacity-75"><?= $filter_active ? 'Filtered Net Profit' : 'Yearly Net Profit' ?></small>
                <h3 class="fw-bold mb-0">৳<?= number_format($total_yearly_profit, 2) ?></h3>
            </div>
        </div>
    </div>
</div>

<div class="card shadow-sm border-0">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Month</th>
                        <th class="text-end">Total Revenue</th>
                        <th class="text-end">Total Expenses</th>
                        <th class="text-end pe-3">Net Profit</th>
                        <th class="text-end pe-3 no-print">Action</th>
                    </tr>
                </thead>
                <tbody>
                    <?php 
                    $months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                    foreach($monthly_data as $m => $data): 
                    ?>
                        <tr>
                            <td class="ps-3 fw-bold"><?= $months[$m-1] ?></td>
                            <td class="text-end text-success">৳<?= number_format($data['income'], 2) ?></td>
                            <td class="text-end text-danger">৳<?= number_format($data['expense'], 2) ?></td>
                            <td class="text-end pe-3 fw-bold <?= $data['profit'] >= 0 ? 'text-primary' : 'text-danger' ?>">
                                ৳<?= number_format($data['profit'], 2) ?>
                            </td>
                            <td class="text-end pe-3 no-print">
                                <?php if($data['income'] != 0 || $data['expense'] != 0): ?>
                                <button class="btn btn-sm btn-outline-primary shadow-sm rounded-pill px-3 btn-view-transactions" data-year="<?= $year ?>" data-month="<?= $m ?>" data-from="<?= htmlspecialchars($from_date) ?>" data-to="<?= htmlspecialchars($to_date) ?>">
                                    <i class="fas fa-eye me-1"></i> View
                                </button>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
                <tfoot class="bg-light fw-bold">
                    <tr>
                        <td class="ps-3">TOTAL</td>
                        <td class="text-end text-success">৳<?= number_format($total_yearly_income, 2) ?></td>
                        <td class="text-end text-danger">৳<?= number_format($total_yearly_expense, 2) ?></td>
                        <td class="text-end pe-3 text-primary">৳<?= number_format($total_yearly_profit, 2) ?></td>
                        <td class="no-print"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>
</div>

<div class="mt-4 text-end no-print">
    <button class="btn btn-outline-dark btn-print-report"><i class="fas fa-print me-1"></i> Print Report</button>
</div>

<!-- Transactions Modal -->
<div class="modal fade" id="transactionsModal" tabindex="-1">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content border-0 shadow">
            <div class="modal-header bg-primary text-white border-0">
                <h5 class="modal-title"><i class="fas fa-list-alt me-2"></i> Transactions: <span id="txModalMonthYear"></span></h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div class="p-3 border-bottom bg-light no-print">
                    <div class="row g-2 align-items-end">
                        <div class="col-12 col-md-4">
                            <label class="form-label small fw-semibold mb-1">From Date</label>
                            <input type="date" id="txFromDate" class="form-control form-control-sm">
                        </div>
                        <div class="col-12 col-md-4">
                            <label class="form-label small fw-semibold mb-1">To Date</label>
                            <input type="date" id="txToDate" class="form-control form-control-sm">
                        </div>
                        <div class="col-12 col-md-4 d-flex gap-2">
                            <button type="button" id="txApplyDateFilter" class="btn btn-primary btn-sm flex-grow-1"><i class="fas fa-filter me-1"></i> Apply Filter</button>
                            <button type="button" id="txResetDateFilter" class="btn btn-outline-secondary btn-sm"><i class="fas fa-undo me-1"></i> Full Month</button>
                        </div>
                    </div>
                    <div class="row g-2 mt-2" id="txRangeSummary">
                        <div class="col-4">
                            <div class="border rounded p-2 bg-white">
                                <div class="small text-muted">Revenue</div>
                                <div class="fw-bold text-success" id="txSummaryIncome">৳0.00</div>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="border rounded p-2 bg-white">
                                <div class="small text-muted">Expense</div>
                                <div class="fw-bold text-danger" id="txSummaryExpense">৳0.00</div>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="border rounded p-2 bg-white">
                                <div class="small text-muted">Net Profit</div>
                                <div class="fw-bold text-primary" id="txSummaryProfit">৳0.00</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="table-responsive" style="max-height: 52vh;">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light sticky-top">
                            <tr>
                                <th class="ps-3 border-0">Date & Time</th>
                                <th class="border-0">Description</th>
                                <th class="border-0">Type</th>
                                <th class="border-0">Amount</th>
                                <th class="border-0">Method</th>
                            </tr>
                        </thead>
                        <tbody id="txModalBody">
                            <tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer border-0 bg-light">
                <button type="button" class="btn btn-secondary border-0 shadow-sm" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<script>
let txModal = null;
const monthsName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let txCurrentYear = null;
let txCurrentMonth = null;

function monthBounds(year, month) {
    const mm = String(month).padStart(2, '0');
    const last = new Date(year, month, 0).getDate();
    return {
        from: `${year}-${mm}-01`,
        to: `${year}-${mm}-${String(last).padStart(2, '0')}`
    };
}

function updateTxSummary() {
    let income = 0, expense = 0;
    document.querySelectorAll('#txModalBody tr[data-type][data-amount]').forEach(row => {
        const amount = parseFloat(row.getAttribute('data-amount') || '0') || 0;
        if (row.getAttribute('data-type') === 'Income') income += amount;
        else expense += amount;
    });
    const profit = income - expense;
    document.getElementById('txSummaryIncome').textContent = '৳' + income.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
    document.getElementById('txSummaryExpense').textContent = '৳' + expense.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
    document.getElementById('txSummaryProfit').textContent = '৳' + profit.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}

function loadTransactions(year, month, fromDate, toDate) {
    const body = document.getElementById('txModalBody');
    body.innerHTML = '<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted small">Loading transactions...</div></td></tr>';
    document.getElementById('txModalMonthYear').innerText = monthsName[month-1] + " " + year + " • " + fromDate + " to " + toDate;

    fetch(`?tab=monthly_sales&ajax=get_transactions&y=${year}&m=${month}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`)
        .then(res => res.text())
        .then(html => { body.innerHTML = html; updateTxSummary(); })
        .catch(err => {
            console.error(err);
            body.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger"><i class="fas fa-exclamation-circle me-1"></i> Failed to load data.</td></tr>';
            updateTxSummary();
        });
}

function viewTransactions(year, month) {
    if(!txModal) txModal = new bootstrap.Modal(document.getElementById('transactionsModal'));
    txCurrentYear = parseInt(year, 10);
    txCurrentMonth = parseInt(month, 10);
    const bounds = monthBounds(txCurrentYear, txCurrentMonth);
    const fromInput = document.getElementById('txFromDate');
    const toInput = document.getElementById('txToDate');
    fromInput.min = bounds.from; fromInput.max = bounds.to; fromInput.value = bounds.from;
    toInput.min = bounds.from; toInput.max = bounds.to; toInput.value = bounds.to;
    txModal.show();
    loadTransactions(txCurrentYear, txCurrentMonth, bounds.from, bounds.to);
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.submit-on-change').forEach(el => {
        el.addEventListener('change', function() {
            this.form.submit();
        });
    });

    // Programmatic click handler for transaction views to avoid CSP blocks
    document.querySelectorAll('.btn-view-transactions').forEach(btn => {
        btn.addEventListener('click', function() {
            const yr = this.getAttribute('data-year');
            const mo = this.getAttribute('data-month');
            viewTransactions(yr, mo);
        });
    });

    const txApply = document.getElementById('txApplyDateFilter');
    const txReset = document.getElementById('txResetDateFilter');
    if (txApply) {
        txApply.addEventListener('click', function() {
            if (!txCurrentYear || !txCurrentMonth) return;
            const bounds = monthBounds(txCurrentYear, txCurrentMonth);
            let from = document.getElementById('txFromDate').value || bounds.from;
            let to = document.getElementById('txToDate').value || bounds.to;
            if (from < bounds.from) from = bounds.from;
            if (to > bounds.to) to = bounds.to;
            if (from > to) { const tmp = from; from = to; to = tmp; }
            document.getElementById('txFromDate').value = from;
            document.getElementById('txToDate').value = to;
            loadTransactions(txCurrentYear, txCurrentMonth, from, to);
        });
    }
    if (txReset) {
        txReset.addEventListener('click', function() {
            if (!txCurrentYear || !txCurrentMonth) return;
            const bounds = monthBounds(txCurrentYear, txCurrentMonth);
            document.getElementById('txFromDate').value = bounds.from;
            document.getElementById('txToDate').value = bounds.to;
            loadTransactions(txCurrentYear, txCurrentMonth, bounds.from, bounds.to);
        });
    }

    const yearSelect = document.getElementById('salesYearSelect');
    if (yearSelect) {
        yearSelect.addEventListener('change', function() {
            const form = document.getElementById('salesDateFilterForm');
            if (!form) return;
            const from = form.querySelector('input[name="from"]');
            const to = form.querySelector('input[name="to"]');
            if (from) from.value = this.value + '-01-01';
            if (to) to.value = this.value + '-12-31';
        });
    }

    // Programmatic click handler for print report
    document.querySelectorAll('.btn-print-report').forEach(btn => {
        btn.addEventListener('click', function() {
            window.print();
        });
    });
});
</script>
