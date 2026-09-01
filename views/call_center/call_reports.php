<?php
// views/call_center/call_reports.php
if (!isLoggedIn()) exit;

$staff_id = $_SESSION['admin_id'] ?? 0;
$current_role = $_SESSION['user_role'] ?? 'Staff';
$managed_ids = getManagedStaffIds($pdo, $staff_id, $current_role);

if ($managed_ids !== 'ALL' && empty($managed_ids)) {
    $managed_ids = [$staff_id];
}

$from_date = trim($_GET['from_date'] ?? date('Y-m-d', strtotime('-30 days')));
$to_date = trim($_GET['to_date'] ?? date('Y-m-d'));

$params = [$from_date, $to_date];
$scope_where = "";
if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $scope_where = " AND staff_id IN ($placeholders)";
    $params = array_merge($params, $managed_ids);
}

// 1. Fetch Overview Totals
$sql_overview = "SELECT 
                    COUNT(*) as total_calls,
                    SUM(CASE WHEN call_status = 'Answered' THEN 1 ELSE 0 END) as answered,
                    SUM(CASE WHEN call_status = 'No Answer' THEN 1 ELSE 0 END) as no_answer,
                    SUM(CASE WHEN call_status IN ('Failed', 'Busy', 'Switch Off') THEN 1 ELSE 0 END) as failed_busy,
                    SUM(duration) as total_duration
                 FROM call_logs 
                 WHERE DATE(call_start_time) >= ? AND DATE(call_start_time) <= ? $scope_where";
$overview = safeFetch($pdo, $sql_overview, $params);

$total_calls = intval($overview['total_calls'] ?? 0);
$answered_calls = intval($overview['answered'] ?? 0);
$no_answer_calls = intval($overview['no_answer'] ?? 0);
$failed_calls = intval($overview['failed_busy'] ?? 0);
$total_duration = intval($overview['total_duration'] ?? 0);
$avg_duration = $answered_calls > 0 ? round($total_duration / $answered_calls) : 0;

$answered_percent = $total_calls > 0 ? round(($answered_calls / $total_calls) * 100, 1) : 0;
$no_answer_percent = $total_calls > 0 ? round(($no_answer_calls / $total_calls) * 100, 1) : 0;
$failed_percent = $total_calls > 0 ? round(($failed_calls / $total_calls) * 100, 1) : 0;

// 2. Fetch Staff Performance Summary
$sql_staff = "SELECT 
                staff_name,
                ip_phone_extension,
                COUNT(*) as total_calls,
                SUM(CASE WHEN call_status = 'Answered' THEN 1 ELSE 0 END) as answered,
                SUM(CASE WHEN call_status = 'No Answer' THEN 1 ELSE 0 END) as no_answer,
                SUM(duration) as total_duration
              FROM call_logs 
              WHERE DATE(call_start_time) >= ? AND DATE(call_start_time) <= ? $scope_where
              GROUP BY staff_id, staff_name, ip_phone_extension 
              ORDER BY answered DESC";
$staff_report = safeFetchAll($pdo, $sql_staff, $params);

// 3. Fetch Campaign Broadcast delivery rate
$sql_campaigns = "SELECT 
                    campaign_name,
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'Sent' THEN 1 ELSE 0 END) as sent,
                    SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending
                  FROM voice_sms_queue 
                  WHERE DATE(scheduled_at) >= ? AND DATE(scheduled_at) <= ? $scope_where
                  GROUP BY campaign_name 
                  ORDER BY MAX(scheduled_at) DESC";
$campaigns_report = safeFetchAll($pdo, $sql_campaigns, $params);

// 4. Fetch Daily Call volumes for graph
$sql_daily = "SELECT 
                DATE(call_start_time) as call_date, 
                COUNT(*) as total,
                SUM(CASE WHEN call_status = 'Answered' THEN 1 ELSE 0 END) as answered
              FROM call_logs 
              WHERE DATE(call_start_time) >= ? AND DATE(call_start_time) <= ? $scope_where
              GROUP BY DATE(call_start_time) 
              ORDER BY call_date ASC";
$daily_report = safeFetchAll($pdo, $sql_daily, $params);

$graph_labels = [];
$graph_total = [];
$graph_answered = [];
foreach ($daily_report as $d) {
    $graph_labels[] = date('d M', strtotime($d['call_date']));
    $graph_total[] = intval($d['total']);
    $graph_answered[] = intval($d['answered']);
}
?>

<div class="d-flex justify-content-between align-items-center mb-4 d-print-none">
    <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-print me-2 text-warning"></i> Call Center & Follow-up Analytical Reports</h4>
    <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-success shadow-sm rounded-pill px-3" onclick="exportReportToCSV()"><i class="fas fa-file-csv me-1"></i> Export to CSV</button>
        <button class="btn btn-sm btn-dark shadow-sm rounded-pill px-3" onclick="window.print()"><i class="fas fa-file-pdf me-1"></i> Print / PDF Report</button>
    </div>
