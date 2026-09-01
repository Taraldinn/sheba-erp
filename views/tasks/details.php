<?php
/**
 * views/tasks/details.php
 * Task Details panel showing meta information, assignees, uploaded attachments, and an interactive audit trail.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;
$today_str = date('Y-m-d');
$now_time = date('H:i:s');

$task_id = !empty($_GET['id']) ? intval($_GET['id']) : 0;
if ($task_id <= 0) {
    $_SESSION['flash_error'] = "Invalid task ID.";
    header("Location: ?tab=tasks_all");
    exit;
}

// Fetch task
$task = safeFetch($pdo, "
    SELECT t.*, c.name as category_name, s.name as creator_name, sc.name as completer_name
    FROM " . TBL_TASKS . " t
    LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id
    LEFT JOIN " . TBL_STAFF . " s ON t.created_by = s.id
    LEFT JOIN " . TBL_STAFF . " sc ON t.completed_by = sc.id
    WHERE t.id = ? AND t.tenant_id = ?
", [$task_id, $tenant_id]);

if (!$task) {
    echo "<div class='container mt-4'><div class='alert alert-danger'>Task not found or access denied.</div></div>";
    return;
}

// Fetch assignees
$assignees = safeFetchAll($pdo, "
    SELECT s.id, s.name, s.role 
    FROM " . TBL_TASK_ASSIGNEES . " ta 
    JOIN " . TBL_STAFF . " s ON ta.user_id = s.id 
    WHERE ta.task_id = ? AND ta.tenant_id = ?
", [$task_id, $tenant_id]);

// Fetch attachments
$attachments = safeFetchAll($pdo, "
    SELECT a.*, s.name as uploader_name 
    FROM " . TBL_TASK_ATTACHMENTS . " a 
    LEFT JOIN " . TBL_STAFF . " s ON a.uploaded_by = s.id 
    WHERE a.task_id = ? AND a.tenant_id = ? 
    ORDER BY a.id DESC
", [$task_id, $tenant_id]);

// Fetch activity logs
$activities = safeFetchAll($pdo, "
    SELECT l.*, s.name as user_name 
    FROM " . TBL_TASK_ACTIVITY_LOGS . " l 
    LEFT JOIN " . TBL_STAFF . " s ON l.user_id = s.id 
    WHERE l.task_id = ? AND l.tenant_id = ? 
    ORDER BY l.id DESC
", [$task_id, $tenant_id]);

$overdue = ($task['status'] !== 'Completed' && $task['status'] !== 'Cancelled' && ($task['due_date'] < $today_str || ($task['due_date'] === $today_str && $task['due_time'] !== null && $task['due_time'] < $now_time)));

function getDetailsPriorityBadge($priority) {
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
    <!-- Header panel -->
    <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
            <h4 class="mb-1 fw-bold text-dark"><i class="fas fa-tasks text-primary me-2"></i> Task Details</h4>
            <span class="text-muted small">Task ID: #<?= $task['id'] ?> &bull; Created by <?= htmlspecialchars($task['creator_name'] ?? 'System') ?></span>
        </div>
        <div class="d-flex gap-2">
            <a href="?tab=tasks_all" class="btn btn-sm btn-light border rounded-pill px-3"><i class="fas fa-arrow-left me-1"></i> Back</a>
            <a href="?tab=tasks_create&edit_id=<?= $task['id'] ?>" class="btn btn-sm btn-outline-warning rounded-pill px-3"><i class="fas fa-edit me-1"></i> Edit</a>
            <a href="?tab=tasks_all&action=duplicate_task&id=<?= $task['id'] ?>" class="btn btn-sm btn-outline-secondary rounded-pill px-3"><i class="fas fa-clone me-1"></i> Duplicate</a>
            <?php if (hasRole('Admin') || hasRole('Reseller') || hasPermission('task.delete')): ?>
                <a href="?tab=tasks_all&action=delete_task&id=<?= $task['id'] ?>" class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="return confirm('Are you sure you want to permanently delete this task?')"><i class="fas fa-trash-alt me-1"></i> Delete</a>
            <?php endif; ?>
        </div>
    </div>

    <div class="row g-4">
        <!-- Main Details Column -->
        <div class="col-12 col-xl-8">
            <div class="card border-0 shadow-sm rounded-4 mb-4 bg-white">
                <div class="card-body p-4">
                    <!-- Title & Badges -->
                    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
                        <span class="badge bg-light text-dark border px-3 py-2"><?= htmlspecialchars($task['category_name'] ?? 'General') ?></span>
                        <span class="badge <?= getDetailsPriorityBadge($task['priority']) ?> px-3 py-2"><?= $task['priority'] ?> Priority</span>
                        <?php if ($task['status'] === 'Completed'): ?>
                            <span class="badge bg-success px-3 py-2"><i class="fas fa-check-circle me-1"></i> Completed</span>
                        <?php elseif ($task['status'] === 'Cancelled'): ?>
                            <span class="badge bg-secondary px-3 py-2">Cancelled</span>
                        <?php elseif ($overdue): ?>
                            <span class="badge bg-danger px-3 py-2"><i class="fas fa-exclamation-triangle me-1"></i> Overdue</span>
                        <?php else: ?>
                            <span class="badge bg-warning text-dark px-3 py-2"><?= $task['status'] ?></span>
                        <?php endif; ?>

                        <?php if ($task['recurring_rule_id'] > 0): ?>
                            <span class="badge bg-light text-primary border px-3 py-2"><i class="fas fa-redo me-1"></i> Recurring Rule</span>
                        <?php endif; ?>
                    </div>

                    <h3 class="fw-bold text-dark mb-3"><?= htmlspecialchars($task['title']) ?></h3>
                    
                    <div class="bg-light rounded p-3 mb-4">
                        <h6 class="fw-bold text-muted small uppercase mb-2">DESCRIPTION</h6>
                        <p class="text-dark mb-0 style-plain" style="white-space: pre-line; line-height: 1.6; font-size: 0.92rem;"><?= htmlspecialchars($task['description'] ?: 'No description provided.') ?></p>
                    </div>

                    <!-- Date & time specifics -->
                    <div class="row g-3 border-bottom pb-4 mb-4">
                        <div class="col-6 col-sm-4">
                            <span class="text-muted small d-block">Start Date</span>
                            <strong class="text-dark font-monospace"><?= date('d M, Y', strtotime($task['start_date'])) ?></strong>
                        </div>
                        <div class="col-6 col-sm-4">
                            <span class="text-muted small d-block">Due Date</span>
                            <strong class="text-dark font-monospace"><?= $task['due_date'] ? date('d M, Y', strtotime($task['due_date'])) : 'Anytime' ?></strong>
                        </div>
                        <div class="col-6 col-sm-4">
                            <span class="text-muted small d-block">Due Time</span>
                            <strong class="text-dark font-monospace"><?= $task['due_time'] ? date('h:i A', strtotime($task['due_time'])) : 'Anytime' ?></strong>
                        </div>
                        <div class="col-6 col-sm-4 mt-3">
                            <span class="text-muted small d-block">Reminder Type</span>
                            <strong class="text-dark"><?= htmlspecialchars($task['reminder_type']) ?></strong>
                        </div>
                        <div class="col-6 col-sm-4 mt-3">
                            <span class="text-muted small d-block">Creation Time</span>
                            <strong class="text-muted font-monospace small"><?= date('d M Y, h:i A', strtotime($task['created_at'])) ?></strong>
                        </div>
                    </div>

                    <!-- Task Completion Proof details if Completed -->
                    <?php if ($task['status'] === 'Completed'): ?>
                        <div class="card border-0 bg-success-subtle p-3 rounded-3 mb-4 border-start border-4 border-success">
                            <h6 class="fw-bold text-success mb-2"><i class="fas fa-check-circle me-1"></i> Completion Report</h6>
                            <p class="mb-2 text-dark small">Completed by <strong><?= htmlspecialchars($task['completer_name'] ?? 'System') ?></strong> on <strong><?= date('d M Y, h:i A', strtotime($task['completed_at'])) ?></strong></p>
                            <?php if ($task['completion_note']): ?>
                                <div class="bg-white rounded p-3 small text-secondary">
                                    <strong>Notes:</strong> <?= htmlspecialchars($task['completion_note']) ?>
                                </div>
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>

                    <!-- Action Controls -->
                    <?php if ($task['status'] !== 'Completed' && $task['status'] !== 'Cancelled'): ?>
                        <div class="card border-0 bg-light p-3 rounded-3 d-flex flex-sm-row justify-content-between align-items-center gap-3">
                            <div>
                                <strong class="text-dark small d-block">Action Required</strong>
                                <span class="text-muted small">Update status or log resolution details</span>
                            </div>
                            <div class="d-flex gap-2">
                                <?php if ($task['status'] === 'Pending'): ?>
                                    <a href="?tab=tasks_details&id=<?= $task['id'] ?>&action=start_task" class="btn btn-sm btn-info text-white rounded-pill px-4"><i class="fas fa-play me-1"></i> Start Task</a>
                                <?php endif; ?>
                                <button type="button" class="btn btn-sm btn-success rounded-pill px-4" onclick="openCompleteModal()"><i class="fas fa-check-circle me-1"></i> Complete Task</button>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Activity Logs Timeline -->
            <div class="card border-0 shadow-sm rounded-4 bg-white">
                <div class="card-header bg-white border-bottom-0 py-3">
                    <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-history text-muted me-2"></i> Audit Trail & Activity Log</h5>
                </div>
                <div class="card-body p-4 pt-0">
                    <?php if (empty($activities)): ?>
                        <p class="text-muted small mb-0">No logs found for this task.</p>
                    <?php else: ?>
                        <div class="position-relative ps-4" style="border-left: 2px solid #dee2e6; margin-left: 10px;">
                            <?php foreach ($activities as $act): ?>
                                <div class="mb-4 position-relative">
                                    <!-- Bullet indicator -->
                                    <div class="rounded-circle bg-primary position-absolute" style="width: 10px; height: 10px; left: -26px; top: 6px; border: 2px solid #fff; box-shadow: 0 0 0 2px #339af0;"></div>
                                    <div class="d-flex justify-content-between small text-muted mb-1">
                                        <strong class="text-dark"><?= htmlspecialchars($act['user_name'] ?? 'System') ?></strong>
                                        <span class="font-monospace small"><?= date('d M Y, h:i A', strtotime($act['created_at'])) ?></span>
                                    </div>
                                    <div class="small">
                                        <span class="badge bg-light text-dark border"><?= htmlspecialchars($act['action']) ?></span>
                                        <?php if ($act['old_value'] !== null || $act['new_value'] !== null): ?>
                                            <span class="text-muted ms-1">Changed status from <strong><?= htmlspecialchars($act['old_value']) ?></strong> to <strong><?= htmlspecialchars($act['new_value']) ?></strong></span>
                                        <?php endif; ?>
                                    </div>
                                    <?php if ($act['note']): ?>
                                        <div class="bg-light rounded p-2 text-secondary small mt-2">
                                            <?= htmlspecialchars($act['note']) ?>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Sidebar (Assignees & Attachments) -->
        <div class="col-12 col-xl-4">
            <!-- Assignees list -->
            <div class="card border-0 shadow-sm rounded-4 bg-white mb-4">
                <div class="card-header bg-white border-bottom-0 py-3">
                    <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-users me-2 text-primary"></i> Assigned Staff</h5>
                </div>
                <div class="card-body p-3 pt-0">
                    <ul class="list-group list-group-flush">
                        <?php if (empty($assignees)): ?>
                            <li class="list-group-item text-center text-muted small py-3">Unassigned</li>
                        <?php else: foreach ($assignees as $assign): ?>
                            <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-1">
                                <div>
                                    <strong class="text-dark small d-block"><?= htmlspecialchars($assign['name']) ?></strong>
                                    <span class="text-muted text-xs"><?= htmlspecialchars($assign['role']) ?></span>
                                </div>
                                <span class="badge bg-light text-dark border">Assignee</span>
                            </li>
                        <?php endforeach; endif; ?>
                    </ul>
                </div>
            </div>

            <!-- Attachments list -->
            <div class="card border-0 shadow-sm rounded-4 bg-white">
                <div class="card-header bg-white border-bottom-0 py-3">
                    <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-paperclip me-2 text-info"></i> Attachments</h5>
                </div>
                <div class="card-body p-3 pt-0">
                    <ul class="list-group list-group-flush">
                        <?php if (empty($attachments)): ?>
                            <li class="list-group-item text-center text-muted small py-3">No attachments uploaded</li>
                        <?php else: foreach ($attachments as $att): ?>
                            <li class="list-group-item py-2 px-1 d-flex flex-column gap-1">
                                <div class="d-flex justify-content-between align-items-center">
                                    <a href="/<?= htmlspecialchars($att['file_path']) ?>" target="_blank" class="fw-bold text-primary small text-decoration-none text-truncate" style="max-width: 80%;" title="<?= htmlspecialchars($att['file_name']) ?>">
                                        <i class="fas fa-file me-1"></i> <?= htmlspecialchars($att['file_name']) ?>
                                    </a>
                                    <span class="text-muted text-xs font-monospace"><?= round($att['file_size']/1024, 1) ?> KB</span>
                                </div>
                                <span class="text-muted text-xs">Uploaded by <?= htmlspecialchars($att['uploader_name']) ?> &bull; <?= date('d M Y', strtotime($att['created_at'])) ?></span>
                            </li>
                        <?php endforeach; endif; ?>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Task Complete Modal -->
<div class="modal fade" id="quickCompleteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <form method="POST" action="?tab=tasks_details&id=<?= $task['id'] ?>" class="modal-content" enctype="multipart/form-data">
            <input type="hidden" name="action" value="complete_task">
            <input type="hidden" name="complete_task" value="1">
            <input type="hidden" name="id" value="<?= $task['id'] ?>">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title"><i class="fas fa-check-circle me-2"></i> Complete Task</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <p>Task: <strong><?= htmlspecialchars($task['title']) ?></strong></p>
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
function openCompleteModal() {
    var myModal = new bootstrap.Modal(document.getElementById('quickCompleteModal'));
    myModal.show();
}
</script>
