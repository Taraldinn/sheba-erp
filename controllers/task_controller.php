<?php
/**
 * controllers/task_controller.php
 * Handles backend operations for the Task Management Module under strict multi-tenant scope.
 */

if (!isLoggedIn()) {
    return;
}

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Helper to log task activities
function logTaskActivity($pdo, $tenant_id, $task_id, $user_id, $action, $old_val = null, $new_val = null, $note = null) {
    $stmt = $pdo->prepare("INSERT INTO " . TBL_TASK_ACTIVITY_LOGS . " (tenant_id, task_id, user_id, action, old_value, new_value, note) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$tenant_id, $task_id, $user_id, $action, $old_val, $new_val, $note]);
}

// Helper to handle task attachment uploads
function handleTaskUpload($file, $tenant_id, $task_id, $uploaded_by) {
    if (isset($file) && $file['error'] === UPLOAD_ERR_OK) {
        $file_name = $file['name'];
        $file_tmp = $file['tmp_name'];
        $ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));
        
        $allowed = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'rar'];
        if (!in_array($ext, $allowed)) {
            return false;
        }
        
        $new_name = 'task_' . $task_id . '_' . time() . '_' . uniqid() . '.' . $ext;
        $upload_dir = __DIR__ . '/../uploads/tasks/';
        if (!file_exists($upload_dir)) {
            mkdir($upload_dir, 0777, true);
        }
        
        $dest = $upload_dir . $new_name;
        if (move_uploaded_file($file_tmp, $dest)) {
            global $pdo;
            $stmt = $pdo->prepare("INSERT INTO " . TBL_TASK_ATTACHMENTS . " (tenant_id, task_id, uploaded_by, file_name, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$tenant_id, $task_id, $uploaded_by, $file_name, 'uploads/tasks/' . $new_name, $ext, $file['size']]);
            return true;
        }
    }
    return false;
}

