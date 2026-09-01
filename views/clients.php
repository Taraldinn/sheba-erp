<?php
// CLIENTS VIEW
$status_filter = $_GET['tab'] ?? 'clients';
$managed_ids = getManagedStaffIds($pdo, $user, $role);

$query = "SELECT u.*, r.name as router_name, z.name as zone_name, s.name as owner_name 
          FROM ".TBL_USERS." u 
          LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id 
          LEFT JOIN ".TBL_ZONES." z ON u.zone_id = z.id 
          LEFT JOIN ".TBL_STAFF." s ON u.manager_id = s.id";
$params = [];

if ($status_filter == 'due') {
    $query .= " WHERE u.status = 'Expire'";
    $display_title = "Expire";
} elseif ($status_filter == 'inactive') {
    $query .= " WHERE u.status = 'Inactive'";
    $display_title = "Inactive";
} elseif ($status_filter == 'left_list') {
    $query .= " WHERE u.status = 'Left'";
    $display_title = "Left";
} else {
    // Default (including 'clients' tab) only shows Active per user request
    $query .= " WHERE u.status = 'Active'";
    $display_title = "Active";
}
// Note: 'Free' users can be added to the Active filter if required later.

if ($managed_ids !== 'ALL') {
    $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $query .= " AND u.manager_id IN ($placeholders)";
    $params = array_merge($params, $managed_ids);
} elseif (isset($_GET['f_manager'])) {
    if (!empty($_GET['f_manager'])) {
        $query .= " AND u.manager_id = ?";
        $params[] = $_GET['f_manager'];
    }
} else {
    // Default Admin View: Only show own clients
    $query .= " AND u.manager_id = ?";
    $params[] = $user;
    $_GET['f_manager'] = $user;
}

// Search
if (!empty($_GET['search'])) {
    $s = "%".$_GET['search']."%";
    $query .= " AND (u.name LIKE ? OR u.user_id LIKE ? OR u.phone LIKE ? OR u.onu_mac LIKE ? OR u.client_code LIKE ?)";
    $params[] = $s; $params[] = $s; $params[] = $s; $params[] = $s; $params[] = $s;
}

// Apply Filters to Query
if (!empty($_GET['f_pkg'])) {
    $query .= " AND u.user_package = ?";
    $params[] = $_GET['f_pkg'];
}
if (!empty($_GET['f_zone'])) {
    $query .= " AND u.zone_id = ?";
    $params[] = $_GET['f_zone'];
}
if (!empty($_GET['f_manager'])) {
    $query .= " AND u.manager_id = ?";
    $params[] = $_GET['f_manager'];
}

// Special Handling for Online/Offline Filter
if (!empty($_GET['f_status'])) {
    $cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../cache/global_online.json';
    $cache_raw = file_exists($cache_file) ? json_decode(file_get_contents($cache_file), true) : [];
    $online_data = isset($cache_raw['data']) ? $cache_raw['data'] : $cache_raw;
    $online_user_ids = array_keys($online_data);
    
    if ($_GET['f_status'] == 'online') {
        if (empty($online_user_ids)) {
             $query .= " AND 1=0"; // Force empty result if no one is online
        } else {
             $placeholders = implode(',', array_fill(0, count($online_user_ids), '?'));
             $query .= " AND u.user_id IN ($placeholders)";
             $params = array_merge($params, $online_user_ids);
        }
    } elseif ($_GET['f_status'] == 'offline') {
        if (!empty($online_user_ids)) {
             $placeholders = implode(',', array_fill(0, count($online_user_ids), '?'));
             $query .= " AND u.user_id NOT IN ($placeholders)";
             $params = array_merge($params, $online_user_ids);
        }
    }
}

$query .= " ORDER BY u.id DESC";
$clients = safeFetchAll($pdo, $query, $params);
?>

