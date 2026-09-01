<?php
// ONLINE & OFFLINE CLIENTS VIEW
$cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../cache/global_online.json';
$online_data = file_exists($cache_file) ? json_decode(file_get_contents($cache_file), true) : [];
$online_usernames = array_keys($online_data);

// Fetch all users to identify offline ones
$managed_ids = getManagedStaffIds($pdo, $_SESSION['admin_id'], $_SESSION['user_role']);
$query = "SELECT u.id, u.name, u.phone, u.user_package, u.user_id, u.status, 
                 NULLIF(
                     GREATEST(
                         COALESCE((SELECT ended_at FROM ".TBL_SESSIONS." WHERE client_id = u.id AND status = 'closed' ORDER BY ended_at DESC LIMIT 1), '1970-01-01 00:00:00'),
                         COALESCE(u.last_seen, '1970-01-01 00:00:00')
                     ),
                     '1970-01-01 00:00:00'
                 ) as last_seen, 
                 u.lat_long, u.address, u.onu_mac, r.name as router_name 
          FROM ".TBL_USERS." u 
          LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id 
          WHERE u.status IN ('Active', 'Expire', 'Promise Active', 'Free')";
$params = [];

if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $query .= " AND u.manager_id IN ($placeholders)";
    $params = $managed_ids;
} elseif (isset($_GET['f_manager'])) {
    if (!empty($_GET['f_manager'])) {
        $query .= " AND u.manager_id = ?";
        $params[] = $_GET['f_manager'];
    }
} else {
    // Default Admin View: Only show own clients
    $query .= " AND u.manager_id = ?";
    $params[] = $_SESSION['admin_id'];
    $_GET['f_manager'] = $_SESSION['admin_id'];
}

$all_users = safeFetchAll($pdo, $query, $params);

// Separate Online and Offline based on Cache
$final_online = [];
$final_offline = [];

// Map DB data for online users
$user_map = [];
foreach($all_users as $u) {
    $user_map[$u['user_id']] = $u;
}

foreach($online_data as $name => $p) {
    if (isset($user_map[$name])) {
        $u = $user_map[$name];
        $p['name'] = $name; // Ensure name is set for the view
        $p['db_id'] = $u['id'];
        $p['db_name'] = $u['name'];
        $p['db_phone'] = $u['phone'];
        $p['db_pkg'] = $u['user_package'];
        $p['db_onu_mac'] = $u['onu_mac'] ?? '';
        $p['db_status'] = $u['status'] ?? '';
        $final_online[] = $p;
    }
}

foreach($all_users as $u) {
    if (!isset($online_data[$u['user_id']])) {
        $final_offline[] = $u;
    }
}

?>

<div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-signal me-2 text-success"></i> Monitoring Dashboard</h4>
    <div class="d-flex flex-wrap gap-2 align-items-center">
        <?php if(hasRole('Admin') || isOffice()): ?>
        <form method="GET" class="d-flex gap-2">
            <input type="hidden" name="tab" value="online_clients">
            <select name="f_manager" class="form-select form-select-sm border-primary manager-filter-select">
                <option value="">All Owners</option>
                <option value="<?= $_SESSION['admin_id'] ?>" <?= (isset($_GET['f_manager']) && $_GET['f_manager'] == $_SESSION['admin_id']) ? 'selected' : '' ?>>My Clients Only</option>
                <?php 
                $managers = safeFetchAll($pdo, "SELECT id, name FROM ".TBL_STAFF." WHERE role IN ('Reseller', 'SubReseller', 'Agent')");
                foreach($managers as $m) {
                    $sel = (isset($_GET['f_manager']) && $_GET['f_manager'] == $m['id']) ? 'selected' : '';
                    echo "<option value='{$m['id']}' $sel>{$m['name']}</option>";
                }
                ?>
            </select>
        </form>
        <?php endif; ?>

        <ul class="nav nav-pills bg-white shadow-sm rounded-pill p-1" id="monitorTabs" role="tablist">
            <li class="nav-item">
                <button class="nav-link active rounded-pill px-4" id="online-tab" data-bs-toggle="pill" data-bs-target="#online-view" type="button">
                    Online <span class="badge bg-success ms-2"><?= count($final_online) ?></span>
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link rounded-pill px-4" id="offline-tab" data-bs-toggle="pill" data-bs-target="#offline-view" type="button">
                    Offline <span class="badge bg-danger ms-2"><?= count($final_offline) ?></span>
                </button>
            </li>
        </ul>
    </div>
</div>

<!-- MAP Section Styles -->
<style>
    #clientMap {
        height: 400px;
        width: 100%;
    }
    .manager-filter-select {
        max-width: 150px;
    }
</style>

<!-- MAP Section -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js"></script>

<div class="card shadow-sm mb-4">
    <div class="card-header bg-white py-3">
        <h6 class="mb-0 fw-bold"><i class="fas fa-map-marker-alt me-2 text-primary"></i> Live Client Map (GPS)</h6>
    </div>
    <div class="card-body p-0 position-relative">
        <div id="noGpsAlert" class="alert alert-warning text-center m-2 shadow-sm d-none" style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 1000; width: 80%; max-width: 400px;">
            <i class="fas fa-exclamation-triangle me-2"></i> No valid GPS location found.
        </div>
        <div id="clientMap"></div>
    </div>
