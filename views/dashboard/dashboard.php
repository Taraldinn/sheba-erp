<?php
// DASHBOARD VIEW
if (isOffice() && !hasRole('Admin') && !hasPermission('dashboard') && empty($is_pure_employee)) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. You do not have permission to access the Dashboard.</div></div>";
    return;
}

$sms_info = safeFetch($pdo, "SELECT sms_balance, can_use_global_sms FROM ".TBL_STAFF." WHERE id=?", [$user]);
$sms_bal = floatval($sms_info['sms_balance'] ?? 0);
$can_use_sms = ($sms_info['can_use_global_sms'] ?? 0) == 1;
?>

<?php if($can_use_sms && $sms_bal <= 50): ?>
<div class="alert alert-warning py-2 mb-3 border-0 shadow-sm overflow-hidden">
    <marquee behavior="scroll" direction="left" scrollamount="6" class="fw-bold">
        <i class="fas fa-exclamation-triangle me-2"></i> You should recharge balance for SMS. Your current SMS balance is low (৳<?= number_format($sms_bal, 2) ?>).
    </marquee>
</div>
<?php endif; ?>

<?php 
// Store Module Alerts
$dash_overdue_count = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE status='Issued' AND expected_return_date < CURDATE()")['count'] ?? 0;
$dash_due_today_count = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE status='Issued' AND expected_return_date = CURDATE()")['count'] ?? 0;
$dash_low_stock_query = "SELECT name, brand_model, COUNT(*) as available_count 
                         FROM " . TBL_STORE_PRODUCTS . " 
                         WHERE stock_status='Available' 
                         GROUP BY name, brand_model 
                         HAVING available_count < 3";
$dash_low_stock = safeFetchAll($pdo, $dash_low_stock_query);

if ($dash_overdue_count > 0 || $dash_due_today_count > 0 || !empty($dash_low_stock)):
?>
<div class="row g-2 mb-3">
    <?php if ($dash_overdue_count > 0): ?>
        <div class="col-md-4">
            <div class="alert alert-danger mb-0 d-flex align-items-center justify-content-between py-2 border-0 shadow-sm">
                <span><i class="fas fa-exclamation-circle me-2"></i> <strong><?= $dash_overdue_count ?></strong> support devices are overdue!</span>
                <a href="?tab=store_support&status=Overdue" class="btn btn-xs btn-danger text-decoration-none py-0 px-2 small ms-2 border text-white" style="font-size:0.75rem;">View</a>
            </div>
        </div>
    <?php endif; ?>
    <?php if ($dash_due_today_count > 0): ?>
        <div class="col-md-4">
            <div class="alert alert-warning mb-0 d-flex align-items-center justify-content-between py-2 border-0 shadow-sm text-dark">
                <span><i class="fas fa-calendar-day me-2"></i> <strong><?= $dash_due_today_count ?></strong> support devices due today.</span>
                <a href="?tab=store_support&status=Issued" class="btn btn-xs btn-warning text-dark text-decoration-none py-0 px-2 small ms-2 border" style="font-size:0.75rem;">View</a>
            </div>
        </div>
    <?php endif; ?>
    <?php if (!empty($dash_low_stock)): ?>
        <div class="col-md-4">
            <div class="alert alert-info mb-0 d-flex align-items-center justify-content-between py-2 border-0 shadow-sm text-dark">
                <span><i class="fas fa-cubes me-2"></i> Low stock: <strong><?= count($dash_low_stock) ?></strong> item types run low.</span>
                <a href="?tab=store_inventory" class="btn btn-xs btn-info text-dark text-decoration-none py-0 px-2 small ms-2 border" style="font-size:0.75rem;">Inventory</a>
            </div>
        </div>
    <?php endif; ?>
</div>
<?php endif; ?>


