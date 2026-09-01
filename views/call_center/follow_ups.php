<?php
// views/call_center/follow_ups.php
if (!isLoggedIn()) exit;

$staff_id = $_SESSION['admin_id'] ?? 0;
$current_role = $_SESSION['user_role'] ?? 'Staff';
$managed_ids = getManagedStaffIds($pdo, $staff_id, $current_role);

$today_date = date('Y-m-d');
$now_time = date('Y-m-d H:i:s');

// 1. Process Actions (Mark as Done quick action)
if (isset($_GET['done_id'])) {
    $f_id = intval($_GET['done_id']);
    
    // Authorization check
    $ok = false;
    if (hasRole('Admin')) {
        $ok = true;
    } else {
        $cf = safeFetch($pdo, "SELECT staff_id FROM customer_followups WHERE id = ?", [$f_id]);
        if ($cf && in_array((int)$cf['staff_id'], $managed_ids)) {
            $ok = true;
        }
    }
    
    if ($ok) {
        $pdo->prepare("UPDATE customer_followups SET status = 'Done' WHERE id = ?")->execute([$f_id]);
        $_SESSION['flash_msg'] = "Follow-up marked as Completed successfully!";
        header("Location: index.php?tab=follow_ups");
        exit;
    } else {
        $_SESSION['flash_error'] = "Access Denied. You cannot modify this follow-up.";
    }
}

// 2. Fetch Dashboard Widgets Stats
if ($managed_ids === 'ALL') {
    $total_pending = $pdo->query("SELECT COUNT(*) FROM customer_followups WHERE status IN ('Pending', 'Call Back Later')")->fetchColumn();
    $today_pending = $pdo->query("SELECT COUNT(*) FROM customer_followups WHERE status IN ('Pending', 'Call Back Later') AND DATE(followup_date) = '$today_date'")->fetchColumn();
    $overdue = $pdo->query("SELECT COUNT(*) FROM customer_followups WHERE status IN ('Pending', 'Call Back Later') AND followup_date < '$now_time'")->fetchColumn();
    $completed_today = $pdo->query("SELECT COUNT(*) FROM customer_followups WHERE status = 'Done' AND DATE(updated_at) = '$today_date'")->fetchColumn();
} else {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM customer_followups WHERE status IN ('Pending', 'Call Back Later') AND staff_id IN ($placeholders)");
    $stmt->execute($managed_ids);
    $total_pending = $stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM customer_followups WHERE status IN ('Pending', 'Call Back Later') AND DATE(followup_date) = ? AND staff_id IN ($placeholders)");
    $stmt->execute(array_merge([$today_date], $managed_ids));
    $today_pending = $stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM customer_followups WHERE status IN ('Pending', 'Call Back Later') AND followup_date < ? AND staff_id IN ($placeholders)");
    $stmt->execute(array_merge([$now_time], $managed_ids));
    $overdue = $stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM customer_followups WHERE status = 'Done' AND DATE(updated_at) = ? AND staff_id IN ($placeholders)");
    $stmt->execute(array_merge([$today_date], $managed_ids));
    $completed_today = $stmt->fetchColumn();
}

// 3. Build Main Queries
$filter_type = trim($_GET['f_type'] ?? '');
$filter_status = trim($_GET['f_status'] ?? '');
$filter_staff = intval($_GET['f_staff'] ?? 0);
$search = trim($_GET['search'] ?? '');
$from_date = trim($_GET['from_date'] ?? '');
$to_date = trim($_GET['to_date'] ?? '');

$sql = "SELECT f.*, u.name as customer_name, u.phone as customer_phone, u.user_id as customer_uid, s.name as staff_name 
        FROM customer_followups f 
        JOIN " . TBL_USERS . " u ON f.customer_id = u.id 
        JOIN " . TBL_STAFF . " s ON f.staff_id = s.id 
        WHERE 1=1";
$params = [];

if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $sql .= " AND f.staff_id IN ($placeholders)";
    $params = array_merge($params, $managed_ids);
}

