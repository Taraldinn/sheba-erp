<?php
// ONLINE & OFFLINE CLIENTS VIEW
$cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../../cache/global_online.json';
$cache_raw = file_exists($cache_file) ? json_decode(file_get_contents($cache_file), true) : [];
$online_data = isset($cache_raw['data']) ? $cache_raw['data'] : $cache_raw;
$online_usernames = array_keys($online_data);

// Fetch all users to identify offline ones
$managed_ids = getManagedStaffIds($pdo, $_SESSION['admin_id'], $_SESSION['user_role']);
$query = "SELECT u.id, u.name, u.phone, u.user_package, u.user_id, u.status, u.client_code, 
                 NULLIF(
                     GREATEST(
                         COALESCE((SELECT ended_at FROM ".TBL_SESSIONS." WHERE client_id = u.id AND status = 'closed' ORDER BY ended_at DESC LIMIT 1), '1970-01-01 00:00:00'),
                         COALESCE(u.last_seen, '1970-01-01 00:00:00')
                     ),
                     '1970-01-01 00:00:00'
                 ) as last_seen,
                 u.lat_long, u.address, r.name as router_name 
          FROM ".TBL_USERS." u 
          LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id 
          WHERE u.status IN ('Active', 'Expire', 'Promise Active', 'Free')";
$params = [];

if (hasRole('Admin') || $managed_ids === 'ALL') {
    if (isset($_GET['f_manager']) && !empty($_GET['f_manager'])) {
        $query .= " AND u.manager_id = ?";
        $params[] = $_GET['f_manager'];
    }
} elseif (is_array($managed_ids)) {
    // Hierarchical view: own and descendants
    $m_placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $query .= " AND u.manager_id IN ($m_placeholders)";
    $params = array_merge($params, $managed_ids);
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
        $p['db_status'] = $u['status'] ?? '';
        $p['db_client_code'] = $u['client_code'] ?? '';
        $final_online[] = $p;
    }
}

foreach($all_users as $u) {
    if (!isset($online_data[$u['user_id']])) {
        $final_offline[] = $u;
    }
}
?>

<style>
    /* Force responsive horizontal scroll boundaries */
    .table-responsive {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 #f8f9fa;
    }
    /* Ensure table has minimum width to force horizontal scrolling rather than squishing columns */
    .table-responsive table {
        min-width: 1100px !important;
    }
    /* Sleek custom scrollbar style for responsive tables */
    .table-responsive::-webkit-scrollbar,
    .table-responsive-top::-webkit-scrollbar {
        height: 10px;
    }
    .table-responsive::-webkit-scrollbar-track,
    .table-responsive-top::-webkit-scrollbar-track {
        background: #f8f9fa;
        border-radius: 4px;
    }
    .table-responsive::-webkit-scrollbar-thumb,
    .table-responsive-top::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 4px;
        transition: background 0.2s ease;
    }
    .table-responsive::-webkit-scrollbar-thumb:hover,
    .table-responsive-top::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
    }
    /* Sticky Top Scrollbar and Table Header Sync */
    .table-responsive-top {
        position: sticky;
        top: 0;
        z-index: 1020;
        background: #ffffff;
        border-bottom: 1px solid #dee2e6;
        height: 10px;
    }
    .table-responsive table thead th {
        position: sticky;
        top: 0;
        z-index: 1010;
        background-color: #f8f9fa !important;
        box-shadow: inset 0 -1px 0 #dee2e6;
    }
    .card-body.has-top-scroll .table-responsive table thead th {
        top: 10px; /* height of the top scrollbar */
    }
</style>

<div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-signal me-2 text-success"></i> Monitoring Dashboard</h4>
    <div class="d-flex flex-wrap gap-2 align-items-center">
        <!-- Live Search Box -->
        <div class="input-group input-group-sm" style="max-width: 230px;">
            <span class="input-group-text bg-white border-secondary-subtle text-muted">
                <i class="fas fa-search"></i>
            </span>
            <input type="text" id="monitoringSearchInput" class="form-control border-secondary-subtle border-start-0" placeholder="Search User ID / Code..." autocomplete="off">
        </div>
        <?php if(hasRole('Admin')): ?>
        <form method="GET" class="d-flex gap-2">
            <input type="hidden" name="tab" value="online_clients">
            <select name="f_manager" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 150px;">
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
                <button class="nav-link <?= (isset($_GET['view']) && $_GET['view'] === 'offline') ? '' : 'active' ?> rounded-pill px-4" id="online-tab" data-bs-toggle="pill" data-bs-target="#online-view" type="button">
                    Online <span class="badge bg-success ms-2"><?= count($final_online) ?></span>
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link <?= (isset($_GET['view']) && $_GET['view'] === 'offline') ? 'active' : '' ?> rounded-pill px-4" id="offline-tab" data-bs-toggle="pill" data-bs-target="#offline-view" type="button">
                    Offline <span class="badge bg-danger ms-2"><?= count($final_offline) ?></span>
                </button>
            </li>
        </ul>
    </div>
