<?php
// OLT Management View
require_once __DIR__ . '/../classes/OLTManager.php';
$oltMgr = new OLTManager($pdo);

// Handle Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['add_olt'])) {
        $oltMgr->addOLT($_POST);
        $msg = "OLT Added Successfully";
    } elseif (isset($_POST['edit_olt'])) {
        $oltMgr->updateOLT($_POST['id'], $_POST);
        $msg = "OLT Updated Successfully";
    } elseif (isset($_POST['delete_olt'])) {
        $oltMgr->deleteOLT($_POST['id']);
        $msg = "OLT Deleted Successfully";
    }
}

$olts = $oltMgr->getAllOLTs();
?>

<div class="row">
    <div class="col-12 mb-3">
        <div class="d-flex justify-content-between align-items-center">
            <h4><i class="fas fa-server me-2"></i> OLT Management</h4>
            <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addOLTModal">
                <i class="fas fa-plus me-2"></i> Add New OLT
            </button>
        </div>
    </div>
    
    <?php foreach($olts as $olt): ?>
    <div class="col-md-4 mb-3">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <div class="d-flex justify-content-between">
                    <h5 class="card-title fw-bold"><?= htmlspecialchars($olt['name']) ?></h5>
                    <div>
                        <span class="badge bg-secondary"><?= htmlspecialchars($olt['brand']) ?></span>
                        <span id="status-badge-<?= $olt['id'] ?>" class="badge bg-secondary status-badge"><i class="fas fa-question-circle"></i> Checking...</span>
                    </div>
                </div>
                <p class="text-muted small mb-2">
                    <i class="fas fa-network-wired me-1"></i> <?= $olt['ip_address'] ?> : <?= $olt['port'] ?>
                    <?php if (!empty($olt['latlong'])): ?>
                        <br><i class="fas fa-map-marker-alt text-danger me-1"></i> Latlong: <a href="https://maps.google.com/?q=<?= urlencode($olt['latlong']) ?>" target="_blank" class="text-dark fw-bold"><?= htmlspecialchars($olt['latlong']) ?></a>
                    <?php endif; ?>
                </p>
                
                <div class="d-flex gap-2 mt-3">
                    <button class="btn btn-sm btn-outline-primary w-100" data-bs-toggle="modal" data-bs-target="#editOLTModal<?= $olt['id'] ?>">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-info w-100" onclick="testConnection(<?= $olt['id'] ?>)">
                        <i class="fas fa-plug"></i> Test
                    </button>
                    <a href="index.php?tab=olt_onus&id=<?= $olt['id'] ?>" class="btn btn-sm btn-outline-success w-100">
                        <i class="fas fa-list"></i> ONUs
                    </a>
                    <form method="POST" class="w-100" onsubmit="return confirm('Are you sure?');">
                        <input type="hidden" name="id" value="<?= $olt['id'] ?>">
                        <button type="submit" name="delete_olt" class="btn btn-sm btn-outline-danger w-100">
                            <i class="fas fa-trash"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Edit Modal -->
    <div class="modal fade" id="editOLTModal<?= $olt['id'] ?>" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <form method="POST">
                    <div class="modal-header">
                        <h5 class="modal-title">Edit OLT</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" name="id" value="<?= $olt['id'] ?>">
                        <div class="mb-3">
                            <label>Name</label>
                            <input type="text" name="name" class="form-control" value="<?= htmlspecialchars($olt['name']) ?>" required>
                        </div>
                        <div class="mb-3">
                            <label>OLT Latlong</label>
                            <input type="text" name="latlong" class="form-control" value="<?= htmlspecialchars($olt['latlong'] ?? '') ?>" placeholder="e.g. 23.8103,90.4125">
                        </div>
                        <div class="row g-2">
                            <div class="col-6">
                                <label>IP Address</label>
                                <input type="text" name="ip_address" class="form-control" value="<?= htmlspecialchars($olt['ip_address']) ?>" required>
                            </div>
                            <div class="col-3">
                                <label>Web Port <small class="text-muted">(Opt)</small></label>
                                <input type="number" name="port" class="form-control" value="<?= $olt['port'] ?>" placeholder="Default">
                            </div>
                            <div class="col-3">
                                <label>Protocol</label>
                                <select name="http_scheme" class="form-select">
                                    <option value="http" <?= ($olt['http_scheme']??'http')=='http'?'selected':'' ?>>HTTP</option>
                                    <option value="https" <?= ($olt['http_scheme']??'http')=='https'?'selected':'' ?>>HTTPS</option>
                                </select>
                            </div>
                            <!-- Telnet Port Removed -->
                            <input type="hidden" name="telnet_port" value="<?= $olt['telnet_port'] ?? 23 ?>">
                        </div>
                        <div class="mb-3 mt-2">
                            <label>Brand</label>
                            <select name="brand" class="form-select">
                                <option value="Generic" <?= $olt['brand']=='Generic'?'selected':'' ?>>Generic</option>
                                <option value="BDCom" <?= $olt['brand']=='BDCom'?'selected':'' ?>>BDCom</option>
                                <option value="VSol" <?= $olt['brand']=='VSol'?'selected':'' ?>>VSol</option>
                                <option value="Huawei" <?= $olt['brand']=='Huawei'?'selected':'' ?>>Huawei</option>
                                <option value="ZTE" <?= $olt['brand']=='ZTE'?'selected':'' ?>>ZTE</option>
                                <option value="HSGQ_EPON" <?= $olt['brand']=='HSGQ_EPON'?'selected':'' ?>>HSGQ EPON</option>
                            </select>
                        </div>
                        <hr>
                        <div class="mb-2">
                            <label>Admin / SNMP User</label>
                            <input type="text" name="snmp_user" class="form-control" value="<?= htmlspecialchars($olt['snmp_user'] ?? '') ?>">
                        </div>
                        <div class="mb-2">
                            <label>Admin / SNMP Password</label>
                            <input type="text" name="snmp_password" class="form-control" value="<?= htmlspecialchars($olt['snmp_password'] ?? '') ?>">
                        </div>

                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="submit" name="edit_olt" class="btn btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    <?php endforeach; ?>
