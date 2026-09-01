<?php
// views/client/recharge_invoice.php
// --- CLIENT RECHARGE INVOICE / RECEIPT ---

$log_id = intval($_GET['id'] ?? 0);
if ($log_id <= 0) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm'><i class='fas fa-exclamation-circle me-2'></i>Invalid Invoice ID.</div></div>";
    return;
}

// Fetch the recharge log entry — Extend Service is intentionally excluded (no invoice)
$log = safeFetch($pdo, "SELECT * FROM " . TBL_LOGS . " WHERE id = ? AND action_type IN ('Recharge', 'Add Client', 'Pay Due')", [$log_id]);

if (!$log) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm'><i class='fas fa-exclamation-circle me-2'></i>Invoice not found.</div></div>";
    return;
}

$is_client_panel = isset($_GET['panel']) && $_GET['panel'] === 'client';
$is_admin_logged_in = isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true;

// Security Check: Clients can only see their own logs, Admins/Staff can see all
if (!$is_admin_logged_in && (!$is_client_panel || !isset($client_id) || $log['target_id'] != $client_id)) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm'><i class='fas fa-lock me-2'></i>Access Denied. You are not authorized to view this invoice.</div></div>";
    return;
}

// Fetch client details dynamically if not set or mismatched
if (!isset($c) || $c['id'] != $log['target_id']) {
    $c = safeFetch($pdo, "SELECT u.*, r.name as r_name FROM ".TBL_USERS." u LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id WHERE u.id=?", [$log['target_id']]);
}
if (!$c) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm'><i class='fas fa-exclamation-circle me-2'></i>Client details not found.</div></div>";
    return;
}

// Fetch general settings for invoice header
$invoice_logo = get_opt($pdo, 'logo_path', '');
$comp_name = get_opt($pdo, 'company_name', 'ISP Billing');
$comp_email = get_opt($pdo, 'company_email', 'billing@isp.com');
$comp_phone = get_opt($pdo, 'company_phone', '+880 1234-567890');
$comp_address = get_opt($pdo, 'company_address', 'Your ISP Corporate Office Address');

// Overrides for reseller's custom invoice branding if set
if (!empty($c['manager_id']) && $c['manager_id'] > 0) {
    $mgr = safeFetch($pdo, "SELECT invoice_config FROM " . TBL_STAFF . " WHERE id = ?", [$c['manager_id']]);
    if ($mgr && !empty($mgr['invoice_config'])) {
        $mgr_config = json_decode($mgr['invoice_config'], true);
        if (is_array($mgr_config)) {
            if (!empty($mgr_config['name'])) {
                $comp_name = $mgr_config['name'];
            }
            if (!empty($mgr_config['email'])) {
                $comp_email = $mgr_config['email'];
            }
            if (!empty($mgr_config['phone'])) {
                $comp_phone = $mgr_config['phone'];
            }
            if (!empty($mgr_config['address'])) {
                $comp_address = $mgr_config['address'];
            }
        }
    }
}

// Parse recharge details from the audit log description
$desc = $log['description'];

// 1. Parse Amount
$amount = 0.00;
if (preg_match('/Amount:\s*(?:৳|BDT|Tk)?\s*([0-9,.]+)/iu', $desc, $matches)) {
    $amount = floatval(str_replace(',', '', $matches[1]));
} else {
    $amount = floatval($c['bill_amount']); // fallback
}

// 1b. Parse recharge discount metadata (new tenant-controlled discount mode)
$recharge_discount = 0.00;
$gross_amount = 0.00;
$paid_amount = $amount;
if (preg_match('/Discount:\s*(?:৳|BDT|Tk)?\s*([0-9,.]+)/iu', $desc, $matches)) {
    $recharge_discount = floatval(str_replace(',', '', $matches[1]));
}
if (preg_match('/Gross:\s*(?:৳|BDT|Tk)?\s*([0-9,.]+)/iu', $desc, $matches)) {
    $gross_amount = floatval(str_replace(',', '', $matches[1]));
}
if (preg_match('/Paid:\s*(?:৳|BDT|Tk)?\s*([0-9,.]+)/iu', $desc, $matches)) {
    $paid_amount = floatval(str_replace(',', '', $matches[1]));
}
if ($gross_amount <= 0 && $recharge_discount > 0) {
    $gross_amount = $amount + $recharge_discount;
}

