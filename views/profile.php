<?php
// PROFILE VIEW
$client_id = intval($_GET['view_id'] ?? 0);
$c = safeFetch($pdo, "SELECT u.*, r.name as r_name FROM ".TBL_USERS." u LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id WHERE u.id=?", [$client_id]);

if (!$c) { echo "<div class='alert alert-danger'>Client not found.</div>"; return; }

// Ensure columns exist or fail silently
try {
    $pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN router_model VARCHAR(100) DEFAULT NULL, ADD COLUMN router_port VARCHAR(20) DEFAULT NULL, ADD COLUMN router_username VARCHAR(100) DEFAULT NULL, ADD COLUMN router_password VARCHAR(100) DEFAULT NULL");
} catch (\Exception $e) {}


$services_query = "SELECT * FROM ".TBL_SERVICES;
if (isset($_SESSION['allowed_packages']) && is_array($_SESSION['allowed_packages']) && !empty($_SESSION['allowed_packages'])) {
    $allowed_ids = implode(',', array_map('intval', $_SESSION['allowed_packages']));
    $services_query .= " WHERE id IN ($allowed_ids)";
}
$services = safeFetchAll($pdo, $services_query);
$offers = safeFetchAll($pdo, "SELECT * FROM ".TBL_OFFERS." WHERE status='Active' AND (staff_id=? OR staff_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id=?))", [$user, $user]);

// Fetch Recharge History
$recharge_history = safeFetchAll($pdo, "SELECT * FROM ".TBL_LOGS." WHERE target_id=? AND action_type IN ('Recharge', 'Add Client', 'Extend Service') ORDER BY timestamp DESC LIMIT 5", [$client_id]);

