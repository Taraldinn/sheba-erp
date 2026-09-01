<?php
/**
 * views/tasks/completed.php
 * Historical log of completed tasks under tenant isolation.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;

// Filters
$search = trim($_GET['search'] ?? '');
$cat_filter = !empty($_GET['f_category']) ? intval($_GET['f_category']) : '';

// Build query
$where_clauses = ["t.tenant_id = ?", "t.status = 'Completed'"];
$params = [$tenant_id];

if ($search !== '') {
    $where_clauses[] = "(t.title LIKE ? OR t.completion_note LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
if ($cat_filter !== '') {
    $where_clauses[] = "t.category_id = ?";
    $params[] = $cat_filter;
}

$where_str = implode(" AND ", $where_clauses);

// Pagination
$page = max(1, intval($_GET['page'] ?? 1));
$limit = 20;
$offset = ($page - 1) * $limit;

$total_tasks = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_TASKS . " t WHERE $where_str", $params)['count'] ?? 0;
$total_pages = ceil($total_tasks / $limit);

$tasks_query = "SELECT t.*, c.name as category_name, s.name as completed_by_name 
               FROM " . TBL_TASKS . " t 
               LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id 
               LEFT JOIN " . TBL_STAFF . " s ON t.completed_by = s.id
               WHERE $where_str 
               ORDER BY t.completed_at DESC 
               LIMIT $limit OFFSET $offset";
$tasks = safeFetchAll($pdo, $tasks_query, $params);

// Fetch categories for filter
$categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_CATEGORIES . " WHERE tenant_id = ? AND status = 'Active' ORDER BY name ASC", [$tenant_id]);

// Attachments
$task_attachments = [];
if (!empty($tasks)) {
    $task_ids = array_column($tasks, 'id');
    $placeholders = implode(',', array_fill(0, count($task_ids), '?'));
    $attachments_raw = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_ATTACHMENTS . " WHERE task_id IN ($placeholders) AND tenant_id = ?", array_merge($task_ids, [$tenant_id]));
    foreach ($attachments_raw as $att) {
        $task_attachments[$att['task_id']][] = $att;
    }
}
?>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-check-double text-success me-2"></i> Completed Tasks</h4>
        <span class="badge bg-success rounded-pill px-3 py-2 fs-6 shadow-sm"><?= $total_tasks ?> Tasks Completed</span>
    </div>

    <!-- Filters Panel -->
    <div class="card border-0 shadow-sm rounded-4 mb-4">
        <div class="card-body p-3">
            <form method="GET" action="" class="row g-2 align-items-center">
                <input type="hidden" name="tab" value="tasks_completed">

                <div class="col-12 col-md-4">
                    <input type="text" name="search" class="form-control form-control-sm border-secondary-subtle" placeholder="Search title or completion notes..." value="<?= htmlspecialchars($search) ?>">
                </div>

                <div class="col-12 col-md-3">
                    <select name="f_category" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Categories</option>
                        <?php foreach($categories as $c): ?>
                            <option value="<?= $c['id'] ?>" <?= $cat_filter === $c['id'] ? 'selected' : '' ?>><?= htmlspecialchars($c['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="col-12 col-md-auto ms-auto d-flex gap-2">
                    <button type="submit" class="btn btn-sm btn-primary px-3 rounded-pill">Filter</button>
                    <a href="?tab=tasks_completed" class="btn btn-sm btn-light border px-3 rounded-pill text-dark">Reset</a>
                </div>
            </form>
        </div>
    </div>

    <!-- History List Card -->
    <div class="card border-0 shadow-sm rounded-4">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
                    <thead class="bg-light text-muted">
                        <tr>
                            <th class="ps-4">Completed Task</th>
                            <th>Category</th>
                            <th>Completed By</th>
                            <th>Completed At</th>
                            <th style="max-width: 250px;">Completion Notes</th>
                            <th>Attachments</th>
                            <th class="text-end pe-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($tasks)): ?>
                            <tr><td colspan="7" class="text-center py-5 text-muted"><i class="fas fa-check-double fa-lg me-2"></i> No completed tasks logged in history.</td></tr>
                        <?php else: foreach($tasks as $t): 
                            $attachments = $task_attachments[$t['id']] ?? [];
                        ?>
                            <tr>
                                <td class="ps-4">
                                    <div class="fw-bold"><a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="text-decoration-none text-dark"><?= htmlspecialchars($t['title']) ?></a></div>
                                </td>
                                <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($t['category_name'] ?? 'General') ?></span></td>
                                <td class="fw-semibold text-secondary"><?= htmlspecialchars($t['completed_by_name'] ?? 'System') ?></td>
                                <td class="font-monospace text-muted"><?= date('d M Y, h:i A', strtotime($t['completed_at'])) ?></td>
                                <td>
                                    <div class="small text-secondary text-truncate" style="max-width: 250px;" title="<?= htmlspecialchars($t['completion_note']) ?>">
                                        <?= htmlspecialchars($t['completion_note'] ?: 'N/A') ?>
                                    </div>
                                </td>
                                <td>
                                    <?php if(!empty($attachments)): foreach($attachments as $att): ?>
                                        <a href="/<?= htmlspecialchars($att['file_path']) ?>" target="_blank" class="badge bg-light text-primary border text-decoration-none mb-1 d-inline-block" title="Download: <?= htmlspecialchars($att['file_name']) ?>">
                                            <i class="fas fa-paperclip me-1"></i> <?= htmlspecialchars(mb_strimwidth($att['file_name'], 0, 15, '...')) ?>
                                        </a>
                                    <?php endforeach; else: ?>
                                        <span class="text-muted small">None</span>
                                    <?php endif; ?>
                                </td>
                                <td class="text-end pe-4">
                                    <a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="btn btn-sm btn-light border rounded-pill px-3">View Log</a>
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
                                <a class="page-link" href="?tab=tasks_completed&page=<?= $page - 1 ?>&search=<?= urlencode($search) ?>&f_category=<?= $cat_filter ?>">Previous</a>
                            </li>
                            <?php for ($i = 1; $i <= $total_pages; $i++): ?>
                                <li class="page-item <?= ($page === $i) ? 'active' : '' ?>">
                                    <a class="page-link" href="?tab=tasks_completed&page=<?= $i ?>&search=<?= urlencode($search) ?>&f_category=<?= $cat_filter ?>"><?= $i ?></a>
                                </li>
                            <?php endfor; ?>
                            <li class="page-item <?= ($page >= $total_pages) ? 'disabled' : '' ?>">
                                <a class="page-link" href="?tab=tasks_completed&page=<?= $page + 1 ?>&search=<?= urlencode($search) ?>&f_category=<?= $cat_filter ?>">Next</a>
                            </li>
                        </ul>
                    </nav>
                </div>
            <?php endif; ?>
        </div>
    </div>
</div>
