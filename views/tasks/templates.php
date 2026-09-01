<?php
/**
 * views/tasks/templates.php
 * Task Templates module view under tenant isolation.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;

if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_templates')) {
    echo "<div class='container mt-4'><div class='alert alert-danger'>Access Denied. You do not have permission to manage templates.</div></div>";
    return;
}

// Fetch templates
$templates = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_TEMPLATES . " WHERE tenant_id = ? ORDER BY id DESC", [$tenant_id]);

// Fetch items for details/modal
$templates_with_items = [];
foreach ($templates as $t) {
    $items = safeFetchAll($pdo, "SELECT ti.*, c.name as category_name FROM " . TBL_TASK_TEMPLATE_ITEMS . " ti LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON ti.category_id = c.id WHERE ti.template_id = ? AND ti.tenant_id = ?", [$t['id'], $tenant_id]);
    $templates_with_items[$t['id']] = $items;
}

// Fetch categories and staff
$categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_CATEGORIES . " WHERE tenant_id = ? AND status = 'Active' ORDER BY name ASC", [$tenant_id]);
$staff_list = safeFetchAll($pdo, "SELECT id, name, username, role FROM " . TBL_STAFF . " WHERE status = 'Active' ORDER BY name ASC");

?>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-cubes text-warning me-2"></i> Task Templates</h4>
        <button type="button" class="btn btn-primary rounded-pill px-3 shadow-sm" onclick="openCreateTemplateModal()"><i class="fas fa-plus me-1"></i> New Template</button>
    </div>

    <!-- Templates Grid -->
    <div class="row g-3">
        <?php if (empty($templates)): ?>
            <div class="col-12">
                <div class="card border-0 shadow-sm rounded-4 p-5 text-center bg-white text-muted">
                    <i class="fas fa-cubes fa-3x mb-3 text-secondary-subtle"></i>
                    <h5>No task templates created yet</h5>
                    <p class="small text-secondary">Templates let you quickly schedule standard multi-step ISP routines (e.g. Monthly Backups, Audits).</p>
                    <button class="btn btn-sm btn-primary rounded-pill px-3 mt-2" onclick="openCreateTemplateModal()">Create Your First Template</button>
                </div>
            </div>
        <?php else: foreach ($templates as $t): 
            $items = $templates_with_items[$t['id']];
        ?>
            <div class="col-12 col-md-6 col-lg-4">
                <div class="card border-0 shadow-sm rounded-4 h-100 bg-white">
                    <div class="card-body p-4 d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <h5 class="fw-bold mb-1 text-dark"><?= htmlspecialchars($t['name']) ?></h5>
                            <span class="badge bg-light text-primary border rounded-pill"><?= count($items) ?> Tasks</span>
                        </div>
                        <p class="text-secondary small mb-4 flex-grow-1">
                            <?= htmlspecialchars($t['description'] ?: 'No description provided.') ?>
                        </p>

                        <div class="bg-light rounded p-3 mb-3" style="max-height: 150px; overflow-y: auto;">
                            <span class="fw-bold text-muted small d-block mb-2">ROUTINE TASKS:</span>
                            <ol class="ps-3 mb-0 small text-dark">
                                <?php foreach ($items as $item): ?>
                                    <li class="mb-1">
                                        <?= htmlspecialchars($item['title']) ?> 
                                        <span class="text-muted text-xs font-monospace">(Day <?= $item['relative_day'] ?>)</span>
                                    </li>
                                <?php endforeach; ?>
                            </ol>
                        </div>
                    </div>
                    <div class="card-footer bg-light border-0 py-3 rounded-bottom-4 d-flex justify-content-between align-items-center">
                        <button class="btn btn-sm btn-success rounded-pill px-3" onclick="openApplyModal(<?= $t['id'] ?>, '<?= htmlspecialchars(addslashes($t['name'])) ?>')"><i class="fas fa-play me-1"></i> Apply Routine</button>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-light border dropdown-toggle rounded-pill" type="button" data-bs-toggle="dropdown"><i class="fas fa-ellipsis-v"></i></button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                                <li><a class="dropdown-item" href="#" onclick='openEditTemplateModal(<?= json_encode($t, JSON_HEX_APOS | JSON_HEX_QUOT) ?>, <?= json_encode($items, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'><i class="fas fa-edit me-2 text-warning"></i> Edit Template</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item text-danger fw-bold" href="?tab=tasks_templates&action=delete_template&id=<?= $t['id'] ?>" onclick="return confirm('Are you sure you want to delete this template?')"><i class="fas fa-trash-alt me-2"></i> Delete</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        <?php endforeach; endif; ?>
    </div>
</div>

<!-- Add/Edit Template Modal -->
<div class="modal fade modal-lg" id="templateModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <form method="POST" action="?tab=tasks_templates" class="modal-content">
            <input type="hidden" name="save_template" value="1">
            <input type="hidden" name="id" id="templateId">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title" id="templateModalTitle">Create Task Template</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label class="form-label fw-semibold small">Template Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" name="name" id="templateName" placeholder="e.g. Monthly ISP Routine" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">Description</label>
                    <textarea class="form-control" name="description" id="templateDesc" rows="2" placeholder="Describe when to apply this template..."></textarea>
                </div>
                
                <div class="border-top pt-3">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="fw-bold text-dark"><i class="fas fa-list-ol me-1 text-primary"></i> Template Tasks</span>
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="addTemplateTaskRow()"><i class="fas fa-plus"></i> Add Task Row</button>
                    </div>

                    <!-- Tasks Rows Container -->
                    <div id="templateTasksContainer"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save me-1"></i> Save Template</button>
            </div>
        </form>
    </div>
</div>

<!-- Apply Template Modal -->
<div class="modal fade" id="applyTemplateModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <form method="POST" action="?tab=tasks_templates" class="modal-content">
            <input type="hidden" name="apply_template" value="1">
            <input type="hidden" name="template_id" id="applyTemplateId">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title"><i class="fas fa-play-circle me-2"></i> Apply Template Routine</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <p>Routine: <strong id="applyTemplateName"></strong></p>
                <div class="alert alert-info py-2 small">
                    Applying this template will automatically generate multiple tasks relative to the selected start date.
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">Start Date <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" name="start_date" value="<?= date('Y-m-d') ?>" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">Assign Generated Tasks to <span class="text-muted">(Optional)</span></label>
                    <select class="form-select" name="assignee_id">
                        <option value="">-- Let Tasks Unassigned --</option>
                        <?php foreach($staff_list as $st): ?>
                            <option value="<?= $st['id'] ?>"><?= htmlspecialchars($st['name']) ?> (<?= htmlspecialchars($st['role']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-success"><i class="fas fa-check me-1"></i> Generate Tasks</button>
            </div>
        </form>
    </div>
</div>

<!-- Template Task Item Row HTML Template -->
<div id="rowTemplateHTML" class="d-none">
    <div class="row g-2 align-items-center mb-2 p-2 border rounded bg-white template-task-row">
        <div class="col-12 col-sm-4">
            <input type="text" class="form-control form-control-sm" name="item_titles[]" placeholder="Task Title *" required>
        </div>
        <div class="col-6 col-sm-2">
            <select class="form-select form-select-sm" name="item_categories[]">
                <option value="">Category</option>
                <?php foreach($categories as $c): ?>
                    <option value="<?= $c['id'] ?>"><?= htmlspecialchars($c['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="col-6 col-sm-2">
            <select class="form-select form-select-sm" name="item_priorities[]">
                <option value="Low">Low</option>
                <option value="Medium" selected>Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
            </select>
        </div>
        <div class="col-6 col-sm-1.5">
            <input type="number" class="form-control form-control-sm" name="item_relative_days[]" value="0" min="0" placeholder="Relative Day" title="Days offset from Start Date">
        </div>
        <div class="col-6 col-sm-2">
            <input type="time" class="form-control form-control-sm" name="item_due_times[]" value="09:00" title="Due Time">
        </div>
        <div class="col-12 col-sm-0.5 text-end">
            <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="removeTemplateTaskRow(this)"><i class="fas fa-trash-alt"></i></button>
        </div>
    </div>
</div>

<script>
let templateModalInstance = null;

function addTemplateTaskRow(title = '', catId = '', priority = 'Medium', relDay = '0', dueTime = '09:00') {
    const container = document.getElementById('templateTasksContainer');
    const templateHTML = document.getElementById('rowTemplateHTML').innerHTML;
    
    // Create new div
    const newDiv = document.createElement('div');
    newDiv.innerHTML = templateHTML;
    
    // Set values if provided (used for editing/pre-filling)
    if (title) newDiv.querySelector('input[name="item_titles[]"]').value = title;
    if (catId) newDiv.querySelector('select[name="item_categories[]"]').value = catId;
    if (priority) newDiv.querySelector('select[name="item_priorities[]"]').value = priority;
    if (relDay) newDiv.querySelector('input[name="item_relative_days[]"]').value = relDay;
    if (dueTime) newDiv.querySelector('input[name="item_due_times[]"]').value = dueTime;
    
    container.appendChild(newDiv.firstElementChild);
}

function removeTemplateTaskRow(btn) {
    const row = btn.closest('.template-task-row');
    row.parentNode.removeChild(row);
}

function openCreateTemplateModal() {
    document.getElementById('templateId').value = '';
    document.getElementById('templateName').value = '';
    document.getElementById('templateDesc').value = '';
    document.getElementById('templateTasksContainer').innerHTML = '';
    document.getElementById('templateModalTitle').innerText = 'Create Task Template';
    
    // Add default row
    addTemplateTaskRow();
    
    templateModalInstance = new bootstrap.Modal(document.getElementById('templateModal'));
    templateModalInstance.show();
}

function openEditTemplateModal(template, items) {
    document.getElementById('templateId').value = template.id;
    document.getElementById('templateName').value = template.name;
    document.getElementById('templateDesc').value = template.description;
    document.getElementById('templateTasksContainer').innerHTML = '';
    document.getElementById('templateModalTitle').innerText = 'Edit Task Template';
    
    // Add existing items
    if (items.length > 0) {
        items.forEach(item => {
            addTemplateTaskRow(item.title, item.category_id, item.priority, item.relative_day, item.due_time);
        });
    } else {
        addTemplateTaskRow();
    }
    
    templateModalInstance = new bootstrap.Modal(document.getElementById('templateModal'));
    templateModalInstance.show();
}

function openApplyModal(id, name) {
    document.getElementById('applyTemplateId').value = id;
    document.getElementById('applyTemplateName').innerText = name;
    var myModal = new bootstrap.Modal(document.getElementById('applyTemplateModal'));
    myModal.show();
}
</script>
