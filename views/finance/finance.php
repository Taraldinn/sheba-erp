<?php
// FINANCE MODULE VIEW
if (!hasRole('Admin') && (!isOffice() || $_SESSION['parent_id'] > 0)) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$from_date = $_GET['from_date'] ?? date('Y-m-d');
$to_date = $_GET['to_date'] ?? date('Y-m-d');
$search_user = $_GET['search_user'] ?? '';
$min_amount = isset($_GET['min_amount']) ? floatval($_GET['min_amount']) : 0;

// 1. Fetch Today's Summary (Keep today's summary for quick glance)
$today_income = $pdo->query("SELECT SUM(amount) FROM ".TBL_FIN_CASHBOOK." WHERE entry_type='Income' AND DATE(created_at) = CURRENT_DATE")->fetchColumn() ?: 0;
$today_expense = ABS($pdo->query("SELECT SUM(amount) FROM ".TBL_FIN_CASHBOOK." WHERE entry_type='Expense' AND DATE(created_at) = CURRENT_DATE")->fetchColumn() ?: 0);
$cash_balance = $pdo->query("SELECT SUM(amount) FROM ".TBL_FIN_CASHBOOK." WHERE method='Cash'")->fetchColumn() ?: 0;
$digital_balance = $pdo->query("SELECT SUM(amount) FROM ".TBL_FIN_CASHBOOK." WHERE method NOT IN ('Cash', 'Due', 'System')")->fetchColumn() ?: 0;

// 2. Fetch Transactions with Filter
$tx_query = "SELECT t.*, s.name as staff_name 
             FROM ".TBL_FIN_CASHBOOK." t
             LEFT JOIN ".TBL_STAFF." s ON t.staff_id = s.id
             WHERE 1=1";
$tx_params = [];

if($from_date && $to_date) {
    $tx_query .= " AND DATE(created_at) BETWEEN ? AND ?";
    $tx_params[] = $from_date;
    $tx_params[] = $to_date;
}
if($min_amount > 0) {
    $tx_query .= " AND ABS(amount) >= ?";
    $tx_params[] = $min_amount;
}
if($search_user !== '') {
    $tx_query .= " AND description LIKE ?";
    $tx_params[] = "%$search_user%";
}

$tx_query .= " ORDER BY id DESC LIMIT 100";
$transactions = safeFetchAll($pdo, $tx_query, $tx_params);

// 3. Fetch Expenses for current month
$month = date('Y-m', strtotime($from_date));
$expenses = safeFetchAll($pdo, "SELECT * FROM ".TBL_FIN_EXPENSES." WHERE DATE_FORMAT(date, '%Y-%m') = ? ORDER BY date DESC", [$month]);

// 4. Fetch Pay Bill (API / SMS) transactions
$active_tab = $_GET['active_tab'] ?? 'master-ledger';
$pb_query = "SELECT p.*, u.user_id as customer_username, u.name as customer_name 
             FROM payment_gateway_logs p
             LEFT JOIN users u ON p.staff_id = u.id
             WHERE p.status = 'COMPLETED' AND (p.gateway_response LIKE '%API%' OR p.gateway_response LIKE '%SMS_VERIFIED%' OR p.gateway_response LIKE '%MANUAL_VERIFIED%' OR p.gateway_response LIKE '%MANUAL_MATCHED_SMS%')";
$pb_params = [];

if($from_date && $to_date) {
    $pb_query .= " AND DATE(p.created_at) BETWEEN ? AND ?";
    $pb_params[] = $from_date;
    $pb_params[] = $to_date;
}

if($search_user !== '') {
    $pb_query .= " AND (u.user_id LIKE ? OR u.name LIKE ? OR p.trx_id LIKE ?)";
    $term = "%$search_user%";
    $pb_params[] = $term;
    $pb_params[] = $term;
    $pb_params[] = $term;
}

$pb_query .= " ORDER BY p.id DESC LIMIT 100";
$pay_bills = safeFetchAll($pdo, $pb_query, $pb_params);
?>

