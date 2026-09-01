<?php
/**
 * views/tasks/calendar.php
 * Fully custom, premium responsive calendar view showing tasks by month.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;

// Filter categories & staff
$categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_CATEGORIES . " WHERE tenant_id = ? AND status = 'Active' ORDER BY name ASC", [$tenant_id]);
$staff_list = safeFetchAll($pdo, "SELECT id, name, username, role FROM " . TBL_STAFF . " WHERE status = 'Active' ORDER BY name ASC");

// Parse year and month
$year = isset($_GET['year']) ? intval($_GET['year']) : intval(date('Y'));
$month = isset($_GET['month']) ? intval($_GET['month']) : intval(date('m'));

// Guard month range
if ($month < 1) { $month = 12; $year--; }
if ($month > 12) { $month = 1; $year++; }

// Query filters
$cat_filter = !empty($_GET['f_category']) ? intval($_GET['f_category']) : '';
$staff_filter = !empty($_GET['f_staff']) ? intval($_GET['f_staff']) : '';

// Calculate month details
$first_day_ts = mktime(0, 0, 0, $month, 1, $year);
$days_in_month = date('t', $first_day_ts);
$start_day_of_week = date('w', $first_day_ts); // 0 (Sun) to 6 (Sat)
$month_title = date('F Y', $first_day_ts);

// Boundaries for database fetch
$start_date_bound = "$year-" . sprintf('%02d', $month) . "-01";
$end_date_bound = "$year-" . sprintf('%02d', $month) . "-$days_in_month";

// Fetch tasks for the bounds
$where_clauses = ["t.tenant_id = ?", "t.due_date BETWEEN ? AND ?"];
$params = [$tenant_id, $start_date_bound, $end_date_bound];

if ($cat_filter !== '') {
    $where_clauses[] = "t.category_id = ?";
    $params[] = $cat_filter;
}
if ($staff_filter !== '') {
    $where_clauses[] = "t.id IN (SELECT task_id FROM " . TBL_TASK_ASSIGNEES . " WHERE user_id = ? AND tenant_id = ?)";
    $params[] = $staff_filter;
    $params[] = $tenant_id;
}

$where_str = implode(" AND ", $where_clauses);
$tasks_raw = safeFetchAll($pdo, "SELECT t.*, c.name as category_name FROM " . TBL_TASKS . " t LEFT JOIN " . TBL_TASK_CATEGORIES . " c ON t.category_id = c.id WHERE $where_str", $params);

// Group tasks by date
$tasks_by_date = [];
foreach ($tasks_raw as $t) {
    $tasks_by_date[$t['due_date']][] = $t;
}

// Navigation links
$prev_month = $month - 1;
$prev_year = $year;
if ($prev_month < 1) { $prev_month = 12; $prev_year--; }

$next_month = $month + 1;
$next_year = $year;
if ($next_month > 12) { $next_month = 1; $next_year++; }

function getCalendarPriorityColor($priority) {
    switch ($priority) {
        case 'Low': return '#6c757d';
        case 'Medium': return '#339af0';
        case 'High': return '#fd7e14';
        case 'Urgent': return '#fa5252';
        default: return '#868e96';
    }
}
?>

<style>
.calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-top: 1px solid #dee2e6;
    border-left: 1px solid #dee2e6;
}
.calendar-header-cell {
    background: #f8f9fa;
    padding: 10px;
    font-weight: bold;
    text-align: center;
    border-right: 1px solid #dee2e6;
    border-bottom: 1px solid #dee2e6;
    font-size: 0.85rem;
    color: #495057;
}
.calendar-day-cell {
    background: #fff;
    min-height: 120px;
    padding: 8px;
    border-right: 1px solid #dee2e6;
    border-bottom: 1px solid #dee2e6;
    position: relative;
    transition: background 0.15s ease;
}
.calendar-day-cell:hover {
    background: #f8f9fa;
}
.calendar-day-cell.other-month {
    background: #e9ecef;
    opacity: 0.5;
}
.calendar-day-number {
    font-weight: 700;
    font-size: 0.85rem;
    color: #495057;
    margin-bottom: 6px;
    display: inline-block;
}
.calendar-day-cell.today {
    background: #e8f4fd;
}
.calendar-day-cell.today .calendar-day-number {
    background: #339af0;
    color: #fff;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.calendar-add-btn {
    position: absolute;
    right: 8px;
    top: 8px;
    opacity: 0;
    transition: opacity 0.15s ease;
    text-decoration: none;
    color: #adb5bd;
}
.calendar-day-cell:hover .calendar-add-btn {
    opacity: 1;
}
.calendar-add-btn:hover {
    color: #339af0;
}
.calendar-task-pill {
    display: block;
    font-size: 0.72rem;
    padding: 3px 6px;
    border-radius: 4px;
    color: #fff;
    text-decoration: none;
    margin-bottom: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    transition: filter 0.15s ease;
}
.calendar-task-pill:hover {
    filter: brightness(90%);
    color: #fff;
}
@media (max-width: 768px) {
    .calendar-grid {
        grid-template-columns: 1fr;
    }
    .calendar-header-cell {
        display: none;
    }
    .calendar-day-cell {
        min-height: auto;
        border-left: 1px solid #dee2e6;
    }
}
</style>

<div class="container-fluid">
    <!-- Header Panel -->
    <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div class="d-flex align-items-center gap-3">
            <h4 class="mb-0 fw-bold text-dark"><i class="far fa-calendar-alt me-2 text-primary"></i> Calendar</h4>
            <div class="btn-group btn-group-sm border rounded-pill shadow-sm bg-white p-1">
                <a href="?tab=tasks_calendar&year=<?= $prev_year ?>&month=<?= $prev_month ?>&f_category=<?= $cat_filter ?>&f_staff=<?= $staff_filter ?>" class="btn btn-light rounded-start-pill border-0"><i class="fas fa-chevron-left"></i></a>
                <span class="btn btn-light border-0 fw-bold text-dark disabled"><?= $month_title ?></span>
                <a href="?tab=tasks_calendar&year=<?= $next_year ?>&month=<?= $next_month ?>&f_category=<?= $cat_filter ?>&f_staff=<?= $staff_filter ?>" class="btn btn-light rounded-end-pill border-0"><i class="fas fa-chevron-right"></i></a>
            </div>
            <a href="?tab=tasks_calendar&year=<?= date('Y') ?>&month=<?= date('m') ?>" class="btn btn-sm btn-light border rounded-pill px-3">Today</a>
        </div>
        <div>
            <a href="?tab=tasks_create" class="btn btn-primary rounded-pill px-3 shadow-sm"><i class="fas fa-plus me-1"></i> New Task</a>
        </div>
    </div>

    <!-- Filters Panel -->
    <div class="card border-0 shadow-sm rounded-4 mb-4">
        <div class="card-body p-3">
            <form method="GET" action="" class="row g-2 align-items-center">
                <input type="hidden" name="tab" value="tasks_calendar">
                <input type="hidden" name="year" value="<?= $year ?>">
                <input type="hidden" name="month" value="<?= $month ?>">

                <div class="col-6 col-sm-3">
                    <select name="f_category" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Categories</option>
                        <?php foreach($categories as $c): ?>
                            <option value="<?= $c['id'] ?>" <?= $cat_filter === $c['id'] ? 'selected' : '' ?>><?= htmlspecialchars($c['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="col-6 col-sm-3">
                    <select name="f_staff" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Staff</option>
                        <?php foreach($staff_list as $st): ?>
                            <option value="<?= $st['id'] ?>" <?= $staff_filter === $st['id'] ? 'selected' : '' ?>><?= htmlspecialchars($st['name']) ?> (<?= htmlspecialchars($st['role']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="col-12 col-sm-auto ms-sm-auto d-flex gap-2">
                    <button type="submit" class="btn btn-sm btn-primary px-3 rounded-pill">Filter</button>
                    <a href="?tab=tasks_calendar&year=<?= $year ?>&month=<?= $month ?>" class="btn btn-sm btn-light border px-3 rounded-pill text-dark">Reset</a>
                </div>
            </form>
        </div>
    </div>

    <!-- Calendar Card Grid -->
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden bg-white mb-4">
        <div class="calendar-grid">
            <!-- Headers -->
            <div class="calendar-header-cell text-danger">Sunday</div>
            <div class="calendar-header-cell">Monday</div>
            <div class="calendar-header-cell">Tuesday</div>
            <div class="calendar-header-cell">Wednesday</div>
            <div class="calendar-header-cell">Thursday</div>
            <div class="calendar-header-cell">Friday</div>
            <div class="calendar-header-cell text-success">Saturday</div>

            <?php
            // 1. Render empty cells leading up to start of month
            for ($i = 0; $i < $start_day_of_week; $i++) {
                echo '<div class="calendar-day-cell other-month"></div>';
            }

            // 2. Render actual month days
            for ($day = 1; $day <= $days_in_month; $day++) {
                $cur_date_str = "$year-" . sprintf('%02d', $month) . "-" . sprintf('%02d', $day);
                $is_today = ($cur_date_str === date('Y-m-d'));
                $day_tasks = $tasks_by_date[$cur_date_str] ?? [];
                
                echo '<div class="calendar-day-cell ' . ($is_today ? 'today' : '') . '">';
                echo '<span class="calendar-day-number">' . $day . '</span>';
                
                // Add Quick task button
                echo '<a href="?tab=tasks_create&prefill_date=' . $cur_date_str . '" class="calendar-add-btn" title="Add Task"><i class="fas fa-plus-circle"></i></a>';
                
                // Tasks
                echo '<div class="calendar-tasks-container mt-1">';
                foreach ($day_tasks as $t) {
                    $color = getCalendarPriorityColor($t['priority']);
                    echo '<a href="?tab=tasks_details&id=' . $t['id'] . '" class="calendar-task-pill" style="background-color: ' . $color . ';" title="' . htmlspecialchars($t['title']) . '">';
                    if ($t['due_time']) {
                        echo '<small class="me-1">' . date('h:i A', strtotime($t['due_time'])) . '</small> ';
                    }
                    echo htmlspecialchars($t['title']);
                    echo '</a>';
                }
                echo '</div>'; // End tasks container
                
                echo '</div>'; // End day cell
            }

            // 3. Render trailing cells to fill out grid
            $total_cells_rendered = $start_day_of_week + $days_in_month;
            $cells_remaining = 7 - ($total_cells_rendered % 7);
            if ($cells_remaining < 7) {
                for ($i = 0; $i < $cells_remaining; $i++) {
                    echo '<div class="calendar-day-cell other-month"></div>';
                }
            }
            ?>
        </div>
    </div>
</div>
