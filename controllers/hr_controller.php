<?php
// controllers/hr_controller.php
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

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

// Only logged in staff can access HR features
if (!isLoggedIn()) {
    header("Location: index.php");
    exit;
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$user_id = $_SESSION['admin_id'];
$username = $_SESSION['admin_username'] ?? 'Staff';

// Helper function to handle file uploads safely
if (!function_exists('uploadHRDoc')) {
    function uploadHRDoc($file_key, $staff_id) {
        if (isset($_FILES[$file_key]) && $_FILES[$file_key]['error'] === UPLOAD_ERR_OK) {
            $file_tmp = $_FILES[$file_key]['tmp_name'];
            $original_name = basename($_FILES[$file_key]['name']);
            $ext = strtolower(pathinfo($original_name, PATHINFO_EXTENSION));
            
            $allowed = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'zip'];
            if (!in_array($ext, $allowed)) {
                return false;
            }
            
            $new_name = $staff_id . '_' . $file_key . '_' . time() . '_' . uniqid() . '.' . $ext;
            $upload_dir = __DIR__ . '/../uploads/hr/';
            if (!file_exists($upload_dir)) {
                mkdir($upload_dir, 0777, true);
            }
            $dest = $upload_dir . $new_name;
            if (move_uploaded_file($file_tmp, $dest)) {
                return 'uploads/hr/' . $new_name;
            }
        }
        return null;
    }
}

// Helper to get policy value by key name
if (!function_exists('getHRPolicy')) {
    function getHRPolicy($pdo, $key, $default = '') {
        $stmt = $pdo->prepare("SELECT key_value FROM " . TBL_HR_POLICIES . " WHERE key_name = ? LIMIT 1");
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        return ($val !== false) ? $val : $default;
    }
}

