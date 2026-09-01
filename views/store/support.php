<?php
// views/store/support.php
if (!hasRole('Admin') && !hasRole('Reseller') && !isOffice()) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}



// Filter parameters
$search = trim($_GET['search'] ?? '');
$status_filter = trim($_GET['status'] ?? '');

$owner_id = get_store_owner_id();

$where_clauses = ["1=1"];
$params = [];

if (!hasRole('Admin')) {
    $where_clauses[] = "p.staff_id = ?";
    $params[] = $owner_id;
}

if ($search !== '') {
    $where_clauses[] = "(u.name LIKE ? OR u.user_id LIKE ? OR p.name LIKE ? OR p.serial_mac LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

if ($status_filter === 'Overdue') {
    $where_clauses[] = "sd.status = 'Issued' AND sd.expected_return_date IS NOT NULL AND sd.expected_return_date < CURDATE()";
} elseif ($status_filter !== '') {
    $where_clauses[] = "sd.status = ?";
    $params[] = $status_filter;
}

$where_str = implode(" AND ", $where_clauses);

// Fetch data for dropdowns
if (hasRole('Admin')) {
    $clients = safeFetchAll($pdo, "SELECT id, name, user_id, phone FROM " . TBL_USERS . " ORDER BY name ASC");
    $available_products = safeFetchAll($pdo, "SELECT id, name, brand_model, serial_mac, quantity FROM " . TBL_STORE_PRODUCTS . " WHERE quantity > 0 ORDER BY name ASC");
} else {
    $clients = safeFetchAll($pdo, "SELECT id, name, user_id, phone FROM " . TBL_USERS . " WHERE manager_id = ? OR manager_id IN (SELECT id FROM " . TBL_STAFF . " WHERE parent_id = ?) ORDER BY name ASC", [$owner_id, $owner_id]);
    $available_products = safeFetchAll($pdo, "SELECT id, name, brand_model, serial_mac, quantity FROM " . TBL_STORE_PRODUCTS . " WHERE quantity > 0 AND staff_id = ? ORDER BY name ASC", [$owner_id]);
}

// Pagination
$page = max(1, intval($_GET['page'] ?? 1));
$limit = 20;
$offset = ($page - 1) * $limit;

$total_support = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " sd LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id LEFT JOIN " . TBL_USERS . " u ON sd.customer_id = u.id WHERE $where_str", $params)['count'] ?? 0;
$total_pages = ceil($total_support / $limit);

$support_query = "SELECT sd.*, p.name as product_name, p.brand_model, p.serial_mac, 
                         u.name as customer_name, u.user_id as customer_username, u.phone as customer_phone,
                         st_given.name as staff_given_name, st_recv.name as staff_received_name
                  FROM " . TBL_STORE_SUPPORT . " sd 
                  LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id 
                  LEFT JOIN " . TBL_USERS . " u ON sd.customer_id = u.id 
                  LEFT JOIN " . TBL_STAFF . " st_given ON sd.given_by_staff = st_given.id
                  LEFT JOIN " . TBL_STAFF . " st_recv ON sd.received_by_staff = st_recv.id
                  WHERE $where_str 
                  ORDER BY sd.id DESC 
                  LIMIT $limit OFFSET $offset";
$records = safeFetchAll($pdo, $support_query, $params);

// Stats
if (hasRole('Admin')) {
    $stats = [
        'issued' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE status='Issued'")['count'] ?? 0,
        'overdue' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE status='Issued' AND expected_return_date IS NOT NULL AND expected_return_date < CURDATE()")['count'] ?? 0,
        'returned_today' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE return_date = CURDATE()")['count'] ?? 0,
    ];
} else {
    $stats = [
        'issued' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " sd LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id WHERE sd.status='Issued' AND p.staff_id = ?", [$owner_id])['count'] ?? 0,
        'overdue' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " sd LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id WHERE sd.status='Issued' AND sd.expected_return_date IS NOT NULL AND sd.expected_return_date < CURDATE() AND p.staff_id = ?", [$owner_id])['count'] ?? 0,
        'returned_today' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " sd LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id WHERE sd.return_date = CURDATE() AND p.staff_id = ?", [$owner_id])['count'] ?? 0,
    ];
}

