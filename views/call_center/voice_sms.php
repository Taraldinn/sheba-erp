<?php
// views/call_center/voice_sms.php
if (!isLoggedIn()) exit;

$staff_id = $_SESSION['admin_id'] ?? 0;
$current_role = $_SESSION['user_role'] ?? 'Staff';
$managed_ids = getManagedStaffIds($pdo, $staff_id, $current_role);

if ($managed_ids !== 'ALL' && empty($managed_ids)) {
    $managed_ids = [$staff_id];
}

$tenant_id = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
$owner_id = get_store_owner_id();

// Strict permission: Only Admin or Reseller can manage campaigns
if (!hasRole('Admin') && strcasecmp($current_role, 'Reseller') !== 0) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. Only Tenant Owners or Administrators can manage campaigns.</div></div>";
    exit;
}

// 1. Process Actions (Retry Failed / Clear Queue)
if (isset($_GET['action_cmd'])) {
    $cmd = trim($_GET['action_cmd']);
    
    if ($cmd === 'retry_failed') {
        if (hasRole('Admin')) {
            $pdo->prepare("UPDATE voice_sms_queue SET status='Pending', attempts=0 WHERE status='Failed' AND tenant_id=?")->execute([$tenant_id]);
        } else {
            $pdo->prepare("UPDATE voice_sms_queue SET status='Pending', attempts=0 WHERE status='Failed' AND tenant_id=? AND staff_id=?")->execute([$tenant_id, $owner_id]);
        }
        $_SESSION['flash_msg'] = "Failed voice queue records have been reset to Pending status successfully!";
    } elseif ($cmd === 'clear_pending') {
        if (hasRole('Admin')) {
            $pdo->prepare("DELETE FROM voice_sms_queue WHERE status='Pending' AND tenant_id=?")->execute([$tenant_id]);
        } else {
            $pdo->prepare("DELETE FROM voice_sms_queue WHERE status='Pending' AND tenant_id=? AND staff_id=?")->execute([$tenant_id, $owner_id]);
        }
        $_SESSION['flash_msg'] = "Pending voice queues cleared successfully.";
    }
    header("Location: index.php?tab=voice_sms");
    exit;
}

// 2. Fetch templates for dropdown selection
if (hasRole('Admin')) {
    $templates = safeFetchAll($pdo, "SELECT id, name, type FROM voice_templates ORDER BY name ASC");
} else {
    $templates = safeFetchAll($pdo, "SELECT id, name, type FROM voice_templates WHERE staff_id = ? ORDER BY name ASC", [$owner_id]);
}

// 3. Fetch Voice SMS Queue list
$sql_q = "SELECT q.*, u.name as customer_name, t.name as template_name 
          FROM voice_sms_queue q 
          JOIN " . TBL_USERS . " u ON q.customer_id = u.id 
          LEFT JOIN voice_templates t ON q.template_id = t.id 
          WHERE 1=1";
$params_q = [];

if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $sql_q .= " AND u.manager_id IN ($placeholders)";
    $params_q = $managed_ids;
}

$sql_q .= " ORDER BY q.id DESC LIMIT 100"; // Show last 100 queue entries for performance
$queue_items = safeFetchAll($pdo, $sql_q, $params_q);

// 4. Fetch Statistics for Campaign Progress
$total_queued = 0;
$total_pending = 0;
$total_sent = 0;
$total_failed = 0;

if ($managed_ids === 'ALL') {
    $stats = safeFetchAll($pdo, "SELECT status, COUNT(*) as cnt FROM voice_sms_queue GROUP BY status");
} else {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $stats = safeFetchAll($pdo, "SELECT q.status, COUNT(*) as cnt FROM voice_sms_queue q JOIN " . TBL_USERS . " u ON q.customer_id=u.id WHERE u.manager_id IN ($placeholders) GROUP BY q.status", $managed_ids);
}

foreach ($stats as $st) {
    $count = intval($st['cnt']);
    $total_queued += $count;
    if ($st['status'] === 'Pending' || $st['status'] === 'Sending') $total_pending += $count;
    if ($st['status'] === 'Sent') $total_sent += $count;
    if ($st['status'] === 'Failed') $total_failed += $count;
}
?>

<!-- Widgets Stats Dashboard -->
<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Total Queued Campaigns</span>
            <span class="fs-2 fw-bold text-dark"><?= $total_queued ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-info">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Pending Reminders</span>
            <span class="fs-2 fw-bold text-info"><?= $total_pending ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-success">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Broadcasts Dispatched</span>
            <span class="fs-2 fw-bold text-success"><?= $total_sent ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-danger">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Dialing Failures</span>
            <span class="fs-2 fw-bold text-danger"><?= $total_failed ?></span>
        </div>
    </div>
</div>