<?php
// Check if current user is an employee for attendance widget
$dash_today = date('Y-m-d');
$my_emp_dash = safeFetch($pdo, "SELECT * FROM " . TBL_HR_EMPLOYEES . " WHERE staff_user_id = ? AND employment_status='Active' LIMIT 1", [$user_id]);
if ($my_emp_dash):
    $my_att_dash = safeFetch($pdo, "SELECT * FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date = ?", [$my_emp_dash['id'], $dash_today]);
?>
<div class="row mb-4">
    <div class="col-12">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);">
            <div class="card-body d-flex justify-content-between align-items-center flex-wrap">
                <div class="d-flex align-items-center mb-3 mb-md-0">
                    <?php if (!empty($my_emp_dash['photo']) && file_exists(__DIR__ . '/../../' . $my_emp_dash['photo'])): ?>
                        <img src="<?= htmlspecialchars($my_emp_dash['photo']) ?>" alt="Profile" class="rounded-circle shadow-sm border border-2 border-primary me-3" style="width: 60px; height: 60px; object-fit: cover;">
                    <?php else: ?>
                        <div class="rounded-circle bg-white border border-2 border-primary d-flex align-items-center justify-content-center shadow-sm me-3" style="width: 60px; height: 60px;">
                            <i class="fas fa-user-tie fa-2x text-secondary"></i>
                        </div>
                    <?php endif; ?>
                    <div>
                        <h5 class="fw-bold mb-1">Welcome, <?= htmlspecialchars($my_emp_dash['full_name']) ?></h5>
                        <div class="text-muted small"><i class="fas fa-id-badge me-1"></i><?= htmlspecialchars($my_emp_dash['staff_id']) ?> | <?= htmlspecialchars($my_emp_dash['designation']) ?></div>
                    </div>
                </div>
                
                <div class="d-flex align-items-center bg-white p-2 rounded shadow-sm me-3 mb-3 mb-md-0">
                    <div class="text-center px-3 border-end">
                        <div class="small text-muted mb-1">Check In</div>
                        <h6 class="fw-bold text-dark mb-0">
                            <?= $my_att_dash && $my_att_dash['check_in'] ? date('h:i A', strtotime($my_att_dash['check_in'])) : '--:--' ?>
                            <?php if ($my_att_dash && $my_att_dash['status'] === 'Late'): ?>
                                <br><span class="badge bg-warning text-dark mt-1" style="font-size:0.65rem;">Late</span>
                            <?php endif; ?>
                        </h6>
                    </div>
                    <div class="text-center px-3">
                        <div class="small text-muted mb-1">Check Out</div>
                        <h6 class="fw-bold text-dark mb-0"><?= $my_att_dash && $my_att_dash['check_out'] ? date('h:i A', strtotime($my_att_dash['check_out'])) : '--:--' ?></h6>
                    </div>
                </div>

                <div>
                    <?php if (!$my_att_dash): ?>
                        <button id="btn-dash-attendance" class="btn btn-success px-4 py-2 shadow-sm fw-bold border-0" style="background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%);">
                            <i class="fas fa-sign-in-alt me-2"></i>Check-in Now
                        </button>
                    <?php elseif (empty($my_att_dash['check_out'])): ?>
                        <button id="btn-dash-attendance" class="btn btn-danger px-4 py-2 shadow-sm fw-bold border-0" style="background: linear-gradient(135deg, #ff8787 0%, #f03e3e 100%);">
                            <i class="fas fa-sign-out-alt me-2"></i>Check-out Now
                        </button>
                    <?php else: ?>
                        <span class="badge bg-success py-2 px-3 fw-bold shadow-sm"><i class="fas fa-check-circle me-1"></i> Completed</span>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>