// POST action processor
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // 1. Create/Edit Task
    if (isset($_POST['save_task'])) {
        $task_id = isset($_POST['id']) ? intval($_POST['id']) : 0;
        $title = trim($_POST['title']);
        $description = trim($_POST['description'] ?? '');
        $category_id = !empty($_POST['category_id']) ? intval($_POST['category_id']) : null;
        $priority = $_POST['priority'] ?? 'Medium';
        $schedule_type = $_POST['schedule_type'] ?? 'One-Time';
        $start_date = !empty($_POST['start_date']) ? $_POST['start_date'] : date('Y-m-d');
        $due_date = !empty($_POST['due_date']) ? $_POST['due_date'] : null;
        $due_time = !empty($_POST['due_time']) ? $_POST['due_time'] : null;
        $reminder_type = $_POST['reminder_type'] ?? 'No Reminder';
        $status = $_POST['status'] ?? 'Pending';
        $assignees = isset($_POST['assignees']) ? array_map('intval', $_POST['assignees']) : [];

        if (empty($title)) {
            $_SESSION['flash_error'] = "Task Title is required.";
            header("Location: ?tab=" . ($task_id ? "tasks_details&id=$task_id" : "tasks_create"));
            exit;
        }

        if ($task_id > 0) {
            // Edit Task (verify ownership)
            $task = safeFetch($pdo, "SELECT * FROM " . TBL_TASKS . " WHERE id = ? AND tenant_id = ?", [$task_id, $tenant_id]);
            if (!$task) {
                $_SESSION['flash_error'] = "Task not found or access denied.";
                header("Location: ?tab=tasks_all");
                exit;
            }

            $stmt = $pdo->prepare("UPDATE " . TBL_TASKS . " SET title = ?, description = ?, category_id = ?, priority = ?, schedule_type = ?, start_date = ?, due_date = ?, due_time = ?, reminder_type = ?, status = ? WHERE id = ? AND tenant_id = ?");
            $stmt->execute([$title, $description, $category_id, $priority, $schedule_type, $start_date, $due_date, $due_time, $reminder_type, $status, $task_id, $tenant_id]);

            // Sync assignees
            $pdo->prepare("DELETE FROM " . TBL_TASK_ASSIGNEES . " WHERE task_id = ? AND tenant_id = ?")->execute([$task_id, $tenant_id]);
            if (!empty($assignees)) {
                $stmt_assign = $pdo->prepare("INSERT IGNORE INTO " . TBL_TASK_ASSIGNEES . " (tenant_id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)");
                foreach ($assignees as $assignee_id) {
                    $stmt_assign->execute([$tenant_id, $task_id, $assignee_id, $user_id]);
                }
            }

            logTaskActivity($pdo, $tenant_id, $task_id, $user_id, 'Task Edited', null, null, "Task details updated by user.");
            $_SESSION['flash_msg'] = "Task updated successfully.";
        } else {
            // Create Task
            $stmt = $pdo->prepare("INSERT INTO " . TBL_TASKS . " (tenant_id, title, description, category_id, priority, schedule_type, start_date, due_date, due_time, reminder_type, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$tenant_id, $title, $description, $category_id, $priority, $schedule_type, $start_date, $due_date, $due_time, $reminder_type, $status, $user_id]);
            $task_id = $pdo->lastInsertId();

            // Insert assignees
            if (!empty($assignees)) {
                $stmt_assign = $pdo->prepare("INSERT IGNORE INTO " . TBL_TASK_ASSIGNEES . " (tenant_id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)");
                foreach ($assignees as $assignee_id) {
                    $stmt_assign->execute([$tenant_id, $task_id, $assignee_id, $user_id]);
                }
            }

            // Create recurring rule if applicable
            if (in_array($schedule_type, ['Daily', 'Weekly', 'Monthly'])) {
                $recurrence_type = $schedule_type; // Maps to Daily, Weekly, Monthly enum
                $day_of_week = null;
                $day_of_month = null;

                if ($schedule_type === 'Weekly' && isset($_POST['weekly_days'])) {
                    $day_of_week = implode(',', $_POST['weekly_days']);
                } elseif ($schedule_type === 'Monthly') {
                    $day_of_month = !empty($_POST['monthly_day']) ? intval($_POST['monthly_day']) : 1;
                }

                // Initial next run date
                $next_run = new DateTime($start_date . ' ' . ($due_time ?? '09:00:00'));
                $stmt_rule = $pdo->prepare("INSERT INTO " . TBL_TASK_RECURRING_RULES . " (tenant_id, task_id, recurrence_type, recurrence_interval, day_of_week, day_of_month, start_date, next_run_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)");
                $stmt_rule->execute([$tenant_id, $task_id, $recurrence_type, $day_of_week, $day_of_month, $start_date, $next_run->format('Y-m-d H:i:s')]);
                
                $rule_id = $pdo->lastInsertId();
                $pdo->prepare("UPDATE " . TBL_TASKS . " SET recurring_rule_id = ? WHERE id = ?")->execute([$rule_id, $task_id]);
            }

            logTaskActivity($pdo, $tenant_id, $task_id, $user_id, 'Task Created', null, null, "Initial task created.");
            $_SESSION['flash_msg'] = "Task created successfully.";
        }

        // Handle attachment upload
        if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
            handleTaskUpload($_FILES['attachment'], $tenant_id, $task_id, $user_id);
        }

        header("Location: ?tab=tasks_details&id=" . $task_id);
        exit;
    }

    // 2. Complete Task
    if (isset($_POST['complete_task'])) {
        $task_id = intval($_POST['id']);
        $note = trim($_POST['completion_note'] ?? '');

        $task = safeFetch($pdo, "SELECT * FROM " . TBL_TASKS . " WHERE id = ? AND tenant_id = ?", [$task_id, $tenant_id]);
        if (!$task) {
            $_SESSION['flash_error'] = "Task not found or access denied.";
            header("Location: ?tab=tasks_all");
            exit;
        }

        $stmt = $pdo->prepare("UPDATE " . TBL_TASKS . " SET status = 'Completed', completed_at = NOW(), completed_by = ?, completion_note = ? WHERE id = ? AND tenant_id = ?");
        $stmt->execute([$user_id, $note, $task_id, $tenant_id]);

        logTaskActivity($pdo, $tenant_id, $task_id, $user_id, 'Status Changed', $task['status'], 'Completed', $note);

        if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
            handleTaskUpload($_FILES['attachment'], $tenant_id, $task_id, $user_id);
        }

        $_SESSION['flash_msg'] = "Task completed successfully.";
        header("Location: ?tab=tasks_details&id=" . $task_id);
        exit;
    }

    // 3. Category Administration
    if (isset($_POST['save_category'])) {
        if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_categories')) {
            $_SESSION['flash_error'] = "Permission Denied.";
            header("Location: ?tab=tasks_settings");
            exit;
        }
        $cat_id = isset($_POST['id']) ? intval($_POST['id']) : 0;
        $name = trim($_POST['name']);
        $status = $_POST['status'] ?? 'Active';

        if (empty($name)) {
            $_SESSION['flash_error'] = "Category Name is required.";
            header("Location: ?tab=tasks_settings");
            exit;
        }

        if ($cat_id > 0) {
            $stmt = $pdo->prepare("UPDATE " . TBL_TASK_CATEGORIES . " SET name = ?, status = ? WHERE id = ? AND tenant_id = ?");
            $stmt->execute([$name, $status, $cat_id, $tenant_id]);
            $_SESSION['flash_msg'] = "Category updated successfully.";
        } else {
            $stmt = $pdo->prepare("INSERT INTO " . TBL_TASK_CATEGORIES . " (tenant_id, name, status) VALUES (?, ?, ?)");
            $stmt->execute([$tenant_id, $name, $status]);
            $_SESSION['flash_msg'] = "Category created successfully.";
        }
        header("Location: ?tab=tasks_settings");
        exit;
    }

    // 4. Task Template CRUD
    if (isset($_POST['save_template'])) {
        if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_templates')) {
            $_SESSION['flash_error'] = "Permission Denied.";
            header("Location: ?tab=tasks_templates");
            exit;
        }
        $template_id = isset($_POST['id']) ? intval($_POST['id']) : 0;
        $name = trim($_POST['name']);
        $description = trim($_POST['description'] ?? '');
        
        $item_titles = $_POST['item_titles'] ?? [];
        $item_descriptions = $_POST['item_descriptions'] ?? [];
        $item_categories = $_POST['item_categories'] ?? [];
        $item_priorities = $_POST['item_priorities'] ?? [];
        $item_relative_days = $_POST['item_relative_days'] ?? [];
        $item_due_times = $_POST['item_due_times'] ?? [];
        $item_roles = $_POST['item_roles'] ?? [];

        if (empty($name)) {
            $_SESSION['flash_error'] = "Template Name is required.";
            header("Location: ?tab=tasks_templates");
            exit;
        }

        if ($template_id > 0) {
            // Edit
            $stmt = $pdo->prepare("UPDATE " . TBL_TASK_TEMPLATES . " SET name = ?, description = ? WHERE id = ? AND tenant_id = ?");
            $stmt->execute([$name, $description, $template_id, $tenant_id]);

            // Clear items
            $pdo->prepare("DELETE FROM " . TBL_TASK_TEMPLATE_ITEMS . " WHERE template_id = ? AND tenant_id = ?")->execute([$template_id, $tenant_id]);
        } else {
            // Create
            $stmt = $pdo->prepare("INSERT INTO " . TBL_TASK_TEMPLATES . " (tenant_id, name, description, created_by) VALUES (?, ?, ?, ?)");
            $stmt->execute([$tenant_id, $name, $description, $user_id]);
            $template_id = $pdo->lastInsertId();
        }

        // Insert Items
        if (!empty($item_titles)) {
            $stmt_item = $pdo->prepare("INSERT INTO " . TBL_TASK_TEMPLATE_ITEMS . " (tenant_id, template_id, title, description, category_id, priority, relative_day, due_time, assigned_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($item_titles as $k => $title) {
                if (empty($title)) continue;
                $stmt_item->execute([
                    $tenant_id, 
                    $template_id, 
                    $title, 
                    $item_descriptions[$k] ?? '', 
                    !empty($item_categories[$k]) ? intval($item_categories[$k]) : null, 
                    $item_priorities[$k] ?? 'Medium', 
                    intval($item_relative_days[$k] ?? 0), 
                    !empty($item_due_times[$k]) ? $item_due_times[$k] : null, 
                    $item_roles[$k] ?? ''
                ]);
            }
        }

        $_SESSION['flash_msg'] = "Template saved successfully.";
        header("Location: ?tab=tasks_templates");
        exit;
    }

    // 5. Apply Template Action
    if (isset($_POST['apply_template'])) {
        if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_templates')) {
            $_SESSION['flash_error'] = "Permission Denied.";
            header("Location: ?tab=tasks_templates");
            exit;
        }
        $template_id = intval($_POST['template_id']);
        $start_date = !empty($_POST['start_date']) ? $_POST['start_date'] : date('Y-m-d');
        $assignee_id = !empty($_POST['assignee_id']) ? intval($_POST['assignee_id']) : null;

        $template = safeFetch($pdo, "SELECT * FROM " . TBL_TASK_TEMPLATES . " WHERE id = ? AND tenant_id = ?", [$template_id, $tenant_id]);
        if (!$template) {
            $_SESSION['flash_error'] = "Template not found.";
            header("Location: ?tab=tasks_templates");
            exit;
        }

        $items = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_TEMPLATE_ITEMS . " WHERE template_id = ? AND tenant_id = ?", [$template_id, $tenant_id]);
        if (empty($items)) {
            $_SESSION['flash_error'] = "Template contains no tasks.";
            header("Location: ?tab=tasks_templates");
            exit;
        }

        $stmt_task = $pdo->prepare("INSERT INTO " . TBL_TASKS . " (tenant_id, title, description, category_id, priority, schedule_type, start_date, due_date, due_time, created_by) VALUES (?, ?, ?, ?, ?, 'One-Time', ?, ?, ?, ?)");
        $stmt_assign = $pdo->prepare("INSERT IGNORE INTO " . TBL_TASK_ASSIGNEES . " (tenant_id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)");

        foreach ($items as $item) {
            // Calculate actual due date based on relative offset day
            $due_date = date('Y-m-d', strtotime($start_date . ' + ' . intval($item['relative_day']) . ' days'));
            $stmt_task->execute([
                $tenant_id,
                $item['title'],
                $item['description'],
                $item['category_id'],
                $item['priority'],
                $due_date,
                $due_date,
                $item['due_time'],
                $user_id
            ]);
            $new_task_id = $pdo->lastInsertId();

            // Assign to employee if selected
            if ($assignee_id > 0) {
                $stmt_assign->execute([$tenant_id, $new_task_id, $assignee_id, $user_id]);
            }

            logTaskActivity($pdo, $tenant_id, $new_task_id, $user_id, 'Task Created', null, null, "Generated from template: " . $template['name']);
        }

        $_SESSION['flash_msg'] = "Template successfully applied. Tasks generated.";
        header("Location: ?tab=tasks_all");
        exit;
    }
}

