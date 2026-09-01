<?php
// views/call_center/ip_phone_numbers.php
if (!isLoggedIn()) exit;

require_once __DIR__ . '/../../classes/IPPhoneDriver.php';

if (!hasRole('Admin') && strcasecmp($_SESSION['user_role'] ?? '', 'Reseller') !== 0) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. Only Tenant Owners or Administrators can access this page.</div></div>";
    exit;
}

// Load all Direct SIP IP Numbers
$owner_id = get_store_owner_id();
$tenant_id = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
$sip_numbers = safeFetchAll($pdo, "SELECT * FROM ip_phone_numbers WHERE tenant_id = ? AND staff_id = ? ORDER BY is_main DESC, id DESC", [$tenant_id, $owner_id]);
?>

<style>
.transition-base {
    transition: all 0.2s ease-in-out;
}
.hover-bg-light:hover {
    background-color: #f8f9fa !important;
}
.avatar-md {
    width: 38px;
    height: 38px;
    min-width: 38px;
}
.bg-light-info {
    background-color: rgba(13, 202, 240, 0.1) !important;
}
.bg-success-light {
    background-color: rgba(25, 135, 84, 0.1) !important;
}
.form-switch .form-check-input:checked {
    background-color: #198754;
    border-color: #198754;
}
.btn-outline-primary {
    color: #4b3df5;
    border-color: #4b3df5;
}
.btn-outline-primary:hover {
    background-color: #4b3df5;
    color: #fff;
    border-color: #4b3df5;
}
/* Premium Modal Styles matching the screenshot */
#ipNumberModal .form-control {
    border-color: #dee2e6;
    transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}
#ipNumberModal .form-control:focus {
    border-color: #4b3df5;
    box-shadow: 0 0 0 3px rgba(75, 61, 245, 0.12);
}
#ipNumberModal .form-switch .form-check-input:checked {
    background-color: #198754;
    border-color: #198754;
}
#ipNumberModal .btn-close:focus {
    box-shadow: none;
}
</style>

<div class="row">
    <div class="col-lg-12">
        <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-dark text-white py-3 d-flex justify-content-between align-items-center">
                <h5 class="mb-0 fw-bold"><i class="fas fa-phone-alt me-2 text-info"></i> Direct SIP Trunk / IP Numbers Setup</h5>
                <button type="button" class="btn btn-sm btn-info rounded-pill px-4 py-2 fw-bold text-white shadow-sm" onclick="openAddIPModal()">
                    <i class="fas fa-plus me-1"></i> Add IP Number
                </button>
            </div>
            <div class="card-body p-4">
                <?php if (empty($sip_numbers)): ?>
                    <div class="text-center py-5 text-muted">
                        <i class="fas fa-phone-slash fa-3x mb-3 opacity-50 text-secondary"></i>
                        <h6 class="fw-bold">No Direct SIP IP Numbers Configured</h6>
                        <p class="small mb-0 text-muted">Add your IP phone numbers (e.g., AmberIT, Link3, BTCL) to enable direct VoIP calling.</p>
                    </div>
                <?php else: ?>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle border border-light rounded-3">
                            <thead class="table-light">
                                <tr>
                                    <th class="py-3 px-4">IP Phone Number</th>
                                    <th class="py-3">SIP Server</th>
                                    <th class="py-3 text-center">Port</th>
                                    <th class="py-3 text-center">Main Active</th>
                                    <th class="py-3 text-end px-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($sip_numbers as $sip): 
                                    $decrypted_pass = IPPhoneDriver::decrypt($sip['password']);
                                ?>
                                    <tr class="transition-base hover-bg-light">
                                        <td class="py-3 px-4">
                                            <div class="d-flex align-items-center">
                                                <div class="avatar avatar-md bg-light-info text-info rounded-circle d-flex align-items-center justify-content-center me-3" style="width:38px; height:38px; min-width:38px;">
                                                    <i class="fas fa-phone"></i>
                                                </div>
                                                <div>
                                                    <span class="fw-bold text-dark fs-6"><?= htmlspecialchars($sip['ip_number']) ?></span>
                                                    <?php if ($sip['is_main']): ?>
                                                        <span class="badge bg-success-light text-success ms-2 rounded-pill px-2 py-1" style="font-size: 10px;"><i class="fas fa-check-circle me-1"></i>Main Active</span>
                                                    <?php endif; ?>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="py-3">
                                            <code class="text-secondary"><?= htmlspecialchars($sip['sip_server']) ?></code>
                                        </td>
                                        <td class="py-3 text-center">
                                            <span class="badge bg-light text-dark border px-2 py-1"><?= htmlspecialchars($sip['port']) ?></span>
                                        </td>
                                        <td class="py-3 text-center">
                                            <?php if ($sip['is_main']): ?>
                                                <div class="form-check form-switch d-inline-block">
                                                    <input class="form-check-input" type="checkbox" checked disabled style="cursor: not-allowed;">
                                                </div>
                                            <?php else: ?>
                                                <div class="form-check form-switch d-inline-block" title="Set as Main Active Number">
                                                    <input class="form-check-input" type="checkbox" style="cursor: pointer;" onclick="window.location.href='controllers/call_center_controller.php?action=toggle_main_ip_number&id=<?= $sip['id'] ?>';">
                                                </div>
                                            <?php endif; ?>
                                        </td>
                                        <td class="py-3 text-end px-4">
                                            <div class="d-flex justify-content-end gap-2">
                                                <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 shadow-none border" 
                                                        onclick="openEditIPModal(<?= $sip['id'] ?>, '<?= htmlspecialchars($sip['ip_number']) ?>', '<?= htmlspecialchars($decrypted_pass) ?>', '<?= htmlspecialchars($sip['sip_server']) ?>', <?= $sip['port'] ?>, '<?= htmlspecialchars($sip['wss_uri'] ?? '') ?>', <?= $sip['is_main'] ?>)">
                                                    <i class="fas fa-pen me-1"></i> Edit
                                                </button>
                                                <button type="button" class="btn btn-sm btn-outline-danger rounded-pill px-3 shadow-none border" 
                                                        onclick="if(confirm('Are you sure you want to delete this IP Phone Number?')) window.location.href='controllers/call_center_controller.php?action=delete_ip_number&id=<?= $sip['id'] ?>';">
                                                    <i class="fas fa-trash me-1"></i> Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- Update/Add IP Number Modal -->