</div>

<!-- Filter Bar -->
<div class="card shadow-sm border-0 mb-4 d-print-none">
    <div class="card-body bg-light p-3">
        <form method="GET" class="row g-2 align-items-end">
            <input type="hidden" name="tab" value="call_reports">
            
            <div class="col-md-4 col-sm-6">
                <label class="form-label small fw-bold text-muted mb-1">Start Date</label>
                <input type="date" name="from_date" class="form-control form-control-sm" value="<?= $from_date ?>" required>
            </div>
            
            <div class="col-md-4 col-sm-6">
                <label class="form-label small fw-bold text-muted mb-1">End Date</label>
                <input type="date" name="to_date" class="form-control form-control-sm" value="<?= $to_date ?>" required>
            </div>
            
            <div class="col-md-4">
                <button type="submit" class="btn btn-primary btn-sm w-100 rounded-pill"><i class="fas fa-filter me-1"></i> Filter Analytics Range</button>
            </div>
        </form>
    </div>
</div>

<!-- Statistics Cards -->
<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Total Calls Triggered</span>
            <span class="fs-2 fw-bold text-dark" id="stat_total"><?= $total_calls ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-success">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Answered Rate</span>
            <span class="fs-2 fw-bold text-success" id="stat_answered"><?= $answered_calls ?> <small class="fs-6 text-muted font-normal">(<?= $answered_percent ?>%)</small></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-warning">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Average Call Length</span>
            <span class="fs-2 fw-bold text-warning"><?= $avg_duration ?> <small class="fs-6 text-muted font-normal">sec</small></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-danger">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Unsuccessful Calls</span>
            <span class="fs-2 fw-bold text-danger"><?= $no_answer_calls + $failed_calls ?> <small class="fs-6 text-muted font-normal">(<?= $no_answer_percent + $failed_percent ?>%)</small></span>
        </div>
    </div>
</div>

<!-- Graphical Dashboard charts -->
<div class="row mb-4">
    <div class="col-lg-8 mb-3 mb-lg-0">
        <div class="card border-0 shadow-sm rounded-3 h-100">
            <div class="card-header bg-white py-3 border-bottom-0">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-chart-area text-info me-2"></i> Daily Call Volume Trends</h6>
            </div>
            <div class="card-body" style="height:300px;">
                <canvas id="dailyVolumeChart"></canvas>
            </div>
        </div>
    </div>
    
    <div class="col-lg-4">
        <div class="card border-0 shadow-sm rounded-3 h-100">
            <div class="card-header bg-white py-3 border-bottom-0">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-chart-pie text-success me-2"></i> Call Resolution Ratio</h6>
            </div>
            <div class="card-body d-flex align-items-center justify-content-center" style="height:300px;">
                <canvas id="resolutionRatioChart"></canvas>
            </div>
        </div>
    </div>
</div>