<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-users-cog me-2 text-primary"></i> <?= $display_title ?> Clients</h4>
    <div class="d-flex flex-column flex-sm-row gap-2">
        <form class="d-flex flex-wrap gap-2 flex-grow-1 flex-sm-grow-0" method="GET">
            <input type="hidden" name="tab" value="<?= $status_filter ?>">
            
            <!-- Filters -->
            <select name="f_pkg" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 130px;">
                <option value="">All Packages</option>
                <?php 
                $pkgs = safeFetchAll($pdo, "SELECT * FROM ".TBL_SERVICES);
                foreach($pkgs as $p) {
                    $sel = (isset($_GET['f_pkg']) && $_GET['f_pkg'] == $p['name']) ? 'selected' : '';
                    echo "<option value='{$p['name']}' $sel>{$p['name']}</option>";
                }
                ?>
            </select>
            
            <select name="f_zone" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 120px;">
                <option value="">All Zones</option>
                <?php 
                $zns = safeFetchAll($pdo, "SELECT * FROM ".TBL_ZONES);
                foreach($zns as $z) {
                    $sel = (isset($_GET['f_zone']) && $_GET['f_zone'] == $z['id']) ? 'selected' : '';
                    echo "<option value='{$z['id']}' $sel>{$z['name']}</option>";
                }
                ?>
            </select>
            
            <!-- Manager Filter (Admin Only) -->
            <?php if(hasRole('Admin')): ?>
            <select name="f_manager" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 130px;">
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
            <?php endif; ?>

            <select name="f_status" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 110px;">
                <option value="">Any Status</option>
                <option value="online" <?= (isset($_GET['f_status']) && $_GET['f_status'] == 'online') ? 'selected' : '' ?>>Online Now</option>
                <option value="offline" <?= (isset($_GET['f_status']) && $_GET['f_status'] == 'offline') ? 'selected' : '' ?>>Offline Now</option>
            </select>
            
            <a href="?action=export_clients" class="text-decoration-none text-success fw-bold mx-2 small"><i class="fas fa-file-csv fa-lg me-1"></i>Export</a>
            <?php if(hasRole('Admin')): ?>
            <a href="#" class="text-decoration-none text-primary fw-bold mx-2 small" data-bs-toggle="modal" data-bs-target="#importModal"><i class="fas fa-file-upload fa-lg me-1"></i>Import</a>
            <?php endif; ?>

            <div class="input-group input-group-sm">
                <input type="text" name="search" class="form-control border-primary" placeholder="Search..." value="<?= $_GET['search'] ?? '' ?>">
                <button type="submit" class="btn btn-primary"><i class="fas fa-search"></i></button>
            </div>
        </form>
        

    </div>
</div>



