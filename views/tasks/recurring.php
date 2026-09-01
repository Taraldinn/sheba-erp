<?php
/**
 * views/tasks/recurring.php
 * View and manage recurring rules/schedules under tenant isolation.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;

if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_recurring')) {
    echo "<div class='container mt-4'><div class='alert alert-danger'>Access Denied. You do not have permission to manage recurring rules.</div></div>";
    return;
}

// Fetch recurring rules
$rules = safeFetchAll($pdo, "SELECT r.*, t.title as task_title, t.due_time, c.name as category_name 
                            FROM " . TBL_TASK_RECURRING_RULES . " r 
                            JOIN " . TBL_TASKS . " t ON r.task_id = t.id 
                            LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id 
                            WHERE r.tenant_id = ? ORDER BY r.id DESC", [$tenant_id]);

?>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-history text-info me-2"></i> Recurring Tasks</h4>
        <a href="?tab=tasks_create" class="btn btn-primary rounded-pill px-3 shadow-sm"><i class="fas fa-plus me-1"></i> New Recurring Task</a>
    </div>

    <div class="card border-0 shadow-sm rounded-4">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
                    <thead class="bg-light text-muted">
                        <tr>
                            <th class="ps-4">Original Task Title</th>
                            <th>Category</th>
                            <th>Repeat Frequency</th>
                            <th>Schedule Rule Details</th>
                            <th>Last Generated</th>
                            <th>Next Planned Generation</th>
                            <th>Status</th>
                            <th class="text-end pe-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($rules)): ?>
                            <tr><td colspan="8" class="text-center py-5 text-muted"><i class="fas fa-history fa-lg me-2"></i> No active recurring task rules configured.</td></tr>
                        <?php else: foreach($rules as $r): ?>
                            <tr>
                                <td class="ps-4">
                                    <div class="fw-bold"><a href="?tab=tasks_details&id=<?= $r['task_id'] ?>" class="text-decoration-none text-dark"><?= htmlspecialchars($r['task_title']) ?></a></div>
                                </td>
                                <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($r['category_name'] ?? 'General') ?></span></td>
                                <td>
                                    <span class="badge bg-info text-white"><?= $r['recurrence_type'] ?></span>
                                </td>
                                <td class="small">
                                    <?php if ($r['recurrence_type'] === 'Daily'): ?>
                                        Runs daily at <?= $r['due_time'] ? date('h:i A', strtotime($r['due_time'])) : '09:00 AM' ?>
                                    <?php elseif ($r['recurrence_type'] === 'Weekly'): ?>
                                        Runs every <strong><?= htmlspecialchars($r['day_of_week']) ?></strong> at <?= $r['due_time'] ? date('h:i A', strtotime($r['due_time'])) : '09:00 AM' ?>
                                    <?php elseif ($r['recurrence_type'] === 'Monthly'): ?>
                                        Runs monthly on <strong>Day <?= $r['day_of_month'] ?></strong> at <?= $r['due_time'] ? date('h:i A', strtotime($r['due_time'])) : '09:00 AM' ?>
                                    <?php endif; ?>
                                </td>
                                <td class="font-monospace text-muted"><?= $r['last_run_at'] ? date('d M Y, h:i A', strtotime($r['last_run_at'])) : 'Never' ?></td>
                                <td class="font-monospace text-primary fw-bold"><?= $r['next_run_at'] ? date('d M Y, h:i A', strtotime($r['next_run_at'])) : 'N/A' ?></td>
                                <td>
                                    <?php if ($r['is_active']): ?>
                                        <span class="badge bg-success">Active</span>
                                    <?php else: ?>
                                        <span class="badge bg-secondary">Paused</span>
                                    <?php endif; ?>
                                </td>
                                <td class="text-end pe-4">
                                    <a href="?tab=tasks_recurring&action=toggle_recurring&id=<?= $r['id'] ?>" class="btn btn-sm btn-outline-<?= $r['is_active'] ? 'secondary' : 'success' ?> rounded-pill px-3 me-2">
                                        <i class="fas <?= $r['is_active'] ? 'fa-pause' : 'fa-play' ?> me-1"></i> <?= $r['is_active'] ? 'Pause' : 'Activate' ?>
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
