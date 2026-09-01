<?php
/**
 * views/tasks/settings.php
 * Task Management Category Settings view under tenant isolation.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;

if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_categories')) {
    echo "<div class='container mt-4'><div class='alert alert-danger'>Access Denied. You do not have permission to manage category settings.</div></div>";
    return;
}

// Fetch categories for this tenant
$categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_CATEGORIES . " WHERE tenant_id = ? ORDER BY id DESC", [$tenant_id]);

?>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-cog text-dark me-2"></i> Settings</h4>
    </div>

    <div class="row g-4">
        <!-- Categories Admin -->
        <div class="col-12 col-md-8">
            <div class="card border-0 shadow-sm rounded-4">
                <div class="card-header bg-white border-bottom-0 py-3 d-flex justify-content-between align-items-center">
                    <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-tags me-2 text-primary"></i> Task Categories</h5>
                    <span class="badge bg-light text-dark border rounded-pill px-3"><?= count($categories) ?> Categories</span>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
                            <thead class="bg-light text-muted">
                                <tr>
                                    <th class="ps-4">Category Name</th>
                                    <th>Status</th>
                                    <th>Created At</th>
                                    <th class="text-end pe-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($categories)): ?>
                                    <tr><td colspan="4" class="text-center py-5 text-muted">No custom categories created yet.</td></tr>
                                <?php else: foreach($categories as $c): ?>
                                    <tr>
                                        <td class="ps-4 fw-bold text-dark"><?= htmlspecialchars($c['name']) ?></td>
                                        <td>
                                            <?php if ($c['status'] === 'Active'): ?>
                                                <span class="badge bg-success">Active</span>
                                            <?php else: ?>
                                                <span class="badge bg-secondary">Inactive</span>
                                            <?php endif; ?>
                                        </td>
                                        <td class="text-muted font-monospace"><?= date('d M Y, h:i A', strtotime($c['created_at'])) ?></td>
                                        <td class="text-end pe-4">
                                            <button class="btn btn-sm btn-outline-primary rounded-pill px-3 me-1" onclick='editCategory(<?= json_encode($c, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'>
                                                <i class="fas fa-edit"></i> Edit
                                            </button>
                                            <a href="?tab=tasks_settings&action=delete_category&id=<?= $c['id'] ?>" class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="return confirm('Are you sure you want to delete this category?')">
                                                <i class="fas fa-trash-alt"></i> Delete
                                            </a>
                                        </td>
                                    </tr>
                                <?php endforeach; endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add/Edit Category Sidebar Card -->
        <div class="col-12 col-md-4">
            <div class="card border-0 shadow-sm rounded-4">
                <div class="card-body p-4">
                    <h5 class="fw-bold text-dark mb-3" id="formHeader"><i class="fas fa-plus me-1 text-success"></i> Create Category</h5>
                    
                    <form method="POST" action="?tab=tasks_settings" id="categoryForm">
                        <input type="hidden" name="save_category" value="1">
                        <input type="hidden" name="id" id="categoryId">

                        <div class="mb-3">
                            <label class="form-label fw-semibold small">Category Name <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" name="name" id="categoryName" placeholder="e.g. Fiber Restoration" required>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-semibold small">Status</label>
                            <select class="form-select" name="status" id="categoryStatus">
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>

                        <div class="d-flex justify-content-end gap-2 mt-4">
                            <button type="button" class="btn btn-light rounded-pill px-3" onclick="resetCategoryForm()">Reset</button>
                            <button type="submit" class="btn btn-primary rounded-pill px-4" id="submitBtn">Create</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function editCategory(cat) {
    document.getElementById('categoryId').value = cat.id;
    document.getElementById('categoryName').value = cat.name;
    document.getElementById('categoryStatus').value = cat.status;
    document.getElementById('formHeader').innerHTML = '<i class="fas fa-edit me-1 text-warning"></i> Edit Category';
    document.getElementById('submitBtn').innerText = 'Update';
}

function resetCategoryForm() {
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryForm').reset();
    document.getElementById('formHeader').innerHTML = '<i class="fas fa-plus me-1 text-success"></i> Create Category';
    document.getElementById('submitBtn').innerText = 'Create';
}
</script>
