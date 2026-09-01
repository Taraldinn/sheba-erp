<?php
// BULK MONTHLY CLIENT STATEMENT
if (!hasRole('Admin') && !isOffice() && !hasRole('Reseller') && !hasRole('SubReseller')) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}

$month = $_GET['month'] ?? date('Y-m');
if (!preg_match('/^\d{4}-\d{2}$/', $month) || !checkdate((int)substr($month,5,2), 1, (int)substr($month,0,4))) {
    $month = date('Y-m');
}
$monthStart = $month . '-01';
$monthEnd = date('Y-m-t', strtotime($monthStart));
$statusFilter = strtolower(trim($_GET['status'] ?? 'all'));
$search = trim($_GET['search'] ?? '');
$allowedStatuses = ['all','paid','partial','due','unpaid'];
if (!in_array($statusFilter, $allowedStatuses, true)) $statusFilter = 'all';

$userId = (int)($_SESSION['admin_id'] ?? 0);
$role = $_SESSION['user_role'] ?? '';
$isAdminStatement = isAdminRole($role);
$showAllUsers = $isAdminStatement && (($_GET['show_all'] ?? '') === '1');

/*
 * Bulk Statement ownership scope:
 * - Admin default: only clients directly owned by the logged-in Admin.
 * - Reseller / SubReseller / POP / Branch: only clients directly owned by that login.
 * - Admin may explicitly enable show_all=1 to view every client in this tenant.
 *
 * Do not use getManagedStaffIds() here: Admin resolves to ALL and POP/Branch may
 * inherit a parent's scope, which is too broad for a financial statement.
 */
$where = ["DATE(COALESCE(u.joining_date, u.created_at)) <= ?"];
$params = [$monthEnd];
if (!$showAllUsers) {
    $where[] = "u.manager_id = ?";
    $params[] = $userId;
}
if ($search !== '') {
    $where[] = "(u.user_id LIKE ? OR u.client_code LIKE ? OR u.name LIKE ? OR u.phone LIKE ? OR u.user_package LIKE ?)";
    $like = '%' . $search . '%';
    array_push($params, $like, $like, $like, $like, $like);
}

$sql = "SELECT u.id,u.user_id,u.client_code,u.name,u.phone,u.user_package,u.bill_amount,u.discount,u.due,u.status,u.current_bill_date,u.manager_id,s.name AS manager_name
        FROM ".TBL_USERS." u
        LEFT JOIN ".TBL_STAFF." s ON s.id=u.manager_id
        WHERE ".implode(' AND ', $where)."
        ORDER BY u.user_id ASC";
$users = safeFetchAll($pdo, $sql, $params);

$userIds = array_column($users, 'id');
$logsByUser = [];
if (!empty($userIds)) {
    foreach (array_chunk($userIds, 800) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        $lp = array_merge($chunk, [$monthStart, $monthEnd]);
        $lq = "SELECT id,target_id,action_type,description,timestamp FROM ".TBL_LOGS."
               WHERE target_id IN ($ph)
                 AND action_type IN ('Recharge','Add Client','Pay Due')
                 AND DATE(timestamp) BETWEEN ? AND ?
               ORDER BY timestamp ASC,id ASC";
        foreach (safeFetchAll($pdo, $lq, $lp) as $log) {
            $logsByUser[(int)$log['target_id']][] = $log;
        }
    }
}

function bs_discount_from_log($description) {
    if (preg_match('/Discount:\s*৳?\s*([0-9,]+(?:\.\d+)?)/u', (string)$description, $m)) {
        return (float)str_replace(',', '', $m[1]);
    }
    return 0.0;
}

function bs_amount_from_log($description, $actionType) {
    $description = (string)$description;
    $patterns = [];
    if ($actionType === 'Pay Due') {
        $patterns = ['/Collected due amount:\s*৳?\s*([0-9,]+(?:\.\d+)?)/u', '/Amount:\s*৳?\s*([0-9,]+(?:\.\d+)?)/u'];
    } else {
        $patterns = ['/Amount:\s*৳?\s*([0-9,]+(?:\.\d+)?)/u', '/- Amount:\s*৳?\s*([0-9,]+(?:\.\d+)?)/u'];
    }
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $description, $m)) return (float)str_replace(',', '', $m[1]);
    }
    return 0.0;
}