</div>

<!-- Add Modal -->
<div class="modal fade" id="addOLTModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <form method="POST">
                <div class="modal-header">
                    <h5 class="modal-title">Add New OLT</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label>Name</label>
                        <input type="text" name="name" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label>OLT Latlong</label>
                        <input type="text" name="latlong" class="form-control" placeholder="e.g. 23.8103,90.4125">
                    </div>
                    <div class="row g-2">
                        <div class="col-8">
                            <label>IP Address</label>
                            <input type="text" name="ip_address" class="form-control" required>
                        </div>
                        <div class="col-6">
                            <label>Web Port <small class="text-muted">(Optional)</small></label>
                            <input type="number" name="port" class="form-control" placeholder="Default">
                        </div>
                        <div class="col-6">
                            <label>Protocol</label>
                            <select name="http_scheme" class="form-select">
                                <option value="http">HTTP</option>
                                <option value="https">HTTPS</option>
                            </select>
                        </div>
                         <!-- Telnet Port Removed -->
                        <input type="hidden" name="telnet_port" value="23">
                    </div>
                    <div class="mb-3 mt-2">
                        <label>Brand</label>
                        <select name="brand" class="form-select">
                            <option value="Generic">Generic</option>
                            <option value="BDCom">BDCom</option>
                            <option value="VSol">VSol</option>
                            <option value="Huawei">Huawei</option>
                            <option value="ZTE">ZTE</option>
                            <option value="HSGQ_EPON">HSGQ EPON</option>
                        </select>
                    </div>
                    <hr>
                    <div class="mb-2">
                        <label>Admin / SNMP User</label>
                        <input type="text" name="snmp_user" class="form-control">
                    </div>
                    <div class="mb-2">
                        <label>Admin / SNMP Password</label>
                        <input type="text" name="snmp_password" class="form-control">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="submit" name="add_olt" class="btn btn-primary">Add OLT</button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
document.addEventListener("DOMContentLoaded", function() {
    // Auto-check status for all OLTs
    <?php foreach($olts as $o): ?>
    checkStatus(<?= $o['id'] ?>);
    <?php endforeach; ?>
});

function checkStatus(id) {
    const badge = document.getElementById('status-badge-' + id);
    if(badge) badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    
    // Server-Side Check via HTTP/Scraping
    fetch('index.php?ajax_olt_check=1&id=' + id)
        .then(response => response.json())
        .then(data => {
            if(data.status) {
                if(badge) {
                    badge.className = 'badge bg-success status-badge';
                    badge.innerHTML = '<i class="fas fa-check-circle"></i> Online';
                    badge.title = data.message;
                }
            } else {
                if(badge) {
                    badge.className = 'badge bg-danger status-badge';
                    badge.innerHTML = '<i class="fas fa-times-circle"></i> Offline';
                    badge.title = data.message;
                }
            }
        })
        .catch(err => {
            if(badge) {
                badge.className = 'badge bg-secondary status-badge';
                badge.innerHTML = '<i class="fas fa-question"></i> Error';
            }
        });
}

function testConnection(id) {
    const badge = document.getElementById('status-badge-' + id);
    if(badge) badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    
    fetch('index.php?ajax_olt_check=1&deep=1&id=' + id)
        .then(response => response.json())
        .then(data => {
            checkStatus(id); // Refresh badge
            alert(data.message);
        });
}
</script>