</div>
<script>
document.addEventListener("DOMContentLoaded", function() {
    const attBtn = document.getElementById("btn-dash-attendance");
    if (attBtn) {
        attBtn.addEventListener("click", function() {
            attBtn.disabled = true;
            attBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
            
            fetch("index.php?action=self_check_in_out&ajax=1")
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert(data.message);
                        window.location.reload();
                    } else {
                        alert("Error: " + data.message);
                        attBtn.disabled = false;
                        attBtn.innerHTML = '<i class="fas fa-redo me-2"></i>Retry';
                    }
                })
                .catch(err => {
                    alert("Network error processing attendance.");
                    attBtn.disabled = false;
                    attBtn.innerHTML = '<i class="fas fa-redo me-2"></i>Retry';
                });
        });
    }
});
</script>
<?php endif; ?>

<?php if (empty($is_pure_employee)): ?>
<div class="row g-3 mb-4">
    <!-- Total Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #4c6ef5 0%, #364fc7 100%) !important;">
            <a href="?tab=total_clients" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Total Clients</div>
                            <h3 class="mb-0 fw-bold"><?= $total_clients ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-users fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- New Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #ae3ec9 0%, #862e9c 100%) !important;">
            <a href="?tab=new_clients" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">New Clients (This Month)</div>
                            <h3 class="mb-0 fw-bold"><?= $new_users_this_month ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-user-plus fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Active Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #51cf66 0%, #40c057 100%) !important;">
            <a href="?tab=clients" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Active Clients</div>
                            <h3 class="mb-0 fw-bold"><?= $active_users ?></h3>
                            <div class="small mt-1 opacity-75 fw-semibold" style="font-size: 0.72rem;">Bill: ৳<?= number_format($active_total_bill, 0) ?> | Cost: ৳<?= number_format($active_total_cost, 0) ?></div>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-check-circle fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Promise Active Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #fd7e14 0%, #6f42c1 100%) !important;">
            <a href="?tab=promise_active" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Promise Active</div>
                            <h3 class="mb-0 fw-bold"><?= $promise_active_users ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-handshake fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Free Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #15aabf 0%, #0b7285 100%) !important;">
            <a href="?tab=free_clients" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Free Clients</div>
                            <h3 class="mb-0 fw-bold"><?= $free_users ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-user-check fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Due Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #fd7e14 0%, #e8590c 100%) !important;">
            <a href="?tab=due_clients" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Due Clients</div>
                            <h3 class="mb-0 fw-bold"><?= $due_users ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-file-invoice-dollar fa-lg"></i></div>
                    </div>
                    <div class="mt-2 text-white-50 small fw-semibold" style="font-size: 0.75rem;">
                        <span class="text-white">Due Amt: ৳<?= number_format($due_total_amount) ?></span>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Expire Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #ff6b6b 0%, #fa5252 100%) !important;">
            <a href="?tab=due" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Expire</div>
                            <h3 class="mb-0 fw-bold"><?= $expire_users ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-exclamation-triangle fa-lg"></i></div>
                    </div>
                    <div class="mt-2 text-white-50 small fw-semibold" style="font-size: 0.75rem;">
                        <span class="text-white">Bill: ৳<?= number_format($expire_total_bill) ?></span> | Cost: ৳<?= number_format($expire_total_cost) ?>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Expire Today -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #fcc419 0%, #fab005 100%) !important;">
            <a href="?tab=expire_today" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Expire Today</div>
                            <h3 class="mb-0 fw-bold"><?= $expire_today ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-clock fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Expire in 2 Days -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #ff922b 0%, #f76707 100%) !important;">
            <a href="?tab=expire_in_2days" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Expire in 2 Days</div>
                            <h3 class="mb-0 fw-bold"><?= $expire_in_2days ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-clock fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Expire in 3 Days -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #ff7875 0%, #ff4d4f 100%) !important;">
            <a href="?tab=expire_in_3days" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Expire in 3 Days</div>
                            <h3 class="mb-0 fw-bold"><?= $expire_in_3days ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-clock fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Inactive -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #adb5bd 0%, #868e96 100%) !important;">
            <a href="?tab=inactive" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Inactive</div>
                            <h3 class="mb-0 fw-bold"><?= $inactive_users ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-user-times fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    
    <!-- Open Tickets -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #ae3ec9 0%, #9c27b0 100%) !important;">
            <a href="?tab=tickets" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Open Tickets</div>
                            <h3 class="mb-0 fw-bold"><?= $open_tickets ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-ticket-alt fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>

    <!-- Online -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #20c997 0%, #12b886 100%) !important;">
            <a href="?tab=online_clients" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Online Now</div>
                            <h3 class="mb-0 fw-bold" id="dash_online_user"><i class="fas fa-spinner fa-spin small"></i></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-signal fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Offline -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #845ef7 0%, #7048e8 100%) !important;">
            <a href="?tab=online_clients&view=offline" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                     <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Offline Now</div>
                            <h3 class="mb-0 fw-bold" id="dash_offline_user"><i class="fas fa-spinner fa-spin small"></i></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-ban fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Left -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #343a40 0%, #212529 100%) !important;">
            <a href="?tab=left_list" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Left Clients</div>
                            <h3 class="mb-0 fw-bold"><?= $left_users ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-user-minus fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- Revenue Today -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #339af0 0%, #228be6 100%) !important;">
            <a href="?tab=monthly_sales" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Today's Revenue</div>
                            <h3 class="mb-0 fw-bold">৳<?= number_format($revenue_today, 0) ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-chart-line fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <!-- SMS Balance -->
    <?php if($can_use_sms): ?>
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #f06595 0%, #d6336c 100%) !important;">
            <a href="?tab=<?= (hasRole('Admin') || hasPermission('wallet_deposit')) ? 'finance' : 'accounts' ?>" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">SMS Balance</div>
                            <h3 class="mb-0 fw-bold">৳<?= number_format($sms_bal, 2) ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-sms fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    <?php endif; ?>