if (!empty($filter_type)) {
    $sql .= " AND f.type = ?";
    $params[] = $filter_type;
}
if (!empty($filter_status)) {
    $sql .= " AND f.status = ?";
    $params[] = $filter_status;
}
if ($filter_staff > 0) {
    $sql .= " AND f.staff_id = ?";
    $params[] = $filter_staff;
}
if (!empty($search)) {
    $sql .= " AND (u.name LIKE ? OR u.user_id LIKE ? OR u.phone LIKE ? OR f.note LIKE ?)";
    $s_term = "%$search%";
    $params[] = $s_term;
    $params[] = $s_term;
    $params[] = $s_term;
    $params[] = $s_term;
}
if (!empty($from_date)) {
    $sql .= " AND DATE(f.followup_date) >= ?";
    $params[] = $from_date;
}
if (!empty($to_date)) {
    $sql .= " AND DATE(f.followup_date) <= ?";
    $params[] = $to_date;
}

$sql .= " ORDER BY f.followup_date ASC";
$followups = safeFetchAll($pdo, $sql, $params);

// Fetch all clients for manual log modal dropdown
if ($managed_ids === 'ALL') {
    $all_clients = safeFetchAll($pdo, "SELECT id, name, user_id, phone FROM " . TBL_USERS . " WHERE status='Active' ORDER BY name ASC");
    $all_staff = safeFetchAll($pdo, "SELECT id, name FROM " . TBL_STAFF . " WHERE status='Active' ORDER BY name ASC");
} else {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $all_clients = safeFetchAll($pdo, "SELECT id, name, user_id, phone FROM " . TBL_USERS . " WHERE status='Active' AND manager_id IN ($placeholders) ORDER BY name ASC", $managed_ids);
    $all_staff = safeFetchAll($pdo, "SELECT id, name FROM " . TBL_STAFF . " WHERE status='Active' AND id IN ($placeholders) ORDER BY name ASC", $managed_ids);
}
?>

<!-- Widgets Stats Dashboard -->
<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Total Pending</span>
            <span class="fs-2 fw-bold text-dark"><?= $total_pending ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-primary">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Today Pending</span>
            <span class="fs-2 fw-bold text-primary"><?= $today_pending ?></span>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-danger">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Overdue Alerts</span>
            <span class="fs-2 fw-bold text-danger"><?= $overdue ?></span>
            <?php if ($overdue > 0): ?>
                <span class="badge bg-danger rounded-pill mx-auto mt-1 small" style="width:fit-content; font-size:10px;"><i class="fas fa-exclamation-triangle me-1"></i>Action Required</span>
            <?php endif; ?>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm rounded-3 bg-white p-3 text-center border-start border-4 border-success">
            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Completed Today</span>
            <span class="fs-2 fw-bold text-success"><?= $completed_today ?></span>
        </div>
    </div>
</div>

