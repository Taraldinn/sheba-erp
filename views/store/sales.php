<?php
// views/store/sales.php
if (!hasRole('Admin') && !hasRole('Reseller') && !isOffice()) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}



// Filter parameters
$search = trim($_GET['search'] ?? '');
$payment_filter = trim($_GET['payment_status'] ?? '');

$owner_id = get_store_owner_id();

$where_clauses = ["1=1"];
$params = [];

if (!hasRole('Admin')) {
    $where_clauses[] = "p.staff_id = ?";
    $params[] = $owner_id;
}

if ($search !== '') {
    $where_clauses[] = "(s.invoice_no LIKE ? OR u.name LIKE ? OR u.user_id LIKE ? OR p.name LIKE ? OR p.serial_mac LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

if ($payment_filter !== '') {
    $where_clauses[] = "s.payment_status = ?";
    $params[] = $payment_filter;
}

$where_str = implode(" AND ", $where_clauses);

// Fetch data for dropdowns
if (hasRole('Admin')) {
    $clients = safeFetchAll($pdo, "SELECT id, name, user_id, phone FROM " . TBL_USERS . " ORDER BY name ASC");
    $available_products = safeFetchAll($pdo, "SELECT id, name, brand_model, serial_mac, selling_price, quantity FROM " . TBL_STORE_PRODUCTS . " WHERE quantity > 0 ORDER BY name ASC");
} else {
    $clients = safeFetchAll($pdo, "SELECT id, name, user_id, phone FROM " . TBL_USERS . " WHERE manager_id = ? OR manager_id IN (SELECT id FROM " . TBL_STAFF . " WHERE parent_id = ?) ORDER BY name ASC", [$owner_id, $owner_id]);
    $available_products = safeFetchAll($pdo, "SELECT id, name, brand_model, serial_mac, selling_price, quantity FROM " . TBL_STORE_PRODUCTS . " WHERE quantity > 0 AND staff_id = ? ORDER BY name ASC", [$owner_id]);
}

// Pagination
$page = max(1, intval($_GET['page'] ?? 1));
$limit = 20;
$offset = ($page - 1) * $limit;

$total_sales = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SALES . " s LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id LEFT JOIN " . TBL_USERS . " u ON s.customer_id = u.id WHERE $where_str", $params)['count'] ?? 0;
$total_pages = ceil($total_sales / $limit);

$sales_query = "SELECT s.*, p.name as product_name, p.brand_model, p.serial_mac, 
                       u.name as customer_name, u.user_id as customer_username, u.phone as customer_phone,
                       st.name as staff_name 
                FROM " . TBL_STORE_SALES . " s 
                LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id 
                LEFT JOIN " . TBL_USERS . " u ON s.customer_id = u.id 
                LEFT JOIN " . TBL_STAFF . " st ON s.sold_by_staff = st.id
                WHERE $where_str 
                ORDER BY s.id DESC 
                LIMIT $limit OFFSET $offset";
$sales = safeFetchAll($pdo, $sales_query, $params);

// Stats
if (hasRole('Admin')) {
    $stats = [
        'total_sales' => safeFetch($pdo, "SELECT SUM(sold_price) as sum FROM " . TBL_STORE_SALES)['sum'] ?? 0,
        'total_paid' => safeFetch($pdo, "SELECT SUM(paid_amount) as sum FROM " . TBL_STORE_SALES)['sum'] ?? 0,
        'total_due' => safeFetch($pdo, "SELECT SUM(due_amount) as sum FROM " . TBL_STORE_SALES)['sum'] ?? 0,
    ];
} else {
    $stats = [
        'total_sales' => safeFetch($pdo, "SELECT SUM(s.sold_price) as sum FROM " . TBL_STORE_SALES . " s LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id WHERE p.staff_id = ?", [$owner_id])['sum'] ?? 0,
        'total_paid' => safeFetch($pdo, "SELECT SUM(s.paid_amount) as sum FROM " . TBL_STORE_SALES . " s LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id WHERE p.staff_id = ?", [$owner_id])['sum'] ?? 0,
        'total_due' => safeFetch($pdo, "SELECT SUM(s.due_amount) as sum FROM " . TBL_STORE_SALES . " s LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id WHERE p.staff_id = ?", [$owner_id])['sum'] ?? 0,
    ];
}

function getPaymentBadgeClass($status) {
    switch ($status) {
        case 'Paid': return 'bg-success';
        case 'Partial': return 'bg-warning text-dark';
        case 'Due': return 'bg-danger';
        default: return 'bg-secondary';
    }
}
?>

