<?php
// views/store/sales_invoice.php
if (!hasRole('Admin') && !hasRole('Reseller') && !isOffice()) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}

$sale_id = intval($_GET['id'] ?? 0);
if ($sale_id <= 0) {
    echo "<div class='alert alert-danger'>Invalid Sale ID.</div>";
    return;
}

$sale = safeFetch($pdo, "SELECT s.*, p.name as product_name, p.brand_model, p.serial_mac, p.warranty, p.supplier, p.staff_id as product_owner_id,
                               u.name as customer_name, u.user_id as customer_username, u.phone as customer_phone, u.address as customer_address,
                               st.name as staff_name 
                        FROM " . TBL_STORE_SALES . " s 
                        LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id 
                        LEFT JOIN " . TBL_USERS . " u ON s.customer_id = u.id 
                        LEFT JOIN " . TBL_STAFF . " st ON s.sold_by_staff = st.id
                        WHERE s.id = ?", [$sale_id]);

if (!$sale) {
    echo "<div class='alert alert-danger'>Sale transaction not found.</div>";
    return;
}

$owner_id = get_store_owner_id();
if (!hasRole('Admin') && intval($sale['product_owner_id']) !== $owner_id) {
    echo "<div class='alert alert-danger'>Access Denied. You are not authorized to view this invoice.</div>";
    return;
}

// Fetch general settings for invoice header
$invoice_logo = get_opt($pdo, 'logo_path', '');
$comp_name = get_opt($pdo, 'company_name', 'ISP Billing');
$comp_email = get_opt($pdo, 'company_email', 'billing@isp.com');
$comp_phone = get_opt($pdo, 'company_phone', '+880 1234-567890');
$comp_address = get_opt($pdo, 'company_address', 'Your ISP Corporate Office Address');
?>

<style>
    .invoice-card {
        border-radius: 12px;
        background: #fff;
        border: 1px solid #e3e6f0;
    }
    .invoice-header {
        border-bottom: 2px solid #f8f9fc;
        padding-bottom: 20px;
    }
    .invoice-logo {
        max-height: 70px;
        max-width: 180px;
    }
    .invoice-section-title {
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #858796;
        font-weight: 700;
        margin-bottom: 10px;
    }
    .table-invoice th {
        font-size: 0.8rem;
        text-transform: uppercase;
        font-weight: 700;
        color: #4e73df;
        background: #f8f9fc;
        border-bottom: 2px solid #e3e6f0;
    }
    .signature-space {
        margin-top: 80px;
        border-top: 1px dashed #858796;
        padding-top: 10px;
        text-align: center;
        font-size: 0.9rem;
        color: #2c3e50;
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
</style>

<div class="d-flex justify-content-between align-items-center mb-4 no-print">
    <a href="?tab=store_sales" class="btn btn-outline-secondary">
        <i class="fas fa-arrow-left me-1"></i> Back to Sales
    </a>
    <button class="btn btn-primary shadow-sm" onclick="window.print();">
        <i class="fas fa-print me-1"></i> Print Invoice
    </button>
</div>

<div class="card invoice-card shadow-sm mx-auto" id="printable-invoice" style="max-width: 800px;">
    <div class="card-body p-5">
        
        <!-- Header -->
        <div class="row invoice-header align-items-center mb-4">
            <div class="col-sm-6">
                <?php if ($invoice_logo && file_exists(__DIR__ . '/../../' . $invoice_logo)): ?>
                    <img src="<?= $invoice_logo ?>" alt="ISP Logo" class="invoice-logo mb-3">
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
                <div class="h2 fw-bold text-uppercase text-secondary mb-1">Invoice</div>
                <div class="fw-bold text-primary mb-1">Invoice #: <?= htmlspecialchars($sale['invoice_no']) ?></div>
                <div class="text-muted small">
                    Date: <?= date('d F Y h:i A', strtotime($sale['sale_date'])) ?><br>
                    Sold By: <?= htmlspecialchars($sale['staff_name']) ?><br>
                    Status: <span class="badge bg-success"><?= $sale['payment_status'] ?></span>
                </div>
            </div>
        </div>

        <!-- Addresses -->
        <div class="row mb-4">
            <div class="col-sm-6">
                <div class="invoice-section-title">Billed To</div>
                <div class="h6 fw-bold mb-1"><?= htmlspecialchars($sale['customer_name']) ?></div>
                <div class="text-muted small mb-1">Client ID: <?= htmlspecialchars($sale['customer_username']) ?></div>
                <div class="text-muted small mb-1">Phone: <?= htmlspecialchars($sale['customer_phone'] ?: 'N/A') ?></div>
                <div class="text-muted small"><?= nl2br(htmlspecialchars($sale['customer_address'] ?: 'No address specified')) ?></div>
            </div>
        </div>

        <!-- Items Table -->
        <div class="table-responsive mb-4">
            <table class="table table-invoice align-middle">
                <thead>
                    <tr>
                        <th style="width: 50%;">Item & Description</th>
                        <th class="text-center" style="width: 25%;">SQ ID</th>
                        <th class="text-end" style="width: 25%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="fw-bold text-dark"><?= htmlspecialchars($sale['product_name']) ?></div>
                            <small class="text-muted"><?= htmlspecialchars($sale['brand_model'] ?: 'N/A') ?></small>
                            <?php if ($sale['warranty']): ?>
                                <span class="d-block small text-primary"><i class="fas fa-shield-alt me-1"></i>Warranty: <?= htmlspecialchars($sale['warranty']) ?></span>
                            <?php endif; ?>
                        </td>
                        <td class="text-center font-monospace">
                            <code><?= htmlspecialchars($sale['serial_mac']) ?></code>
                        </td>
                        <td class="text-end fw-bold text-dark">
                            ৳<?= number_format($sale['sold_price'], 2) ?>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Totals -->
        <div class="row justify-content-end mb-5">
            <div class="col-md-5">
                <table class="table table-sm table-borderless align-middle small">
                    <tr>
                        <td class="text-muted text-end">Subtotal:</td>
                        <td class="text-end fw-bold text-dark" style="width: 40%;">৳<?= number_format($sale['sold_price'], 2) ?></td>
                    </tr>
                    <tr class="border-top">
                        <td class="text-muted text-end fw-bold">Total Amount Due:</td>
                        <td class="text-end fw-bold text-dark">৳<?= number_format($sale['sold_price'], 2) ?></td>
                    </tr>
                    <tr>
                        <td class="text-success text-end fw-bold">Amount Paid:</td>
                        <td class="text-end fw-bold text-success">৳<?= number_format($sale['paid_amount'], 2) ?></td>
                    </tr>
                    <?php if ($sale['due_amount'] > 0): ?>
                        <tr class="border-top text-danger">
                            <td class="text-end fw-bold">Dues / Balances:</td>
                            <td class="text-end fw-bold">৳<?= number_format($sale['due_amount'], 2) ?></td>
                        </tr>
                    <?php endif; ?>
                </table>
            </div>
        </div>

        <!-- Remarks/Footer -->
        <?php if ($sale['remarks']): ?>
            <div class="card bg-light border-0 mb-5">
                <div class="card-body p-3 small">
                    <strong>Invoice Note / Remarks:</strong><br>
                    <?= nl2br(htmlspecialchars($sale['remarks'])) ?>
                </div>
            </div>
        <?php endif; ?>

        <!-- Signatures -->
        <div class="row pt-5">
            <div class="col-sm-5 offset-sm-1">
                <div class="signature-space">
                    Customer Signature
                </div>
            </div>
            <div class="col-sm-5 offset-sm-1">
                <div class="signature-space">
                    Authorized Signature
                </div>
            </div>
        </div>

    </div>
</div>