</div>

<?php if (!empty($show_reseller_summary)): ?>
<div class="row mb-3 mt-4">
    <div class="col-12">
        <h5 class="fw-bold text-dark border-bottom pb-2">
            <i class="fas fa-store me-2 text-primary"></i> POP SUMMARY
        </h5>
    </div>
</div>

<div class="row g-3 mb-4">
    <!-- Total Reseller Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #4c6ef5 0%, #364fc7 100%) !important;">
            <a href="?tab=total_clients" class="text-decoration-none text-white d-block h-100 dropdown-item p-0">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center h-100">
                        <div>
                            <div class="small opacity-75 fw-semibold mb-1">Total POP Client</div>
                            <h3 class="mb-0 fw-bold"><?= $res_total ?></h3>
                        </div>
                        <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-users fa-lg"></i></div>
                    </div>
                </div>
            </a>
        </div>
    </div>
    
    <!-- Reseller Active Clients -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #51cf66 0%, #40c057 100%) !important;">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center h-100">
                    <div>
                        <div class="small opacity-75 fw-semibold mb-1">POP Active</div>
                        <h3 class="mb-0 fw-bold"><?= $res_active ?></h3>
                    </div>
                    <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-check-circle fa-lg"></i></div>
                </div>
            </div>
        </div>
    </div>

    <!-- This Month Joined -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #ae3ec9 0%, #862e9c 100%) !important;">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center h-100">
                    <div>
                        <div class="small opacity-75 fw-semibold mb-1">This Month Joined</div>
                        <h3 class="mb-0 fw-bold"><?= $res_joined ?></h3>
                    </div>
                    <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-user-plus fa-lg"></i></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Reseller Inactive -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #adb5bd 0%, #868e96 100%) !important;">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center h-100">
                    <div>
                        <div class="small opacity-75 fw-semibold mb-1">POP Inactive</div>
                        <h3 class="mb-0 fw-bold"><?= $res_inactive ?></h3>
                    </div>
                    <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-user-times fa-lg"></i></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Expired Only -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #ff6b6b 0%, #fa5252 100%) !important;">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center h-100">
                    <div>
                        <div class="small opacity-75 fw-semibold mb-1">Expired Only</div>
                        <h3 class="mb-0 fw-bold"><?= $res_expired ?></h3>
                    </div>
                    <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-exclamation-triangle fa-lg"></i></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Reseller Online -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #20c997 0%, #12b886 100%) !important;">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center h-100">
                    <div>
                        <div class="small opacity-75 fw-semibold mb-1">POP Online</div>
                        <h3 class="mb-0 fw-bold"><?= $res_online ?></h3>
                    </div>
                    <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-signal fa-lg"></i></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Reseller Offline -->
    <div class="col-12 col-sm-6 col-md-3">
        <div class="card border-0 text-white shadow h-100" style="background: linear-gradient(135deg, #845ef7 0%, #7048e8 100%) !important;">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center h-100">
                    <div>
                        <div class="small opacity-75 fw-semibold mb-1">POP Offline</div>
                        <h3 class="mb-0 fw-bold"><?= $res_offline ?></h3>
                    </div>
                    <div class="bg-white bg-opacity-25 rounded-circle p-2"><i class="fas fa-ban fa-lg"></i></div>
                </div>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>


