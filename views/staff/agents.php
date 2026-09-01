<?php
// AGENTS / STAFF VIEW
if (!hasRole('Admin') && !hasPermission('resellers')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$search = $_GET['search'] ?? '';
$query = "SELECT s.*, p.name as parent_name,
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE (manager_id = s.id OR manager_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id = s.id)) AND status IN ('Active', 'Promise Active')) as active_users,
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE (manager_id = s.id OR manager_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id = s.id)) AND status = 'Free') as free_users,
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE (manager_id = s.id OR manager_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id = s.id)) AND status = 'Expire') as due_users,
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE (manager_id = s.id OR manager_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id = s.id)) AND status NOT IN ('Active', 'Promise Active', 'Free', 'Expire', 'Left')) as inactive_users,
          (SELECT COUNT(*) FROM ".TBL_USERS." WHERE (manager_id = s.id OR manager_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id = s.id)) AND status = 'Left') as left_users
          FROM ".TBL_STAFF." s 
          LEFT JOIN ".TBL_STAFF." p ON s.parent_id = p.id
          WHERE s.role IN ('Reseller', 'SubReseller', 'Agent') AND s.status = 'Active'";
$params = [];

if (!hasRole('Admin') && is_array($managed_ids)) {
    // Restricted view: only staff within the inherited hierarchy
    $m_placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $query .= " AND s.id IN ($m_placeholders)";
    $params = array_merge($params, $managed_ids);
} else {
    // Global view for Admin
    $query .= " AND (s.parent_id = 0 OR p.role IN ('Admin', 'Super Admin', 'Supervisor', 'Administrator', 'Office Manager', 'System Admin', 'TL', 'Executive'))";
}



if ($search) {
    $query .= " AND (s.name LIKE ? OR s.username LIKE ? OR s.phone LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

// Supervisor Filter
if (isset($_SESSION['user_role']) && strcasecmp($_SESSION['user_role'], 'Supervisor') === 0) {
    $sup_id = $_SESSION['admin_id'];
    $query .= " AND (s.supervisor_id = ? OR s.parent_id IN (SELECT id FROM ".TBL_STAFF." WHERE supervisor_id = ?))";
    $params[] = $sup_id;
    $params[] = $sup_id;
}

$query .= " ORDER BY s.id DESC";
$agents = safeFetchAll($pdo, $query, $params);

// Calculate Totals for Dashboard
$total_active = 0; $total_due = 0; $total_inactive = 0; $total_left = 0; $total_free = 0;
foreach($agents as $a) {
    $total_active += $a['active_users'];
    $total_due += $a['due_users'];
    $total_inactive += $a['inactive_users'];
    $total_left += $a['left_users'];
    $total_free += $a['free_users'];
}
$total_clients_all = $total_active + $total_free + $total_due + $total_inactive;

$agent_ids = array_column($agents, 'id');
$cards_stats = ['Active'=>['bill'=>0,'cost'=>0], 'Free'=>['bill'=>0,'cost'=>0], 'Expire'=>['bill'=>0,'cost'=>0], 'Left'=>['bill'=>0,'cost'=>0], 'Inactive'=>['bill'=>0,'cost'=>0]];
if (!empty($agent_ids)) {
    $placeholders = implode(',', array_fill(0, count($agent_ids), '?'));
    $total_stats = safeFetchAll($pdo, "
        SELECT u.status, 
               SUM(u.bill_amount) as bill, 
               SUM(
                   COALESCE(
                       (SELECT p.custom_price FROM ".TBL_PRICING." p JOIN ".TBL_SERVICES." s_pkg ON p.service_id = s_pkg.id WHERE s_pkg.name = u.user_package AND p.staff_id = u.manager_id LIMIT 1),
                       (SELECT s_pkg.buying_price FROM ".TBL_SERVICES." s_pkg WHERE s_pkg.name = u.user_package LIMIT 1),
                       0
                   )
               ) as cost 
        FROM ".TBL_USERS." u 
        WHERE u.manager_id IN ($placeholders) OR u.manager_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id IN ($placeholders)) 
        GROUP BY u.status
    ", array_merge($agent_ids, $agent_ids));
    foreach($total_stats as $ts) {
        $status = $ts['status'];
        if ($status == 'Active' || $status == 'Promise Active') {
            $cards_stats['Active']['bill'] += floatval($ts['bill']);
            $cards_stats['Active']['cost'] += floatval($ts['cost']);
        } elseif ($status == 'Free') {
            $cards_stats['Free']['bill'] += floatval($ts['bill']);
            $cards_stats['Free']['cost'] += floatval($ts['cost']);
        } elseif ($status == 'Expire') {
            $cards_stats['Expire']['bill'] += floatval($ts['bill']);
            $cards_stats['Expire']['cost'] += floatval($ts['cost']);
        } elseif ($status == 'Left') {
            $cards_stats['Left']['bill'] += floatval($ts['bill']);
            $cards_stats['Left']['cost'] += floatval($ts['cost']);
        } else {
            $cards_stats['Inactive']['bill'] += floatval($ts['bill']);
            $cards_stats['Inactive']['cost'] += floatval($ts['cost']);
        }
    }
}

$routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS);
$all_services = safeFetchAll($pdo, "SELECT * FROM ".TBL_SERVICES);
$real_agents = safeFetchAll($pdo, "SELECT * FROM ".TBL_AGENTS);
$supervisors = safeFetchAll($pdo, "SELECT id, name, username FROM ".TBL_STAFF." WHERE role='Supervisor' AND status='Active'");

