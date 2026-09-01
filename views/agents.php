<?php
// AGENTS / STAFF VIEW
if (!hasRole('Admin')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$search = $_GET['search'] ?? '';
$query = "SELECT s.*, 
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE manager_id = s.id AND status = 'Active') as active_users,
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE manager_id = s.id AND status = 'Due') as due_users,
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE manager_id = s.id AND status NOT IN ('Active', 'Due', 'Left')) as inactive_users,
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE manager_id = s.id AND status = 'Left') as left_users
          FROM ".TBL_STAFF." s 
          WHERE s.role IN ('Reseller', 'SubReseller', 'Agent') AND s.status = 'Active'";
$params = [];

if ($search) {
    $query .= " AND (s.name LIKE ? OR s.username LIKE ? OR s.phone LIKE ?)";
    $params = ["%$search%", "%$search%", "%$search%"];
}
$query .= " ORDER BY s.id DESC";
$agents = safeFetchAll($pdo, $query, $params);

// Calculate Totals for Dashboard
$total_active = 0; $total_due = 0; $total_inactive = 0; $total_left = 0;
foreach($agents as $a) {
    $total_active += $a['active_users'];
    $total_due += $a['due_users'];
    $total_inactive += $a['inactive_users'];
    $total_left += $a['left_users'];
}

$routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS);
$all_services = safeFetchAll($pdo, "SELECT * FROM ".TBL_SERVICES);
$real_agents = safeFetchAll($pdo, "SELECT * FROM ".TBL_AGENTS);
?>

<style>
    .stat-badge {
        width: 26px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 !important;
        font-size: 0.8rem;
        border-radius: 4px;
        font-weight: 700;
    }
</style>

<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-user-shield me-2 text-primary"></i> Agents & Resellers</h4>
    <div class="d-flex flex-column flex-sm-row gap-2">
        <form class="d-flex">
            <input type="hidden" name="tab" value="agents">
            <div class="input-group input-group-sm">
                <input type="text" name="search" class="form-control border-primary" placeholder="Search reseller..." value="<?= htmlspecialchars($search) ?>">
                <button type="submit" class="btn btn-primary"><i class="fas fa-search"></i></button>
            </div>
        </form>
        <button type="button" id="btnAddAgent" class="btn btn-primary btn-sm rounded-pill px-3">
            <i class="fas fa-plus me-1"></i> Create New
        </button>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #40c057 0%, #2f9e44 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Active</div>
                <h4 class="mb-0 fw-bold"><?= $total_active ?></h4>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #fa5252 0%, #e03131 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Due</div>
                <h4 class="mb-0 fw-bold"><?= $total_due ?></h4>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #fab005 0%, #f08c00 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Inactive</div>
                <h4 class="mb-0 fw-bold"><?= $total_inactive ?></h4>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #868e96 0%, #495057 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Left</div>
                <h4 class="mb-0 fw-bold"><?= $total_left ?></h4>
            </div>
        </div>
    </div>
</div>

