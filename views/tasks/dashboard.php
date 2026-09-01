<?php
/**
 * views/tasks/dashboard.php
 * Task Management Dashboard view
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;
$today_str = date('Y-m-d');
$now_time = date('H:i:s');

// 1. Get stats
$stats = [];

// Today's
$stats['today'] = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASKS . " WHERE tenant_id = ? AND due_date = ?", [$tenant_id, $today_str])['cnt'];

// Pending
$stats['pending'] = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASKS . " WHERE tenant_id = ? AND status = 'Pending'", [$tenant_id])['cnt'];

// In Progress
$stats['in_progress'] = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASKS . " WHERE tenant_id = ? AND status = 'In Progress'", [$tenant_id])['cnt'];

// Overdue
$stats['overdue'] = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASKS . " WHERE tenant_id = ? AND status NOT IN ('Completed', 'Cancelled') AND (due_date < ? OR (due_date = ? AND due_time < ?))", [$tenant_id, $today_str, $today_str, $now_time])['cnt'];

// Completed Today
$stats['completed_today'] = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASKS . " WHERE tenant_id = ? AND status = 'Completed' AND DATE(completed_at) = ?", [$tenant_id, $today_str])['cnt'];

// Upcoming (Next 7 Days)
$stats['upcoming'] = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASKS . " WHERE tenant_id = ? AND due_date > ? AND due_date <= DATE_ADD(?, INTERVAL 7 DAY)", [$tenant_id, $today_str, $today_str])['cnt'];

// Recurring rules
$stats['recurring'] = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASK_RECURRING_RULES . " WHERE tenant_id = ? AND is_active = 1", [$tenant_id])['cnt'];

// Monthly progress: Completed vs Total this month
$start_of_month = date('Y-m-01');
$end_of_month = date('Y-m-t');
$completed_this_month = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASKS . " WHERE tenant_id = ? AND status = 'Completed' AND (due_date BETWEEN ? AND ?)", [$tenant_id, $start_of_month, $end_of_month])['cnt'];
$total_this_month = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_TASKS . " WHERE tenant_id = ? AND (due_date BETWEEN ? AND ?)", [$tenant_id, $start_of_month, $end_of_month])['cnt'];

$progress_percent = $total_this_month > 0 ? round(($completed_this_month / $total_this_month) * 100) : 0;

// Fetch lists
// Today's Task List
$today_tasks = safeFetchAll($pdo, "SELECT t.*, c.name as category_name FROM " . TBL_TASKS . " t LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id WHERE t.tenant_id = ? AND t.due_date = ? ORDER BY t.due_time ASC", [$tenant_id, $today_str]);

// Upcoming Tasks (Next 7 Days)
$upcoming_tasks = safeFetchAll($pdo, "SELECT t.*, c.name as category_name FROM " . TBL_TASKS . " t LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id WHERE t.tenant_id = ? AND t.due_date > ? AND t.due_date <= DATE_ADD(?, INTERVAL 7 DAY) ORDER BY t.due_date ASC, t.due_time ASC LIMIT 5", [$tenant_id, $today_str, $today_str]);

// Overdue Tasks
$overdue_tasks = safeFetchAll($pdo, "SELECT t.*, c.name as category_name FROM " . TBL_TASKS . " t LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id WHERE t.tenant_id = ? AND t.status NOT IN ('Completed', 'Cancelled') AND (t.due_date < ? OR (t.due_date = ? AND t.due_time < ?)) ORDER BY t.due_date ASC", [$tenant_id, $today_str, $today_str, $now_time]);

// Load Assignees mapping
$assignees_raw = safeFetchAll($pdo, "SELECT a.task_id, s.name FROM " . TBL_TASK_ASSIGNEES . " a JOIN " . TBL_STAFF . " s ON a.user_id = s.id WHERE a.tenant_id = ?", [$tenant_id]);
$task_assignees = [];
foreach ($assignees_raw as $ar) {
    $task_assignees[$ar['task_id']][] = $ar['name'];
}

function getPriorityBadgeClass($priority) {
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
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-chart-pie me-2 text-primary"></i> Task Dashboard</h4>
        <div>
            <a href="?tab=tasks_create" class="btn btn-primary rounded-pill px-3 shadow-sm"><i class="fas fa-plus me-1"></i> New Task</a>
        </div>
    </div>

    <!-- Summary Cards -->
    <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
            <div class="card border-0 shadow-sm rounded-4 h-100 p-3 bg-white">
                <div class="d-flex align-items-center">
                    <div class="rounded-circle bg-primary-subtle p-3 text-primary me-3 d-none d-sm-block">
                        <i class="fas fa-calendar-day fa-lg"></i>
                    </div>
                    <div>
                        <span class="text-muted small d-block">Today's Tasks</span>
                        <h3 class="fw-bold mb-0 text-dark"><?= $stats['today'] ?></h3>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="card border-0 shadow-sm rounded-4 h-100 p-3 bg-white">
                <div class="d-flex align-items-center">
                    <div class="rounded-circle bg-warning-subtle p-3 text-warning me-3 d-none d-sm-block">
                        <i class="fas fa-hourglass-half fa-lg"></i>
                    </div>
                    <div>
                        <span class="text-muted small d-block">Pending & Progress</span>
                        <h3 class="fw-bold mb-0 text-dark"><?= $stats['pending'] + $stats['in_progress'] ?></h3>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="card border-0 shadow-sm rounded-4 h-100 p-3 bg-white">
                <div class="d-flex align-items-center">
                    <div class="rounded-circle bg-danger-subtle p-3 text-danger me-3 d-none d-sm-block">
                        <i class="fas fa-exclamation-circle fa-lg"></i>
                    </div>
                    <div>
                        <span class="text-muted small d-block">Overdue</span>
                        <h3 class="fw-bold mb-0 text-danger"><?= $stats['overdue'] ?></h3>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="card border-0 shadow-sm rounded-4 h-100 p-3 bg-white">
                <div class="d-flex align-items-center">
                    <div class="rounded-circle bg-success-subtle p-3 text-success me-3 d-none d-sm-block">
                        <i class="fas fa-check-double fa-lg"></i>
                    </div>
                    <div>
                        <span class="text-muted small d-block">Completed Today</span>
                        <h3 class="fw-bold mb-0 text-success"><?= $stats['completed_today'] ?></h3>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="row g-4">
        <!-- Main Column -->
        <div class="col-12 col-xl-8">
            <!-- Today's Tasks -->
            <div class="card border-0 shadow-sm rounded-4 mb-4">
                <div class="card-header bg-white border-bottom-0 py-3 d-flex justify-content-between align-items-center">
                    <h5 class="mb-0 fw-bold"><i class="fas fa-list-ul me-2 text-primary"></i> Today's Tasks</h5>
                    <span class="badge bg-light text-dark border rounded-pill px-3"><?= count($today_tasks) ?> Tasks</span>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="bg-light text-muted">
                                <tr>
                                    <th class="ps-4">Task Title</th>
                                    <th>Category</th>
                                    <th>Assigned Staff</th>
                                    <th>Due</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th class="text-end pe-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if(empty($today_tasks)): ?>
                                    <tr><td colspan="7" class="text-center py-5 text-muted"><i class="fas fa-tasks me-2"></i> No tasks scheduled for today</td></tr>
                                <?php else: foreach($today_tasks as $t): 
                                    $assignees_list = $task_assignees[$t['id']] ?? ['Unassigned'];
                                    $overdue = ($t['status'] !== 'Completed' && $t['status'] !== 'Cancelled' && ($t['due_date'] < $today_str || ($t['due_date'] === $today_str && $t['due_time'] !== null && $t['due_time'] < $now_time)));
                                ?>
                                    <tr>
                                        <td class="ps-4">
                                            <a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="fw-semibold text-decoration-none text-dark"><?= htmlspecialchars($t['title']) ?></a>
                                        </td>
                                        <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($t['category_name'] ?? 'General') ?></span></td>
                                        <td class="small text-secondary"><?= htmlspecialchars(implode(', ', $assignees_list)) ?></td>
                                        <td>
                                            <span class="small font-monospace text-muted"><?= $t['due_time'] ? date('h:i A', strtotime($t['due_time'])) : 'Anytime' ?></span>
                                        </td>
                                        <td><span class="badge <?= getPriorityBadgeClass($t['priority']) ?>"><?= $t['priority'] ?></span></td>
                                        <td>
                                            <?php if($overdue): ?>
                                                <span class="badge bg-danger text-white">Overdue</span>
                                            <?php else: ?>
                                                <span class="badge bg-secondary"><?= $t['status'] ?></span>
                                            <?php endif; ?>
                                        </td>
                                        <td class="text-end pe-4">
                                            <?php if($t['status'] !== 'Completed'): ?>
                                                <button type="button" class="btn btn-sm btn-success rounded-pill px-3" onclick="openCompleteModal(<?= $t['id'] ?>, '<?= htmlspecialchars(addslashes($t['title'])) ?>')"><i class="fas fa-check"></i> Complete</button>
                                            <?php else: ?>
                                                <span class="text-success small"><i class="fas fa-check-circle me-1"></i> Done</span>
                                            <?php endif; ?>
                                        </td>
                                    </tr>
                                <?php endforeach; endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Overdue Tasks Section -->
            <?php if(!empty($overdue_tasks)): ?>
            <div class="card border-0 shadow-sm rounded-4 border-start border-4 border-danger mb-4">
                <div class="card-header bg-white border-bottom-0 py-3">
                    <h5 class="mb-0 fw-bold text-danger"><i class="fas fa-exclamation-triangle me-2"></i> Overdue Tasks</h5>
                </div>
                <div class="card-body p-0">
                    <div class="list-group list-group-flush">
                        <?php foreach($overdue_tasks as $t): 
                            $due_dt = new DateTime($t['due_date'] . ' ' . ($t['due_time'] ?? '23:59:59'));
                            $today_dt = new DateTime();
                            $interval = $due_dt->diff($today_dt);
                            $overdue_text = $interval->days > 0 ? $interval->days . " Days" : $interval->h . " Hours";
                        ?>
                            <div class="list-group-item d-flex flex-column flex-sm-row justify-content-between align-items-sm-center py-3 px-4">
                                <div>
                                    <h6 class="fw-bold mb-1"><a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="text-decoration-none text-dark"><?= htmlspecialchars($t['title']) ?></a></h6>
                                    <small class="text-danger"><i class="far fa-clock me-1"></i> Overdue by <?= $overdue_text ?></small>
                                    <span class="badge bg-light text-dark border ms-2"><?= htmlspecialchars($t['category_name'] ?? 'General') ?></span>
                                </div>
                                <div class="mt-2 mt-sm-0">
                                    <button type="button" class="btn btn-sm btn-outline-success rounded-pill px-3 me-2" onclick="openCompleteModal(<?= $t['id'] ?>, '<?= htmlspecialchars(addslashes($t['title'])) ?>')"><i class="fas fa-check"></i> Complete</button>
                                    <a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="btn btn-sm btn-light border rounded-pill px-3">Details</a>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>
            <?php endif; ?>
        </div>

        <!-- Sidebar Column -->
        <div class="col-12 col-xl-4">
            <!-- Progress Tracker -->
            <div class="card border-0 shadow-sm rounded-4 mb-4">
                <div class="card-body p-4">
                    <h6 class="fw-bold text-muted uppercase text-xs mb-3">MONTHLY TASK PROGRESS</h6>
                    <h3 class="fw-bold mb-1"><?= $completed_this_month ?> / <?= $total_this_month ?> Tasks</h3>
                    <p class="text-secondary small mb-4">Completed this month</p>
                    
                    <div class="progress rounded-pill mb-2" style="height: 12px;">
                        <div class="progress-bar bg-success rounded-pill" role="progressbar" style="width: <?= $progress_percent ?>%;" aria-valuenow="<?= $progress_percent ?>" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>
                    <div class="d-flex justify-content-between text-muted small fw-semibold">
                        <span>Progress Rate</span>
                        <span><?= $progress_percent ?>%</span>
                    </div>
                </div>
            </div>

            <!-- Upcoming Tasks (7 days) -->
            <div class="card border-0 shadow-sm rounded-4">
                <div class="card-header bg-white border-bottom-0 py-3">
                    <h5 class="mb-0 fw-bold"><i class="far fa-calendar-alt me-2 text-primary"></i> Upcoming (7 Days)</h5>
                </div>
                <div class="card-body p-0">
                    <div class="list-group list-group-flush">
                        <?php if(empty($upcoming_tasks)): ?>
                            <div class="text-center py-5 text-muted small">No upcoming tasks next 7 days</div>
                        <?php else: foreach($upcoming_tasks as $t): ?>
                            <div class="list-group-item py-3 px-4">
                                <div class="d-flex justify-content-between align-items-start">
                                    <h6 class="fw-bold mb-1 text-truncate" style="max-width: 70%;"><a href="?tab=tasks_details&id=<?= $t['id'] ?>" class="text-decoration-none text-dark"><?= htmlspecialchars($t['title']) ?></a></h6>
                                    <span class="badge <?= getPriorityBadgeClass($t['priority']) ?> font-xs"><?= $t['priority'] ?></span>
                                </div>
                                <div class="d-flex justify-content-between align-items-center text-muted small mt-2">
                                    <span><i class="far fa-calendar me-1"></i> <?= date('d M, Y', strtotime($t['due_date'])) ?></span>
                                    <span><span class="badge bg-light text-dark border"><?= htmlspecialchars($t['category_name'] ?? 'General') ?></span></span>
                                </div>
                            </div>
                        <?php endforeach; endif; ?>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Task Complete Modal -->
<div class="modal fade" id="quickCompleteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <form method="POST" action="?tab=task_dashboard" class="modal-content" enctype="multipart/form-data">
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