function getSupportStatusBadge($row) {
    if ($row['status'] === 'Issued' && !empty($row['expected_return_date']) && $row['expected_return_date'] !== '0000-00-00' && $row['expected_return_date'] < date('Y-m-d')) {
        return '<span class="badge bg-danger"><i class="fas fa-exclamation-triangle me-1"></i>Overdue</span>';
    }
    switch ($row['status']) {
        case 'Issued': return '<span class="badge bg-warning text-dark"><i class="fas fa-share me-1"></i>Issued</span>';
        case 'Returned': return '<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Returned</span>';
        case 'Damaged': return '<span class="badge bg-danger"><i class="fas fa-heart-broken me-1"></i>Damaged</span>';
        case 'Missing': return '<span class="badge bg-dark"><i class="fas fa-question-circle me-1"></i>Missing</span>';
        default: return '<span class="badge bg-secondary">' . $row['status'] . '</span>';
    }
}
?>

<div class="row g-3 mb-4">
    <div class="col-md-4 col-6">
        <div class="card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-warning rounded-3 p-3 me-3 text-warning"><i class="fas fa-hands-helping fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Currently Out (Issued)</h6>
                    <h3 class="fw-bold mb-0 text-warning"><?= number_format($stats['issued']) ?></h3>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-4 col-6">
        <div class="card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-danger rounded-3 p-3 me-3 text-danger"><i class="fas fa-clock fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Overdue Devices</h6>
                    <h3 class="fw-bold mb-0 text-danger"><?= number_format($stats['overdue']) ?></h3>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-4 col-12">
        <div class="card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-success rounded-3 p-3 me-3 text-success"><i class="fas fa-undo-alt fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Returned Today</h6>
                    <h3 class="fw-bold mb-0 text-success"><?= number_format($stats['returned_today']) ?></h3>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4><i class="fas fa-tools me-2 text-warning"></i> Support Device Tracking</h4>
    <button class="btn btn-warning text-dark" data-bs-toggle="modal" data-bs-target="#issueModal">
        <i class="fas fa-hands-helping me-1"></i> Issue Support Device
    </button>
</div>

<div class="card border-0 shadow-sm mb-4">
    <div class="card-body">
        <form method="GET" class="row g-2">
            <input type="hidden" name="tab" value="store_support">
            <div class="col-md-6">
                <div class="input-group">
                    <span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted"></i></span>
                    <input type="text" name="search" class="form-control border-start-0" placeholder="Search by customer name, username, product, SQ ID..." value="<?= htmlspecialchars($search) ?>">
                </div>
            </div>
            <div class="col-md-4">
                <select name="status" class="form-select">
                    <option value="">-- All Statuses --</option>
                    <option value="Issued" <?= ($status_filter === 'Issued') ? 'selected' : '' ?>>Issued</option>
                    <option value="Overdue" <?= ($status_filter === 'Overdue') ? 'selected' : '' ?>>Overdue</option>
                    <option value="Returned" <?= ($status_filter === 'Returned') ? 'selected' : '' ?>>Returned</option>
                    <option value="Damaged" <?= ($status_filter === 'Damaged') ? 'selected' : '' ?>>Damaged</option>
                    <option value="Missing" <?= ($status_filter === 'Missing') ? 'selected' : '' ?>>Missing</option>
                </select>
            </div>
            <div class="col-md-2 d-grid">
                <button type="submit" class="btn btn-secondary"><i class="fas fa-filter me-1"></i> Filter</button>
            </div>
        </form>
    </div>
</div>

