<?php
// views/call_center/dashboard.php
if (!isLoggedIn()) exit;

$staff_id = $_SESSION['admin_id'] ?? 0;
$current_role = $_SESSION['user_role'] ?? 'Staff';
$managed_ids = getManagedStaffIds($pdo, $staff_id, $current_role);

if ($managed_ids !== 'ALL' && empty($managed_ids)) {
    $managed_ids = [$staff_id];
}

$today_date = date('Y-m-d');
$now_time = date('Y-m-d H:i:s');

$params = [$today_date];
$scope_where = "";
if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $scope_where = " AND c.staff_id IN ($placeholders)";
    $params = array_merge($params, $managed_ids);
}

// 1. Fetch Today's stats
$sql_today = "SELECT 
                COUNT(*) as total_calls,
                SUM(CASE WHEN c.call_status = 'Answered' THEN 1 ELSE 0 END) as answered,
                SUM(CASE WHEN c.call_status = 'No Answer' THEN 1 ELSE 0 END) as no_answer,
                SUM(CASE WHEN c.call_status IN ('Failed', 'Busy', 'Switch Off') THEN 1 ELSE 0 END) as failed
              FROM call_logs c 
              WHERE DATE(c.call_start_time) = ? $scope_where";
$today_stats = safeFetch($pdo, $sql_today, $params);

$total_calls_today = intval($today_stats['total_calls'] ?? 0);
$answered_today = intval($today_stats['answered'] ?? 0);
$no_answer_today = intval($today_stats['no_answer'] ?? 0);
$failed_today = intval($today_stats['failed'] ?? 0);

// 2. Fetch pending follow-ups for staff
$params_fu = [];
$scope_fu = "";
if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $scope_fu = " AND f.staff_id IN ($placeholders)";
    $params_fu = $managed_ids;
}
$stmt_fu = $pdo->prepare("SELECT COUNT(*) FROM customer_followups f WHERE f.status IN ('Pending', 'Call Back Later') $scope_fu");
$stmt_fu->execute($params_fu);
$pending_followups_count = $stmt_fu->fetchColumn();

// 3. Fetch Voice SMS dispatched today
$params_sms = [$today_date];
$scope_sms = "";
if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $scope_sms = " AND staff_id IN ($placeholders)";
    $params_sms = array_merge($params_sms, $managed_ids);
}
$stmt_sms = $pdo->prepare("SELECT COUNT(*) FROM voice_sms_queue WHERE DATE(sent_at) = ? AND status = 'Sent' $scope_sms");
$stmt_sms->execute($params_sms);
$voice_sms_sent_today = $stmt_sms->fetchColumn();

// 4. Fetch expired clients count that still need voice reminders
$params_exp = [$today_date];
$scope_exp = "";
if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $scope_exp = " AND u.manager_id IN ($placeholders)";
    $params_exp = array_merge($params_exp, $managed_ids);
}
$params_exp[] = $today_date; // DATE(created_at) = ? goes last
$stmt_exp = $pdo->prepare("SELECT COUNT(*) FROM " . TBL_USERS . " u WHERE u.current_bill_date < ? AND u.status = 'Active' $scope_exp AND u.id NOT IN (SELECT customer_id FROM voice_sms_queue WHERE DATE(created_at) = ?)");
$stmt_exp->execute($params_exp);
$expired_no_reminder = $stmt_exp->fetchColumn();

// 5. Fetch Operator Performance Ranking today
$sql_rankings = "SELECT 
                    c.staff_name,
                    COUNT(*) as total,
                    SUM(CASE WHEN c.call_status = 'Answered' THEN 1 ELSE 0 END) as answered,
                    SUM(c.duration) as duration
                 FROM call_logs c
                 WHERE DATE(c.call_start_time) = ? $scope_where
                 GROUP BY c.staff_id, c.staff_name 
                 ORDER BY answered DESC, total DESC LIMIT 5";
$rankings = safeFetchAll($pdo, $sql_rankings, $params);

// 6. Fetch Today's Upcoming Follow-ups (limit 5)
$params_up = [];
$scope_up = "";
if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $scope_up = " AND f.staff_id IN ($placeholders)";
    $params_up = $managed_ids;
}
$stmt_up = $pdo->prepare("SELECT f.*, u.name as customer_name, u.phone as customer_phone, u.id as customer_uid 
                 FROM customer_followups f 
                 JOIN " . TBL_USERS . " u ON f.customer_id = u.id 
                 WHERE f.status IN ('Pending', 'Call Back Later') $scope_up
                 ORDER BY f.followup_date ASC LIMIT 5");
$stmt_up->execute($params_up);
$upcoming_followups = $stmt_up->fetchAll();

// 7. Daily expiries count today
$params_exp_today = [$today_date];
$scope_exp_today = "";
if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $scope_exp_today = " AND manager_id IN ($placeholders)";
    $params_exp_today = array_merge($params_exp_today, $managed_ids);
}
$stmt_exp_today = $pdo->prepare("SELECT COUNT(*) FROM " . TBL_USERS . " WHERE current_bill_date = ? $scope_exp_today");
$stmt_exp_today->execute($params_exp_today);
$daily_expiries_today = $stmt_exp_today->fetchColumn();
?>