<div class="card shadow-sm border-0">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Reseller Info</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>User Stats</th>
                        <th>Balance</th>
                        <th>Due</th>
                        <th class="text-end pe-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($agents)): ?>
                        <tr><td colspan="6" class="text-center py-5 text-muted">No resellers found</td></tr>
                    <?php else: foreach($agents as $a): ?>
                        <tr>
                            <td class="ps-3">
                                <div class="fw-bold text-dark">
                                    <?= $a['name'] ?>
                                    <?php if(($a['lock_status']??'None') !== 'None'): ?>
                                        <span class="badge bg-danger ms-1" style="font-size:0.6rem"><i class="fas fa-lock"></i> <?= $a['lock_status'] ?></span>
                                    <?php endif; ?>
                                </div>
                                <div class="small text-muted"><?= $a['phone'] ?></div>
                                <?php if($a['address']): ?>
                                    <div class="small text-muted italic" style="font-size: 0.75rem;"><i class="fas fa-map-marker-alt me-1"></i><?= $a['address'] ?></div>
                                <?php endif; ?>
                            </td>
                            <td><span class="badge bg-light text-dark border"><?= $a['username'] ?></span></td>
                            <td><span class="badge bg-info-subtle text-info border border-info-subtle"><?= $a['role'] ?></span></td>
                            <td>
                                <div class="d-flex gap-1 flex-wrap">
                                    <span class="badge bg-success stat-badge" title="Active Users"><?= $a['active_users'] ?></span>
                                    <span class="badge bg-danger stat-badge" title="Due Users"><?= $a['due_users'] ?></span>
                                    <span class="badge bg-warning text-dark stat-badge" title="Inactive Users"><?= $a['inactive_users'] ?></span>
                                    <span class="badge bg-secondary stat-badge" title="Left Users"><?= $a['left_users'] ?></span>
                                </div>
                            </td>
                            <td class="fw-bold text-success">৳<?= number_format($a['balance'], 2) ?></td>
                            <td class="fw-bold text-danger">৳<?= number_format($a['due_balance'], 2) ?></td>
                            <td class="text-end pe-3">
                                <?php
                                    $agentJson = htmlspecialchars(json_encode($a, JSON_HEX_APOS | JSON_HEX_QUOT), ENT_QUOTES, 'UTF-8');
                                    $lockStatus = htmlspecialchars($a['lock_status'] ?? 'None', ENT_QUOTES, 'UTF-8');
                                    $lockNote   = htmlspecialchars($a['lock_note'] ?? '', ENT_QUOTES, 'UTF-8');
                                ?>
                                <div class="btn-group">
                                    <button type="button" class="btn btn-outline-success btn-sm btn-pop-fund"
                                        title="Give Funds"
                                        data-id="<?= $a['id'] ?>"
                                        data-name="<?= htmlspecialchars($a['name'], ENT_QUOTES) ?>">
                                        <i class="fas fa-plus-circle"></i>
                                    </button>
                                    <button type="button" class="btn btn-outline-danger btn-sm btn-pop-lock"
                                        title="Lock/Unlock Panel"
                                        data-id="<?= $a['id'] ?>"
                                        data-name="<?= htmlspecialchars($a['name'], ENT_QUOTES) ?>"
                                        data-lock-status="<?= $lockStatus ?>"
                                        data-lock-note="<?= $lockNote ?>">
                                        <i class="fas fa-user-lock"></i>
                                    </button>
                                    <?php if($a['due_balance'] > 0): ?>
                                        <button type="button" class="btn btn-outline-danger btn-sm btn-pop-collect"
                                            title="Collect Due"
                                            data-id="<?= $a['id'] ?>"
                                            data-name="<?= htmlspecialchars($a['name'], ENT_QUOTES) ?>"
                                            data-due="<?= $a['due_balance'] ?>">
                                            <i class="fas fa-hand-holding-usd"></i>
                                        </button>
                                    <?php endif; ?>
                                    <button type="button" class="btn btn-outline-primary btn-sm btn-pop-rates"
                                        title="Set Rates"
                                        data-agent="<?= $agentJson ?>">
                                        <i class="fas fa-tags"></i>
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary btn-sm btn-edit-agent"
                                        title="Edit"
                                        data-agent="<?= $agentJson ?>">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <div class="dropdown d-inline-block">
                                        <button type="button" class="btn btn-outline-dark btn-sm dropdown-toggle" data-bs-toggle="dropdown"><i class="fas fa-ellipsis-v"></i></button>
                                        <ul class="dropdown-menu dropdown-menu-end shadow">
                                            <li><a class="dropdown-item" href="?impersonate=<?= $a['id'] ?>"><i class="fas fa-user-ninja me-2 text-primary"></i> Login As</a></li>
                                            <li><a class="dropdown-item" href="?tab=reseller_statement&id=<?= $a['id'] ?>"><i class="fas fa-file-invoice-dollar me-2 text-info"></i> View Statement</a></li>
                                            <li><hr class="dropdown-divider"></li>
                                            <li><a class="dropdown-item text-danger btn-delete-agent" href="?tab=agents&action=delete_staff&id=<?= $a['id'] ?>"><i class="fas fa-user-slash me-2"></i> Make Left</a></li>
                                        </ul>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Add/Edit Modal -->