<div class="row g-3 mb-4">
    <div class="col-md-7">
        <div class="card border-0 shadow-sm h-100">
            <div class="card-header bg-white border-bottom py-3">
                <h6 class="mb-0 fw-bold"><i class="fas fa-chart-bar me-2 text-primary"></i> Monthly Revenue (<?= date('Y') ?>)</h6>
            </div>
            <div class="card-body">
                <canvas id="revenueChart" height="150"></canvas>
            </div>
        </div>
    </div>
    <div class="col-md-5">
         <div class="card border-0 shadow-sm h-100">
             <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                <h6 class="mb-0 fw-bold"><i class="fas fa-list-alt me-2 text-info"></i> Monthly Performance</h6>
                <a href="?tab=monthly_sales" class="btn btn-sm btn-link p-0 text-decoration-none small">View Full</a>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-sm table-hover mb-0 mt-1" style="font-size: 0.85rem;">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Month</th>
                                <th class="text-end">New Users</th>
                                <th class="text-end">Revenue</th>
                                <th class="text-end pe-3">Profit</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php 
                            $m_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                            $current_m = (int)date('m');
                            for($i = $current_m; $i > max(0, $current_m - 6); $i--): 
                                $m_profit = $monthly_revenue[$i] - ($monthly_expenses[$i] ?? 0);
                            ?>
                            <tr>
                                <td class="ps-3"><?= $m_names[$i-1] ?></td>
                                <td class="text-end fw-bold text-primary"><?= number_format($monthly_new_users[$i] ?? 0, 0) ?></td>
                                <td class="text-end">৳<?= number_format($monthly_revenue[$i] ?? 0, 0) ?></td>
                                <td class="text-end pe-3 <?= $m_profit >= 0 ? 'text-success' : 'text-danger' ?>">৳<?= number_format($m_profit, 0) ?></td>
                            </tr>
                            <?php endfor; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-md-12">
         <div class="card border-0 shadow-sm h-100">
             <div class="card-header bg-white border-bottom py-3">
                <h6 class="mb-0 fw-bold"><i class="fas fa-chart-pie me-2 text-info"></i> Client Distribution</h6>
            </div>
            <div class="card-body position-relative">
                <div style="height: 250px;">
                    <canvas id="pkgChart"></canvas>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // Revenue Chart
    const ctxHas = document.getElementById('revenueChart');
    if(ctxHas) {
        new Chart(ctxHas, {
            type: 'bar',
            data: {
                labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
                datasets: [{
                    label: 'Revenue (BDT)',
                    data: <?= json_encode(array_values($monthly_revenue)) ?>,
                    backgroundColor: 'rgba(51, 154, 240, 0.6)',
                    borderColor: 'rgba(51, 154, 240, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { borderDash: [2, 2] } }, x: { grid: { display: false } } }
            }
        });
    }

    // Package Chart
    const ctxPkg = document.getElementById('pkgChart');
    if(ctxPkg) {
        new Chart(ctxPkg, {
            type: 'doughnut',
            data: {
                labels: <?= json_encode(array_keys($pkg_distribution)) ?>,
                datasets: [{
                    data: <?= json_encode(array_values($pkg_distribution)) ?>,
                    backgroundColor: [
                        '#4dabf7', '#51cf66', '#fcc419', '#ff6b6b', '#845ef7',
                        '#20c997', '#ff922b', '#fa5252', '#343a40', '#868e96'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } } 
                },
                cutout: '65%'
            }
        });
    }

    // Fetch Online Stats via AJAX for Speed
    fetch('?ajax_dashboard_stats=1')
    .then(r => r.json())
    .then(d => {
        document.getElementById('dash_online_user').innerText = d.online;
        document.getElementById('dash_offline_user').innerText = d.offline;
    })
    .catch(e => {
        document.getElementById('dash_online_user').innerText = '-';
        document.getElementById('dash_offline_user').innerText = '-';
    });
});
</script>