</div>

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js"></script>

<div class="card shadow-sm mb-4">
    <div class="card-header bg-white py-3">
        <h6 class="mb-0 fw-bold"><i class="fas fa-map-marker-alt me-2 text-primary"></i> Live Client Map (GPS)</h6>
    </div>
    <div class="card-body p-0">
        <div id="clientMap" style="height: 400px; width: 100%;"></div>
    </div>
</div>

<script src="assets/js/online-map.js?v=<?= APP_DEPLOYMENT_ID ?>"></script>

<div class="tab-content" id="monitorTabsContent">
    <!-- Online View -->
    <div class="tab-pane fade <?= (isset($_GET['view']) && $_GET['view'] === 'offline') ? '' : 'show active' ?>" id="online-view" role="tabpanel">
        <div class="card shadow-sm border-0">
            <div class="card-body p-0">
                <!-- Top scrollbar mirror for online tab -->
                <div class="table-responsive-top" id="online-top-scroll" style="display: none; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #cbd5e1 #f8f9fa;">
                    <div class="table-responsive-top-force" style="height: 1px;"></div>
                </div>
                <div class="table-responsive" id="online-bottom-scroll">
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
                                <tr class="monitor-row" data-username="<?= $p['name'] ?>" data-search-user="<?= htmlspecialchars(strtolower(trim($p['name']))) ?>" data-search-code="<?= htmlspecialchars(strtolower(trim($p['db_client_code'] ?? ''))) ?>" data-search-name="<?= htmlspecialchars(strtolower(trim($p['db_name'] ?? $p['name']))) ?>">
                                    <td class="ps-3">
                                        <div class="fw-bold text-primary">
                                            <?= htmlspecialchars($p['db_name'] ?? $p['name']) ?>
                                            <?php if (!empty($p['db_status'])): ?>
                                                <span class="badge <?= ($p['db_status']=='Active')?'bg-success':(($p['db_status']=='Promise Active')?'text-white':(($p['db_status']=='Expire')?'bg-danger':'bg-secondary')) ?> ms-1" style="<?= ($p['db_status'] == 'Promise Active') ? 'background: linear-gradient(135deg, #fd7e14, #6f42c1); border: none; font-size: 0.7rem; padding: 2px 6px;' : 'font-size: 0.7rem; padding: 2px 6px;' ?>">
                                                    <?= htmlspecialchars($p['db_status']) ?>
                                                </span>
                                            <?php endif; ?>
                                        </div>
                                        <div class="small text-muted">
                                            <?= htmlspecialchars($p['name']) ?>
                                            <?php if (!empty($p['db_client_code'])): ?> | Code: <?= htmlspecialchars($p['db_client_code']) ?><?php endif; ?>
                                            (<?= htmlspecialchars($p['db_pkg'] ?? 'N/A') ?>)
                                        </div>
                                    </td>
                                    <td><span class="badge bg-light text-dark border"><?= $p['address'] ?></span></td>
                                    <td class="small"><?= $p['caller_id'] ?? $p['caller-id'] ?? 'N/A' ?></td>
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
    <div class="tab-pane fade <?= (isset($_GET['view']) && $_GET['view'] === 'offline') ? 'show active' : '' ?>" id="offline-view" role="tabpanel">
        <div class="card shadow-sm border-0">
            <div class="card-body p-0">
                <!-- Top scrollbar mirror for offline tab -->
                <div class="table-responsive-top" id="offline-top-scroll" style="display: none; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #cbd5e1 #f8f9fa;">
                    <div class="table-responsive-top-force" style="height: 1px;"></div>
                </div>
                <div class="table-responsive" id="offline-bottom-scroll">
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
                                <tr class="monitor-row" data-search-user="<?= htmlspecialchars(strtolower(trim($u['user_id']))) ?>" data-search-code="<?= htmlspecialchars(strtolower(trim($u['client_code'] ?? ''))) ?>" data-search-name="<?= htmlspecialchars(strtolower(trim($u['name'] ?? ''))) ?>">
                                    <td class="ps-3">
                                        <div class="fw-bold text-dark"><?= htmlspecialchars($u['name']) ?></div>
                                        <div class="small text-muted">
                                            <?= htmlspecialchars($u['user_id']) ?>
                                            <?php if (!empty($u['client_code'])): ?> | Code: <?= htmlspecialchars($u['client_code']) ?><?php endif; ?>
                                            (<?= htmlspecialchars($u['user_package'] ?? 'N/A') ?>)
                                        </div>
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