<!-- Support Devices Table -->
<div class="card border-0 shadow-sm">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-4">Product Details</th>
                        <th>Customer</th>
                        <th>Dates</th>
                        <th>Condition (G/R)</th>
                        <th>Staff Log</th>
                        <th>Status</th>
                        <th class="pe-4 text-end">Action</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($records)): ?>
                        <tr>
                            <td colspan="7" class="text-center py-5 text-muted">
                                <i class="fas fa-hands-helping fa-3x mb-3 text-light"></i>
                                <p class="mb-0">No support devices issued yet.</p>
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($records as $row): ?>
                            <tr>
                                <td class="ps-4">
                                    <div class="fw-bold"><?= htmlspecialchars($row['product_name']) ?></div>
                                    <small class="text-muted"><?= htmlspecialchars($row['brand_model']) ?> (SKU: <?= htmlspecialchars($row['serial_mac']) ?>)</small><br>
                                    <small class="text-danger fw-bold font-monospace">Item SQ ID: <?= htmlspecialchars($row['item_serial_mac'] ?: 'N/A') ?></small>
                                </td>
                                <td>
                                    <div class="fw-bold"><?= htmlspecialchars($row['customer_name']) ?></div>
                                    <small class="text-muted"><?= htmlspecialchars($row['customer_username']) ?></small>
                                    <?php if ($row['ticket_id']): ?>
                                        <br><span class="badge bg-light text-primary border small">Ticket #<?= $row['ticket_id'] ?></span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <span class="d-block small">Issued: <?= date('d M Y', strtotime($row['given_date'])) ?></span>
                                    <span class="d-block small">Expected: 
                                        <?php if (empty($row['expected_return_date']) || $row['expected_return_date'] === '0000-00-00'): ?>
                                            <span class="badge bg-info text-dark">Until Client Left</span>
                                        <?php else: ?>
                                            <strong class="text-secondary"><?= date('d M Y', strtotime($row['expected_return_date'])) ?></strong>
                                        <?php endif; ?>
                                    </span>
                                    <?php if ($row['return_date']): ?>
                                        <span class="d-block small text-success">Returned: <?= date('d M Y', strtotime($row['return_date'])) ?></span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <span class="d-block small text-muted">Given: <span class="badge bg-light text-dark"><?= htmlspecialchars($row['given_condition']) ?></span></span>
                                    <?php if ($row['return_condition']): ?>
                                        <span class="d-block small text-muted">Returned: <span class="badge bg-light text-dark"><?= htmlspecialchars($row['return_condition']) ?></span></span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <span class="d-block small text-muted">Issued: <?= htmlspecialchars($row['staff_given_name']) ?></span>
                                    <?php if ($row['received_by_staff']): ?>
                                        <span class="d-block small text-muted">Recv: <?= htmlspecialchars($row['staff_received_name']) ?></span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <?= getSupportStatusBadge($row) ?>
                                </td>
                                <td class="pe-4 text-end">
                                    <?php if ($row['status'] === 'Issued'): ?>
                                        <button class="btn btn-sm btn-outline-success" onclick='openReturnModal(<?= json_encode($row, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'>
                                            <i class="fas fa-undo me-1"></i> Return
                                        </button>
                                    <?php else: ?>
                                        <button class="btn btn-sm btn-light disabled" disabled>
                                            <i class="fas fa-check"></i> Done
                                        </button>
                                    <?php endif; ?>
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
                        <a class="page-link" href="?tab=store_support&page=<?= $page - 1 ?>&search=<?= urlencode($search) ?>&status=<?= urlencode($status_filter) ?>">Previous</a>
                    </li>
                    <?php for ($i = 1; $i <= $total_pages; $i++): ?>
                        <li class="page-item <?= ($page == $i) ? 'active' : '' ?>">
                            <a class="page-link" href="?tab=store_support&page=<?= $i ?>&search=<?= urlencode($search) ?>&status=<?= urlencode($status_filter) ?>"><?= $i ?></a>
                        </li>
                    <?php endfor; ?>
                    <li class="page-item <?= ($page >= $total_pages) ? 'disabled' : '' ?>">
                        <a class="page-link" href="?tab=store_support&page=<?= $page + 1 ?>&search=<?= urlencode($search) ?>&status=<?= urlencode($status_filter) ?>">Next</a>
                    </li>
                </ul>
            </nav>
        </div>
    <?php endif; ?>
</div>