// 2. Parse Days/Validity (supports both "for X days" and "Validity: X days")
$days = 30;
if (preg_match('/(?:for|Validity:)\s*(\d+)\s*days/i', $desc, $matches)) {
    $days = intval($matches[1]);
}

// 3. Parse Payment Method / Gateway
$method = 'Cash';
if (preg_match('/via\s+([a-zA-Z0-9]+)/i', $desc, $matches)) {
    $method = trim($matches[1]);
} elseif (preg_match('/Trx:\s*([a-zA-Z0-9]+)/i', $desc, $matches)) {
    $trx_val = strtolower(trim($matches[1]));
    if (in_array($trx_val, ['bkash', 'nagad', 'rocket', 'bank', 'cash', 'nagad_callback', 'bkash_callback', 'sslcommerz', 'sslcz_callback'])) {
        if (strpos($trx_val, 'bkash') !== false) $method = 'bKash';
        elseif (strpos($trx_val, 'nagad') !== false) $method = 'Nagad';
        elseif (strpos($trx_val, 'ssl') !== false) $method = 'SSLCOMMERZ';
        else $method = ucfirst($trx_val);
    }
}

// 4. Parse Transaction ID
$trx_id = 'N/A';
if (preg_match('/Trx:\s*([a-zA-Z0-9\-\_]+)/i', $desc, $matches)) {
    $trx_id = trim($matches[1]);
}

// 5. Parse Credit Days info (if credit was applied at recharge time)
$credit_days_applied = 0;
$credit_given_on     = '';
if (preg_match('/Credit:\s*(\d+)\s*days\s*\(given:\s*([^)]+)\)/i', $desc, $matches)) {
    $credit_days_applied = intval($matches[1]);
    $credit_given_on     = trim($matches[2]);
}

// 6. Parse New Expiry Date from log description
$new_expiry_date = '';
$new_expiry_formatted = '';
if (preg_match('/Expiry:\s*(\d{4}-\d{2}-\d{2})/i', $desc, $matches)) {
    $new_expiry_date      = $matches[1];
    $new_expiry_formatted = date('d M Y', strtotime($new_expiry_date));
}

// ── Payment Status Detection ──────────────────────────────────────────────
$is_due_recharge = false;   // Recharged but client owes money (Expire/Due method)
$is_pay_due      = false;   // This log IS a due payment receipt
$due_is_paid     = false;   // Due recharge that was later paid
$due_paid_log    = null;    // The matching Pay Due log if found

if ($log['action_type'] === 'Pay Due') {
    // This invoice IS a due payment receipt
    $is_pay_due = true;
    $method = 'Due Payment';
    // Parse amount from Pay Due description: "Collected due amount: ৳500 from user_id via Cash"
    if (preg_match('/[৳]?\s*([0-9,.]+)/u', $desc, $ma)) {
        $amount = floatval(str_replace(',', '', $ma[1]));
    }
    // Parse payment method from Pay Due log
    if (preg_match('/via\s+(\S+)/i', $desc, $ma)) {
        $method = trim($ma[1]);
    }
    $days = 0; // Pay Due has no validity days
} elseif (stripos($desc, 'Trx: Due') !== false || $method === 'Due' || $method === 'Expire') {
    // Recharge that was given on credit/due
    $is_due_recharge = true;
    $method = 'Due (Unpaid)';
    $trx_id = 'N/A'; // Hide the internal Trx: Due marker

    // Check if a Pay Due log exists for this client AFTER this recharge
    $due_paid_log = safeFetch($pdo,
        "SELECT * FROM " . TBL_LOGS .
        " WHERE target_id = ? AND action_type = 'Pay Due' AND timestamp >= ? ORDER BY timestamp ASC LIMIT 1",
        [$log['target_id'], $log['timestamp']]
    );
    if ($due_paid_log) {
        $due_is_paid = true;
        $method = 'Due (Paid)';
    }
}