<form method="POST">
    <div class="card shadow-sm">
        <div class="card-header bg-white py-3 border-bottom-0">
            <div class="row g-3 align-items-center">
                <div class="col-6 col-md-auto">
                    <div class="form-check mb-0">
                        <input class="form-check-input border-secondary" type="checkbox" id="selectAll">
                        <label class="form-check-label fw-semibold small" for="selectAll">Select All</label>
                    </div>
                </div>
                <?php if(hasRole('SubReseller')): ?>
                <div class="col-12 col-md-auto ms-md-auto">
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <div class="d-flex align-items-center bg-light rounded-pill px-3 py-2 border shadow-sm">
                            <span class="fw-bold text-muted me-2 ms-1">Bulk:</span>
                            <input type="number" name="bulk_recharge_days" class="form-control border-0 bg-transparent fw-bold text-primary p-0" style="width: 80px; font-size: 1.1rem; text-align: center;" value="30">
                            <div class="vr mx-1"></div>
                            <select name="pay_method" class="form-select border-0 bg-transparent fw-bold text-success p-0 ps-1" style="width: 110px; font-size: 1rem;">
                                <option value="Cash">Cash</option>
                                <option value="Bank">Bank</option>
                                <option value="bKash">bKash</option>
                                <option value="Nagad">Nagad</option>
                                <option value="Rocket">Rocket</option>
                                <option value="Due">Due (Credit)</option>
                            </select>
                            <div id="bulkTotalArea" class="ms-2 d-none d-flex align-items-center">
                                <span class="small text-muted me-1">Total:</span>
                                <span id="bulkTotal" class="fw-bold text-danger me-1">৳0</span>
                            </div>
                            <button type="submit" name="bulk_recharge" id="bulkRechargeBtn" class="btn btn-primary rounded-pill px-4 ms-2">Recharge</button>
                        </div>
                        <div class="d-flex align-items-center bg-light rounded-pill px-3 py-2 border shadow-sm ms-2">
                            <span class="fw-bold text-muted me-2 ms-1">Ext:</span>
                            <input type="number" name="bulk_days" class="form-control border-0 bg-transparent fw-bold text-info p-0" style="width: 70px; font-size: 1.1rem; text-align: center;" value="3" min="1" max="10">
                            <div class="vr mx-1"></div>
                            <button type="submit" name="bulk_extend" class="btn btn-outline-info rounded-pill px-3 fw-bold border-0">Extend</button>
                        </div>
                    </div>
                </div>
                <?php endif; ?>
            </div>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
                    <thead class="bg-light">
                        <tr>
                            <th width="30"></th>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Zone</th>
                            <th>Package</th>
                            <th>Owner</th>
                            <th>Status</th>
                            <th>Online</th>
                            <th>Rem. Days</th>
                            <th class="text-end pe-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if(empty($clients)): ?>
                        <tr><td colspan="11" class="text-center py-5 text-muted">No clients found</td></tr>
                        <?php else: foreach($clients as $c): 
                            // Calculate Remaining Days
                            $today = new DateTime();
                            $expiry = new DateTime($c['current_bill_date']);
                            $diff = $today->diff($expiry);
                            $rem_days = $diff->invert ? -$diff->days : $diff->days;
                            $display_rem = ($c['status'] == 'Free') ? 'Infinity' : ($rem_days . ' Days');
                            
                            // Online Status
                            $is_online = in_array($c['user_id'], $GLOBAL_ONLINE_USERS);
                        ?>
                        <tr>
                            <td class="ps-3"><input type="checkbox" name="bulk_ids[]" value="<?= $c['id'] ?>" class="client-check" data-bill="<?= $c['bill_amount'] ?>"></td>
                             <td class="small text-muted">
                                <?= htmlspecialchars($c['user_id']) ?>
                                <?php if (!empty($c['client_code'])): ?>
                                    <div class="text-primary fw-bold" style="font-size: 0.75rem;">(<?= htmlspecialchars($c['client_code']) ?>)</div>
                                <?php endif; ?>
                            </td>
                            <td><div class="fw-bold"><a href="?view_id=<?= $c['id'] ?>" class="text-decoration-none"><?= $c['name'] ?></a></div></td>
                            <td><?= $c['phone'] ?></td>
                            <td><span class="badge bg-light text-dark border"><?= $c['zone_name'] ?? 'Default' ?></span></td>
                            <td><?= $c['user_package'] ?></td>
                            <td class="small"><?= $c['owner_name'] ?? 'N/A' ?></td>
                            <td>
                                <span class="badge <?= ($c['status']=='Active')?'bg-success':(($c['status']=='Expire')?'bg-danger':'bg-secondary') ?>">
                                    <?= $c['status'] ?>
                                </span>
                            </td>
                            <td>
                                <span class="badge bg-light text-muted border online-status-indicator" data-uid="<?= $c['user_id'] ?>">
                                    <i class="fas fa-spinner fa-spin me-1"></i> Check
                                </span>
                            </td>
                            <td class="fw-bold <?= ($c['status'] == 'Free') ? 'text-success' : (($rem_days <= 3) ? 'text-danger' : 'text-primary') ?>">
                                <?= $display_rem ?>
                            </td>
                            <td class="text-end pe-3">
                                <div class="dropdown">
                                    <button class="btn btn-light btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown"><i class="fas fa-cog"></i></button>
                                    <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                                        <li><a class="dropdown-item" href="?view_id=<?= $c['id'] ?>"><i class="fas fa-eye me-2 text-primary"></i> View Detail</a></li>
                                        <li><a class="dropdown-item" href="?tab=edit_client&uid=<?= $c['id'] ?>"><i class="fas fa-edit me-2 text-secondary"></i> Edit Info</a></li>
                                        <li><hr class="dropdown-divider"></li>
                                        <li><a class="dropdown-item text-danger btn-clients-make-left" href="#" data-id="<?= $c['id'] ?>" data-name="<?= htmlspecialchars($c['name']) ?>"><i class="fas fa-user-slash me-2 text-danger"></i> Make Left</a></li>
                                        <?php if(hasRole('Admin')): ?>
                                        <!-- <li><a class="dropdown-item" href="#">Delete</a></li> -->
                                        <?php endif; ?>
                                    </ul>
                                </div>
                            </td>
                        </tr>
                        <?php endforeach; endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</form>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // AJAX Online Check
    const indicators = document.querySelectorAll('.online-status-indicator');
    const uids = Array.from(indicators).map(el => el.getAttribute('data-uid')).filter(v => v);
    
    if (uids.length > 0) {
        // Split UIDs into chunks of 300 to avoid sending huge URLs and causing timeouts
        const chunkSize = 300;
        for (let i = 0; i < uids.length; i += chunkSize) {
            const chunk = uids.slice(i, i + chunkSize);
            fetch('?ajax_status=1&uids=' + encodeURIComponent(chunk.join(',')))
                .then(r => r.json())
                .then(data => {
                    indicators.forEach(el => {
                        const uid = el.getAttribute('data-uid');
                        if (chunk.includes(uid)) {
                            const isOnline = Array.isArray(data) ? data.includes(uid) : !!data[uid];
                            if (isOnline) {
                                el.className = 'badge bg-success rounded-pill';
                                el.innerHTML = 'Online';
                            } else {
                                el.className = 'badge bg-light text-muted border rounded-pill';
                                el.innerHTML = 'Offline';
                            }
                        }
                    });
                })
                .catch(err => console.error("Chunk Status Check Error:", err));
        }
    }

    // Submit form on filter change
    document.querySelectorAll('.submit-on-change').forEach(el => {
        el.addEventListener('change', function() {
            this.form.submit();
        });
    });

    // Bulk recharge confirmation
    const bulkRechargeBtn = document.getElementById('bulkRechargeBtn');
    if (bulkRechargeBtn) {
        bulkRechargeBtn.addEventListener('click', function(e) {
            if (!confirm('Bulk recharge selected?')) {
                e.preventDefault();
            }
        });
    }

    // Make Left click binding
    document.querySelectorAll('.btn-clients-make-left').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const id = this.getAttribute('data-id');
            const name = this.getAttribute('data-name');
            openLeftModal(id, name);
        });
    });

    // Select All Checkboxes
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            document.querySelectorAll('.client-check').forEach(cb => cb.checked = this.checked);
        });
    }
});
</script>

