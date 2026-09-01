<?php
// views/call_center/call_logs.php
if (!isLoggedIn()) exit;

$staff_id = $_SESSION['admin_id'] ?? 0;
$current_role = $_SESSION['user_role'] ?? 'Staff';
$managed_ids = getManagedStaffIds($pdo, $staff_id, $current_role);

$today_date = date('Y-m-d');

// MAIN QUERIES & FILTERS
$filter_status = trim($_GET['f_status'] ?? '');
$filter_staff = intval($_GET['f_staff'] ?? 0);
$filter_type = trim($_GET['f_type'] ?? '');
$search = trim($_GET['search'] ?? '');
$from_date = trim($_GET['from_date'] ?? '');
$to_date = trim($_GET['to_date'] ?? '');

$sql = "SELECT c.*, u.id as u_id, s.name as staff_full_name 
        FROM call_logs c 
        LEFT JOIN " . TBL_USERS . " u ON c.customer_id = u.id 
        LEFT JOIN " . TBL_STAFF . " s ON c.staff_id = s.id 
        WHERE 1=1";
$params = [];

if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $sql .= " AND c.staff_id IN ($placeholders)";
    $params = array_merge($params, $managed_ids);
}

if (!empty($filter_status)) {
    $sql .= " AND c.call_status = ?";
    $params[] = $filter_status;
}
if (!empty($filter_type)) {
    $sql .= " AND c.call_type = ?";
    $params[] = $filter_type;
}
if ($filter_staff > 0) {
    $sql .= " AND c.staff_id = ?";
    $params[] = $filter_staff;
}
if (!empty($search)) {
    $sql .= " AND (c.customer_name LIKE ? OR c.customer_mobile LIKE ? OR c.remarks LIKE ? OR c.ip_phone_extension LIKE ?)";
    $s_term = "%$search%";
    $params[] = $s_term;
    $params[] = $s_term;
    $params[] = $s_term;
    $params[] = $s_term;
}
if (!empty($from_date)) {
    $sql .= " AND DATE(c.call_start_time) >= ?";
    $params[] = $from_date;
}
if (!empty($to_date)) {
    $sql .= " AND DATE(c.call_start_time) <= ?";
    $params[] = $to_date;
}

$sql .= " ORDER BY c.call_start_time DESC LIMIT 200"; // Cap at 200 records for performance
$logs = safeFetchAll($pdo, $sql, $params);

// Fetch all staff for filter dropdown
if ($managed_ids === 'ALL') {
    $all_staff = safeFetchAll($pdo, "SELECT id, name FROM " . TBL_STAFF . " WHERE status='Active' ORDER BY name ASC");
} else {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $all_staff = safeFetchAll($pdo, "SELECT id, name FROM " . TBL_STAFF . " WHERE status='Active' AND id IN ($placeholders) ORDER BY name ASC", $managed_ids);
}

// Formatting helper for duration
function format_call_duration($seconds) {
    if ($seconds <= 0) return '0s';
    $m = floor($seconds / 60);
    $s = $seconds % 60;
    return $m > 0 ? "{$m}m {$s}s" : "{$s}s";
}
?>

