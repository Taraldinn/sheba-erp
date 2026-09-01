<?php
// views/store/inventory.php
if (!hasRole('Admin') && !hasRole('Reseller') && !isOffice()) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}



// Search & Filter parameters
$search = trim($_GET['search'] ?? '');
$cat_filter = intval($_GET['category_id'] ?? 0);
$status_filter = trim($_GET['status'] ?? '');

$owner_id = get_store_owner_id();

$where_clauses = ["1=1"];
$params = [];

if (!hasRole('Admin')) {
    $where_clauses[] = "p.staff_id = ?";
    $params[] = $owner_id;
}

if ($search !== '') {
    $where_clauses[] = "(p.name LIKE ? OR p.brand_model LIKE ? OR p.serial_mac LIKE ? OR p.supplier LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

if ($cat_filter > 0) {
    $where_clauses[] = "p.category_id = ?";
    $params[] = $cat_filter;
}

if ($status_filter !== '') {
    $where_clauses[] = "p.stock_status = ?";
    $params[] = $status_filter;
}

$where_str = implode(" AND ", $where_clauses);

// Fetch data
if (hasRole('Admin')) {
    $categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_STORE_CATEGORIES . " ORDER BY name ASC");
} else {
    $categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_STORE_CATEGORIES . " WHERE staff_id = ? ORDER BY name ASC", [$owner_id]);
}

// Fetch products with pagination
$page = max(1, intval($_GET['page'] ?? 1));
$limit = 20;
$offset = ($page - 1) * $limit;

$total_products = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_PRODUCTS . " p WHERE $where_str", $params)['count'] ?? 0;
$total_pages = ceil($total_products / $limit);

$products_query = "SELECT p.*, c.name as category_name 
                   FROM " . TBL_STORE_PRODUCTS . " p 
                   LEFT JOIN " . TBL_STORE_CATEGORIES . " c ON p.category_id = c.id 
                   WHERE $where_str 
                   ORDER BY p.id DESC 
                   LIMIT $limit OFFSET $offset";
$products = safeFetchAll($pdo, $products_query, $params);

// Stats (Bulk Quantity logic)
if (hasRole('Admin')) {
    $stats = [
        'available' => safeFetch($pdo, "SELECT SUM(quantity) as count FROM " . TBL_STORE_PRODUCTS)['count'] ?? 0,
        'sold' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SALES)['count'] ?? 0,
        'support' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE status='Issued'")['count'] ?? 0,
        'damaged' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE status IN ('Damaged', 'Missing')")['count'] ?? 0,
    ];
} else {
    $stats = [
        'available' => safeFetch($pdo, "SELECT SUM(quantity) as count FROM " . TBL_STORE_PRODUCTS . " WHERE staff_id = ?", [$owner_id])['count'] ?? 0,
        'sold' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SALES . " s LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id WHERE p.staff_id = ?", [$owner_id])['count'] ?? 0,
        'support' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " s LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id WHERE s.status='Issued' AND p.staff_id = ?", [$owner_id])['count'] ?? 0,
        'damaged' => safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " s LEFT JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id WHERE s.status IN ('Damaged', 'Missing') AND p.staff_id = ?", [$owner_id])['count'] ?? 0,
    ];
}
$stats['total'] = $stats['available'] + $stats['sold'] + $stats['support'] + $stats['damaged'];

function getStatusBadgeClass($status) {
    switch ($status) {
        case 'Available': return 'bg-success';
        case 'Sold': return 'bg-primary';
        case 'Support Issued': return 'bg-warning text-dark';
        case 'Returned': return 'bg-info text-dark';
        case 'Damaged': return 'bg-danger';
        case 'Missing': return 'bg-dark';
        default: return 'bg-secondary';
    }
}
?>

<style>
    .stat-card {
        border-radius: 12px;
        transition: all 0.3s ease;
    }
    .stat-card:hover {
        transform: translateY(-4px);
    }
</style>