<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
    <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-wallet me-2 text-primary"></i> Wallet & Deposit</h4>
    <div class="d-flex flex-wrap gap-2">
        <form method="GET" class="row row-cols-lg-auto g-2 align-items-center">
            <input type="hidden" name="tab" value="finance">
            <input type="hidden" name="active_tab" id="activeTabInput" value="<?= htmlspecialchars($active_tab) ?>">
            <div class="col-12">
                <div class="input-group input-group-sm shadow-sm">
                    <span class="input-group-text bg-white">From</span>
                    <input type="date" name="from_date" class="form-control" value="<?= $from_date ?>">
                    <span class="input-group-text bg-white">To</span>
                    <input type="date" name="to_date" class="form-control" value="<?= $to_date ?>">
                </div>
            </div>
            <div class="col-12">
                <div class="input-group input-group-sm shadow-sm">
                    <input type="text" name="search_user" class="form-control" placeholder="Search Customer ID..." value="<?= htmlspecialchars($search_user) ?>">
                    <button class="btn btn-primary" type="submit"><i class="fas fa-search"></i></button>
                </div>
            </div>
            <div class="col-12">
                <div class="input-group input-group-sm shadow-sm" style="width: 150px;">
                    <span class="input-group-text bg-white border-end-0 text-muted small">৳ ></span>
                    <input type="number" name="min_amount" class="form-control border-start-0" placeholder="Min" value="<?= $min_amount ?>">
                    <button class="btn btn-outline-secondary" type="submit"><i class="fas fa-filter"></i></button>
                </div>
            </div>
        </form>
        <button class="btn btn-danger btn-sm shadow-sm rounded-pill px-3" data-bs-toggle="modal" data-bs-target="#expenseModal">
            <i class="fas fa-minus-circle me-1"></i> Add Expense
        </button>
        <button class="btn btn-outline-primary btn-sm shadow-sm rounded-pill px-3" onclick="window.print()">
            <i class="fas fa-print me-1"></i> Print
        </button>
    </div>
</div>

<!-- Summary Cards -->
<div class="row g-3 mb-4">
    <div class="col-md-3">
        <div class="card border-0 shadow-sm bg-primary text-white">
            <div class="card-body">
                <small class="text-white-50 d-block mb-1">Total Cash In Hand</small>
                <h3 class="fw-bold mb-0">৳<?= number_format($cash_balance, 2) ?></h3>
                <i class="fas fa-wallet position-absolute top-50 end-0 translate-middle-y me-3 opacity-25 fa-2x"></i>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card border-0 shadow-sm bg-info text-white">
            <div class="card-body">
                <small class="text-white-50 d-block mb-1">Digital Balance (bKash/Bank)</small>
                <h3 class="fw-bold mb-0">৳<?= number_format($digital_balance, 2) ?></h3>
                <i class="fas fa-university position-absolute top-50 end-0 translate-middle-y me-3 opacity-25 fa-2x"></i>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card border-0 shadow-sm bg-success text-white">
            <div class="card-body">
                <small class="text-white-50 d-block mb-1">Today's Income</small>
                <h3 class="fw-bold mb-0">৳<?= number_format($today_income, 2) ?></h3>
                <i class="fas fa-arrow-trend-up position-absolute top-50 end-0 translate-middle-y me-3 opacity-25 fa-2x"></i>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card border-0 shadow-sm bg-danger text-white">
            <div class="card-body">
                <small class="text-white-50 d-block mb-1">Today's Expense</small>
                <h3 class="fw-bold mb-0">৳<?= number_format($today_expense, 2) ?></h3>
                <i class="fas fa-arrow-trend-down position-absolute top-50 end-0 translate-middle-y me-3 opacity-25 fa-2x"></i>
            </div>
        </div>
    </div>
</div>

