<?php
/**
 * views/tasks/my.php
 * View only tasks assigned to the currently logged-in staff member.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;
$today_str = date('Y-m-d');
$now_time = date('H:i:s');

// Active sub-tab
$sub_tab = $_GET['sub_tab'] ?? 'today';

// Sub-tab query definition
$where_clauses = ["t.tenant_id = ?", "t.id IN (SELECT task_id FROM " . TBL_TASK_ASSIGNEES . " WHERE user_id = ? AND tenant_id = ?)"];
$params = [$tenant_id, $user_id, $tenant_id];

if ($sub_tab === 'today') {
    $where_clauses[] = "t.due_date = ? AND t.status NOT IN ('Completed', 'Cancelled')";
    $params[] = $today_str;
} elseif ($sub_tab === 'upcoming') {
    $where_clauses[] = "t.due_date > ? AND t.status NOT IN ('Completed', 'Cancelled')";
    $params[] = $today_str;
} elseif ($sub_tab === 'pending') {
    $where_clauses[] = "t.status = 'Pending'";
} elseif ($sub_tab === 'in_progress') {
    $where_clauses[] = "t.status = 'In Progress'";
} elseif ($sub_tab === 'overdue') {
    $where_clauses[] = "t.status NOT IN ('Completed', 'Cancelled') AND (t.due_date < ? OR (t.due_date = ? AND t.due_time < ?))";
    $params[] = $today_str;
    $params[] = $today_str;
    $params[] = $now_time;
} elseif ($sub_tab === 'completed') {
    $where_clauses[] = "t.status = 'Completed'";
}

$where_str = implode(" AND ", $where_clauses);
$tasks = safeFetchAll($pdo, "SELECT t.*, c.name as category_name FROM " . TBL_TASKS . " t LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id WHERE $where_str ORDER BY t.due_date ASC, t.due_time ASC", $params);

// Counts for each tab
$base_cnt_query = "SELECT COUNT(*) as count FROM " . TBL_TASKS . " t WHERE t.tenant_id = ? AND t.id IN (SELECT task_id FROM " . TBL_TASK_ASSIGNEES . " WHERE user_id = ? AND tenant_id = ?)";
$base_cnt_params = [$tenant_id, $user_id, $tenant_id];

$cnt_today = safeFetch($pdo, $base_cnt_query . " AND t.due_date = ? AND t.status NOT IN ('Completed', 'Cancelled')", array_merge($base_cnt_params, [$today_str]))['count'];
$cnt_upcoming = safeFetch($pdo, $base_cnt_query . " AND t.due_date > ? AND t.status NOT IN ('Completed', 'Cancelled')", array_merge($base_cnt_params, [$today_str]))['count'];
$cnt_pending = safeFetch($pdo, $base_cnt_query . " AND t.status = 'Pending'", $base_cnt_params)['count'];
$cnt_in_progress = safeFetch($pdo, $base_cnt_query . " AND t.status = 'In Progress'", $base_cnt_params)['count'];
$cnt_overdue = safeFetch($pdo, $base_cnt_query . " AND t.status NOT IN ('Completed', 'Cancelled') AND (t.due_date < ? OR (t.due_date = ? AND t.due_time < ?))", array_merge($base_cnt_params, [$today_str, $today_str, $now_time]))['count'];
$cnt_completed = safeFetch($pdo, $base_cnt_query . " AND t.status = 'Completed'", $base_cnt_params)['count'];

function getMyPriorityBadge($priority) {
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
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-user-tag me-2 text-success"></i> My Tasks</h4>
        <div>
            <a href="?tab=tasks_create" class="btn btn-primary rounded-pill px-3 shadow-sm"><i class="fas fa-plus me-1"></i> New Task</a>
        </div>
    </div>

    <!-- Navigation Sub Tabs -->
    <ul class="nav nav-pills bg-white shadow-sm rounded-pill p-1 mb-4 flex-wrap gap-1" id="myTaskTabs" style="max-width: fit-content;">
        <li class="nav-item">
            <a class="nav-link <?= $sub_tab === 'today' ? 'active' : '' ?> rounded-pill px-3" href="?tab=tasks_my&sub_tab=today">
                Today <span class="badge bg-danger ms-1"><?= $cnt_today ?></span>
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link <?= $sub_tab === 'upcoming' ? 'active' : '' ?> rounded-pill px-3" href="?tab=tasks_my&sub_tab=upcoming">
                Upcoming <span class="badge bg-primary ms-1"><?= $cnt_upcoming ?></span>
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link <?= $sub_tab === 'pending' ? 'active' : '' ?> rounded-pill px-3" href="?tab=tasks_my&sub_tab=pending">
                Pending <span class="badge bg-secondary ms-1"><?= $cnt_pending ?></span>
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link <?= $sub_tab === 'in_progress' ? 'active' : '' ?> rounded-pill px-3" href="?tab=tasks_my&sub_tab=in_progress">
                In Progress <span class="badge bg-info ms-1"><?= $cnt_in_progress ?></span>
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link <?= $sub_tab === 'overdue' ? 'active' : '' ?> rounded-pill px-3" href="?tab=tasks_my&sub_tab=overdue">
                Overdue <span class="badge bg-danger ms-1"><?= $cnt_overdue ?></span>
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link <?= $sub_tab === 'completed' ? 'active' : '' ?> rounded-pill px-3" href="?tab=tasks_my&sub_tab=completed">
                Completed <span class="badge bg-success ms-1"><?= $cnt_completed ?></span>
            </a>
        </li>
    </ul>

    <!-- Tasks List -->
    <div class="row g-3">
        <?php if (empty($tasks)): ?>
            <div class="col-12">
                <div class="card border-0 shadow-sm rounded-4 p-5 text-center bg-white text-muted">
                    <i class="fas fa-tasks fa-3x mb-3 text-secondary-subtle"></i>
                    <h5>No tasks found in this category</h5>
                    <p class="small text-secondary">Keep up the good work!</p>
                </div>
            </div>
        <?php else: foreach ($tasks as $t): 
            $overdue = ($t['status'] !== 'Completed' && $t['status'] !== 'Cancelled' && ($t['due_date'] < $today_str || ($t['due_date'] === $today_str && $t['due_time'] !== null && $t['due_time'] < $now_time)));
        ?>
            <div class="col-12 col-md-6 col-lg-4">
                <div class="card border-0 shadow-sm rounded-4 h-100 bg-white">
                    <div class="card-body p-4 d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <span class="badge bg-light text-dark border"><?= htmlspecialchars($t['category_name'] ?? 'General') ?></span>
                            <span class="badge <?= getMyPriorityBadge($t['priority']) ?>"><?= $t['priority'] ?></span>
                        </div>
                        
                        <h5 class="fw-bold mb-2">
                            <a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="text-decoration-none text-dark"><?= htmlspecialchars($t['title']) ?></a>
                        </h5>
                        <p class="text-secondary small mb-4 flex-grow-1" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                            <?= htmlspecialchars($t['description']) ?>
                        </p>
                        
                        <div class="border-top pt-3 mt-auto d-flex justify-content-between align-items-center text-muted small">
                            <div>
                                <i class="far fa-calendar-alt me-1"></i>
                                <?= $t['due_date'] ? date('d M, Y', strtotime($t['due_date'])) : 'Anytime' ?>
                                <?php if ($t['due_time']): ?>
                                    at <?= date('h:i A', strtotime($t['due_time'])) ?>
                                <?php endif; ?>
                            </div>
                            <div>
                                <?php if ($overdue): ?>
                                    <span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle"></i> Overdue</span>
                                <?php else: ?>
                                    <span class="fw-bold"><?= $t['status'] ?></span>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer bg-light border-0 py-3 rounded-bottom-4 d-flex justify-content-end gap-2">
                        <?php if ($t['status'] === 'Pending'): ?>
                            <a href="?tab=tasks_my&sub_tab=<?= $sub_tab ?>&action=start_task&id=<?= $t['id'] ?>" class="btn btn-sm btn-outline-info rounded-pill px-3">Start</a>
                        <?php endif; ?>
                        <?php if ($t['status'] !== 'Completed' && $t['status'] !== 'Cancelled'): ?>
                            <button class="btn btn-sm btn-success rounded-pill px-3" onclick="openCompleteModal(<?= $t['id'] ?>, '<?= htmlspecialchars(addslashes($t['title'])) ?>')"><i class="fas fa-check"></i> Complete</button>
                        <?php endif; ?>
                        <a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="btn btn-sm btn-light border rounded-pill px-3">Details</a>
                    </div>
                </div>
            </div>
        <?php endforeach; endif; ?>
    </div>
</div>

<!-- Task Complete Modal -->
<div class="modal fade" id="quickCompleteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <form method="POST" action="?tab=tasks_my&sub_tab=<?= $sub_tab ?>" class="modal-content" enctype="multipart/form-data">
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