<!-- Main Workspace -->
<div class="card shadow-sm border-0">
    <div class="card-header bg-white border-bottom py-3 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
        <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-calendar-alt text-warning me-2"></i> Assigned Follow-up Task List</h5>
        <button class="btn btn-sm btn-dark rounded-pill px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#createFollowupModal">
            <i class="fas fa-plus me-1"></i> Log Custom Follow-up
        </button>
    </div>
    
    <!-- Filter bar -->
    <div class="p-3 bg-light border-bottom">
        <form method="GET" class="row g-2 align-items-end">
            <input type="hidden" name="tab" value="follow_ups">
            
            <div class="col-md-2">
                <label class="form-label small fw-bold text-muted mb-1">Follow-up Type</label>
                <select name="f_type" class="form-select form-select-sm submit-on-change">
                    <option value="">All Types</option>
                    <option value="Billing" <?= $filter_type === 'Billing' ? 'selected' : '' ?>>Billing</option>
                    <option value="Expired" <?= $filter_type === 'Expired' ? 'selected' : '' ?>>Expired</option>
                    <option value="Complaint" <?= $filter_type === 'Complaint' ? 'selected' : '' ?>>Complaint</option>
                    <option value="Sales" <?= $filter_type === 'Sales' ? 'selected' : '' ?>>Sales</option>
                    <option value="Package Upgrade" <?= $filter_type === 'Package Upgrade' ? 'selected' : '' ?>>Package Upgrade</option>
                    <option value="New Connection" <?= $filter_type === 'New Connection' ? 'selected' : '' ?>>New Connection</option>
                </select>
            </div>
            
            <div class="col-md-2">
                <label class="form-label small fw-bold text-muted mb-1">Status</label>
                <select name="f_status" class="form-select form-select-sm submit-on-change">
                    <option value="">Any Status</option>
                    <option value="Pending" <?= $filter_status === 'Pending' ? 'selected' : '' ?>>Pending</option>
                    <option value="Call Back Later" <?= $filter_status === 'Call Back Later' ? 'selected' : '' ?>>Call Back Later</option>
                    <option value="Interested" <?= $filter_status === 'Interested' ? 'selected' : '' ?>>Interested</option>
                    <option value="Not Interested" <?= $filter_status === 'Not Interested' ? 'selected' : '' ?>>Not Interested</option>
                    <option value="Done" <?= $filter_status === 'Done' ? 'selected' : '' ?>>Done / Solved</option>
                </select>
            </div>
            
            <?php if(hasRole('Admin') || count($managed_ids) > 1): ?>
            <div class="col-md-2">
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
            
            <div class="col-md-2">
                <label class="form-label small fw-bold text-muted mb-1">Search Customer</label>
                <div class="input-group input-group-sm">
                    <input type="text" name="search" class="form-control" placeholder="Search..." value="<?= htmlspecialchars($search) ?>">
                    <button type="submit" class="btn btn-primary"><i class="fas fa-search"></i></button>
                    <a href="?tab=follow_ups" class="btn btn-light border" title="Clear Filters"><i class="fas fa-times text-danger"></i></a>
                </div>
            </div>
        </form>
    </div>
    
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0" style="font-size:0.88rem;">
                <thead class="bg-light text-nowrap">
                    <tr>
                        <th class="ps-3">Target Date</th>
                        <th>Client Details</th>
                        <th>Phone</th>
                        <th>Type</th>
                        <th>Assigned Staff</th>
                        <th>Latest Remarks / Note</th>
                        <th>Status</th>
                        <th class="pe-3 text-end">Quick Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($followups)): ?>
                        <tr><td colspan="8" class="text-center py-5 text-muted"><i class="fas fa-calendar-times fa-2x mb-2 opacity-50"></i><br>No active follow-up schedules found matching filters.</td></tr>
                    <?php else: foreach($followups as $f): 
                        $is_f_overdue = ($f['status'] !== 'Done' && $f['followup_date'] < $now_time);
                        $formatted_date = date('d M Y, h:i A', strtotime($f['followup_date']));
                    ?>
                        <tr class="<?= $is_f_overdue ? 'bg-danger bg-opacity-10 border-start border-3 border-danger' : '' ?>">
                            <td class="ps-3 text-nowrap">
                                <span class="fw-bold <?= $is_f_overdue ? 'text-danger' : 'text-dark' ?>">
                                    <i class="far fa-clock me-1"></i><?= $formatted_date ?>
                                </span>
                                <?php if ($is_f_overdue): ?>
                                    <span class="badge bg-danger rounded-pill d-block mt-1 small" style="width:fit-content; font-size:9px;">Overdue Alert</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <strong class="text-dark"><a href="?view_id=<?= $f['customer_id'] ?>" class="text-decoration-none"><?= htmlspecialchars($f['customer_name']) ?></a></strong>
                                <small class="text-muted d-block"><?= htmlspecialchars($f['customer_uid']) ?></small>
                            </td>
                            <td class="text-nowrap">
                                <div class="d-inline-flex align-items-center" style="white-space: nowrap;">
                                    <span><?= htmlspecialchars($f['customer_phone']) ?></span>
                                    <button type="button" class="btn btn-xs btn-outline-success py-0 px-1 ms-1 rounded btn-click-to-call animate-beat-global" data-phone="<?= htmlspecialchars($f['customer_phone']) ?>" data-cid="<?= (int)$f['customer_id'] ?>" data-name="<?= htmlspecialchars($f['customer_name']) ?>" title="Call Customer" style="line-height: 1; display: inline-flex; align-items: center; justify-content: center; height: 18px; width: 20px;">
                                        <i class="fas fa-phone-alt" style="font-size: 0.65rem;"></i>
                                    </button>
                                </div>
                            </td>
                            <td>
                                <span class="badge bg-light text-dark border fw-bold"><?= $f['type'] ?></span>
                            </td>
                            <td class="small"><?= htmlspecialchars($f['staff_name']) ?></td>
                            <td class="text-wrap" style="max-width:300px;">
                                <span class="text-muted">"<?= htmlspecialchars($f['note']) ?>"</span>
                            </td>
                            <td>
                                <?php if ($f['status'] === 'Done'): ?>
                                    <span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Completed</span>
                                <?php elseif ($f['status'] === 'Call Back Later'): ?>
                                    <span class="badge bg-warning text-dark"><i class="fas fa-undo me-1"></i>Call Back</span>
                                <?php elseif ($f['status'] === 'Interested'): ?>
                                    <span class="badge bg-info"><i class="far fa-star me-1"></i>Interested</span>
                                <?php elseif ($f['status'] === 'Not Interested'): ?>
                                    <span class="badge bg-secondary"><i class="fas fa-ban me-1"></i>Not Interested</span>
                                <?php else: ?>
                                    <span class="badge bg-danger"><i class="far fa-clock me-1"></i>Pending</span>
                                <?php endif; ?>
                            </td>
                            <td class="pe-3 text-end text-nowrap">
                                <a href="?view_id=<?= $f['customer_id'] ?>" class="btn btn-xs btn-light border" title="Customer Details"><i class="fas fa-eye text-primary"></i> Profile</a>
                                
                                <?php if ($f['status'] !== 'Done'): ?>
                                    <a href="index.php?tab=follow_ups&done_id=<?= $f['id'] ?>" class="btn btn-xs btn-light border text-success ms-1" onclick="return confirm('Are you sure you want to mark this follow-up as solved and completed?');" title="Mark Done"><i class="fas fa-check"></i> Done</a>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Create Custom Follow-up Modal -->
