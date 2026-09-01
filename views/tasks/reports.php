<?php
/**
 * views/tasks/reports.php
 * Task completion rate reports, stats, and staff-wise performance tables under tenant isolation.
 */

$tenant_id = $_SESSION['tenant_id'] ?? (defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main');
$user_id = $_SESSION['admin_id'] ?? 0;
$today_str = date('Y-m-d');
$now_time = date('H:i:s');

if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('task.view_reports')) {
    echo "<div class='container mt-4'><div class='alert alert-danger'>Access Denied. You do not have permission to view task reports.</div></div>";
    return;
}

// Filter variables
$f_date_start = $_GET['f_date_start'] ?? date('Y-m-01'); // Default to start of current month
$f_date_end = $_GET['f_date_end'] ?? date('Y-m-t');     // Default to end of current month
$f_category = !empty($_GET['f_category']) ? intval($_GET['f_category']) : '';

// 1. Build base where condition for tasks
$where_clauses = ["t.tenant_id = ?", "t.due_date BETWEEN ? AND ?"];
$params = [$tenant_id, $f_date_start, $f_date_end];

if ($f_category !== '') {
    $where_clauses[] = "t.category_id = ?";
    $params[] = $f_category;
}

$where_str = implode(" AND ", $where_clauses);

// 2. Fetch overall counts
$stats = safeFetch($pdo, "
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status NOT IN ('Completed', 'Cancelled') AND (due_date < ? OR (due_date = ? AND due_time < ?)) THEN 1 ELSE 0 END) as overdue
    FROM " . TBL_TASKS . " t
    WHERE $where_str
", array_merge([$today_str, $today_str, $now_time], $params));

$total = intval($stats['total'] ?? 0);
$completed = intval($stats['completed'] ?? 0);
$pending = intval($stats['pending'] ?? 0);
$in_progress = intval($stats['in_progress'] ?? 0);
$overdue = intval($stats['overdue'] ?? 0);

$completion_rate = $total > 0 ? round(($completed / $total) * 100) : 0;

// Average Completion Time (in hours)
$avg_completion = safeFetch($pdo, "
    SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, completed_at)) as avg_hours
    FROM " . TBL_TASKS . " t
    WHERE $where_str AND status = 'Completed' AND completed_at IS NOT NULL
", $params)['avg_hours'] ?? 0;

$avg_completion_text = $avg_completion > 0 ? round($avg_completion, 1) . " Hours" : "N/A";

// 3. Fetch staff performance list
// We will load all active staff, and for each query their statistics within the period
$staff_performance = [];
$staff_list = safeFetchAll($pdo, "SELECT id, name, role FROM " . TBL_STAFF . " WHERE status = 'Active' ORDER BY name ASC");

foreach ($staff_list as $st) {
    // Check how many tasks assigned to this staff member
    $st_stats = safeFetch($pdo, "
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN t.status NOT IN ('Completed', 'Cancelled') AND (t.due_date < ? OR (t.due_date = ? AND t.due_time < ?)) THEN 1 ELSE 0 END) as overdue
        FROM " . TBL_TASKS . " t
        JOIN " . TBL_TASK_ASSIGNEES . " ta ON t.id = ta.task_id AND ta.tenant_id = t.tenant_id
        WHERE $where_str AND ta.user_id = ?
    ", array_merge([$today_str, $today_str, $now_time], $params, [$st['id']]));
    
    $st_total = intval($st_stats['total'] ?? 0);
    if ($st_total > 0) {
        $st_completed = intval($st_stats['completed'] ?? 0);
        $st_overdue = intval($st_stats['overdue'] ?? 0);
        $st_rate = round(($st_completed / $st_total) * 100);
        
        $staff_performance[] = [
            'name' => $st['name'],
            'role' => $st['role'],
            'total' => $st_total,
            'completed' => $st_completed,
            'overdue' => $st_overdue,
            'rate' => $st_rate
        ];
    }
}

