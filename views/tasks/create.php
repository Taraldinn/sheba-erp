<?php
/**
 * views/tasks/create.php
 * Form to create or edit a task under tenant isolation.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;

$edit_id = !empty($_GET['edit_id']) ? intval($_GET['edit_id']) : 0;
$prefill_date = $_GET['prefill_date'] ?? '';

$task = null;
$assigned_users = [];

if ($edit_id > 0) {
    $task = safeFetch($pdo, "SELECT * FROM " . TBL_TASKS . " WHERE id = ? AND tenant_id = ?", [$edit_id, $tenant_id]);
    if (!$task) {
        $_SESSION['flash_error'] = "Task not found or access denied.";
        header("Location: ?tab=tasks_all");
        exit;
    }
    
    // Get assignees
    $assigned_raw = safeFetchAll($pdo, "SELECT user_id FROM " . TBL_TASK_ASSIGNEES . " WHERE task_id = ? AND tenant_id = ?", [$edit_id, $tenant_id]);
    $assigned_users = array_column($assigned_raw, 'user_id');
}

// Fetch categories and staff
$categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_CATEGORIES . " WHERE tenant_id = ? AND status = 'Active' ORDER BY name ASC", [$tenant_id]);
$staff_list = safeFetchAll($pdo, "SELECT id, name, username, role FROM " . TBL_STAFF . " WHERE status = 'Active' ORDER BY name ASC");

// Set default dates
$start_date = $task ? $task['start_date'] : (!empty($prefill_date) ? $prefill_date : date('Y-m-d'));
$due_date = $task ? $task['due_date'] : (!empty($prefill_date) ? $prefill_date : date('Y-m-d'));
?>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="mb-0 fw-bold text-dark"><i class="fas <?= $edit_id ? 'fa-edit text-warning' : 'fa-plus-circle text-success' ?> me-2"></i> <?= $edit_id ? 'Edit Task' : 'Create Task' ?></h4>
        <a href="?tab=tasks_all" class="btn btn-sm btn-light border rounded-pill px-3"><i class="fas fa-arrow-left me-1"></i> Back to List</a>
    </div>

    <div class="row">
        <div class="col-12 col-xl-8">
            <div class="card border-0 shadow-sm rounded-4">
                <div class="card-body p-4">
                    <form method="POST" action="?tab=tasks_all" enctype="multipart/form-data" class="needs-validation" novalidate>
                        <input type="hidden" name="save_task" value="1">
                        <?php if($edit_id): ?>
                            <input type="hidden" name="id" value="<?= $edit_id ?>">
                        <?php endif; ?>

                        <!-- Title -->
                        <div class="mb-3">
                            <label class="form-label fw-semibold small">Task Title <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" name="title" value="<?= $task ? htmlspecialchars($task['title']) : '' ?>" placeholder="e.g. Verify MikroTik Backup Configuration" required>
                            <div class="invalid-feedback">Please enter a task title.</div>
                        </div>

                        <!-- Description -->
                        <div class="mb-3">
                            <label class="form-label fw-semibold small">Task Description</label>
                            <textarea class="form-control" name="description" rows="4" placeholder="Describe the details of the task..."><?= $task ? htmlspecialchars($task['description']) : '' ?></textarea>
                        </div>

                        <div class="row g-3 mb-3">
                            <!-- Category -->
                            <div class="col-12 col-sm-6">
                                <label class="form-label fw-semibold small">Category <span class="text-danger">*</span></label>
                                <select class="form-select" name="category_id" required>
                                    <option value="">-- Select Category --</option>
                                    <?php foreach($categories as $c): ?>
                                        <option value="<?= $c['id'] ?>" <?= ($task && $task['category_id'] == $c['id']) ? 'selected' : '' ?>><?= htmlspecialchars($c['name']) ?></option>
                                    <?php endforeach; ?>
                                </select>
                                <div class="invalid-feedback">Please select a category.</div>
                            </div>

                            <!-- Priority -->
                            <div class="col-12 col-sm-6">
                                <label class="form-label fw-semibold small">Priority <span class="text-danger">*</span></label>
                                <select class="form-select" name="priority" required>
                                    <option value="Low" <?= ($task && $task['priority'] === 'Low') ? 'selected' : '' ?>>Low</option>
                                    <option value="Medium" <?= (!$task || $task['priority'] === 'Medium') ? 'selected' : 'selected' ?>>Medium</option>
                                    <option value="High" <?= ($task && $task['priority'] === 'High') ? 'selected' : '' ?>>High</option>
                                    <option value="Urgent" <?= ($task && $task['priority'] === 'Urgent') ? 'selected' : '' ?>>Urgent</option>
                                </select>
                            </div>
                        </div>

                        <!-- Staff Assignment -->
                        <div class="mb-3">
                            <label class="form-label fw-semibold small">Assign Staff <span class="text-muted">(Hold Ctrl to select multiple)</span></label>
                            <select class="form-select" name="assignees[]" multiple style="min-height: 120px;">
                                <?php foreach($staff_list as $st): ?>
                                    <option value="<?= $st['id'] ?>" <?= in_array($st['id'], $assigned_users) ? 'selected' : '' ?>><?= htmlspecialchars($st['name']) ?> (<?= htmlspecialchars($st['role']) ?>)</option>
                                <?php endforeach; ?>
                            </select>
                        </div>

                        <!-- Schedule Type -->
                        <div class="mb-3">
                            <label class="form-label fw-semibold small">Schedule Type <span class="text-danger">*</span></label>
                            <select class="form-select" name="schedule_type" id="scheduleTypeSelect" required>
                                <option value="One-Time" <?= ($task && $task['schedule_type'] === 'One-Time') ? 'selected' : '' ?>>One-Time Task</option>
                                <option value="Daily" <?= ($task && $task['schedule_type'] === 'Daily') ? 'selected' : '' ?>>Daily Recurring</option>
                                <option value="Weekly" <?= ($task && $task['schedule_type'] === 'Weekly') ? 'selected' : '' ?>>Weekly Recurring</option>
                                <option value="Monthly" <?= ($task && $task['schedule_type'] === 'Monthly') ? 'selected' : '' ?>>Monthly Recurring</option>
                            </select>
                        </div>

                        <!-- Recurrence Configurations -->
                        <div id="weeklyDaysSection" class="mb-3 p-3 bg-light rounded d-none">
                            <label class="form-label fw-semibold small d-block">Select Days of Week</label>
                            <?php 
                            $week_days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                            // Extract week days if editing
                            $active_days = [];
                            if ($task && $task['recurring_rule_id'] > 0) {
                                $rule = safeFetch($pdo, "SELECT day_of_week FROM " . TBL_TASK_RECURRING_RULES . " WHERE id = ?", [$task['recurring_rule_id']]);
                                if ($rule && !empty($rule['day_of_week'])) {
                                    $active_days = explode(',', $rule['day_of_week']);
                                }
                            }
                            foreach ($week_days as $day): 
                            ?>
                                <div class="form-check form-check-inline">
                                    <input class="form-check-input" type="checkbox" name="weekly_days[]" value="<?= $day ?>" id="day_<?= $day ?>" <?= in_array($day, $active_days) ? 'checked' : '' ?>>
                                    <label class="form-check-label small" for="day_<?= $day ?>"><?= $day ?></label>
                                </div>
                            <?php endforeach; ?>
                        </div>

                        <div id="monthlyDaySection" class="mb-3 p-3 bg-light rounded d-none" style="max-width: 250px;">
                            <label class="form-label fw-semibold small">Day of Month</label>
                            <?php 
                            $active_dom = 1;
                            if ($task && $task['recurring_rule_id'] > 0) {
                                $rule = safeFetch($pdo, "SELECT day_of_month FROM " . TBL_TASK_RECURRING_RULES . " WHERE id = ?", [$task['recurring_rule_id']]);
                                if ($rule && !empty($rule['day_of_month'])) {
                                    $active_dom = intval($rule['day_of_month']);
                                }
                            }
                            ?>
                            <select class="form-select form-select-sm" name="monthly_day">
                                <?php for($i=1; $i<=31; $i++): ?>
                                    <option value="<?= $i ?>" <?= $active_dom === $i ? 'selected' : '' ?>>Day <?= $i ?></option>
                                <?php endfor; ?>
                            </select>
                        </div>

                        <!-- Date & Time Row -->
                        <div class="row g-3 mb-3">
                            <div class="col-6">
                                <label class="form-label fw-semibold small" id="startDateLabel">Start Date <span class="text-danger">*</span></label>
                                <input type="date" class="form-control" name="start_date" value="<?= htmlspecialchars($start_date) ?>" required>
                            </div>
                            <div class="col-6" id="dueDateContainer">
                                <label class="form-label fw-semibold small">Due Date</label>
                                <input type="date" class="form-control" name="due_date" value="<?= htmlspecialchars($due_date) ?>">
                            </div>
                        </div>

                        <div class="row g-3 mb-3">
                            <div class="col-6">
                                <label class="form-label fw-semibold small">Due Time</label>
                                <input type="time" class="form-control" name="due_time" value="<?= $task ? htmlspecialchars($task['due_time']) : '09:00' ?>">
                            </div>
                            <div class="col-6">
                                <label class="form-label fw-semibold small">Reminder</label>
                                <select class="form-select" name="reminder_type">
                                    <option value="No Reminder" <?= (!$task || $task['reminder_type'] === 'No Reminder') ? 'selected' : '' ?>>No Reminder</option>
                                    <option value="At Due Time" <?= ($task && $task['reminder_type'] === 'At Due Time') ? 'selected' : '' ?>>At Due Time</option>
                                    <option value="10 Minutes Before" <?= ($task && $task['reminder_type'] === '10 Minutes Before') ? 'selected' : '' ?>>10 Minutes Before</option>
                                    <option value="30 Minutes Before" <?= ($task && $task['reminder_type'] === '30 Minutes Before') ? 'selected' : '' ?>>30 Minutes Before</option>
                                    <option value="1 Hour Before" <?= ($task && $task['reminder_type'] === '1 Hour Before') ? 'selected' : '' ?>>1 Hour Before</option>
                                    <option value="3 Hours Before" <?= ($task && $task['reminder_type'] === '3 Hours Before') ? 'selected' : '' ?>>3 Hours Before</option>
                                    <option value="1 Day Before" <?= ($task && $task['reminder_type'] === '1 Day Before') ? 'selected' : '' ?>>1 Day Before</option>
                                </select>
                            </div>
                        </div>

                        <!-- Attachment -->
                        <div class="mb-3">
                            <label class="form-label fw-semibold small">Attachment</label>
                            <input type="file" class="form-control" name="attachment">
                            <div class="form-text small">Upload documents, photos, or files (Max 10MB)</div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-semibold small">Initial Status</label>
                            <select class="form-select" name="status">
                                <option value="Pending" <?= ($task && $task['status'] === 'Pending') ? 'selected' : '' ?>>Pending</option>
                                <option value="In Progress" <?= ($task && $task['status'] === 'In Progress') ? 'selected' : '' ?>>In Progress</option>
                                <option value="Completed" <?= ($task && $task['status'] === 'Completed') ? 'selected' : '' ?>>Completed</option>
                                <option value="Cancelled" <?= ($task && $task['status'] === 'Cancelled') ? 'selected' : '' ?>>Cancelled</option>
                            </select>
                        </div>

                        <div class="mt-4 pt-3 border-top d-flex justify-content-end gap-2">
                            <a href="?tab=tasks_all" class="btn btn-light border rounded-pill px-4">Cancel</a>
                            <button type="submit" class="btn btn-primary rounded-pill px-4"><i class="fas fa-save me-1"></i> Save Task</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const scheduleSelect = document.getElementById('scheduleTypeSelect');
    const weeklyDays = document.getElementById('weeklyDaysSection');
    const monthlyDay = document.getElementById('monthlyDaySection');
    const dueDateContainer = document.getElementById('dueDateContainer');
    const startDateLabel = document.getElementById('startDateLabel');

    function toggleScheduleFields() {
        const val = scheduleSelect.value;
        if (val === 'One-Time') {
            weeklyDays.classList.add('d-none');
            monthlyDay.classList.add('d-none');
            dueDateContainer.classList.remove('d-none');
            startDateLabel.innerText = "Start Date *";
        } else if (val === 'Daily') {
            weeklyDays.classList.add('d-none');
            monthlyDay.classList.add('d-none');
            dueDateContainer.classList.add('d-none');
            startDateLabel.innerText = "Effective Start Date *";
        } else if (val === 'Weekly') {
            weeklyDays.classList.remove('d-none');
            monthlyDay.classList.add('d-none');
            dueDateContainer.classList.add('d-none');
            startDateLabel.innerText = "Effective Start Date *";
        } else if (val === 'Monthly') {
            weeklyDays.classList.add('d-none');
            monthlyDay.classList.remove('d-none');
            dueDateContainer.classList.add('d-none');
            startDateLabel.innerText = "Effective Start Date *";
        }
    }

    scheduleSelect.addEventListener('change', toggleScheduleFields);
    toggleScheduleFields(); // Run initially

    // Form validation
    var forms = document.querySelectorAll('.needs-validation')
    Array.prototype.slice.call(forms)
        .forEach(function (form) {
            form.addEventListener('submit', function (event) {
                if (!form.checkValidity()) {
                    event.preventDefault()
                    event.stopPropagation()
                }
                form.classList.add('was-validated')
            }, false)
        })
});
</script>
