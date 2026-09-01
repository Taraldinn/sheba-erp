<?php
// VOICE CALL LOGS VIEW
if (!isLoggedIn()) return;

$user_id = $_SESSION['admin_id'];
$role = $_SESSION['user_role'];
$isAdmin = hasRole('Admin') || isOffice();

$from = $_GET['from'] ?? date('Y-m-d', strtotime('-7 days'));
$to = $_GET['to'] ?? date('Y-m-d');
$search = $_GET['search'] ?? '';
$status_filter = $_GET['status'] ?? '';

// Build Query
$query = "SELECT l.*, s.username as staff_name, u.id as client_db_id FROM ".TBL_VOICE_CALL_LOGS." l 
          LEFT JOIN ".TBL_STAFF." s ON l.manager_id = s.id
          LEFT JOIN ".TBL_USERS." u ON l.user_id = u.user_id
          WHERE DATE(l.created_at) BETWEEN ? AND ?";
$params = [$from, $to];

$managed = getManagedStaffIds($pdo, $user_id, $role);
if ($managed !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed), '?'));
    $query .= " AND l.manager_id IN ($placeholders)";
    $params = array_merge($params, $managed);
}

if (!empty($search)) {
    $query .= " AND (l.phone LIKE ? OR l.user_id LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

if (!empty($status_filter)) {
    $query .= " AND l.status = ?";
    $params[] = $status_filter;
}

$query .= " ORDER BY l.id DESC LIMIT 500";
$logs = safeFetchAll($pdo, $query, $params);
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-phone-alt me-2 text-info"></i> Voice Call Logs</h4>
    <span class="badge bg-light text-dark border"><?= count($logs) ?> Records</span>
</div>

<div class="card mb-4 shadow-sm border-0">
    <div class="card-body">
        <form class="row g-3 align-items-end">
            <input type="hidden" name="tab" value="voice_logs">
            <div class="col-md-2">
                <label class="form-label small fw-bold">From Date</label>
                <input type="date" name="from" class="form-control form-control-sm" value="<?= $from ?>">
            </div>
            <div class="col-md-2">
                <label class="form-label small fw-bold">To Date</label>
                <input type="date" name="to" class="form-control form-control-sm" value="<?= $to ?>">
            </div>
            <div class="col-md-2">
                <label class="form-label small fw-bold">Status</label>
                <select name="status" class="form-select form-select-sm">
                    <option value="">All Statuses</option>
                    <option value="answered" <?= $status_filter === 'answered' ? 'selected' : '' ?>>Answered</option>
                    <option value="not_answered" <?= $status_filter === 'not_answered' ? 'selected' : '' ?>>Not Answered</option>
                    <option value="rejected" <?= $status_filter === 'rejected' ? 'selected' : '' ?>>Rejected</option>
                    <option value="busy" <?= $status_filter === 'busy' ? 'selected' : '' ?>>Busy</option>
                    <option value="failed" <?= $status_filter === 'failed' ? 'selected' : '' ?>>Failed</option>
                    <option value="pending" <?= $status_filter === 'pending' ? 'selected' : '' ?>>Pending</option>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Search (Phone/Client ID)</label>
                <input type="text" name="search" class="form-control form-control-sm" value="<?= htmlspecialchars($search) ?>" placeholder="Phone or User ID...">
            </div>
            <div class="col-md-2">
                <button type="submit" class="btn btn-info text-white btn-sm w-100 fw-bold shadow-sm"><i class="fas fa-filter me-1"></i> Filter</button>
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
                        <th>Dispatcher</th>
                        <th>Client ID</th>
                        <th>Phone</th>
                        <th>Call Type</th>
                        <th>Billing Cycle</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Attempt</th>
                        <th>Error Info</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($logs)): ?>
                        <tr><td colspan="10" class="text-center py-5 text-muted">No voice call logs found for this period</td></tr>
                    <?php else: foreach($logs as $l): ?>
                        <tr>
                            <td class="ps-3 text-muted small"><i class="far fa-clock me-1"></i> <?= date('d M Y, h:i A', strtotime($l['created_at'])) ?></td>
                            <td class="fw-bold text-dark"><?= htmlspecialchars($l['staff_name'] ?? 'System') ?></td>
                            <td>
                                <?php if (!empty($l['client_db_id'])): ?>
                                    <a href="?tab=profile&view_id=<?= htmlspecialchars($l['client_db_id']) ?>" class="fw-bold text-decoration-none">
                                        <?= htmlspecialchars($l['user_id']) ?>
                                    </a>
                                <?php else: ?>
                                    <span class="fw-bold text-muted"><?= htmlspecialchars($l['user_id']) ?></span>
                                <?php endif; ?>
                            </td>
                            <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($l['phone']) ?></span></td>
                            <td>
                                <span class="badge bg-secondary-subtle text-secondary text-uppercase small">
                                    <?= htmlspecialchars($l['reminder_type']) ?>
                                </span>
                            </td>
                            <td><span class="text-muted small"><?= htmlspecialchars($l['billing_cycle_date']) ?></span></td>
                            <td>
                                <?php
                                $status = strtolower($l['status'] ?? 'pending');
                                $badge_class = 'bg-secondary';
                                if ($status === 'answered') $badge_class = 'bg-success';
                                elseif ($status === 'not_answered') $badge_class = 'bg-warning text-dark';
                                elseif ($status === 'rejected') $badge_class = 'bg-warning text-dark';
                                elseif ($status === 'busy') $badge_class = 'bg-info text-white';
                                elseif ($status === 'failed') $badge_class = 'bg-danger';
                                elseif ($status === 'pending') $badge_class = 'bg-dark';
                                ?>
                                <span class="badge <?= $badge_class ?> text-capitalize">
                                    <?= htmlspecialchars($status) ?>
                                </span>
                            </td>
                            <td>
                                <span class="text-muted small font-monospace">
                                    <?= intval($l['duration'] ?? 0) ?> sec
                                </span>
                            </td>
                            <td>
                                <span class="badge bg-light text-muted border">
                                    #<?= intval($l['attempt'] ?? 1) ?>
                                </span>
                            </td>
                            <td class="text-danger small" style="max-width: 200px;">
                                <div class="text-truncate" title="<?= htmlspecialchars($l['error_message'] ?? '') ?>">
                                    <?= htmlspecialchars($l['error_message'] ?? '') ?>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