<!-- Widgets Grid -->
<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Today's Total Calls</span>
            <span class="fs-2 fw-bold text-dark"><?= $total_calls_today ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-success">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Connected Calls</span>
            <span class="fs-2 fw-bold text-success"><?= $answered_today ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-warning">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">No Answer Calls</span>
            <span class="fs-2 fw-bold text-warning"><?= $no_answer_today ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-danger">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Failed Calls</span>
            <span class="fs-2 fw-bold text-danger"><?= $failed_today ?></span>
        </div>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center bg-light">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Pending Follow-ups</span>
            <span class="fs-2 fw-bold text-dark"><?= $pending_followups_count ?></span>
            <a href="?tab=follow_ups" class="small text-primary text-decoration-none mt-1 d-block">Manage Follow-ups <i class="fas fa-arrow-right font-xs"></i></a>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-info">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Voice SMS Sent Today</span>
            <span class="fs-2 fw-bold text-info"><?= $voice_sms_sent_today ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-danger">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Expired Pending Reminder</span>
            <span class="fs-2 fw-bold text-danger"><?= $expired_no_reminder ?></span>
            <a href="?tab=voice_sms" class="small text-danger text-decoration-none mt-1 d-block">Trigger Reminders <i class="fas fa-bullhorn font-xs"></i></a>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-warning">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Daily Expiries Today</span>
            <span class="fs-2 fw-bold text-dark"><?= $daily_expiries_today ?></span>
            <a href="?tab=due" class="small text-warning text-decoration-none mt-1 d-block">View Expiring List <i class="fas fa-exclamation-circle font-xs"></i></a>
        </div>
    </div>
</div>

<div class="row">
    <!-- Today's Upcoming Follow-ups -->
    <div class="col-lg-6 mb-4">
        <div class="card shadow-sm border-0 h-100">
            <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-calendar-check text-warning me-2"></i> Today's Critical Pending Follow-ups</h6>
                <a href="?tab=follow_ups" class="btn btn-xs btn-outline-primary rounded-pill px-3 shadow-none">View All</a>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0" style="font-size:0.85rem;">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Target Time</th>
                                <th>Client</th>
                                <th>Phone</th>
                                <th>Type</th>
                                <th class="pe-3">Call</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if(empty($upcoming_followups)): ?>
                                <tr><td colspan="5" class="text-center py-5 text-muted"><i class="fas fa-check-double fa-2x mb-2 text-success opacity-50"></i><br>Hooray! No pending follow-ups scheduled today.</td></tr>
                            <?php else: foreach($upcoming_followups as $uf): 
                                $formatted_time = date('h:i A', strtotime($uf['followup_date']));
                            ?>
                                <tr>
                                    <td class="ps-3 font-monospace fw-bold text-primary"><i class="far fa-clock me-1"></i><?= $formatted_time ?></td>
                                    <td>
                                        <strong class="text-dark"><a href="?view_id=<?= $uf['customer_id'] ?>" class="text-decoration-none"><?= htmlspecialchars($uf['customer_name']) ?></a></strong>
                                    </td>
                                    <td><?= htmlspecialchars($uf['customer_phone']) ?></td>
                                    <td><span class="badge bg-light text-dark border"><?= $uf['type'] ?></span></td>
                                    <td class="pe-3">
                                        <button type="button" class="btn btn-xs btn-success py-1 px-2 rounded btn-click-to-call animate-beat-global" data-phone="<?= htmlspecialchars($uf['customer_phone']) ?>" data-cid="<?= (int)$uf['customer_id'] ?>" data-name="<?= htmlspecialchars($uf['customer_name']) ?>" title="Call Customer">
                                            <i class="fas fa-phone-alt"></i> Call
                                        </button>
                                    </td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Operator performance ranking -->
    <div class="col-lg-6 mb-4">
        <div class="card shadow-sm border-0 h-100">
            <div class="card-header bg-white border-bottom py-3">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-trophy text-success me-2"></i> Today's Staff / Operator Performance Ranking</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0" style="font-size:0.85rem;">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Rank</th>
                                <th>Operator Name</th>
                                <th>Total Dials</th>
                                <th>Connected calls</th>
                                <th class="pe-3">Cumulative Talk Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($rankings)): ?>
                                <tr><td colspan="5" class="text-center py-5 text-muted"><i class="fas fa-medal fa-2x mb-2 opacity-50"></i><br>No call activities completed today yet.</td></tr>
                            <?php else: $rank = 1; foreach($rankings as $rk): 
                                $badge_color = $rank === 1 ? 'gold' : ($rank === 2 ? 'silver' : ($rank === 3 ? 'bronze' : 'light'));
                                $medal = $rank === 1 ? '🥇' : ($rank === 2 ? '🥈' : ($rank === 3 ? '🥉' : $rank));
                            ?>
                                <tr>
                                    <td class="ps-3 fw-bold fs-6"><?= $medal ?></td>
                                    <td><strong class="text-dark"><?= htmlspecialchars($rk['staff_name']) ?></strong></td>
                                    <td><?= $rk['total'] ?></td>
                                    <td class="text-success fw-bold"><?= $rk['answered'] ?></td>
                                    <td class="pe-3 font-monospace"><?= gmdate("H:i:s", $rk['duration']) ?></td>
                                </tr>
                            <?php $rank++; endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>