$rows = [];
$summary = ['bill'=>0.0,'collection'=>0.0,'month_due'=>0.0,'current_due'=>0.0,'paid'=>0,'partial'=>0,'due'=>0,'unpaid'=>0];
foreach ($users as $u) {
    $bill = max(0, (float)$u['bill_amount'] - (float)$u['discount']);
    $directPaid = 0.0;
    $discountGiven = 0.0;
    $dueBilled = 0.0;
    $dueCollected = 0.0;
    $lastPayment = null;

    foreach ($logsByUser[(int)$u['id']] ?? [] as $log) {
        $amt = bs_amount_from_log($log['description'], $log['action_type']);
        if ($log['action_type'] === 'Pay Due') {
            $dueCollected += $amt;
            if ($amt > 0) $lastPayment = $log['timestamp'];
        } elseif ($log['action_type'] === 'Recharge') {
            $discountGiven += bs_discount_from_log($log['description']);
            $isDue = (stripos($log['description'], 'Trx: Due') !== false || stripos($log['description'], 'via Expire') !== false);
            if ($isDue) $dueBilled += $amt;
            else {
                $directPaid += $amt;
                if ($amt > 0) $lastPayment = $log['timestamp'];
            }
        } elseif ($log['action_type'] === 'Add Client') {
            if (stripos($log['description'], 'via Expire') !== false || stripos($log['description'], 'Trx: Due') !== false) $dueBilled += $amt;
            else {
                $directPaid += $amt;
                if ($amt > 0) $lastPayment = $log['timestamp'];
            }
        }
    }

    $collection = $directPaid + $dueCollected;
    $monthRemainingDue = max(0, $dueBilled - $dueCollected);
    if ($monthRemainingDue > 0.009) {
        $statementStatus = ($collection > 0.009) ? 'Partial' : 'Due';
    } elseif (($directPaid + $discountGiven) + 0.009 >= $bill && $bill > 0) {
        $statementStatus = 'Paid';
    } elseif ($collection > 0.009) {
        $statementStatus = 'Partial';
    } else {
        $statementStatus = 'Unpaid';
    }

    if ($statusFilter !== 'all' && strtolower($statementStatus) !== $statusFilter) continue;

    $row = [
        'id'=>(int)$u['id'],'user_id'=>$u['user_id'],'client_code'=>$u['client_code'],'name'=>$u['name'],'phone'=>$u['phone'],
        'package'=>$u['user_package'],'bill'=>$bill,'direct_paid'=>$directPaid,'due_collected'=>$dueCollected,
        'collection'=>$collection,'month_due'=>$monthRemainingDue,'current_due'=>max(0,(float)$u['due']),
        'statement_status'=>$statementStatus,'client_status'=>$u['status'],'expiry'=>$u['current_bill_date'],
        'last_payment'=>$lastPayment,'manager_name'=>$u['manager_name']
    ];
    $rows[] = $row;
    $summary['bill'] += $bill;
    $summary['collection'] += $collection;
    $summary['month_due'] += $monthRemainingDue;
    $summary['current_due'] += max(0,(float)$u['due']);
    $summary[strtolower($statementStatus)]++;
}

if (($_GET['export'] ?? '') === 'csv') {
    if (ob_get_length()) @ob_clean();
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="bulk-statement-'.$month.'.csv"');
    echo "\xEF\xBB\xBF";
    $out = fopen('php://output', 'w');
    fputcsv($out, ['SL','User ID','Client Code','Name','Phone','Package','Monthly Bill','Collected This Month','Monthly Due','Current Total Due','Statement Status','Client Status','Expiry','Last Payment','Manager']);
    foreach ($rows as $i=>$r) {
        fputcsv($out, [$i+1,$r['user_id'],$r['client_code'],$r['name'],$r['phone'],$r['package'],number_format($r['bill'],2,'.',''),number_format($r['collection'],2,'.',''),number_format($r['month_due'],2,'.',''),number_format($r['current_due'],2,'.',''),$r['statement_status'],$r['client_status'],$r['expiry'],$r['last_payment'],$r['manager_name']]);
    }
    fclose($out);
    exit;
}

$monthLabel = date('F Y', strtotime($monthStart));
$queryBase = ['tab'=>'bulk_statement','month'=>$month,'status'=>$statusFilter,'search'=>$search];
if ($showAllUsers) $queryBase['show_all'] = '1';
$bsScopeLabel = $showAllUsers ? 'All Users (Admin + Reseller / POP / Branch)' : 'My Direct Users';

