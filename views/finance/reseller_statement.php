<?php
// RESELLER STATEMENT VIEW
if(!hasRole('Reseller') && !hasRole('Supervisor')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$target_id = intval($_GET['id'] ?? 0);
if ($target_id <= 0) { echo "<div class='alert alert-warning'>Invalid Reseller ID.</div>"; return; }

$staff = safeFetch($pdo, "SELECT * FROM ".TBL_STAFF." WHERE id=?", [$target_id]);
if (!$staff) { echo "<div class='alert alert-danger'>Reseller not found.</div>"; return; }

// Verify permission: Only Admin can see any reseller, Resellers can only see their children
if (!hasRole('Admin') && $staff['parent_id'] != $user && $staff['supervisor_id'] != $user) {
    echo "<div class='alert alert-danger'>Access Denied. You can only view statements for your own sub-resellers.</div>";
    return;
}
?>

<style>
@media print {
    /* Prevent table scrolling in Print/PDF */
    .table-responsive {
        overflow-x: visible !important;
        overflow: visible !important;
    }
    table {
        width: 100% !important;
        table-layout: auto !important;
    }
    th, td {
        font-size: 10px !important; /* Shrink to fit */
        padding: 3px !important;
        word-break: break-word !important;
        white-space: normal !important; /* Wrap contents instead of keeping inline */
    }
}
</style>

<?php
$page = intval($_GET['p'] ?? 1);
$per_page = 50;
$offset = ($page - 1) * $per_page;

$start_date = $_GET['start_date'] ?? '';
$end_date = $_GET['end_date'] ?? '';

$base_query = "SELECT t.*, s.username as staff_name FROM ".TBL_TX." t LEFT JOIN ".TBL_STAFF." s ON t.added_by = s.id WHERE t.staff_id=? AND (t.description LIKE 'Fund Received from:%' OR t.description LIKE 'Credit Given by:%' OR t.description LIKE 'Paid Expire to:%' OR t.description LIKE 'Discount received from:%' OR t.description LIKE 'Balance Refund:%')";
$count_query = "SELECT COUNT(*) FROM ".TBL_TX." t WHERE t.staff_id=? AND (t.description LIKE 'Fund Received from:%' OR t.description LIKE 'Credit Given by:%' OR t.description LIKE 'Paid Expire to:%' OR t.description LIKE 'Discount received from:%' OR t.description LIKE 'Balance Refund:%')";

$params = [$target_id];

if ($start_date) {
    $base_query .= " AND t.created_at >= ?";
    $count_query .= " AND t.created_at >= ?";
    $params[] = $start_date . " 00:00:00";
}
if ($end_date) {
    $base_query .= " AND t.created_at <= ?";
    $count_query .= " AND t.created_at <= ?";
    $params[] = $end_date . " 23:59:59";
}

$stmt = $pdo->prepare("$base_query ORDER BY t.id DESC LIMIT $per_page OFFSET $offset");
$stmt->execute($params);
$txs = $stmt->fetchAll();

$total_txs = $pdo->prepare($count_query);
$total_txs->execute($params);
$total_count = $total_txs->fetchColumn();
$total_pages = ceil($total_count / $per_page);
?>

<?php
// Fetch Company Info for Print Header
$company_name = get_opt($pdo, 'company_name', 'ISP Billing System');
$company_logo = get_opt($pdo, 'company_logo', '');
$company_address = get_opt($pdo, 'company_address', ''); 
$company_phone = get_opt($pdo, 'company_phone', '');
$company_email = get_opt($pdo, 'company_email', '');
?>

<!-- Print Header (Visible only in Print Mode) -->
<div class="d-none d-print-block mb-4 border-bottom pb-3">
    <div class="row">
        <div class="col-6">
            <?php if ($company_logo): ?>
                <img src="<?= htmlspecialchars($company_logo) ?>" alt="Logo" style="max-height: 60px;" class="mb-2">
            <?php else: ?>
                <h3 class="fw-bold mb-0"><?= htmlspecialchars($company_name) ?></h3>
            <?php endif; ?>
            <div class="small">
                <?php if($company_address): ?><div><i class="fas fa-map-marker-alt me-1"></i> <?= htmlspecialchars($company_address) ?></div><?php endif; ?>
                <?php if($company_phone): ?><div><i class="fas fa-phone me-1"></i> <?= htmlspecialchars($company_phone) ?></div><?php endif; ?>
                <?php if($company_email): ?><div><i class="fas fa-envelope me-1"></i> <?= htmlspecialchars($company_email) ?></div><?php endif; ?>
            </div>
        </div>
        <div class="col-6 text-end">
             <h5 class="fw-bold mb-1">RESELLER STATEMENT</h5>
             <h6 class="mb-2"><?= htmlspecialchars($staff['name']) ?> (<?= htmlspecialchars($staff['username']) ?>)</h6>
             <div class="small">
                <?php if(!empty($staff['address'])): ?><div><?= htmlspecialchars($staff['address']) ?></div><?php endif; ?>
                <?php if(!empty($staff['phone'])): ?><div><?= htmlspecialchars($staff['phone']) ?></div><?php endif; ?>
                <?php if(!empty($staff['email'])): ?><div><?= htmlspecialchars($staff['email']) ?></div><?php endif; ?>
             </div>
        </div>
    </div>
</div>

<div class="d-flex justify-content-between align-items-center mb-4 d-print-none">
    <h4 class="mb-0"><i class="fas fa-file-invoice-dollar me-2 text-primary"></i> Transaction Statement: <?= htmlspecialchars($staff['name']) ?> (<?= htmlspecialchars($staff['username']) ?>)</h4>
    <a href="?tab=agents" class="btn btn-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i> Back to Resellers</a>
</div>

<!-- Date Filter Form -->
<div class="card shadow-sm border-0 mb-4 d-print-none">
    <div class="card-body">
        <form class="row g-2 align-items-end" method="GET">
            <input type="hidden" name="tab" value="reseller_statement">
            <input type="hidden" name="id" value="<?= $target_id ?>">
            
            <div class="col-md-4">
                <label class="form-label small fw-bold text-muted">From Date</label>
                <input type="date" name="start_date" class="form-control form-control-sm" value="<?= htmlspecialchars($start_date) ?>">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold text-muted">To Date</label>
                <input type="date" name="end_date" class="form-control form-control-sm" value="<?= htmlspecialchars($end_date) ?>">
            </div>
            <div class="col-md-4 d-flex gap-2">
                <button type="submit" class="btn btn-primary btn-sm w-100"><i class="fas fa-filter me-1"></i> Filter</button>
                <a href="?tab=reseller_statement&id=<?= $target_id ?>" class="btn btn-outline-secondary btn-sm w-100">Reset</a>
            </div>
        </form>
    </div>
</div>

<div class="row mb-4 d-print-none">
    <div class="col-md-4">
        <div class="card border-0 shadow-sm bg-primary text-white">
            <div class="card-body">
                <h6 class="card-subtitle mb-2 opacity-75">Wallet Balance</h6>
                <h3 class="card-title mb-0">৳<?= number_format($staff['balance'], 2) ?></h3>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card border-0 shadow-sm bg-danger text-white">
            <div class="card-body">
                <h6 class="card-subtitle mb-2 opacity-75">Outstanding Due</h6>
                <h3 class="card-title mb-0">৳<?= number_format($staff['due_balance'], 2) ?></h3>
            </div>
        </div>
    </div>
    <div class="col-md-4 text-end">
        <button onclick="window.print()" class="btn btn-outline-dark mt-3"><i class="fas fa-print me-1"></i> Print Statement</button>
    </div>
</div>

<div class="card border-0 shadow-sm">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Date & Time</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Staff/Panel</th>
                        <th>Method</th>
                        <th class="text-end">Amount</th>
                        <th class="text-end">Due Balance</th>
                        <th class="text-end pe-3">Wallet</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($txs)): ?>
                    <tr>
                        <td colspan="8" class="text-center py-4 text-muted">No transactions found for this staff member.</td>
                    </tr>
                    <?php else: ?>
                        <?php foreach ($txs as $tx): ?>
                        <tr>
                            <td class="ps-3 small"><?= date('d M Y, h:i A', strtotime($tx['created_at'])) ?></td>
                            <td>
                                <?php 
                                    $badge = 'bg-secondary';
                                    if ($tx['type'] == 'Income') $badge = 'bg-success';
                                    if ($tx['type'] == 'Payment') $badge = 'bg-info';
                                    if ($tx['type'] == 'Credit') $badge = 'bg-warning text-dark';
                                    if ($tx['type'] == 'Discount') $badge = 'bg-primary';
                                    if ($tx['type'] == 'Expense') $badge = 'bg-danger';
                                ?>
                                <span class="badge <?= $badge ?> rounded-pill px-3"><?= $tx['type'] ?></span>
                            </td>
                            <td class="small"><?= htmlspecialchars($tx['description']) ?></td>
                            <td class="small fw-bold text-dark"><?= htmlspecialchars($tx['staff_name'] ?? 'System') ?></td>
                            <td class="small opacity-75"><?= $tx['method'] ?></td>
                            <td class="text-end fw-bold">
                                <?php if ($tx['type'] == 'Expense' || $tx['type'] == 'Payment' || $tx['type'] == 'Discount'): ?>
                                    <span class="text-danger">-৳<?= number_format($tx['amount'], 2) ?></span>
                                <?php else: ?>
                                    <span class="text-success">+৳<?= number_format($tx['amount'], 2) ?></span>
                                <?php endif; ?>
                            </td>
                            <td class="text-end text-danger fw-bold">
                                ৳<?= number_format($tx['running_due'], 2) ?>
                            </td>
                            <td class="text-end pe-3 text-muted">
                                ৳<?= number_format($tx['running_balance'], 2) ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
    <?php if ($total_pages > 1): ?>
    <div class="card-footer bg-white border-0 py-3">
        <nav aria-label="Statement navigation">
            <ul class="pagination pagination-sm justify-content-center mb-0">
                <li class="page-item <?= ($page <= 1) ? 'disabled' : '' ?>">
                    <a class="page-link" href="?tab=reseller_statement&id=<?= $target_id ?>&p=<?= $page-1 ?>&start_date=<?= urlencode($start_date) ?>&end_date=<?= urlencode($end_date) ?>">Previous</a>
                </li>
                <?php for($i=1; $i<=$total_pages; $i++): ?>
                <li class="page-item <?= ($i == $page) ? 'active' : '' ?>">
                    <a class="page-link" href="?tab=reseller_statement&id=<?= $target_id ?>&p=<?= $i ?>&start_date=<?= urlencode($start_date) ?>&end_date=<?= urlencode($end_date) ?>"><?= $i ?></a>
                </li>
                <?php endfor; ?>
                <li class="page-item <?= ($page >= $total_pages) ? 'disabled' : '' ?>">
                    <a class="page-link" href="?tab=reseller_statement&id=<?= $target_id ?>&p=<?= $page+1 ?>&start_date=<?= urlencode($start_date) ?>&end_date=<?= urlencode($end_date) ?>">Next</a>
                </li>
            </ul>
        </nav>
    </div>
    <?php endif; ?>
</div>

<style>
@media print {
    .btn, .pagination, footer, header, #mainSidebar, .navbar { display: none !important; }
    .card { border: none !important; box-shadow: none !important; }
    .table { width: 100% !important; border-collapse: collapse !important; }
    .table th, .table td { border: 1px solid #dee2e6 !important; padding: 4px 8px !important; }
    .bg-light { background-color: #f8f9fa !important; -webkit-print-color-adjust: exact; }
}
</style>