<div class="modal fade" id="ipNumberModal" tabindex="-1" aria-labelledby="ipNumberModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <form method="POST" action="controllers/call_center_controller.php" class="modal-content border-0 shadow-lg rounded-4">
            <input type="hidden" name="action" value="save_ip_number">
            <input type="hidden" name="id" id="ip_number_id" value="0">
            
            <div class="modal-header border-bottom-0 pt-4 px-4 pb-0">
                <h5 class="modal-title fw-bold text-dark fs-4" id="ipNumberModalLabel">Update IP Number</h5>
                <button type="button" class="btn-close shadow-none" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            
            <div class="modal-body px-4 py-3">
                <div class="mb-3">
                    <label class="form-label fw-semibold text-muted small mb-1">IP Number <span class="text-danger">*</span></label>
                    <input type="text" name="ip_number" id="modal_ip_number" class="form-control rounded-3 py-2 px-3 shadow-none border" style="font-size:0.95rem;" placeholder="e.g. 09649900111" required>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold text-muted small mb-1">Password <span class="text-danger">*</span></label>
                    <input type="password" name="password" id="modal_password" class="form-control rounded-3 py-2 px-3 shadow-none border" style="font-size:0.95rem;" placeholder="e.g. 187318" required>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold text-muted small mb-1">SIP Server <span class="text-danger">*</span></label>
                    <input type="text" name="sip_server" id="modal_sip_server" class="form-control rounded-3 py-2 px-3 shadow-none border" style="font-size:0.95rem;" placeholder="e.g. 103.170.231.10" required>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold text-muted small mb-1">Port <span class="text-danger">*</span></label>
                    <input type="number" name="port" id="modal_port" class="form-control rounded-3 py-2 px-3 shadow-none border" style="font-size:0.95rem;" placeholder="e.g. 5060" value="5060" required>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-semibold text-muted small mb-1">WebSocket WSS URI <span class="text-secondary">(Optional for Browser WebRTC)</span></label>
                    <input type="url" name="wss_uri" id="modal_wss_uri" class="form-control rounded-3 py-2 px-3 shadow-none border" style="font-size:0.95rem;" placeholder="e.g. wss://sip.amberit.com.bd:8089/ws">
                </div>
                
                <!-- Main Number Selection Card -->
                <div class="p-3 bg-light border border-light rounded-3 d-flex align-items-center justify-content-between mb-4">
                    <div class="pe-3">
                        <span class="d-block fw-bold text-dark fs-6 mb-1">Main Number</span>
                        <span class="d-block text-muted small" style="font-size: 0.8rem; line-height: 1.3;">This is the active main number. To change, activate another IP number.</span>
                    </div>
                    <div class="form-check form-switch mb-0">
                        <input class="form-check-input" type="checkbox" name="is_main" id="modal_is_main" style="width: 2.5em; height: 1.25em; cursor: pointer;">
                    </div>
                </div>
            </div>
            
            <div class="modal-footer border-top-0 px-4 pb-4 pt-0">
                <button type="submit" id="modal_submit_btn" class="btn text-white w-100 py-3 rounded-3 fw-bold transition-base shadow-sm" style="background-color: #4E36F6; border: none; font-size: 1rem; letter-spacing: 0.5px;">
                    Update
                </button>
            </div>
        </form>
    </div>
</div>

<script>
function openAddIPModal() {
    document.getElementById('ipNumberModalLabel').innerText = "Add IP Number";
    document.getElementById('ip_number_id').value = "0";
    document.getElementById('modal_ip_number').value = "";
    document.getElementById('modal_password').value = "";
    document.getElementById('modal_sip_server').value = "";
    document.getElementById('modal_port').value = "5060";
    document.getElementById('modal_wss_uri').value = "";
    document.getElementById('modal_is_main').checked = false;
    document.getElementById('modal_submit_btn').innerText = "Save IP Number";
    
    var myModal = new bootstrap.Modal(document.getElementById('ipNumberModal'));
    myModal.show();
}

function openEditIPModal(id, number, password, server, port, wssUri, isMain) {
    document.getElementById('ipNumberModalLabel').innerText = "Update IP Number";
    document.getElementById('ip_number_id').value = id;
    document.getElementById('modal_ip_number').value = number;
    document.getElementById('modal_password').value = password;
    document.getElementById('modal_sip_server').value = server;
    document.getElementById('modal_port').value = port;
    document.getElementById('modal_wss_uri').value = wssUri;
    document.getElementById('modal_is_main').checked = isMain === 1;
    document.getElementById('modal_submit_btn').innerText = "Update";
    
    var myModal = new bootstrap.Modal(document.getElementById('ipNumberModal'));
    myModal.show();
}
</script>