<div class="row">
    <!-- Queue List -->
    <div class="col-lg-8 mb-4">
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white border-bottom py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-bullhorn text-danger me-2"></i> Voice Broadcast Queue Monitor</h5>
                <div class="d-flex gap-1">
                    <a href="index.php?tab=voice_sms&action_cmd=retry_failed" class="btn btn-xs btn-outline-success rounded-pill px-3 shadow-none fw-bold" onclick="return confirm('Reset all failed queue entries to Pending?');"><i class="fas fa-sync me-1"></i> Retry Failed</a>
                    <a href="index.php?tab=voice_sms&action_cmd=clear_pending" class="btn btn-xs btn-outline-danger rounded-pill px-3 shadow-none fw-bold" onclick="return confirm('Permanently clear all Pending queue entries?');"><i class="fas fa-trash me-1"></i> Clear Pending</a>
                </div>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-hover align-middle mb-0" style="font-size:0.86rem;">
                        <thead class="bg-light text-nowrap sticky-top">
                            <tr>
                                <th class="ps-3">Queue ID</th>
                                <th>Target Client</th>
                                <th>Phone</th>
                                <th>Template Name</th>
                                <th>Scheduled At</th>
                                <th>Attempts</th>
                                <th>Status</th>
                                <th class="pe-3">Error / Status Info</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if(empty($queue_items)): ?>
                                <tr><td colspan="8" class="text-center py-5 text-muted"><i class="fas fa-hourglass fa-2x mb-2 opacity-50"></i><br>Broadcast queue is empty.</td></tr>
                            <?php else: foreach($queue_items as $q): 
                                $status_badge = [
                                    'Pending' => 'danger',
                                    'Sending' => 'info',
                                    'Sent' => 'success',
                                    'Failed' => 'warning',
                                    'Cancelled' => 'secondary'
                                ];
                                $badge = $status_badge[$q['status']] ?? 'light';
                            ?>
                                <tr>
                                    <td class="ps-3 fw-bold font-monospace text-muted">#<?= $q['id'] ?></td>
                                    <td>
                                        <strong class="text-dark"><a href="?view_id=<?= $q['customer_id'] ?>" class="text-decoration-none"><?= htmlspecialchars($q['customer_name']) ?></a></strong>
                                    </td>
                                    <td class="text-nowrap">
                                        <div class="d-inline-flex align-items-center" style="white-space: nowrap;">
                                            <span><?= htmlspecialchars($q['phone']) ?></span>
                                            <button type="button" class="btn btn-xs btn-outline-success py-0 px-1 ms-1 rounded btn-click-to-call animate-beat-global" data-phone="<?= htmlspecialchars($q['phone']) ?>" data-cid="<?= (int)$q['customer_id'] ?>" data-name="<?= htmlspecialchars($q['customer_name']) ?>" title="Call Customer" style="line-height: 1; display: inline-flex; align-items: center; justify-content: center; height: 18px; width: 20px;">
                                                <i class="fas fa-phone-alt" style="font-size: 0.65rem;"></i>
                                            </button>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="badge bg-light text-dark border small"><?= htmlspecialchars($q['template_name'] ?: 'Custom Audio') ?></span>
                                        <small class="text-muted d-block font-monospace" style="font-size:10px;"><?= htmlspecialchars($q['campaign_name']) ?></small>
                                    </td>
                                    <td class="text-nowrap small text-muted"><?= date('d M, h:i A', strtotime($q['scheduled_at'])) ?></td>
                                    <td class="fw-bold font-monospace text-center"><?= $q['attempts'] ?>/<?= $q['max_attempts'] ?></td>
                                    <td>
                                        <span class="badge bg-<?= $badge ?>"><?= $q['status'] ?></span>
                                    </td>
                                    <td class="pe-3 small text-muted text-wrap" style="max-width:200px;">
                                        <?= $q['status'] === 'Sent' ? '<span class="text-success fw-bold">Call Connected successfully.</span>' : htmlspecialchars($q['error_message'] ?: 'Queue waiting for Cron Dispatcher.') ?>
                                    </td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Campaign Scheduler -->
    <div class="col-lg-4">
        <div class="card shadow-sm border-0 sticky-top" style="top:20px;">
            <div class="card-header bg-dark text-white py-3">
                <h5 class="mb-0 fw-bold"><i class="fas fa-plus me-2 text-warning"></i> Run New Voice SMS Campaign</h5>
            </div>
            <div class="card-body p-4">
                <form method="POST" action="controllers/call_center_controller.php">
                    <input type="hidden" name="action" value="create_voice_campaign">
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Campaign/Broadcast Name <span class="text-danger">*</span></label>
                        <input type="text" name="campaign_name" class="form-control rounded-3" placeholder="e.g. Expired Bill Alert Campaign" required>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Target Audience Scope <span class="text-danger">*</span></label>
                        <select name="target" class="form-select rounded-3" required>
                            <option value="expired">Expired Customers Only (Expiration in Past)</option>
                            <option value="due">Due Customers Only (Balance Outstanding > ৳0)</option>
                            <option value="all">All Active Customers (General Notice Broadcast)</option>
                        </select>
                        <small class="text-muted d-block mt-1" style="font-size:11px;">The system automatically checks client payment status before dialing to avoid redundant reminders.</small>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Select Voice Message Template <span class="text-danger">*</span></label>
                        <select name="template_id" class="form-select rounded-3" required>
                            <option value="">-- Choose Template --</option>
                            <?php foreach($templates as $t): ?>
                                <option value="<?= $t['id'] ?>"><?= htmlspecialchars($t['name']) ?> (Type: <?= htmlspecialchars($t['type']) ?>)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Execution Date & Time <span class="text-danger">*</span></label>
                        <input type="datetime-local" name="scheduled_at" class="form-control rounded-3" value="<?= date('Y-m-d\TH:i') ?>" required>
                    </div>
                    
                    <hr class="bg-light">
                    
                    <button type="submit" class="btn btn-dark w-100 rounded-pill py-2 shadow-sm fw-bold"><i class="fas fa-paper-plane me-1"></i> Queue & Schedule Campaign</button>
                </form>
            </div>
        </div>
    </div>
</div>
