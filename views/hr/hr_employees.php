<?php
// views/hr/hr_employees.php
if (session_status() == PHP_SESSION_NONE) {
    ini_set('session.cookie_secure', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

// Check Permissions
if (!hasRole('Admin') && !hasPermission('hr_view_employees') && !hasPermission('hr_manage_employees')) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    exit;
}

$can_manage = hasRole('Admin') || hasPermission('hr_manage_employees');

// Fetch Search/Filter parameters
$search = trim($_GET['search'] ?? '');
$dept_filter = trim($_GET['dept'] ?? '');
$status_filter = trim($_GET['status'] ?? '');

// Base Query
$query = "SELECT * FROM " . TBL_HR_EMPLOYEES . " WHERE 1=1";
$params = [];

if (!empty($search)) {
    $query .= " AND (full_name LIKE ? OR phone1 LIKE ? OR staff_id LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

if (!empty($dept_filter)) {
    $query .= " AND department = ?";
    $params[] = $dept_filter;
}

if (!empty($status_filter)) {
    $query .= " AND employment_status = ?";
    $params[] = $status_filter;
}

$query .= " ORDER BY id DESC";

$stmt = $pdo->prepare($query);
$stmt->execute($params);
$employees = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Get unique departments for filter dropdown
$depts = $pdo->query("SELECT DISTINCT department FROM " . TBL_HR_EMPLOYEES . " WHERE department != '' ORDER BY department ASC")->fetchAll(PDO::FETCH_COLUMN);

// Fetch unlinked active staff accounts for the mapping dropdown
// We fetch staff accounts that are NOT already linked to another employee (excluding the edit case which is handled in JS)
$unlinked_staff_query = "
    SELECT s.id, s.name, s.username, s.role 
    FROM " . TBL_STAFF . " s 
    LEFT JOIN " . TBL_HR_EMPLOYEES . " e ON s.id = e.staff_user_id 
    WHERE s.status = 'Active' AND (e.id IS NULL)
    ORDER BY s.name ASC";
$unlinked_staff = $pdo->query($unlinked_staff_query)->fetchAll(PDO::FETCH_ASSOC);

// We also query ALL active staff for edit dropdowns (we'll filter dynamically in JS or allow matching)
$all_staff = $pdo->query("SELECT id, name, username, role FROM " . TBL_STAFF . " WHERE status = 'Active' ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
?>

<div class="container-fluid px-0">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0 text-gray-800 fw-bold">Employee Directory</h1>
            <p class="text-muted small mb-0">Manage profiles, contact cards, reference checks, qualifications, and document files.</p>
        </div>
        <?php if ($can_manage): ?>
            <button class="btn btn-primary shadow-sm fw-bold px-4 py-2 border-0" style="background: linear-gradient(135deg, #339af0 0%, #1c7ed6 100%) !important;" data-bs-toggle="modal" data-bs-target="#addEmployeeModal">
                <i class="fas fa-user-plus me-2"></i>Add New Employee
            </button>
        <?php endif; ?>
    </div>

    <!-- Filters & Search Card -->
    <div class="card border-0 shadow-sm mb-4">
        <div class="card-body p-3">
            <form method="GET" action="" class="row g-2 align-items-end">
                <input type="hidden" name="tab" value="hr_employees">
                
                <div class="col-md-4">
                    <label class="form-label small text-muted fw-bold mb-1">Search Employee</label>
                    <div class="input-group">
                        <span class="input-group-text bg-white border-end-0 text-muted"><i class="fas fa-search"></i></span>
                        <input type="text" name="search" class="form-control border-start-0 ps-0" placeholder="Name, Phone, or Staff ID" value="<?= htmlspecialchars($search) ?>">
                    </div>
                </div>

                <div class="col-md-3">
                    <label class="form-label small text-muted fw-bold mb-1">Department</label>
                    <select name="dept" class="form-select">
                        <option value="">All Departments</option>
                        <?php foreach ($depts as $d): ?>
                            <option value="<?= htmlspecialchars($d) ?>" <?= $dept_filter === $d ? 'selected' : '' ?>><?= htmlspecialchars($d) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="col-md-3">
                    <label class="form-label small text-muted fw-bold mb-1">Status</label>
                    <select name="status" class="form-select">
                        <option value="">All Statuses</option>
                        <option value="Active" <?= $status_filter === 'Active' ? 'selected' : '' ?>>Active</option>
                        <option value="Resigned" <?= $status_filter === 'Resigned' ? 'selected' : '' ?>>Resigned</option>
                        <option value="Suspended" <?= $status_filter === 'Suspended' ? 'selected' : '' ?>>Suspended</option>
                        <option value="Terminated" <?= $status_filter === 'Terminated' ? 'selected' : '' ?>>Terminated</option>
                    </select>
                </div>

                <div class="col-md-2 d-grid">
                    <button type="submit" class="btn btn-secondary fw-bold py-2"><i class="fas fa-filter me-2"></i>Filter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Employee List Card -->
    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light">
                        <tr class="text-muted small">
                            <th class="ps-4 py-3">Staff ID</th>
                            <th>Photo & Name</th>
                            <th>Contact / Info</th>
                            <th>Designation / Dept</th>
                            <th>Monthly Salary</th>
                            <th>Status</th>
                            <th class="pe-4 text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (!empty($employees)): ?>
                            <?php foreach ($employees as $emp): ?>
                                <tr>
                                    <td class="ps-4 font-monospace fw-bold text-primary small"><?= htmlspecialchars($emp['staff_id']) ?></td>
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <?php if (!empty($emp['photo']) && file_exists(__DIR__ . '/../../' . $emp['photo'])): ?>
                                                <img src="<?= htmlspecialchars($emp['photo']) ?>" alt="Photo" class="rounded-circle me-3" style="width: 45px; height: 45px; object-fit: cover;">
                                            <?php else: ?>
                                                <div class="rounded-circle bg-light border border-2 border-primary d-flex align-items-center justify-content-center me-3 text-secondary" style="width: 45px; height: 45px;">
                                                    <i class="fas fa-user-tie fa-lg"></i>
                                                </div>
                                            <?php endif; ?>
                                            <div>
                                                <h6 class="fw-bold mb-0 text-dark"><?= htmlspecialchars($emp['full_name']) ?></h6>
                                                <span class="text-muted small" style="font-size:0.75rem;">Join: <?= date('d M, Y', strtotime($emp['joining_date'])) ?></span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="small mb-0"><i class="fas fa-phone me-2 text-muted"></i><?= htmlspecialchars($emp['phone1']) ?></div>
                                        <?php if (!empty($emp['email'])): ?>
                                            <div class="small text-muted" style="font-size:0.75rem;"><i class="fas fa-envelope me-2 text-muted"></i><?= htmlspecialchars($emp['email']) ?></div>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <div class="fw-semibold text-dark small mb-0"><?= htmlspecialchars($emp['designation']) ?></div>
                                        <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle font-monospace" style="font-size:0.7rem;"><?= htmlspecialchars($emp['department']) ?></span>
                                    </td>
                                    <td class="fw-bold text-dark font-monospace small">৳<?= number_format($emp['monthly_salary'], 2) ?></td>
                                    <td>
                                        <?php
                                        $badge = 'bg-success';
                                        if ($emp['employment_status'] === 'Resigned') $badge = 'bg-secondary';
                                        elseif ($emp['employment_status'] === 'Suspended') $badge = 'bg-warning text-dark';
                                        elseif ($emp['employment_status'] === 'Terminated') $badge = 'bg-danger';
                                        ?>
                                        <span class="badge <?= $badge ?> font-monospace" style="font-size:0.75rem;"><?= $emp['employment_status'] ?></span>
                                    </td>
                                    <td class="pe-4 text-end">
                                        <div class="btn-group">
                                            <button class="btn btn-sm btn-light border-0 shadow-xs px-2" data-bs-toggle="modal" data-bs-target="#viewEmployeeModal" onclick="viewEmployeeDetails(<?= htmlspecialchars(json_encode($emp)) ?>)" title="View Details">
                                                <i class="fas fa-eye text-primary"></i>
                                            </button>
                                            <?php if ($can_manage): ?>
                                                <button class="btn btn-sm btn-light border-0 shadow-xs px-2" data-bs-toggle="modal" data-bs-target="#editEmployeeModal" onclick="populateEditModal(<?= htmlspecialchars(json_encode($emp)) ?>)" title="Edit Profile">
                                                    <i class="fas fa-edit text-warning"></i>
                                                </button>
                                                <a href="index.php?action=delete_employee&id=<?= $emp['id'] ?>" class="btn btn-sm btn-light border-0 shadow-xs px-2" onclick="return confirm('Are you sure you want to permanently delete this employee profile? All attendance and salary history will be lost.')" title="Delete Profile">
                                                    <i class="fas fa-trash text-danger"></i>
                                                </a>
                                            <?php endif; ?>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <tr>
                                <td colspan="7" class="text-center py-5 text-muted small">
                                    <i class="fas fa-user-slash fa-2x mb-3 text-secondary"></i>
                                    <div>No employees found matching the filters.</div>
                                </td>
                            </tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- ============================================== -->
<!--             ADD EMPLOYEE MODAL                 -->
<!-- ============================================== -->
<div class="modal fade" id="addEmployeeModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <form method="POST" action="" enctype="multipart/form-data" class="modal-content border-0 shadow">
            <input type="hidden" name="action" value="add_employee">
            
            <div class="modal-header bg-primary text-white border-0 py-3" style="background: linear-gradient(135deg, #339af0 0%, #1c7ed6 100%) !important;">
                <h5 class="modal-title fw-bold"><i class="fas fa-user-plus me-2"></i>Add New Employee Profile</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            
            <div class="modal-body p-4 bg-light">
                <!-- Section 1: Basic Information -->
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-white py-3 border-bottom border-light">
                        <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-user me-2"></i>1. Personal & Contact Details</h6>
                    </div>
                    <div class="card-body row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Full Name *</label>
                            <input type="text" name="full_name" class="form-control" required placeholder="e.g. Asif Mahmud">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Father's Name</label>
                            <input type="text" name="father_name" class="form-control" placeholder="Father's name">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Mother's Name</label>
                            <input type="text" name="mother_name" class="form-control" placeholder="Mother's name">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Primary Phone *</label>
                            <input type="text" name="phone1" class="form-control" required placeholder="017xxxxxxxx">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Alternative Phone</label>
                            <input type="text" name="phone2" class="form-control" placeholder="018xxxxxxxx">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Email Address</label>
                            <input type="email" name="email" class="form-control" placeholder="example@mail.com">
                        </div>
                        <div class="col-md-2">
                            <label class="form-label small fw-bold">Blood Group</label>
                            <select name="blood_group" class="form-select">
                                <option value="">Select</option>
                                <option value="A+">A+</option>
                                <option value="A-">A-</option>
                                <option value="B+">B+</option>
                                <option value="B-">B-</option>
                                <option value="AB+">AB+</option>
                                <option value="AB-">AB-</option>
                                <option value="O+">O+</option>
                                <option value="O-">O-</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Date of Birth</label>
                            <input type="date" name="date_of_birth" class="form-control">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Gender</label>
                            <select name="gender" class="form-select">
                                <option value="">Select</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">NID Number</label>
                            <input type="text" name="nid_number" class="form-control" placeholder="NID Card Number">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Present Address</label>
                            <textarea name="present_address" class="form-control" rows="2" placeholder="Current address"></textarea>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Permanent Address</label>
                            <textarea name="permanent_address" class="form-control" rows="2" placeholder="Permanent address"></textarea>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Work & Salary Information -->
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-white py-3 border-bottom border-light">
                        <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-briefcase me-2"></i>2. Work & Salary Assignment</h6>
                    </div>
                    <div class="card-body row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Shift Start Time</label>
                            <input type="time" name="shift_start_time" class="form-control">
                            <div class="form-text text-muted small" style="font-size:0.75rem;">Leave empty to use default office time</div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Shift End Time</label>
                            <input type="time" name="shift_end_time" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Designation *</label>
                            <input type="text" name="designation" class="form-control" required placeholder="e.g. Billing Executive">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Department *</label>
                            <input type="text" name="department" class="form-control" required placeholder="e.g. Accounts & HR">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Joining Date *</label>
                            <input type="date" name="joining_date" class="form-control" required value="<?= date('Y-m-d') ?>">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Monthly Basic Salary (৳) *</label>
                            <input type="number" step="0.01" name="monthly_salary" class="form-control font-monospace fw-bold" required placeholder="e.g. 20000">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Salary Payout Type</label>
                            <select name="salary_type" class="form-select">
                                <option value="Monthly">Monthly Salary</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">System Staff Account Link</label>
                            <select name="staff_user_id" class="form-select">
                                <option value="">Not linked</option>
                                <?php foreach ($unlinked_staff as $st): ?>
                                    <option value="<?= $st['id'] ?>"><?= htmlspecialchars($st['name']) ?> (<?= htmlspecialchars($st['username']) ?> - <?= htmlspecialchars($st['role']) ?>)</option>
                                <?php endforeach; ?>
                            </select>
                            <div class="form-text text-muted small" style="font-size:0.75rem;">Link to an existing reseller/staff account if desired</div>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Family, Emergency Contact, References -->
                <div class="row g-3 mb-4">
                    <!-- Family & Emergency -->
                    <div class="col-md-6">
                        <div class="card border-0 shadow-sm h-100">
                            <div class="card-header bg-white py-3 border-bottom border-light">
                                <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-house-user me-2"></i>3. Family & Emergency Contact</h6>
                            </div>
                            <div class="card-body row g-3">
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Family Phone</label>
                                    <input type="text" name="family_phone" class="form-control" placeholder="Guardians number">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Emergency Phone</label>
                                    <input type="text" name="emergency_phone" class="form-control" placeholder="Emergency number">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Emergency Contact Person</label>
                                    <input type="text" name="emergency_contact_person" class="form-control" placeholder="Name">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Emergency Relationship</label>
                                    <input type="text" name="emergency_relationship" class="form-control" placeholder="e.g. Brother, Uncle">
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- References -->
                    <div class="col-md-6">
                        <div class="card border-0 shadow-sm h-100">
                            <div class="card-header bg-white py-3 border-bottom border-light">
                                <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-user-shield me-2"></i>4. Reference Person Details</h6>
                            </div>
                            <div class="card-body row g-3">
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Reference Name</label>
                                    <input type="text" name="ref_name" class="form-control" placeholder="References Name">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Reference Phone</label>
                                    <input type="text" name="ref_phone" class="form-control" placeholder="Phone number">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Reference NID</label>
                                    <input type="text" name="ref_nid" class="form-control" placeholder="NID Number">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Relationship</label>
                                    <input type="text" name="ref_relationship" class="form-control" placeholder="e.g. Boss, Friend">
                                </div>
                                <div class="col-12">
                                    <label class="form-label small fw-bold">Reference Address</label>
                                    <input type="text" name="ref_address" class="form-control" placeholder="Address">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Section 4: Work Experience -->
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-white py-3 border-bottom border-light">
                        <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-graduation-cap me-2"></i>5. Previous Work Experience</h6>
                    </div>
                    <div class="card-body row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Previous Company Name</label>
                            <input type="text" name="prev_company" class="form-control" placeholder="Company name">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Previous Designation</label>
                            <input type="text" name="prev_designation" class="form-control" placeholder="Designation">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Working Period</label>
                            <input type="text" name="prev_working_period" class="form-control" placeholder="e.g. 2 Years (2023 - 2025)">
                        </div>
                        <div class="col-12">
                            <label class="form-label small fw-bold">Experience Notes / Job Description</label>
                            <textarea name="prev_experience_note" class="form-control" rows="2" placeholder="Details of previous responsibilities..."></textarea>
                        </div>
                    </div>
                </div>

                <!-- Section 5: Documents & Files -->
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white py-3 border-bottom border-light">
                        <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-file-arrow-up me-2"></i>6. Photograph & Document Uploads</h6>
                    </div>
                    <div class="card-body row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Staff Picture (Photo)</label>
                            <input type="file" name="photo" class="form-control">
                            <div class="form-text small text-muted" style="font-size:0.75rem;">JPG, PNG. Max 2MB.</div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">NID Scan Copy</label>
                            <input type="file" name="nid_copy" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">CV / Resume File</label>
                            <input type="file" name="cv_resume" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Appointment Letter Scan</label>
                            <input type="file" name="appointment_letter" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Certificates Scan (Zip/PDF)</label>
                            <input type="file" name="certificates" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Other Docs (Zip/PDF)</label>
                            <input type="file" name="other_docs" class="form-control">
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal-footer border-0 p-3 bg-white">
                <button type="button" class="btn btn-light fw-bold px-4" data-bs-dismiss="modal">Close</button>
                <button type="submit" class="btn btn-primary fw-bold px-4" style="background: linear-gradient(135deg, #339af0 0%, #1c7ed6 100%) !important;">Create Profile</button>
            </div>
        </form>
    </div>
</div>

<!-- ============================================== -->
<!--             EDIT EMPLOYEE MODAL                  -->
<!-- ============================================== -->
<div class="modal fade" id="editEmployeeModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <form method="POST" action="" enctype="multipart/form-data" class="modal-content border-0 shadow">
            <input type="hidden" name="action" value="edit_employee">
            <input type="hidden" name="id" id="edit-emp-id">
            
            <div class="modal-header bg-warning text-dark border-0 py-3" style="background: linear-gradient(135deg, #ffe066 0%, #fcc419 100%) !important;">
                <h5 class="modal-title fw-bold"><i class="fas fa-user-pen me-2 text-dark"></i>Edit Employee Profile</h5>
                <button type="button" class="btn-close text-dark" data-bs-dismiss="modal"></button>
            </div>
            
            <div class="modal-body p-4 bg-light">
                <!-- Section 1: Basic Information -->
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-white py-3 border-bottom border-light">
                        <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-user me-2"></i>1. Personal & Contact Details</h6>
                    </div>
                    <div class="card-body row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Full Name *</label>
                            <input type="text" name="full_name" id="edit-full-name" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Father's Name</label>
                            <input type="text" name="father_name" id="edit-father-name" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Mother's Name</label>
                            <input type="text" name="mother_name" id="edit-mother-name" class="form-control">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Primary Phone *</label>
                            <input type="text" name="phone1" id="edit-phone1" class="form-control" required>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Alternative Phone</label>
                            <input type="text" name="phone2" id="edit-phone2" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Email Address</label>
                            <input type="email" name="email" id="edit-email" class="form-control">
                        </div>
                        <div class="col-md-2">
                            <label class="form-label small fw-bold">Blood Group</label>
                            <select name="blood_group" id="edit-blood-group" class="form-select">
                                <option value="">Select</option>
                                <option value="A+">A+</option>
                                <option value="A-">A-</option>
                                <option value="B+">B+</option>
                                <option value="B-">B-</option>
                                <option value="AB+">AB+</option>
                                <option value="AB-">AB-</option>
                                <option value="O+">O+</option>
                                <option value="O-">O-</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Date of Birth</label>
                            <input type="date" name="date_of_birth" id="edit-dob" class="form-control">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Gender</label>
                            <select name="gender" id="edit-gender" class="form-select">
                                <option value="">Select</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">NID Number</label>
                            <input type="text" name="nid_number" id="edit-nid-number" class="form-control">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Present Address</label>
                            <textarea name="present_address" id="edit-present-address" class="form-control" rows="2"></textarea>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Permanent Address</label>
                            <textarea name="permanent_address" id="edit-permanent-address" class="form-control" rows="2"></textarea>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Work & Salary Information -->
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-white py-3 border-bottom border-light">
                        <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-briefcase me-2"></i>2. Work & Salary Assignment</h6>
                    </div>
                    <div class="card-body row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">System Staff Account Link</label>
                            <select name="staff_user_id" id="edit-staff-user-id" class="form-select">
                                <option value="">Not linked</option>
                                <?php foreach ($all_staff as $st): ?>
                                    <option value="<?= $st['id'] ?>"><?= htmlspecialchars($st['name']) ?> (<?= htmlspecialchars($st['username']) ?> - <?= htmlspecialchars($st['role']) ?>)</option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Shift Start Time</label>
                            <input type="time" name="shift_start_time" id="edit-shift-start-time" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Shift End Time</label>
                            <input type="time" name="shift_end_time" id="edit-shift-end-time" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Designation *</label>
                            <input type="text" name="designation" id="edit-designation" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Department *</label>
                            <input type="text" name="department" id="edit-department" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Joining Date *</label>
                            <input type="date" name="joining_date" id="edit-joining-date" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Monthly Basic Salary (৳) *</label>
                            <input type="number" step="0.01" name="monthly_salary" id="edit-monthly-salary" class="form-control font-monospace fw-bold" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Employment Status</label>
                            <select name="employment_status" id="edit-employment-status" class="form-select">
                                <option value="Active">Active</option>
                                <option value="Resigned">Resigned</option>
                                <option value="Suspended">Suspended</option>
                                <option value="Terminated">Terminated</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Family, Emergency Contact, References -->
                <div class="row g-3 mb-4">
                    <!-- Family & Emergency -->
                    <div class="col-md-6">
                        <div class="card border-0 shadow-sm h-100">
                            <div class="card-header bg-white py-3 border-bottom border-light">
                                <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-house-user me-2"></i>3. Family & Emergency Contact</h6>
                            </div>
                            <div class="card-body row g-3">
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Family Phone</label>
                                    <input type="text" name="family_phone" id="edit-family-phone" class="form-control">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Emergency Phone</label>
                                    <input type="text" name="emergency_phone" id="edit-emergency-phone" class="form-control">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Emergency Contact Person</label>
                                    <input type="text" name="emergency_contact_person" id="edit-emergency-contact-person" class="form-control">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Emergency Relationship</label>
                                    <input type="text" name="emergency_relationship" id="edit-emergency-relationship" class="form-control">
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- References -->
                    <div class="col-md-6">
                        <div class="card border-0 shadow-sm h-100">
                            <div class="card-header bg-white py-3 border-bottom border-light">
                                <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-user-shield me-2"></i>4. Reference Person Details</h6>
                            </div>
                            <div class="card-body row g-3">
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Reference Name</label>
                                    <input type="text" name="ref_name" id="edit-ref-name" class="form-control">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Reference Phone</label>
                                    <input type="text" name="ref_phone" id="edit-ref-phone" class="form-control">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Reference NID</label>
                                    <input type="text" name="ref_nid" id="edit-ref-nid" class="form-control">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Relationship</label>
                                    <input type="text" name="ref_relationship" id="edit-ref-relationship" class="form-control">
                                </div>
                                <div class="col-12">
                                    <label class="form-label small fw-bold">Reference Address</label>
                                    <input type="text" name="ref_address" id="edit-ref-address" class="form-control">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Section 4: Work Experience -->
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-white py-3 border-bottom border-light">
                        <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-graduation-cap me-2"></i>5. Previous Work Experience</h6>
                    </div>
                    <div class="card-body row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Previous Company Name</label>
                            <input type="text" name="prev_company" id="edit-prev-company" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Previous Designation</label>
                            <input type="text" name="prev_designation" id="edit-prev-designation" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Working Period</label>
                            <input type="text" name="prev_working_period" id="edit-prev-working-period" class="form-control">
                        </div>
                        <div class="col-12">
                            <label class="form-label small fw-bold">Experience Notes / Job Description</label>
                            <textarea name="prev_experience_note" id="edit-prev-experience-note" class="form-control" rows="2"></textarea>
                        </div>
                    </div>
                </div>

                <!-- Section 5: Documents & Files -->
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white py-3 border-bottom border-light">
                        <h6 class="card-title mb-0 fw-bold text-primary"><i class="fas fa-file-arrow-up me-2"></i>6. Photograph & Document Uploads</h6>
                    </div>
                    <div class="card-body row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Update Photo</label>
                            <input type="file" name="photo" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Update NID Scan Copy</label>
                            <input type="file" name="nid_copy" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Update CV / Resume</label>
                            <input type="file" name="cv_resume" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Update Appointment Letter</label>
                            <input type="file" name="appointment_letter" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Update Certificates</label>
                            <input type="file" name="certificates" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Update Other Docs</label>
                            <input type="file" name="other_docs" class="form-control">
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal-footer border-0 p-3 bg-white">
                <button type="button" class="btn btn-light fw-bold px-4" data-bs-dismiss="modal">Close</button>
                <button type="submit" class="btn btn-warning fw-bold px-4 text-dark" style="background: linear-gradient(135deg, #ffe066 0%, #fcc419 100%) !important;">Save Changes</button>
            </div>
        </form>
    </div>
</div>

<!-- ============================================== -->
<!--             VIEW DETAILS MODAL                 -->
<!-- ============================================== -->
<div class="modal fade" id="viewEmployeeModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content border-0 shadow">
            <div class="modal-header bg-dark text-white border-0 py-3">
                <h5 class="modal-title fw-bold"><i class="fas fa-address-card me-2"></i>Employee Profile Card</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4" id="view-profile-card">
                <!-- Dynamically filled in JS -->
            </div>
            <div class="modal-footer border-0 bg-light p-3">
                <button type="button" class="btn btn-secondary fw-bold px-4" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<script>
function populateEditModal(emp) {
    document.getElementById('edit-emp-id').value = emp.id;
    document.getElementById('edit-full-name').value = emp.full_name;
    document.getElementById('edit-father-name').value = emp.father_name || '';
    document.getElementById('edit-mother-name').value = emp.mother_name || '';
    document.getElementById('edit-phone1').value = emp.phone1;
    document.getElementById('edit-phone2').value = emp.phone2 || '';
    document.getElementById('edit-email').value = emp.email || '';
    document.getElementById('edit-blood-group').value = emp.blood_group || '';
    document.getElementById('edit-dob').value = emp.date_of_birth || '';
    document.getElementById('edit-gender').value = emp.gender || '';
    document.getElementById('edit-nid-number').value = emp.nid_number || '';
    document.getElementById('edit-present-address').value = emp.present_address || '';
    document.getElementById('edit-permanent-address').value = emp.permanent_address || '';
    
    document.getElementById('edit-staff-user-id').value = emp.staff_user_id || '';
    document.getElementById('edit-shift-start-time').value = emp.shift_start_time || '';
    document.getElementById('edit-shift-end-time').value = emp.shift_end_time || '';
    document.getElementById('edit-designation').value = emp.designation;
    document.getElementById('edit-department').value = emp.department;
    document.getElementById('edit-joining-date').value = emp.joining_date;
    document.getElementById('edit-monthly-salary').value = emp.monthly_salary;
    document.getElementById('edit-employment-status').value = emp.employment_status;
    
    document.getElementById('edit-family-phone').value = emp.family_phone || '';
    document.getElementById('edit-emergency-phone').value = emp.emergency_phone || '';
    document.getElementById('edit-emergency-contact-person').value = emp.emergency_contact_person || '';
    document.getElementById('edit-emergency-relationship').value = emp.emergency_relationship || '';
    
    document.getElementById('edit-ref-name').value = emp.ref_name || '';
    document.getElementById('edit-ref-phone').value = emp.ref_phone || '';
    document.getElementById('edit-ref-nid').value = emp.ref_nid || '';
    document.getElementById('edit-ref-relationship').value = emp.ref_relationship || '';
    document.getElementById('edit-ref-address').value = emp.ref_address || '';
    
    document.getElementById('edit-prev-company').value = emp.prev_company || '';
    document.getElementById('edit-prev-designation').value = emp.prev_designation || '';
    document.getElementById('edit-prev-working-period').value = emp.prev_working_period || '';
    document.getElementById('edit-prev-experience-note').value = emp.prev_experience_note || '';
}

function viewEmployeeDetails(emp) {
    const photoHTML = emp.photo 
        ? `<img src="${emp.photo}" class="rounded shadow-sm border border-2" style="width: 120px; height: 120px; object-fit: cover;">`
        : `<div class="rounded bg-light border border-2 d-flex align-items-center justify-content-center text-secondary" style="width: 120px; height: 120px;"><i class="fas fa-user-tie fa-3x"></i></div>`;
        
    const docs = [
        { label: 'NID Copy', key: 'nid_copy' },
        { label: 'CV/Resume', key: 'cv_resume' },
        { label: 'Appointment Letter', key: 'appointment_letter' },
        { label: 'Certificates', key: 'certificates' },
        { label: 'Other Documents', key: 'other_docs' }
    ];
    
    let docsHTML = '';
    docs.forEach(doc => {
        if (emp[doc.key]) {
            docsHTML += `<a href="${emp[doc.key]}" target="_blank" class="btn btn-sm btn-outline-dark me-2 mb-2 font-monospace" style="font-size:0.75rem;"><i class="far fa-file-pdf me-1"></i>${doc.label}</a>`;
        }
    });
    
    if (!docsHTML) {
        docsHTML = '<span class="text-muted small">No documents uploaded.</span>';
    }

    const html = `
        <div class="row g-4 align-items-start">
            <div class="col-md-3 text-center">
                ${photoHTML}
                <div class="mt-3">
                    <h5 class="fw-bold mb-1">${emp.full_name}</h5>
                    <span class="badge bg-primary mb-2">${emp.designation}</span>
                    <div class="font-monospace text-primary fw-bold small">${emp.staff_id}</div>
                </div>
            </div>
            <div class="col-md-9">
                <nav>
                    <div class="nav nav-tabs border-bottom mb-3" id="nav-tab" role="tablist">
                        <button class="nav-link active fw-semibold" id="tab-profile-link" data-bs-toggle="tab" data-bs-target="#tab-profile" type="button" role="tab">Personal & Job</button>
                        <button class="nav-link fw-semibold" id="tab-emergency-link" data-bs-toggle="tab" data-bs-target="#tab-emergency" type="button" role="tab">Family & Ref</button>
                        <button class="nav-link fw-semibold" id="tab-exp-link" data-bs-toggle="tab" data-bs-target="#tab-exp" type="button" role="tab">Experience</button>
                        <button class="nav-link fw-semibold" id="tab-docs-link" data-bs-toggle="tab" data-bs-target="#tab-docs" type="button" role="tab">Documents</button>
                    </div>
                </nav>
                <div class="tab-content bg-light p-3 rounded" id="nav-tabContent">
                    <!-- Personal Info -->
                    <div class="tab-pane fade show active" id="tab-profile" role="tabpanel">
                        <table class="table table-sm table-borderless small mb-0">
                            <tr><td class="text-muted fw-bold" style="width: 30%;">Father's Name:</td><td>${emp.father_name || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Mother's Name:</td><td>${emp.mother_name || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Phone 1:</td><td>${emp.phone1}</td></tr>
                            <tr><td class="text-muted fw-bold">Phone 2:</td><td>${emp.phone2 || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Email:</td><td>${emp.email || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">NID Number:</td><td>${emp.nid_number || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Blood Group / Gender:</td><td>${emp.blood_group || '-'} / ${emp.gender || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Date of Birth:</td><td>${emp.date_of_birth || '-'}</td></tr>
                            <tr class="border-top"><td class="text-muted fw-bold pt-2">Department:</td><td class="pt-2 fw-semibold text-dark">${emp.department}</td></tr>
                            <tr><td class="text-muted fw-bold">Joining Date:</td><td>${emp.joining_date}</td></tr>
                            <tr><td class="text-muted fw-bold">Basic Salary:</td><td class="fw-bold font-monospace text-success">৳${parseFloat(emp.monthly_salary).toFixed(2)} / Month</td></tr>
                            <tr><td class="text-muted fw-bold">Employment Status:</td><td><span class="badge bg-secondary">${emp.employment_status}</span></td></tr>
                            <tr><td class="text-muted fw-bold">Present Address:</td><td>${emp.present_address || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Permanent Address:</td><td>${emp.permanent_address || '-'}</td></tr>
                        </table>
                    </div>
                    
                    <!-- Emergency & Family -->
                    <div class="tab-pane fade" id="tab-emergency" role="tabpanel">
                        <h6 class="fw-bold border-bottom pb-1 text-primary small">Emergency Contact</h6>
                        <table class="table table-sm table-borderless small mb-3">
                            <tr><td class="text-muted fw-bold" style="width: 35%;">Contact Person:</td><td>${emp.emergency_contact_person || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Relationship:</td><td>${emp.emergency_relationship || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Emergency Phone:</td><td>${emp.emergency_phone || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Family Phone:</td><td>${emp.family_phone || '-'}</td></tr>
                        </table>
                        
                        <h6 class="fw-bold border-bottom pb-1 text-primary small">Reference Details</h6>
                        <table class="table table-sm table-borderless small mb-0">
                            <tr><td class="text-muted fw-bold" style="width: 35%;">Reference Name:</td><td>${emp.ref_name || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Relationship:</td><td>${emp.ref_relationship || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Reference Phone:</td><td>${emp.ref_phone || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Reference NID:</td><td>${emp.ref_nid || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Reference Address:</td><td>${emp.ref_address || '-'}</td></tr>
                        </table>
                    </div>
                    
                    <!-- Work Experience -->
                    <div class="tab-pane fade" id="tab-exp" role="tabpanel">
                        <table class="table table-sm table-borderless small mb-0">
                            <tr><td class="text-muted fw-bold" style="width: 35%;">Previous Company:</td><td>${emp.prev_company || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Previous Designation:</td><td>${emp.prev_designation || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Working Period:</td><td>${emp.prev_working_period || '-'}</td></tr>
                            <tr><td class="text-muted fw-bold">Experience Notes:</td><td>${emp.prev_experience_note || '-'}</td></tr>
                        </table>
                    </div>
                    
                    <!-- Documents Uploaded -->
                    <div class="tab-pane fade" id="tab-docs" role="tabpanel">
                        <div class="d-flex flex-wrap p-2 bg-white rounded border border-light">
                            ${docsHTML}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('view-profile-card').innerHTML = html;
}
</script>