<div class="row g-3 mb-4">
    <div class="col-md-4">
        <div class="card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-success rounded-3 p-3 me-3 text-success"><i class="fas fa-wallet fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Total Cash Collected</h6>
                    <h3 class="fw-bold mb-0 text-success">৳<?= number_format($stats['total_paid'], 2) ?></h3>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-danger rounded-3 p-3 me-3 text-danger"><i class="fas fa-exclamation-circle fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Outstanding Dues</h6>
                    <h3 class="fw-bold mb-0 text-danger">৳<?= number_format($stats['total_due'], 2) ?></h3>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-primary rounded-3 p-3 me-3 text-primary"><i class="fas fa-shopping-cart fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Total Sales Value</h6>
                    <h3 class="fw-bold mb-0 text-primary">৳<?= number_format($stats['total_sales'], 2) ?></h3>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4><i class="fas fa-shopping-cart me-2 text-success"></i> Product Sales Management</h4>
    <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#sellModal">
        <i class="fas fa-cart-plus me-1"></i> New Product Sale
    </button>
</div>

<div class="card border-0 shadow-sm mb-4">
    <div class="card-body">
        <form method="GET" class="row g-2">
            <input type="hidden" name="tab" value="store_sales">
            <div class="col-md-6">
                <div class="input-group">
                    <span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted"></i></span>
                    <input type="text" name="search" class="form-control border-start-0" placeholder="Search by invoice, customer name, username, product, SQ ID..." value="<?= htmlspecialchars($search) ?>">
                </div>
            </div>
            <div class="col-md-4">
                <select name="payment_status" class="form-select">
                    <option value="">-- All Payment Statuses --</option>
                    <option value="Paid" <?= ($payment_filter === 'Paid') ? 'selected' : '' ?>>Paid</option>
                    <option value="Partial" <?= ($payment_filter === 'Partial') ? 'selected' : '' ?>>Partial</option>
                    <option value="Due" <?= ($payment_filter === 'Due') ? 'selected' : '' ?>>Due</option>
                </select>
            </div>
            <div class="col-md-2 d-grid">
                <button type="submit" class="btn btn-secondary"><i class="fas fa-filter me-1"></i> Filter</button>
            </div>
        </form>
    </div>
</div>

<!-- Sales Table -->
<div class="card border-0 shadow-sm">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-4">Invoice No</th>
                        <th>Customer</th>
                        <th>Product & SQ ID</th>
                        <th>Pricing</th>
                        <th>Sale Date</th>
                        <th>Sold By</th>
                        <th>Payment Status</th>
                        <th class="pe-4 text-end">Action</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($sales)): ?>
                        <tr>
                            <td colspan="8" class="text-center py-5 text-muted">
                                <i class="fas fa-receipt fa-3x mb-3 text-light"></i>
                                <p class="mb-0">No sales transactions recorded yet.</p>
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($sales as $sale): ?>
                            <tr>
                                <td class="ps-4">
                                    <span class="fw-bold text-dark"><?= htmlspecialchars($sale['invoice_no']) ?></span>
                                </td>
                                <td>
                                    <div class="fw-bold"><?= htmlspecialchars($sale['customer_name']) ?></div>
                                    <small class="text-muted"><?= htmlspecialchars($sale['customer_username']) ?> | <?= htmlspecialchars($sale['customer_phone']) ?></small>
                                </td>
                                <td>
                                    <div><?= htmlspecialchars($sale['product_name']) ?> <small class="text-muted">(SKU: <?= htmlspecialchars($sale['serial_mac']) ?>)</small></div>
                                    <small class="text-danger fw-bold font-monospace">Item SQ ID: <?= htmlspecialchars($sale['item_serial_mac'] ?: 'N/A') ?></small>
                                </td>
                                <td>
                                    <span class="d-block small text-muted">Sold: ৳<?= number_format($sale['sold_price'], 2) ?></span>
                                    <span class="d-block small text-success">Paid: ৳<?= number_format($sale['paid_amount'], 2) ?></span>
                                    <?php if ($sale['due_amount'] > 0): ?>
                                        <span class="d-block small text-danger fw-semibold">Due: ৳<?= number_format($sale['due_amount'], 2) ?></span>
                                    <?php endif; ?>
                                </td>
                                <td><?= date('d M Y h:i A', strtotime($sale['sale_date'])) ?></td>
                                <td><?= htmlspecialchars($sale['staff_name']) ?></td>
                                <td>
                                    <span class="badge <?= getPaymentBadgeClass($sale['payment_status']) ?>"><?= $sale['payment_status'] ?></span>
                                </td>
                                <td class="pe-4 text-end">
                                    <a href="?tab=store_sales_invoice&id=<?= $sale['id'] ?>" class="btn btn-sm btn-outline-primary" title="View & Print Invoice">
                                        <i class="fas fa-print"></i> Invoice
                                    </a>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
    
    <!-- Pagination -->
    <?php if ($total_pages > 1): ?>
        <div class="card-footer bg-white border-0 py-3">
            <nav>
                <ul class="pagination pagination-sm justify-content-center mb-0">
                    <li class="page-item <?= ($page <= 1) ? 'disabled' : '' ?>">
                        <a class="page-link" href="?tab=store_sales&page=<?= $page - 1 ?>&search=<?= urlencode($search) ?>&payment_status=<?= urlencode($payment_filter) ?>">Previous</a>
                    </li>
                    <?php for ($i = 1; $i <= $total_pages; $i++): ?>
                        <li class="page-item <?= ($page == $i) ? 'active' : '' ?>">
                            <a class="page-link" href="?tab=store_sales&page=<?= $i ?>&search=<?= urlencode($search) ?>&payment_status=<?= urlencode($payment_filter) ?>"><?= $i ?></a>
                        </li>
                    <?php endfor; ?>
                    <li class="page-item <?= ($page >= $total_pages) ? 'disabled' : '' ?>">
                        <a class="page-link" href="?tab=store_sales&page=<?= $page + 1 ?>&search=<?= urlencode($search) ?>&payment_status=<?= urlencode($payment_filter) ?>">Next</a>
                    </li>
                </ul>
            </nav>
        </div>
    <?php endif; ?>
