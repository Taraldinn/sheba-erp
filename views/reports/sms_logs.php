<?php
// SMS LOG VIEW
if (!isLoggedIn()) return;

$user_id = $_SESSION['admin_id'];
$role = $_SESSION['user_role'];
$isAdmin = hasRole('Admin') || isOffice();

$from = $_GET['from'] ?? date('Y-m-d', strtotime('-7 days'));
$to = $_GET['to'] ?? date('Y-m-d');
$search = $_GET['search'] ?? '';

// Build Query
$query = "SELECT l.*, s.username as staff_name FROM ".TBL_SMS_LOGS." l 
          LEFT JOIN ".TBL_STAFF." s ON l.staff_id = s.id
          WHERE DATE(l.created_at) BETWEEN ? AND ?";
$params = [$from, $to];

$managed = getManagedStaffIds($pdo, $user_id, $role);
if ($managed !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed), '?'));
    $query .= " AND l.staff_id IN ($placeholders)";
    $params = array_merge($params, $managed);
}

if (!empty($search)) {
    $query .= " AND (l.phone LIKE ? OR l.message LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$query .= " ORDER BY l.id DESC LIMIT 500";
$logs = safeFetchAll($pdo, $query, $params);
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-envelope-open-text me-2 text-primary"></i> SMS Logs</h4>
    <span class="badge bg-light text-dark border"><?= count($logs) ?> Records</span>
</div>

<div class="card mb-4 shadow-sm border-0">
    <div class="card-body">
        <form class="row g-3 align-items-end">
            <input type="hidden" name="tab" value="sms_logs">
            <div class="col-md-3">
                <label class="form-label small fw-bold">From Date</label>
                <input type="date" name="from" class="form-control form-control-sm" value="<?= $from ?>">
            </div>
            <div class="col-md-3">
                <label class="form-label small fw-bold">To Date</label>
                <input type="date" name="to" class="form-control form-control-sm" value="<?= $to ?>">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Search (Phone/Message)</label>
                <input type="text" name="search" class="form-control form-control-sm" value="<?= htmlspecialchars($search) ?>" placeholder="Phone or message content...">
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
                        <th>Sent By</th>
                        <th>Phone</th>
                        <th>Message</th>
                        <th>Status</th>
                        <th>API Response</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($logs)): ?>
                        <tr><td colspan="6" class="text-center py-5 text-muted">No SMS logs found for this period</td></tr>
                    <?php else: foreach($logs as $l): ?>
                        <tr>
                            <td class="ps-3 text-muted small"><i class="far fa-clock me-1"></i> <?= date('d M Y, h:i A', strtotime($l['created_at'])) ?></td>
                            <td class="fw-bold text-primary"><?= $l['staff_name'] ?? 'System' ?></td>
                            <td><span class="badge bg-light text-dark border"><?= $l['phone'] ?></span></td>
                            <td style="max-width: 300px;"><div class="small text-wrap"><?= htmlspecialchars($l['message']) ?></div></td>
                            <td>
                                <span class="badge <?= $l['status'] == 'Sent' ? 'bg-success' : 'bg-danger' ?>">
                                    <?= $l['status'] ?>
                                </span>
                            </td>
                            <td>
                                <?php 
                                    $resp = $l['response'] ?? '';
                                    $decoded = json_decode($resp, true);
                                    
                                    if ($decoded) {
                                        $is_success = false;
                                        $errMsg = '';
                                        
                                        // 1. Check for standard success codes
                                        $code = $decoded['error_code'] ?? ($decoded['code'] ?? ($decoded['response_code'] ?? ''));
                                        if ($code == '1000' || strtolower($code) == 'success' || $code == '202' || $code == '200') {
                                            $is_success = true;
                                        }
                                        
                                        // 2. Check for Automas/Sheba SMS HTTP GET response: {"response": [{"status": 0, ...}]}
                                        if (isset($decoded['response']) && is_array($decoded['response'])) {
                                            $sms_reports = $decoded['response'];
                                            if (isset($sms_reports[0]) && is_array($sms_reports[0])) {
                                                if (isset($sms_reports[0]['status']) && ($sms_reports[0]['status'] === 0 || $sms_reports[0]['status'] === '0')) {
                                                    $is_success = true;
                                                } else {
                                                    $errMsg = $sms_reports[0]['msg'] ?? ($sms_reports[0]['smstext'] ?? 'Status ' . ($sms_reports[0]['status'] ?? ''));
                                                }
                                            }
                                        }
                                        
                                        // 3. Check for Automas/Sheba SMS JSON POST response: [{"status": 0, ...}]
                                        if (is_array($decoded) && isset($decoded[0]) && is_array($decoded[0])) {
                                            if (isset($decoded[0]['status']) && ($decoded[0]['status'] === 0 || $decoded[0]['status'] === '0')) {
                                                $is_success = true;
                                            } else {
                                                $errMsg = $decoded[0]['msg'] ?? ($decoded[0]['smstext'] ?? 'Status ' . ($decoded[0]['status'] ?? ''));
                                            }
                                        }

                                        // 4. Fallback status check
                                        if (isset($decoded['status']) && ($decoded['status'] === 0 || $decoded['status'] === '0')) {
                                            $is_success = true;
                                        }
                                        
                                        if ($is_success) {
                                            echo '<span class="badge rounded-pill fw-bold" style="background-color: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; font-size: 0.75rem;"><i class="fas fa-check-circle me-1"></i>Success</span>';
                                        } else {
                                            if (empty($errMsg)) {
                                                $errMsg = $decoded['error_msg'] ?? ($decoded['message'] ?? $resp);
                                            }
                                            echo '<span class="text-danger small fw-bold" title="'.htmlspecialchars($resp).'"><i class="fas fa-exclamation-circle me-1"></i>'.htmlspecialchars(substr($errMsg, 0, 40)).'</span>';
                                        }
                                    } else {
                                        echo '<div class="small text-muted text-truncate" style="max-width: 150px;" title="'.htmlspecialchars($resp).'">'.htmlspecialchars($resp).'</div>';
                                    }
                                ?>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