// --- Live Online/Offline Session Tracking ---
$cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../../cache/global_online.json';
$online_users_set = [];
if (file_exists($cache_file)) {
    $cache_raw = json_decode(file_get_contents($cache_file), true);
    $online_data = isset($cache_raw['data']) ? $cache_raw['data'] : $cache_raw;
    if (is_array($online_data)) {
        foreach ($online_data as $uname => $session) {
            $online_users_set[strtolower(trim($uname))] = true;
            $base_uname = strtolower(trim(explode('@', $uname)[0]));
            $online_users_set[$base_uname] = true;
        }
    }
}

$staff_parent_map = [];
$all_staff = $pdo->query("SELECT id, parent_id FROM " . TBL_STAFF)->fetchAll(PDO::FETCH_ASSOC);
foreach ($all_staff as $s_member) {
    $staff_parent_map[(int)$s_member['id']] = (int)$s_member['parent_id'];
}

$pop_online_counts = [];
$pop_offline_counts = [];
foreach ($agents as $a) {
    $pop_online_counts[$a['id']] = 0;
    $pop_offline_counts[$a['id']] = 0;
}

$total_online = 0;
$total_offline = 0;

$clients = $pdo->query("SELECT user_id, manager_id, status FROM " . TBL_USERS . " WHERE status IN ('Active', 'Expire', 'Promise Active')")->fetchAll(PDO::FETCH_ASSOC);
foreach ($clients as $c) {
    $m_id = (int)$c['manager_id'];
    $uname_clean = strtolower(trim($c['user_id']));
    $is_online = isset($online_users_set[$uname_clean]);
    
    $belongs_to_visible_agent = false;

    // Increment for immediate manager
    if (isset($pop_online_counts[$m_id])) {
        $belongs_to_visible_agent = true;
        if ($is_online) {
            $pop_online_counts[$m_id]++;
        } else {
            $pop_offline_counts[$m_id]++;
        }
    }
    
    // Increment for parent manager if exists
    if (isset($staff_parent_map[$m_id]) && $staff_parent_map[$m_id] > 0) {
        $parent_id = $staff_parent_map[$m_id];
        if (isset($pop_online_counts[$parent_id])) {
            $belongs_to_visible_agent = true;
            if ($is_online) {
                $pop_online_counts[$parent_id]++;
            } else {
                $pop_offline_counts[$parent_id]++;
            }
        }
    }

    if ($belongs_to_visible_agent) {
        if ($is_online) {
            $total_online++;
        } else {
            $total_offline++;
        }
    }
}
// ---
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

    /* Package checkbox panel */
    #pkgCheckboxList {
        scrollbar-width: thin;
        scrollbar-color: #ced4da #f8f9fa;
    }
    #pkgCheckboxList::-webkit-scrollbar { width: 5px; }
    #pkgCheckboxList::-webkit-scrollbar-track { background: #f8f9fa; }
    #pkgCheckboxList::-webkit-scrollbar-thumb { background: #ced4da; border-radius: 3px; }

    .pkg-check-item {
        padding: 5px 4px;
        border-radius: 4px;
        transition: background 0.12s;
        border-bottom: 1px solid #f0f0f0 !important;
        cursor: pointer;
    }
    .pkg-check-item:last-child { border-bottom: none !important; }
    .pkg-check-item:hover { background: #f0f7ff; }
    .pkg-check-item:has(.pkg-checkbox:checked) {
        background: #e6f4ea;
        border-left: 3px solid #28a745;
        padding-left: 6px;
    }
    #pkgSearchInput:focus { box-shadow: none; border-color: #86b7fe; }
</style>

<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-user-shield me-2 text-primary"></i> POP/Branch List</h4>
    <div class="d-flex flex-column flex-sm-row gap-2">
        <form class="d-flex">
            <input type="hidden" name="tab" value="agents">
            <div class="input-group input-group-sm">
                <input type="text" name="search" class="form-control border-primary" placeholder="Search POP/Branch..." value="<?= htmlspecialchars($search) ?>">
                <button type="submit" class="btn btn-primary"><i class="fas fa-search"></i></button>
            </div>
        </form>
        <?php if(hasRole('Admin') || isOffice()): ?>
        <button type="button" id="btnAddAgent" class="btn btn-primary btn-sm rounded-pill px-3">
            <i class="fas fa-plus me-1"></i> Create New
        </button>
        <?php endif; ?>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-6 col-md">
        <div class="card border-0 shadow-sm h-100" style="background: linear-gradient(135deg, #4c6ef5 0%, #364fc7 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Clients</div>
                <h4 class="mb-0 fw-bold"><?= $total_clients_all ?></h4>
                <div class="small mt-1 opacity-75" style="font-size: 0.75rem;">Active + Inactive + Free + Expire</div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md">
        <div class="card border-0 shadow-sm h-100" style="background: linear-gradient(135deg, #40c057 0%, #2f9e44 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Active</div>
                <h4 class="mb-0 fw-bold"><?= $total_active ?></h4>
                <div class="small mt-1 opacity-75" style="font-size: 0.75rem;">Bill: ৳<?= number_format($cards_stats['Active']['bill']??0,2) ?> | Cost: ৳<?= number_format($cards_stats['Active']['cost']??0,2) ?></div>
                <div class="mt-1 small" style="font-size: 0.75rem; font-weight: 500;">
                    <i class="fas fa-circle text-light me-1" style="font-size: 0.45rem; color: #adff2f !important; vertical-align: middle;"></i><?= $total_online ?> Online
                    <span class="mx-1">|</span>
                    <i class="fas fa-circle text-light me-1" style="font-size: 0.45rem; color: #ffbcbc !important; vertical-align: middle;"></i><?= $total_offline ?> Offline
                </div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md">
        <div class="card border-0 shadow-sm h-100" style="background: linear-gradient(135deg, #fa5252 0%, #e03131 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Due</div>
                <h4 class="mb-0 fw-bold"><?= $total_due ?></h4>
                <div class="small mt-1 opacity-75" style="font-size: 0.75rem;">Bill: ৳<?= number_format($cards_stats['Expire']['bill']??0,2) ?> | Cost: ৳<?= number_format($cards_stats['Expire']['cost']??0,2) ?></div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md">
        <div class="card border-0 shadow-sm h-100" style="background: linear-gradient(135deg, #fab005 0%, #f08c00 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Inactive</div>
                <h4 class="mb-0 fw-bold"><?= $total_inactive ?></h4>
                <div class="small mt-1 opacity-75" style="font-size: 0.75rem;">Bill: ৳<?= number_format($cards_stats['Inactive']['bill']??0,2) ?> | Cost: ৳<?= number_format($cards_stats['Inactive']['cost']??0,2) ?></div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md">
        <div class="card border-0 shadow-sm h-100" style="background: linear-gradient(135deg, #868e96 0%, #495057 100%) !important; color: white;">
            <div class="card-body p-3">
                <div class="small opacity-75 fw-semibold">Total Left</div>
                <h4 class="mb-0 fw-bold"><?= $total_left ?></h4>
                <div class="small mt-1 opacity-75" style="font-size: 0.75rem;">Bill: ৳<?= number_format($cards_stats['Left']['bill']??0,2) ?> | Cost: ৳<?= number_format($cards_stats['Left']['cost']??0,2) ?></div>
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
                        <th class="ps-3">POP/Branch Info</th>
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
                        <tr><td colspan="6" class="text-center py-5 text-muted">No POP/Branch found</td></tr>
                    <?php else: foreach($agents as $a): 
                        $res_stats = safeFetchAll($pdo, "
                            SELECT u.status, 
                                   SUM(u.bill_amount) as bill, 
                                   SUM(
                                       COALESCE(
                                           (SELECT p.custom_price FROM ".TBL_PRICING." p JOIN ".TBL_SERVICES." s_pkg ON p.service_id = s_pkg.id WHERE s_pkg.name = u.user_package AND p.staff_id = u.manager_id LIMIT 1),
                                           (SELECT s_pkg.buying_price FROM ".TBL_SERVICES." s_pkg WHERE s_pkg.name = u.user_package LIMIT 1),
                                           0
                                       )
                                   ) as cost 
                            FROM ".TBL_USERS." u 
                            WHERE u.manager_id = ? OR u.manager_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id = ?) 
                            GROUP BY u.status
                        ", [$a['id'], $a['id']]);
                        $st_data = ['Active'=>['bill'=>0,'cost'=>0], 'Free'=>['bill'=>0,'cost'=>0], 'Expire'=>['bill'=>0,'cost'=>0], 'Left'=>['bill'=>0,'cost'=>0], 'Inactive'=>['bill'=>0,'cost'=>0]];
                        foreach($res_stats as $rs) {
                            $r_status = $rs['status'];
                            if ($r_status == 'Active' || $r_status == 'Promise Active') {
                                $st_data['Active']['bill'] += floatval($rs['bill']);
                                $st_data['Active']['cost'] += floatval($rs['cost']);
                            } elseif ($r_status == 'Free') {
                                $st_data['Free']['bill'] += floatval($rs['bill']);
                                $st_data['Free']['cost'] += floatval($rs['cost']);
                            } elseif ($r_status == 'Expire') {
                                $st_data['Expire']['bill'] += floatval($rs['bill']);
                                $st_data['Expire']['cost'] += floatval($rs['cost']);
                            } elseif ($r_status == 'Left') {
                                $st_data['Left']['bill'] += floatval($rs['bill']);
                                $st_data['Left']['cost'] += floatval($rs['cost']);
                            } else {
                                $st_data['Inactive']['bill'] += floatval($rs['bill']);
                                $st_data['Inactive']['cost'] += floatval($rs['cost']);
                            }
                        }
                    ?>
                        <tr>
                            <td class="ps-3">
                                <div class="fw-bold text-dark">
                                    <?= $a['name'] ?>
                                    <?php if($a['parent_name']): ?>
                                        <small class="text-muted d-block" style="font-size:0.7rem">Managed by: <?= $a['parent_name'] ?></small>
                                    <?php endif; ?>
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
                            <td><span class="badge bg-info-subtle text-info border border-info-subtle"><?= $a['role'] == 'Reseller' ? 'POP Manager' : $a['role'] ?></span></td>
                            <td>
                                <div class="d-flex gap-1 flex-wrap">
                                    <div class="dropdown">
                                        <span class="badge bg-success stat-badge" style="cursor:pointer" data-bs-toggle="dropdown" title="Active Clients"><?= $a['active_users'] ?></span>
                                        <div class="dropdown-menu p-2 shadow border-0" style="min-width:140px; font-size:0.8rem;">
                                            <div class="fw-bold border-bottom pb-1 mb-1 text-success">Active Details</div>
                                            <div class="d-flex justify-content-between"><span>Bill:</span> <strong>৳<?= number_format($st_data['Active']['bill']??0,2) ?></strong></div>
                                            <div class="d-flex justify-content-between"><span>Cost:</span> <strong>৳<?= number_format($st_data['Active']['cost']??0,2) ?></strong></div>
                                        </div>
                                    </div>
                                    
                                    <div class="dropdown">
                                        <span class="badge bg-info stat-badge" style="cursor:pointer; background-color: #17a2b8 !important;" data-bs-toggle="dropdown" title="Free Clients"><?= $a['free_users'] ?></span>
                                        <div class="dropdown-menu p-2 shadow border-0" style="min-width:140px; font-size:0.8rem;">
                                            <div class="fw-bold border-bottom pb-1 mb-1 text-info">Free Details</div>
                                            <div class="d-flex justify-content-between"><span>Bill:</span> <strong>৳<?= number_format($st_data['Free']['bill']??0,2) ?></strong></div>
                                            <div class="d-flex justify-content-between"><span>Cost:</span> <strong>৳<?= number_format($st_data['Free']['cost']??0,2) ?></strong></div>
                                        </div>
                                    </div>
                                    
                                    <div class="dropdown">
                                        <span class="badge bg-danger stat-badge" style="cursor:pointer" data-bs-toggle="dropdown" title="Due/Expired Clients"><?= $a['due_users'] ?></span>
                                        <div class="dropdown-menu p-2 shadow border-0" style="min-width:140px; font-size:0.8rem;">
                                            <div class="fw-bold border-bottom pb-1 mb-1 text-danger">Due Details</div>
                                            <div class="d-flex justify-content-between"><span>Bill:</span> <strong>৳<?= number_format($st_data['Expire']['bill']??0,2) ?></strong></div>
                                            <div class="d-flex justify-content-between"><span>Cost:</span> <strong>৳<?= number_format($st_data['Expire']['cost']??0,2) ?></strong></div>
                                        </div>
                                    </div>

                                    <div class="dropdown">
                                        <span class="badge bg-warning text-dark stat-badge" style="cursor:pointer" data-bs-toggle="dropdown" title="Inactive Clients"><?= $a['inactive_users'] ?></span>
                                        <div class="dropdown-menu p-2 shadow border-0" style="min-width:140px; font-size:0.8rem;">
                                            <div class="fw-bold border-bottom pb-1 mb-1 text-warning">Inactive Details</div>
                                            <div class="d-flex justify-content-between"><span>Bill:</span> <strong>৳<?= number_format($st_data['Inactive']['bill']??0,2) ?></strong></div>
                                            <div class="d-flex justify-content-between"><span>Cost:</span> <strong>৳<?= number_format($st_data['Inactive']['cost']??0,2) ?></strong></div>
                                        </div>
                                    </div>

                                    <div class="dropdown">
                                        <span class="badge bg-secondary stat-badge" style="cursor:pointer" data-bs-toggle="dropdown" title="Left Clients"><?= $a['left_users'] ?></span>
                                        <div class="dropdown-menu p-2 shadow border-0" style="min-width:140px; font-size:0.8rem;">
                                            <div class="fw-bold border-bottom pb-1 mb-1 text-secondary">Left Details</div>
                                            <div class="d-flex justify-content-between"><span>Bill:</span> <strong>৳<?= number_format($st_data['Left']['bill']??0,2) ?></strong></div>
                                            <div class="d-flex justify-content-between"><span>Cost:</span> <strong>৳<?= number_format($st_data['Left']['cost']??0,2) ?></strong></div>
                                        </div>
                                    </div>

                                    <div class="dropdown">
                                        <span class="badge bg-primary stat-badge" style="cursor:pointer" data-bs-toggle="dropdown" title="Online Clients"><?= $pop_online_counts[$a['id']] ?? 0 ?></span>
                                        <div class="dropdown-menu p-2 shadow border-0" style="min-width:140px; font-size:0.8rem;">
                                            <div class="fw-bold border-bottom pb-1 mb-1 text-primary">Online Sessions</div>
                                            <div class="d-flex justify-content-between"><span>Count:</span> <strong><?= $pop_online_counts[$a['id']] ?? 0 ?> Online</strong></div>
                                        </div>
                                    </div>

                                    <div class="dropdown">
                                        <span class="badge bg-dark stat-badge" style="cursor:pointer" data-bs-toggle="dropdown" title="Offline Clients"><?= $pop_offline_counts[$a['id']] ?? 0 ?></span>
                                        <div class="dropdown-menu p-2 shadow border-0" style="min-width:140px; font-size:0.8rem;">
                                            <div class="fw-bold border-bottom pb-1 mb-1 text-dark">Offline Sessions</div>
                                            <div class="d-flex justify-content-between"><span>Count:</span> <strong><?= $pop_offline_counts[$a['id']] ?? 0 ?> Offline</strong></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-2 d-flex gap-1" style="font-size: 0.72rem;">
                                    <span class="badge px-2 py-1" style="background-color: rgba(13, 110, 253, 0.08) !important; color: #0d6efd !important; border: 1px solid rgba(13, 110, 253, 0.15) !important; font-weight: 500; border-radius: 4px;" title="Online PPPoE Sessions">
                                        <i class="fas fa-circle text-success me-1" style="font-size: 0.45rem; vertical-align: middle;"></i><?= $pop_online_counts[$a['id']] ?? 0 ?> Online
                                    </span>
                                    <span class="badge px-2 py-1" style="background-color: rgba(108, 117, 125, 0.08) !important; color: #6c757d !important; border: 1px solid rgba(108, 117, 125, 0.15) !important; font-weight: 500; border-radius: 4px;" title="Offline PPPoE Sessions">
                                        <i class="fas fa-circle text-danger me-1" style="font-size: 0.45rem; vertical-align: middle;"></i><?= $pop_offline_counts[$a['id']] ?? 0 ?> Offline
                                    </span>
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
                                    <button type="button" class="btn btn-outline-warning btn-sm btn-pop-withdraw"
                                        title="Refund Balance"
                                        data-id="<?= $a['id'] ?>"
                                        data-name="<?= htmlspecialchars($a['name'], ENT_QUOTES) ?>"
                                        data-balance="<?= $a['balance'] ?>">
                                        <i class="fas fa-minus-circle"></i>
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
                                            <?php if(hasRole('Admin') || isOffice()): ?>
                                            <li><a class="dropdown-item" href="?impersonate=<?= $a['id'] ?>"><i class="fas fa-user-ninja me-2 text-primary"></i> Login As</a></li>
                                            <?php endif; ?>
                                            <li><a class="dropdown-item" href="?tab=reseller_statement&id=<?= $a['id'] ?>"><i class="fas fa-file-invoice-dollar me-2 text-info"></i> View Statement</a></li>
                                            <?php if(hasRole('Admin') || isOffice()): ?>
                                            <li><hr class="dropdown-divider"></li>
                                            <li><a class="dropdown-item text-danger btn-delete-agent" href="?tab=agents&action=delete_staff&id=<?= $a['id'] ?>"><i class="fas fa-user-slash me-2"></i> Make Left</a></li>
                                            <?php endif; ?>
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
                <h5 class="modal-title" id="agentModalTitle">Create New POP/Branch</h5>
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
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">User Expire Time</label>
                        <input type="time" name="expire_time" id="s_expire_time" class="form-control form-control-sm" value="23:59">
                    </div>
                </div>

                <div class="mb-2">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" name="can_use_global_sms" id="s_can_use_global_sms" value="1">
                        <label class="form-check-label small fw-bold text-primary" for="s_can_use_global_sms">Enable Global SMS API (Super Admin API)</label>
                    </div>
                </div>

                <div class="row g-2 mb-2" id="sms_fields_row" style="display:none;">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-primary">SMS Balance</label>
                        <input type="number" name="sms_balance" id="s_sms_balance" class="form-control form-control-sm" value="0.00" step="0.01">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-primary">SMS Rate (Per SMS)</label>
                        <input type="number" name="sms_rate" id="s_sms_rate" class="form-control form-control-sm" value="0.50" step="0.01">
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
                            <option value="Reseller">POP Manager</option>
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
                <!-- Allowed Packages – Searchable Checkbox Panel -->
                <div class="row g-2 mb-2">
                    <div class="col-md-12">
                        <label class="form-label small fw-bold d-flex justify-content-between align-items-center">
                            <span>Allowed Packages <small class="text-muted">(Leave empty to allow all)</small></span>
                            <span id="pkgSelectedCount" class="badge bg-primary rounded-pill" style="font-size:0.7rem;"></span>
                        </label>
                        <!-- Search bar -->
                        <div class="input-group input-group-sm mb-1">
                            <span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted" style="font-size:0.75rem;"></i></span>
                            <input type="text" id="pkgSearchInput" class="form-control border-start-0 ps-0" placeholder="Search package..." autocomplete="off">
                            <button type="button" id="btnSelectAllPkg" class="btn btn-outline-success btn-sm px-2" title="Select all visible">
                                <i class="fas fa-check-double"></i> All
                            </button>
                            <button type="button" id="btnClearAllPkg" class="btn btn-outline-danger btn-sm px-2" title="Clear all">
                                <i class="fas fa-times"></i> Clear
                            </button>
                        </div>
                        <!-- Checkbox list -->
                        <div id="pkgCheckboxList" class="border rounded bg-white p-2" style="max-height:160px;overflow-y:auto;font-size:0.82rem;">
                            <?php foreach($all_services as $s): ?>
                            <div class="form-check pkg-check-item py-1 border-bottom"
                                 style="margin-bottom:0;"
                                 data-name="<?= strtolower(htmlspecialchars($s['name'])) ?>"
                                 data-router="<?= $s['router_id'] ?? 0 ?>">
                                <input class="form-check-input pkg-checkbox" type="checkbox"
                                       name="allowed_packages[]"
                                       value="<?= $s['id'] ?>"
                                       id="pkg_<?= $s['id'] ?>">
                                <label class="form-check-label w-100 d-flex justify-content-between" for="pkg_<?= $s['id'] ?>" style="cursor:pointer;">
                                    <span><?= htmlspecialchars($s['name']) ?></span>
                                    <span class="text-success fw-semibold ms-2 flex-shrink-0">৳<?= number_format($s['price'], 2) ?></span>
                                </label>
                            </div>
                            <?php endforeach; ?>
                            <div id="pkgNoResult" class="text-muted text-center py-2 d-none" style="font-size:0.8rem;"><i class="fas fa-search me-1"></i>No packages found</div>
                        </div>
                    </div>
                </div>

                <div class="row g-2 mb-2" id="supervisor_row" style="display:none;">
                    <div class="col-md-12">
                        <label class="form-label small fw-bold">Assign Supervisor <small class="text-muted">(For Resellers/SubResellers)</small></label>
                        <select name="supervisor_id" id="s_supervisor" class="form-select form-select-sm">
                            <option value="0">None</option>
                            <?php foreach($supervisors as $sup): ?>
                                <option value="<?= $sup['id'] ?>"><?= htmlspecialchars($sup['name'] . ' (' . $sup['username'] . ')') ?></option>
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
                                <input class="form-check-input" type="radio" name="commission_type" id="type_fixed" value="Fixed" checked>
                                <label class="form-check-label small" for="type_fixed">Fixed Amount</label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="commission_type" id="type_package" value="Package">
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

<!-- Withdraw Funds Modal -->
<div class="modal fade" id="withdrawModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-warning">
                <h5 class="modal-title">Refund Funds from Reseller</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="target_id" id="withdrawTargetId">
                <div class="mb-3">
                    <label class="form-label fw-bold">Reseller Name</label>
                    <input type="text" id="withdrawTargetName" class="form-control border-0 bg-light fw-bold" readonly>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Current Balance</label>
                    <div class="h4 text-success fw-bold" id="withdrawCurrentBalance">৳0.00</div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Refund Amount (BDT)</label>
                    <input type="number" name="amount" class="form-control form-control-lg border-warning" placeholder="0.00" required step="0.01">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Description / Reason</label>
                    <textarea name="description" class="form-control" rows="2" placeholder="e.g. Balance refunded to Admin"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="withdraw_fund" class="btn btn-warning px-4 fw-bold">Refund Now</button>
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
                                <tr class="service-row" data-sid="<?= $s['id'] ?>">
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
                <label class="form-label fw-bold">Target POP/Branch</label>
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