<div class="modal fade" id="agentModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="agentModalTitle">Create New Reseller</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="staff_id" id="s_id">
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Full Name</label>
                        <input type="text" name="name" id="s_name" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Phone No</label>
                        <input type="text" name="phone" id="s_phone" class="form-control form-control-sm" required>
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Username</label>
                        <input type="text" name="username" id="s_username" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Password</label>
                        <input type="text" name="password" id="s_password" class="form-control form-control-sm">
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">NID / ID Number</label>
                        <input type="text" name="nid" id="s_nid" class="form-control form-control-sm">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-danger">Advance Balance Limit (৳)</label>
                        <input type="number" name="advance_balance_limit" id="s_advance_balance_limit" class="form-control form-control-sm" placeholder="0.00" step="0.01">
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <div class="form-check form-switch mt-2">
                            <input class="form-check-input" type="checkbox" name="can_undo_recharge" id="s_can_undo_recharge" value="1">
                            <label class="form-check-label small fw-bold" for="s_can_undo_recharge">Enable Undo Recharge</label>
                        </div>
                    </div>
                </div>

                <div class="mb-2">
                    <label class="form-label small fw-bold">Address</label>
                    <textarea name="address" id="s_address" class="form-control form-control-sm" rows="2"></textarea>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Role</label>
                        <select name="role" id="s_role" class="form-select form-select-sm">
                            <option value="Reseller">Reseller</option>
                            <option value="SubReseller">SubReseller</option>
                            <option value="Agent">Agent</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Assign Router</label>
                        <select name="staff_router_id" id="s_router" class="form-select form-select-sm">
                            <option value="0">Global (Select Router)</option>
                            <?php foreach($routers as $r): ?>
                                <option value="<?= $r['id'] ?>"><?= $r['name'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>
                
                <h6 class="fw-bold text-primary mt-3 mb-2 border-bottom pb-1">Agent Commission</h6>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Select Agent (Optional)</label>
                        <select name="agent_id" id="s_agent_id" class="form-select form-select-sm">
                            <option value="0">-- No Agent --</option>
                            <?php foreach($real_agents as $ra): ?>
                                <option value="<?= $ra['id'] ?>"><?= $ra['name'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Commission Type</label>
                        <div class="d-flex gap-3">
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="commission_type" id="type_fixed" value="Fixed" checked onchange="toggleCommType()">
                                <label class="form-check-label small" for="type_fixed">Fixed Amount</label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="commission_type" id="type_package" value="Package" onchange="toggleCommType()">
                                <label class="form-check-label small" for="type_package">Package Wise</label>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mb-2" id="fixed_comm_div">
                    <label class="form-label small fw-bold">Fixed Commission Amount (BDT)</label>
                    <input type="number" name="agent_commission" id="s_agent_commission" class="form-control form-control-sm" placeholder="0.00" step="0.01">
                    <div class="form-text x-small">Agent gets this amount for every client created by this reseller.</div>
                </div>
                
                <div class="alert alert-info py-2 small d-none" id="package_comm_alert">
                    <i class="fas fa-info-circle me-1"></i> For <strong>Package Wise</strong> commission, please go to the <strong>Set Rates</strong> > <strong>Agent Rates</strong> section after creating the reseller.
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="create_staff" id="s_submit" class="btn btn-primary btn-sm">Save Reseller</button>
            </div>
        </form>
    </div>
</div>

<!-- Give Funds Modal -->
<div class="modal fade" id="fundModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title">Give Funds to Reseller</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="target_id" id="fundTargetId">
                <div class="mb-3">
                    <label class="form-label fw-bold">Reseller Name</label>
                    <input type="text" id="fundTargetName" class="form-control border-0 bg-light fw-bold" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Amount (BDT)</label>
                    <input type="number" name="amount" class="form-control form-control-lg border-primary" placeholder="0.00" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Payment Method</label>
                    <select name="method" class="form-select border-primary" required>
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank Transfer</option>
                        <option value="Online">Online Payment</option>
                        <option value="Due">Due / Credit</option>
                    </select>
                    <div class="form-text text-danger"><i class="fas fa-info-circle me-1"></i> Selecting 'Due' will increase the reseller's debt balance.</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="transfer_fund" class="btn btn-success px-4">Transfer Funds Now</button>
            </div>
        </form>
    </div>
</div>

<!-- Collect Due Modal -->
<div class="modal fade" id="collectModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-danger text-white">
                <h5 class="modal-title">Collect Due Fund</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="target_id" id="collectTargetId">
                <div class="mb-3">
                    <label class="form-label fw-bold">Reseller Name</label>
                    <input type="text" id="collectTargetName" class="form-control border-0 bg-light fw-bold" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Current Due Amount</label>
                    <div class="h3 text-danger fw-bold" id="collectDueDisplay">৳0.00</div>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Collection Amount</label>
                        <input type="number" name="amount" class="form-control" placeholder="0.00" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold fst-italic">Discount (Optional)</label>
                        <input type="number" name="discount" class="form-control" placeholder="0.00">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Collection Method</label>
                    <select name="method" class="form-select" required>
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank Transfer</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="collect_due" class="btn btn-danger px-4">Collect & Clear Due</button>
            </div>
        </form>
    </div>
</div>

<!-- Set Rates Modal -->
<div class="modal fade" id="ratesModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <form method="POST" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Configure Package Rates: <span id="rateResellerName" class="text-primary"></span></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="target_id" id="rateTargetId">
                <input type="hidden" name="set_agent_rates" value="1">
                <div class="alert alert-info py-2 small">
                    <i class="fas fa-calculator me-2"></i> Profit is calculated based on: <strong>Selling Price - (Admin Cost + Agent Comm)</strong>.
                </div>
                <div class="table-responsive">
                    <table class="table table-sm align-middle">
                        <thead>
                            <tr class="small text-muted text-uppercase">
                                <th>Package Name</th>
                                <th>Admin Cost</th>
                                <th width="150">Selling Price</th>
                                <th>Agent Comm.</th>
                                <th>Profit</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach($all_services as $s): ?>
                                <tr>
                                    <td class="fw-bold"><?= $s['name'] ?></td>
                                    <td>৳<?= number_format($s['buying_price'], 2) ?></td>
                                    <td>
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text">৳</span>
                                            <input type="number" name="rates[<?= $s['id'] ?>]" class="form-control rate-input" 
                                                   data-cost="<?= $s['buying_price'] ?>"
                                                   placeholder="<?= $s['price'] ?>" step="0.01">
                                        </div>
                                    </td>
                                    <td>
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text">৳</span>
                                            <input type="number" name="agent_rates[<?= $s['id'] ?>]" class="form-control agent-rate-input" placeholder="0.00" step="0.01">
                                        </div>
                                    </td>
                                    <td class="profit-cell fw-bold text-success">৳0.00</td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
                <button type="submit" name="set_rates" class="btn btn-primary btn-sm">Save Rates</button>
            </div>
        </form>
    </div>
</div>

<script src="assets/js/pop-branch-management.js?v=<?= APP_DEPLOYMENT_ID ?>"></script>


<!-- Lock Staff Modal -->
<div class="modal fade" id="lockStaffModal" tabindex="-1">
    <div class="modal-dialog"><form method="POST" class="modal-content">
        <input type="hidden" name="toggle_staff_lock" value="1">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(get_csrf_token(), ENT_QUOTES) ?>">
        <div class="modal-header bg-danger text-white"><h5 class="modal-title"><i class="fas fa-user-lock me-2"></i>Manage Lock Status</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
            <input type="hidden" name="staff_id" id="lockTargetId">
            <div class="mb-3">
                <label class="form-label fw-bold">Target Reseller</label>
                <input type="text" id="lockTargetName" class="form-control" readonly>
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold">Lock Mode</label>
                <select name="lock_type" id="lockTypeSelect" class="form-select">
                    <option value="None">Unlock (Normal Access)</option>
                    <option value="Panel">Panel Lock Only (MikroTik Clients Stay Unchanged)</option>
                    <option value="Full">Full Lock + Disable All Managed Clients</option>
                </select>
                <div class="form-text mt-2" id="lockHelpText"></div>
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold">Lock Note (Displayed to Reseller)</label>
                <textarea name="lock_note" id="lockNote" class="form-control" rows="3" placeholder="Reason for lockout..."></textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button type="submit" class="btn btn-danger w-100">Update Status</button>
        </div>
    </form></div>
</div>