// Dynamic Invoice Number
$invoice_no = "INV-REC-" . str_pad($log['id'], 6, '0', STR_PAD_LEFT);

// 5. Resolve who issued this invoice (from audit log)
$issued_by_username = $log['admin_user'] ?? 'System';
$issued_by_role = 'System';
$issued_by_label = 'System';
if (!empty($log['staff_id']) && intval($log['staff_id']) > 0) {
    $issuer = safeFetch($pdo, "SELECT id, username, name, role, parent_id FROM " . TBL_STAFF . " WHERE id=?", [intval($log['staff_id'])]);
    if ($issuer) {
        $issued_by_username = $issuer['username'];
        $raw_role = strtolower(trim($issuer['role'] ?? ''));
        if ($raw_role === 'admin' || $raw_role === 'superadmin') {
            $issued_by_role = 'Admin';
            $issued_by_label = 'Admin';
        } elseif ($raw_role === 'pop') {
            $issued_by_role = 'POP';
            $issued_by_label = 'POP Panel';
        } elseif ($raw_role === 'reseller') {
            $issued_by_role = 'Reseller';
            $issued_by_label = 'Reseller Panel';
        } elseif ($raw_role === 'staff' || $raw_role === 'subreseller') {
            $issued_by_role = 'Staff';
            $issued_by_label = 'Staff Panel';
        } else {
            $issued_by_role = ucfirst($issuer['role'] ?? 'Staff');
            $issued_by_label = $issued_by_role . ' Panel';
        }
    }
} else {
    // Fallback: check if it's the system admin via admin_user field
    $issued_by_role = 'Admin';
    $issued_by_label = 'Admin Panel';
}

// Load client panel header
if ($is_client_panel) {
    require_once __DIR__ . '/layout/header.php';
}
?>