// Fetch Purchased Products for Store Module
$purchased_products = safeFetchAll($pdo, "
    SELECT s.*, p.name AS product_name, p.serial_mac, p.warranty, p.brand_model, COALESCE(st.name, st.username) AS staff_name
    FROM " . TBL_STORE_SALES . " s
    JOIN " . TBL_STORE_PRODUCTS . " p ON s.product_id = p.id
    LEFT JOIN " . TBL_STAFF . " st ON s.sold_by_staff = st.id
    WHERE s.customer_id = ?
    ORDER BY s.sale_date DESC
", [$client_id]);

// Fetch Active Support Devices (currently issued, i.e., return_date IS NULL)
$active_support_devices = safeFetchAll($pdo, "
    SELECT sd.*, p.name AS product_name, p.serial_mac, p.brand_model, p.warranty,
           COALESCE(st_given.name, st_given.username) AS given_staff
    FROM " . TBL_STORE_SUPPORT . " sd
    JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id
    LEFT JOIN " . TBL_STAFF . " st_given ON sd.given_by_staff = st_given.id
    WHERE sd.customer_id = ? AND sd.return_date IS NULL
    ORDER BY sd.given_date DESC
", [$client_id]);

// Fetch Returned Support Devices (Return History)
$returned_support_devices = safeFetchAll($pdo, "
    SELECT sd.*, p.name AS product_name, p.serial_mac, p.brand_model, p.warranty,
           COALESCE(st_given.name, st_given.username) AS given_staff,
           COALESCE(st_recv.name, st_recv.username) AS received_staff
    FROM " . TBL_STORE_SUPPORT . " sd
    JOIN " . TBL_STORE_PRODUCTS . " p ON sd.product_id = p.id
    LEFT JOIN " . TBL_STAFF . " st_given ON sd.given_by_staff = st_given.id
    LEFT JOIN " . TBL_STAFF . " st_recv ON sd.received_by_staff = st_recv.id
    WHERE sd.customer_id = ? AND sd.return_date IS NOT NULL
    ORDER BY sd.return_date DESC
", [$client_id]);

// Fetch Due Statement
$due_month = $_GET['due_month'] ?? '';
$due_query = "SELECT * FROM ".TBL_LOGS." WHERE target_id=? AND (action_type IN ('Pay Due', 'Collect Expire') OR (action_type='Recharge' AND description LIKE '%(Trx: Due)%') OR (action_type='Quick Change Package' AND description LIKE '%New Due: %') OR (action_type='Edit Client Full' AND description LIKE '%due%'))";
$due_params = [$client_id];

if (!empty($due_month)) {
    $due_query .= " AND DATE_FORMAT(timestamp, '%Y-%m') = ?";
    $due_params[] = $due_month;
}
$due_query .= " ORDER BY timestamp DESC LIMIT 500";
$due_statement = safeFetchAll($pdo, $due_query, $due_params);

// Prepare SMS Log parameters
$clean_phone = preg_replace('/[^0-9]/', '', $c['phone']);
$search_phone1 = $clean_phone;
$search_phone2 = $clean_phone;
if (strlen($clean_phone) > 10) {
    if (strlen($clean_phone) == 11 && substr($clean_phone, 0, 1) == '0') {
        $search_phone1 = '88' . $clean_phone;
    } else {
        $search_phone2 = substr($clean_phone, -11); // Last 11 digits
    }
}
$sms_logs = safeFetchAll($pdo, "SELECT * FROM ".TBL_LOGS." WHERE action_type IN ('SMS Sent', 'SMS Error') AND (description LIKE ? OR description LIKE ?) ORDER BY timestamp DESC LIMIT 100", ["%$search_phone1%", "%$search_phone2%"]);

// Check if online
$is_online = false;
$ip = $c['assigned_ip'] ?? 'N/A';
$mac = $c['onu_mac'] ?? 'N/A';

if ($c['router_id'] > 0) {
    // We skip synchronous MikroTik checks here to avoid page hang.
    // Status and live stats will be loaded via AJAX.
}

// Prorated logic prep
$today = new DateTime();
$bill_date = new DateTime($c['current_bill_date']);
$remaining_days = ($bill_date > $today) ? $today->diff($bill_date)->days : 0;

$original_pkg = $c['user_package'];
$original_price = 0;
foreach ($services as $s) {
    if ($s['name'] === $original_pkg) {
        $original_price = getSellPrice($pdo, $c['manager_id'], $s['id']);
        break;
    }
}
$original_due = floatval($c['due'] ?? 0);

// Promise calculations
$promise_days_used = 0;
$promise_due_amount = 0.00;
if (isset($c['promise_enabled']) && $c['promise_enabled'] == 1 && !empty($c['promise_date'])) {
    $today_str = date('Y-m-d');
    $expire_date_str = $c['current_bill_date'];
    if ($today_str > $expire_date_str) {
        $end_use_date_str = ($today_str < $c['promise_date']) ? $today_str : $c['promise_date'];
        $diff = strtotime($end_use_date_str) - strtotime($expire_date_str);
        $promise_days_used = max(0, round($diff / 86400));
        if ($promise_days_used > 0) {
            $net_bill = floatval($c['bill_amount'] ?? 0) - floatval($c['discount'] ?? 0);
            if ($net_bill <= 0) $net_bill = floatval($c['bill_amount'] ?? 0);
            $daily_rate = $net_bill / 30;
            $promise_due_amount = round($promise_days_used * $daily_rate, 2);
        }
    }
}
?>

<?php
// Display Flash Messages
if (isset($_SESSION['flash_msg'])) {
    echo '<div class="alert alert-success alert-dismissible fade show shadow-sm mb-3 border-start border-4 border-success" role="alert"><i class="fas fa-check-circle text-success me-2"></i>' . htmlspecialchars($_SESSION['flash_msg']) . '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
    unset($_SESSION['flash_msg']);
}
if (isset($_SESSION['flash_error'])) {
    echo '<div class="alert alert-danger alert-dismissible fade show shadow-sm mb-3 border-start border-4 border-danger" role="alert"><i class="fas fa-exclamation-triangle text-danger me-2"></i>' . htmlspecialchars($_SESSION['flash_error']) . '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
    unset($_SESSION['flash_error']);
}
?>

<div class="row">
    <div class="col-md-4">
        <div class="card mb-3 shadow-sm border-0">
            <div class="card-header text-white d-flex justify-content-between align-items-center py-3" style="background-color: #212529;">
                <h6 class="mb-0 fw-bold"><i class="fas fa-user-circle me-2"></i> Client Identity</h6>
                <span class="badge <?= ($c['status'] == 'Active') ? 'bg-light text-success' : (($c['status'] == 'Promise Active') ? 'text-white' : 'bg-light text-danger') ?>" style="<?= ($c['status'] == 'Promise Active') ? 'background: linear-gradient(135deg, #fd7e14, #6f42c1); border: none;' : '' ?>"><?= $c['status'] ?></span>
            </div>
            <div class="card-body p-0" style="max-height: 700px; overflow-y: auto;">
                <div class="p-3">
                    <div class="text-center mb-4 position-relative">
                        <div class="position-relative d-inline-block">
                            <?php if(!empty($c['profile_pic']) && file_exists(__DIR__ . '/../' . $c['profile_pic'])): ?>
                                <img src="<?= $c['profile_pic'] ?>" class="rounded-circle shadow-sm border mb-3" style="width: 120px; height: 120px; object-fit: cover;">
                            <?php else: ?>
                                <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center mx-auto mb-3 shadow-sm" style="width: 120px; height: 120px; font-size: 3rem; font-weight: bold;">
                                    <?= strtoupper(substr($c['name'], 0, 1)) ?>
                                </div>
                            <?php endif; ?>
                            <div id="status_light" class="position-absolute border border-white border-3 rounded-circle" style="width: 25px; height: 25px; bottom: 20px; right: 5px; background-color: <?= $is_online ? '#28a745' : '#dc3545' ?>;"></div>
                        </div>
                        <div class="h3 mb-0 fw-bold text-dark"><?= $c['name'] ?></div>
                        <div class="text-primary fw-bold small mb-1">
                            <?= !empty($c['client_code']) ? htmlspecialchars($c['client_code']) : htmlspecialchars($c['user_id']) ?>
                        </div>
                        <div class="badge bg-light text-dark border shadow-sm px-3 py-1 d-inline-flex align-items-center">
                            <i class="fas fa-key text-muted me-1"></i> 
                            <span id="client_pass">••••••</span>
                            <i class="fas fa-eye ms-2 text-muted" style="cursor: pointer;" title="Toggle Password" id="togglePasswordBtn" data-password="<?= addslashes(htmlspecialchars($c['password'] ?? 'N/A')) ?>"></i>
                            <a href="#" class="text-primary ms-2 border-start ps-2" data-bs-toggle="modal" data-bs-target="#editPppoeModal" title="Edit PPPoE ID/Password"><i class="fas fa-edit"></i></a>
                        </div>
                    </div>

                    
                    <div class="d-flex justify-content-between align-items-center border-bottom pb-1 mb-2">
                        <h6 class="text-muted small fw-bold text-uppercase mb-0">Basic Info</h6>
                        <button class="btn btn-xs btn-outline-info py-0 px-2 rounded shadow-sm btn-sync-single-client" data-id="<?= $c['id'] ?>" title="Refresh this client on MikroTik">
                            <i class="fas fa-sync-alt me-1"></i>Refresh Client
                        </button>
                    </div>
                    <div class="d-flex justify-content-between small mb-2 align-items-center">
                        <span>Phone:</span> 
                        <strong class="text-muted"><?= htmlspecialchars($c['phone'] ?? '') ?></strong>
                    </div>
                    <div class="d-flex justify-content-between small mb-2 align-items-center">
                        <span>Alt Phone:</span> 
                        <span class="text-muted"><?= htmlspecialchars($c['phone2'] ?? '') ?: 'N/A' ?></span>
                    </div>
                    <?php if (!empty($c['client_code'])): ?>
                        <div class="d-flex justify-content-between small mb-2"><span>Custom ID:</span> <strong class="text-primary"><?= htmlspecialchars($c['client_code']) ?></strong></div>
                    <?php endif; ?>
                    <div class="d-flex justify-content-between small mb-2"><span>NID/ID:</span> <span class="text-muted"><?= $c['nid'] ?: 'N/A' ?></span></div>
                    <div class="d-flex justify-content-between small mb-3"><span>Joined:</span> <span class="text-muted"><?= date('d M Y', strtotime($c['joining_date'])) ?></span></div>

                    <h6 class="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">Network Setup</h6>
                    <div class="d-flex justify-content-between small mb-2"><span>Package:</span> <strong class="text-success"><?= $c['user_package'] ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Bill Amount:</span> <strong>৳<?= number_format($c['bill_amount'],2) ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Due Amount:</span> <strong class="<?= (isset($c['due']) && $c['due'] > 0) ? 'text-danger' : 'text-success' ?>">৳<?= number_format($c['due'] ?? 0, 2) ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Bill Status:</span> <span class="badge bg-light text-primary border"><?= $c['bill_position'] ?: 'Paid' ?></span></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Expiry:</span> <strong class="<?= ($c['status'] == 'Free') ? 'text-success' : 'text-danger' ?>"><?= ($c['status'] == 'Free') ? 'Infinity' : date('d M Y', strtotime($c['current_bill_date'])) ?></strong></div>
                    <?php if (isset($c['promise_enabled']) && $c['promise_enabled'] == 1 && !empty($c['promise_date'])): ?>
                        <div class="card my-3 border-0 shadow-sm text-white" style="background: linear-gradient(135deg, rgba(253, 126, 20, 0.1), rgba(111, 66, 193, 0.1)); border-left: 4px solid #fd7e14 !important; border-radius: 8px;">
                            <div class="card-body p-3">
                                <h6 class="fw-bold mb-2 d-flex align-items-center text-dark" style="font-size: 0.9rem;">
                                    <i class="fas fa-handshake me-2 text-warning animate-pulse"></i> Promise Active
                                </h6>
                                <div class="d-flex justify-content-between small mb-1 text-dark">
                                    <span>Promise Date:</span>
                                    <strong class="text-purple" style="color: #6f42c1;"><?= date('d M Y', strtotime($c['promise_date'])) ?></strong>
                                </div>
                                <div class="d-flex justify-content-between small mb-1 text-dark">
                                    <span>Extra Used Days:</span>
                                    <strong><?= $promise_days_used ?> days</strong>
                                </div>
                                <div class="d-flex justify-content-between small text-dark">
                                    <span>Promise Due:</span>
                                    <strong class="text-danger">৳<?= number_format($promise_due_amount, 2) ?></strong>
                                </div>
                            </div>
                        </div>
                    <?php endif; ?>
                    <div class="d-flex justify-content-between small mb-2"><span>Router:</span> <span class="text-muted"><?= $c['r_name'] ?: 'N/A' ?></span></div>
                    <div class="d-flex justify-content-between small mb-2 bg-light p-1 rounded border-start border-3 border-danger align-items-center">
                        <span>Live IP:</span> 
                        <div class="text-end">
                            <span id="live_mikrotik_ip" class="text-danger fw-bold me-2"><i class="fas fa-spinner fa-spin small"></i></span>
                            <button class="btn btn-xs btn-outline-primary py-0 px-1 rounded shadow-sm" data-bs-toggle="modal" data-bs-target="#routerLoginModal" title="Router Remote Login">
                                <i class="fas fa-external-link-alt" style="font-size: 0.75rem;"></i>
                            </button>
                            <button class="btn btn-xs btn-outline-info py-0 px-1 rounded shadow-sm ms-1 run-ping-btn" data-id="<?= $c['id'] ?>" data-name="<?= addslashes($c['name']) ?>" data-count="15" title="Ping Test">
                                <i class="fas fa-terminal" style="font-size: 0.75rem;"></i>
                            </button>
                            <button class="btn btn-xs btn-outline-secondary py-0 px-1 rounded shadow-sm ms-1 run-trace-btn" data-id="<?= $c['id'] ?>" data-name="<?= addslashes($c['name']) ?>" title="IP Trace">
                                <i class="fas fa-route" style="font-size: 0.75rem;"></i>
                            </button>
                        </div>
                    </div>
                    <div class="d-flex justify-content-between small mb-2 text-muted"><span>Live MAC:</span> <span id="live_mikrotik_mac">--</span></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Zone:</span> <span class="text-muted"><?= $c['zone_name'] ?? 'Default' ?></span></div>
                    <div class="d-flex justify-content-between small mb-2"><span>TJ / Box:</span> <span class="text-muted"><?= $c['tj_box_name'] ?: 'N/A' ?></span></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Conn Type:</span> <span class="text-muted"><?= $c['connection_type'] ?: 'N/A' ?></span></div>
                    <div class="d-flex justify-content-between small mb-1 align-items-center">
                        <span>MAC:</span> 
                        <span id="live_caller_id" class="text-muted small"><?= $mac ?></span>
                    </div>
                    <div id="onu_signal_container" class="mt-2" style="display:none;">
                        <div class="alert alert-info p-2 mb-0 small shadow-sm d-flex align-items-center">
                            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                            <span>Checking ONU Signal...</span>
                        </div>
                    </div>

                    <h6 class="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">Location & Logs</h6>
                    <div class="d-flex justify-content-between small mb-2"><span>District:</span> <strong class="text-dark"><?= $c['district'] ?: 'N/A' ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Thana:</span> <strong class="text-dark"><?= $c['thana'] ?: 'N/A' ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Client Type:</span> <strong class="text-primary"><?= $c['client_type'] ?: 'Home' ?></strong></div>
                    <div class="small mb-2">
                        <span class="text-muted d-block small">Address:</span>
                        <strong><?= $c['address'] ?: 'No address provided' ?></strong>
                    </div>
                    <div class="d-flex justify-content-between small mb-2">
                        <span>GPS:</span> 
                        <?php if($c['lat_long']): ?>
                            <a href="https://www.google.com/maps/search/?api=1&query=<?= $c['lat_long'] ?>" target="_blank" class="text-decoration-none">
                                <i class="fas fa-map-marker-alt text-danger me-1"></i> View Map
                            </a>
                        <?php else: ?>
                            <span class="text-muted small">Not set</span>
                        <?php endif; ?>
                    </div>
                    <div class="small mb-1">
                        <span class="text-muted d-block small">Remarks:</span>
                        <span class="text-muted italic small"><?= $c['remarks'] ?: 'None' ?></span>
                    </div>

                    <h6 class="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2 mt-3">Recharge History</h6>
                    <?php if(empty($recharge_history)): ?>
                        <div class="text-muted small italic">No history found.</div>
                    <?php else: ?>
                        <?php foreach($recharge_history as $log): ?>
                            <div class="mb-2 pb-2 border-bottom border-light">
                                <div class="d-flex justify-content-between align-items-center small">
                                    <span class="fw-bold">
                                        <?= $log['action_type'] ?>
                                        <?php if (in_array($log['action_type'], ['Recharge', 'Add Client', 'Extend Service'])): ?>
                                            <a href="?tab=recharge_invoice&id=<?= $log['id'] ?>" class="text-primary ms-1" title="Download Invoice" target="_blank">
                                                <i class="fas fa-file-invoice"></i>
                                            </a>
                                        <?php endif; ?>
                                    </span>
                                    <span class="text-muted" style="font-size: 0.75rem;"><?= date('d M, h:i A', strtotime($log['timestamp'])) ?></span>
                                </div>
                                <div class="text-muted" style="font-size: 0.8rem; line-height: 1.2;"><?= $log['description'] ?></div>
                            </div>
                        <?php endforeach; ?>
                        <div class="mt-2">
                            <a href="?tab=activity&target_id=<?= $c['id'] ?>&action_type=Recharge" class="btn btn-xs btn-link text-primary p-0 d-flex align-items-center small text-decoration-none">
                                View all History <i class="fas fa-chevron-right ms-1" style="font-size: 0.6rem;"></i>
                            </a>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Live Usage Graph Section -->
    <div class="col-md-8">
        <div class="card mb-3 shadow-sm border-0">
            <div class="card-header bg-white border-bottom py-3">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-bolt me-2 text-warning"></i> Quick Actions</h6>
            </div>
            <div class="card-body">
                <?php
                $recharge_discount_enabled = (get_opt($pdo, 'recharge_discount_enabled') === '1');

                // Manual recharge preview amounts. Keep this calculation aligned with controllers/logic.php.
                $recharge_service = safeFetch($pdo, "SELECT * FROM ".TBL_SERVICES." WHERE name=?", [$c['user_package']]);
                $preview_monthly_bill = floatval($c['bill_amount'] ?? 0);
                if ($preview_monthly_bill <= 0 && $recharge_service) {
                    $preview_monthly_bill = floatval($recharge_service['price'] ?? 0);
                }

                $preview_charger_id = $user;
                $preview_charger_is_admin = hasRole('Admin');
                if ($preview_charger_is_admin && !empty($c['manager_id'])) {
                    $preview_mgr = safeFetch($pdo, "SELECT role FROM ".TBL_STAFF." WHERE id=?", [intval($c['manager_id'])]);
                    if ($preview_mgr && !in_array(strtolower(trim($preview_mgr['role'])), ['admin', 'super admin'])) {
                        $preview_charger_id = intval($c['manager_id']);
                        $preview_charger_is_admin = false;
                    }
                }

                $preview_monthly_cost = 0.0;
                if ($recharge_service) {
                    if ($preview_charger_is_admin) {
                        $preview_monthly_cost = floatval($recharge_service['buying_price'] ?? 0);
                    } else {
                        $preview_monthly_cost = floatval(getBuyPrice($pdo, $preview_charger_id, $recharge_service['id']));
                    }
                }
                ?>
                <form method="POST" class="row g-2" id="manualRechargeForm"
                      data-monthly-bill="<?= htmlspecialchars(number_format($preview_monthly_bill, 2, '.', '')) ?>"
                      data-monthly-cost="<?= htmlspecialchars(number_format($preview_monthly_cost, 2, '.', '')) ?>">
                    <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                    <input type="hidden" name="recharge_mode" id="manual_recharge_mode" value="regular">
                    <div class="col-md-6">
                        <select name="offer_id" id="recharge_offer_select" class="form-select form-select-sm">
                            <option value="0">Regular Recharge (30 Days)</option>
                            <?php foreach($offers as $o): ?>
                                <option value="<?= $o['id'] ?>" data-billing-days="<?= intval($o['buy_days']) ?>" data-validity-days="<?= intval($o['buy_days']) + intval($o['free_days']) ?>"><?= $o['name'] ?> (<?= $o['buy_days'] ?>+<?= $o['free_days'] ?> Days)</option>
                            <?php endforeach; ?>
                            <option value="custom">Manual Days...</option>
                        </select>
                    </div>
                    <div id="manual_days_div" class="col-md-2" style="display:none;">
                        <input type="number" name="days" class="form-control form-control-sm" placeholder="Days" value="30">
                    </div>
                    <div class="col-md-3">
                        <select name="pay_method" id="recharge_pay_method" class="form-select form-select-sm fw-bold text-success border-success">
                            <option value="Cash">Cash</option>
                            <option value="Bank">Bank</option>
                            <option value="bKash">bKash</option>
                            <option value="Nagad">Nagad</option>
                            <option value="Rocket">Rocket</option>
                            <option value="Expire">Due</option>
                        </select>
                    </div>
                    <div id="recharge_trx_id_div" class="col-md-3" style="display:none;">
                        <input type="text" name="trx_id" id="recharge_trx_id_input" class="form-control form-control-sm border-primary" placeholder="Transaction ID">
                    </div>
                    <div class="col-12" id="manual_recharge_amount_summary">
                        <div class="row g-2">
                            <div class="col-12 col-sm-4">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text fw-bold bg-light">User Bill ৳</span>
                                    <input type="text" class="form-control fw-bold text-primary bg-white" id="manual_recharge_bill_amount_input" value="<?= number_format($preview_monthly_bill, 2, '.', '') ?>" readonly aria-label="User Bill Amount">
                                </div>
                            </div>
                            <div class="col-12 col-sm-4">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text fw-bold bg-light">Credit Cost ৳</span>
                                    <input type="text" class="form-control fw-bold text-danger bg-white" id="manual_recharge_cost_amount_input" value="<?= number_format($preview_monthly_cost, 2, '.', '') ?>" readonly aria-label="User Credit Cost Amount">
                                </div>
                            </div>
                            <div class="col-12 col-sm-4">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text fw-bold bg-light">Net Pay ৳</span>
                                    <input type="text" class="form-control fw-bold text-success bg-white" id="manual_recharge_net_amount_input" value="<?= number_format($preview_monthly_bill, 2, '.', '') ?>" readonly aria-label="Net Collection Amount">
                                </div>
                            </div>
                        </div>
                    </div>
                    <?php if ($recharge_discount_enabled): ?>
                    <div class="col-md-3" id="manual_recharge_discount_wrap">
                        <div class="input-group input-group-sm">
                            <span class="input-group-text bg-warning-subtle fw-bold">Discount ৳</span>
                            <input type="number" name="recharge_discount" id="manual_recharge_discount" min="0" step="0.01" value="0" class="form-control border-warning" placeholder="0.00">
                        </div>
                        <small class="text-muted">Discount is deducted from Bill Amount only. Cost Amount is unchanged.</small>
                    </div>
                    <?php endif; ?>
                    <?php if (floatval($c['due'] ?? 0) > 0): ?>
                    <div class="col-12" id="recharge_due_deduct_wrap">
                        <div class="form-check form-switch border rounded-3 px-3 py-2 bg-light">
                            <input class="form-check-input ms-0 me-2" type="checkbox" name="deduct_due_balance" value="1" id="recharge_deduct_due">
                            <label class="form-check-label small" for="recharge_deduct_due">
                                <strong>Deduct Due Balance First</strong> — Current Due: <span class="text-danger fw-bold">৳<?= number_format(floatval($c['due']), 2) ?></span>. Remaining payment will be used for recharge validity.
                            </label>
                        </div>
                    </div>
                    <?php endif; ?>
                    <div class="col-md-3">
                        <button type="submit" name="recharge" class="btn btn-primary btn-sm w-100 rounded-pill shadow-sm">Recharge Now</button>
                    </div>
                </form>
                <hr class="bg-light">
                <?php
                $can_undo = false;
                $undo_log_id = 0;
                $is_reseller = hasRole('Reseller') || hasRole('SubReseller');
                $can_undo_flag = 0;
                if ($is_reseller) {
                    $staff_info = safeFetch($pdo, "SELECT can_undo_recharge FROM ".TBL_STAFF." WHERE id=?", [$user]);
                    $can_undo_flag = $staff_info['can_undo_recharge'] ?? 0;
                }
                if (hasPermission('clients_edit') || hasRole('Admin') || hasRole('Super Admin') || ($is_reseller && $can_undo_flag == 1)) {
                    $recent_recharge = safeFetch($pdo, "SELECT id FROM ".TBL_LOGS." WHERE target_id=? AND action_type='Recharge' AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY id DESC LIMIT 1", [$c['id']]);

                    if ($recent_recharge) {
                        $can_undo = true;
                        $undo_log_id = $recent_recharge['id'];
                    }
                }
                ?>
                <div class="row g-2">
                    <?php if (isset($c['due']) && $c['due'] > 0 && (hasRole('Admin') || hasRole('Reseller') || hasPermission('pay_due'))): ?>
                    <div class="col-6 col-md-auto">
                        <button class="btn btn-success btn-sm rounded-pill px-3 w-100 shadow-sm text-white" data-bs-toggle="modal" data-bs-target="#payDueModal">
                            <i class="fas fa-hand-holding-usd me-1"></i> Pay Due
                        </button>
                    </div>
                    <?php endif; ?>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-primary btn-sm rounded-pill px-3 w-100 shadow-sm text-white" data-bs-toggle="modal" data-bs-target="#changePackageModal">
                            <i class="fas fa-exchange-alt me-1"></i> Change Pkg
                        </button>
                    </div>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-sm rounded-pill px-3 w-100 shadow-sm text-white" style="background-color: #6f42c1; border-color: #6f42c1;" data-bs-toggle="modal" data-bs-target="#rechargeInvoicesModal">
                            <i class="fas fa-file-invoice me-1"></i> Invoice
                        </button>
                    </div>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-info btn-sm rounded-pill px-3 w-100 shadow-sm text-white" data-bs-toggle="modal" data-bs-target="#dueStatementModal">
                            <i class="fas fa-file-invoice-dollar me-1"></i> Due Statement
                        </button>
                    </div>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-warning btn-sm rounded-pill px-3 w-100 shadow-sm btn-toggle-service" data-id="<?= $c['id'] ?>" data-status="<?= $c['status'] ?>">
                            <i class="fas <?= ($c['status']=='Active' || $c['status']=='Expire') ? 'fa-pause' : 'fa-play' ?> me-1"></i> <?= ($c['status']=='Active' || $c['status']=='Expire') ? 'Disable' : 'Enable' ?>
                        </button>
                    </div>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-info btn-sm text-white rounded-pill px-3 w-100 shadow-sm btn-extend-service" data-id="<?= $c['id'] ?>" data-days="3">
                            <i class="fas fa-calendar-plus me-1"></i> 3 Days Credit
                        </button>
                    </div>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-secondary btn-sm rounded-pill px-3 w-100 shadow-sm text-white" data-bs-toggle="modal" data-bs-target="#smsLogsModal">
                            <i class="fas fa-envelope-open-text me-1"></i> SMS Logs
                        </button>
                    </div>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-outline-danger btn-sm rounded-pill px-3 w-100 shadow-sm px-1 text-nowrap btn-make-left" data-id="<?= $c['id'] ?>">
                            <i class="fas fa-user-slash me-1"></i> Make Left
                        </button>
                    </div>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-dark btn-sm rounded-pill px-3 w-100 shadow-sm text-white" data-bs-toggle="modal" data-bs-target="#sendCustomSmsModal">
                            <i class="fas fa-sms me-1"></i> Send SMS
                        </button>
                    </div>
                    <?php if (hasPermission('voice_manual_call')): ?>
                    <div class="col-6 col-md-auto">
                        <button class="btn btn-info btn-sm rounded-pill px-3 w-100 shadow-sm text-white" data-bs-toggle="modal" data-bs-target="#sendVoiceReminderModal">
                            <i class="fas fa-phone-alt me-1"></i> Voice Call
                        </button>
                    </div>
                    <?php endif; ?>

                    <?php if ($can_undo): ?>
                    <div class="col-6 col-md-auto">
                        <form method="POST" class="w-100" id="undoRechargeForm">
                            <input type="hidden" name="action" value="undo_recharge">
                            <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                            <input type="hidden" name="log_id" value="<?= $undo_log_id ?>">
                            <button type="submit" class="btn btn-danger btn-sm rounded-pill px-3 w-100 shadow-sm text-white"><i class="fas fa-undo-alt me-1"></i> Undo</button>
                        </form>
                    </div>
                    <?php endif; ?>

                    <div class="col-6 col-md-auto">
                        <button class="btn btn-sm rounded-pill px-3 w-100 shadow-sm text-white" style="background: linear-gradient(135deg, #fd7e14, #6f42c1); border: none;" data-bs-toggle="modal" data-bs-target="#promiseDateModal">
                            <i class="fas fa-handshake me-1"></i> Promise Date
                        </button>
                    </div>
                    <div class="col-6 col-md-auto">
                        <a href="?tab=edit_client&uid=<?= $c['id'] ?>" class="btn btn-outline-secondary btn-sm rounded-pill px-3 w-100 shadow-sm text-center"><i class="fas fa-edit me-1"></i> Edit Profile</a>
                    </div>
                </div>

            </div>
        </div>

        <div class="card mb-3 shadow-sm border-0">
             <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center py-3">
                <div class="d-flex align-items-center gap-2">
                    <i class="fas fa-chart-line me-1"></i>
                    <h6 class="mb-0 fw-bold">Live Usage Graph</h6>
                    <span id="live_badge" class="badge bg-secondary rounded-pill ms-1" style="font-size:10px;">--</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-primary rounded-pill" id="live_rx">0.00</span> <small class="text-white-50">↓ Mbps</small>
                    <span class="badge bg-danger rounded-pill ms-1" id="live_tx">0.00</span> <small class="text-white-50">↑ Mbps</small>
                </div>
            </div>
            <div class="card-body p-2" style="height: 240px;">
                <canvas id="bwChart"></canvas>
            </div>
            <!-- Offline Last-Session Banner (hidden when online) -->
            <div id="offline_banner" class="px-3 py-2 bg-warning bg-opacity-10 border-top border-warning d-none">
                <small class="text-warning fw-bold"><i class="fas fa-clock me-1"></i> Last Online: 
                    <span id="last_online_time">--</span> &nbsp;|&nbsp; 
                    Used: <span id="last_session_used">--</span>
                </small>
            </div>
            <!-- Stats Footer -->
            <div class="card-footer bg-white border-top-0 py-2">
                <div class="row g-0 text-center">
                    <div class="col border-end">
                        <div class="small text-muted" style="font-size:10px;">SESSION ↓</div>
                        <strong id="session_down" class="text-primary small">0 B</strong>
                    </div>
                    <div class="col border-end">
                        <div class="small text-muted" style="font-size:10px;">SESSION ↑</div>
                        <strong id="session_up" class="text-danger small">0 B</strong>
                    </div>
                    <div class="col border-end bg-light">
                        <div class="small text-muted" style="font-size:10px;">SESSION TOTAL</div>
                        <strong id="session_total" class="text-dark small">0 B</strong>
                    </div>
                    <div class="col border-end bg-light">
                        <div class="small text-muted" style="font-size:10px;">TODAY TOTAL</div>
                        <strong id="daily_total" class="text-success small">0 B</strong>
                    </div>
                    <div class="col">
                        <div class="small text-muted" style="font-size:10px;">UPTIME</div>
                        <strong id="session_uptime" class="text-dark small">0:00:00</strong>
                    </div>
                </div>
            </div>
        </div>



        <!-- Store Management & Support Tracking Tabs -->
        <div class="card mb-3 shadow-sm border-0">
            <div class="card-header bg-white py-0 border-bottom-0">
                <ul class="nav nav-tabs mt-3" id="storeProfileTabs" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active fw-bold text-dark" id="store-purchases-tab" data-bs-toggle="tab" data-bs-target="#store-purchases" type="button" role="tab" aria-controls="store-purchases" aria-selected="true">
                            <i class="fas fa-shopping-cart text-primary me-2"></i> Purchased Products
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link fw-bold text-dark" id="store-support-tab" data-bs-toggle="tab" data-bs-target="#store-support" type="button" role="tab" aria-controls="store-support" aria-selected="false">
                            <i class="fas fa-tools text-warning me-2"></i> Support Devices
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link fw-bold text-dark" id="store-returns-tab" data-bs-toggle="tab" data-bs-target="#store-returns" type="button" role="tab" aria-controls="store-returns" aria-selected="false">
                            <i class="fas fa-history text-success me-2"></i> Return History
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link fw-bold text-dark" id="call-timeline-tab" data-bs-toggle="tab" data-bs-target="#call-timeline" type="button" role="tab" aria-controls="call-timeline" aria-selected="false" data-id="<?= (int)$c['id'] ?>">
                            <i class="fas fa-headset text-info me-2"></i> Call & Follow-up Timeline
                        </button>
                    </li>
                </ul>
            </div>
            <div class="card-body p-0 border-top">
                <div class="tab-content" id="storeProfileTabsContent">
                    
                    <!-- PURCHASED PRODUCTS TAB -->
                    <div class="tab-pane fade show active" id="store-purchases" role="tabpanel" aria-labelledby="store-purchases-tab">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="bg-light text-nowrap">
                                    <tr>
                                        <th class="ps-4">Sale Date</th>
                                        <th>Invoice No</th>
                                        <th>Product Name</th>
                                        <th>SQ ID</th>
                                        <th>Price</th>
                                        <th>Status</th>
                                        <th>Warranty</th>
                                        <th class="pe-4">Sold By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php if(empty($purchased_products)): ?>
                                        <tr><td colspan="8" class="text-center py-4 text-muted"><i class="fas fa-shopping-bag me-1 opacity-50"></i> No products purchased yet.</td></tr>
                                    <?php else: foreach($purchased_products as $sp): ?>
                                        <tr>
                                            <td class="ps-4 small text-nowrap"><?= date('d M Y, h:i A', strtotime($sp['sale_date'])) ?></td>
                                            <td>
                                                <a href="index.php?tab=store_sales_invoice&id=<?= $sp['id'] ?>" target="_blank" class="fw-bold text-decoration-none">
                                                    <i class="fas fa-file-invoice me-1"></i><?= htmlspecialchars($sp['invoice_no']) ?>
                                                </a>
                                            </td>
                                            <td>
                                                <span class="fw-bold"><?= htmlspecialchars($sp['product_name']) ?></span>
                                                <?php if(!empty($sp['brand_model'])): ?>
                                                    <small class="text-muted d-block"><?= htmlspecialchars($sp['brand_model']) ?></small>
                                                <?php endif; ?>
                                            </td>
                                            <td><span class="badge bg-light text-dark border font-monospace"><?= htmlspecialchars($sp['serial_mac']) ?></span></td>
                                            <td class="fw-bold text-nowrap">৳<?= number_format($sp['sold_price'], 2) ?></td>
                                            <td>
                                                <?php
                                                if($sp['payment_status'] === 'Paid') {
                                                    echo '<span class="badge bg-success">Paid</span>';
                                                } elseif($sp['payment_status'] === 'Partial') {
                                                    echo '<span class="badge bg-warning text-dark">Partial</span><br><small class="text-muted">Due: ৳' . number_format($sp['due_amount'], 2) . '</small>';
                                                } else {
                                                    echo '<span class="badge bg-danger">Due</span>';
                                                }
                                                ?>
                                            </td>
                                            <td>
                                                 <?php
                                                 $warranty_str = trim($sp['warranty'] ?? '');
                                                 if (empty($warranty_str) || strtolower($warranty_str) === 'no warranty' || strtolower($warranty_str) === 'none') {
                                                     echo '<span class="text-muted small"><i class="fas fa-ban me-1"></i>No Warranty</span>';
                                                 } else {
                                                     $purchase_date = strtotime($sp['sale_date']);
                                                     $parsed_duration = false;
                                                     
                                                     if (preg_match('/(\d+)\s*(year|yr)/i', $warranty_str, $matches)) {
                                                         $years = intval($matches[1]);
                                                         $parsed_duration = "+$years years";
                                                     } elseif (preg_match('/(\d+)\s*(month|mon|mth)/i', $warranty_str, $matches)) {
                                                         $months = intval($matches[1]);
                                                         $parsed_duration = "+$months months";
                                                     } elseif (preg_match('/(\d+)\s*(day)/i', $warranty_str, $matches)) {
                                                         $days = intval($matches[1]);
                                                         $parsed_duration = "+$days days";
                                                     }
                                                     
                                                     if ($parsed_duration !== false) {
                                                         $expiry_timestamp = strtotime($parsed_duration, $purchase_date);
                                                         $expiry_date = date('d M Y', $expiry_timestamp);
                                                         $now = time();
                                                         
                                                         if ($now > $expiry_timestamp) {
                                                             echo '<span class="badge bg-danger" title="Expired on ' . $expiry_date . '"><i class="fas fa-times-circle me-1"></i>Expired</span>';
                                                             echo '<small class="text-muted d-block mt-1" style="font-size: 0.72rem;">Was: ' . htmlspecialchars($warranty_str) . ' (Ended ' . $expiry_date . ')</small>';
                                                         } else {
                                                             $days_remaining = ceil(($expiry_timestamp - $now) / 86400);
                                                             echo '<span class="badge bg-success" title="Expires on ' . $expiry_date . '"><i class="fas fa-shield-alt me-1"></i>Active</span>';
                                                             echo '<small class="text-success d-block fw-bold mt-1" style="font-size: 0.72rem;">' . $days_remaining . ' days left</small>';
                                                             echo '<small class="text-muted d-block" style="font-size: 0.72rem;">Expires: ' . $expiry_date . '</small>';
                                                         }
                                                     } else {
                                                         echo '<span class="text-info small"><i class="fas fa-shield-alt me-1"></i>' . htmlspecialchars($warranty_str) . '</span>';
                                                     }
                                                 }
                                                 ?>
                                            </td>
                                            <td class="pe-4 small"><?= htmlspecialchars($sp['staff_name'] ?? 'System') ?></td>
                                        </tr>
                                    <?php endforeach; endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- SUPPORT DEVICES TAB -->
                    <div class="tab-pane fade" id="store-support" role="tabpanel" aria-labelledby="store-support-tab">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="bg-light text-nowrap">
                                    <tr>
                                        <th class="ps-4">Product Details</th>
                                        <th>SQ ID</th>
                                        <th>Date Issued</th>
                                        <th>Expected Return</th>
                                        <th>Condition</th>
                                        <th>Status</th>
                                        <th>Issued By</th>
                                        <th class="pe-4 text-end">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php if(empty($active_support_devices)): ?>
                                        <tr><td colspan="8" class="text-center py-4 text-muted"><i class="fas fa-info-circle me-1 opacity-50"></i> No support devices currently issued.</td></tr>
                                    <?php else: foreach($active_support_devices as $asd): 
                                        $is_overdue = ($asd['status'] === 'Issued' && !empty($asd['expected_return_date']) && $asd['expected_return_date'] !== '0000-00-00' && $asd['expected_return_date'] < date('Y-m-d'));
                                    ?>
                                        <tr>
                                            <td class="ps-4">
                                                <span class="fw-bold"><?= htmlspecialchars($asd['product_name']) ?></span>
                                                <?php if(!empty($asd['brand_model'])): ?>
                                                    <small class="text-muted d-block"><?= htmlspecialchars($asd['brand_model']) ?></small>
                                                <?php endif; ?>
                                                <?php if(!empty($asd['ticket_id'])): ?>
                                                    <span class="badge bg-light text-primary border small mt-1">Ticket #<?= $asd['ticket_id'] ?></span>
                                                <?php endif; ?>
                                            </td>
                                            <td><span class="badge bg-light text-dark border font-monospace"><?= htmlspecialchars($asd['serial_mac']) ?></span></td>
                                            <td class="small text-nowrap"><?= date('d M Y', strtotime($asd['given_date'])) ?></td>
                                            <td class="small text-nowrap">
                                                <strong class="<?= $is_overdue ? 'text-danger' : 'text-dark' ?>">
                                                    <?php if (empty($asd['expected_return_date']) || $asd['expected_return_date'] === '0000-00-00'): ?>
                                                        <span class="badge bg-info text-dark">Until Client Left</span>
                                                    <?php else: ?>
                                                        <?= date('d M Y', strtotime($asd['expected_return_date'])) ?>
                                                    <?php endif; ?>
                                                </strong>
                                            </td>
                                            <td><span class="badge bg-light text-dark"><?= htmlspecialchars($asd['given_condition']) ?></span></td>
                                            <td>
                                                <?php if ($is_overdue): ?>
                                                    <span class="badge bg-danger"><i class="fas fa-exclamation-triangle me-1"></i>Overdue</span>
                                                <?php else: ?>
                                                    <span class="badge bg-warning text-dark"><i class="fas fa-share me-1"></i>Issued</span>
                                                <?php endif; ?>
                                            </td>
                                            <td class="small"><?= htmlspecialchars($asd['given_staff'] ?? 'System') ?></td>
                                            <td class="pe-4 text-end">
                                                <button class="btn btn-xs btn-outline-success py-1 px-2 rounded btn-profile-return" 
                                                        data-support='<?= json_encode($asd, JSON_HEX_APOS | JSON_HEX_QUOT) ?>'>
                                                    <i class="fas fa-undo me-1"></i> Return
                                                </button>
                                            </td>
                                        </tr>
                                    <?php endforeach; endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- RETURN HISTORY TAB -->
                    <div class="tab-pane fade" id="store-returns" role="tabpanel" aria-labelledby="store-returns-tab">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="bg-light text-nowrap">
                                    <tr>
                                        <th class="ps-4">Product Details</th>
                                        <th>SQ ID</th>
                                        <th>Date Issued</th>
                                        <th>Return Date</th>
                                        <th>Uptime (Days)</th>
                                        <th>Return Condition</th>
                                        <th>Received By</th>
                                        <th class="pe-4">Uptime Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php if(empty($returned_support_devices)): ?>
                                        <tr><td colspan="8" class="text-center py-4 text-muted"><i class="fas fa-history me-1 opacity-50"></i> No return history found.</td></tr>
                                    <?php else: foreach($returned_support_devices as $rsd): 
                                        $issued_date = new DateTime($rsd['given_date']);
                                        $returned_date = new DateTime($rsd['return_date']);
                                        $duration = $issued_date->diff($returned_date)->days;
                                    ?>
                                        <tr>
                                            <td class="ps-4">
                                                <span class="fw-bold"><?= htmlspecialchars($rsd['product_name']) ?></span>
                                                <?php if(!empty($rsd['brand_model'])): ?>
                                                    <small class="text-muted d-block"><?= htmlspecialchars($rsd['brand_model']) ?></small>
                                                <?php endif; ?>
                                            </td>
                                            <td><span class="badge bg-light text-dark border font-monospace"><?= htmlspecialchars($rsd['serial_mac']) ?></span></td>
                                            <td class="small text-nowrap"><?= date('d M Y', strtotime($rsd['given_date'])) ?></td>
                                            <td class="small text-nowrap text-success fw-bold"><?= date('d M Y', strtotime($rsd['return_date'])) ?></td>
                                            <td class="fw-bold text-center"><?= $duration ?></td>
                                            <td><span class="badge bg-light text-dark"><?= htmlspecialchars($rsd['return_condition']) ?></span></td>
                                            <td class="small"><?= htmlspecialchars($rsd['received_staff'] ?? 'System') ?></td>
                                            <td class="pe-4">
                                                <?php if ($rsd['status'] === 'Returned'): ?>
                                                    <span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Returned</span>
                                                <?php elseif ($rsd['status'] === 'Damaged'): ?>
                                                    <span class="badge bg-danger"><i class="fas fa-heart-broken me-1"></i>Damaged</span>
                                                <?php elseif ($rsd['status'] === 'Missing'): ?>
                                                    <span class="badge bg-dark"><i class="fas fa-question-circle me-1"></i>Missing</span>
                                                <?php else: ?>
                                                    <span class="badge bg-secondary"><?= $rsd['status'] ?></span>
                                                <?php endif; ?>
                                            </td>
                                        </tr>
                                    <?php endforeach; endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- CALL TIMELINE TAB -->
                    <div class="tab-pane fade" id="call-timeline" role="tabpanel" aria-labelledby="call-timeline-tab">
                        <div id="callTimelineLoading" class="text-center py-5 d-none">
                            <div class="spinner-border text-primary" role="status"></div>
                            <p class="mt-2 text-muted">Loading timeline...</p>
                        </div>
                        <div id="callTimelineContent"></div>
                    </div>

                </div>
            </div>
        </div>
    </div>
</div>

<!-- SMS Logs Modal -->

<div class="modal fade" id="smsLogsModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header d-flex justify-content-between align-items-center">
                <h5 class="modal-title m-0"><i class="fas fa-envelope-open-text me-2"></i> SMS Logs for <?= htmlspecialchars($c['name']) ?></h5>
                <div class="d-flex align-items-center me-3 ms-auto">
                    <label class="me-2 small fw-bold text-muted mb-0">From:</label>
                    <input type="date" id="smsDateFrom" class="form-control form-control-sm border-secondary shadow-sm">
                    <label class="mx-2 small fw-bold text-muted mb-0">To:</label>
                    <input type="date" id="smsDateTo" class="form-control form-control-sm border-secondary shadow-sm">
                    <button class="btn btn-sm btn-light border ms-1 shadow-sm" id="clearSmsFilterBtn" title="Clear Filter"><i class="fas fa-times text-danger"></i></button>
                </div>
                <button type="button" class="btn-close m-0" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-hover align-middle mb-0 text-nowrap">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th>Date & Time</th>
                                <th>Status</th>
                                <th class="w-75">Message Details</th>
                            </tr>
                        </thead>
                        <tbody id="smsLogsTableBody">
                            <?php if (empty($sms_logs)): ?>
                                <tr id="smsNoDataRow"><td colspan="3" class="text-center py-4 text-muted">No SMS logs found for this client's number (<?= htmlspecialchars($c['phone']) ?>).</td></tr>
                            <?php else: foreach($sms_logs as $sl): 
                                $desc = $sl['description'];
                                $msg_text = $desc;
                                $is_failed = ($sl['action_type'] === 'SMS Error');
                                $raw_date = date('Y-m-d', strtotime($sl['timestamp']));
                                
                                if (strpos($desc, ' | Response:') !== false) {
                                    $parts = explode(' | Response:', $desc);
                                    $left = $parts[0];
                                    if (preg_match('/^SMS to [0-9]+:\s*(.*)$/s', $left, $m)) {
                                        $msg_text = trim($m[1]);
                                    } else {
                                        $msg_text = $left;
                                    }
                                } elseif (strpos($desc, 'SMS sent to ') !== false && strpos($desc, '. Response:') !== false) {
                                    $msg_text = "<em>Text not recorded (Legacy Log)</em>";
                                } elseif (strpos($desc, ' | Msg: ') !== false) {
                                    $parts = explode(' | Msg: ', $desc);
                                    $msg_text = trim($parts[1]);
                                } elseif (strpos($desc, 'Failed to send SMS to ') !== false) {
                                    $msg_text = "<em>Text not recorded (Legacy Error)</em> - " . htmlspecialchars($desc);
                                } else {
                                    $msg_text = htmlspecialchars($msg_text);
                                }
                                
                                // Ensure we don't double encode HTML if we explicitly inserted <em>
                                if (strpos($msg_text, '<em>') === false) {
                                    $msg_text = nl2br(htmlspecialchars($msg_text));
                                }
                            ?>
                                <tr class="sms-log-row" data-raw-date="<?= $raw_date ?>">
                                    <td><small><i class="far fa-clock me-1 text-muted"></i> <?= date('d M Y, h:i A', strtotime($sl['timestamp'])) ?></small></td>
                                    <td>
                                        <?php if (!$is_failed): ?>
                                            <span class="badge bg-success">Sent</span>
                                        <?php else: ?>
                                            <span class="badge bg-danger">Failed</span>
                                        <?php endif; ?>
                                    </td>
                                    <td class="text-wrap" style="max-width: 400px; word-break: break-word;">
                                        <?php if ($is_failed): ?>
                                            <div style="opacity: 0.6;">
                                                <small><?= $msg_text ?></small>
                                            </div>
                                        <?php else: ?>
                                            <small><?= $msg_text ?></small>
                                        <?php endif; ?>
                                    </td>
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
function filterSmsLogs() {
    let dateFrom = document.getElementById('smsDateFrom').value;
    let dateTo = document.getElementById('smsDateTo').value;
    let rows = document.querySelectorAll('.sms-log-row');
    let visibleCount = 0;
    
    rows.forEach(row => {
        let rowDate = row.getAttribute('data-raw-date');
        let show = true;
        
        if (dateFrom && rowDate < dateFrom) show = false;
        if (dateTo && rowDate > dateTo) show = false;
        
        if (show) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    let tbody = document.getElementById('smsLogsTableBody');
    let existingMsg = document.getElementById('smsNoDateMatchRow');
    if (existingMsg) existingMsg.remove();
    
    if (visibleCount === 0 && rows.length > 0) {
        let tr = document.createElement('tr');
        tr.id = 'smsNoDateMatchRow';
        tr.innerHTML = '<td colspan="3" class="text-center py-4 text-muted">No SMS logs found for the selected date range.</td>';
        tbody.appendChild(tr);
    }
}
</script>

<!-- Quick Edit PPPoE Modal -->
<div class="modal fade" id="editPppoeModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title"><i class="fas fa-key me-2"></i> Quick Edit PPPoE</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                <div class="alert alert-warning small">
                    <i class="fas fa-exclamation-triangle me-1"></i> Changing the PPPoE ID will forcefully disconnect the client from the router so they can reconnect with the new credentials.
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold small text-primary">PPPoE ID (Username)</label>
                    <input type="text" name="new_user_id" class="form-control fw-bold" value="<?= $c['user_id'] ?>" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold small text-primary">PPPoE Password</label>
                    <input type="text" name="new_password" class="form-control fw-bold" value="<?= $c['password'] ?>" required>
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="quick_edit_pppoe" class="btn btn-primary"><i class="fas fa-save me-1"></i> Save Changes</button>
            </div>
        </form>
    </div>
</div>

<!-- Recharge Invoices Modal -->
<div class="modal fade" id="rechargeInvoicesModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content border-0 shadow-lg" style="border-radius: 16px; overflow: hidden;">
            <div class="modal-header text-white" style="background: linear-gradient(135deg, #6f42c1, #52308e); border: none;">
                <h5 class="modal-title"><i class="fas fa-file-invoice me-2"></i> Recharge Invoice History</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <?php 
            $recharge_month = $_GET['recharge_month'] ?? '';
            ?>
            <div class="modal-body p-0">
                <div class="bg-light p-2 border-bottom">
                    <form method="GET" action="" class="d-flex align-items-center m-0">
                        <input type="hidden" name="tab" value="profile">
                        <input type="hidden" name="view_id" value="<?= $client_id ?>">
                        <label class="form-label mb-0 fw-bold small me-2 text-nowrap">Filter Month:</label>
                        <input type="month" name="recharge_month" class="form-control form-control-sm me-2" style="max-width: 200px;" value="<?= htmlspecialchars($recharge_month) ?>">
                        <button type="submit" class="btn btn-primary btn-sm me-2">Apply</button>
                        <a href="?tab=profile&view_id=<?= $client_id ?>" class="btn btn-outline-secondary btn-sm">Reset</a>
                    </form>
                </div>
                <div class="table-responsive" style="max-height: 450px; overflow-y: auto;">
                    <table class="table table-hover align-middle mb-0 text-nowrap">
                        <thead class="table-light">
                            <tr>
                                <th class="ps-4">Date & Time</th>
                                <th>Method / Package Info</th>
                                <th>Amount</th>
                                <th class="text-end pe-4">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php 
                            $recharge_query = "SELECT * FROM ".TBL_LOGS." WHERE target_id=? AND action_type IN ('Recharge', 'Add Client', 'Extend Service', 'Pay Due')";
                            $recharge_params = [$client_id];
                            if (!empty($recharge_month)) {
                                $recharge_query .= " AND DATE_FORMAT(timestamp, '%Y-%m') = ?";
                                $recharge_params[] = $recharge_month;
                            }
                            $recharge_query .= " ORDER BY timestamp DESC LIMIT 500";
                            $all_recharges = safeFetchAll($pdo, $recharge_query, $recharge_params);
                            if(empty($all_recharges)): ?>
                            <tr>
                                <td colspan="4" class="text-center py-5 text-muted">
                                    <i class="fas fa-file-invoice fa-3x mb-3 text-light"></i>
                                    <p class="mb-0">No recharge invoices found for this client.</p>
                                </td>
                            </tr>
                            <?php else: ?>
                                <?php foreach($all_recharges as $log): 
                                    $is_extend = ($log['action_type'] === 'Extend Service');
                                    
                                    // Try to parse Amount from description
                                    $amount_val = null;
                                    $amount_str = '—';
                                    $amt_class  = 'text-muted';
                                    if ($is_extend) {
                                        // Parse credit days from Extend Service log
                                        $ext_days = '';
                                        if (preg_match('/by\s+(\d+)\s+days/i', $log['description'], $m)) {
                                            $ext_days = $m[1];
                                        }
                                        $amount_str = $ext_days ? "<span style='color:#7c3aed;font-size:0.82rem;'><i class='fas fa-gift me-1'></i>{$ext_days} day credit</span>" : '—';
                                        $amt_class  = ''; // handled inline
                                    } elseif (preg_match('/Amount:\s*(?:৳|BDT|Tk)?\s*([0-9,.]+)/iu', $log['description'], $matches)) {
                                        $amount_val = floatval(str_replace(',', '', $matches[1]));
                                        $amount_str = '৳' . number_format($amount_val, 2);
                                        $amt_class  = 'text-success';
                                    }
                                    
                                    // ── Detect Due / Expire recharge ──
                                    // ── Detect Due / Expire recharge (skip for Extend Service) ──
                                    $is_due_row = false;
                                    $due_row_paid = false;
                                    if (!$is_extend) {
                                        $is_due_row = (
                                            stripos($log['description'], 'Trx: Due') !== false ||
                                            stripos($log['description'], '(Trx: Due)') !== false ||
                                            stripos($log['description'], 'via Expire') !== false
                                        );
                                        if ($is_due_row) {
                                            $paid_check = safeFetch($pdo,
                                                "SELECT id FROM " . TBL_LOGS .
                                                " WHERE target_id = ? AND action_type = 'Pay Due' AND timestamp >= ? LIMIT 1",
                                                [$client_id, $log['timestamp']]
                                            );
                                            if ($paid_check) $due_row_paid = true;
                                        }
                                    }

                                    // ── Parse Payment Method badge ──
                                    $method_str  = '';
                                    $method_badge = '';
                                    if ($is_extend) {
                                        $method_badge = "<span class='badge ms-1 fw-semibold' style='background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;'><i class='fas fa-gift me-1'></i>Credit</span>";
                                    } elseif ($is_due_row && !$due_row_paid) {
                                        $method_badge = "<span class='badge ms-1 fw-semibold' style='background:#fffbeb;color:#d97706;border:1px solid #fcd34d;'><i class='fas fa-clock me-1'></i>Due</span>";
                                        $amt_class = 'text-danger';
                                    } elseif ($is_due_row && $due_row_paid) {
                                        $method_badge = "<span class='badge ms-1 fw-semibold' style='background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;'><i class='fas fa-check-circle me-1'></i>Due (Paid)</span>";
                                        $amt_class = 'text-success';
                                    } else {
                                        // Normal payment — parse method from description
                                        $method_str = 'Cash'; // default
                                        if (preg_match('/via\s+([a-zA-Z0-9]+)/i', $log['description'], $matches)) {
                                            $method_str = trim($matches[1]);
                                        } elseif (preg_match('/\(Trx:\s*([a-zA-Z0-9\-]+)\)/i', $log['description'], $matches)) {
                                            $t = strtolower(trim($matches[1]));
                                            if ($t !== 'due') {
                                                if (strpos($t,'bkash') !== false) $method_str = 'bKash';
                                                elseif (strpos($t,'nagad') !== false) $method_str = 'Nagad';
                                                else $method_str = ucfirst($t);
                                            }
                                        }
                                        $method_badge = "<span class='badge bg-light text-dark border ms-1'>" . htmlspecialchars($method_str) . "</span>";
                                    }

                                    // Package details
                                    $pkg_str = '';
                                    if (preg_match('/Package:\s*([a-zA-Z0-9_\-\s\(\)]+)/i', $log['description'], $matches)) {
                                        $pkg_str = trim($matches[1]);
                                    }
                                    if (empty($pkg_str) && preg_match('/Recharged\s+([a-zA-Z0-9_\-\s\(\)]+)\s+for/i', $log['description'], $matches)) {
                                        $pkg_str = trim($matches[1]);
                                    }
                                    
                                    $info_str = "<strong>" . htmlspecialchars($log['action_type']) . "</strong>";
                                    if (!empty($pkg_str)) {
                                        $info_str .= " - <span class='text-muted small'>" . htmlspecialchars($pkg_str) . "</span>";
                                    }
                                    $info_str .= " " . $method_badge;
                                ?>
                                <tr>
                                    <td class="text-nowrap small ps-4"><?= date('d M Y, h:i A', strtotime($log['timestamp'])) ?></td>
                                    <td>
                                        <div class="small text-truncate" style="max-width: 320px;" title="<?= htmlspecialchars($log['description']) ?>">
                                            <?= $info_str ?><br>
                                            <span class="text-muted small italic"><?= htmlspecialchars($log['description']) ?></span>
                                        </div>
                                    </td>
                                    <td class="fw-bold <?= $amt_class ?>"><?= $amount_str ?></td>
                                    <td class="text-end pe-4">
                                        <?php if ($log['action_type'] === 'Extend Service'): ?>
                                            <span class="badge rounded-pill fw-semibold py-2 px-3" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-size:0.72rem;">
                                                <i class="fas fa-gift me-1"></i> Credit Given
                                            </span>
                                        <?php else: ?>
                                            <a href="?tab=recharge_invoice&id=<?= $log['id'] ?>" class="btn btn-outline-primary btn-sm rounded-pill" target="_blank">
                                                <i class="fas fa-file-invoice me-1"></i> View Invoice
                                            </a>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<!-- Due Statement Modal -->
<div class="modal fade" id="dueStatementModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header bg-info text-white">
                <h5 class="modal-title"><i class="fas fa-file-invoice-dollar"></i> Due Statement</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div class="bg-light p-2 border-bottom">
                    <form method="GET" action="" class="d-flex align-items-center m-0">
                        <input type="hidden" name="tab" value="profile">
                        <input type="hidden" name="view_id" value="<?= $client_id ?>">
                        <label class="form-label mb-0 fw-bold small me-2 text-nowrap">Filter Month:</label>
                        <input type="month" name="due_month" class="form-control form-control-sm me-2" style="max-width: 200px;" value="<?= htmlspecialchars($due_month) ?>">
                        <button type="submit" class="btn btn-primary btn-sm me-2">Apply</button>
                        <a href="?tab=profile&view_id=<?= $client_id ?>" class="btn btn-outline-secondary btn-sm">Reset</a>
                    </form>
                </div>
                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-hover align-middle mb-0 text-nowrap">
                        <thead class="table-light">
                            <tr>
                                <th>Date & Time</th>
                                <th>Action</th>
                                <th>Description</th>
                                <th>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if(empty($due_statement)): ?>
                            <tr>
                                <td colspan="4" class="text-center py-4 text-muted">No due transactions found.</td>
                            </tr>
                            <?php else: ?>
                                <?php foreach($due_statement as $log): 
                                    $is_paid = in_array($log['action_type'], ['Pay Due', 'Collect Expire']);
                                    $type_badge = $is_paid ? '<span class="badge bg-success">Paid</span>' : '<span class="badge bg-danger">Taken</span>';
                                ?>
                                <tr>
                                    <td class="text-nowrap small"><?= date('d M Y, h:i A', strtotime($log['timestamp'])) ?></td>
                                    <td><span class="fw-bold small"><?= $log['action_type'] ?></span></td>
                                    <td class="small text-muted" style="max-width: 300px; white-space: normal;"><?= $log['description'] ?></td>
                                    <td><?= $type_badge ?></td>
                                </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer bg-light">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<!-- Pay Due Modal -->
<div class="modal fade" id="payDueModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title"><i class="fas fa-hand-holding-usd"></i> Collect Due Payment</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                <div class="mb-3">
                    <label class="form-label text-muted small fw-bold">Amount Receiving (৳)</label>
                    <input type="number" name="amount" class="form-control" step="0.01" value="<?= $c['due'] ?? 0 ?>" required>
                </div>
                <div class="mb-3">
                    <label class="form-label text-muted small fw-bold">Payment Method</label>
                    <select name="pay_method" id="paydue_pay_method" class="form-select">
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank</option>
                        <option value="bKash">bKash</option>
                        <option value="Nagad">Nagad</option>
                        <option value="Rocket">Rocket</option>
                    </select>
                </div>
                <div id="paydue_trx_id_div" class="mb-3" style="display:none;">
                    <label class="form-label text-muted small fw-bold text-primary">Transaction ID (Required)</label>
                    <input type="text" name="trx_id" id="paydue_trx_id_input" class="form-control border-primary" placeholder="Enter Transaction ID">
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="pay_client_due" class="btn btn-success">Mark as Paid</button>
            </div>
        </form>
    </div>
</div>

<!-- Change Package Modal -->
<div class="modal fade" id="changePackageModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-primary text-white">
                <h5 class="modal-title"><i class="fas fa-exchange-alt"></i> Change Package</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                <div class="mb-3">
                    <label class="form-label text-muted small fw-bold">New Package</label>
                    <select name="pkg" id="quickPkgSelect" class="form-select border-primary shadow-sm">
                        <?php foreach($services as $s): 
                            $sellPrice = getSellPrice($pdo, $c['manager_id'], $s['id']);
                        ?>
                            <option value="<?= $s['name'] ?>" data-price="<?= $sellPrice ?>" data-vat="<?= $s['vat_percent'] ?? 0 ?>" <?= ($c['user_package']==$s['name'])?'selected':'' ?>><?= $s['name'] ?> (<?= number_format($sellPrice,0) ?>৳)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label text-muted small fw-bold">Daily Discount (Tk) *Optional</label>
                        <input type="number" name="discount" id="quickDiscountAmount" class="form-control" value="0" min="0" step="0.01">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label text-muted small fw-bold">New Base Bill Amount</label>
                        <div class="input-group">
                            <span class="input-group-text bg-light">৳</span>
                            <input type="number" name="bill" id="quickBillAmount" class="form-control fw-bold" value="<?= $c['bill_amount'] ?>" required readonly>
                        </div>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label text-muted small fw-bold d-block">Adjusted Due Balance <span class="badge bg-danger rounded-pill float-end" id="quickProrateHint" style="display:none;"></span></label>
                    <div class="input-group">
                        <span class="input-group-text bg-danger text-white border-danger">৳</span>
                        <input type="number" name="due" id="quickDueAmount" class="form-control fw-bold text-danger border-danger" value="<?= $c['due'] ?? 0 ?>" min="0" step="0.01">
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="quick_change_package" class="btn btn-primary shadow-sm"><i class="fas fa-save me-1"></i> Update Package</button>
            </div>
        </form>
    </div>
</div>
<script>
    // JS Logic for Quick Package Change Modal
    (function() {
        const pkgSelect = document.getElementById('quickPkgSelect');
        const discountInput = document.getElementById('quickDiscountAmount');
        const billInput = document.getElementById('quickBillAmount');
        const dueInput = document.getElementById('quickDueAmount');
        const hintEl = document.getElementById('quickProrateHint');
        
        const originalPkg = "<?= htmlspecialchars($original_pkg, ENT_QUOTES) ?>";
        const originalPrice = <?= $original_price ?>;
        const remainingDays = <?= $remaining_days ?>;
        let baseDue = <?= $original_due ?>;
        let lastExtraCharge = 0;

        function calc() {
            if(!pkgSelect) return;
            const selected = pkgSelect.options[pkgSelect.selectedIndex];
            if (!selected || selected.value === "") return;

            const price = parseFloat(selected.getAttribute('data-price')) || 0;
            const vat = parseFloat(selected.getAttribute('data-vat')) || 0;
            const discount = parseFloat(discountInput.value) || 0;
            
            if(price > 0) {
                let total = price + (price * vat / 100);
                total = total - discount;
                if (total < 0) total = 0;
                billInput.value = total.toFixed(2);
            }
            
            if (remainingDays > 0) {
                let extraCharge = 0;
                if (selected.value !== originalPkg && price > originalPrice) {
                    let dailyDiff = (price - originalPrice) / 30;
                    extraCharge = dailyDiff * remainingDays;
                }
                
                let currentInputVal = parseFloat(dueInput.value) || 0;
                if (Math.abs(currentInputVal - (baseDue + lastExtraCharge)) > 0.01) {
                    baseDue = currentInputVal - lastExtraCharge;
                    if (baseDue < 0) baseDue = 0;
                }
                
                let newDue = baseDue + extraCharge;
                dueInput.value = newDue.toFixed(2);
                lastExtraCharge = extraCharge;
                
                if (extraCharge > 0) {
                    hintEl.innerHTML = `+৳${extraCharge.toFixed(2)} Prorated Charge`;
                    hintEl.style.display = 'inline-block';
                } else {
                    hintEl.style.display = 'none';
                }
            }
        }

        if(pkgSelect) pkgSelect.addEventListener('change', calc);
        if(discountInput) discountInput.addEventListener('input', calc);
        if(dueInput) dueInput.addEventListener('input', function() {
            let currentInputVal = parseFloat(this.value) || 0;
            baseDue = currentInputVal - lastExtraCharge;
            if (baseDue < 0) baseDue = 0;
        });
    })();
</script>

<!-- Modal for Confirms -->
<div class="modal fade" id="confirmModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header"><h5 class="modal-title" id="confirmTitle">Confirm</h5></div>
            <div class="modal-body" id="confirmBody"></div>
            <div class="modal-footer">
                <input type="hidden" name="id" id="confirmId">
                <input type="hidden" name="current_status" id="confirmCurStatus">
                <input type="hidden" name="extension_days" id="confirmExtDays">
                <input type="hidden" name="action" id="confirmActionInput">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">No</button>
                <button type="submit" name="" id="confirmSubmitBtn" class="btn btn-primary">Yes, Proccess</button>
            </div>
        </form>
    </div>
</div>

<script>
    // Toggle manual days input based on offer selection
    function toggleManualDays(sel) {
        const wrap = document.getElementById('manual_days_div');
        const input = wrap ? wrap.querySelector('input[name="days"]') : null;
        const mode = document.getElementById('manual_recharge_mode');
        const isCustom = (sel.value === 'custom');
        if (wrap) wrap.style.display = isCustom ? 'block' : 'none';
        // Critical: hidden Manual Days must never be submitted during Regular Recharge.
        // Otherwise an old value (e.g. 3) can silently turn a 30-day recharge into 3 days.
        if (input) input.disabled = !isCustom;
        if (mode) mode.value = isCustom ? 'manual' : (sel.value === '0' ? 'regular' : 'offer');
    }

    function toggleTrxId(sel, divId, inputId) {
        const div = document.getElementById(divId);
        const input = document.getElementById(inputId);
        const label = div.querySelector('label');
        const methodsRequiringTrx = ['Bank', 'bKash', 'Nagad', 'Rocket'];
        
        if (methodsRequiringTrx.includes(sel.value)) {
            div.style.display = 'block';
            input.setAttribute('required', 'required');
            input.placeholder = "Transaction ID";
            if (label) label.innerHTML = "Transaction ID (Required)";
        } else if (sel.value === 'Cash') {
            div.style.display = 'block';
            input.removeAttribute('required');
            input.placeholder = "Memo No (Optional)";
            if (label) label.innerHTML = "Memo No (Optional)";
        } else {
            div.style.display = 'none';
            input.removeAttribute('required');
        }
    }

    function confirmAction(action, id, extra) {
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        document.getElementById('confirmId').value = id;
        document.getElementById('confirmActionInput').value = action;
        document.getElementById('confirmSubmitBtn').name = action;
        
        if(action === 'toggle_service') {
            document.getElementById('confirmTitle').innerText = "Toggle Service";
            document.getElementById('confirmBody').innerText = "Are you sure you want to change the status of this client?";
            document.getElementById('confirmCurStatus').value = extra;
        } else if(action === 'extend_service') {
             document.getElementById('confirmTitle').innerText = "Extend Service";
             document.getElementById('confirmBody').innerText = "Give " + extra + " days of credit extension to this user?";
             document.getElementById('confirmExtDays').value = extra;
        }
        modal.show();
    }

    // Graph & Live Traffic Logic
    const CLIENT_ID = <?= $c['id'] ?>;
    const POLLING_INTERVAL = 5000;

    const ctx = document.getElementById('bwChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Download (Mbps)',
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.08)',
                data: [], fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2
            }, {
                label: 'Upload (Mbps)',
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.08)',
                data: [], fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: {
                x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 9 } } },
                y: { display: true, beginAtZero: true, title: { display: true, text: 'Mbps', font: { size: 10 } } }
            },
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } } }
        }
    });

    function formatBytesJS(bytes, decimals = 2) {
        if (!+bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
    }

    function formatDateTimeJS(dtStr) {
        if (!dtStr) return '--';
        const dt = new Date(dtStr.replace(' ', 'T'));
        return dt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function el(id) { return document.getElementById(id); }

    function updateGraph() {
        fetch('?ajax_bw=1&uid=' + CLIENT_ID)
        .then(r => r.json())
        .then(d => {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const is_active = (d.status === 'online');

            // Chart data
            if (chart.data.labels.length > 40) {
                chart.data.labels.shift();
                chart.data.datasets.forEach(ds => ds.data.shift());
            }
            chart.data.labels.push(now);
            const down_mbps = is_active ? (parseFloat(d.down_speed) || 0) : 0;
            const up_mbps   = is_active ? (parseFloat(d.up_speed)   || 0) : 0;
            chart.data.datasets[0].data.push(down_mbps);
            chart.data.datasets[1].data.push(up_mbps);
            chart.update('none');

            // Speed badges
            if (el('live_rx')) el('live_rx').innerText = down_mbps.toFixed(2);
            if (el('live_tx')) el('live_tx').innerText = up_mbps.toFixed(2);

            // LIVE / OFFLINE badge
            const badge = el('live_badge');
            if (badge) {
                badge.innerText = is_active ? '\u25CF LIVE' : '\u25CB OFFLINE';
                badge.className = 'badge rounded-pill ms-1 ' + (is_active ? 'bg-success' : 'bg-secondary');
                badge.style.fontSize = '10px';
            }

            // Status light
            const light = el('status_light');
            if (light) light.style.backgroundColor = is_active ? '#28a745' : '#dc3545';

            // IP / MAC display
            const liveIpSpan   = el('live_mikrotik_ip');
            const liveMacSpan  = el('live_mikrotik_mac');
            const callerIdSpan = el('live_caller_id');
            if (liveIpSpan)  liveIpSpan.innerHTML  = is_active ? (d.ip || 'Connected') : '<span class="text-muted fw-normal">Offline</span>';
            if (liveMacSpan) liveMacSpan.innerHTML = (is_active && d.mac) ? `<i class="fas fa-satellite-dish me-1 small"></i>${d.mac}` : '--';
            if (callerIdSpan) {
                callerIdSpan.innerHTML = (is_active && d.mac)
                    ? `<span class="text-success fw-bold">${d.mac}</span>`
                    : `<?= $mac ?>`;
            }
            if (is_active && d.mac) {
                fetchOnuSignal(d.mac);
            }

            // Session & Daily stats
            if (el('session_down'))  el('session_down').innerText  = formatBytesJS(d.session_rx    || 0);
            if (el('session_up'))    el('session_up').innerText    = formatBytesJS(d.session_tx    || 0);
            if (el('session_total')) el('session_total').innerText = formatBytesJS(d.session_total || 0);
            if (el('daily_total'))   el('daily_total').innerText   = formatBytesJS(d.daily_total   || 0);
            if (el('session_uptime'))el('session_uptime').innerText= d.uptime || '0:00:00';

            // Offline last-session banner
            const banner = el('offline_banner');
            if (banner) {
                if (!is_active && d.last_session_ended) {
                    banner.classList.remove('d-none');
                    if (el('last_online_time'))  el('last_online_time').innerText  = formatDateTimeJS(d.last_session_ended);
                    if (el('last_session_used')) el('last_session_used').innerText = formatBytesJS(d.last_session_total || 0);
                } else {
                    banner.classList.add('d-none');
                }
            }
        })
        .catch(err => {
            console.error("Graph Poll Error:", err);
            if (chart.data.labels.length > 0) {
                chart.data.labels.push(new Date().toLocaleTimeString());
                chart.data.datasets.forEach(ds => ds.data.push(0));
                chart.update('none');
            }
        });
    }

    function pollGraph() { updateGraph(); setTimeout(pollGraph, POLLING_INTERVAL); }

    // Start polling
    pollGraph();

    function openLeftModal(id) {
        document.getElementById('leftClientId').value = id;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('leftModal')).show();
    }

    // ONU Signal Function
    let lastOnuMac = '';
    
    function fetchOnuSignal(ONU_MAC) {
        if (!ONU_MAC || ONU_MAC === 'N/A' || ONU_MAC === '') return;
        if (ONU_MAC === lastOnuMac) return; // Prevent duplicate identical requests
        
        const signalContainer = document.getElementById('onu_signal_container');
        if(signalContainer) {
            signalContainer.style.display = 'block';
            signalContainer.innerHTML = `<div class="alert alert-light border p-2 mb-0 small text-muted"><i class="fas fa-spinner fa-spin me-1"></i> Checking ONU Signal...</div>`;
            
            fetch(`index.php?ajax_find_onu_signal=1&mac=${encodeURIComponent(ONU_MAC)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        signalContainer.innerHTML = `<div class="alert alert-light border p-2 mb-0 small text-muted"><i class="fas fa-info-circle me-1"></i> ${data.error}</div>`;
                        lastOnuMac = ''; // Allow retry explicitly if it errors out softly
                    } else {
                        lastOnuMac = ONU_MAC; // Lock the MAC so it doesn't infinite loop on polling
                        let rx = data.rx || data.rx_power || 'N/A';
                        let tx = data.tx || data.tx_power || 'N/A';
                        
                        let rx_val = parseFloat(rx);
                        let rx_class = 'text-success';
                        if (rx_val < -27) rx_class = 'text-danger fw-bold';
                        else if (rx_val < -24) rx_class = 'text-warning fw-bold';

                        signalContainer.innerHTML = `
                            <div class="card border-0 shadow-sm rounded-3 mt-3 overflow-hidden bg-white">
                                <div class="card-header text-white d-flex justify-content-between align-items-center py-2" style="background-color: #2c3e50; font-size: 0.85rem;">
                                    <span class="fw-bold"><i class="fas fa-network-wired me-2"></i> ONU Monitor (Matched)</span>
                                    <span class="badge ${data.status === 'Online' ? 'bg-success' : 'bg-danger'}">${data.status || 'Online'}</span>
                                </div>
                                <div class="card-body p-3 bg-light" style="font-size: 0.85rem; border-left: 4px solid ${rx_val < -27 ? '#dc3545' : (rx_val < -24 ? '#ffc107' : '#198754')};">
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">OLT Name:</span>
                                        <strong class="text-dark">${data.olt_name} <span class="text-secondary small">(${data.interface})</span></strong>
                                    </div>
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">ONU MAC:</span>
                                        <span class="fw-bold font-monospace text-primary" style="letter-spacing: 0.5px;">${data.onu_mac}</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">Rx Power (Signal):</span>
                                        <span class="${rx_class} fw-bold" style="font-size: 0.95rem;">${rx} dBm</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">Tx Power:</span>
                                        <strong class="text-dark">${tx} dBm</strong>
                                    </div>
                                    ` + (data.uptime && data.uptime !== 'N/A' ? `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">ONU Uptime:</span>
                                        <strong class="text-dark">${data.uptime}</strong>
                                    </div>
                                    ` : '') + `
                                    ` + (data.temp && data.temp !== 'N/A' ? `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">ONU Temp/Volt:</span>
                                        <strong class="text-dark">${data.temp}°C / ${data.voltage}V</strong>
                                    </div>
                                    ` : '') + `
                                    ` + (data.distance && data.distance !== 'N/A' ? `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">Distance:</span>
                                        <strong class="text-dark">${data.distance} m</strong>
                                    </div>
                                    ` : '') + `
                                    ` + (data.vendor_id && data.vendor_id !== 'N/A' ? `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">Vendor ID:</span>
                                        <strong class="text-dark">${data.vendor_id}</strong>
                                    </div>
                                    ` : '') + `
                                    ` + (data.last_register && data.last_register !== 'N/A' ? `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">Last Register:</span>
                                        <strong class="text-dark" style="font-size:0.75rem">${data.last_register}</strong>
                                    </div>
                                    ` : '') + `
                                    ` + (data.last_deregister && data.last_deregister !== 'N/A' ? `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted">Last Deregister:</span>
                                        <strong class="text-dark" style="font-size:0.75rem">${data.last_deregister}</strong>
                                    </div>
                                    ` : '') + `
                                    ` + (data.deregister_reason && data.deregister_reason !== 'N/A' ? `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-danger">Reason:</span>
                                        <strong class="text-danger" style="font-size:0.75rem">${data.deregister_reason}</strong>
                                    </div>
                                    ` : '') + `
                                    <button type="button" class="btn btn-sm btn-outline-danger w-100 mt-2 py-1 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2 reboot-profile-onu-btn" 
                                            data-olt-id="${data.olt_id}" data-interface="${data.interface}" style="border-radius: 6px; transition: all 0.2s;">
                                        <i class="fas fa-power-off"></i> Reboot ONU
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                })
                .catch(e => {
                    console.error("ONU Signal Error:", e);
                    signalContainer.innerHTML = `<div class="alert alert-danger border p-2 mb-0 small"><i class="fas fa-exclamation-triangle me-1"></i> Network Error checking Signal</div>`;
                });
        }
    }

    function rebootProfileOnu(oltId, interfaceId, btn) {
        if(!confirm("Are you sure you want to reboot this ONU? This will temporarily disconnect the client.")) return;
        
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Rebooting...`;
        
        const params = new URLSearchParams();
        params.append('reboot_onu', '1');
        params.append('id', oltId);
        params.append('interface', interfaceId);
        params.append('ajax_action_flag', '1');
        
        fetch('index.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        })
        .then(res => res.json())
        .then(data => {
            if (data.status) {
                alert("Success: " + data.message);
                btn.innerHTML = `<i class="fas fa-check-circle"></i> Rebooted`;
                btn.className = "btn btn-sm btn-success w-100 mt-2 py-1 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2";
            } else {
                alert("Error: " + data.message);
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        })
        .catch(err => {
            console.error("Reboot error:", err);
            alert("Error: Failed to send reboot instruction.");
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        });
    }

    // Initial Database Check (in case Mikrotik is offline or API fails)
    fetchOnuSignal('<?= $c['onu_mac'] ?: ($mac != 'N/A' ? $mac : '') ?>');
</script>

<!-- Make Left Modal -->
<div class="modal fade" id="leftModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-danger text-white"><h5 class="modal-title">Confirm Termination</h5></div>
            <div class="modal-body">
                <input type="hidden" name="id" id="leftClientId">
                <input type="hidden" name="make_left_confirm" value="1">
                <input type="hidden" name="action" value="make_left_confirm">
                <p>Are you sure you want to mark this client as <strong>Left</strong>?</p>
                <div class="mb-3">
                    <label class="form-label fw-bold">Refund Method:</label>
                    <select name="refund_method" class="form-select" required>
                        <option value="Wallet">Wallet (Add to my balance)</option>
                        <option value="Cash">Cash (Manual settlement)</option>
                        <option value="None">No Refund</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="make_left_confirm" class="btn btn-danger">Confirm</button>
            </div>
        </form>
    </div>
</div>

<!-- Router Login Modal -->
<div class="modal fade" id="routerLoginModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header border-bottom shadow-sm bg-white">
                <h5 class="modal-title fw-bold text-dark">Client Router Details</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body bg-light p-3">
                <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                <table class="table table-bordered mb-0 bg-white shadow-sm" style="font-size: 0.9rem;">
                    <tbody>
                        <tr>
                            <td class="fw-bold align-middle text-muted" style="width: 35%;">Router IP:</td>
                            <td>
                                <div class="input-group input-group-sm">
                                    <input type="text" id="modal_router_ip" name="router_ip" class="form-control text-primary fw-bold" value="<?= htmlspecialchars($c['assigned_ip'] ?? '') ?>">
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td class="fw-bold align-middle text-muted">Router Model:</td>
                            <td>
                                <input type="text" name="router_model" class="form-control form-control-sm bg-light clear-n-a-on-focus" value="<?= htmlspecialchars($c['router_model'] ?? 'N/A') ?>">
                            </td>
                        </tr>
                        <tr>
                            <td class="fw-bold align-middle text-muted">Router Port:</td>
                            <td>
                                <input type="text" name="router_port" id="modal_router_port" class="form-control form-control-sm bg-light clear-n-a-on-focus" value="<?= htmlspecialchars($c['router_port'] ?? 'N/A') ?>">
                            </td>
                        </tr>
                        <tr>
                            <td class="fw-bold align-middle text-muted">Router Username:</td>
                            <td>
                                <input type="text" name="router_username" class="form-control form-control-sm bg-light clear-n-a-on-focus" value="<?= htmlspecialchars($c['router_username'] ?? 'N/A') ?>">
                            </td>
                        </tr>
                        <tr>
                            <td class="fw-bold align-middle text-muted">Router Password:</td>
                            <td>
                                <input type="text" name="router_password" class="form-control form-control-sm bg-light clear-n-a-on-focus" value="<?= htmlspecialchars($c['router_password'] ?? 'N/A') ?>">
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="modal-footer bg-white border-top justify-content-between">
                <button type="button" class="btn btn-light shadow-sm" data-bs-dismiss="modal">Close</button>
                <div>
                    <button type="button" class="btn btn-primary px-4 shadow-sm me-2" id="routerLoginGoBtn">Go</button>
                    <button type="submit" name="save_client_router_details" class="btn btn-info text-white px-4 shadow-sm">Save</button>
                </div>
            </div>
        </form>
    </div>
</div>

<!-- Send Custom SMS Modal -->
<div class="modal fade" id="sendCustomSmsModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title"><i class="fas fa-sms me-2"></i> Send Custom SMS</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="action" value="send_custom_sms">
                <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                <div class="mb-3">
                    <label class="form-label fw-bold small text-uppercase text-muted">Receiver Number</label>
                    <input type="text" class="form-control" value="<?= htmlspecialchars($c['phone']) ?>" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold small text-uppercase text-muted">Message Content</label>
                    <textarea name="message" class="form-control" rows="4" placeholder="Type your message here..." required></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light shadow-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-dark px-4 shadow-sm">Send SMS</button>
            </div>
        </form>
    </div>
</div>

<!-- Send Voice Reminder Modal -->
<div class="modal fade" id="sendVoiceReminderModal" tabindex="-1">
    <div class="modal-dialog">
        <?php
        $staff_id = $_SESSION['admin_id'];
        $cached_senders_json = get_voice_setting($pdo, $staff_id, 'voice_cached_senders');
        $cached_voices_json = get_voice_setting($pdo, $staff_id, 'voice_cached_voices');
        $senders_list = json_decode($cached_senders_json, true) ?: [];
        $voices_list = json_decode($cached_voices_json, true) ?: [];
        $default_sender = get_voice_setting($pdo, $staff_id, 'voice_sender');
        $default_voice = get_voice_setting($pdo, $staff_id, 'voice_voice_name');
        ?>
        <form method="POST" class="modal-content">
            <div class="modal-header bg-info text-white">
                <h5 class="modal-title text-white"><i class="fas fa-phone-alt me-2"></i> Send Voice Call Reminder</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="action" value="send_voice_reminder">
                <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                <div class="mb-3">
                    <label class="form-label fw-bold small text-uppercase text-muted">Receiver Number</label>
                    <input type="text" class="form-control" value="<?= htmlspecialchars($c['phone']) ?>" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold small text-uppercase text-muted">Caller ID (Sender)</label>
                    <select name="voice_sender" class="form-select" required>
                        <option value="">-- Select Active Sender --</option>
                        <?php foreach($senders_list as $snd): ?>
                            <?php if(isset($snd['status']) && strtolower($snd['status']) === 'active'): ?>
                                <option value="<?= htmlspecialchars($snd['callingNumber']) ?>" <?= $default_sender === $snd['callingNumber'] ? 'selected' : '' ?>><?= htmlspecialchars($snd['callingNumber']) ?></option>
                            <?php endif; ?>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold small text-uppercase text-muted">Voice Audio File</label>
                    <select name="voice_file" class="form-select" required>
                        <option value="">-- Select Approved Voice --</option>
                        <?php foreach($voices_list as $vc): ?>
                            <?php if(isset($vc['status']) && strtolower($vc['status']) === 'approved'): ?>
                                <option value="<?= htmlspecialchars($vc['name']) ?>" <?= $default_voice === $vc['name'] ? 'selected' : '' ?>><?= htmlspecialchars($vc['name']) ?></option>
                            <?php endif; ?>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light shadow-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-info text-white px-4 shadow-sm">Dispatch Reminder</button>
            </div>
        </form>
    </div>
</div>


<!-- Ping Modal -->
<div class="modal fade" id="pingModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow-lg">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title"><i class="fas fa-terminal me-2 text-primary"></i> Ping Report: <span id="pingTitle"></span></h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div class="p-3 border-bottom bg-light d-flex justify-content-between align-items-center">
                    <div id="pingIp" class="badge bg-white text-dark border px-3 py-2"></div>
                    <div class="small text-muted"><i class="fas fa-clock me-1"></i> Real-time</div>
                </div>
                <div id="pingResult" class="p-3" style="min-height: 200px; background: #fdfdfd;">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                        <div class="mt-2 text-muted">Requesting MikroTik...</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary btn-sm px-3" id="rePingBtn"><i class="fas fa-sync me-1"></i> Retest</button>
            </div>
        </div>
    </div>
</div>

<!-- Trace Modal -->
<div class="modal fade" id="traceModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content border-0 shadow-lg">
            <div class="modal-header bg-secondary text-white">
                <h5 class="modal-title"><i class="fas fa-route me-2"></i> IP Trace Route: <span id="traceTitle"></span></h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div id="traceIp" class="p-2 bg-light border-bottom small px-3"></div>
                <div id="traceResult" class="p-3" style="min-height: 200px;">
                    <div class="text-center py-5">
                        <div class="spinner-border text-secondary" role="status"></div>
                        <div class="mt-2 text-muted">Tracing path from MikroTik...</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-dark btn-sm px-3" id="reTraceBtn"><i class="fas fa-sync me-1"></i> Retrace</button>
            </div>
        </div>
    </div>
</div>

<script>
    let currentPingId = null;
    let currentPingCount = 4;
    function runPing(id, name, count = 4) {
        currentPingId = id;
        currentPingCount = count;
        document.getElementById('pingTitle').innerText = name;
        document.getElementById('pingIp').innerText = "Target: ...";
        document.getElementById('pingResult').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Pinging MikroTik...</div></div>';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('pingModal')).show();
        executePing();
    }
    function executePing() {
        if(!currentPingId) return;
        fetch(window.location.pathname + '?ajax_ping=1&id=' + currentPingId + '&count=' + currentPingCount)
            .then(r => r.json())
            .then(data => {
                if(data.success) {
                    document.getElementById('pingIp').innerText = "Target IP: " + data.ip;
                    document.getElementById('pingResult').innerHTML = data.html;
                } else {
                    document.getElementById('pingResult').innerHTML = '<div class="alert alert-danger small m-2">' + (data.error || 'Unknown error') + '</div>';
                }
            }).catch(err => {
                document.getElementById('pingResult').innerHTML = '<div class="alert alert-danger small m-2">Request Failed: ' + err + '</div>';
            });
    }
    document.getElementById('rePingBtn').addEventListener('click', function() {
        document.getElementById('pingResult').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Pinging...</div></div>';
        executePing();
    });

    let currentTraceId = null;
    function runTrace(id, name) {
        currentTraceId = id;
        document.getElementById('traceTitle').innerText = name;
        document.getElementById('traceIp').innerText = "Target: ...";
        document.getElementById('traceResult').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-secondary" role="status"></div><div class="mt-2 text-muted">Tracing...</div></div>';
        new bootstrap.Modal(document.getElementById('traceModal')).show();
        executeTrace();
    }
    function executeTrace() {
        if(!currentTraceId) return;
        fetch('?ajax_trace=1&id=' + currentTraceId)
            .then(r => r.json())
            .then(data => {
                if(data.success) {
                    document.getElementById('traceIp').innerText = "Target IP: " + data.ip;
                    document.getElementById('traceResult').innerHTML = data.html;
                } else {
                    document.getElementById('traceResult').innerHTML = '<div class="alert alert-danger small m-2">' + data.error + '</div>';
                }
            }).catch(err => {
                document.getElementById('traceResult').innerHTML = '<div class="alert alert-danger small m-2">Request Failed: ' + err + '</div>';
            });
    }
    document.getElementById('reTraceBtn').addEventListener('click', function() {
        document.getElementById('traceResult').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-secondary" role="status"></div><div class="mt-2 text-muted">Tracing...</div></div>';
        executeTrace();
    });

    function openRouterLogin() {
        let ip = document.getElementById('modal_router_ip').value;
        let port = document.getElementById('modal_router_port').value;
        if (ip && ip !== '' && ip !== 'Offline' && ip !== 'N/A') {
            let url = 'http://' + ip;
            if (port && port !== 'N/A' && port !== '') {
                url += ':' + port;
            }
            window.open(url, '_blank');
        } else {
            alert('Cannot login: Valid Live IP is not available.');
        }
    }

    // Auto update modal IP when Live IP is fetched from AJAX
    document.addEventListener("DOMContentLoaded", function() {
        const liveIpSpan = document.getElementById('live_mikrotik_ip');
        if (liveIpSpan) {
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    let text = liveIpSpan.innerText.trim();
                    let modalIp = document.getElementById('modal_router_ip');
                    if (modalIp && text !== '' && text !== 'Offline' && text !== 'Connected') {
                        modalIp.value = text;
                    }
                });
            });
            observer.observe(liveIpSpan, { childList: true, subtree: true, characterData: true });
        }
    });
    <?php if(!empty($due_month)): ?>
    document.addEventListener("DOMContentLoaded", function() {
        var myModal = new bootstrap.Modal(document.getElementById('dueStatementModal'));
        myModal.show();
    });
    <?php endif; ?>
    <?php if(!empty($recharge_month)): ?>
    document.addEventListener("DOMContentLoaded", function() {
        var myModal = new bootstrap.Modal(document.getElementById('rechargeInvoicesModal'));
        myModal.show();
    });
    <?php endif; ?>
</script>

<!-- Return Support Device Modal (Profile Version) -->
<div class="modal fade" id="profileReturnModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" action="index.php?view_id=<?= $c['id'] ?>" class="modal-content">
            <div class="modal-header bg-success text-white border-0 py-3">
                <h5 class="modal-title fw-bold"><i class="fas fa-undo me-2"></i>Process Device Return</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
                <input type="hidden" name="action" value="return_support_device">
                <input type="hidden" name="support_id" id="profile_return_support_id">
                <input type="hidden" name="redirect_url" value="index.php?view_id=<?= $c['id'] ?>">
                
                <div class="bg-light p-3 rounded-3 mb-3 border small">
                    <div class="mb-1 text-dark"><strong>Device:</strong> <span id="profile_return_disp_product" class="fw-bold"></span></div>
                    <div class="mb-1 text-dark"><strong>Issued To:</strong> <span><?= htmlspecialchars($c['name']) ?> (<?= htmlspecialchars($c['user_id']) ?>)</span></div>
                    <div class="text-dark"><strong>Expected Return:</strong> <span id="profile_return_disp_expected" class="fw-bold text-danger"></span></div>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-bold text-muted small">Return Condition <span class="text-danger">*</span></label>
                    <input type="text" name="return_condition" class="form-control rounded-3" value="Good" placeholder="e.g. Good, Minor Scratches, Defective" required>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-bold text-muted small">Stock Status After Return <span class="text-danger">*</span></label>
                    <select name="stock_status" class="form-select rounded-3" required>
                        <option value="Available">Available (Return to Active Stock)</option>
                        <option value="Damaged">Damaged (Move to Damaged Inventory)</option>
                        <option value="Missing">Missing (Mark as Lost/Missing)</option>
                    </select>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-bold text-muted small">Return Remarks / Notes</label>
                    <textarea name="remarks" class="form-control rounded-3" rows="3" placeholder="e.g. Returned by customer, tested and working fine"></textarea>
                </div>
            </div>
            <div class="modal-footer bg-light border-0 py-3">
                <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-success rounded-pill px-4 shadow-sm fw-bold">Process Return</button>
            </div>
        </form>
    </div>
</div>

<script>
    let profileReturnModal = null;
    document.addEventListener("DOMContentLoaded", function() {
        profileReturnModal = new bootstrap.Modal(document.getElementById('profileReturnModal'));
    });

    function openProfileReturnModal(data) {
        document.getElementById('profile_return_support_id').value = data.id;
        document.getElementById('profile_return_disp_product').innerText = data.product_name + " (" + data.serial_mac + ")";
        let expected = data.expected_return_date;
        if (!expected || expected === '0000-00-00') {
            expected = 'Until Client Left';
        }
        document.getElementById('profile_return_disp_expected').innerText = expected;
        profileReturnModal.show();
    }
</script>

<!-- Add Follow-up Modal -->
<div class="modal fade" id="addFollowupModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <form method="POST" action="controllers/call_center_controller.php" class="modal-content border-0 shadow-lg rounded-3">
            <input type="hidden" name="action" value="add_followup">
            <input type="hidden" name="customer_id" value="<?= (int)$c['id'] ?>">
            <input type="hidden" name="log_id" id="followup_log_id" value="0">
            
            <div class="modal-header bg-dark text-white border-0 py-3">
                <h5 class="modal-title fw-bold"><i class="fas fa-calendar-plus me-2 text-warning"></i> Add Follow-up Note</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
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
                    <select name="status" id="followupStatusSelect" class="form-select rounded-3" required>
                        <option value="Pending">Pending (Requires call back)</option>
                        <option value="Call Back Later">Call Back Later</option>
                        <option value="Interested">Interested</option>
                        <option value="Not Interested">Not Interested</option>
                        <option value="Done">Done / Solved</option>
                    </select>
                </div>
                
                <div class="mb-3" id="nextFollowupDiv">
                    <label class="form-label small fw-bold text-muted">Next Follow-up Date</label>
                    <input type="date" name="next_followup_date" class="form-control rounded-3" min="<?= date('Y-m-d') ?>">
                </div>
                
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">Follow-up Date & Time <span class="text-danger">*</span></label>
                    <input type="datetime-local" name="followup_date" class="form-control rounded-3" value="<?= date('Y-m-d\TH:i') ?>" required>
                </div>
                
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">Staff Remark / Conversation Details <span class="text-danger">*</span></label>
                    <textarea name="note" class="form-control rounded-3" rows="3" placeholder="e.g. Talked to customer. Customer promised to pay due bill by tomorrow morning." required></textarea>
                </div>
            </div>
            <div class="modal-footer bg-light border-0 py-3">
                <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-dark rounded-pill px-4 shadow-sm fw-bold">Save Remarks</button>
            </div>
        </form>
    </div>
</div>

<!-- Promise Date Modal -->
<div class="modal fade" id="promiseDateModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <form method="POST" class="modal-content border-0 shadow-lg rounded-3">
            <input type="hidden" name="action" value="set_promise_date">
            <input type="hidden" name="uid" value="<?= $c['id'] ?>">
            
            <div class="modal-header text-white border-0 py-3" style="background: linear-gradient(135deg, #fd7e14, #6f42c1);">
                <h5 class="modal-title fw-bold"><i class="fas fa-handshake me-2"></i> Promise Date Setup</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
                <div class="form-check form-switch mb-3 p-0 d-flex justify-content-between align-items-center">
                    <label class="form-check-label fw-bold text-muted" for="promise_enabled">Enable Promise Period</label>
                    <input class="form-check-input ms-0" type="checkbox" name="promise_enabled" value="1" id="promise_enabled" <?= ($c['promise_enabled'] == 1) ? 'checked' : '' ?> style="width: 2.5em; height: 1.25em; cursor: pointer;">
                </div>
                
                <div class="mb-3" id="promiseDateInputDiv" style="<?= ($c['promise_enabled'] == 1) ? '' : 'display: none;' ?>">
                    <label class="form-label small fw-bold text-muted">Promise Valid Until <span class="text-danger">*</span></label>
                    <select name="promise_date" id="promise_date" class="form-select rounded-3">
                        <?php 
                        $selected_day = !empty($c['promise_date']) ? (int)date('d', strtotime($c['promise_date'])) : (int)date('d', strtotime('+7 days'));
                        for($d = 1; $d <= 31; $d++): 
                        ?>
                            <option value="<?= $d ?>" <?= ($selected_day == $d) ? 'selected' : '' ?>><?= $d . date('S', mktime(0,0,0,1,$d)) ?> of Month</option>
                        <?php endfor; ?>
                    </select>
                    <small class="text-muted italic mt-1 d-block">Client will remain active until the end of this day of the current or next month.</small>
                </div>
            </div>
            <div class="modal-footer bg-light border-0 py-3">
                <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-dark rounded-pill px-4 shadow-sm fw-bold">Save Changes</button>
            </div>
        </form>
    </div>
</div>

<script>
document.addEventListener("DOMContentLoaded", function() {
    // Local progress modal removed to fallback to global WebSIP Softphone

    // Recharge form event listeners
    const rechargeOfferSelect = document.getElementById('recharge_offer_select');
    if (rechargeOfferSelect) {
        rechargeOfferSelect.addEventListener('change', function() {
            toggleManualDays(this);
            updateManualRechargeAmounts();
        });
        toggleManualDays(rechargeOfferSelect);
    }

    // Live manual recharge amount preview. Discount is always deducted from Bill Amount, never Cost Amount.
    const manualRechargeForm = document.getElementById('manualRechargeForm');
    const manualDiscountInput = document.getElementById('manual_recharge_discount');
    const manualDaysInput = manualRechargeForm ? manualRechargeForm.querySelector('input[name="days"]') : null;

    function updateManualRechargeAmounts() {
        if (!manualRechargeForm) return;
        const monthlyBill = parseFloat(manualRechargeForm.dataset.monthlyBill || '0') || 0;
        const monthlyCost = parseFloat(manualRechargeForm.dataset.monthlyCost || '0') || 0;
        let billingDays = 30;

        if (rechargeOfferSelect) {
            if (rechargeOfferSelect.value === 'custom') {
                billingDays = Math.max(1, parseInt(manualDaysInput ? manualDaysInput.value : '30', 10) || 30);
            } else if (rechargeOfferSelect.value !== '0') {
                const selectedOption = rechargeOfferSelect.options[rechargeOfferSelect.selectedIndex];
                billingDays = Math.max(1, parseInt(selectedOption.dataset.billingDays || '30', 10) || 30);
            }
        }

        const billAmount = Math.max(0, (monthlyBill / 30) * billingDays);
        const costAmount = Math.max(0, (monthlyCost / 30) * billingDays);
        let discount = manualDiscountInput ? (parseFloat(manualDiscountInput.value || '0') || 0) : 0;
        discount = Math.max(0, Math.min(discount, billAmount));
        if (manualDiscountInput && (parseFloat(manualDiscountInput.value || '0') || 0) > billAmount) {
            manualDiscountInput.value = billAmount.toFixed(2);
        }
        const netAmount = Math.max(0, billAmount - discount);

        const billEl = document.getElementById('manual_recharge_bill_amount');
        const costEl = document.getElementById('manual_recharge_cost_amount');
        const netEl = document.getElementById('manual_recharge_net_amount');
        const billInput = document.getElementById('manual_recharge_bill_amount_input');
        const costInput = document.getElementById('manual_recharge_cost_amount_input');
        const netInput = document.getElementById('manual_recharge_net_amount_input');
        const billFormatted = billAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const costFormatted = costAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const netFormatted = netAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        if (billEl) billEl.textContent = '৳' + billFormatted;
        if (costEl) costEl.textContent = '৳' + costFormatted;
        if (netEl) netEl.textContent = '৳' + netFormatted;
        if (billInput) billInput.value = billAmount.toFixed(2);
        if (costInput) costInput.value = costAmount.toFixed(2);
        if (netInput) netInput.value = netAmount.toFixed(2);
    }

    if (manualDiscountInput) manualDiscountInput.addEventListener('input', updateManualRechargeAmounts);
    if (manualDaysInput) manualDaysInput.addEventListener('input', updateManualRechargeAmounts);
    updateManualRechargeAmounts();

    const rechargePayMethodSelect = document.getElementById('recharge_pay_method');
    if (rechargePayMethodSelect) {
        const syncRechargeDueOption = function() {
            toggleTrxId(rechargePayMethodSelect, 'recharge_trx_id_div', 'recharge_trx_id_input');
            const dueCheck = document.getElementById('recharge_deduct_due');
            const dueWrap = document.getElementById('recharge_due_deduct_wrap');
            if (dueCheck) {
                const isDueMethod = rechargePayMethodSelect.value === 'Expire';
                dueCheck.disabled = isDueMethod;
                if (isDueMethod) dueCheck.checked = false;
                if (dueWrap) dueWrap.style.opacity = isDueMethod ? '0.55' : '1';
            }
        };
        rechargePayMethodSelect.addEventListener('change', syncRechargeDueOption);
        syncRechargeDueOption();
    }

    // Pay Due modal event listeners
    const payduePayMethodSelect = document.getElementById('paydue_pay_method');
    if (payduePayMethodSelect) {
        payduePayMethodSelect.addEventListener('change', function() {
            toggleTrxId(this, 'paydue_trx_id_div', 'paydue_trx_id_input');
        });
        // Set initial visibility on load
        toggleTrxId(payduePayMethodSelect, 'paydue_trx_id_div', 'paydue_trx_id_input');
    }

    // Toggle Password
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', function() {
            const sp = document.getElementById('client_pass');
            const pwd = this.getAttribute('data-password');
            if (sp.innerText === '••••••') {
                sp.innerText = pwd;
                this.className = 'fas fa-eye-slash ms-2 text-muted';
            } else {
                sp.innerText = '••••••';
                this.className = 'fas fa-eye ms-2 text-muted';
            }
        });
    }

    // Ping & Trace Test
    document.querySelectorAll('.run-ping-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const name = this.getAttribute('data-name');
            const count = this.getAttribute('data-count') || 4;
            runPing(id, name, count);
        });
    });
    document.querySelectorAll('.run-trace-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const name = this.getAttribute('data-name');
            runTrace(id, name);
        });
    });

    // Disable, 3 Days Credit, Make Left Buttons
    const btnToggle = document.querySelector('.btn-toggle-service');
    if (btnToggle) {
        btnToggle.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const status = this.getAttribute('data-status');
            confirmAction('toggle_service', id, status);
        });
    }
    const btnExtend = document.querySelector('.btn-extend-service');
    if (btnExtend) {
        btnExtend.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const days = this.getAttribute('data-days');
            confirmAction('extend_service', id, days);
        });
    }
    const btnLeft = document.querySelector('.btn-make-left');
    if (btnLeft) {
        btnLeft.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            openLeftModal(id);
        });
    }

    // Call Timeline Tab
    const callTimelineTab = document.getElementById('call-timeline-tab');
    if (callTimelineTab) {
        callTimelineTab.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            loadCallTimeline(id);
        });
    }

    // Process Return Buttons
    document.querySelectorAll('.btn-profile-return').forEach(btn => {
        btn.addEventListener('click', function() {
            const dataStr = this.getAttribute('data-support');
            if (dataStr) {
                const data = JSON.parse(dataStr);
                openProfileReturnModal(data);
            }
        });
    });

    // SMS Filter controls
    const smsDateFrom = document.getElementById('smsDateFrom');
    const smsDateTo = document.getElementById('smsDateTo');
    const clearSmsFilterBtn = document.getElementById('clearSmsFilterBtn');
    if (smsDateFrom) smsDateFrom.addEventListener('change', filterSmsLogs);
    if (smsDateTo) smsDateTo.addEventListener('change', filterSmsLogs);
    if (clearSmsFilterBtn) {
        clearSmsFilterBtn.addEventListener('click', function() {
            if (smsDateFrom) smsDateFrom.value = '';
            if (smsDateTo) smsDateTo.value = '';
            filterSmsLogs();
        });
    }

    // Router Login Go Button
    const routerLoginGoBtn = document.getElementById('routerLoginGoBtn');
    if (routerLoginGoBtn) {
        routerLoginGoBtn.addEventListener('click', openRouterLogin);
    }

    // Undo Recharge form submit confirmation
    const undoRechargeForm = document.getElementById('undoRechargeForm');
    if (undoRechargeForm) {
        undoRechargeForm.addEventListener('submit', function(e) {
            if (!confirm('Are you sure you want to refund and undo the most recent recharge?')) {
                e.preventDefault();
            }
        });
    }

    // Call Center Status Dropdown and Promise checkbox
    const followupStatusSelect = document.getElementById('followupStatusSelect');
    if (followupStatusSelect) {
        followupStatusSelect.addEventListener('change', function() {
            toggleNextFollowup(this.value);
        });
    }
    const promiseEnabledCheck = document.getElementById('promise_enabled');
    if (promiseEnabledCheck) {
        promiseEnabledCheck.addEventListener('change', function() {
            togglePromiseDateInput(this);
        });
    }

    // Reboot ONU (delegated on signalContainer to support dynamic html injection)
    const signalContainer = document.getElementById('onu_signal_container');
    if (signalContainer) {
        signalContainer.addEventListener('click', function(e) {
            const btn = e.target.closest('.reboot-profile-onu-btn');
            if (btn) {
                const oltId = btn.getAttribute('data-olt-id');
                const iface = btn.getAttribute('data-interface');
                rebootProfileOnu(oltId, iface, btn);
            }
        });
    }

    // Clear 'N/A' value on focus for specific inputs
    document.querySelectorAll('.clear-n-a-on-focus').forEach(el => {
        el.addEventListener('focus', function() {
            if (this.value === 'N/A') {
                this.value = '';
            }
        });
    });

    // Sync Single Client click handler
    document.querySelectorAll('.btn-sync-single-client').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const id = this.getAttribute('data-id');
            if (confirm('Refresh this client on MikroTik?')) {
                window.location.href = '?action=sync_single_client&id=' + id;
            }
        });
    });
});

function toggleNextFollowup(status) {
    let div = document.getElementById('nextFollowupDiv');
    if (status === 'Done' || status === 'Not Interested') {
        div.style.display = 'none';
    } else {
        div.style.display = 'block';
    }
}

function togglePromiseDateInput(chk) {
    let div = document.getElementById('promiseDateInputDiv');
    let dateInput = document.getElementById('promise_date');
    if (chk.checked) {
        div.style.display = 'block';
        dateInput.required = true;
    } else {
        div.style.display = 'none';
        dateInput.required = false;
    }
}

function loadCallTimeline(customerId) {
    let content = document.getElementById('callTimelineContent');
    let loading = document.getElementById('callTimelineLoading');
    
    content.innerHTML = '';
    loading.classList.remove('d-none');
    
    fetch('controllers/call_center_controller.php?action=get_customer_timeline&customer_id=' + customerId)
        .then(response => response.json())
        .then(data => {
            loading.classList.add('d-none');
            if (data.success) {
                content.innerHTML = data.html;
            } else {
                content.innerHTML = '<div class="alert alert-danger m-3">' + data.html + '</div>';
            }
        })
        .catch(err => {
            loading.classList.add('d-none');
            content.innerHTML = '<div class="alert alert-danger m-3">Failed to load Call Timeline logs.</div>';
        });
}


</script>