<div class="row g-3 mb-4">
    <div class="col-md-2 col-6">
        <div class="card stat-card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-primary rounded-3 p-3 me-3 text-primary"><i class="fas fa-cubes fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Total Stock</h6>
                    <h3 class="fw-bold mb-0"><?= number_format($stats['total']) ?></h3>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-2 col-6">
        <div class="card stat-card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-success rounded-3 p-3 me-3 text-success"><i class="fas fa-check-circle fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Available</h6>
                    <h3 class="fw-bold mb-0 text-success"><?= number_format($stats['available']) ?></h3>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-2 col-6">
        <div class="card stat-card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-info rounded-3 p-3 me-3 text-primary"><i class="fas fa-shopping-basket fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Sold</h6>
                    <h3 class="fw-bold mb-0 text-primary"><?= number_format($stats['sold']) ?></h3>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-3 col-6">
        <div class="card stat-card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-warning rounded-3 p-3 me-3 text-warning"><i class="fas fa-tools fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Support Issued</h6>
                    <h3 class="fw-bold mb-0 text-warning"><?= number_format($stats['support']) ?></h3>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-3 col-12">
        <div class="card stat-card border-0 shadow-sm bg-white text-dark h-100">
            <div class="card-body py-3 d-flex align-items-center">
                <div class="bg-light-danger rounded-3 p-3 me-3 text-danger"><i class="fas fa-exclamation-triangle fa-2x"></i></div>
                <div>
                    <h6 class="text-muted small mb-1">Damaged / Missing</h6>
                    <h3 class="fw-bold mb-0 text-danger"><?= number_format($stats['damaged']) ?></h3>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4><i class="fas fa-boxes me-2 text-primary"></i> Inventory Management</h4>
    <div>
        <button class="btn btn-outline-primary me-2" data-bs-toggle="modal" data-bs-target="#categoryModal">
            <i class="fas fa-tags me-1"></i> Manage Categories
        </button>
        <button class="btn btn-primary" onclick="addProduct()">
            <i class="fas fa-plus me-1"></i> Add Product
        </button>
    </div>
</div>

