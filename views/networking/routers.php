<?php
// ROUTERS VIEW
if (!hasRole('Admin') && !isOffice()) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

if (isset($_GET['view_unregistered']) && isset($_GET['router_id'])) {
    $rid = intval($_GET['router_id']);
    $router = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$rid]);
    if (!$router) {
        echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Router not found.</div></div>";
        return;
    }
    
    $mk = new MikrotikApp($router);
    $is_online = $mk->isOnline();
    ?>

<!-- Live Network Topology quick access -->
<div class="d-flex justify-content-end mb-3 topology-quick-link">
    <a href="?tab=network_topology" class="btn btn-dark">
        <i class="fas fa-project-diagram me-2 text-info"></i> Live Network Topology
    </a>
</div>

    <div class="d-flex justify-content-between align-items-center mb-4">
        <h4>
            <a href="?tab=routers" class="btn btn-outline-secondary btn-sm me-2">
                <i class="fas fa-arrow-left"></i>
            </a>
            Unregistered Users on Router: <span class="text-primary"><?= htmlspecialchars($router['name']) ?></span>
        </h4>
    </div>

    <?php if (!$is_online): ?>
        <div class="alert alert-danger shadow-sm border-start border-4 border-danger">
            <i class="fas fa-exclamation-triangle me-2"></i>Could not connect to the router. Please check if the router is online and the API credentials/port are correct.
        </div>
    <?php else: 
        $secrets = $mk->getSecrets();
        $registered_users = safeFetchAll($pdo, "SELECT user_id FROM ".TBL_USERS);
        $registered_set = [];
        foreach ($registered_users as $ru) {
            $registered_set[strtolower(trim($ru['user_id']))] = true;
        }
        
        $unregistered_secrets = [];
        foreach ($secrets as $s) {
            $name = trim($s['name'] ?? '');
            if ($name !== '' && !isset($registered_set[strtolower($name)])) {
                $unregistered_secrets[] = $s;
            }
        }
        ?>
        <div class="card shadow-sm">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Username (PPPoE ID)</th>
                                <th>Password</th>
                                <th>Profile</th>
                                <th>Status (on Router)</th>
                                <th class="text-end pe-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($unregistered_secrets)): ?>
                                <tr>
                                    <td colspan="5" class="text-center py-5 text-muted">
                                        <i class="fas fa-check-circle text-success fa-2x mb-2"></i><br>
                                        All MikroTik PPPoE users are registered in the billing system!
                                    </td>
                                </tr>
                            <?php else: ?>
                                <?php foreach ($unregistered_secrets as $s): 
                                    $s_name = $s['name'] ?? '';
                                    $s_pass = $s['password'] ?? '';
                                    $s_profile = $s['profile'] ?? '';
                                    $s_disabled = ($s['disabled'] ?? 'false') === 'true';
                                ?>
                                    <tr>
                                        <td class="ps-3 fw-bold text-dark"><?= htmlspecialchars($s_name) ?></td>
                                        <td><code><?= htmlspecialchars($s_pass) ?></code></td>
                                        <td><span class="badge bg-info text-dark"><?= htmlspecialchars($s_profile) ?></span></td>
                                        <td>
                                            <?php if ($s_disabled): ?>
                                                <span class="badge bg-danger">Disabled</span>
                                            <?php else: ?>
                                                <span class="badge bg-success">Enabled</span>
                                            <?php endif; ?>
                                        </td>
                                        <td class="text-end pe-3">
                                            <a href="?tab=add_client&prefill_user=<?= urlencode($s_name) ?>&prefill_pass=<?= urlencode($s_pass) ?>&prefill_profile=<?= urlencode($s_profile) ?>&router_id=<?= $rid ?>" class="btn btn-primary btn-sm me-1" title="Register user with full details">
                                                <i class="fas fa-user-plus me-1"></i> Register Client
                                            </a>
                                            <button class="btn btn-success btn-sm btn-quick-import" 
                                                    data-router-id="<?= $rid ?>" 
                                                    data-username="<?= htmlspecialchars($s_name, ENT_QUOTES, 'UTF-8') ?>" 
                                                    data-password="<?= htmlspecialchars($s_pass, ENT_QUOTES, 'UTF-8') ?>" 
                                                    data-profile="<?= htmlspecialchars($s_profile, ENT_QUOTES, 'UTF-8') ?>" 
                                                    title="Quick Import with default settings">
                                                <i class="fas fa-bolt me-1"></i> Quick Import
                                            </button>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.btn-quick-import').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const username = this.getAttribute('data-username');
                    const password = this.getAttribute('data-password');
                    const profile = this.getAttribute('data-profile');
                    const routerId = this.getAttribute('data-router-id');
                    
                    if (confirm(`Are you sure you want to quick-import user "${username}"? This will create an active client with 1 day credit.`)) {
                        window.location.href = `?tab=routers&action=quick_import&router_id=${routerId}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&profile=${encodeURIComponent(profile)}`;
                    }
                });
            });
        });
        </script>
    <?php endif; ?>
    <?php
    return;
}

$routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS." ORDER BY id DESC");
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4><i class="fas fa-server me-2"></i> Router Management</h4>
    <button class="btn btn-primary" id="btnAddRouter">
        <i class="fas fa-plus me-1"></i> Add Router
    </button>
</div>

<div class="card shadow-sm">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Name</th>
                        <th>IP Address</th>
                        <th>Username</th>
                        <th>Status</th>
                        <th class="text-end pe-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                        <?php if(empty($routers)): ?>
                            <tr><td colspan="5" class="text-center py-5 text-muted">No routers configured</td></tr>
                        <?php else: foreach($routers as $r): ?>
                            <tr>
                                <td class="ps-3 fw-bold"><?= $r['name'] ?></td>
                                <td><?= $r['ip_address'] ?></td>
                                <td><?= $r['username'] ?></td>
                                <td>
                                    <span class="badge bg-secondary router-status" data-id="<?= $r['id'] ?>">
                                        <i class="fas fa-spinner fa-spin me-1"></i> Checking...
                                    </span>
                                </td>
                            <td class="text-end pe-3">
                                <button class="btn btn-outline-info btn-sm btn-import-secrets" data-href="?tab=routers&action=import_secrets&router_id=<?= $r['id'] ?>" title="Import PPP Secrets">
                                    <i class="fas fa-file-import"></i>
                                </button>
                                <button class="btn btn-outline-success btn-sm btn-sync-router" data-id="<?= $r['id'] ?>" title="Sync Clients to MikroTik">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                                <button class="btn btn-outline-warning btn-sm btn-unreg-show-list" data-id="<?= $r['id'] ?>" onclick="window.location.href='?tab=routers&view_unregistered=1&router_id=<?= $r['id'] ?>'" title="Unregistered Users">
                                    <i class="fas fa-users-slash"></i>
                                </button>
                                <button class="btn btn-outline-secondary btn-sm btn-edit-router" 
                                    data-id="<?= $r['id'] ?>"
                                    data-name="<?= htmlspecialchars($r['name'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-ip_address="<?= htmlspecialchars($r['ip_address'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-username="<?= htmlspecialchars($r['username'], ENT_QUOTES, 'UTF-8') ?>"
                                    data-api_password="<?= htmlspecialchars($r['api_password'] ?? '', ENT_QUOTES, 'UTF-8') ?>"
                                    data-port="<?= htmlspecialchars($r['port'] ?? '8728', ENT_QUOTES, 'UTF-8') ?>">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-sm btn-delete-router" data-id="<?= $r['id'] ?>">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Router Modal -->
<div class="modal fade" id="routerModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="modalTitle">Add New Router</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="router_id" id="r_id">
                <div class="mb-3">
                    <label class="form-label">Router Name</label>
                    <input type="text" name="name" id="r_name" class="form-control" placeholder="e.g. Core Router" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">IP / Host</label>
                    <input type="text" name="ip" id="r_ip" class="form-control" placeholder="192.168.0.1" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">API Username</label>
                    <input type="text" name="user" id="r_user" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">API Password</label>
                    <input type="password" name="pass" id="r_pass" class="form-control">
                </div>
                <div class="mb-3">
                    <label class="form-label">API Port</label>
                    <input type="number" name="port" id="r_port" class="form-control" value="8728">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="add_router" id="submitBtn" class="btn btn-primary">Save Router</button>
            </div>
        </form>
    </div>
</div>

<script src="assets/js/router-management.js?v=<?= APP_DEPLOYMENT_ID ?>"></script>
