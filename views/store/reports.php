<?php
// views/store/reports.php
if (!hasRole('Admin') && !hasRole('Reseller') && !isOffice()) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}

$active_report = $_GET['report'] ?? 'stock';

// Date filters for sales report
$start_date = $_GET['start_date'] ?? date('Y-m-01');
$end_date = $_GET['end_date'] ?? date('Y-m-d');

$owner_id = get_store_owner_id();

// Queries
switch ($active_report) {
    case 'stock':
        $report_title = "Current Stock Inventory Report";
        if (hasRole('Admin')) {
            $summary = safeFetchAll($pdo, "SELECT c.name as category_name, 
                                                 COUNT(p.id) as total_items,
                                                 SUM(CASE WHEN p.stock_status = 'Available' THEN 1 ELSE 0 END) as available_items,
                                                 SUM(CASE WHEN p.stock_status = 'Sold' THEN 1 ELSE 0 END) as sold_items,
                                                 SUM(CASE WHEN p.stock_status = 'Support Issued' THEN 1 ELSE 0 END) as support_items,
                                                 SUM(CASE WHEN p.stock_status IN ('Damaged', 'Missing') THEN 1 ELSE 0 END) as damaged_missing
                                          FROM " . TBL_STORE_PRODUCTS . " p
                                          LEFT JOIN " . TBL_STORE_CATEGORIES . " c ON p.category_id = c.id
                                          GROUP BY p.category_id, c.name
                                          ORDER BY c.name ASC");
            
            $details = safeFetchAll($pdo, "SELECT p.*, c.name as category_name 
                                           FROM " . TBL_STORE_PRODUCTS . " p 
                                           LEFT JOIN " . TBL_STORE_CATEGORIES . " c ON p.category_id = c.id 
                                           WHERE p.stock_status = 'Available' 
                                           ORDER BY p.name ASC");
        } else {
            $summary = safeFetchAll($pdo, "SELECT c.name as category_name, 
                                                 COUNT(p.id) as total_items,
                                                 SUM(CASE WHEN p.stock_status = 'Available' THEN 1 ELSE 0 END) as available_items,
                                                 SUM(CASE WHEN p.stock_status = 'Sold' THEN 1 ELSE 0 END) as sold_items,
                                                 SUM(CASE WHEN p.stock_status = 'Support Issued' THEN 1 ELSE 0 END) as support_items,
                                                 SUM(CASE WHEN p.stock_status IN ('Damaged', 'Missing') THEN 1 ELSE 0 END) as damaged_missing
                                          FROM " . TBL_STORE_PRODUCTS . " p
                                          LEFT JOIN " . TBL_STORE_CATEGORIES . " c ON p.category_id = c.id
                                          WHERE p.staff_id = ?
                                          GROUP BY p.category_id, c.name
                                          ORDER BY c.name ASC", [$owner_id]);
            
            $details = safeFetchAll($pdo, "SELECT p.*, c.name as category_name 
                                           FROM " . TBL_STORE_PRODUCTS . " p 
                                           LEFT JOIN " . TBL_STORE_CATEGORIES . " c ON p.category_id = c.id 
                                           WHERE p.stock_status = 'Available' AND p.staff_id = ? 
                                           ORDER BY p.name ASC", [$owner_id]);
        }
        break;

    case 'sold':
        $report_title = "Product Sales Report";
        if (hasRole('Admin')) {
            $details = safeFetchAll($pdo, "SELECT s.*, p.name as product_name, p.brand_model, p.serial_mac, 
                                                 u.name as customer_name, u.user_id as customer_username,
                                                 st.name as staff_name 
                                          FROM " . TBL_STORE_SALES . " s 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id 
                                          LEFT JOIN " . TBL_USERS . " u ON s.customer_id = u.id 
                                          LEFT JOIN " . TBL_STAFF . " st ON s.sold_by_staff = st.id
                                          WHERE DATE(s.sale_date) BETWEEN ? AND ?
                                          ORDER BY s.sale_date DESC", [$start_date, $end_date]);
            
            $financials = safeFetch($pdo, "SELECT SUM(sold_price) as total_sales,
                                                 SUM(paid_amount) as total_paid,
                                                 SUM(due_amount) as total_due
                                          FROM " . TBL_STORE_SALES . 
                                          " WHERE DATE(sale_date) BETWEEN ? AND ?", [$start_date, $end_date]);
        } else {
            $details = safeFetchAll($pdo, "SELECT s.*, p.name as product_name, p.brand_model, p.serial_mac, 
                                                 u.name as customer_name, u.user_id as customer_username,
                                                 st.name as staff_name 
                                          FROM " . TBL_STORE_SALES . " s 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id 
                                          LEFT JOIN " . TBL_USERS . " u ON s.customer_id = u.id 
                                          LEFT JOIN " . TBL_STAFF . " st ON s.sold_by_staff = st.id
                                          WHERE DATE(s.sale_date) BETWEEN ? AND ? AND p.staff_id = ?
                                          ORDER BY s.sale_date DESC", [$start_date, $end_date, $owner_id]);
            
            $financials = safeFetch($pdo, "SELECT SUM(s.sold_price) as total_sales,
                                                 SUM(s.paid_amount) as total_paid,
                                                 SUM(s.due_amount) as total_due
                                          FROM " . TBL_STORE_SALES . " s 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id 
                                          WHERE DATE(s.sale_date) BETWEEN ? AND ? AND p.staff_id = ?", [$start_date, $end_date, $owner_id]);
        }
        break;

    case 'support_issued':
        $report_title = "Support Devices Currently Issued Report";
        if (hasRole('Admin')) {
            $details = safeFetchAll($pdo, "SELECT sd.*, p.name as product_name, p.brand_model, p.serial_mac, 
                                                 u.name as customer_name, u.user_id as customer_username,
                                                 st.name as staff_name
                                          FROM " . TBL_STORE_SUPPORT . " sd 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id 
                                          LEFT JOIN " . TBL_USERS . " u ON sd.customer_id = u.id 
                                          LEFT JOIN " . TBL_STAFF . " st ON sd.given_by_staff = st.id
                                          WHERE sd.status = 'Issued'
                                          ORDER BY sd.given_date DESC");
        } else {
            $details = safeFetchAll($pdo, "SELECT sd.*, p.name as product_name, p.brand_model, p.serial_mac, 
                                                 u.name as customer_name, u.user_id as customer_username,
                                                 st.name as staff_name
                                          FROM " . TBL_STORE_SUPPORT . " sd 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id 
                                          LEFT JOIN " . TBL_USERS . " u ON sd.customer_id = u.id 
                                          LEFT JOIN " . TBL_STAFF . " st ON sd.given_by_staff = st.id
                                          WHERE sd.status = 'Issued' AND p.staff_id = ?
                                          ORDER BY sd.given_date DESC", [$owner_id]);
        }
        break;

    case 'returns_due':
        $report_title = "Support Returns Due Today Report";
        if (hasRole('Admin')) {
            $details = safeFetchAll($pdo, "SELECT sd.*, p.name as product_name, p.brand_model, p.serial_mac, 
                                                 u.name as customer_name, u.user_id as customer_username,
                                                 st.name as staff_name
                                          FROM " . TBL_STORE_SUPPORT . " sd 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id 
                                          LEFT JOIN " . TBL_USERS . " u ON sd.customer_id = u.id 
                                          LEFT JOIN " . TBL_STAFF . " st ON sd.given_by_staff = st.id
                                          WHERE sd.status = 'Issued' AND sd.expected_return_date = CURDATE()
                                          ORDER BY sd.given_date DESC");
        } else {
            $details = safeFetchAll($pdo, "SELECT sd.*, p.name as product_name, p.brand_model, p.serial_mac, 
                                                 u.name as customer_name, u.user_id as customer_username,
                                                 st.name as staff_name
                                          FROM " . TBL_STORE_SUPPORT . " sd 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id 
                                          LEFT JOIN " . TBL_USERS . " u ON sd.customer_id = u.id 
                                          LEFT JOIN " . TBL_STAFF . " st ON sd.given_by_staff = st.id
                                          WHERE sd.status = 'Issued' AND sd.expected_return_date = CURDATE() AND p.staff_id = ?
                                          ORDER BY sd.given_date DESC", [$owner_id]);
        }
        break;

    case 'overdue':
        $report_title = "Overdue Support Devices Report";
        if (hasRole('Admin')) {
            $details = safeFetchAll($pdo, "SELECT sd.*, p.name as product_name, p.brand_model, p.serial_mac, 
                                                 u.name as customer_name, u.user_id as customer_username,
                                                 st.name as staff_name
                                          FROM " . TBL_STORE_SUPPORT . " sd 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id 
                                          LEFT JOIN " . TBL_USERS . " u ON sd.customer_id = u.id 
                                          LEFT JOIN " . TBL_STAFF . " st ON sd.given_by_staff = st.id
                                          WHERE sd.status = 'Issued' AND sd.expected_return_date < CURDATE()
                                          ORDER BY sd.expected_return_date ASC");
        } else {
            $details = safeFetchAll($pdo, "SELECT sd.*, p.name as product_name, p.brand_model, p.serial_mac, 
                                                 u.name as customer_name, u.user_id as customer_username,
                                                 st.name as staff_name
                                          FROM " . TBL_STORE_SUPPORT . " sd 
                                          LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id 
                                          LEFT JOIN " . TBL_USERS . " u ON sd.customer_id = u.id 
                                          LEFT JOIN " . TBL_STAFF . " st ON sd.given_by_staff = st.id
                                          WHERE sd.status = 'Issued' AND sd.expected_return_date < CURDATE() AND p.staff_id = ?
                                          ORDER BY sd.expected_return_date ASC", [$owner_id]);
        }
        break;

    case 'damaged':
        $report_title = "Damaged & Missing Inventory Report";
        if (hasRole('Admin')) {
            $details = safeFetchAll($pdo, "SELECT p.*, c.name as category_name 
                                           FROM " . TBL_STORE_PRODUCTS . " p 
                                           LEFT JOIN " . TBL_STORE_CATEGORIES . " c ON p.category_id = c.id 
                                           WHERE p.stock_status IN ('Damaged', 'Missing')
                                           ORDER BY p.stock_status ASC, p.name ASC");
        } else {
            $details = safeFetchAll($pdo, "SELECT p.*, c.name as category_name 
                                           FROM " . TBL_STORE_PRODUCTS . " p 
                                           LEFT JOIN " . TBL_STORE_CATEGORIES . " c ON p.category_id = c.id 
                                           WHERE p.stock_status IN ('Damaged', 'Missing') AND p.staff_id = ?
                                           ORDER BY p.stock_status ASC, p.name ASC", [$owner_id]);
        }
        break;
}

// Counts for Report tabs indicator
if (hasRole('Admin')) {
    $counts = [
        'returns_due_count' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE status='Issued' AND expected_return_date = CURDATE()")['count'] ?? 0,
        'overdue_count' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE status='Issued' AND expected_return_date < CURDATE()")['count'] ?? 0,
        'damaged_count' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_PRODUCTS . " WHERE stock_status IN ('Damaged', 'Missing')")['count'] ?? 0,
    ];
} else {
    $counts = [
        'returns_due_count' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " sd LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id WHERE sd.status='Issued' AND sd.expected_return_date = CURDATE() AND p.staff_id = ?", [$owner_id])['count'] ?? 0,
        'overdue_count' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " sd LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id WHERE sd.status='Issued' AND sd.expected_return_date < CURDATE() AND p.staff_id = ?", [$owner_id])['count'] ?? 0,
        'damaged_count' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_PRODUCTS . " WHERE stock_status IN ('Damaged', 'Missing') AND staff_id = ?", [$owner_id])['count'] ?? 0,
    ];
}
?>

<div class="row g-2 mb-4 align-items-center">
    <div class="col-md-6">
        <h4><i class="fas fa-file-alt me-2 text-primary"></i> <?= htmlspecialchars($report_title) ?></h4>
    </div>
    <div class="col-md-6 text-md-end">
        <button class="btn btn-outline-secondary btn-sm me-2" onclick="window.print()"><i class="fas fa-print me-1"></i> Print Report</button>
    </div>
</div>

<div class="row g-3">
    <!-- Reports Navigation Sidebar -->
    <div class="col-md-3">
        <div class="list-group shadow-sm border-0">
            <a href="?tab=store_reports&report=stock" class="list-group-item list-group-item-action <?= ($active_report === 'stock') ? 'active' : '' ?>">
                <i class="fas fa-boxes me-2"></i> Current Stock Levels
            </a>
            <a href="?tab=store_reports&report=sold" class="list-group-item list-group-item-action <?= ($active_report === 'sold') ? 'active' : '' ?>">
                <i class="fas fa-file-invoice-dollar me-2"></i> Product Sales Report
            </a>
            <a href="?tab=store_reports&report=support_issued" class="list-group-item list-group-item-action <?= ($active_report === 'support_issued') ? 'active' : '' ?>">
                <i class="fas fa-tools me-2"></i> Support Devices Out
            </a>
            <a href="?tab=store_reports&report=returns_due" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center <?= ($active_report === 'returns_due') ? 'active' : '' ?>">
                <span><i class="fas fa-calendar-day me-2"></i> Due for Return Today</span>
                <?php if ($counts['returns_due_count'] > 0): ?>
                    <span class="badge bg-warning text-dark rounded-pill"><?= $counts['returns_due_count'] ?></span>
                <?php endif; ?>
            </a>
            <a href="?tab=store_reports&report=overdue" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center <?= ($active_report === 'overdue') ? 'active' : '' ?>">
                <span><i class="fas fa-clock me-2"></i> Overdue Support Devices</span>
                <?php if ($counts['overdue_count'] > 0): ?>
                    <span class="badge bg-danger rounded-pill"><?= $counts['overdue_count'] ?></span>
                <?php endif; ?>
            </a>
            <a href="?tab=store_reports&report=damaged" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center <?= ($active_report === 'damaged') ? 'active' : '' ?>">
                <span><i class="fas fa-heart-broken me-2"></i> Damaged / Missing</span>
                <?php if ($counts['damaged_count'] > 0): ?>
                    <span class="badge bg-dark text-white rounded-pill"><?= $counts['damaged_count'] ?></span>
                <?php endif; ?>
            </a>
        </div>
    </div>
    
    <!-- Report Content Pane -->
    <div class="col-md-9">
        
        <?php if ($active_report === 'stock'): ?>
            <!-- Category Summary Card -->
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-white py-3"><h6 class="fw-bold mb-0 text-primary">Stock Summary by Category</h6></div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0 text-center">
                            <thead class="bg-light">
                                <tr>
                                    <th class="text-start ps-4">Category</th>
                                    <th>Total Items</th>
                                    <th>Available</th>
                                    <th>Sold</th>
                                    <th>Support Issued</th>
                                    <th>Damaged/Missing</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($summary)): ?>
                                    <tr>
                                        <td colspan="6" class="text-center py-4 text-muted">No stock data available.</td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($summary as $row): ?>
                                        <tr>
                                            <td class="text-start ps-4 fw-semibold"><?= htmlspecialchars($row['category_name'] ?: 'Uncategorized') ?></td>
                                            <td class="fw-bold"><?= number_format($row['total_items']) ?></td>
                                            <td class="text-success fw-bold"><?= number_format($row['available_items']) ?></td>
                                            <td class="text-primary"><?= number_format($row['sold_items']) ?></td>
                                            <td class="text-warning fw-semibold"><?= number_format($row['support_items']) ?></td>
                                            <td class="text-danger"><?= number_format($row['damaged_missing']) ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Detailed Available Stock List -->
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white py-3"><h6 class="fw-bold mb-0 text-success">Available Products List</h6></div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th class="ps-4">Product Name</th>
                                    <th>Brand / Model</th>
                                    <th>SQ ID</th>
                                    <th>Category</th>
                                    <th>Purchase Price</th>
                                    <th class="pe-4 text-end">Selling Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($details)): ?>
                                    <tr>
                                        <td colspan="6" class="text-center py-4 text-muted">No products currently available in stock.</td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($details as $row): ?>
                                        <tr>
                                            <td class="ps-4 fw-bold"><?= htmlspecialchars($row['name']) ?></td>
                                            <td><?= htmlspecialchars($row['brand_model'] ?: 'N/A') ?></td>
                                            <td><code><?= htmlspecialchars($row['serial_mac']) ?></code></td>
                                            <td><?= htmlspecialchars($row['category_name'] ?? 'Uncategorized') ?></td>
                                            <td>৳<?= number_format($row['purchase_price'], 2) ?></td>
                                            <td class="pe-4 text-end fw-bold text-success">৳<?= number_format($row['selling_price'], 2) ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        <?php elseif ($active_report === 'sold'): ?>
            <!-- Sales Filters -->
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-body">
                    <form method="GET" class="row g-2 align-items-end">
                        <input type="hidden" name="tab" value="store_reports">
                        <input type="hidden" name="report" value="sold">
                        <div class="col-md-4">
                            <label class="form-label small fw-semibold">Start Date</label>
                            <input type="date" name="start_date" class="form-control" value="<?= $start_date ?>">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-semibold">End Date</label>
                            <input type="date" name="end_date" class="form-control" value="<?= $end_date ?>">
                        </div>
                        <div class="col-md-4 d-grid">
                            <button type="submit" class="btn btn-primary"><i class="fas fa-filter me-1"></i> Filter Date Range</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Financial Summary Cards -->
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card border-0 bg-success text-white shadow-sm">
                        <div class="card-body py-3">
                            <h6 class="text-white-50 small mb-1">Cash Collected</h6>
                            <h3 class="fw-bold mb-0">৳<?= number_format($financials['total_paid'] ?? 0, 2) ?></h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-0 bg-danger text-white shadow-sm">
                        <div class="card-body py-3">
                            <h6 class="text-white-50 small mb-1">Pending Due</h6>
                            <h3 class="fw-bold mb-0">৳<?= number_format($financials['total_due'] ?? 0, 2) ?></h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-0 bg-primary text-white shadow-sm">
                        <div class="card-body py-3">
                            <h6 class="text-white-50 small mb-1">Total Sales</h6>
                            <h3 class="fw-bold mb-0">৳<?= number_format($financials['total_sales'] ?? 0, 2) ?></h3>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sales List -->
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th class="ps-4">Invoice</th>
                                    <th>Customer</th>
                                    <th>Product Details</th>
                                    <th>Sold Value</th>
                                    <th>Cash Paid</th>
                                    <th>Due</th>
                                    <th class="pe-4 text-end">Sale Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($details)): ?>
                                    <tr>
                                        <td colspan="7" class="text-center py-4 text-muted">No product sales found in this date range.</td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($details as $row): ?>
                                        <tr>
                                            <td class="ps-4 font-monospace fw-bold text-dark"><?= htmlspecialchars($row['invoice_no']) ?></td>
                                            <td>
                                                <div class="fw-semibold"><?= htmlspecialchars($row['customer_name']) ?></div>
                                                <small class="text-muted"><?= htmlspecialchars($row['customer_username']) ?></small>
                                            </td>
                                            <td>
                                                <div><?= htmlspecialchars($row['product_name']) ?></div>
                                                <small class="text-muted font-monospace">SQ ID: <?= htmlspecialchars($row['serial_mac']) ?></small>
                                            </td>
                                            <td class="fw-bold">৳<?= number_format($row['sold_price'], 2) ?></td>
                                            <td class="text-success">৳<?= number_format($row['paid_amount'], 2) ?></td>
                                            <td class="text-danger fw-semibold">৳<?= number_format($row['due_amount'], 2) ?></td>
                                            <td class="pe-4 text-end text-muted small"><?= date('d M Y h:i A', strtotime($row['sale_date'])) ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        <?php elseif ($active_report === 'support_issued'): ?>
            <!-- Support Devices Out List -->
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th class="ps-4">Support Product</th>
                                    <th>SQ ID</th>
                                    <th>Customer</th>
                                    <th>Issued Date</th>
                                    <th>Expected Return</th>
                                    <th class="pe-4 text-end">Issued By</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($details)): ?>
                                    <tr>
                                        <td colspan="6" class="text-center py-4 text-muted">No support devices are currently out.</td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($details as $row): ?>
                                        <tr>
                                            <td class="ps-4 fw-bold"><?= htmlspecialchars($row['product_name']) ?></td>
                                            <td><code><?= htmlspecialchars($row['serial_mac']) ?></code></td>
                                            <td>
                                                <div class="fw-semibold"><?= htmlspecialchars($row['customer_name']) ?></div>
                                                <small class="text-muted"><?= htmlspecialchars($row['customer_username']) ?></small>
                                            </td>
                                            <td><?= date('d M Y', strtotime($row['given_date'])) ?></td>
                                            <td>
                                                <?php if (empty($row['expected_return_date']) || $row['expected_return_date'] === '0000-00-00'): ?>
                                                    <span class="badge bg-info text-dark">Until Client Left</span>
                                                <?php else: ?>
                                                    <strong class="text-secondary"><?= date('d M Y', strtotime($row['expected_return_date'])) ?></strong>
                                                <?php endif; ?>
                                            </td>
                                            <td class="pe-4 text-end"><?= htmlspecialchars($row['staff_name']) ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        <?php elseif ($active_report === 'returns_due'): ?>
            <!-- Returns Due Today List -->
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th class="ps-4">Support Product</th>
                                    <th>SQ ID</th>
                                    <th>Customer</th>
                                    <th>Issued Date</th>
                                    <th>Expected Return</th>
                                    <th class="pe-4 text-end">Issued By</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($details)): ?>
                                    <tr>
                                        <td colspan="6" class="text-center py-4 text-muted">No returns are due today.</td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($details as $row): ?>
                                        <tr>
                                            <td class="ps-4 fw-bold"><?= htmlspecialchars($row['product_name']) ?></td>
                                            <td><code><?= htmlspecialchars($row['serial_mac']) ?></code></td>
                                            <td>
                                                <div class="fw-semibold"><?= htmlspecialchars($row['customer_name']) ?></div>
                                                <small class="text-muted"><?= htmlspecialchars($row['customer_username']) ?></small>
                                            </td>
                                            <td><?= date('d M Y', strtotime($row['given_date'])) ?></td>
                                            <td><span class="badge bg-warning text-dark">Today</span></td>
                                            <td class="pe-4 text-end"><?= htmlspecialchars($row['staff_name']) ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        <?php elseif ($active_report === 'overdue'): ?>
            <!-- Overdue Devices List -->
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th class="ps-4">Support Product</th>
                                    <th>SQ ID</th>
                                    <th>Customer</th>
                                    <th>Issued Date</th>
                                    <th>Expected Return</th>
                                    <th>Days Overdue</th>
                                    <th class="pe-4 text-end">Issued By</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($details)): ?>
                                    <tr>
                                        <td colspan="7" class="text-center py-4 text-muted">No support devices are overdue. Excellent!</td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($details as $row): ?>
                                        <?php 
                                            $days_overdue = floor((time() - strtotime($row['expected_return_date'])) / (60 * 60 * 24));
                                        ?>
                                        <tr>
                                            <td class="ps-4 fw-bold text-danger"><?= htmlspecialchars($row['product_name']) ?></td>
                                            <td><code><?= htmlspecialchars($row['serial_mac']) ?></code></td>
                                            <td>
                                                <div class="fw-semibold"><?= htmlspecialchars($row['customer_name']) ?></div>
                                                <small class="text-muted"><?= htmlspecialchars($row['customer_username']) ?></small>
                                            </td>
                                            <td><?= date('d M Y', strtotime($row['given_date'])) ?></td>
                                            <td><strong class="text-danger"><?= date('d M Y', strtotime($row['expected_return_date'])) ?></strong></td>
                                            <td><span class="badge bg-danger rounded-pill"><?= $days_overdue ?> Days</span></td>
                                            <td class="pe-4 text-end"><?= htmlspecialchars($row['staff_name']) ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        <?php elseif ($active_report === 'damaged'): ?>
            <!-- Damaged & Missing List -->
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th class="ps-4">Product Name</th>
                                    <th>Brand / Model</th>
                                    <th>SQ ID</th>
                                    <th>Category</th>
                                    <th>Warranty</th>
                                    <th class="pe-4 text-end">Stock Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($details)): ?>
                                    <tr>
                                        <td colspan="6" class="text-center py-4 text-muted">No products marked as damaged or missing.</td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($details as $row): ?>
                                        <tr>
                                            <td class="ps-4 fw-bold"><?= htmlspecialchars($row['name']) ?></td>
                                            <td><?= htmlspecialchars($row['brand_model'] ?: 'N/A') ?></td>
                                            <td><code><?= htmlspecialchars($row['serial_mac']) ?></code></td>
                                            <td><?= htmlspecialchars($row['category_name'] ?? 'Uncategorized') ?></td>
                                            <td><?= htmlspecialchars($row['warranty'] ?: 'No Warranty') ?></td>
                                            <td class="pe-4 text-end">
                                                <span class="badge <?= ($row['stock_status'] === 'Damaged') ? 'bg-danger' : 'bg-dark' ?>">
                                                    <?= $row['stock_status'] ?>
                                                </span>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        <?php endif; ?>

    </div>
</div>