// Fetch categories for filters
$categories = safeFetchAll($pdo, "SELECT * FROM " . TBL_TASK_CATEGORIES . " WHERE tenant_id = ? AND status = 'Active' ORDER BY name ASC", [$tenant_id]);
?>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-chart-line text-primary me-2"></i> Task Reports & Analytics</h4>
    </div>

    <!-- Filters Panel -->
    <div class="card border-0 shadow-sm rounded-4 mb-4">
        <div class="card-body p-3">
            <form method="GET" action="" class="row g-2 align-items-center">
                <input type="hidden" name="tab" value="tasks_reports">

                <div class="col-12 col-sm-3 d-flex align-items-center gap-2">
                    <span class="text-muted small">From:</span>
                    <input type="date" name="f_date_start" class="form-control form-control-sm border-secondary-subtle" value="<?= htmlspecialchars($f_date_start) ?>" required>
                </div>

                <div class="col-12 col-sm-3 d-flex align-items-center gap-2">
                    <span class="text-muted small">To:</span>
                    <input type="date" name="f_date_end" class="form-control form-control-sm border-secondary-subtle" value="<?= htmlspecialchars($f_date_end) ?>" required>
                </div>

                <div class="col-12 col-sm-3">
                    <select name="f_category" class="form-select form-select-sm border-secondary-subtle">
                        <option value="">All Categories</option>
                        <?php foreach($categories as $c): ?>
                            <option value="<?= $c['id'] ?>" <?= $f_category === $c['id'] ? 'selected' : '' ?>><?= htmlspecialchars($c['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="col-12 col-sm-auto ms-auto d-flex gap-2">
                    <button type="submit" class="btn btn-sm btn-primary px-4 rounded-pill">Generate Report</button>
                    <a href="?tab=tasks_reports" class="btn btn-sm btn-light border px-3 rounded-pill text-dark">Reset</a>
                </div>
            </form>
        </div>
    </div>

    <!-- Summary Metrics Row -->
    <div class="row g-3 mb-4">
        <div class="col-6 col-md-4 col-xl-2.4" style="flex: 1 1 20%;">
            <div class="card border-0 shadow-sm rounded-4 p-3 bg-white text-center">
                <span class="text-muted small d-block mb-1">Total Tasks</span>
                <h2 class="fw-bold mb-0 text-dark"><?= $total ?></h2>
            </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2.4" style="flex: 1 1 20%;">
            <div class="card border-0 shadow-sm rounded-4 p-3 bg-white text-center">
                <span class="text-muted small d-block mb-1">Completed</span>
                <h2 class="fw-bold mb-0 text-success"><?= $completed ?></h2>
            </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2.4" style="flex: 1 1 20%;">
            <div class="card border-0 shadow-sm rounded-4 p-3 bg-white text-center">
                <span class="text-muted small d-block mb-1">Overdue</span>
                <h2 class="fw-bold mb-0 text-danger"><?= $overdue ?></h2>
            </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2.4" style="flex: 1 1 20%;">
            <div class="card border-0 shadow-sm rounded-4 p-3 bg-white text-center">
                <span class="text-muted small d-block mb-1">Completion Rate</span>
                <h2 class="fw-bold mb-0 text-primary"><?= $completion_rate ?>%</h2>
            </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2.4" style="flex: 1 1 20%;">
            <div class="card border-0 shadow-sm rounded-4 p-3 bg-white text-center">
                <span class="text-muted small d-block mb-1">Avg. Resolution Time</span>
                <h2 class="fw-bold mb-0 text-info" style="font-size: 1.5rem; line-height: 2.15rem;"><?= $avg_completion_text ?></h2>
            </div>
        </div>
    </div>

    <!-- Details Card -->
    <div class="row g-4">
        <!-- Staff Performance Table -->
        <div class="col-12 col-xl-8">
            <div class="card border-0 shadow-sm rounded-4 mb-4">
                <div class="card-header bg-white border-bottom-0 py-3">
                    <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-user-friends me-2 text-success"></i> Staff Task Performance</h5>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
                            <thead class="bg-light text-muted">
                                <tr>
                                    <th class="ps-4">Staff Name</th>
                                    <th>Role</th>
                                    <th class="text-center">Assigned Tasks</th>
                                    <th class="text-center text-success">Completed</th>
                                    <th class="text-center text-danger">Overdue</th>
                                    <th class="text-end pe-4">Completion Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($staff_performance)): ?>
                                    <tr><td colspan="6" class="text-center py-5 text-muted"><i class="fas fa-user-slash me-2"></i> No task assignments logged for staff in this period.</td></tr>
                                <?php else: foreach($staff_performance as $sp): ?>
                                    <tr>
                                        <td class="ps-4 fw-bold text-dark"><?= htmlspecialchars($sp['name']) ?></td>
                                        <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($sp['role']) ?></span></td>
                                        <td class="text-center fw-semibold"><?= $sp['total'] ?></td>
                                        <td class="text-center text-success fw-bold"><?= $sp['completed'] ?></td>
                                        <td class="text-center text-danger fw-bold"><?= $sp['overdue'] ?></td>
                                        <td class="text-end pe-4">
                                            <div class="d-flex align-items-center justify-content-end gap-2">
                                                <span class="fw-bold text-primary"><?= $sp['rate'] ?>%</span>
                                                <div class="progress rounded-pill d-none d-sm-flex" style="width: 60px; height: 6px;">
                                                    <div class="progress-bar bg-primary rounded-pill" role="progressbar" style="width: <?= $sp['rate'] ?>%;"></div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                <?php endforeach; endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Task Completion Distribution Chart placeholder/summary -->
        <div class="col-12 col-xl-4">
            <div class="card border-0 shadow-sm rounded-4 h-100 bg-white">
                <div class="card-header bg-white border-bottom-0 py-3">
                    <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-chart-pie me-2 text-info"></i> Task Distribution</h5>
                </div>
                <div class="card-body p-4 text-center">
                    <div class="mb-4" style="max-width: 220px; margin: 0 auto;">
                        <canvas id="taskDistributionChart" width="220" height="220"></canvas>
                    </div>
                    
                    <div class="d-flex justify-content-around text-start small">
                        <div>
                            <span class="d-inline-block rounded-circle bg-success me-1" style="width: 10px; height: 10px;"></span> Completed: <strong class="text-dark"><?= $completed ?></strong>
                        </div>
                        <div>
                            <span class="d-inline-block rounded-circle bg-warning me-1" style="width: 10px; height: 10px;"></span> Pending: <strong class="text-dark"><?= $pending + $in_progress ?></strong>
                        </div>
                        <div>
                            <span class="d-inline-block rounded-circle bg-danger me-1" style="width: 10px; height: 10px;"></span> Overdue: <strong class="text-dark"><?= $overdue ?></strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const ctx = document.getElementById('taskDistributionChart');
    if (ctx) {
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Pending/In Progress', 'Overdue'],
                datasets: [{
                    data: [<?= $completed ?>, <?= $pending + $in_progress ?>, <?= $overdue ?>],
                    backgroundColor: ['#2b8a3e', '#e67e22', '#fa5252'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                cutout: '70%'
            }
        });
    }
});
</script>