</div>

<script src="assets/js/online-map.js?v=<?= APP_DEPLOYMENT_ID ?>"></script>

<div class="tab-content" id="monitorTabsContent">
    <!-- Online View -->
    <div class="tab-pane fade show active" id="online-view" role="tabpanel">
        <div class="card shadow-sm border-0">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Client Name / ID</th>
                                <th>IP Address</th>
                                <th>MAC / Caller ID</th>
                                <th>Uptime</th>
                                <th>Router</th>
                                <th class="text-end pe-3">Profile</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if(empty($final_online)): ?>
                                <tr><td colspan="6" class="text-center py-5 text-muted">No clients are currently online</td></tr>
                            <?php else: foreach($final_online as $p): ?>
                                <tr data-username="<?= $p['name'] ?>">
                                     <td class="ps-3">
                                         <div class="fw-bold text-primary">
                                             <?= htmlspecialchars($p['db_name'] ?? $p['name']) ?>
                                             <?php if (!empty($p['db_status'])): ?>
                                                 <span class="badge <?= ($p['db_status']=='Active')?'bg-success':(($p['db_status']=='Promise Active')?'text-white':(($p['db_status']=='Expire')?'bg-danger':'bg-secondary')) ?> ms-1" style="<?= ($p['db_status'] == 'Promise Active') ? 'background: linear-gradient(135deg, #fd7e14, #6f42c1); border: none; font-size: 0.7rem; padding: 2px 6px;' : 'font-size: 0.7rem; padding: 2px 6px;' ?>">
                                                     <?= htmlspecialchars($p['db_status']) ?>
                                                 </span>
                                             <?php endif; ?>
                                         </div>
                                         <div class="small text-muted"><?= htmlspecialchars($p['name']) ?> (<?= htmlspecialchars($p['db_pkg'] ?? 'N/A') ?>)</div>
                                     </td>
                                    <td><span class="badge bg-light text-dark border"><?= $p['address'] ?></span></td>
                                    <td class="small">
                                        <?php 
                                            $mac = $p['caller_id'] ?? $p['caller-id'] ?? 'N/A';
                                            echo $mac;
                                        ?>
                                    </td>
                                    <td class="uptime-cell text-success fw-bold"><?= $p['uptime'] ?></td>
                                    <td><small class="text-secondary"><?= $p['router_name'] ?></small></td>
                                    <td class="text-end pe-3">
                                        <a href="?view_id=<?= $p['db_id'] ?>" class="btn btn-sm btn-outline-primary rounded-pill px-3">View</a>
                                    </td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- Offline View -->
    <div class="tab-pane fade" id="offline-view" role="tabpanel">
        <div class="card shadow-sm border-0">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Client Name / ID</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th>Last Seen Time</th>
                                <th>Router</th>
                                <th class="text-end pe-3">Profile</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if(empty($final_offline)): ?>
                                <tr><td colspan="6" class="text-center py-5 text-muted">No clients are currently offline</td></tr>
                            <?php else: foreach($final_offline as $u): ?>
                                <tr data-username="<?= htmlspecialchars($u['user_id'], ENT_QUOTES, 'UTF-8') ?>">
                                    <td class="ps-3">
                                        <div class="fw-bold text-dark"><?= $u['name'] ?></div>
                                        <div class="small text-muted"><?= $u['user_id'] ?> (<?= $u['user_package'] ?>)</div>
                                    </td>
                                    <td><?= $u['phone'] ?></td>
                                     <td>
                                         <span class="badge bg-light text-danger border me-1">Offline</span>
                                         <span class="badge <?= ($u['status']=='Active')?'bg-success':(($u['status']=='Promise Active')?'text-white':(($u['status']=='Expire')?'bg-danger':'bg-secondary')) ?>" style="<?= ($u['status'] == 'Promise Active') ? 'background: linear-gradient(135deg, #fd7e14, #6f42c1); border: none; font-size: 0.75rem; padding: 3px 8px;' : 'font-size: 0.75rem; padding: 3px 8px;' ?>">
                                             <?= htmlspecialchars($u['status']) ?>
                                         </span>
                                     </td>
                                    <td class="text-muted">
                                        <i class="far fa-clock me-1"></i>
                                        <?= $u['last_seen'] ? date('d M, h:i A', strtotime($u['last_seen'])) : 'Never Seen' ?>
                                    </td>
                                    <td><small class="text-secondary"><?= $u['router_name'] ?></small></td>
                                    <td class="text-end pe-3">
                                        <a href="?view_id=<?= $u['id'] ?>" class="btn btn-sm btn-outline-secondary rounded-pill px-3">View</a>
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
function updateMonitoring() {
    fetch('?ajax_monitoring=1')
    .then(r => r.json())
    .then(res => {
        if(res.status === 'success' && res.data) {
            document.querySelectorAll('#online-view tr[data-username]').forEach(row => {
                const username = row.getAttribute('data-username');
                const data = res.data[username];
                if(data) {
                    const uptimeCell = row.querySelector('.uptime-cell');
                    if(uptimeCell) uptimeCell.innerText = data.uptime;
                }
            });
        }
    })
    .catch(err => console.error("Monitoring Update Error:", err));
}

setInterval(updateMonitoring, 10000);


</script>