<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    .invoice-container {
        font-family: 'Inter', sans-serif;
    }
    .invoice-card {
        border-radius: 16px;
        background: #fff;
        border: 1px solid #eef2f6;
    }
    .invoice-header {
        border-bottom: 2px dashed #eef2f6;
        padding-bottom: 24px;
    }
    /* ── Action Bar ── */
    .invoice-action-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }
    .invoice-back {
        flex-shrink: 0;
    }
    .invoice-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    /* On very small screens: actions fill full width, equal columns */
    @media (max-width: 575px) {
        .invoice-action-bar {
            flex-direction: column;
            align-items: stretch;
        }
        .invoice-back .btn {
            width: 100%;
        }
        .invoice-actions {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
        }
        .invoice-actions .btn {
            width: 100%;
            padding-left: 4px;
            padding-right: 4px;
            font-size: 0.78rem;
            text-align: center;
        }
    }
    .invoice-logo {
        max-height: 60px;
        max-width: 180px;
    }
    .invoice-section-title {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #94a3b8;
        font-weight: 700;
        margin-bottom: 8px;
    }
    .table-invoice th {
        font-size: 0.75rem;
        text-transform: uppercase;
        font-weight: 700;
        color: #475569;
        background: #f8fafc;
        border-bottom: 2px solid #f1f5f9;
        padding: 12px 16px;
    }
    .table-invoice td {
        padding: 16px;
        border-bottom: 1px solid #f1f5f9;
    }
    .issued-by-box {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 12px 18px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        font-size: 0.85rem;
    }
    .issued-by-box .role-badge {
        font-size: 0.7rem;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 9999px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
    }
    .role-admin    { background: #dbeafe; color: #1d4ed8; }
    .role-reseller { background: #dcfce7; color: #15803d; }
    .role-pop      { background: #fef9c3; color: #a16207; }
    .role-staff    { background: #ede9fe; color: #6d28d9; }
    .role-system   { background: #f1f5f9; color: #475569; }
    .receipt-badge {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: 9999px;
        display: inline-block;
    }
    .receipt-badge.badge-success {
        background-color: #ecfdf5;
        color: #059669;
        border: 1px solid #a7f3d0;
    }
    .receipt-badge.badge-warning {
        background-color: #fffbeb;
        color: #d97706;
        border: 1px solid #fcd34d;
    }
    .receipt-badge.badge-info {
        background-color: #eff6ff;
        color: #2563eb;
        border: 1px solid #bfdbfe;
    }

    @media print {
        body * {
            visibility: hidden;
        }
        #printable-invoice, #printable-invoice * {
            visibility: visible;
        }
        #printable-invoice {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        .no-print {
            display: none !important;
        }
    }

    /* POS Print Mode Overrides */
    @media print {
        body.pos-mode {
            background: #fff;
            color: #000;
            margin: 0;
            padding: 0;
        }
        body.pos-mode * {
            visibility: hidden;
        }
        body.pos-mode #printable-invoice, body.pos-mode #printable-invoice * {
            visibility: visible;
        }
        body.pos-mode #printable-invoice {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm !important;
            max-width: 80mm !important;
            box-shadow: none !important;
            border: none !important;
            padding: 4mm !important;
            margin: 0 !important;
            background: #fff !important;
            font-size: 11px !important;
        }
        body.pos-mode #printable-invoice .invoice-header {
            border-bottom: 1px dashed #000 !important;
            padding-bottom: 8px !important;
            margin-bottom: 10px !important;
            text-align: center !important;
        }
        body.pos-mode #printable-invoice .invoice-header .col-sm-6 {
            width: 100% !important;
            text-align: center !important;
        }
        body.pos-mode #printable-invoice .invoice-logo {
            max-height: 40px !important;
            max-width: 120px !important;
            margin-bottom: 5px !important;
            display: block !important;
            margin-left: auto !important;
            margin-right: auto !important;
        }
        body.pos-mode #printable-invoice .receipt-badge {
            padding: 2px 6px !important;
            font-size: 9px !important;
            display: inline-block !important;
            margin-bottom: 5px !important;
        }
        body.pos-mode #printable-invoice .row {
            display: flex !important;
            flex-direction: column !important;
            margin: 0 !important;
        }
        body.pos-mode #printable-invoice .col-sm-6 {
            width: 100% !important;
            text-align: left !important;
            margin-bottom: 8px !important;
        }
        body.pos-mode #printable-invoice .text-sm-end {
            text-align: left !important;
        }
        body.pos-mode #printable-invoice .table-invoice th,
        body.pos-mode #printable-invoice .table-invoice td {
            padding: 6px 4px !important;
            font-size: 10px !important;
            border-bottom: 1px dashed #000 !important;
        }
        body.pos-mode #printable-invoice .table-invoice th {
            background: none !important;
            border-bottom: 2px solid #000 !important;
        }
        body.pos-mode #printable-invoice .col-md-5 {
            width: 100% !important;
            margin-top: 10px !important;
        }
        body.pos-mode #printable-invoice .col-md-5 table {
            width: 100% !important;
        }
        body.pos-mode #printable-invoice .col-md-5 table td {
            padding: 4px 0 !important;
            font-size: 10px !important;
        }
        body.pos-mode #printable-invoice .card.bg-light {
            background: none !important;
            border: 1px dashed #000 !important;
            border-radius: 4px !important;
        }
        body.pos-mode #printable-invoice .issued-by-box {
            display: flex !important;
            flex-direction: row !important;
            border: 1px dashed #000 !important;
            background: none !important;
            padding: 4px 6px !important;
            font-size: 9px !important;
            margin-top: 6px !important;
            border-radius: 4px !important;
            gap: 6px !important;
        }
        body.pos-mode #printable-invoice .role-badge {
            font-size: 8px !important;
            padding: 2px 5px !important;
        }
    }
</style>

