<?php
// ACTIVITY LOG VIEW
if (!isLoggedIn()) return;

$user_id = $_SESSION['admin_id'];
$role = $_SESSION['user_role'];
$isAdmin = hasRole('Admin') || isOffice();
$isSupervisor = hasRole('Supervisor');

// Date Range (Default: Last 7 days, or 30 days if viewing specific target)
$default_days = isset($_GET['target_id']) ? '-30 days' : '-7 days';
$from = $_GET['from'] ?? date('Y-m-d', strtotime($default_days));
$to = $_GET['to'] ?? date('Y-m-d');

// Filters
$target_id = intval($_GET['target_id'] ?? 0);
$type_filter = $_GET['action_type'] ?? '';

// 1. Build Managed IDs for visibility
$managed = getManagedStaffIds($pdo, $user_id, $role);

$is_client_managed = false;
if ($target_id > 0 && is_array($managed)) {
    $client_mgr = safeFetch($pdo, "SELECT manager_id FROM " . TBL_USERS . " WHERE id = ?", [$target_id]);
    if ($client_mgr && in_array($client_mgr['manager_id'], $managed)) {
        $is_client_managed = true;
    }
}

if ($managed === 'ALL') {
    // Admin sees all
    $query = "SELECT l.* FROM ".TBL_LOGS." l WHERE DATE(l.timestamp) BETWEEN ? AND ?";
    $params = [$from, $to];
} elseif ($target_id > 0 && $is_client_managed) {
    // Reseller viewing their own client's activity - sees all logs for this target client
    $query = "SELECT l.* FROM ".TBL_LOGS." l 
              WHERE l.target_id = ? 
              AND DATE(l.timestamp) BETWEEN ? AND ?";
    $params = [$target_id, $from, $to];
    $target_id = 0; // prevent appending target_id constraint again later
} else {
    // Reseller/Sub-reseller Filter
    $placeholders = implode(',', array_fill(0, count($managed), '?'));
    // Role-based exclude Admin activity (extra privacy)
    $query = "SELECT l.* FROM ".TBL_LOGS." l 
              WHERE l.staff_id IN ($placeholders) 
              AND l.admin_user NOT IN (SELECT username FROM ".TBL_STAFF." WHERE role IN ('Admin', 'Supervisor'))
              AND DATE(l.timestamp) BETWEEN ? AND ?";
    
    $params = array_merge($managed, [$from, $to]);
}

// Apply extra filters
if ($target_id > 0) {
    if (strpos($query, 'WHERE') !== false) $query .= " AND l.target_id = ?";
    else $query .= " WHERE l.target_id = ?";
    $params[] = $target_id;
}
if ($type_filter === 'Recharge') {
    if (strpos($query, 'WHERE') !== false) $query .= " AND l.action_type IN ('Recharge', 'Add Client', 'Extend Service')";
    else $query .= " WHERE l.action_type IN ('Recharge', 'Add Client', 'Extend Service')";
} elseif ($type_filter !== '') {
    if (strpos($query, 'WHERE') !== false) $query .= " AND l.action_type = ?";
    else $query .= " WHERE l.action_type = ?";
    $params[] = $type_filter;
}

$query .= " ORDER BY l.id DESC";
try {
    $old_err_mode = $pdo->getAttribute(PDO::ATTR_ERRMODE);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $logs = $stmt->fetchAll();
    $pdo->setAttribute(PDO::ATTR_ERRMODE, $old_err_mode);
} catch (Exception $e) {
    if ($isAdmin) $db_error = $e->getMessage();
    $logs = [];
}
?>

<?php if (isset($db_error)): ?>
<div class="alert alert-danger">
    <strong>Admin Debug:</strong> <?= $db_error ?><br>
    <strong>Query:</strong> <?= htmlspecialchars($query) ?><br>
    <?php if (defined('APP_DEBUG') && APP_DEBUG): ?>
        <strong>Params:</strong> <?= htmlspecialchars(print_r($params, true)) ?>
    <?php endif; ?>
</div>
<?php endif; ?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <?php 
        $title = "Panel Activity Log";
        if ($target_id > 0) {
            $t = safeFetch($pdo, "SELECT name, user_id FROM ".TBL_USERS." WHERE id=?", [$target_id]);
            if ($t) {
                if ($type_filter === 'Recharge') $title = "Recharge History: " . $t['name'] . " (" . $t['user_id'] . ")";
                else $title = "Activity Log: " . $t['name'] . " (" . $t['user_id'] . ")";
            }
        } elseif ($type_filter === 'Recharge') {
            $title = "All Recharge History";
        }
    ?>
    <h4 class="mb-0 fw-bold"><i class="fas fa-history me-2 text-primary"></i> <?= $title ?></h4>
    <span class="badge bg-light text-dark border"><?= count($logs) ?> Records</span>
</div>

<div class="card mb-4 shadow-sm border-0">
    <div class="card-body">
        <form class="row g-3 align-items-end">
            <input type="hidden" name="tab" value="activity">
            <?php if ($target_id > 0): ?>
                <input type="hidden" name="target_id" value="<?= $target_id ?>">
            <?php endif; ?>
            <?php if (!empty($type_filter)): ?>
                <input type="hidden" name="action_type" value="<?= htmlspecialchars($type_filter) ?>">
            <?php endif; ?>
            <div class="col-md-3">
                <label class="form-label small fw-bold">From Date</label>
                <input type="date" name="from" class="form-control form-control-sm" value="<?= $from ?>">
            </div>
            <div class="col-md-3">
                <label class="form-label small fw-bold">To Date</label>
                <input type="date" name="to" class="form-control form-control-sm" value="<?= $to ?>">
            </div>
            <div class="col-md-2">
                <button type="submit" class="btn btn-primary btn-sm w-100"><i class="fas fa-filter me-1"></i> Filter</button>
            </div>
        </form>
    </div>
</div>

<div class="card shadow-sm border-0">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3" width="180">Date/Time</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Ref ID</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($logs)): ?>
                        <tr><td colspan="5" class="text-center py-5 text-muted">No activity found for this period</td></tr>
                    <?php else: foreach($logs as $l): ?>
                        <tr>
                            <td class="ps-3 text-muted small"><i class="far fa-clock me-1"></i> <?= date('d M Y, h:i A', strtotime($l['timestamp'])) ?></td>
                            <td class="fw-bold text-primary"><?= $l['admin_user'] ?></td>
                            <td><span class="badge bg-secondary"><?= $l['action_type'] ?></span></td>
                            <td class="small text-muted">#<?= $l['target_id'] ?></td>
                            <td><?= $l['description'] ?></td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