<div class="row">
    <!-- Cash Book / Ledger -->
    <div class="col-md-8">
        <div class="card border-0 shadow-sm mb-4">
            <div class="card-header bg-white py-3 border-0 pb-0">
                <ul class="nav nav-tabs border-bottom-0" id="financeTabs" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link fw-bold text-dark <?= $active_tab === 'master-ledger' ? 'active border-bottom-0' : '' ?>" id="master-ledger-tab" data-bs-toggle="tab" data-bs-target="#master-ledger" type="button" role="tab">
                            <i class="fas fa-book me-2 text-primary"></i> Daily Cash Book (Master Ledger)
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link fw-bold text-dark <?= $active_tab === 'pay-bill-list' ? 'active border-bottom-0' : '' ?>" id="pay-bill-list-tab" data-bs-toggle="tab" data-bs-target="#pay-bill-list" type="button" role="tab">
                            <i class="fas fa-list-alt me-2 text-success"></i> Pay Bill List (API / SMS)
                        </button>
                    </li>
                </ul>
            </div>
            <div class="card-body p-0">
                <div class="tab-content" id="financeTabsContent">
                    <!-- Tab 1: Master Ledger -->
                    <div class="tab-pane fade <?= $active_tab === 'master-ledger' ? 'show active' : '' ?>" id="master-ledger" role="tabpanel">
                        <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="bg-light small text-uppercase fw-bold">
                                    <tr>
                                        <th class="ps-3">Date/Time</th>
                                        <th>Source/Ref</th>
                                        <th>Staff/Panel</th>
                                        <th>Type</th>
                                        <th>Method</th>
                                        <th class="text-end">Amount</th>
                                        <th class="text-end pe-3">Balance</th>
                                    </tr>
                                </thead>
                                <tbody class="small">
                                    <?php if (empty($transactions)): ?>
                                        <tr>
                                            <td colspan="7" class="text-center py-4 text-muted">No transactions found.</td>
                                        </tr>
                                    <?php else: ?>
                                        <?php foreach($transactions as $tx): ?>
                                            <tr>
                                                <td class="ps-3 text-muted"><?= date('d M, h:i A', strtotime($tx['created_at'])) ?></td>
                                                <td>
                                                    <div class="fw-bold"><?= $tx['source'] ?></div>
                                                    <div class="text-muted small"><?= $tx['description'] ?></div>
                                                </td>
                                                <td>
                                                    <div class="fw-bold text-dark"><?= htmlspecialchars($tx['staff_name'] ?? 'System') ?></div>
                                                </td>
                                                <td>
                                                    <span class="badge rounded-pill <?= $tx['entry_type'] == 'Income' ? 'bg-success' : 'bg-danger' ?>">
                                                        <?= $tx['entry_type'] ?>
                                                    </span>
                                                </td>
                                                <td><span class="badge bg-light text-dark border"><?= $tx['method'] ?></span></td>
                                                <td class="text-end fw-bold <?= $tx['entry_type'] == 'Income' ? 'text-success' : 'text-danger' ?>">
                                                    <?= $tx['entry_type'] == 'Income' ? '+' : '-' ?>৳<?= number_format(abs($tx['amount'] ?? 0), 2) ?>
                                                </td>
                                                <td class="text-end pe-3 fw-bold">৳<?= number_format($tx['running_balance'] ?? 0, 2) ?></td>
                                            </tr>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Tab 2: Pay Bill List (API) -->
                    <div class="tab-pane fade <?= $active_tab === 'pay-bill-list' ? 'show active' : '' ?>" id="pay-bill-list" role="tabpanel">
                        <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="bg-light small text-uppercase fw-bold">
                                    <tr>
                                        <th class="ps-3">Date/Time</th>
                                        <th>Customer ID</th>
                                        <th>Transaction ID</th>
                                        <th>Gateway</th>
                                        <th class="text-end pe-3">Amount</th>
                                    </tr>
                                </thead>
                                <tbody class="small">
                                    <?php if (empty($pay_bills)): ?>
                                        <tr>
                                            <td colspan="5" class="text-center py-4 text-muted">No API or SMS payments found.</td>
                                        </tr>
                                    <?php else: ?>
                                        <?php foreach($pay_bills as $pb): 
                                            $gatewayName = 'API';
                                            if (!empty($pb['gateway_response'])) {
                                                $meta = json_decode($pb['gateway_response'], true);
                                                if (is_array($meta)) {
                                                    $gatewayName = $meta['gateway'] ?? $meta['method'] ?? 'API';
                                                    if (strcasecmp($gatewayName, 'bkash') === 0) $gatewayName = 'bKash';
                                                    elseif (strcasecmp($gatewayName, 'nagad') === 0) $gatewayName = 'Nagad';
                                                    elseif (strcasecmp($gatewayName, 'rocket') === 0) $gatewayName = 'Rocket';
                                                    elseif (strcasecmp($gatewayName, 'upay') === 0) $gatewayName = 'Upay';
                                                    elseif ($gatewayName === 'SMS_VERIFIED') $gatewayName = 'SMS (Auto)';
                                                    elseif ($gatewayName === 'MANUAL_VERIFIED') $gatewayName = 'SMS (Manual)';
                                                    elseif ($gatewayName === 'MANUAL_MATCHED_SMS') $gatewayName = 'SMS (Matched)';
                                                }
                                            }
                                        ?>
                                            <tr>
                                                <td class="ps-3 text-muted"><?= date('d M, h:i A', strtotime($pb['created_at'])) ?></td>
                                                <td>
                                                    <div class="fw-bold text-dark"><?= htmlspecialchars($pb['customer_username'] ?? 'N/A') ?></div>
                                                    <div class="text-muted small"><?= htmlspecialchars($pb['customer_name'] ?? 'N/A') ?></div>
                                                </td>
                                                <td>
                                                    <span class="badge bg-light text-dark border font-monospace"><?= htmlspecialchars($pb['trx_id']) ?></span>
                                                </td>
                                                <td>
                                                    <span class="badge bg-info text-white"><?= htmlspecialchars($gatewayName) ?></span>
                                                </td>
                                                <td class="text-end pe-3 fw-bold text-success">
                                                    +৳<?= number_format($pb['amount'], 2) ?>
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
        </div>
    </div>

    <!-- Expense Panel -->
    <div class="col-md-4">
        <div class="card border-0 shadow-sm mb-4">
            <div class="card-header bg-white py-3">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-receipt me-2 text-danger"></i> Monthly Expense Book</h6>
            </div>
            <div class="card-body p-0">
                <ul class="list-group list-group-flush">
                    <?php if(empty($expenses)): ?>
                        <li class="list-group-item text-center py-4 text-muted small">No expenses recorded for this month.</li>
                    <?php else: ?>
                        <?php foreach($expenses as $ex): ?>
                            <li class="list-group-item">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <div class="fw-bold"><?= $ex['category'] ?></div>
                                        <div class="text-muted small"><?= date('d M Y', strtotime($ex['date'])) ?></div>
                                    </div>
                                    <div class="text-end">
                                        <div class="text-danger fw-bold">-৳<?= number_format($ex['amount'], 2) ?></div>
                                        <div class="text-muted small"><?= $ex['method'] ?></div>
                                    </div>
                                </div>
                                <div class="text-muted small mt-1 italic"><?= $ex['description'] ?></div>
                            </li>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </ul>
            </div>
        </div>
        
        <div class="card border-0 shadow-sm bg-dark text-white">
            <div class="card-body">
                <h6 class="mb-3 fw-bold text-warning">Quick Profit Check</h6>
                <?php
                    $this_month_income = $pdo->query("SELECT SUM(amount) FROM ".TBL_FIN_CASHBOOK." WHERE entry_type='Income' AND DATE_FORMAT(created_at, '%Y-%m') = '$month'")->fetchColumn() ?: 0;
                    $this_month_expense = ABS($pdo->query("SELECT SUM(amount) FROM ".TBL_FIN_CASHBOOK." WHERE entry_type='Expense' AND DATE_FORMAT(created_at, '%Y-%m') = '$month'")->fetchColumn() ?: 0);
                    $net_profit = $this_month_income - $this_month_expense;
                ?>
                <div class="d-flex justify-content-between mb-2 small"><span>Income:</span> <span>৳<?= number_format($this_month_income, 2) ?></span></div>
                <div class="d-flex justify-content-between mb-3 small"><span>Expense:</span> <span>৳<?= number_format($this_month_expense, 2) ?></span></div>
                <div class="border-top pt-2 d-flex justify-content-between align-items-center">
                    <span class="fw-bold">Net Profit/Loss:</span>
                    <h4 class="mb-0 fw-bold <?= $net_profit >= 0 ? 'text-success' : 'text-danger' ?>">৳<?= number_format($net_profit, 2) ?></h4>
                </div>
            </div>
        </div>

    </div>
