<?php
// STAFF / SUB-RESELLER VIEW
if (!hasRole('Reseller')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$show_left = ($_GET['tab'] == 'left_staff');
$view_parent_id = (isOffice() && ($_SESSION['parent_id'] ?? 0) > 0) ? $_SESSION['parent_id'] : $user;
$staff_list = safeFetchAll($pdo, "SELECT * FROM ".TBL_STAFF." WHERE parent_id=? AND status=? ORDER BY id DESC", [$view_parent_id, $show_left?'Left':'Active']);
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4><i class="fas fa-users-cog me-2"></i> <?= $show_left?'Former':'Active' ?> Sub-Resellers</h4>
    <?php if(!$show_left): ?>
        <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#addStaffModal">
            <i class="fas fa-user-plus me-1"></i> Add Sub-Reseller
        </button>
    <?php endif; ?>
</div>

<div class="card shadow-sm">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Name</th>
                        <th>User ID</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th class="text-end pe-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($staff_list)): ?>
                        <tr><td colspan="5" class="text-center py-5 text-muted">No staff members found.</td></tr>
                    <?php else: foreach($staff_list as $s): ?>
                        <tr>
                            <td class="ps-3">
                                <div class="fw-bold"><?= $s['name'] ?></div>
                                <div class="small text-muted"><?= $s['phone'] ?></div>
                            </td>
                            <td><?= $s['username'] ?></td>
                            <td class="fw-bold text-success">৳<?= number_format($s['balance'], 2) ?></td>
                            <td>
                                <span class="badge bg-<?= $s['status']=='Active'?'success':'secondary' ?>"><?= $s['status'] ?></span>
                                <?php if(($s['lock_status']??'None') !== 'None'): ?>
                                    <span class="badge bg-danger ms-1"><i class="fas fa-lock"></i> <?= $s['lock_status'] ?> Lock</span>
                                <?php endif; ?>
                            </td>
                            <td class="text-end pe-3">
                                <button class="btn btn-outline-danger btn-sm me-1" title="Lock/Unlock Panel" onclick="openLockModal(<?= $s['id'] ?>, '<?= $s['name'] ?>', '<?= $s['lock_status']??'None' ?>', `<?= htmlspecialchars($s['lock_note']??'') ?>`)">
                                    <i class="fas fa-user-lock"></i>
                                </button>
                                <button class="btn btn-outline-primary btn-sm" title="Add Funds" onclick="transferFunds(<?= $s['id'] ?>, '<?= $s['name'] ?>')">
                                    <i class="fas fa-plus-circle"></i>
                                </button>
                                <button class="btn btn-outline-secondary btn-sm" title="Edit" onclick='editSubReseller(<?= json_encode($s, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'>
                                    <i class="fas fa-edit"></i>
                                </button>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

</div>

<!-- Add Staff Modal -->
<div class="modal fade" id="addStaffModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create Sub-Reseller</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="role" value="SubReseller">
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Full Name</label>
                        <input type="text" name="name" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Phone No</label>
                        <input type="text" name="phone" class="form-control form-control-sm" required>
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Username</label>
                        <input type="text" name="username" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Password</label>
                        <input type="text" name="password" class="form-control form-control-sm" required>
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">NID / ID Number</label>
                        <input type="text" name="nid" class="form-control form-control-sm">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-danger">Advance Balance Limit (৳)</label>
                        <input type="number" name="advance_balance_limit" class="form-control form-control-sm" placeholder="0.00" step="0.01">
                    </div>
                </div>
                <div class="mb-2">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" name="can_use_global_sms" id="s_can_use_global_sms" value="1" onchange="toggleSMSFields()">
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
                    <textarea name="address" class="form-control form-control-sm" rows="2"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="create_staff" class="btn btn-primary btn-sm">Save Reseller</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Staff Modal -->
<div class="modal fade" id="editStaffModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Sub-Reseller</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="staff_id" id="edit_s_id">
                <input type="hidden" name="role" id="edit_s_role" value="SubReseller">
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Full Name</label>
                        <input type="text" name="name" id="edit_s_name" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Phone No</label>
                        <input type="text" name="phone" id="edit_s_phone" class="form-control form-control-sm" required>
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Username</label>
                        <input type="text" name="username" id="edit_s_username" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Password</label>
                        <input type="text" name="password" id="edit_s_password" class="form-control form-control-sm" placeholder="Leave blank to keep">
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">NID / ID Number</label>
                        <input type="text" name="nid" id="edit_s_nid" class="form-control form-control-sm">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-danger">Advance Balance Limit (৳)</label>
                        <input type="number" name="advance_balance_limit" id="edit_s_advance" class="form-control form-control-sm" placeholder="0.00" step="0.01">
                    </div>
                </div>
                <div class="mb-2">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" name="can_use_global_sms" id="edit_s_can_use_global_sms" value="1" onchange="toggleSMSFieldsEdit()">
                        <label class="form-check-label small fw-bold text-primary" for="edit_s_can_use_global_sms">Enable Global SMS API (Super Admin API)</label>
                    </div>
                </div>

                <div class="row g-2 mb-2" id="sms_fields_row_edit" style="display:none;">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-primary">SMS Balance</label>
                        <input type="number" name="sms_balance" id="edit_s_sms_balance" class="form-control form-control-sm" step="0.01">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-primary">SMS Rate (Per SMS)</label>
                        <input type="number" name="sms_rate" id="edit_s_sms_rate" class="form-control form-control-sm" step="0.01">
                    </div>
                </div>
                <div class="mb-2">
                    <label class="form-label small fw-bold">Address</label>
                    <textarea name="address" id="edit_s_address" class="form-control form-control-sm" rows="2"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="edit_staff" class="btn btn-primary btn-sm">Update Reseller</button>
            </div>
        </form>
    </div>
</div>

<!-- Transfer Funds Modal -->
<div class="modal fade" id="transferFundsModal" tabindex="-1">
    <div class="modal-dialog"><form method="POST" class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Transfer Funds to Sub-Reseller</h5></div>
        <div class="modal-body">
            <input type="hidden" name="target_id" id="transferTargetId">
            <div class="mb-3">
                <label class="form-label fw-bold">Receiver Name</label>
                <input type="text" id="transferTargetName" class="form-control" readonly>
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold">Amount (BDT)</label>
                <input type="number" name="amount" class="form-control" placeholder="1000.00" required>
            </div>
        </div>
        <div class="modal-footer">
            <button type="submit" name="transfer_balance" class="btn btn-primary w-100">Send Balance Now</button>
        </div>
    </form></div>
</div>


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

<script>
    function transferFunds(id, name) {
        document.getElementById('transferTargetId').value = id;
        document.getElementById('transferTargetName').value = name;
        new bootstrap.Modal(document.getElementById('transferFundsModal')).show();
    }
    
    function openLockModal(id, name, currentStatus, currentNote) {
        document.getElementById('lockTargetId').value = id;
        document.getElementById('lockTargetName').value = name;
        document.getElementById('lockTypeSelect').value = currentStatus;
        document.getElementById('lockNote').value = currentNote;
        
        const modal = new bootstrap.Modal(document.getElementById('lockStaffModal'));
        modal.show();
        
        // Initial help text
        updateLockHelp();
        document.getElementById('lockTypeSelect').onchange = updateLockHelp;
    }
    
    function updateLockHelp() {
        const val = document.getElementById('lockTypeSelect').value;
        const help = document.getElementById('lockHelpText');
        if(val === 'None') help.innerHTML = '<span class="text-success"><i class="fas fa-check-circle"></i> Service and Panel access will be fully restored.</span>';
        else if(val === 'Panel') help.innerHTML = '<span class="text-warning"><i class="fas fa-info-circle"></i> Reseller cannot login, but existing clients continue service.</span>';
        else if(val === 'Full') help.innerHTML = '<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle"></i> DANGER: Reseller locked AND all active clients will be disconnected immediately!</span>';
    }

    function editSubReseller(data) {
        document.getElementById('edit_s_id').value = data.id;
        document.getElementById('edit_s_name').value = data.name;
        document.getElementById('edit_s_phone').value = data.phone || '';
        document.getElementById('edit_s_username').value = data.username;
        document.getElementById('edit_s_nid').value = data.nid || '';
        document.getElementById('edit_s_advance').value = data.advance_balance_limit || 0;
        document.getElementById('edit_s_address').value = data.address || '';
        document.getElementById('edit_s_can_use_global_sms').checked = (data.can_use_global_sms == 1);
        toggleSMSFieldsEdit();
        document.getElementById('edit_s_sms_balance').value = data.sms_balance || 0;
        document.getElementById('edit_s_sms_rate').value = data.sms_rate || 0;
        document.getElementById('edit_s_password').value = ''; // Don't pre-fill password
        
        new bootstrap.Modal(document.getElementById('editStaffModal')).show();
    }

    function toggleSMSFields() {
        const row = document.getElementById('sms_fields_row');
        const isChecked = document.getElementById('s_can_use_global_sms').checked;
        row.style.display = isChecked ? 'flex' : 'none';
    }

    function toggleSMSFieldsEdit() {
        const row = document.getElementById('sms_fields_row_edit');
        const isChecked = document.getElementById('edit_s_can_use_global_sms').checked;
        row.style.display = isChecked ? 'flex' : 'none';
    }
</script>