<div class="invoice-container">
    <!-- Invoice Action Bar -->
    <div class="invoice-action-bar no-print mb-4">
        <!-- Back Button -->
        <div class="invoice-back">
            <?php if ($is_client_panel): ?>
                <a href="?panel=client&tab=payment_history" class="btn btn-outline-secondary btn-sm rounded-pill px-3">
                    <i class="fas fa-arrow-left me-1"></i> <span class="d-none d-sm-inline">Back to </span>History
                </a>
            <?php else: ?>
                <a href="?view_id=<?= $c['id'] ?>" class="btn btn-outline-secondary btn-sm rounded-pill px-3">
                    <i class="fas fa-arrow-left me-1"></i> <span class="d-none d-sm-inline">Back to </span>Profile
                </a>
            <?php endif; ?>
        </div>
        <!-- Action Buttons -->
        <div class="invoice-actions">
            <button class="btn btn-outline-primary btn-sm rounded-pill shadow-sm" id="btnPrintReceipt">
                <i class="fas fa-print me-1"></i><span class="d-none d-sm-inline">Print </span>Receipt
            </button>
            <button class="btn btn-outline-warning btn-sm rounded-pill shadow-sm" id="btnPrintPOS">
                <i class="fas fa-receipt me-1"></i>POS<span class="d-none d-sm-inline"> Print</span>
            </button>
            <button class="btn btn-success btn-sm rounded-pill shadow-sm" id="btnDownloadPDF">
                <i class="fas fa-download me-1"></i><span class="d-none d-sm-inline">Download </span>PDF
            </button>
        </div>
    </div>


    <div class="card invoice-card shadow-sm mx-auto mb-5" id="printable-invoice" style="max-width: 750px;">
        <div class="card-body p-4 p-md-5">
            
            <!-- Header -->
            <div class="row invoice-header align-items-center mb-4">
                <div class="col-sm-6">
                    <?php if ($invoice_logo && file_exists(__DIR__ . '/../../' . $invoice_logo)): ?>
                        <img src="<?= htmlspecialchars($invoice_logo) ?>" alt="ISP Logo" class="invoice-logo mb-3">
                    <?php else: ?>
                        <div class="h3 fw-bold text-primary mb-1"><?= htmlspecialchars($comp_name) ?></div>
                    <?php endif; ?>
                    <div class="text-muted small">
                        <?= nl2br(htmlspecialchars($comp_address)) ?><br>
                        Phone: <?= htmlspecialchars($comp_phone) ?><br>
                        Email: <?= htmlspecialchars($comp_email) ?>
                    </div>
                </div>
                <div class="col-sm-6 text-sm-end mt-3 mt-sm-0">
                    <?php
                    // ── Dynamic status badge ──
                    if ($is_pay_due) {
                        echo '<div class="receipt-badge badge-info mb-3"><i class="fas fa-money-bill-wave me-1"></i> Due Cleared</div>';
                    } elseif ($is_due_recharge && $due_is_paid) {
                        echo '<div class="receipt-badge badge-success mb-3"><i class="fas fa-check-circle me-1"></i> Due Paid</div>';
                    } elseif ($is_due_recharge) {
                        echo '<div class="receipt-badge badge-warning mb-3"><i class="fas fa-clock me-1"></i> Payment Due</div>';
                    } else {
                        echo '<div class="receipt-badge badge-success mb-3"><i class="fas fa-check-circle me-1"></i> Payment Successful</div>';
                    }
                    ?>
                    <div class="h3 fw-bold text-uppercase text-secondary mb-1">Receipt</div>
                    <div class="fw-bold text-primary mb-1"><?= htmlspecialchars($invoice_no) ?></div>
                    <div class="text-muted small">
                        <?= $is_pay_due ? 'Paid On' : 'Issued' ?>: <?= date('d M Y, h:i A', strtotime($log['timestamp'])) ?>
                    </div>
                </div>
            </div>

            <!-- Addresses & Details -->
            <div class="row mb-4 g-3">
                <div class="col-sm-6">
                    <div class="invoice-section-title">Billed To</div>
                    <div class="h6 fw-bold mb-1 text-dark"><?= htmlspecialchars($c['name']) ?></div>
                    <div class="text-muted small mb-1">PPPoE User ID: <span class="fw-semibold text-dark"><?= htmlspecialchars($c['user_id']) ?></span></div>
                    <div class="text-muted small mb-1">Phone: <?= htmlspecialchars($c['phone'] ?: 'N/A') ?></div>
                    <div class="text-muted small"><?= nl2br(htmlspecialchars($c['address'] ?: 'No address specified')) ?></div>
                </div>
                <div class="col-sm-6 text-sm-end">
                    <div class="invoice-section-title">Payment Method</div>
                    <div class="fw-bold mb-1 <?= $is_due_recharge && !$due_is_paid ? 'text-warning' : 'text-dark' ?>">
                        <?php
                        if ($is_due_recharge && !$due_is_paid) echo '<i class="fas fa-exclamation-triangle me-1 text-warning"></i>';
                        elseif ($is_due_recharge && $due_is_paid) echo '<i class="fas fa-check-circle me-1 text-success"></i>';
                        elseif ($is_pay_due) echo '<i class="fas fa-money-bill-wave me-1 text-info"></i>';
                        else echo '<i class="fas fa-check-circle me-1 text-success"></i>';
                        ?>
                        <?= htmlspecialchars($method) ?>
                    </div>
                    <?php if ($is_due_recharge && $due_is_paid && $due_paid_log): ?>
                        <div class="text-success small">
                            <i class="fas fa-calendar-check me-1"></i>
                            Paid on: <?= date('d M Y, h:i A', strtotime($due_paid_log['timestamp'])) ?>
                        </div>
                    <?php elseif ($trx_id !== 'N/A' && !empty($trx_id)): ?>
                        <div class="text-muted small">Transaction ID: <span class="font-monospace text-dark fw-medium"><?= htmlspecialchars($trx_id) ?></span></div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Items Table -->
            <div class="table-responsive mb-4">
                <table class="table table-invoice align-middle mb-0">
                    <thead>
                        <tr>
                            <th style="width: 60%;">Description</th>
                            <th class="text-center" style="width: 20%;">Validity</th>
                            <th class="text-end" style="width: 20%;">Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <div class="fw-bold text-dark">Internet Service Subscription</div>
                                <div class="small text-muted">Package: <?= htmlspecialchars($c['user_package'] ?: 'Default Profile') ?></div>
                            </td>
                            <td class="text-center text-dark font-monospace">
                                <?= $days ?> Days
                            </td>
                            <td class="text-end fw-bold text-dark">
                                ৳<?= number_format($amount, 2) ?>
                            </td>
                        </tr>
                        <?php if ($credit_days_applied > 0): ?>
                        <tr style="background: #f0fdf4;">
                            <td>
                                <div class="fw-semibold text-success">
                                    <i class="fas fa-gift me-1"></i> Credit Applied
                                </div>
                                <div class="small text-muted">
                                    <?= $credit_days_applied ?> days credit was given on <strong><?= htmlspecialchars($credit_given_on) ?></strong> and deducted from this recharge period.
                                    <?php if ($new_expiry_formatted): ?>
                                        &mdash; New expiry after credit: <strong class="text-success"><?= htmlspecialchars($new_expiry_formatted) ?></strong>
                                    <?php endif; ?>
                                </div>
                            </td>
                            <td class="text-center text-success font-monospace fw-semibold">
                                -<?= $credit_days_applied ?> Days
                            </td>
                            <td class="text-end text-success fw-semibold">
                                Free
                            </td>
                        </tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>


            <div class="row justify-content-end mb-4">
                <div class="col-md-5">
                    <table class="table table-sm table-borderless align-middle small mb-0">
                        <tr>
                            <td class="text-muted text-end py-1">Subtotal:</td>
                            <td class="text-end fw-bold text-dark py-1" style="width: 45%;">৳<?= number_format($recharge_discount > 0 ? $paid_amount : $amount, 2) ?></td>
                        </tr>
                        <tr class="border-top">
                            <td class="text-muted text-end fw-bold py-2">Total Amount:</td>
                            <td class="text-end fw-bold text-dark py-2">৳<?= number_format($amount, 2) ?></td>
                        </tr>
                        <?php if ($recharge_discount > 0): ?>
                        <tr>
                            <td class="text-muted text-end py-1">Gross Recharge:</td>
                            <td class="text-end fw-bold py-1">৳<?= number_format($gross_amount, 2) ?></td>
                        </tr>
                        <tr>
                            <td class="text-warning text-end fw-bold py-1">Discount:</td>
                            <td class="text-end fw-bold text-warning py-1">- ৳<?= number_format($recharge_discount, 2) ?></td>
                        </tr>
                        <?php endif; ?>
                        <?php if ($is_due_recharge && !$due_is_paid): ?>
                        <tr>
                            <td class="text-warning text-end fw-bold py-1"><i class="fas fa-clock me-1"></i>Amount Due:</td>
                            <td class="text-end fw-bold text-warning py-1">৳<?= number_format($amount, 2) ?></td>
                        </tr>
                        <?php elseif ($is_due_recharge && $due_is_paid): ?>
                        <tr>
                            <td class="text-success text-end fw-bold py-1"><i class="fas fa-check me-1"></i>Amount Paid:</td>
                            <td class="text-end fw-bold text-success py-1">৳<?= number_format($amount, 2) ?></td>
                        </tr>
                        <?php elseif ($is_pay_due): ?>
                        <tr>
                            <td class="text-info text-end fw-bold py-1"><i class="fas fa-money-bill-wave me-1"></i>Due Cleared:</td>
                            <td class="text-end fw-bold text-info py-1">৳<?= number_format($amount, 2) ?></td>
                        </tr>
                        <?php else: ?>
                        <tr>
                            <td class="text-success text-end fw-bold py-1">Amount Paid:</td>
                            <td class="text-end fw-bold text-success py-1">৳<?= number_format($amount, 2) ?></td>
                        </tr>
                        <?php endif; ?>
                        <?php if (!$is_pay_due && $new_expiry_formatted): ?>
                        <tr class="border-top">
                            <td class="text-end fw-bold py-2" style="color:#0891b2;">
                                <i class="fas fa-calendar-check me-1"></i>Service Valid Until:
                            </td>
                            <td class="text-end fw-bold py-2" style="color:#0891b2;">
                                <?= htmlspecialchars($new_expiry_formatted) ?>
                            </td>
                        </tr>
                        <?php endif; ?>
                    </table>
                </div>
            </div>

            <!-- Footer: Issued By -->
            <?php
            $role_css = 'role-system';
            if ($issued_by_role === 'Admin')    $role_css = 'role-admin';
            elseif ($issued_by_role === 'Reseller') $role_css = 'role-reseller';
            elseif ($issued_by_role === 'POP')   $role_css = 'role-pop';
            elseif ($issued_by_role === 'Staff') $role_css = 'role-staff';
            ?>
            <div class="d-flex justify-content-between align-items-end pt-3 mt-2 border-top">
                <div class="small text-muted">
                    <i class="fas fa-info-circle me-1"></i>
                    This is a system-generated electronic receipt.
                </div>
                <div class="issued-by-box">
                    <div>
                        <div class="text-muted" style="font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">Issued By</div>
                        <div class="fw-bold text-dark" style="font-size:0.9rem;">
                            <i class="fas fa-user-circle me-1 text-secondary"></i><?= htmlspecialchars($issued_by_username) ?>
                        </div>
                    </div>
                    <span class="role-badge <?= $role_css ?>"><?= htmlspecialchars($issued_by_label) ?></span>
                </div>
            </div>

        </div>
    </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
function downloadInvoicePDF() {
    const element = document.getElementById('printable-invoice');
    
    const opt = {
        margin:       [10, 10, 10, 10],
        filename:     '<?= $invoice_no ?>.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true,
            logging: false,
            letterRendering: true
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
}

function printPOS() {
    document.body.classList.add('pos-mode');
    window.print();
}

window.onafterprint = function() {
    document.body.classList.remove('pos-mode');
};

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('btnPrintReceipt')?.addEventListener('click', function() { window.print(); });
    document.getElementById('btnPrintPOS')?.addEventListener('click', printPOS);
    document.getElementById('btnDownloadPDF')?.addEventListener('click', downloadInvoicePDF);
});
</script>

<?php
// Load client panel footer
if ($is_client_panel) {
    require_once __DIR__ . '/layout/footer.php';
}
?>