<!-- Detailed Data Tables -->
<div class="row">
    <!-- Staff Performance report -->
    <div class="col-md-6 mb-4">
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white py-3 border-bottom">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-users text-primary me-2"></i> Operator / Staff Performance Report</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0" id="staffReportTable" style="font-size:0.86rem;">
                        <thead class="bg-light text-nowrap">
                            <tr>
                                <th class="ps-3">Staff Name</th>
                                <th>Extension</th>
                                <th>Total Dials</th>
                                <th>Connected</th>
                                <th>Connected %</th>
                                <th class="pe-3">Total Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($staff_report)): ?>
                                <tr><td colspan="6" class="text-center py-4 text-muted">No staff calls recorded.</td></tr>
                            <?php else: foreach($staff_report as $sr): 
                                $c_percent = $sr['total_calls'] > 0 ? round(($sr['answered'] / $sr['total_calls']) * 100, 1) : 0;
                            ?>
                                <tr>
                                    <td class="ps-3 fw-bold text-dark"><?= htmlspecialchars($sr['staff_name'] ?? 'System / Autocall') ?></td>
                                    <td class="font-monospace text-muted"><?= htmlspecialchars($sr['ip_phone_extension'] ?: '100') ?></td>
                                    <td><?= $sr['total_calls'] ?></td>
                                    <td class="text-success fw-bold"><?= $sr['answered'] ?></td>
                                    <td class="fw-bold"><?= $c_percent ?>%</td>
                                    <td class="pe-3 font-monospace"><?= gmdate("H:i:s", $sr['total_duration']) ?></td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Voice SMS Campaigns report -->
    <div class="col-md-6 mb-4">
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white py-3 border-bottom">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-bullhorn text-danger me-2"></i> Voice Campaign Performance Report</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0" id="campaignReportTable" style="font-size:0.86rem;">
                        <thead class="bg-light text-nowrap">
                            <tr>
                                <th class="ps-3">Campaign Name</th>
                                <th>Targets</th>
                                <th>Sent</th>
                                <th>Failed</th>
                                <th>Pending</th>
                                <th class="pe-3">Delivery Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($campaigns_report)): ?>
                                <tr><td colspan="6" class="text-center py-4 text-muted">No campaign broadcast queue found.</td></tr>
                            <?php else: foreach($campaigns_report as $cr): 
                                $del_rate = $cr['total'] > 0 ? round(($cr['sent'] / $cr['total']) * 100, 1) : 0;
                            ?>
                                <tr>
                                    <td class="ps-3 fw-bold text-dark"><?= htmlspecialchars($cr['campaign_name']) ?></td>
                                    <td><?= $cr['total'] ?></td>
                                    <td class="text-success fw-bold"><?= $cr['sent'] ?></td>
                                    <td class="text-danger"><?= $cr['failed'] ?></td>
                                    <td class="text-muted"><?= $cr['pending'] ?></td>
                                    <td class="pe-3 fw-bold text-success"><?= $del_rate ?>%</td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener("DOMContentLoaded", function() {
    
    // Daily Call Volume Chart
    const ctxVol = document.getElementById('dailyVolumeChart').getContext('2d');
    new Chart(ctxVol, {
        type: 'line',
        data: {
            labels: <?= json_encode($graph_labels) ?>,
            datasets: [
                {
                    label: 'Total Dial Attempts',
                    data: <?= json_encode($graph_total) ?>,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.05)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Connected Calls',
                    data: <?= json_encode($graph_answered) ?>,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'Inter' } } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                x: { grid: { display: false } }
            }
        }
    });
    
    // Resolution Ratio Chart
    const ctxRatio = document.getElementById('resolutionRatioChart').getContext('2d');
    new Chart(ctxRatio, {
        type: 'doughnut',
        data: {
            labels: ['Answered', 'No Answer', 'Failed / Busy'],
            datasets: [{
                data: [<?= $answered_calls ?>, <?= $no_answer_calls ?>, <?= $failed_calls ?>],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Inter' } } }
            }
        }
    });
    
});

function exportReportToCSV() {
    let rows = [];
    
    // Header
    rows.push(['Smart Call Center Analytical Report Summary']);
    rows.push(['From Date', '<?= $from_date ?>', 'To Date', '<?= $to_date ?>']);
    rows.push([]);
    
    // Totals
    rows.push(['Overview Metric', 'Volume', 'Percentage']);
    rows.push(['Total Dial Attempts', '<?= $total_calls ?>', '100%']);
    rows.push(['Answered Calls', '<?= $answered_calls ?>', '<?= $answered_percent ?>%']);
    rows.push(['No Answer Calls', '<?= $no_answer_calls ?>', '<?= $no_answer_percent ?>%']);
    rows.push(['Failed or Busy', '<?= $failed_calls ?>', '<?= $failed_percent ?>%']);
    rows.push(['Average Call Duration', '<?= $avg_duration ?> seconds', '-']);
    rows.push([]);
    
    // Staff Performance
    rows.push(['Operator Staff Performance Summary']);
    rows.push(['Staff Name', 'Extension', 'Total Dials', 'Connected', 'Connected %', 'Duration']);
    <?php foreach($staff_report as $sr): 
        $c_percent = $sr['total_calls'] > 0 ? round(($sr['answered'] / $sr['total_calls']) * 100, 1) : 0;
    ?>
        rows.push([
            '<?= addslashes($sr['staff_name']) ?>', 
            '<?= $sr['ip_phone_extension'] ?>', 
            '<?= $sr['total_calls'] ?>', 
            '<?= $sr['answered'] ?>', 
            '<?= $c_percent ?>%', 
            '<?= gmdate("H:i:s", $sr['total_duration']) ?>'
        ]);
    <?php endforeach; ?>
    
    // Generate trigger download
    let csvContent = "data:text/csv;charset=utf-8," 
        + rows.map(e => e.map(val => `"${val}"`).join(",")).join("\n");
        
    let encodedUri = encodeURI(csvContent);
    let link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "call_center_analytical_report_" + "<?= $from_date ?>" + "_to_" + "<?= $to_date ?>" + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
</script>

<style>
@media print {
    .d-print-none { display: none !important; }
    body { background-color: white !important; font-size: 11px; }
    .card { border: 0 !important; box-shadow: none !important; }
    .main-wrapper { margin-left: 0 !important; padding: 0 !important; }
    .main-content { padding: 0 !important; }
    canvas { max-width: 100% !important; height: 200px !important; }
}
</style>