<!-- Issue Support Device Modal -->
<div class="modal fade" id="issueModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" action="" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Issue Temporary Device</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="action" value="issue_support_device">
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Select Customer <span class="text-danger">*</span></label>
                    <select name="customer_id" id="issue_customer" class="form-select select2-clients" style="width:100%" required>
                        <option value="">-- Search Customer --</option>
                        <?php foreach ($clients as $client): ?>
                            <option value="<?= $client['id'] ?>"><?= htmlspecialchars($client['name']) ?> (<?= htmlspecialchars($client['user_id']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Select Available Product <span class="text-danger">*</span></label>
                    <select name="product_id" id="issue_product" class="form-select select2-products" style="width:100%" required>
                        <option value="">-- Search Available Product/SKU --</option>
                        <?php foreach ($available_products as $prod): ?>
                            <option value="<?= $prod['id'] ?>"><?= htmlspecialchars($prod['name']) ?> - <?= htmlspecialchars($prod['brand_model'] ?: 'No Brand') ?> (SKU: <?= htmlspecialchars($prod['serial_mac']) ?>) - Qty: <?= $prod['quantity'] ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Specific Item SQ ID / MAC <span class="text-danger">*</span></label>
                    <input type="text" name="item_serial_mac" class="form-control" placeholder="Scan or enter the exact SQ ID / MAC of the issued device" required>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Ticket ID (Optional)</label>
                    <input type="number" name="ticket_id" class="form-control" placeholder="e.g. 1045">
                </div>

                <div class="row g-2 mb-3 align-items-end">
                    <div class="col-md-6">
                        <label class="form-label fw-semibold">Issued Date <span class="text-danger">*</span></label>
                        <input type="date" name="given_date" class="form-control" value="<?= date('Y-m-d') ?>" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-semibold">Return Option <span class="text-danger">*</span></label>
                        <div class="d-flex gap-3 align-items-center form-control-plaintext ps-1">
                            <div class="form-check mb-0">
                                <input class="form-check-input" type="radio" name="return_type" id="return_type_date" value="date" checked>
                                <label class="form-check-label text-dark fw-medium small" for="return_type_date">Specific Date</label>
                            </div>
                            <div class="form-check mb-0">
                                <input class="form-check-input" type="radio" name="return_type" id="return_type_left" value="left_client">
                                <label class="form-check-label text-dark fw-medium small" for="return_type_left">Until Client Left</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-3" id="expected_return_date_wrapper">
                    <label class="form-label fw-semibold">Expected Return Date <span class="text-danger">*</span></label>
                    <input type="date" name="expected_return_date" id="expected_return_date" class="form-control" value="<?= date('Y-m-d', strtotime('+7 days')) ?>" required>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Issued Condition</label>
                    <input type="text" name="given_condition" class="form-control" value="Good" placeholder="e.g. Brand New, Good, Scratched">
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Remarks</label>
                    <textarea name="remarks" class="form-control" rows="2" placeholder="e.g. Issued for temporary backup during replacement"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-warning text-dark px-4">Issue Device</button>
            </div>
        </form>
    </div>
</div>

<!-- Return Support Device Modal -->
<div class="modal fade" id="returnModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" action="" class="modal-content">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title"><i class="fas fa-undo me-2"></i>Process Device Return</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="action" value="return_support_device">
                <input type="hidden" name="support_id" id="return_support_id">
                
                <div class="bg-light p-3 rounded mb-3 small">
                    <div class="mb-1"><strong>Device:</strong> <span id="return_disp_product"></span></div>
                    <div class="mb-1"><strong>Issued To:</strong> <span id="return_disp_customer"></span></div>
                    <div><strong>Expected Return:</strong> <span id="return_disp_expected"></span></div>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Return Condition <span class="text-danger">*</span></label>
                    <input type="text" name="return_condition" class="form-control" value="Good" placeholder="e.g. Good, Minor Scratches, Defective" required>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Stock Status After Return <span class="text-danger">*</span></label>
                    <select name="stock_status" class="form-select" required>
                        <option value="Available">Available (Return to Active Stock)</option>
                        <option value="Damaged">Damaged (Move to Damaged Inventory)</option>
                        <option value="Missing">Missing (Mark as Lost/Missing)</option>
                    </select>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Return Remarks / Notes</label>
                    <textarea name="remarks" class="form-control" rows="2" placeholder="e.g. Returned by customer, tested and working fine"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-success px-4">Process Return</button>
            </div>
        </form>
    </div>
</div>

<script>
    let returnModal = null;
    document.addEventListener("DOMContentLoaded", function() {
        returnModal = new bootstrap.Modal(document.getElementById('returnModal'));
        
        if (typeof jQuery !== 'undefined') {
            $('.select2-clients').select2({
                theme: 'bootstrap-5',
                placeholder: '-- Search Customer --',
                dropdownParent: $('#issueModal')
            });
            $('.select2-products').select2({
                theme: 'bootstrap-5',
                placeholder: '-- Search Available Product/SQ ID --',
                dropdownParent: $('#issueModal')
            });

            // Toggle Expected Return Date input
            $('input[name="return_type"]').on('change', function() {
                if ($(this).val() === 'left_client') {
                    $('#expected_return_date_wrapper').slideUp();
                    $('#expected_return_date').prop('required', false).val('');
                } else {
                    $('#expected_return_date_wrapper').slideDown();
                    $('#expected_return_date').prop('required', true).val('<?= date('Y-m-d', strtotime('+7 days')) ?>');
                }
            });
        }
    });

    function openReturnModal(data) {
        document.getElementById('return_support_id').value = data.id;
        document.getElementById('return_disp_product').innerText = data.product_name + " (" + data.serial_mac + ")";
        document.getElementById('return_disp_customer').innerText = data.customer_name + " (" + data.customer_username + ")";
        
        let expected = data.expected_return_date;
        if (!expected || expected === '0000-00-00') {
            expected = 'Until Client Left';
        }
        document.getElementById('return_disp_expected').innerText = expected;
        returnModal.show();
    }
</script>
