<?php
// OFFICE STAFF VIEW (RBAC)
if (!hasRole('Admin') && !isOffice() && !hasRole('Reseller') && !hasPermission('office_staff')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$managed_ids = getManagedStaffIds($pdo, $user, $_SESSION['user_role']);
// If not Admin, restrict roles and skip Admin-created staff
if (!hasRole('Admin')) {
    $office_roles = ['Supervisor'];
}

$search = $_GET['search'] ?? '';
$role_placeholders = implode(',', array_fill(0, count($office_roles), '?'));
// Base logic
$query = "SELECT * FROM ".TBL_STAFF." WHERE role IN ($role_placeholders) AND status = 'Active'";
$params = $office_roles;

// If not Admin, only show staff within managed scope
if (!hasRole('Admin') && is_array($managed_ids)) {
    $m_placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
    $query .= " AND id IN ($m_placeholders)";
    $params = array_merge($params, $managed_ids);
} elseif (hasRole('Admin')) {
    // If Admin, only show staff with parent_id = 0 (Hide reseller staff)
    $query .= " AND parent_id = 0";
}

if ($search) {
    $query .= " AND (name LIKE ? OR username LIKE ? OR phone LIKE ?)";
    $params = array_merge($params, ["%$search%", "%$search%", "%$search%"]);
}
$query .= " ORDER BY id DESC";
$staff_list = safeFetchAll($pdo, $query, $params);

$available_permissions = [
    'dashboard' => 'Dashboard',
    'pay_due' => 'Due Paid Permission',
    'add_client' => 'Add New Client',
    'office_staff' => 'Office Staff',
    'wallet_deposit' => 'Wallet & Deposit',
    'config' => 'Configuration Tab',
    'offers' => 'Offers & Promotions',
    'clients_active' => 'Active Clients',
    'clients_inactive' => 'Inactive Clients',
    'clients_due' => 'Expire Clients',
    'clients_left' => 'Left Clients',
    'monitoring' => 'Online Monitoring',
    'manage_agents' => 'Manage Agents Tab',
    'resellers' => 'Reseller & Left Reseller List',
    'routers_olt' => 'Router/OLT Monitoring',
    'packages' => 'Packages/Services',
    'settings' => 'Settings Tab',
    'activity_log' => 'Activity Log',
    'hr_view_employees' => 'HR: View Employees',
    'hr_manage_employees' => 'HR: Add/Edit Employees',
    'hr_attendance' => 'HR: Attendance Control',
    'hr_payroll' => 'HR: Payroll & Salary',
    'hr_policy' => 'HR: Deduction Policy',
    'voice_settings' => 'Voice settings',
    'voice_logs' => 'Voice logs',
    'voice_manual_call' => 'Voice manual call'
];
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="mb-0 fw-bold text-primary"><i class="fas fa-users-cog me-2"></i> Office Staff Management</h4>
    <button class="btn btn-primary rounded-pill px-4 shadow-sm" id="btnCreateStaff">
        <i class="fas fa-plus-circle me-1"></i> Create Staff
    </button>
</div>

<div class="card shadow-sm border-0 mb-4">
    <div class="card-body">
        <form method="GET" class="row g-2">
            <input type="hidden" name="tab" value="office_staff">
            <div class="col-md-9">
                <input type="text" name="search" class="form-control" placeholder="Search by name, username, phone..." value="<?= htmlspecialchars($search) ?>">
            </div>
            <div class="col-md-3">
                <button type="submit" class="btn btn-secondary w-100"><i class="fas fa-search"></i> Search</button>
            </div>
        </form>
    </div>
</div>

<div class="card shadow-sm border-0">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3 border-0">Staff Info</th>
                        <th class="border-0">Emp ID / Username</th>
                        <th class="border-0">Role</th>
                        <th class="border-0">Permissions</th>
                        <th class="text-end pe-3 border-0">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($staff_list)): ?>
                        <tr><td colspan="5" class="text-center py-5 text-muted">No Office Staff found.</td></tr>
                    <?php else: foreach($staff_list as $s): 
                        $perms_display = json_decode($s['permissions'] ?? '[]', true);
                        ?>
                        <tr>
                            <td class="ps-3">
                                <div class="fw-bold text-dark"><?= htmlspecialchars($s['name']) ?></div>
                                <div class="small text-muted"><i class="fas fa-phone-alt fa-fw"></i> <?= htmlspecialchars($s['phone']) ?></div>
                            </td>
                            <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($s['username']) ?></span></td>
                            <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle"><?= htmlspecialchars($s['role']) ?></span></td>
                            <td>
                                <div class="d-flex flex-wrap gap-1">
                                    <?php if(empty($perms_display)): ?>
                                        <span class="badge bg-secondary-subtle text-secondary border">No Permissions</span>
                                    <?php else: ?>
                                        <span class="badge bg-info-subtle text-info border"><?= count($perms_display) ?> Areas</span>
                                    <?php endif; ?>
                                </div>
                            </td>
                            <td class="text-end pe-3">
                                <div class="btn-group">
                                    <button class="btn btn-sm btn-outline-primary btn-edit-staff" 
                                            data-id="<?= $s['id'] ?>"
                                            data-name="<?= htmlspecialchars($s['name'], ENT_QUOTES, 'UTF-8') ?>"
                                            data-username="<?= htmlspecialchars($s['username'], ENT_QUOTES, 'UTF-8') ?>"
                                            data-role="<?= htmlspecialchars($s['role'], ENT_QUOTES, 'UTF-8') ?>"
                                            data-phone="<?= htmlspecialchars($s['phone'] ?? '', ENT_QUOTES, 'UTF-8') ?>"
                                            data-permissions="<?= htmlspecialchars($s['permissions'] ?? '[]', ENT_QUOTES, 'UTF-8') ?>"
                                            title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <a href="?tab=office_staff&action=delete_staff&id=<?= $s['id'] ?>" class="btn btn-sm btn-outline-danger btn-delete-staff" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </a>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Modal -->
