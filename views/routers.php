<?php
// ROUTERS VIEW
if (!hasRole('Admin')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS." ORDER BY id DESC");
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4><i class="fas fa-server me-2"></i> Router Management</h4>
    <button class="btn btn-primary" onclick="addRouter()">
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
                                <button class="btn btn-outline-info btn-sm" onclick="if(confirm('Import all PPP secrets from this router? This will create new users with 1 day credit.')) window.location.href='?tab=routers&action=import_secrets&router_id=<?= $r['id'] ?>'" title="Import PPP Secrets">
                                    <i class="fas fa-file-import"></i>
                                </button>
                                <button class="btn btn-outline-secondary btn-sm" onclick='editRouter(<?= json_encode($r, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'>
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-sm" onclick="confirmDeleteRouter(<?= $r['id'] ?>)">
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

<script>
    let routerModalInstance = null;
    function getRouterModal() {
        if (!routerModalInstance) {
            routerModalInstance = new bootstrap.Modal(document.getElementById('routerModal'));
        }
        return routerModalInstance;
    }

    function addRouter() {
        document.getElementById('modalTitle').innerText = "Add New Router";
        document.getElementById('submitBtn').name = "add_router";
        document.getElementById('submitBtn').innerText = "Save Router";
        document.getElementById('r_id').value = "";
        document.getElementById('r_name').value = "";
        document.getElementById('r_ip').value = "";
        document.getElementById('r_user').value = "";
        document.getElementById('r_pass').value = "";
        document.getElementById('r_port').value = "8728";
        getRouterModal().show();
    }

    function editRouter(data) {
        document.getElementById('modalTitle').innerText = "Edit Router: " + data.name;
        document.getElementById('submitBtn').name = "edit_router";
        document.getElementById('submitBtn').innerText = "Update Router";
        document.getElementById('r_id').value = data.id;
        document.getElementById('r_name').value = data.name;
        document.getElementById('r_ip').value = data.ip_address;
        document.getElementById('r_user').value = data.username;
        document.getElementById('r_pass').value = data.api_password;
        document.getElementById('r_port').value = data.port;
        getRouterModal().show();
    }

    function confirmDeleteRouter(id) {
        if (confirm("Are you sure you want to delete this router?")) {
            window.location.href = "?tab=routers&action=delete_router&id=" + id;
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.router-status').forEach(badge => {
            const id = badge.getAttribute('data-id');
            fetch('?ajax_router_status=1&id=' + id)
            .then(r => r.json())
            .then(data => {
                if (data.online) {
                    badge.classList.remove('bg-secondary');
                    badge.classList.add('bg-success');
                    badge.innerText = "Connected";
                } else {
                    badge.classList.remove('bg-secondary');
                    badge.classList.add('bg-danger');
                    badge.innerText = "Disconnected";
                }
            })
            .catch(() => {
                badge.classList.remove('bg-secondary');
                badge.classList.add('bg-warning');
                badge.innerText = "Error";
            });
        });
    });
</script>