// Company identity for the printable statement. Uses each tenant's own settings.
$bsCompanyName = get_opt($pdo, 'company_name', 'ISP Billing');
$bsCompanyAddress = get_opt($pdo, 'company_address', '');
$bsCompanyPhone = get_opt($pdo, 'company_phone', '');
$bsCompanyLogo = get_opt($pdo, 'logo_path', '');
$bsCollectionRate = $summary['bill'] > 0 ? min(100, ($summary['collection'] / $summary['bill']) * 100) : 0;
$bsStatementRef = 'BMS-' . date('Ym', strtotime($monthStart)) . '-' . str_pad((string)$userId, 3, '0', STR_PAD_LEFT);
$bsGeneratedAt = date('d M Y, h:i A');
?>
<style>
.bs-summary .card{border:0;border-radius:14px}.bs-table th{white-space:nowrap}.bs-table td{vertical-align:middle}.bs-user{min-width:190px}.bs-money{white-space:nowrap;font-weight:700}.bs-toolbar{border-radius:14px}.status-pill{font-size:.76rem;padding:.42rem .65rem;border-radius:999px}.status-Paid{background:#dcfce7;color:#166534}.status-Partial{background:#fef3c7;color:#92400e}.status-Due{background:#fee2e2;color:#991b1b}.status-Unpaid{background:#e2e8f0;color:#334155}.print-only{display:none}
@media print{
  @page{size:A4 landscape;margin:9mm 8mm 12mm 8mm}
  html,body{background:#fff!important;color:#172033!important;font-family:Arial,Helvetica,sans-serif!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .no-print,.sidebar,.navbar,.topbar{display:none!important}
  .main-content,.content-wrapper,.container-fluid{margin:0!important;padding:0!important;width:100%!important;max-width:none!important}
  .print-only{display:block!important}
  .screen-only{display:none!important}
  .bs-print-sheet{width:100%;margin:0;background:#fff}
  .bs-print-head{display:flex!important;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1f4f8f;padding:0 0 8px;margin-bottom:9px;gap:18px}
  .bs-print-brand{display:flex;align-items:center;gap:12px;min-width:0}
  .bs-print-logo{max-height:48px;max-width:125px;object-fit:contain}
  .bs-print-company{font-size:19px;font-weight:800;line-height:1.1;color:#15375f;margin-bottom:3px}
  .bs-print-contact{font-size:8.5px;line-height:1.45;color:#64748b;max-width:430px}
  .bs-print-title{text-align:right;min-width:235px}
  .bs-print-title h1{font-size:17px;line-height:1.1;margin:0;color:#172033;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
  .bs-print-period{font-size:11px;font-weight:700;color:#1f4f8f;margin-top:4px}
  .bs-print-meta{font-size:8px;color:#64748b;margin-top:4px;line-height:1.5}
  .bs-print-summary{display:grid!important;grid-template-columns:repeat(5,1fr);gap:6px;margin:0 0 8px}
  .bs-print-stat{border:1px solid #dbe3ec;border-radius:5px;padding:6px 7px;background:#f8fafc!important;min-width:0}
  .bs-print-stat .label{font-size:7.3px;text-transform:uppercase;letter-spacing:.35px;color:#64748b;font-weight:700;margin-bottom:2px}
  .bs-print-stat .value{font-size:12px;font-weight:800;color:#172033;white-space:nowrap}
  .bs-print-stat.good .value{color:#12834a}.bs-print-stat.bad .value{color:#c73434}.bs-print-stat.rate .value{color:#1f4f8f}
  .bs-print-statusbar{display:flex!important;gap:5px;align-items:center;margin-bottom:7px;font-size:7.5px;color:#475569}
  .bs-print-statusbar span{border:1px solid #dbe3ec;border-radius:10px;padding:3px 7px;background:#fff!important}
  .bs-print-statusbar strong{color:#172033}
  .card{border:0!important;box-shadow:none!important;border-radius:0!important}
  .card-body{padding:0!important}
  .table-responsive{overflow:visible!important}
  .bs-table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:7.35px!important;line-height:1.25!important;margin:0!important}
  .bs-table thead{display:table-header-group}
  .bs-table tfoot{display:table-footer-group}
  .bs-table tr{break-inside:avoid;page-break-inside:avoid}
  .bs-table th{background:#15375f!important;color:#fff!important;border:1px solid #15375f!important;padding:4px 4px!important;font-size:7px!important;font-weight:700!important;text-transform:uppercase;letter-spacing:.15px;white-space:normal!important}
  .bs-table td{border:1px solid #dfe5ec!important;padding:3px 4px!important;vertical-align:middle!important;color:#263445!important;background:#fff!important}
  .bs-table tbody tr:nth-child(even) td{background:#f8fafc!important}
  .bs-table a{color:#15375f!important;text-decoration:none!important;font-weight:700!important}
  .bs-table .small{font-size:6.5px!important;line-height:1.25!important;color:#64748b!important}
  .bs-user{min-width:0!important}
  .bs-money{font-weight:700!important;white-space:nowrap!important}
  .status-pill{display:inline-block!important;font-size:6.6px!important;line-height:1!important;padding:3px 5px!important;border-radius:8px!important;border:1px solid #dbe3ec!important;background:#fff!important;color:#334155!important;font-weight:700!important}
  .status-Paid{color:#0f7a43!important;border-color:#b8dec9!important}.status-Partial{color:#9a5b0b!important;border-color:#ead2aa!important}.status-Due{color:#b52c2c!important;border-color:#edb8b8!important}.status-Unpaid{color:#475569!important;border-color:#cbd5e1!important}
  .bs-table tfoot td{background:#eaf0f7!important;color:#172033!important;font-weight:800!important;border-top:1.5px solid #15375f!important;padding:5px 4px!important}
  .print-hide{display:none!important}
  .col-sl{width:3.2%}.col-client{width:24%}.col-package{width:12%}.col-money{width:10.5%}.col-status{width:7.5%}.col-expiry{width:8.5%}
  .bs-print-note{margin-top:6px;padding-top:5px;border-top:1px solid #dbe3ec;font-size:6.8px;line-height:1.4;color:#64748b}
  .bs-print-footer{position:fixed;left:8mm;right:8mm;bottom:4mm;border-top:1px solid #dbe3ec;padding-top:3px;display:flex!important;justify-content:space-between;font-size:6.5px;color:#7b8796;background:#fff!important}
}
</style>

<div class="print-only bs-print-sheet">
  <div class="bs-print-head">
    <div class="bs-print-brand">
      <?php if ($bsCompanyLogo && file_exists(__DIR__ . '/../../' . $bsCompanyLogo)): ?>
        <img src="<?= htmlspecialchars($bsCompanyLogo) ?>" alt="Logo" class="bs-print-logo">
      <?php endif; ?>
      <div>
        <div class="bs-print-company"><?= htmlspecialchars($bsCompanyName) ?></div>
        <div class="bs-print-contact">
          <?php if($bsCompanyAddress): ?><?= nl2br(htmlspecialchars($bsCompanyAddress)) ?><?php endif; ?>
          <?php if($bsCompanyPhone): ?><br>Phone: <?= htmlspecialchars($bsCompanyPhone) ?><?php endif; ?>
        </div>
      </div>
    </div>
    <div class="bs-print-title">
      <h1>Bulk Monthly Statement</h1>
      <div class="bs-print-period"><?= htmlspecialchars($monthLabel) ?></div>
      <div class="bs-print-meta">Scope: <?= htmlspecialchars($bsScopeLabel) ?><br>Statement Ref: <?= htmlspecialchars($bsStatementRef) ?><br>Generated: <?= htmlspecialchars($bsGeneratedAt) ?></div>
    </div>
  </div>
  <div class="bs-print-summary">
    <div class="bs-print-stat"><div class="label">Monthly Bill</div><div class="value">৳<?= number_format($summary['bill'],2) ?></div></div>
    <div class="bs-print-stat good"><div class="label">Collected</div><div class="value">৳<?= number_format($summary['collection'],2) ?></div></div>
    <div class="bs-print-stat bad"><div class="label">Monthly Due</div><div class="value">৳<?= number_format($summary['month_due'],2) ?></div></div>
    <div class="bs-print-stat bad"><div class="label">Current Total Due</div><div class="value">৳<?= number_format($summary['current_due'],2) ?></div></div>
    <div class="bs-print-stat rate"><div class="label">Collection Rate</div><div class="value"><?= number_format($bsCollectionRate,1) ?>%</div></div>
  </div>
  <div class="bs-print-statusbar">
    <span><strong><?= count($rows) ?></strong> Total Clients</span>
    <span><strong><?= $summary['paid'] ?></strong> Paid</span>
    <span><strong><?= $summary['partial'] ?></strong> Partial</span>
    <span><strong><?= $summary['due'] ?></strong> Due</span>
    <span><strong><?= $summary['unpaid'] ?></strong> Unpaid</span>
  </div>
</div>
<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 screen-only">
  <div><h4 class="mb-1 fw-bold"><i class="fas fa-file-invoice-dollar me-2 text-primary"></i>Bulk Monthly Statement</h4><div class="text-muted small"><?= htmlspecialchars($monthLabel) ?> · Scope: <strong><?= htmlspecialchars($bsScopeLabel) ?></strong></div></div>
  <div class="d-flex gap-2 no-print">
    <a class="btn btn-outline-success" href="?<?= htmlspecialchars(http_build_query(array_merge($queryBase,['export'=>'csv']))) ?>"><i class="fas fa-file-csv me-1"></i> CSV Export</a>
    <button class="btn btn-outline-dark" type="button" onclick="window.print()"><i class="fas fa-print me-1"></i> Print</button>
  </div>
</div>

<div class="card shadow-sm border-0 mb-3 bs-toolbar no-print"><div class="card-body">
<form class="row g-2 align-items-end" method="get" id="bulkStatementFilterForm">
<input type="hidden" name="tab" value="bulk_statement">
<div class="col-md-2"><label class="form-label small fw-bold">Month</label><input type="month" name="month" class="form-control" value="<?= htmlspecialchars($month) ?>"></div>
<div class="col-md-2"><label class="form-label small fw-bold">Statement Status</label><select name="status" class="form-select"><option value="all">All</option><?php foreach(['paid'=>'Paid','partial'=>'Partial','due'=>'Due','unpaid'=>'Unpaid'] as $k=>$v): ?><option value="<?= $k ?>" <?= $statusFilter===$k?'selected':'' ?>><?= $v ?></option><?php endforeach; ?></select></div>
<div class="col-md-4"><label class="form-label small fw-bold">Search Client</label><input type="text" name="search" class="form-control" value="<?= htmlspecialchars($search) ?>" placeholder="User ID, client code, name, phone or package"></div>
<?php if ($isAdminStatement): ?>
<div class="col-md-2">
  <label class="form-label small fw-bold d-block">User Scope</label>
  <div class="form-check form-switch border rounded px-3 py-2 bg-light" style="min-height:38px">
    <input class="form-check-input ms-0 me-2" type="checkbox" role="switch" id="showAllStatementUsers" name="show_all" value="1" <?= $showAllUsers ? 'checked' : '' ?> onchange="this.form.submit()">
    <label class="form-check-label small fw-semibold" for="showAllStatementUsers">Show All Users</label>
  </div>
</div>
<?php endif; ?>
<div class="<?= $isAdminStatement ? 'col-md-2' : 'col-md-4' ?> d-flex gap-2"><button class="btn btn-primary flex-fill"><i class="fas fa-filter me-1"></i> Apply</button><a href="?tab=bulk_statement&month=<?= urlencode($month) ?><?= $showAllUsers ? '&show_all=1' : '' ?>" class="btn btn-outline-secondary">Reset</a></div>
</form></div></div>

<div class="row g-3 mb-3 bs-summary screen-only">
<div class="col-6 col-lg-3"><div class="card shadow-sm h-100"><div class="card-body"><div class="small text-muted">Total Monthly Bill</div><div class="h4 mb-0 fw-bold">৳<?= number_format($summary['bill'],2) ?></div></div></div></div>
<div class="col-6 col-lg-3"><div class="card shadow-sm h-100"><div class="card-body"><div class="small text-muted">Collected This Month</div><div class="h4 mb-0 fw-bold text-success">৳<?= number_format($summary['collection'],2) ?></div></div></div></div>
<div class="col-6 col-lg-3"><div class="card shadow-sm h-100"><div class="card-body"><div class="small text-muted">Monthly Due Generated</div><div class="h4 mb-0 fw-bold text-danger">৳<?= number_format($summary['month_due'],2) ?></div></div></div></div>
<div class="col-6 col-lg-3"><div class="card shadow-sm h-100"><div class="card-body"><div class="small text-muted">Current Total Due</div><div class="h4 mb-0 fw-bold text-danger">৳<?= number_format($summary['current_due'],2) ?></div></div></div></div>
</div>

<div class="d-flex gap-2 flex-wrap mb-3 small screen-only">
<span class="status-pill status-Paid">Paid: <?= $summary['paid'] ?></span><span class="status-pill status-Partial">Partial: <?= $summary['partial'] ?></span><span class="status-pill status-Due">Due: <?= $summary['due'] ?></span><span class="status-pill status-Unpaid">Unpaid: <?= $summary['unpaid'] ?></span><span class="badge bg-light text-dark border p-2">Total Users: <?= count($rows) ?></span>
</div>

<div class="card shadow-sm border-0"><div class="card-body p-0"><div class="table-responsive">
<table class="table table-hover mb-0 bs-table"><thead class="table-light"><tr><th class="ps-3 col-sl">#</th><th class="col-client">Client</th><th class="col-package">Package</th><th class="text-end col-money">Monthly Bill</th><th class="text-end col-money">Collected</th><th class="text-end col-money">Monthly Due</th><th class="text-end col-money">Current Due</th><th class="col-status">Status</th><th class="col-expiry">Expiry</th><th class="print-hide">Last Payment</th><th class="print-hide">Manager</th></tr></thead><tbody>
<?php if(empty($rows)): ?><tr><td colspan="11" class="text-center text-muted py-5"><i class="fas fa-inbox fa-2x mb-2 d-block"></i>No client statements found for this filter.</td></tr>
<?php else: foreach($rows as $i=>$r): ?><tr>
<td class="ps-3"><?= $i+1 ?></td><td class="bs-user"><a class="fw-bold text-decoration-none" href="?view_id=<?= $r['id'] ?>"><?= htmlspecialchars($r['user_id']) ?></a><?php if($r['client_code']): ?><div class="small text-muted"><?= htmlspecialchars($r['client_code']) ?></div><?php endif; ?><div class="small"><?= htmlspecialchars($r['name']) ?> · <?= htmlspecialchars($r['phone']) ?></div></td>
<td><div class="fw-semibold"><?= htmlspecialchars($r['package']) ?></div><div class="small text-muted"><?= htmlspecialchars($r['client_status']) ?></div></td>
<td class="text-end bs-money">৳<?= number_format($r['bill'],2) ?></td><td class="text-end bs-money text-success">৳<?= number_format($r['collection'],2) ?></td><td class="text-end bs-money <?= $r['month_due']>0?'text-danger':'' ?>">৳<?= number_format($r['month_due'],2) ?></td><td class="text-end bs-money <?= $r['current_due']>0?'text-danger':'' ?>">৳<?= number_format($r['current_due'],2) ?></td>
<td><span class="status-pill status-<?= $r['statement_status'] ?>"><?= $r['statement_status'] ?></span></td><td class="small"><?= $r['expiry']?date('d M Y',strtotime($r['expiry'])):'-' ?></td><td class="small print-hide"><?= $r['last_payment']?date('d M Y, h:i A',strtotime($r['last_payment'])):'-' ?></td><td class="small print-hide"><?= htmlspecialchars($r['manager_name'] ?: '-') ?></td>
</tr><?php endforeach; endif; ?></tbody>
<tfoot class="table-light fw-bold"><tr><td colspan="3" class="ps-3">TOTAL</td><td class="text-end">৳<?= number_format($summary['bill'],2) ?></td><td class="text-end text-success">৳<?= number_format($summary['collection'],2) ?></td><td class="text-end text-danger">৳<?= number_format($summary['month_due'],2) ?></td><td class="text-end text-danger">৳<?= number_format($summary['current_due'],2) ?></td><td colspan="2"></td><td colspan="2" class="print-hide"></td></tr></tfoot>
</table></div></div></div>
<div class="alert alert-light border mt-3 small mb-0 screen-only"><i class="fas fa-info-circle me-1 text-primary"></i><strong>Statement logic:</strong> Paid/partial/due values are calculated from Recharge, Add Client and Pay Due activity recorded inside the selected calendar month. “Current Total Due” shows the client’s present due balance and may include older months.</div>

<div class="print-only bs-print-note"><strong>Statement note:</strong> Monthly collection and due figures are calculated from Recharge, Add Client and Pay Due activity recorded during the selected calendar month. Current Total Due is the present client due balance and may include previous months.</div>
<div class="print-only bs-print-footer"><span><?= htmlspecialchars($bsCompanyName) ?> · Monthly Billing Statement · <?= htmlspecialchars($monthLabel) ?></span><span>System generated report — no signature required</span></div>