// 1. ACTION PROCESSING (POST / REDIRECTS / AJAX API)
if (!empty($action)) {
    // Explicitly set PDO error mode to Exception inside the controller to guarantee SQL errors are thrown
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // --- BACKEND PERMISSION CHECK FOR OFFICE STAFF IN HR ---
    if (isOffice() && !hasRole('Admin')) {
        $hr_permission_map = [
            'add_employee'        => 'hr_manage_employees',
            'edit_employee'       => 'hr_manage_employees',
            'delete_employee'     => 'hr_manage_employees',
            'manual_attendance'   => 'hr_attendance',
            'leave_action'        => 'hr_attendance',
            'advance_request'     => 'hr_payroll',
            'advance_action'      => 'hr_payroll',
            'policy_update'       => 'hr_policy',
            'save_api_key'        => 'hr_policy',
            'add_holiday'         => 'hr_policy',
            'delete_holiday'      => 'hr_policy',
            'payroll_generate'    => 'hr_payroll',
            'payroll_adjustments' => 'hr_payroll',
            'payroll_pay'         => 'hr_payroll',
        ];
        
        // leave_request is special: allowed if submitted from self
        if ($action === 'leave_request' && empty($_POST['from_self'])) {
            $hr_permission_map['leave_request'] = 'hr_attendance';
        }
        
        if (isset($hr_permission_map[$action])) {
            $req_slug = $hr_permission_map[$action];
            if (!hasPermission($req_slug)) {
                if (isset($_GET['ajax']) || isset($_POST['ajax']) || (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest')) {
                    header('Content-Type: application/json');
                    echo json_encode(['success' => false, 'message' => 'Access Denied: Insufficient permissions.']);
                } else {
                    $_SESSION['flash_error'] = "Access Denied: You do not have permission to perform this action.";
                    header("Location: index.php?tab=hr_dashboard");
                }
                exit;
            }
        }
    }
    
    try {
        switch ($action) {
            case 'add_employee':
                // Auto-generate employee staff_id
                $stmt = $pdo->query("SELECT MAX(id) FROM " . TBL_HR_EMPLOYEES);
                $max_id = $stmt->fetchColumn() ?: 0;
                $next_id = $max_id + 1;
                $staff_id = 'EMP-' . str_pad($next_id, 4, '0', STR_PAD_LEFT);
                
                // Upload files
                $photo = uploadHRDoc('photo', $staff_id);
                $nid_copy = uploadHRDoc('nid_copy', $staff_id);
                $cv_resume = uploadHRDoc('cv_resume', $staff_id);
                $appointment_letter = uploadHRDoc('appointment_letter', $staff_id);
                $certificates = uploadHRDoc('certificates', $staff_id);
                $other_docs = uploadHRDoc('other_docs', $staff_id);
                
                $staff_user_id = !empty($_POST['staff_user_id']) ? intval($_POST['staff_user_id']) : null;
                
                $shift_start_time = !empty($_POST['shift_start_time']) ? $_POST['shift_start_time'] : null;
                $shift_end_time = !empty($_POST['shift_end_time']) ? $_POST['shift_end_time'] : null;
                
                // Prepare Insert Query
                $q = "INSERT INTO " . TBL_HR_EMPLOYEES . " (
                    staff_id, staff_user_id, photo, full_name, father_name, mother_name,
                    present_address, permanent_address, nid_number, phone1, phone2, email,
                    blood_group, gender, date_of_birth, joining_date, designation, department,
                    employment_status, monthly_salary, salary_type, family_phone, emergency_phone,
                    emergency_contact_person, emergency_relationship, ref_name, ref_address, ref_phone,
                    ref_nid, ref_relationship, prev_company, prev_designation, prev_working_period,
                    prev_experience_note, nid_copy, cv_resume, appointment_letter, certificates, other_docs,
                    shift_start_time, shift_end_time
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )";
                
                $stmt = $pdo->prepare($q);
                $stmt->execute([
                    $staff_id,
                    $staff_user_id,
                    $photo,
                    $_POST['full_name'] ?? '',
                    $_POST['father_name'] ?? null,
                    $_POST['mother_name'] ?? null,
                    $_POST['present_address'] ?? null,
                    $_POST['permanent_address'] ?? null,
                    $_POST['nid_number'] ?? null,
                    $_POST['phone1'] ?? '',
                    $_POST['phone2'] ?? null,
                    $_POST['email'] ?? null,
                    $_POST['blood_group'] ?? null,
                    $_POST['gender'] ?? null,
                    !empty($_POST['date_of_birth']) ? $_POST['date_of_birth'] : null,
                    $_POST['joining_date'] ?? date('Y-m-d'),
                    $_POST['designation'] ?? '',
                    $_POST['department'] ?? '',
                    $_POST['employment_status'] ?? 'Active',
                    floatval($_POST['monthly_salary'] ?? 0),
                    $_POST['salary_type'] ?? 'Monthly',
                    $_POST['family_phone'] ?? null,
                    $_POST['emergency_phone'] ?? null,
                    $_POST['emergency_contact_person'] ?? null,
                    $_POST['emergency_relationship'] ?? null,
                    $_POST['ref_name'] ?? null,
                    $_POST['ref_address'] ?? null,
                    $_POST['ref_phone'] ?? null,
                    $_POST['ref_nid'] ?? null,
                    $_POST['ref_relationship'] ?? null,
                    $_POST['prev_company'] ?? null,
                    $_POST['prev_designation'] ?? null,
                    $_POST['prev_working_period'] ?? null,
                    $_POST['prev_experience_note'] ?? null,
                    $nid_copy,
                    $cv_resume,
                    $appointment_letter,
                    $certificates,
                    $other_docs,
                    $shift_start_time,
                    $shift_end_time
                ]);
                
                $emp_id = $pdo->lastInsertId();
                
                // Initialize Leave Balance for Current Year
                $cur_year = intval(date('Y'));
                $cl_limit = intval(getHRPolicy($pdo, 'casual_leave_quota', '10'));
                $sl_limit = intval(getHRPolicy($pdo, 'sick_leave_quota', '10'));
                $el_limit = intval(getHRPolicy($pdo, 'emergency_leave_quota', '5'));
                $pl_limit = intval(getHRPolicy($pdo, 'paid_leave_quota', '10'));
                $al_limit = intval(getHRPolicy($pdo, 'alternative_leave_quota', '0'));
                
                $pdo->prepare("INSERT INTO " . TBL_HR_LEAVE_BALANCES . " 
                    (employee_id, year, casual_leave_limit, sick_leave_limit, emergency_leave_limit, paid_leave_limit, alternative_leave_limit) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)")
                    ->execute([$emp_id, $cur_year, $cl_limit, $sl_limit, $el_limit, $pl_limit, $al_limit]);
                    
                writeLog($pdo, $username, 'HR Employee', $emp_id, "Added employee: {$_POST['full_name']} ($staff_id)");
                $_SESSION['flash_msg'] = "Employee added successfully.";
                header("Location: index.php?tab=hr_employees");
                exit;

            case 'edit_employee':
                $emp_id = intval($_POST['id'] ?? 0);
                if ($emp_id <= 0) {
                    $_SESSION['flash_error'] = "Invalid employee ID.";
                    header("Location: index.php?tab=hr_employees");
                    exit;
                }
                
                // Fetch current record
                $emp = safeFetch($pdo, "SELECT * FROM " . TBL_HR_EMPLOYEES . " WHERE id = ?", [$emp_id]);
                if (!$emp) {
                    $_SESSION['flash_error'] = "Employee record not found.";
                    header("Location: index.php?tab=hr_employees");
                    exit;
                }
                
                $staff_id = $emp['staff_id'];
                
                // Handle file uploads (keep existing if empty)
                $photo = uploadHRDoc('photo', $staff_id) ?: $emp['photo'];
                $nid_copy = uploadHRDoc('nid_copy', $staff_id) ?: $emp['nid_copy'];
                $cv_resume = uploadHRDoc('cv_resume', $staff_id) ?: $emp['cv_resume'];
                $appointment_letter = uploadHRDoc('appointment_letter', $staff_id) ?: $emp['appointment_letter'];
                $certificates = uploadHRDoc('certificates', $staff_id) ?: $emp['certificates'];
                $other_docs = uploadHRDoc('other_docs', $staff_id) ?: $emp['other_docs'];
                
                $staff_user_id = !empty($_POST['staff_user_id']) ? intval($_POST['staff_user_id']) : null;
                $shift_start_time = !empty($_POST['shift_start_time']) ? $_POST['shift_start_time'] : null;
                $shift_end_time = !empty($_POST['shift_end_time']) ? $_POST['shift_end_time'] : null;
                
                $q = "UPDATE " . TBL_HR_EMPLOYEES . " SET 
                    staff_user_id = ?, photo = ?, full_name = ?, father_name = ?, mother_name = ?,
                    present_address = ?, permanent_address = ?, nid_number = ?, phone1 = ?, phone2 = ?, email = ?,
                    blood_group = ?, gender = ?, date_of_birth = ?, joining_date = ?, designation = ?, department = ?,
                    employment_status = ?, monthly_salary = ?, salary_type = ?, family_phone = ?, emergency_phone = ?,
                    emergency_contact_person = ?, emergency_relationship = ?, ref_name = ?, ref_address = ?, ref_phone = ?,
                    ref_nid = ?, ref_relationship = ?, prev_company = ?, prev_designation = ?, prev_working_period = ?,
                    prev_experience_note = ?, nid_copy = ?, cv_resume = ?, appointment_letter = ?, certificates = ?, other_docs = ?,
                    shift_start_time = ?, shift_end_time = ?
                    WHERE id = ?";
                
                $stmt = $pdo->prepare($q);
                $stmt->execute([
                    $staff_user_id,
                    $photo,
                    $_POST['full_name'] ?? '',
                    $_POST['father_name'] ?? null,
                    $_POST['mother_name'] ?? null,
                    $_POST['present_address'] ?? null,
                    $_POST['permanent_address'] ?? null,
                    $_POST['nid_number'] ?? null,
                    $_POST['phone1'] ?? '',
                    $_POST['phone2'] ?? null,
                    $_POST['email'] ?? null,
                    $_POST['blood_group'] ?? null,
                    $_POST['gender'] ?? null,
                    !empty($_POST['date_of_birth']) ? $_POST['date_of_birth'] : null,
                    $_POST['joining_date'] ?? date('Y-m-d'),
                    $_POST['designation'] ?? '',
                    $_POST['department'] ?? '',
                    $_POST['employment_status'] ?? 'Active',
                    floatval($_POST['monthly_salary'] ?? 0),
                    $_POST['salary_type'] ?? 'Monthly',
                    $_POST['family_phone'] ?? null,
                    $_POST['emergency_phone'] ?? null,
                    $_POST['emergency_contact_person'] ?? null,
                    $_POST['emergency_relationship'] ?? null,
                    $_POST['ref_name'] ?? null,
                    $_POST['ref_address'] ?? null,
                    $_POST['ref_phone'] ?? null,
                    $_POST['ref_nid'] ?? null,
                    $_POST['ref_relationship'] ?? null,
                    $_POST['prev_company'] ?? null,
                    $_POST['prev_designation'] ?? null,
                    $_POST['prev_working_period'] ?? null,
                    $_POST['prev_experience_note'] ?? null,
                    $nid_copy,
                    $cv_resume,
                    $appointment_letter,
                    $certificates,
                    $other_docs,
                    $shift_start_time,
                    $shift_end_time,
                    $emp_id
                ]);
                
                writeLog($pdo, $username, 'HR Employee', $emp_id, "Updated employee profile: {$_POST['full_name']} ($staff_id)");
                $_SESSION['flash_msg'] = "Employee updated successfully.";
                header("Location: index.php?tab=hr_employees");
                exit;

            case 'delete_employee':
                $emp_id = intval($_GET['id'] ?? 0);
                if ($emp_id <= 0) {
                    $_SESSION['flash_error'] = "Invalid employee ID.";
                    header("Location: index.php?tab=hr_employees");
                    exit;
                }
                
                $emp = safeFetch($pdo, "SELECT * FROM " . TBL_HR_EMPLOYEES . " WHERE id = ?", [$emp_id]);
                if ($emp) {
                    // Try to delete physical uploaded files
                    $files = ['photo', 'nid_copy', 'cv_resume', 'appointment_letter', 'certificates', 'other_docs'];
                    foreach ($files as $f) {
                        if (!empty($emp[$f]) && file_exists(__DIR__ . '/../' . $emp[$f])) {
                            @unlink(__DIR__ . '/../' . $emp[$f]);
                        }
                    }
                    
                    $stmt = $pdo->prepare("DELETE FROM " . TBL_HR_EMPLOYEES . " WHERE id = ?");
                    $stmt->execute([$emp_id]);
                    
                    writeLog($pdo, $username, 'HR Employee', $emp_id, "Deleted employee profile: {$emp['full_name']} ({$emp['staff_id']})");
                    $_SESSION['flash_msg'] = "Employee profile deleted successfully.";
                }
                header("Location: index.php?tab=hr_employees");
                exit;

            case 'self_check_in_out':
                // Check-in or check-out of logged-in staff member
                $emp = safeFetch($pdo, "SELECT id, full_name, shift_start_time, shift_end_time FROM " . TBL_HR_EMPLOYEES . " WHERE staff_user_id = ? LIMIT 1", [$user_id]);
                if (!$emp) {
                    if (isset($_GET['ajax'])) {
                        header('Content-Type: application/json');
                        echo json_encode(['success' => false, 'message' => 'Your staff account is not mapped to any employee profile.']);
                        exit;
                    }
                    $_SESSION['flash_error'] = "Your staff account is not mapped to any employee profile.";
                    header("Location: index.php?tab=hr_dashboard");
                    exit;
                }
                
                $emp_id = $emp['id'];
                $today = date('Y-m-d');
                $now_time = date('H:i:s');
                
                // IP Validation
                $office_ip_address = getHRPolicy($pdo, 'office_ip_address', '');
                if (!empty($office_ip_address)) {
                    $allowed_ips = array_map('trim', explode(',', $office_ip_address));
                    $client_ip = $_SERVER['REMOTE_ADDR'] ?? '';
                    if (!in_array($client_ip, $allowed_ips)) {
                        $msg = "Attendance restricted. You must be connected to the Office Network (Allowed IPs: $office_ip_address, Your IP: $client_ip).";
                        if (isset($_GET['ajax'])) {
                            header('Content-Type: application/json');
                            echo json_encode(['success' => false, 'message' => $msg]);
                            exit;
                        }
                        $_SESSION['flash_error'] = $msg;
                        header("Location: index.php?tab=hr_dashboard");
                        exit;
                    }
                }
                
                // Check if already checked in today
                $record = safeFetch($pdo, "SELECT * FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date = ?", [$emp_id, $today]);
                
                if (!$record) {
                    // Perform CHECK-IN
                    $office_start = !empty($emp['shift_start_time']) ? $emp['shift_start_time'] : getHRPolicy($pdo, 'office_start_time', '09:00:00');
                    $grace = intval(getHRPolicy($pdo, 'grace_time', '10'));
                    
                    $deadline = date('H:i:s', strtotime("+$grace minutes", strtotime($office_start)));
                    $status = ($now_time > $deadline) ? 'Late' : 'Present';
                    
                    $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_ATTENDANCE . " (employee_id, date, check_in, status) VALUES (?, ?, ?, ?)");
                    $stmt->execute([$emp_id, $today, $now_time, $status]);
                    
                    writeLog($pdo, $username, 'HR Attendance', $emp_id, "Employee {$emp['full_name']} Checked-in at $now_time (Status: $status)");
                    
                    if (isset($_GET['ajax'])) {
                        header('Content-Type: application/json');
                        echo json_encode(['success' => true, 'message' => "Checked-in successfully at $now_time (Status: $status)."]);
                        exit;
                    }
                    $_SESSION['flash_msg'] = "Checked-in successfully at $now_time.";
                } else {
                    // Perform CHECK-OUT
                    if (!empty($record['check_out'])) {
                        if (isset($_GET['ajax'])) {
                            header('Content-Type: application/json');
                            echo json_encode(['success' => false, 'message' => 'You have already checked out today.']);
                            exit;
                        }
                        $_SESSION['flash_error'] = "You have already checked out today.";
                        header("Location: index.php?tab=hr_dashboard");
                        exit;
                    }
                    
                    // Calculate working hours
                    $in_time = strtotime($record['check_in']);
                    $out_time = time();
                    $work_hrs = round(($out_time - $in_time) / 3600, 2);
                    
                    $min_checkout_hours = floatval(getHRPolicy($pdo, 'min_checkout_hours', '3'));
                    if ($work_hrs < $min_checkout_hours) {
                        $msg = "You cannot check out before working at least $min_checkout_hours hours (You have worked $work_hrs hours so far).";
                        if (isset($_GET['ajax'])) {
                            header('Content-Type: application/json');
                            echo json_encode(['success' => false, 'message' => $msg]);
                            exit;
                        }
                        $_SESSION['flash_error'] = $msg;
                        header("Location: index.php?tab=hr_dashboard");
                        exit;
                    }
                    
                    $stmt = $pdo->prepare("UPDATE " . TBL_HR_ATTENDANCE . " SET check_out = ?, working_hours = ? WHERE id = ?");
                    $stmt->execute([$now_time, $work_hrs, $record['id']]);
                    
                    writeLog($pdo, $username, 'HR Attendance', $emp_id, "Employee {$emp['full_name']} Checked-out at $now_time (Hours: $work_hrs)");
                    
                    if (isset($_GET['ajax'])) {
                        header('Content-Type: application/json');
                        echo json_encode(['success' => true, 'message' => "Checked-out successfully at $now_time (Hours: $work_hrs)."]);
                        exit;
                    }
                    $_SESSION['flash_msg'] = "Checked-out successfully at $now_time.";
                }
                header("Location: index.php?tab=hr_dashboard");
                exit;

            case 'manual_attendance':
                $emp_id = intval($_POST['employee_id'] ?? 0);
                $date = $_POST['date'] ?? date('Y-m-d');
                $check_in = !empty($_POST['check_in']) ? $_POST['check_in'] : null;
                $check_out = !empty($_POST['check_out']) ? $_POST['check_out'] : null;
                $status = $_POST['status'] ?? 'Present';
                $note = trim($_POST['note'] ?? '');
                
                if ($emp_id <= 0 || empty($date)) {
                    $_SESSION['flash_error'] = "Employee and Date are required.";
                    header("Location: index.php?tab=hr_attendance");
                    exit;
                }
                
                // Calculate working hours if both times are set
                $working_hours = 0.00;
                if ($check_in && $check_out) {
                    $in = strtotime($check_in);
                    $out = strtotime($check_out);
                    if ($out > $in) {
                        $working_hours = round(($out - $in) / 3600, 2);
                    }
                }
                
                // Insert or Update today's attendance
                $exist = safeFetch($pdo, "SELECT id FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date = ?", [$emp_id, $date]);
                if ($exist) {
                    $stmt = $pdo->prepare("UPDATE " . TBL_HR_ATTENDANCE . " SET check_in = ?, check_out = ?, working_hours = ?, status = ?, note = ? WHERE id = ?");
                    $stmt->execute([$check_in, $check_out, $working_hours, $status, $note, $exist['id']]);
                    writeLog($pdo, $username, 'HR Attendance', $emp_id, "Updated manual attendance for Employee ID $emp_id on $date ($status)");
                } else {
                    $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_ATTENDANCE . " (employee_id, date, check_in, check_out, working_hours, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$emp_id, $date, $check_in, $check_out, $working_hours, $status, $note]);
                    writeLog($pdo, $username, 'HR Attendance', $emp_id, "Created manual attendance for Employee ID $emp_id on $date ($status)");
                }
                
                $_SESSION['flash_msg'] = "Attendance entry saved successfully.";
                header("Location: index.php?tab=hr_attendance");
                exit;

            case 'leave_request':
                $emp_id = intval($_POST['employee_id'] ?? 0);
                $leave_type = $_POST['leave_type'] ?? '';
                $start_date = $_POST['start_date'] ?? '';
                $end_date = $_POST['end_date'] ?? '';
                $reason = trim($_POST['reason'] ?? '');
                
                $redirect_tab = !empty($_POST['from_self']) ? 'self_leave' : 'hr_leaves';
                
                if ($emp_id <= 0 || empty($leave_type) || empty($start_date) || empty($end_date)) {
                    $_SESSION['flash_error'] = "All fields are required.";
                    header("Location: index.php?tab=" . $redirect_tab);
                    exit;
                }
                
                $start = strtotime($start_date);
                $end = strtotime($end_date);
                if ($end < $start) {
                    $_SESSION['flash_error'] = "End date cannot be before start date.";
                    header("Location: index.php?tab=" . $redirect_tab);
                    exit;
                }
                
                $total_days = (($end - $start) / 86400) + 1;
                
                $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_LEAVES . " (employee_id, leave_type, start_date, end_date, total_days, reason, status) VALUES (?, ?, ?, ?, ?, ?, 'Pending')");
                $stmt->execute([$emp_id, $leave_type, $start_date, $end_date, $total_days, $reason]);
                
                writeLog($pdo, $username, 'HR Leave', $emp_id, "Requested leave: $leave_type ($start_date to $end_date, $total_days days)");
                $_SESSION['flash_msg'] = "Leave request submitted successfully.";
                header("Location: index.php?tab=" . $redirect_tab);
                exit;

            case 'leave_action':
                $leave_id = intval($_POST['leave_id'] ?? 0);
                $status = $_POST['status'] ?? ''; // Approved / Rejected
                
                if ($leave_id <= 0 || !in_array($status, ['Approved', 'Rejected'])) {
                    $_SESSION['flash_error'] = "Invalid leave action params.";
                    header("Location: index.php?tab=hr_leaves");
                    exit;
                }
                
                $leave = safeFetch($pdo, "SELECT * FROM " . TBL_HR_LEAVES . " WHERE id = ?", [$leave_id]);
                if (!$leave || $leave['status'] !== 'Pending') {
                    $_SESSION['flash_error'] = "Leave request not found or already processed.";
                    header("Location: index.php?tab=hr_leaves");
                    exit;
                }
                
                $pdo->beginTransaction();
                
                if ($status === 'Approved') {
                    $year = date('Y', strtotime($leave['start_date']));
                    
                    // Verify / Initialize balance record
                    $balance = safeFetch($pdo, "SELECT * FROM " . TBL_HR_LEAVE_BALANCES . " WHERE employee_id = ? AND year = ?", [$leave['employee_id'], $year]);
                    if (!$balance) {
                        $pdo->prepare("INSERT INTO " . TBL_HR_LEAVE_BALANCES . " (employee_id, year) VALUES (?, ?)")
                            ->execute([$leave['employee_id'], $year]);
                    }
                    
                    // Map type to balance column
                    $col = '';
                    if ($leave['leave_type'] === 'Casual leave') $col = 'casual_leave_used';
                    elseif ($leave['leave_type'] === 'Sick leave') $col = 'sick_leave_used';
                    elseif ($leave['leave_type'] === 'Emergency leave') $col = 'emergency_leave_used';
                    elseif ($leave['leave_type'] === 'Paid leave') $col = 'paid_leave_used';
                    elseif ($leave['leave_type'] === 'Alternative Leave') $col = 'alternative_leave_used';
                    
                    if (!empty($col)) {
                        $pdo->prepare("UPDATE " . TBL_HR_LEAVE_BALANCES . " SET $col = $col + ? WHERE employee_id = ? AND year = ?")
                            ->execute([$leave['total_days'], $leave['employee_id'], $year]);
                    }
                    
                    // Insert attendance record for each day of leave (status = Leave)
                    $curr = strtotime($leave['start_date']);
                    $end = strtotime($leave['end_date']);
                    while ($curr <= $end) {
                        $day_str = date('Y-m-d', $curr);
                        
                        $exist = safeFetch($pdo, "SELECT id FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date = ?", [$leave['employee_id'], $day_str]);
                        if ($exist) {
                            $pdo->prepare("UPDATE " . TBL_HR_ATTENDANCE . " SET status = 'Leave', check_in = NULL, check_out = NULL, working_hours = 0 WHERE id = ?")
                                ->execute([$exist['id']]);
                        } else {
                            $pdo->prepare("INSERT INTO " . TBL_HR_ATTENDANCE . " (employee_id, date, status) VALUES (?, ?, 'Leave')")
                                ->execute([$leave['employee_id'], $day_str]);
                        }
                        $curr = strtotime("+1 day", $curr);
                    }
                }
                
                // Update Leave record
                $stmt = $pdo->prepare("UPDATE " . TBL_HR_LEAVES . " SET status = ?, approved_by = ?, action_date = ? WHERE id = ?");
                $stmt->execute([$status, $user_id, date('Y-m-d'), $leave_id]);
                
                $pdo->commit();
                
                writeLog($pdo, $username, 'HR Leave', $leave['employee_id'], "Leave ID $leave_id set to: $status by admin");
                $_SESSION['flash_msg'] = "Leave request status updated to: $status.";
                header("Location: index.php?tab=hr_leaves");
                exit;

            case 'advance_request':
                $emp_id = intval($_POST['employee_id'] ?? 0);
                $amount = floatval($_POST['amount'] ?? 0);
                $request_date = $_POST['request_date'] ?? date('Y-m-d');
                $purpose = trim($_POST['purpose'] ?? '');
                $return_type = $_POST['return_type'] ?? 'Instant';
                $installment_count = max(1, intval($_POST['installment_count'] ?? 1));
                $deduction_start_month = $_POST['deduction_start_month'] ?? date('Y-m');
                
                if ($emp_id <= 0 || $amount <= 0) {
                    $_SESSION['flash_error'] = "Employee and valid Amount are required.";
                    header("Location: index.php?tab=hr_advance");
                    exit;
                }
                
                $monthly_deduction = ($return_type === 'Installment') ? round($amount / $installment_count, 2) : $amount;
                
                $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_ADVANCE_SALARIES . " (
                    employee_id, amount, request_date, purpose, return_type, installment_count,
                    monthly_deduction, remaining_balance, deduction_start_month, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'Pending')");
                
                $stmt->execute([
                    $emp_id, $amount, $request_date, $purpose, $return_type, $installment_count,
                    $monthly_deduction, $deduction_start_month
                ]);
                
                writeLog($pdo, $username, 'HR Advance Salary', $emp_id, "Requested advance salary: $amount (Return: $return_type)");
                $_SESSION['flash_msg'] = "Advance salary request submitted successfully.";
                header("Location: index.php?tab=hr_advance");
                exit;

            case 'advance_action':
                $adv_id = intval($_POST['advance_id'] ?? 0);
                $status = $_POST['status'] ?? ''; // Approved / Rejected
                
                if ($adv_id <= 0 || !in_array($status, ['Approved', 'Rejected'])) {
                    $_SESSION['flash_error'] = "Invalid action params.";
                    header("Location: index.php?tab=hr_advance");
                    exit;
                }
                
                $adv = safeFetch($pdo, "SELECT * FROM " . TBL_HR_ADVANCE_SALARIES . " WHERE id = ?", [$adv_id]);
                if (!$adv || $adv['status'] !== 'Pending') {
                    $_SESSION['flash_error'] = "Advance record not found or already processed.";
                    header("Location: index.php?tab=hr_advance");
                    exit;
                }
                
                $pdo->beginTransaction();
                
                if ($status === 'Approved') {
                    // Update advance details
                    $stmt = $pdo->prepare("UPDATE " . TBL_HR_ADVANCE_SALARIES . " SET status = 'Approved', remaining_balance = ?, approved_by = ? WHERE id = ?");
                    $stmt->execute([$adv['amount'], $user_id, $adv_id]);
                    
                    // Log payout in company cashbook as an Expense
                    $emp = safeFetch($pdo, "SELECT full_name FROM " . TBL_HR_EMPLOYEES . " WHERE id = ?", [$adv['employee_id']]);
                    log_finance($pdo, 'Expense', $adv['amount'], 'Cash', 'Advance Salary', $adv_id, "Advance Salary payout to {$emp['full_name']}");
                } else {
                    $stmt = $pdo->prepare("UPDATE " . TBL_HR_ADVANCE_SALARIES . " SET status = 'Rejected', approved_by = ? WHERE id = ?");
                    $stmt->execute([$user_id, $adv_id]);
                }
                
                $pdo->commit();
                
                writeLog($pdo, $username, 'HR Advance Salary', $adv['employee_id'], "Advance ID $adv_id set to: $status by admin");
                $_SESSION['flash_msg'] = "Advance salary request: $status.";
                header("Location: index.php?tab=hr_advance");
                exit;

                case 'policy_update':
                $grace_time = trim($_POST['grace_time'] ?? '10');
                $late_allowed = trim($_POST['late_allowed'] ?? '3');
                $late_deduction_amount = trim($_POST['late_deduction_amount'] ?? '50');
                $late_count_salary_deduct = trim($_POST['late_count_salary_deduct'] ?? '6');
                $absent_deduction_percentage = trim($_POST['absent_deduction_percentage'] ?? '100');
                $half_day_deduction_percentage = trim($_POST['half_day_deduction_percentage'] ?? '50');
                $office_start_time = trim($_POST['office_start_time'] ?? '09:00:00');
                $office_ip_address = trim($_POST['office_ip_address'] ?? '');
                $min_checkout_hours = trim($_POST['min_checkout_hours'] ?? '3');
                
                $casual_leave_quota = trim($_POST['casual_leave_quota'] ?? '10');
                $sick_leave_quota = trim($_POST['sick_leave_quota'] ?? '10');
                $emergency_leave_quota = trim($_POST['emergency_leave_quota'] ?? '5');
                $paid_leave_quota = trim($_POST['paid_leave_quota'] ?? '10');
                $alternative_leave_quota = trim($_POST['alternative_leave_quota'] ?? '0');
                
                $weekly_off_day = trim($_POST['weekly_off_day'] ?? 'Friday');
                $pf_percentage = trim($_POST['pf_percentage'] ?? '0');
                $festival_bonus_percentage = trim($_POST['festival_bonus_percentage'] ?? '0');
                $annual_bonus_percentage = trim($_POST['annual_bonus_percentage'] ?? '0');
                
                $enable_casual_leave = trim($_POST['enable_casual_leave'] ?? '0');
                $enable_sick_leave = trim($_POST['enable_sick_leave'] ?? '0');
                $enable_emergency_leave = trim($_POST['enable_emergency_leave'] ?? '0');
                $enable_paid_leave = trim($_POST['enable_paid_leave'] ?? '0');
                $enable_alternative_leave = trim($_POST['enable_alternative_leave'] ?? '0');
                
                $policies = [
                    'grace_time' => $grace_time,
                    'late_allowed' => $late_allowed,
                    'late_deduction_amount' => $late_deduction_amount,
                    'late_count_salary_deduct' => $late_count_salary_deduct,
                    'absent_deduction_percentage' => $absent_deduction_percentage,
                    'half_day_deduction_percentage' => $half_day_deduction_percentage,
                    'office_start_time' => $office_start_time,
                    'office_ip_address' => $office_ip_address,
                    'min_checkout_hours' => $min_checkout_hours,
                    'casual_leave_quota' => $casual_leave_quota,
                    'sick_leave_quota' => $sick_leave_quota,
                    'emergency_leave_quota' => $emergency_leave_quota,
                    'paid_leave_quota' => $paid_leave_quota,
                    'alternative_leave_quota' => $alternative_leave_quota,
                    'weekly_off_day' => $weekly_off_day,
                    'pf_percentage' => $pf_percentage,
                    'festival_bonus_percentage' => $festival_bonus_percentage,
                    'annual_bonus_percentage' => $annual_bonus_percentage,
                    'enable_casual_leave' => $enable_casual_leave,
                    'enable_sick_leave' => $enable_sick_leave,
                    'enable_emergency_leave' => $enable_emergency_leave,
                    'enable_paid_leave' => $enable_paid_leave,
                    'enable_alternative_leave' => $enable_alternative_leave
                ];
                
                $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_POLICIES . " (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)");
                foreach ($policies as $k => $v) {
                    $stmt->execute([$k, $v]);
                }
                
                writeLog($pdo, $username, 'HR Policy', 0, "Updated salary & late deduction policies");
                $_SESSION['flash_msg'] = "HR Policies updated successfully.";
                header("Location: index.php?tab=hr_policy");
                exit;

            case 'save_api_key':
                $api_key = trim($_POST['hr_attendance_api_key'] ?? '');
                $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_POLICIES . " (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)");
                $stmt->execute(['hr_attendance_api_key', $api_key]);
                $_SESSION['flash_msg'] = "Biometric API Key saved successfully.";
                header("Location: index.php?tab=hr_policy");
                exit;

            case 'add_holiday':
                $holiday_name = trim($_POST['holiday_name'] ?? '');
                $holiday_date = $_POST['holiday_date'] ?? '';
                if ($holiday_name && $holiday_date) {
                    $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_HOLIDAYS . " (holiday_date, holiday_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE holiday_name = VALUES(holiday_name)");
                    $stmt->execute([$holiday_date, $holiday_name]);
                    $_SESSION['flash_msg'] = "Holiday added successfully.";
                }
                header("Location: index.php?tab=hr_policy");
                exit;

            case 'delete_holiday':
                $holiday_id = intval($_POST['holiday_id'] ?? 0);
                if ($holiday_id > 0) {
                    $pdo->prepare("DELETE FROM " . TBL_HR_HOLIDAYS . " WHERE id = ?")->execute([$holiday_id]);
                    $_SESSION['flash_msg'] = "Holiday deleted successfully.";
                }
                header("Location: index.php?tab=hr_policy");
                exit;

            case 'payroll_generate':
                $salary_month = $_POST['salary_month'] ?? '';
                if (empty($salary_month)) {
                    $_SESSION['flash_error'] = "Salary month is required.";
                    header("Location: index.php?tab=hr_payroll");
                    exit;
                }
                
                // Dates for calculating attendance/absences
                $start_date = $salary_month . '-01';
                $end_date = date('Y-m-t', strtotime($start_date));
                $days_in_month = intval(date('t', strtotime($start_date)));
                
                // Fetch Policy Settings
                $grace_time = intval(getHRPolicy($pdo, 'grace_time', '10'));
                $late_allowed = intval(getHRPolicy($pdo, 'late_allowed', '3'));
                $late_deduct_amt = floatval(getHRPolicy($pdo, 'late_deduction_amount', '50'));
                $late_count_salary_deduct = intval(getHRPolicy($pdo, 'late_count_salary_deduct', '6'));
                $absent_pct = floatval(getHRPolicy($pdo, 'absent_deduction_percentage', '100'));
                $half_day_pct = floatval(getHRPolicy($pdo, 'half_day_deduction_percentage', '50'));
                $office_start = getHRPolicy($pdo, 'office_start_time', '09:00:00');
                
                $pf_percentage = floatval(getHRPolicy($pdo, 'pf_percentage', '0'));
                $festival_bonus_percentage = floatval(getHRPolicy($pdo, 'festival_bonus_percentage', '0'));
                $annual_bonus_percentage = floatval(getHRPolicy($pdo, 'annual_bonus_percentage', '0'));
                $weekly_off_day = getHRPolicy($pdo, 'weekly_off_day', 'Friday');
                
                // Get holidays in this month
                $stmt_h = $pdo->prepare("SELECT holiday_date FROM " . TBL_HR_HOLIDAYS . " WHERE holiday_date BETWEEN ? AND ?");
                $stmt_h->execute([$start_date, $end_date]);
                $public_holidays = $stmt_h->fetchAll(PDO::FETCH_COLUMN);
                
                $apply_bonus = $_POST['apply_bonus'] ?? 'None'; // 'None', 'Festival', 'Annual'
                
                // Fetch all Active employees
                $stmt_emp = $pdo->prepare("SELECT * FROM " . TBL_HR_EMPLOYEES . " WHERE employment_status = 'Active'");
                $stmt_emp->execute();
                $employees = $stmt_emp->fetchAll(PDO::FETCH_ASSOC);
                
                $generated_count = 0;
                
                foreach ($employees as $emp) {
                    $basic_salary = floatval($emp['monthly_salary']);
                    $daily_rate = round($basic_salary / 30, 2); // 30 is the standard base divisor
                    
                    // Count Late days in the month
                    $stmt_late = $pdo->prepare("SELECT COUNT(*) FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date BETWEEN ? AND ? AND status = 'Late'");
                    $stmt_late->execute([$emp['id'], $start_date, $end_date]);
                    $late_count = intval($stmt_late->fetchColumn());
                    
                    // Calculate late deductions:
                    // 1. Every $late_allowed days deducts $late_deduct_amt
                    $reg_late_deduct = floor($late_count / $late_allowed) * $late_deduct_amt;
                    // 2. Every $late_count_salary_deduct days deducts 1 day of basic salary
                    $high_late_deduct = floor($late_count / $late_count_salary_deduct) * $daily_rate;
                    $late_deduction = round($reg_late_deduct + $high_late_deduct, 2);
                    
                    // Count Absences and Half-days dynamically
                    // Loop through month days to detect absent dates (no attendance record on working days)
                    $absent_count = 0;
                    $half_day_count = 0;
                    
                    // Get all attendance for this employee in current month
                    $stmt_att = $pdo->prepare("SELECT date, status FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date BETWEEN ? AND ?");
                    $stmt_att->execute([$emp['id'], $start_date, $end_date]);
                    $att_records = [];
                    while ($r = $stmt_att->fetch(PDO::FETCH_ASSOC)) {
                        $att_records[$r['date']] = $r['status'];
                    }
                    
                    $join_time = strtotime($emp['joining_date']);
                    for ($d = 1; $d <= $days_in_month; $d++) {
                        $day_str = $salary_month . '-' . str_pad($d, 2, '0', STR_PAD_LEFT);
                        $day_time = strtotime($day_str);
                        
                        // Ignore days before joining or in the future
                        if ($day_time < $join_time || $day_time > time()) {
                            continue;
                        }
                        
                        if (isset($att_records[$day_str])) {
                            $status = $att_records[$day_str];
                            if ($status === 'Absent') {
                                $absent_count++;
                            } elseif ($status === 'Half-day') {
                                $half_day_count++;
                            }
                        } else {
                            // Missing attendance record - check if Weekly Off Day or Public Holiday
                            $day_of_week_str = date('l', $day_time);
                            $is_public_holiday = in_array($day_str, $public_holidays);
                            if ($day_of_week_str != $weekly_off_day && !$is_public_holiday) {
                                $absent_count++;
                            }
                        }
                    }
                    
                    $absent_deduction = round($absent_count * $daily_rate * ($absent_pct / 100), 2);
                    $half_day_deduction = round($half_day_count * $daily_rate * ($half_day_pct / 100), 2);
                    $total_absent_deduct = round($absent_deduction + $half_day_deduction, 2);
                    
                    // Calculate Advance Salary deductions
                    $stmt_adv = $pdo->prepare("SELECT * FROM " . TBL_HR_ADVANCE_SALARIES . " WHERE employee_id = ? AND status = 'Approved' AND remaining_balance > 0 AND deduction_start_month <= ?");
                    $stmt_adv->execute([$emp['id'], $salary_month]);
                    $advances = $stmt_adv->fetchAll(PDO::FETCH_ASSOC);
                    $advance_deduction = 0.00;
                    
                    foreach ($advances as $adv) {
                        if ($adv['return_type'] === 'Instant') {
                            $deduct = $adv['remaining_balance'];
                        } else {
                            $deduct = min($adv['remaining_balance'], $adv['monthly_deduction']);
                        }
                        $advance_deduction += $deduct;
                    }
                    $advance_deduction = round($advance_deduction, 2);
                    
                    $pf_deduction = round($basic_salary * ($pf_percentage / 100), 2);
                    
                    $bonus = 0;
                    if ($apply_bonus === 'Festival') {
                        $bonus = round($basic_salary * ($festival_bonus_percentage / 100), 2);
                    } elseif ($apply_bonus === 'Annual') {
                        $bonus = round($basic_salary * ($annual_bonus_percentage / 100), 2);
                    }
                    
                    // Final Net Salary (will adjust with bonus and incentives later)
                    $net_salary = $basic_salary + $bonus - $late_deduction - $total_absent_deduct - $advance_deduction - $pf_deduction;
                    if ($net_salary < 0) $net_salary = 0;
                    
                    // Check if payroll record already exists
                    $exist = safeFetch($pdo, "SELECT * FROM " . TBL_HR_PAYROLL . " WHERE employee_id = ? AND salary_month = ?", [$emp['id'], $salary_month]);
                    
                    if ($exist) {
                        // Skip updating paid payroll records
                        if ($exist['payment_status'] === 'Paid') {
                            continue;
                        }
                        
                        // Recalculate based on existing user adjustments (bonus, incentives, other deductions)
                        if ($apply_bonus === 'None') {
                            $bonus = floatval($exist['bonus']);
                        }
                        $incentive = floatval($exist['incentive']);
                        $other_deduct = floatval($exist['other_deduction']);
                        
                        $updated_net = $basic_salary + $bonus + $incentive - $late_deduction - $total_absent_deduct - $advance_deduction - $pf_deduction - $other_deduct;
                        if ($updated_net < 0) $updated_net = 0;
                        
                        $due = $updated_net - floatval($exist['paid_amount']);
                        $status = 'Due';
                        if ($due <= 0) {
                            $status = 'Paid';
                            $due = 0;
                        } elseif (floatval($exist['paid_amount']) > 0) {
                            $status = 'Partial';
                        }
                        
                        $stmt = $pdo->prepare("UPDATE " . TBL_HR_PAYROLL . " SET 
                            basic_salary = ?, late_deduction = ?, absent_deduction = ?, advance_deduction = ?, pf_deduction = ?, bonus = ?,
                            net_salary = ?, due_amount = ?, payment_status = ? 
                            WHERE id = ?");
                        $stmt->execute([$basic_salary, $late_deduction, $total_absent_deduct, $advance_deduction, $pf_deduction, $bonus, $updated_net, $due, $status, $exist['id']]);
                    } else {
                        // Insert new Payroll record
                        $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_PAYROLL . " (
                            employee_id, salary_month, basic_salary, late_deduction, absent_deduction,
                            advance_deduction, pf_deduction, bonus, net_salary, due_amount, payment_status, paid_amount
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Due', 0)");
                        $stmt->execute([
                            $emp['id'], $salary_month, $basic_salary, $late_deduction, $total_absent_deduct,
                            $advance_deduction, $pf_deduction, $bonus, $net_salary, $net_salary
                        ]);
                    }
                    $generated_count++;
                }
                
                writeLog($pdo, $username, 'HR Payroll', 0, "Generated/updated payroll for month $salary_month ($generated_count employees)");
                $_SESSION['flash_msg'] = "Payroll generated/updated successfully for $generated_count employees.";
                header("Location: index.php?tab=hr_payroll&salary_month=" . urlencode($salary_month));
                exit;

            case 'payroll_adjustments':
                $pay_id = intval($_POST['payroll_id'] ?? 0);
                $bonus = floatval($_POST['bonus'] ?? 0);
                $incentive = floatval($_POST['incentive'] ?? 0);
                $other_deduction = floatval($_POST['other_deduction'] ?? 0);
                $remarks = trim($_POST['remarks'] ?? '');
                
                if ($pay_id <= 0) {
                    $_SESSION['flash_error'] = "Invalid payroll record.";
                    header("Location: index.php?tab=hr_payroll");
                    exit;
                }
                
                $pay = safeFetch($pdo, "SELECT * FROM " . TBL_HR_PAYROLL . " WHERE id = ?", [$pay_id]);
                if (!$pay || $pay['payment_status'] === 'Paid') {
                    $_SESSION['flash_error'] = "Payroll record not found or already paid.";
                    header("Location: index.php?tab=hr_payroll");
                    exit;
                }
                
                // Recalculate Net Salary with adjustments
                $net_salary = $pay['basic_salary'] + $bonus + $incentive - $pay['late_deduction'] - $pay['absent_deduction'] - $pay['advance_deduction'] - $other_deduction;
                if ($net_salary < 0) $net_salary = 0;
                
                $due_amount = $net_salary - $pay['paid_amount'];
                $status = 'Due';
                if ($due_amount <= 0) {
                    $status = 'Paid';
                    $due_amount = 0;
                } elseif ($pay['paid_amount'] > 0) {
                    $status = 'Partial';
                }
                
                $stmt = $pdo->prepare("UPDATE " . TBL_HR_PAYROLL . " SET bonus = ?, incentive = ?, other_deduction = ?, net_salary = ?, due_amount = ?, payment_status = ?, remarks = ? WHERE id = ?");
                $stmt->execute([$bonus, $incentive, $other_deduction, $net_salary, $due_amount, $status, $remarks, $pay_id]);
                
                writeLog($pdo, $username, 'HR Payroll', $pay['employee_id'], "Payroll adjustments set for ID $pay_id (Bonus: $bonus, Inc: $incentive, Other Ded: $other_deduction)");
                $_SESSION['flash_msg'] = "Adjustments updated successfully.";
                header("Location: index.php?tab=hr_payroll&salary_month=" . urlencode($pay['salary_month']));
                exit;

            case 'payroll_pay':
                $pay_id = intval($_POST['payroll_id'] ?? 0);
                $amount_to_pay = floatval($_POST['amount_to_pay'] ?? 0);
                $payment_method = $_POST['payment_method'] ?? 'Cash';
                $remarks = trim($_POST['remarks'] ?? '');
                
                if ($pay_id <= 0 || $amount_to_pay <= 0) {
                    $_SESSION['flash_error'] = "Payroll ID and Valid Payout Amount are required.";
                    header("Location: index.php?tab=hr_payroll");
                    exit;
                }
                
                $pay = safeFetch($pdo, "SELECT * FROM " . TBL_HR_PAYROLL . " WHERE id = ?", [$pay_id]);
                if (!$pay || $pay['payment_status'] === 'Paid') {
                    $_SESSION['flash_error'] = "Payroll record not found or already paid in full.";
                    header("Location: index.php?tab=hr_payroll");
                    exit;
                }
                
                if ($amount_to_pay > $pay['due_amount']) {
                    $_SESSION['flash_error'] = "Payout amount exceeds remaining due of " . $pay['due_amount'] . "/-";
                    header("Location: index.php?tab=hr_payroll&salary_month=" . urlencode($pay['salary_month']));
                    exit;
                }
                
                $pdo->beginTransaction();
                
                $new_paid = $pay['paid_amount'] + $amount_to_pay;
                $new_due = $pay['due_amount'] - $amount_to_pay;
                $status = ($new_due <= 0) ? 'Paid' : 'Partial';
                
                // Update Payroll record
                $stmt = $pdo->prepare("UPDATE " . TBL_HR_PAYROLL . " SET paid_amount = ?, due_amount = ?, payment_status = ?, payment_date = ?, payment_method = ?, remarks = CONCAT(IFNULL(remarks,''), '\n', ?) WHERE id = ?");
                $stmt->execute([$new_paid, $new_due, $status, date('Y-m-d'), $payment_method, $remarks, $pay_id]);
                
                // Deduct from outstanding Advance Salary remaining balance
                if ($pay['advance_deduction'] > 0) {
                    // Fetch advances that were selected
                    $stmt_adv = $pdo->prepare("SELECT * FROM " . TBL_HR_ADVANCE_SALARIES . " WHERE employee_id = ? AND status = 'Approved' AND remaining_balance > 0 AND deduction_start_month <= ?");
                    $stmt_adv->execute([$pay['employee_id'], $pay['salary_month']]);
                    $to_deduct = $pay['advance_deduction'];
                    
                    while ($adv = $stmt_adv->fetch(PDO::FETCH_ASSOC)) {
                        if ($to_deduct <= 0) break;
                        
                        if ($adv['return_type'] === 'Instant') {
                            $ded = min($to_deduct, $adv['remaining_balance']);
                        } else {
                            $ded = min($to_deduct, min($adv['remaining_balance'], $adv['monthly_deduction']));
                        }
                        
                        $pdo->prepare("UPDATE " . TBL_HR_ADVANCE_SALARIES . " SET remaining_balance = remaining_balance - ? WHERE id = ?")
                            ->execute([$ded, $adv['id']]);
                        $to_deduct -= $ded;
                    }
                }
                
                // Log payout in company cashbook as an Expense
                $emp = safeFetch($pdo, "SELECT full_name FROM " . TBL_HR_EMPLOYEES . " WHERE id = ?", [$pay['employee_id']]);
                log_finance($pdo, 'Expense', $amount_to_pay, $payment_method, 'Payroll Payout', $pay_id, "Salary Payout of {$emp['full_name']} for month {$pay['salary_month']}");
                
                $pdo->commit();
                
                writeLog($pdo, $username, 'HR Payroll Payout', $pay['employee_id'], "Processed payout of $amount_to_pay/- for month {$pay['salary_month']}");
                $_SESSION['flash_msg'] = "Payout processed successfully.";
                header("Location: index.php?tab=hr_payroll&salary_month=" . urlencode($pay['salary_month']));
                exit;
        }
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $_SESSION['flash_error'] = "Error: " . $e->getMessage();
        header("Location: index.php?tab=hr_dashboard");
    }
}