document.addEventListener('DOMContentLoaded', function() {
    // Submit form on filter change (for CSP compatibility)
    document.querySelectorAll('.submit-on-change').forEach(el => {
        el.addEventListener('change', function() {
            this.form.submit();
        });
    });

    function setupTopScrollSync(topId, bottomId, tableSelector) {
        const topScroll = document.getElementById(topId);
        const bottomScroll = document.getElementById(bottomId);
        if (!topScroll || !bottomScroll) return;
        
        const table = bottomScroll.querySelector(tableSelector || 'table');
        const topScrollForce = topScroll.querySelector('.table-responsive-top-force');
        if (!table || !topScrollForce) return;

        const updateWidth = () => {
            const tableWidth = table.offsetWidth;
            const containerWidth = bottomScroll.offsetWidth;
            if (tableWidth > containerWidth) {
                topScroll.style.display = 'block';
                topScrollForce.style.width = tableWidth + 'px';
                bottomScroll.closest('.card-body')?.classList.add('has-top-scroll');
            } else {
                topScroll.style.display = 'none';
                bottomScroll.closest('.card-body')?.classList.remove('has-top-scroll');
            }
        };

        let isSyncingTop = false;
        let isSyncingBottom = false;

        topScroll.addEventListener('scroll', () => {
            if (!isSyncingTop) {
                isSyncingBottom = true;
                bottomScroll.scrollLeft = topScroll.scrollLeft;
            }
            isSyncingTop = false;
        });

        bottomScroll.addEventListener('scroll', () => {
            if (!isSyncingBottom) {
                isSyncingTop = true;
                topScroll.scrollLeft = bottomScroll.scrollLeft;
            }
            isSyncingBottom = false;
        });

        // Update width initially
        updateWidth();
        window.addEventListener('resize', updateWidth);

        // Also update when tab becomes active in Bootstrap nav-pills
        const tabEl = document.getElementById(bottomId.startsWith('online') ? 'online-tab' : 'offline-tab');
        if (tabEl) {
            tabEl.addEventListener('shown.bs.tab', () => {
                setTimeout(updateWidth, 100);
            });
        }

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateWidth);
            observer.observe(table);
        }
    }

    setupTopScrollSync('online-top-scroll', 'online-bottom-scroll', 'table');
    setupTopScrollSync('offline-top-scroll', 'offline-bottom-scroll', 'table');

    // Live search filtering
    const searchInput = document.getElementById('monitoringSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.trim().toLowerCase();
            const rows = document.querySelectorAll('.monitor-row');
            
            let onlineMatchCount = 0;
            let offlineMatchCount = 0;
            
            rows.forEach(row => {
                const user = row.getAttribute('data-search-user') || '';
                const code = row.getAttribute('data-search-code') || '';
                const name = row.getAttribute('data-search-name') || '';
                
                if (user.includes(query) || code.includes(query) || name.includes(query)) {
                    row.style.setProperty('display', '', 'important');
                    if (row.closest('#online-view')) {
                        onlineMatchCount++;
                    } else if (row.closest('#offline-view')) {
                        offlineMatchCount++;
                    }
                } else {
                    row.style.setProperty('display', 'none', 'important');
                }
            });
            
            // Auto switch tabs based on search matches
            if (query.length > 0) {
                if (onlineMatchCount > 0 && offlineMatchCount === 0) {
                    const onlineTab = document.getElementById('online-tab');
                    if (onlineTab && !onlineTab.classList.contains('active')) {
                        onlineTab.click();
                    }
                } else if (offlineMatchCount > 0 && onlineMatchCount === 0) {
                    const offlineTab = document.getElementById('offline-tab');
                    if (offlineTab && !offlineTab.classList.contains('active')) {
                        offlineTab.click();
                    }
                }
            }
        });
    }
});
</script>