<div class="modal fade" id="createFollowupModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" action="controllers/call_center_controller.php" class="modal-content border-0 shadow-lg rounded-3">
            <input type="hidden" name="action" value="add_followup">
            
            <div class="modal-header bg-dark text-white border-0 py-3">
                <h5 class="modal-title fw-bold"><i class="fas fa-calendar-plus me-2 text-warning"></i> Log Custom Follow-up</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">Select Target Customer <span class="text-danger">*</span></label>
                    <select name="customer_id" class="form-select rounded-3 select2-followups" style="width: 100%;" required>
                        <option value="">-- Choose Client --</option>
                        <?php foreach($all_clients as $cl): ?>
                            <option value="<?= $cl['id'] ?>"><?= htmlspecialchars($cl['name']) ?> (<?= htmlspecialchars($cl['user_id']) ?>) - <?= htmlspecialchars($cl['phone']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">Follow-up Type <span class="text-danger">*</span></label>
                    <select name="type" class="form-select rounded-3" required>
                        <option value="Billing">Billing & Outstanding</option>
                        <option value="Expired">Expired package reminder</option>
                        <option value="Complaint">Complaint / Support follow-up</option>
                        <option value="Sales">Sales Lead follow-up</option>
                        <option value="Package Upgrade">Package Upgrade offer</option>
                        <option value="New Connection">New Connection survey</option>
                    </select>
                </div>
                
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">Status <span class="text-danger">*</span></label>
                    <select name="status" class="form-select rounded-3" required>
                        <option value="Pending">Pending (Requires call back)</option>
                        <option value="Call Back Later">Call Back Later</option>
                        <option value="Interested">Interested</option>
                        <option value="Not Interested">Not Interested</option>
                        <option value="Done">Done / Solved</option>
                    </select>
                </div>
                
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">Follow-up Date & Time <span class="text-danger">*</span></label>
                    <input type="datetime-local" name="followup_date" class="form-control rounded-3" value="<?= date('Y-m-d\TH:i') ?>" required>
                </div>
                
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">Staff Remark / Conversation Details <span class="text-danger">*</span></label>
                    <textarea name="note" class="form-control rounded-3" rows="3" placeholder="e.g. Discussed package details. Client asked to call back next Monday." required></textarea>
                </div>
            </div>
            <div class="modal-footer bg-light border-0 py-3">
                <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-dark rounded-pill px-4 shadow-sm fw-bold">Save Schedule</button>
            </div>
        </form>
    </div>
</div>

<script>
document.addEventListener("DOMContentLoaded", function() {
    // Submit form on filter change (for CSP compatibility)
    document.querySelectorAll('.submit-on-change').forEach(el => {
        el.addEventListener('change', function() {
            this.form.submit();
        });
    });

    // Initialize Select2 search for customer inside the modal
    if (typeof jQuery !== 'undefined' && jQuery.fn.select2) {
        jQuery('.select2-followups').select2({
            dropdownParent: jQuery('#createFollowupModal'),
            theme: 'bootstrap-5',
            placeholder: 'Search customer name or ID...'
        });
    }
});
</script>