</div>

<!-- Add Expense Modal -->
<div class="modal fade" id="expenseModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content border-0 shadow">
            <div class="modal-header bg-danger text-white">
                <h5 class="modal-title font-weight-bold">Record New Expense</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label class="form-label fw-bold">Category</label>
                    <select name="category" class="form-select" required>
                        <option value="Bandwidth Cost">Bandwidth Cost</option>
                        <option value="Office Rent">Office Rent</option>
                        <option value="Electricity Bill">Electricity Bill</option>
                        <option value="Staff Salary">Staff Salary</option>
                        <option value="Maintenance">Maintenance / Spare Parts</option>
                        <option value="Marketing">Marketing / Printing</option>
                        <option value="Others">Others</option>
                    </select>
                </div>
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label fw-bold">Amount (৳)</label>
                        <input type="number" step="0.01" name="amount" class="form-control" required>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label fw-bold">Date</label>
                        <input type="date" name="date" class="form-control" value="<?= date('Y-m-d') ?>">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Payment Method</label>
                    <select name="method" class="form-select">
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank Transfer</option>
                        <option value="bKash">bKash</option>
                        <option value="Other">Other Digital</option>
                    </select>
                </div>
                <div class="mb-0">
                    <label class="form-label fw-bold">Description / Purpose</label>
                    <textarea name="description" class="form-control" rows="3" placeholder="Explain the expense..."></textarea>
                </div>
            </div>
            <div class="modal-footer bg-light">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="add_expense" class="btn btn-danger px-4">Save Expense</button>
            </div>
        </form>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    var tabs = document.querySelectorAll('#financeTabs button');
    tabs.forEach(function(tab) {
        tab.addEventListener('shown.bs.tab', function(event) {
            var targetId = event.target.getAttribute('data-bs-target').replace('#', '');
            var activeTabInput = document.getElementById('activeTabInput');
            if (activeTabInput) {
                activeTabInput.value = targetId;
            }
        });
    });
});
</script>

