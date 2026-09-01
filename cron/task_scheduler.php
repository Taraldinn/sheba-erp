<?php
/**
 * cron/task_scheduler.php
 * Automated worker to generate recurring task instances under strict tenant scope.
 * 
 * Run this via Master Cron:
 * php cron/task_scheduler.php
 */

// Parse tenant override
if (isset($argv)) {
    foreach ($argv as $arg) {
        if (strpos($arg, '--tenant=') === 0) {
            $tenant = substr($arg, 9);
            define('TENANT_OVERRIDE', $tenant);
            break;
        }
    }
}

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

$tenant_key = defined('TENANT_OVERRIDE') ? TENANT_OVERRIDE : (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');

echo "[" . date('Y-m-d H:i:s') . "] Starting Task Scheduler for tenant: $tenant_key\n";

// Concurrency lock
$lock_file = sys_get_temp_dir() . '/sheba_task_scheduler_' . md5($tenant_key) . '.lock';
$lock_fp = fopen($lock_file, 'w+');
if (!$lock_fp || !flock($lock_fp, LOCK_EX | LOCK_NB)) {
    echo "[" . date('Y-m-d H:i:s') . "] Another instance is already running. Exiting.\n";
    exit;
}

try {
    // 1. Fetch active recurring rules that are due to execute
    $rules = safeFetchAll($pdo, "
        SELECT r.*, t.due_time, t.title 
        FROM " . TBL_TASK_RECURRING_RULES . " r
        JOIN " . TBL_TASKS . " t ON r.task_id = t.id
        WHERE r.tenant_id = ? AND r.is_active = 1 AND r.next_run_at <= NOW()
    ", [$tenant_key]);

    if (empty($rules)) {
        echo "No recurring rules due at this time.\n";
    }

    foreach ($rules as $r) {
        echo "Processing rule ID: {$r['id']} for task: '{$r['title']}'\n";

        $pdo->beginTransaction();

        $target_run_time = new DateTime($r['next_run_at']);
        $due_date_str = $target_run_time->format('Y-m-d');

        // 2. Exact-once check: verify if the occurrence for this date was already created
        $dup_check = safeFetch($pdo, "
            SELECT COUNT(*) as count 
            FROM " . TBL_TASKS . " 
            WHERE tenant_id = ? AND parent_recurring_task_id = ? AND due_date = ?
        ", [$tenant_key, $r['task_id'], $due_date_str])['count'] ?? 0;

        if ($dup_check > 0) {
            echo "Warning: Task instance for date $due_date_str was already created. Skipping generation to prevent duplication.\n";
        } else {
            // Fetch original task details
            $parent = safeFetch($pdo, "SELECT * FROM " . TBL_TASKS . " WHERE id = ? AND tenant_id = ?", [$r['task_id'], $tenant_key]);
            if ($parent) {
                // Insert new task occurrence
                $stmt = $pdo->prepare("
                    INSERT INTO " . TBL_TASKS . " (
                        tenant_id, title, description, category_id, priority, 
                        schedule_type, start_date, due_date, due_time, status, 
                        created_by, parent_recurring_task_id, recurring_rule_id, reminder_type
                    ) VALUES (?, ?, ?, ?, ?, 'One-Time', ?, ?, ?, 'Pending', ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $tenant_key,
                    $parent['title'],
                    $parent['description'],
                    $parent['category_id'],
                    $parent['priority'],
                    $due_date_str,
                    $due_date_str,
                    $parent['due_time'],
                    $parent['created_by'],
                    $parent['id'],
                    $r['id'],
                    $parent['reminder_type']
                ]);
                $new_task_id = $pdo->lastInsertId();

                // Copy assignees
                $assignees = safeFetchAll($pdo, "SELECT user_id, assigned_by FROM " . TBL_TASK_ASSIGNEES . " WHERE task_id = ? AND tenant_id = ?", [$parent['id'], $tenant_key]);
                if (!empty($assignees)) {
                    $stmt_assign = $pdo->prepare("INSERT IGNORE INTO " . TBL_TASK_ASSIGNEES . " (tenant_id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)");
                    foreach ($assignees as $assign) {
                        $stmt_assign->execute([$tenant_key, $new_task_id, $assign['user_id'], $assign['assigned_by']]);
                    }
                }

                // Log task creation activity
                $stmt_log = $pdo->prepare("
                    INSERT INTO " . TBL_TASK_ACTIVITY_LOGS . " (tenant_id, task_id, user_id, action, note) 
                    VALUES (?, ?, 0, 'Task Created', 'Generated automatically by Recurring Scheduler.')
                ");
                $stmt_log->execute([$tenant_key, $new_task_id]);

                echo "Successfully generated task ID: $new_task_id for due date: $due_date_str\n";
            }
        }

        // 3. Calculate next occurrence next_run_at
        $next_run = clone $target_run_time;
        if ($r['recurrence_type'] === 'Daily') {
            $next_run->modify('+1 day');
        } elseif ($r['recurrence_type'] === 'Weekly') {
            $next_run->modify('+1 week');
        } elseif ($r['recurrence_type'] === 'Monthly') {
            $next_run->modify('+1 month');
        } else {
            $next_run->modify('+1 day');
        }

        // Update rule run parameters
        $stmt_update = $pdo->prepare("
            UPDATE " . TBL_TASK_RECURRING_RULES . " 
            SET last_run_at = NOW(), next_run_at = ? 
            WHERE id = ? AND tenant_id = ?
        ");
        $stmt_update->execute([$next_run->format('Y-m-d H:i:s'), $r['id'], $tenant_key]);

        $pdo->commit();
    }
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "ERROR in Scheduler: " . $e->getMessage() . "\n";
}

echo "[" . date('Y-m-d H:i:s') . "] Task Scheduler execution completed.\n";
flock($lock_fp, LOCK_UN);
fclose($lock_fp);
unlink($lock_file);
?>