<div class="row">
    <div class="col-md-8">
        <div class="card shadow-sm h-100">
            <div class="card-header bg-white border-bottom py-3">
                <h6 class="mb-0"><i class="fas fa-history me-2"></i> Recent Activity</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Action</th>
                                <th>Details</th>
                                <th class="text-end pe-3">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php 
                            $user_id = $_SESSION['admin_id'] ?? 0;
                            $role = $_SESSION['user_role'] ?? '';
                            $managed = getManagedStaffIds($pdo, $user_id, $role);
                            
                            if ($managed === 'ALL') {
                                $logs = safeFetchAll($pdo, "SELECT * FROM ".TBL_LOGS." ORDER BY id DESC LIMIT 5");
                            } else {
                                $placeholders = implode(',', array_fill(0, count($managed), '?'));
                                $logs = safeFetchAll($pdo, "SELECT l.* FROM ".TBL_LOGS." l 
                                          WHERE l.staff_id IN ($placeholders) 
                                          AND l.admin_user NOT IN (SELECT username FROM ".TBL_STAFF." WHERE role IN ('Admin', 'Supervisor'))
                                          ORDER BY l.id DESC LIMIT 5", $managed);
                            }
                            if(empty($logs)): ?>
                                <tr><td colspan="3" class="text-center py-4 text-muted">No recent activity</td></tr>
                            <?php else: foreach($logs as $log): ?>
                                <tr>
                                    <td class="ps-3"><span class="badge bg-light text-dark"><?= $log['action_type'] ?></span></td>
                                    <td><?= $log['description'] ?></td>
                                    <td class="text-end pe-3 small text-muted"><?= date('H:i', strtotime($log['timestamp'])) ?></td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card shadow-sm h-100">
             <div class="card-header bg-white border-bottom py-3">
                <h6 class="mb-0"><i class="fas fa-plus me-2"></i> Quick Links</h6>
            </div>
            <div class="card-body">
                <div class="d-grid gap-2">
                    <a href="?tab=add_client" class="btn btn-outline-primary text-start"><i class="fas fa-user-plus me-2"></i> Add New Client</a>
                    <a href="?tab=due" class="btn btn-outline-danger text-start"><i class="fas fa-money-bill-wave me-2"></i> Collect Due</a>
                    <a href="?tab=accounts" class="btn btn-outline-success text-start"><i class="fas fa-wallet me-2"></i> Deposit Fund</a>
                    <a href="?tab=reports" class="btn btn-outline-dark text-start"><i class="fas fa-file-invoice me-2"></i> Sales Report</a>
                </div>
            </div>
        </div>
    </div>
</div>
<?php endif; // End check for pure employee dashboard widgets ?>