</div>

<!-- Product Sale Modal -->
<div class="modal fade" id="sellModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" action="" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">New Product Sale</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="action" value="sell_product">
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Select Customer <span class="text-danger">*</span></label>
                    <select name="customer_id" id="sell_customer" class="form-select select2-clients" style="width:100%" required>
                        <option value="">-- Search Customer --</option>
                        <?php foreach ($clients as $client): ?>
                            <option value="<?= $client['id'] ?>"><?= htmlspecialchars($client['name']) ?> (<?= htmlspecialchars($client['user_id']) ?>) - <?= htmlspecialchars($client['phone'] ?: 'No Phone') ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Select Available Product <span class="text-danger">*</span></label>
                    <select name="product_id" id="sell_product" class="form-select select2-products" style="width:100%" onchange="updateDefaultPrice()" required>
                        <option value="" data-price="0">-- Search Available Product/SKU --</option>
                        <?php foreach ($available_products as $prod): ?>
                            <option value="<?= $prod['id'] ?>" data-price="<?= $prod['selling_price'] ?>"><?= htmlspecialchars($prod['name']) ?> - <?= htmlspecialchars($prod['brand_model'] ?: 'No Brand') ?> (SKU: <?= htmlspecialchars($prod['serial_mac']) ?>) - Qty: <?= $prod['quantity'] ?> - ৳<?= number_format($prod['selling_price'], 2) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Specific Item SQ ID / MAC <span class="text-danger">*</span></label>
                    <input type="text" name="item_serial_mac" class="form-control" placeholder="Scan or enter the exact SQ ID / MAC of the item being sold" required>
                </div>

                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="form-label fw-semibold">Selling Price (৳) <span class="text-danger">*</span></label>
                        <input type="number" step="0.01" name="sold_price" id="sell_sold_price" class="form-control" oninput="calcDue()" required>
                    </div>
                    <div class="col-6">
                        <label class="form-label fw-semibold">Paid Amount (৳) <span class="text-danger">*</span></label>
                        <input type="number" step="0.01" name="paid_amount" id="sell_paid_amount" class="form-control" value="0.00" oninput="calcDue()" required>
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-bold text-danger">Outstanding Balance / Due Amount</label>
                    <input type="text" id="sell_due_amount" class="form-control fw-bold text-danger" readonly value="৳0.00">
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Remarks</label>
                    <textarea name="remarks" class="form-control" rows="2" placeholder="e.g. Paid cash, router setup done"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-success px-4">Complete Sale</button>
            </div>
        </form>
    </div>
</div>

<script>
    document.addEventListener("DOMContentLoaded", function() {
        if (typeof jQuery !== 'undefined') {
            $('.select2-clients').select2({
                theme: 'bootstrap-5',
                placeholder: '-- Search Customer --',
                dropdownParent: $('#sellModal')
            });
            $('.select2-products').select2({
                theme: 'bootstrap-5',
                placeholder: '-- Search Available Product/SQ ID --',
                dropdownParent: $('#sellModal')
            });
        }
    });

    function updateDefaultPrice() {
        let select = document.getElementById('sell_product');
        let selectedOption = select.options[select.selectedIndex];
        let price = parseFloat(selectedOption.getAttribute('data-price')) || 0;
        
        document.getElementById('sell_sold_price').value = price.toFixed(2);
        document.getElementById('sell_paid_amount').value = price.toFixed(2); // default full paid
        calcDue();
    }

    function calcDue() {
        let sold = parseFloat(document.getElementById('sell_sold_price').value) || 0;
        let paid = parseFloat(document.getElementById('sell_paid_amount').value) || 0;
        let due = Math.max(0, sold - paid);
        document.getElementById('sell_due_amount').value = "৳" + due.toFixed(2);
    }
</script>