<!-- Import Modal -->
<div class="modal fade" id="importModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Import Clients</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form method="POST" enctype="multipart/form-data">
                <div class="modal-body">
                    <p class="small text-muted">Upload a CSV or Excel file to import clients. Duplicate IDs will update existing records.</p>
                    <div class="mb-3">
                        <label class="form-label">Select File (CSV)</label>
                        <input type="file" name="csv_file" class="form-control" accept=".csv, .xlsx" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="submit" name="import_clients" class="btn btn-primary">Import Data</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Make Left Modal -->
<div class="modal fade" id="leftModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-danger text-white"><h5 class="modal-title">Confirm Client Termination</h5></div>
            <div class="modal-body">
                <input type="hidden" name="id" id="leftClientId">
                <input type="hidden" name="make_left_confirm" value="1">
                <p>Are you sure you want to mark <strong id="leftClientName"></strong> as <strong>Left</strong>?</p>
                <div class="alert alert-warning small">
                    <i class="fas fa-info-circle me-1"></i> This will disable the PPPoE account on the Mikrotik and calculate any remaining balance for refund.
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Refund Unused Days via:</label>
                    <select name="refund_method" class="form-select" required>
                        <option value="Wallet">Wallet (Add to my balance)</option>
                        <option value="Cash">Cash (Manual settlement)</option>
                        <option value="None">No Refund</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="make_left_confirm" class="btn btn-danger">Confirm Left</button>
            </div>
        </form>
    </div>
</div>

<script>
function openLeftModal(id, name) {
    document.getElementById('leftClientId').value = id;
    document.getElementById('leftClientName').innerText = name;
    new bootstrap.Modal(document.getElementById('leftModal')).show();
}
</script>
