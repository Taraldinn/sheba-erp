<?php
/**
 * views/tasks/all.php
 * View all tasks with advanced search, filtering, and pagination under tenant isolation.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;
$today_str = date('Y-m-d');
$now_time = date('H:i:s');

// Filter values
$search = trim($_GET['search'] ?? '');
$cat_filter = !empty($_GET['f_category']) ? intval($_GET['f_category']) : '';
$priority_filter = $_GET['f_priority'] ?? '';
$status_filter = $_GET['f_status'] ?? '';
$staff_filter = !empty($_GET['f_staff']) ? intval($_GET['f_staff']) : '';
$type_filter = $_GET['f_type'] ?? '';
$date_start = $_GET['f_date_start'] ?? '';
$date_end = $_GET['f_date_end'] ?? '';

// Build query clauses
$where_clauses = ["t.tenant_id = ?"];
$params = [$tenant_id];

if ($search !== '') {
    $where_clauses[] = "(t.title LIKE ? OR t.description LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
if ($cat_filter !== '') {
    $where_clauses[] = "t.category_id = ?";
    $params[] = $cat_filter;
}
if ($priority_filter !== '') {
    $where_clauses[] = "t.priority = ?";
    $params[] = $priority_filter;
}
if ($status_filter !== '') {
    if ($status_filter === 'Overdue') {
        $where_clauses[] = "t.status NOT IN ('Completed', 'Cancelled') AND (t.due_date < ? OR (t.due_date = ? AND t.due_time < ?))";
        $params[] = $today_str;
        $params[] = $today_str;
        $params[] = $now_time;
    } else {
        $where_clauses[] = "t.status = ?";
        $params[] = $status_filter;
    }
}
if ($staff_filter !== '') {
    // Sub-query to filter by assignee
    $where_clauses[] = "t.id IN (SELECT task_id FROM " . TBL_TASK_ASSIGNEES . " WHERE user_id = ? AND tenant_id = ?)";
    $params[] = $staff_filter;
    $params[] = $tenant_id;
}
if ($type_filter !== '') {
    if ($type_filter === 'Recurring') {
        $where_clauses[] = "t.recurring_rule_id > 0";
    } else {
        $where_clauses[] = "t.recurring_rule_id = 0";
    }
}
if (!empty($date_start)) {
    $where_clauses[] = "t.due_date >= ?";
    $params[] = $date_start;
}
if (!empty($date_end)) {
    $where_clauses[] = "t.due_date <= ?";
    $params[] = $date_end;
}

$where_str = implode(" AND ", $where_clauses);

// Pagination
$page = max(1, intval($_GET['page'] ?? 1));
$limit = 15;
$offset = ($page - 1) * $limit;

$total_tasks = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_TASKS . " t WHERE $where_str", $params)['count'] ?? 0;
$total_pages = ceil($total_tasks / $limit);

// Execute query
$tasks_query = "SELECT t.*, c.name as category_name 
               FROM " . TBL_TASKS . " t 
               LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id 
               WHERE $where_str 
               ORDER BY t.due_date ASC, t.due_time ASC 
               LIMIT $limit OFFSET $offset";
$tasks = safeFetchAll($pdo, $tasks_query, $params);

// Fetch categories and staff for filters
$categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_CATEGORIES . " WHERE tenant_id = ? AND status = 'Active' ORDER BY name ASC", [$tenant_id]);
$staff_list = safeFetchAll($pdo, "SELECT id, name, username, role FROM " . TBL_STAFF . " WHERE status = 'Active' ORDER BY name ASC");

// Fetch assignees mapping for loaded tasks
$task_assignees = [];
if (!empty($tasks)) {
    $task_ids = array_column($tasks, 'id');
    $placeholders = implode(',', array_fill(0, count($task_ids), '?'));
    $assignees_raw = safeFetchAll($pdo, "SELECT a.task_id, s.name FROM " . TBL_TASK_ASSIGNEES . " a JOIN " . TBL_STAFF . " s ON a.user_id = s.id WHERE a.task_id IN ($placeholders) AND a.tenant_id = ?", array_merge($task_ids, [$tenant_id]));
    foreach ($assignees_raw as $ar) {
        $task_assignees[$ar['task_id']][] = $ar['name'];
    }
}

function getPriorityBadge($priority) {
    switch ($priority) {
        case 'Low': return 'bg-light text-dark border';
        case 'Medium': return 'bg-info text-white';
        case 'High': return 'bg-warning text-dark';
        case 'Urgent': return 'bg-danger text-white';
        default: return 'bg-secondary text-white';
    }
}
?>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-list-ul me-2 text-primary"></i> All Tasks</h4>
        <div>
            <a href="?tab=tasks_create" class="btn btn-primary rounded-pill px-3 shadow-sm"><i class="fas fa-plus me-1"></i> New Task</a>
        </div>
    </div>

    <!-- Filters Card -->
    <div class="card border-0 shadow-sm rounded-4 mb-4">
        <div class="card-body p-3">
            <form method="GET" action="" class="row g-2 align-items-center">
                <input type="hidden" name="tab" value="tasks_all">
                
                <div class="col-12 col-md-3">
                    <input type="text" name="search" class="form-control form-control-sm border-secondary-subtle" placeholder="Search title or details..." value="<?= htmlspecialchars($search) ?>">
                </div>

                <div class="col-6 col-md-2 col-lg-1.5">
                    <select name="f_category" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Categories</option>
                        <?php foreach($categories as $c): ?>
                            <option value="<?= $c['id'] ?>" <?= $cat_filter === $c['id'] ? 'selected' : '' ?>><?= htmlspecialchars($c['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="col-6 col-md-1.5">
                    <select name="f_priority" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Priorities</option>
                        <option value="Low" <?= $priority_filter === 'Low' ? 'selected' : '' ?>>Low</option>
                        <option value="Medium" <?= $priority_filter === 'Medium' ? 'selected' : '' ?>>Medium</option>
                        <option value="High" <?= $priority_filter === 'High' ? 'selected' : '' ?>>High</option>
                        <option value="Urgent" <?= $priority_filter === 'Urgent' ? 'selected' : '' ?>>Urgent</option>
                    </select>
                </div>

                <div class="col-6 col-md-2">
                    <select name="f_status" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Statuses</option>
                        <option value="Pending" <?= $status_filter === 'Pending' ? 'selected' : '' ?>>Pending</option>
                        <option value="In Progress" <?= $status_filter === 'In Progress' ? 'selected' : '' ?>>In Progress</option>
                        <option value="Completed" <?= $status_filter === 'Completed' ? 'selected' : '' ?>>Completed</option>
                        <option value="Cancelled" <?= $status_filter === 'Cancelled' ? 'selected' : '' ?>>Cancelled</option>
                        <option value="Overdue" <?= $status_filter === 'Overdue' ? 'selected' : '' ?>>Overdue Only</option>
                    </select>
                </div>

                <div class="col-6 col-md-2">
                    <select name="f_staff" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Assignees</option>
                        <?php foreach($staff_list as $st): ?>
                            <option value="<?= $st['id'] ?>" <?= $staff_filter === $st['id'] ? 'selected' : '' ?>><?= htmlspecialchars($st['name']) ?> (<?= htmlspecialchars($st['role']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="col-6 col-md-1.5">
                    <select name="f_type" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Types</option>
                        <option value="One-Time" <?= $type_filter === 'One-Time' ? 'selected' : '' ?>>One-Time Only</option>
                        <option value="Recurring" <?= $type_filter === 'Recurring' ? 'selected' : '' ?>>Recurring Only</option>
                    </select>
                </div>

                <div class="col-12 col-md-3 d-flex align-items-center gap-2">
                    <input type="date" name="f_date_start" class="form-control form-control-sm border-secondary-subtle" value="<?= htmlspecialchars($date_start) ?>" placeholder="Start Due">
                    <span class="text-muted small">to</span>
                    <input type="date" name="f_date_end" class="form-control form-control-sm border-secondary-subtle" value="<?= htmlspecialchars($date_end) ?>" placeholder="End Due">
                </div>

                <div class="col-12 col-md-auto ms-auto d-flex gap-2">
                    <button type="submit" class="btn btn-sm btn-primary px-3 rounded-pill">Filter</button>
                    <a href="?tab=tasks_all" class="btn btn-sm btn-light border px-3 rounded-pill text-dark">Reset</a>
                </div>
            </form>
        </div>
    </div>

    <!-- Tasks List Card -->
    <div class="card border-0 shadow-sm rounded-4">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
                    <thead class="bg-light text-muted">
                        <tr>
                            <th class="ps-4">Task Name</th>
                            <th>Category</th>
                            <th>Assignees</th>
                            <th>Due Date</th>
                            <th>Due Time</th>
                            <th>Priority</th>
                            <th>Status</th>
                            <th class="text-end pe-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($tasks)): ?>
                            <tr><td colspan="8" class="text-center py-5 text-muted"><i class="fas fa-tasks fa-lg me-2"></i> No tasks found matching your filters.</td></tr>
                        <?php else: foreach($tasks as $t): 
                            $assignees = $task_assignees[$t['id']] ?? ['Unassigned'];
                            $overdue = ($t['status'] !== 'Completed' && $t['status'] !== 'Cancelled' && ($t['due_date'] < $today_str || ($t['due_date'] === $today_str && $t['due_time'] !== null && $t['due_time'] < $now_time)));
                        ?>
                            <tr>
                                <td class="ps-4">
                                    <div class="fw-bold"><a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="text-decoration-none text-dark"><?= htmlspecialchars($t['title']) ?></a></div>
                                    <?php if ($t['recurring_rule_id'] > 0): ?>
                                        <span class="badge bg-light text-primary border" style="font-size: 0.65rem;"><i class="fas fa-redo me-1"></i> Recurring</span>
                                    <?php endif; ?>
                                </td>
                                <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($t['category_name'] ?? 'General') ?></span></td>
                                <td class="small text-secondary"><?= htmlspecialchars(implode(', ', $assignees)) ?></td>
                                <td class="font-monospace"><?= $t['due_date'] ? date('d M, Y', strtotime($t['due_date'])) : 'N/A' ?></td>
                                <td class="font-monospace text-muted"><?= $t['due_time'] ? date('h:i A', strtotime($t['due_time'])) : 'Anytime' ?></td>
                                <td><span class="badge <?= getPriorityBadge($t['priority']) ?>"><?= $t['priority'] ?></span></td>
                                <td>
                                    <?php if ($t['status'] === 'Completed'): ?>
                                        <span class="badge bg-success">Completed</span>
                                    <?php elseif ($t['status'] === 'Cancelled'): ?>
                                        <span class="badge bg-secondary">Cancelled</span>
                                    <?php elseif ($overdue): ?>
                                        <span class="badge bg-danger">Overdue</span>
                                    <?php else: ?>
                                        <span class="badge bg-warning text-dark"><?= $t['status'] ?></span>
                                    <?php endif; ?>
                                </td>
                                <td class="text-end pe-4">
                                    <div class="dropdown d-inline-block">
                                        <button class="btn btn-light btn-sm dropdown-toggle rounded-pill" type="button" data-bs-toggle="dropdown"><i class="fas fa-cog"></i></button>
                                        <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                                            <li><a class="dropdown-item" href="?tab=tasks_details&id=<?= $t['id'] ?>"><i class="fas fa-eye me-2 text-primary"></i> View Details</a></li>
                                            <?php if ($t['status'] !== 'Completed' && $t['status'] !== 'Cancelled'): ?>
                                                <?php if ($t['status'] === 'Pending'): ?>
                                                    <li><a class="dropdown-item" href="?tab=tasks_all&action=start_task&id=<?= $t['id'] ?>"><i class="fas fa-play me-2 text-info"></i> Start Task</a></li>
                                                <?php endif; ?>
                                                <li><a class="dropdown-item" href="#" onclick="openCompleteModal(<?= $t['id'] ?>, '<?= htmlspecialchars(addslashes($t['title'])) ?>')"><i class="fas fa-check me-2 text-success"></i> Mark Complete</a></li>
                                            <?php endif; ?>
                                            <li><hr class="dropdown-divider"></li>
                                            <li><a class="dropdown-item" href="?tab=tasks_create&edit_id=<?= $t['id'] ?>"><i class="fas fa-edit me-2 text-warning"></i> Edit Task</a></li>
                                            <li><a class="dropdown-item" href="?tab=tasks_all&action=duplicate_task&id=<?= $t['id'] ?>"><i class="fas fa-clone me-2 text-secondary"></i> Duplicate Task</a></li>
                                            <?php if (hasRole('Admin') || hasRole('Reseller') || hasPermission('task.delete')): ?>
                                                <li><hr class="dropdown-divider"></li>
                                                <li><a class="dropdown-item text-danger fw-bold" href="?tab=tasks_all&action=delete_task&id=<?= $t['id'] ?>" onclick="return confirm('Are you sure you want to permanently delete this task?')"><i class="fas fa-trash-alt me-2"></i> Delete Task</a></li>
                                            <?php endif; ?>
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; endif; ?>
                    </tbody>
                </table>
            </div>
            
            <!-- Pagination Controls -->
            <?php if ($total_pages > 1): ?>
                <div class="card-footer bg-white border-0 py-3">
                    <nav>
                        <ul class="pagination pagination-sm justify-content-center mb-0">
                            <li class="page-item <?= ($page <= 1) ? 'disabled' : '' ?>">
                                <a class="page-link" href="?tab=tasks_all&page=<?= $page - 1 ?>&search=<?= urlencode($search) ?>&f_category=<?= $cat_filter ?>&f_priority=<?= urlencode($priority_filter) ?>&f_status=<?= urlencode($status_filter) ?>&f_staff=<?= $staff_filter ?>&f_type=<?= urlencode($type_filter) ?>&f_date_start=<?= urlencode($date_start) ?>&f_date_end=<?= urlencode($date_end) ?>">Previous</a>
                            </li>
                            <?php for ($i = 1; $i <= $total_pages; $i++): ?>
                                <li class="page-item <?= ($page === $i) ? 'active' : '' ?>">
                                    <a class="page-link" href="?tab=tasks_all&page=<?= $i ?>&search=<?= urlencode($search) ?>&f_category=<?= $cat_filter ?>&f_priority=<?= urlencode($priority_filter) ?>&f_status=<?= urlencode($status_filter) ?>&f_staff=<?= $staff_filter ?>&f_type=<?= urlencode($type_filter) ?>&f_date_start=<?= urlencode($date_start) ?>&f_date_end=<?= urlencode($date_end) ?>"><?= $i ?></a>
                                </li>
                            <?php endfor; ?>
                            <li class="page-item <?= ($page >= $total_pages) ? 'disabled' : '' ?>">
                                <a class="page-link" href="?tab=tasks_all&page=<?= $page + 1 ?>&search=<?= urlencode($search) ?>&f_category=<?= $cat_filter ?>&f_priority=<?= urlencode($priority_filter) ?>&f_status=<?= urlencode($status_filter) ?>&f_staff=<?= $staff_filter ?>&f_type=<?= urlencode($type_filter) ?>&f_date_start=<?= urlencode($date_start) ?>&f_date_end=<?= urlencode($date_end) ?>">Next</a>
                            </li>
                        </ul>
                    </nav>
                </div>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- Task Complete Modal -->
<div class="modal fade" id="quickCompleteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <form method="POST" action="?tab=tasks_all" class="modal-content" enctype="multipart/form-data">
            <input type="hidden" name="action" value="complete_task">
            <input type="hidden" name="complete_task" value="1">
            <input type="hidden" name="id" id="completeTaskId">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title"><i class="fas fa-check-circle me-2"></i> Complete Task</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <p>Task: <strong id="completeTaskTitle"></strong></p>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">Completion Note</label>
                    <textarea class="form-control" name="completion_note" rows="3" placeholder="Explain what was done..." required></textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">Optional Proof / Attachment</label>
                    <input type="file" class="form-control" name="attachment">
                    <div class="form-text small">Accepted formats: JPG, PNG, PDF, Doc, Zip, TXT</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-success"><i class="fas fa-check me-1"></i> Submit Completion</button>
            </div>
        </form>
    </div>
</div>

<script>
function openCompleteModal(id, title) {
    document.getElementById('completeTaskId').value = id;
    document.getElementById('completeTaskTitle').innerText = title;
    var myModal = new bootstrap.Modal(document.getElementById('quickCompleteModal'));
    myModal.show();
}
</script>