<div class="card shadow-sm border-0">
    <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
        <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-list text-primary me-2"></i> Auto Call Center Request Logs</h5>
        <span class="badge bg-light text-muted border shadow-sm">Showing Last 200 Records</span>
    </div>
    
    <!-- Filter bar -->
    <div class="p-3 bg-light border-bottom">
        <form method="GET" class="row g-2 align-items-end">
            <input type="hidden" name="tab" value="call_logs">
            
            <div class="col-md-2 col-sm-6">
                <label class="form-label small fw-bold text-muted mb-1">Call Type</label>
                <select name="f_type" class="form-select form-select-sm submit-on-change">
                    <option value="">All Types</option>
                    <option value="Manual" <?= $filter_type === 'Manual' ? 'selected' : '' ?>>Manual Dial</option>
                    <option value="Auto Reminder" <?= $filter_type === 'Auto Reminder' ? 'selected' : '' ?>>Auto Reminder</option>
                    <option value="Voice Broadcast" <?= $filter_type === 'Voice Broadcast' ? 'selected' : '' ?>>Voice Broadcast</option>
                </select>
            </div>
            
            <div class="col-md-2 col-sm-6">
                <label class="form-label small fw-bold text-muted mb-1">Call Status</label>
                <select name="f_status" class="form-select form-select-sm submit-on-change">
                    <option value="">Any Status</option>
                    <option value="Answered" <?= $filter_status === 'Answered' ? 'selected' : '' ?>>Answered</option>
                    <option value="No Answer" <?= $filter_status === 'No Answer' ? 'selected' : '' ?>>No Answer</option>
                    <option value="Busy" <?= $filter_status === 'Busy' ? 'selected' : '' ?>>Busy</option>
                    <option value="Switch Off" <?= $filter_status === 'Switch Off' ? 'selected' : '' ?>>Switch Off</option>
                    <option value="Failed" <?= $filter_status === 'Failed' ? 'selected' : '' ?>>Failed</option>
                    <option value="Wrong Number" <?= $filter_status === 'Wrong Number' ? 'selected' : '' ?>>Wrong Number</option>
                    <option value="Call Back Later" <?= $filter_status === 'Call Back Later' ? 'selected' : '' ?>>Call Back Later</option>
                    <option value="Interested" <?= $filter_status === 'Interested' ? 'selected' : '' ?>>Interested</option>
                    <option value="Not Interested" <?= $filter_status === 'Not Interested' ? 'selected' : '' ?>>Not Interested</option>
                    <option value="Payment Promised" <?= $filter_status === 'Payment Promised' ? 'selected' : '' ?>>Payment Promised</option>
                    <option value="Complaint Solved" <?= $filter_status === 'Complaint Solved' ? 'selected' : '' ?>>Complaint Solved</option>
                </select>
            </div>
            
            <?php if(hasRole('Admin') || count($managed_ids) > 1): ?>
            <div class="col-md-2 col-sm-6">
                <label class="form-label small fw-bold text-muted mb-1">Assigned Staff</label>
                <select name="f_staff" class="form-select form-select-sm submit-on-change">
                    <option value="0">All Staff</option>
                    <?php foreach($all_staff as $s): ?>
                        <option value="<?= $s['id'] ?>" <?= $filter_staff === (int)$s['id'] ? 'selected' : '' ?>><?= htmlspecialchars($s['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <?php endif; ?>
            
            <div class="col-md-2 col-sm-6">
                <label class="form-label small fw-bold text-muted mb-1">From Date</label>
                <input type="date" name="from_date" class="form-control form-control-sm submit-on-change" value="<?= $from_date ?>">
            </div>
            
            <div class="col-md-2 col-sm-6">
                <label class="form-label small fw-bold text-muted mb-1">To Date</label>
                <input type="date" name="to_date" class="form-control form-control-sm submit-on-change" value="<?= $to_date ?>">
            </div>
            
            <div class="col-md-2 col-sm-6">
                <label class="form-label small fw-bold text-muted mb-1">Search Fields</label>
                <div class="input-group input-group-sm">
                    <input type="text" name="search" class="form-control" placeholder="Search..." value="<?= htmlspecialchars($search) ?>">
                    <button type="submit" class="btn btn-primary"><i class="fas fa-search"></i></button>
                    <a href="?tab=call_logs" class="btn btn-light border" title="Clear Filters"><i class="fas fa-times text-danger"></i></a>
                </div>
            </div>
        </form>
    </div>
    
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0" style="font-size:0.86rem;">
                <thead class="bg-light text-nowrap">
                    <tr>
                        <th class="ps-3">Call Time</th>
                        <th>Customer / Lead</th>
                        <th>Mobile</th>
                        <th>Staff / Ext</th>
                        <th>Type</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Remarks / Conversational notes</th>
                        <th>Recordings</th>
                        <th class="pe-3 text-end">Profile</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($logs)): ?>
                        <tr><td colspan="10" class="text-center py-5 text-muted"><i class="fas fa-phone-slash fa-2x mb-2 opacity-50"></i><br>No call request log records found.</td></tr>
                    <?php else: foreach($logs as $l): 
                        $status_colors = [
                            'Answered' => 'success',
                            'Complaint Solved' => 'success',
                            'Payment Promised' => 'success',
                            'Interested' => 'info',
                            'Call Back Later' => 'warning',
                            'Busy' => 'warning',
                            'No Answer' => 'danger',
                            'Failed' => 'danger',
                            'Wrong Number' => 'danger',
                            'Switch Off' => 'danger',
                            'Not Interested' => 'secondary'
                        ];
                        $badge = $status_colors[$l['call_status']] ?? 'light';
                    ?>
                        <tr>
                            <td class="ps-3 text-nowrap">
                                <span class="fw-semibold text-dark"><i class="far fa-calendar-alt me-1 text-muted"></i><?= date('d M Y, h:i A', strtotime($l['call_start_time'])) ?></span>
                            </td>
                            <td>
                                <?php if($l['customer_id'] > 0): ?>
                                    <strong class="text-dark"><a href="?view_id=<?= $l['customer_id'] ?>" class="text-decoration-none"><?= htmlspecialchars($l['customer_name']) ?></a></strong>
                                    <span class="badge bg-light text-primary border rounded-pill ms-1" style="font-size:9px;">Client</span>
                                <?php else: ?>
                                    <strong class="text-secondary"><?= htmlspecialchars($l['customer_name'] ?: 'Unknown Contact') ?></strong>
                                    <span class="badge bg-light text-secondary border rounded-pill ms-1" style="font-size:9px;">Lead</span>
                                <?php endif; ?>
                            </td>
                            <td class="text-nowrap">
                                <div class="d-inline-flex align-items-center" style="white-space: nowrap;">
                                    <span><?= htmlspecialchars($l['customer_mobile']) ?></span>
                                    <button type="button" class="btn btn-xs btn-outline-success py-0 px-1 ms-1 rounded btn-click-to-call animate-beat-global" data-phone="<?= htmlspecialchars($l['customer_mobile']) ?>" data-cid="<?= (int)$l['customer_id'] ?>" data-name="<?= htmlspecialchars($l['customer_name']) ?>" title="Call Number" style="line-height: 1; display: inline-flex; align-items: center; justify-content: center; height: 18px; width: 20px;">
                                        <i class="fas fa-phone-alt" style="font-size: 0.65rem;"></i>
                                    </button>
                                </div>
                            </td>
                            <td class="small">
                                <strong class="text-dark"><?= htmlspecialchars($l['staff_name']) ?></strong>
                                <span class="text-muted d-block" style="font-size:10px;">Extension: <?= htmlspecialchars($l['ip_phone_extension'] ?: 'N/A') ?></span>
                            </td>
                            <td>
                                <span class="badge bg-light text-dark border font-monospace"><?= $l['call_type'] ?></span>
                            </td>
                            <td class="fw-bold text-dark text-nowrap">
                                <?= format_call_duration($l['duration']) ?>
                            </td>
                            <td>
                                <span class="badge bg-<?= $badge ?>"><?= htmlspecialchars($l['call_status']) ?></span>
                            </td>
                            <td class="text-wrap small text-muted" style="max-width: 250px;">
                                <?= htmlspecialchars($l['remarks'] ?: 'None') ?>
                                <?php if (!empty($l['next_followup_date'])): ?>
                                    <div class="mt-1"><span class="badge bg-light text-warning border" style="font-size:9px;"><i class="fas fa-calendar-day me-1"></i>Next Followup: <?= date('d-m-Y', strtotime($l['next_followup_date'])) ?></span></div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if(!empty($l['recording_url'])): ?>
                                    <audio src="<?= htmlspecialchars($l['recording_url']) ?>" controls style="height: 25px; width: 130px;"></audio>
                                <?php else: ?>
                                    <span class="text-muted italic small"><i class="fas fa-ban me-1 opacity-50"></i>No Rec</span>
                                <?php endif; ?>
                            </td>
                            <td class="pe-3 text-end">
                                <?php if($l['customer_id'] > 0): ?>
                                    <a href="?view_id=<?= $l['customer_id'] ?>" class="btn btn-xs btn-outline-primary rounded"><i class="fas fa-user-circle"></i> Profile</a>
                                <?php else: ?>
                                    <span class="text-muted italic small">N/A</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.submit-on-change').forEach(el => {
        el.addEventListener('change', function() {
            this.form.submit();
        });
    });
});
</script>