<div class="modal fade" id="staffModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content border-0 shadow">
            <div class="modal-header bg-primary text-white border-0">
                <h5 class="modal-title" id="staffModalTitle">Office Staff</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <form method="POST">
                <div class="modal-body bg-light">
                    <input type="hidden" name="staff_id" id="s_id">
                    
                    <div class="row g-3 mb-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Full Name</label>
                            <input type="text" name="name" id="s_name" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Phone No</label>
                            <input type="text" name="phone" id="s_phone" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Role</label>
                            <select name="role" id="s_role" class="form-select" required>
                                <?php foreach($office_roles as $or): ?>
                                    <option value="<?= $or ?>"><?= $or ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Username</label>
                            <input type="text" name="username" id="s_username" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Password</label>
                            <input type="text" name="password" id="s_password" class="form-control">
                            <div id="pw-hint" class="small text-muted"></div>
                        </div>
                    </div>

                    <div class="card border-0 shadow-sm mt-4">
                        <div class="card-header bg-white py-2">
                            <h6 class="mb-0 fw-bold text-secondary">Access Permissions</h6>
                        </div>
                        <div class="card-body">
                            <div class="row g-3">
                                <?php foreach($available_permissions as $slug => $label): ?>
                                <div class="col-6 col-md-4">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input perm-check" type="checkbox" name="permissions[]" value="<?= $slug ?>" id="p_<?= $slug ?>">
                                        <label class="form-check-label small" for="p_<?= $slug ?>"><?= $label ?></label>
                                    </div>
                                </div>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer border-0 bg-light">
                    <button type="button" class="btn btn-secondary border-0 text-white shadow-sm" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" name="create_office_staff" id="s_submit" class="btn btn-primary shadow-sm">
                        <i class="fas fa-save me-1"></i> Save Staff
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<script src="/assets/js/staff-management.js?v=<?= APP_DEPLOYMENT_ID ?>"></script>