// GET operations
if ($_SERVER['REQUEST_METHOD'] === 'GET' && !empty($action)) {

    // A1. Start Task
    if ($action === 'start_task') {
        $task_id = intval($_GET['id']);
        $task = safeFetch($pdo, "SELECT * FROM " . TBL_TASKS . " WHERE id = ? AND tenant_id = ?", [$task_id, $tenant_id]);
        if ($task) {
            $pdo->prepare("UPDATE " . TBL_TASKS . " SET status = 'In Progress' WHERE id = ? AND tenant_id = ?")->execute([$task_id, $tenant_id]);
            logTaskActivity($pdo, $tenant_id, $task_id, $user_id, 'Status Changed', $task['status'], 'In Progress', "Task started by user.");
            $_SESSION['flash_msg'] = "Task marked In Progress.";
        }
        header("Location: ?tab=tasks_details&id=" . $task_id);
        exit;
    }

    // A2. Delete Task
    if ($action === 'delete_task') {
        if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.delete')) {
            $_SESSION['flash_error'] = "Permission Denied.";
            header("Location: ?tab=tasks_all");
            exit;
        }
        $task_id = intval($_GET['id']);
        $task = safeFetch($pdo, "SELECT * FROM " . TBL_TASKS . " WHERE id = ? AND tenant_id = ?", [$task_id, $tenant_id]);
        if ($task) {
            // Delete related rows first
            $pdo->prepare("DELETE FROM " . TBL_TASKS . " WHERE id = ? AND tenant_id = ?")->execute([$task_id, $tenant_id]);
            $pdo->prepare("DELETE FROM " . TBL_TASK_ASSIGNEES . " WHERE task_id = ? AND tenant_id = ?")->execute([$task_id, $tenant_id]);
            $pdo->prepare("DELETE FROM " . TBL_TASK_ATTACHMENTS . " WHERE task_id = ? AND tenant_id = ?")->execute([$task_id, $tenant_id]);
            $pdo->prepare("DELETE FROM " . TBL_TASK_ACTIVITY_LOGS . " WHERE task_id = ? AND tenant_id = ?")->execute([$task_id, $tenant_id]);
            $pdo->prepare("DELETE FROM " . TBL_TASK_RECURRING_RULES . " WHERE task_id = ? AND tenant_id = ?")->execute([$task_id, $tenant_id]);
            
            $_SESSION['flash_msg'] = "Task deleted successfully.";
        }
        header("Location: ?tab=tasks_all");
        exit;
    }

    // A3. Duplicate Task
    if ($action === 'duplicate_task') {
        $task_id = intval($_GET['id']);
        $task = safeFetch($pdo, "SELECT * FROM " . TBL_TASKS . " WHERE id = ? AND tenant_id = ?", [$task_id, $tenant_id]);
        if ($task) {
            $stmt = $pdo->prepare("INSERT INTO " . TBL_TASKS . " (tenant_id, title, description, category_id, priority, schedule_type, start_date, due_date, due_time, reminder_type, status, created_by) VALUES (?, ?, ?, ?, ?, 'One-Time', ?, ?, ?, ?, 'Pending', ?)");
            $stmt->execute([
                $tenant_id,
                $task['title'] . ' (Copy)',
                $task['description'],
                $task['category_id'],
                $task['priority'],
                date('Y-m-d'),
                $task['due_date'],
                $task['due_time'],
                $task['reminder_type'],
                $user_id
            ]);
            $new_task_id = $pdo->lastInsertId();

            // Duplicate assignees
            $assignees = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_ASSIGNEES . " WHERE task_id = ? AND tenant_id = ?", [$task_id, $tenant_id]);
            if (!empty($assignees)) {
                $stmt_assign = $pdo->prepare("INSERT IGNORE INTO " . TBL_TASK_ASSIGNEES . " (tenant_id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)");
                foreach ($assignees as $assign) {
                    $stmt_assign->execute([$tenant_id, $new_task_id, $assign['user_id'], $user_id]);
                }
            }

            logTaskActivity($pdo, $tenant_id, $new_task_id, $user_id, 'Task Duplicated', null, null, "Duplicated from Task ID: " . $task_id);
            $_SESSION['flash_msg'] = "Task duplicated successfully.";
            header("Location: ?tab=tasks_details&id=" . $new_task_id);
            exit;
        }
        header("Location: ?tab=tasks_all");
        exit;
    }

    // A4. Delete Template
    if ($action === 'delete_template') {
        if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_templates')) {
            $_SESSION['flash_error'] = "Permission Denied.";
            header("Location: ?tab=tasks_templates");
            exit;
        }
        $template_id = intval($_GET['id']);
        $template = safeFetch($pdo, "SELECT * FROM " . TBL_TASK_TEMPLATES . " WHERE id = ? AND tenant_id = ?", [$template_id, $tenant_id]);
        if ($template) {
            $pdo->prepare("DELETE FROM " . TBL_TASK_TEMPLATES . " WHERE id = ? AND tenant_id = ?")->execute([$template_id, $tenant_id]);
            $pdo->prepare("DELETE FROM " . TBL_TASK_TEMPLATE_ITEMS . " WHERE template_id = ? AND tenant_id = ?")->execute([$template_id, $tenant_id]);
            $_SESSION['flash_msg'] = "Template deleted successfully.";
        }
        header("Location: ?tab=tasks_templates");
        exit;
    }

    // A5. Delete Category
    if ($action === 'delete_category') {
        if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_categories')) {
            $_SESSION['flash_error'] = "Permission Denied.";
            header("Location: ?tab=tasks_settings");
            exit;
        }
        $cat_id = intval($_GET['id']);
        $cat = safeFetch($pdo, "SELECT * FROM " . TBL_TASK_CATEGORIES . " WHERE id = ? AND tenant_id = ?", [$cat_id, $tenant_id]);
        if ($cat) {
            $pdo->prepare("DELETE FROM " . TBL_TASK_CATEGORIES . " WHERE id = ? AND tenant_id = ?")->execute([$cat_id, $tenant_id]);
            $_SESSION['flash_msg'] = "Category deleted successfully.";
        }
        header("Location: ?tab=tasks_settings");
        exit;
    }

    // A6. Toggle Recurring Rule status
    if ($action === 'toggle_recurring') {
        if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.manage_recurring')) {
            $_SESSION['flash_error'] = "Permission Denied.";
            header("Location: ?tab=tasks_recurring");
            exit;
        }
        $rule_id = intval($_GET['id']);
        $rule = safeFetch($pdo, "SELECT * FROM " . TBL_TASK_RECURRING_RULES . " WHERE id = ? AND tenant_id = ?", [$rule_id, $tenant_id]);
        if ($rule) {
            $new_status = $rule['is_active'] ? 0 : 1;
            $pdo->prepare("UPDATE " . TBL_TASK_RECURRING_RULES . " SET is_active = ? WHERE id = ? AND tenant_id = ?")->execute([$new_status, $rule_id, $tenant_id]);
            $_SESSION['flash_msg'] = "Recurring rule status toggled.";
        }
        header("Location: ?tab=tasks_recurring");
        exit;
    }
}