<div class="card border-0 shadow-sm mb-4">
    <div class="card-body">
        <form method="GET" class="row g-2">
            <input type="hidden" name="tab" value="store_inventory">
            <div class="col-md-4">
                <div class="input-group">
                    <span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted"></i></span>
                    <input type="text" name="search" class="form-control border-start-0" placeholder="Search by name, brand, SQ ID, supplier..." value="<?= htmlspecialchars($search) ?>">
                </div>
            </div>
            <div class="col-md-3">
                <select name="category_id" class="form-select">
                    <option value="">-- All Categories --</option>
                    <?php foreach ($categories as $cat): ?>
                        <option value="<?= $cat['id'] ?>" <?= ($cat_filter === intval($cat['id'])) ? 'selected' : '' ?>><?= htmlspecialchars($cat['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-5 d-grid">
                <button type="submit" class="btn btn-secondary"><i class="fas fa-filter me-1"></i> Filter</button>
            </div>
        </form>
    </div>
</div>

<!-- Inventory Table -->
<div class="card border-0 shadow-sm">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-4">Product Details</th>
                        <th>SQ ID</th>
                        <th>Category</th>
                        <th>Prices</th>
                        <th>Warranty & Supplier</th>
                        <th class="text-center">Stock Quantity</th>
                        <th class="pe-4 text-end">Action</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($products)): ?>
                        <tr>
                            <td colspan="7" class="text-center py-5 text-muted">
                                <i class="fas fa-box-open fa-3x mb-3 text-light"></i>
                                <p class="mb-0">No products found matching the criteria.</p>
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($products as $p): ?>
                            <tr>
                                <td class="ps-4">
                                    <div class="fw-bold"><?= htmlspecialchars($p['name']) ?></div>
                                    <small class="text-muted"><?= htmlspecialchars($p['brand_model']) ?></small>
                                </td>
                                <td>
                                    <code><?= htmlspecialchars($p['serial_mac']) ?></code>
                                </td>
                                <td><?= htmlspecialchars($p['category_name'] ?? 'Uncategorized') ?></td>
                                <td>
                                    <span class="d-block small text-muted">Purchase: ৳<?= number_format($p['purchase_price'], 2) ?></span>
                                    <span class="fw-bold text-success">Sale: ৳<?= number_format($p['selling_price'], 2) ?></span>
                                </td>
                                <td>
                                    <span class="d-block text-truncate small" style="max-width: 150px;" title="<?= htmlspecialchars($p['supplier']) ?>">
                                        <i class="fas fa-truck me-1 text-muted"></i><?= htmlspecialchars($p['supplier'] ?: 'N/A') ?>
                                    </span>
                                    <span class="d-block small text-muted"><i class="fas fa-shield-alt me-1"></i><?= htmlspecialchars($p['warranty'] ?: 'No Warranty') ?></span>
                                </td>
                                <td class="text-center">
                                    <span class="badge bg-<?= $p['quantity'] > 0 ? 'success' : 'danger' ?> fs-6 px-3 py-2"><?= intval($p['quantity']) ?></span>
                                </td>
                                <td class="pe-4 text-end">
                                    <button class="btn btn-sm btn-outline-primary me-1" onclick='editProduct(<?= json_encode($p, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'>
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <form method="POST" action="" class="d-inline" onsubmit="return confirm('Are you sure you want to delete this product?');">
                                        <input type="hidden" name="action" value="delete_product">
                                        <input type="hidden" name="id" value="<?= $p['id'] ?>">
                                        <button type="submit" class="btn btn-sm btn-outline-danger">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </form>
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
                        <a class="page-link" href="?tab=store_inventory&page=<?= $page - 1 ?>&search=<?= urlencode($search) ?>&category_id=<?= $cat_filter ?>&status=<?= urlencode($status_filter) ?>">Previous</a>
                    </li>
                    <?php for ($i = 1; $i <= $total_pages; $i++): ?>
                        <li class="page-item <?= ($page == $i) ? 'active' : '' ?>">
                            <a class="page-link" href="?tab=store_inventory&page=<?= $i ?>&search=<?= urlencode($search) ?>&category_id=<?= $cat_filter ?>&status=<?= urlencode($status_filter) ?>"><?= $i ?></a>
                        </li>
                    <?php endfor; ?>
                    <li class="page-item <?= ($page >= $total_pages) ? 'disabled' : '' ?>">
                        <a class="page-link" href="?tab=store_inventory&page=<?= $page + 1 ?>&search=<?= urlencode($search) ?>&category_id=<?= $cat_filter ?>&status=<?= urlencode($status_filter) ?>">Next</a>
                    </li>
                </ul>
            </nav>
        </div>
    <?php endif; ?>
</div>

<!-- Product Add/Edit Modal -->
<div class="modal fade" id="productModal" tabindex="-1">
    <div class="modal-dialog">
                                        <form method="POST" action="" class="modal-content">
                                            <div class="modal-header">
                <h5 class="modal-title" id="prodModalTitle">Add Product</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="action" id="prod_action" value="add_product">
                <input type="hidden" name="id" id="prod_id">
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Category <span class="text-danger">*</span></label>
                    <select name="category_id" id="prod_category" class="form-select" required>
                        <option value="">-- Choose Category --</option>
                        <?php foreach ($categories as $cat): ?>
                            <option value="<?= $cat['id'] ?>"><?= htmlspecialchars($cat['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Product Name <span class="text-danger">*</span></label>
                    <input type="text" name="name" id="prod_name" class="form-control" placeholder="e.g. Dual-Band Router" required>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Brand / Model</label>
                    <input type="text" name="brand_model" id="prod_brand_model" class="form-control" placeholder="e.g. TP-Link Archer C6">
                </div>

                <div class="mb-3">
                                                    <label class="form-label fw-semibold">SQ ID <span class="text-danger">*</span></label>
                                                    <input type="text" name="serial_mac" id="prod_serial" class="form-control" placeholder="Unique SQ ID" required>
                                                </div>

                                                <div class="mb-3" id="quantity_field_container">
                                                    <label class="form-label fw-semibold">Total Stock Quantity <span class="text-danger">*</span></label>
                                                    <input type="number" name="quantity" id="prod_quantity" class="form-control" value="1" min="1" required>
                                                    <small class="text-muted">Enter the total available bulk quantity for this product.</small>
                                                </div>

                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="form-label fw-semibold">Purchase Price (৳)</label>
                        <input type="number" step="0.01" name="purchase_price" id="prod_purchase_price" class="form-control" placeholder="0.00">
                    </div>
                    <div class="col-6">
                        <label class="form-label fw-semibold">Selling Price (৳)</label>
                        <input type="number" step="0.01" name="selling_price" id="prod_selling_price" class="form-control" placeholder="0.00">
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Supplier</label>
                    <input type="text" name="supplier" id="prod_supplier" class="form-control" placeholder="Supplier name">
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold">Warranty Details</label>
                    <input type="text" name="warranty" id="prod_warranty" class="form-control" placeholder="e.g. 1 Year Service Warranty">
                </div>


            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" id="prodSubmitBtn" class="btn btn-primary px-4">Save Product</button>
            </div>
        </form>
    </div>
</div>

<!-- Category Management Modal -->
<div class="modal fade" id="categoryModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Product Categories</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <!-- Add Category Form -->
                <form method="POST" action="" class="row g-2 mb-4">
                    <input type="hidden" name="action" value="add_category">
                    <div class="col-8">
                        <input type="text" name="name" class="form-control" placeholder="New Category Name" required>
                    </div>
                    <div class="col-4 d-grid">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-plus me-1"></i> Add Category</button>
                    </div>
                </form>
                
                <hr>
                
                <!-- Category List Table -->
                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                    <table class="table table-sm align-middle table-hover">
                        <thead>
                            <tr>
                                <th>Category Name</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($categories)): ?>
                                <tr>
                                    <td colspan="2" class="text-center text-muted">No categories created yet.</td>
                                </tr>
                            <?php else: ?>
                                <?php foreach ($categories as $cat): ?>
                                    <tr>
                                        <td>
                                            <span id="cat_display_<?= $cat['id'] ?>"><?= htmlspecialchars($cat['name']) ?></span>
                                            
                                            <!-- Inline Edit Form (Hidden by Default) -->
                                            <form method="POST" action="" id="cat_form_<?= $cat['id'] ?>" class="d-none row g-1">
                                                <input type="hidden" name="action" value="edit_category">
                                                <input type="hidden" name="id" value="<?= $cat['id'] ?>">
                                                <div class="col-8">
                                                    <input type="text" name="name" class="form-control form-control-sm" value="<?= htmlspecialchars($cat['name']) ?>" required>
                                                </div>
                                                <div class="col-4">
                                                    <button type="submit" class="btn btn-sm btn-success"><i class="fas fa-check"></i></button>
                                                    <button type="button" class="btn btn-sm btn-secondary" onclick="toggleCatEdit(<?= $cat['id'] ?>, false)"><i class="fas fa-times"></i></button>
                                                </div>
                                            </form>
                                        </td>
                                        <td class="text-end">
                                            <div id="cat_btns_<?= $cat['id'] ?>">
                                                <button class="btn btn-sm btn-outline-primary" onclick="toggleCatEdit(<?= $cat['id'] ?>, true)">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <form method="POST" action="" class="d-inline" onsubmit="return confirm('Delete this category? Products inside won\'t be deleted but will belong to no category.');">
                                                    <input type="hidden" name="action" value="delete_category">
                                                    <input type="hidden" name="id" value="<?= $cat['id'] ?>">
                                                    <button type="submit" class="btn btn-sm btn-outline-danger">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </form>
                                            </div>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<script>
    let productModal = null;
    document.addEventListener("DOMContentLoaded", function() {
        productModal = new bootstrap.Modal(document.getElementById('productModal'));
    });

    function addProduct() {
        document.getElementById('prodModalTitle').innerText = "Add Product";
        document.getElementById('prod_action').value = "add_product";
        document.getElementById('prod_id').value = "";
        document.getElementById('prod_category').value = "";
        document.getElementById('prod_name').value = "";
        document.getElementById('prod_brand_model').value = "";
        document.getElementById('prod_serial').value = "";
        document.getElementById('prod_purchase_price').value = "";
        document.getElementById('prod_selling_price').value = "";
        document.getElementById('prod_supplier').value = "";
        document.getElementById('prod_warranty').value = "";
        document.getElementById('quantity_field_container').style.display = 'block';
        document.getElementById('prod_quantity').value = "1";
        document.getElementById('prodSubmitBtn').innerText = "Add Product";
        productModal.show();
    }

    function editProduct(data) {
        document.getElementById('prodModalTitle').innerText = "Edit Product: " + data.name;
        document.getElementById('prod_action').value = "edit_product";
        document.getElementById('prod_id').value = data.id;
        document.getElementById('prod_category').value = data.category_id;
        document.getElementById('prod_name').value = data.name;
        document.getElementById('prod_brand_model').value = data.brand_model || "";
        document.getElementById('prod_serial').value = data.serial_mac;
        document.getElementById('prod_purchase_price').value = data.purchase_price;
        document.getElementById('prod_selling_price').value = data.selling_price;
        document.getElementById('prod_supplier').value = data.supplier || "";
        document.getElementById('prod_warranty').value = data.warranty || "";
        document.getElementById('quantity_field_container').style.display = 'block';
        document.getElementById('prod_quantity').value = data.quantity || "1";
        document.getElementById('prodSubmitBtn').innerText = "Update Product";
        productModal.show();
    }

    function toggleCatEdit(id, editMode) {
        let displayEl = document.getElementById('cat_display_' + id);
        let formEl = document.getElementById('cat_form_' + id);
        let btnsEl = document.getElementById('cat_btns_' + id);
        
        if (editMode) {
            displayEl.classList.add('d-none');
            formEl.classList.remove('d-none');
            btnsEl.classList.add('d-none');
        } else {
            displayEl.classList.remove('d-none');
            formEl.classList.add('d-none');
            btnsEl.classList.remove('d-none');
        }
    }
</script>
