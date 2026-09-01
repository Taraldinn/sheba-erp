<?php
// api/attendance.php

header('Content-Type: application/json');

// Include necessary files
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

// Allow POST requests only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed. Use POST.']);
    exit;
}

// Check API Key
$valid_api_key = getHRPolicy($pdo, 'hr_attendance_api_key', '');
if (empty($valid_api_key)) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Biometric API Key is not configured on the server.']);
    exit;
}

// Extract API Key from headers or request payload
$headers = getallheaders();
$provided_key = '';
if (isset($headers['Authorization'])) {
    $provided_key = str_replace('Bearer ', '', $headers['Authorization']);
} elseif (isset($headers['x-api-key'])) {
    $provided_key = $headers['x-api-key'];
} elseif (isset($_POST['api_key'])) {
    $provided_key = $_POST['api_key'];
} else {
    // Check JSON payload
    $raw_input = file_get_contents('php://input');
    $json = json_decode($raw_input, true);
    if (isset($json['api_key'])) {
        $provided_key = $json['api_key'];
    }
}

if ($provided_key !== $valid_api_key) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized. Invalid API Key.']);
    exit;
}

// Parse Payload
$staff_id = $_POST['staff_id'] ?? ($json['staff_id'] ?? '');
$punch_type = $_POST['punch_type'] ?? ($json['punch_type'] ?? ''); // 'CheckIn', 'CheckOut', or auto
$timestamp = $_POST['timestamp'] ?? ($json['timestamp'] ?? date('Y-m-d H:i:s'));

if (empty($staff_id)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'staff_id is required.']);
    exit;
}

// Ensure valid timestamp
$punch_time = strtotime($timestamp);
if (!$punch_time) {
    $punch_time = time();
}
$date = date('Y-m-d', $punch_time);
$time = date('H:i:s', $punch_time);

// Find Employee by staff_id
$stmt = $pdo->prepare("SELECT id, full_name, employment_status FROM " . TBL_HR_EMPLOYEES . " WHERE staff_id = ?");
$stmt->execute([$staff_id]);
$emp = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$emp) {
    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'Employee not found with staff_id: ' . $staff_id]);
    exit;
}

if ($emp['employment_status'] !== 'Active') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Employee is not active.']);
    exit;
}

$employee_id = $emp['id'];

// Check if attendance record already exists for today
$att = safeFetch($pdo, "SELECT * FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date = ?", [$employee_id, $date]);

if (!$att) {
    // First punch of the day -> CheckIn
    if ($punch_type === 'CheckOut') {
        echo json_encode(['status' => 'error', 'message' => 'Cannot CheckOut without Checking In first.']);
        exit;
    }

    $office_start = getHRPolicy($pdo, 'office_start_time', '09:00:00');
    $grace_time = intval(getHRPolicy($pdo, 'grace_time', '10'));
    
    // Calculate late status
    $late_threshold = strtotime($date . ' ' . $office_start) + ($grace_time * 60);
    $status = ($punch_time > $late_threshold) ? 'Late' : 'Present';
    
    // Insert CheckIn
    $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_ATTENDANCE . " (employee_id, date, check_in_time, status, ip_address, device_type, note) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$employee_id, $date, $time, $status, $_SERVER['REMOTE_ADDR'] ?? '', 'Biometric Device', 'Auto-synced via API']);
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Check-In recorded successfully.',
        'employee' => $emp['full_name'],
        'time' => $time,
        'attendance_status' => $status
    ]);
    exit;

} else {
    // Already has an attendance record for today -> CheckOut (or update CheckOut)
    if ($punch_type === 'CheckIn' && $att['check_in_time']) {
        echo json_encode(['status' => 'error', 'message' => 'Employee already checked in today.']);
        exit;
    }
    
    // If it's the same minute as check-in, ignore (prevent double scan bounce)
    if (strtotime($att['check_in_time']) > $punch_time - 60) {
         echo json_encode(['status' => 'ignored', 'message' => 'Punch ignored. Too close to Check-In.']);
         exit;
    }
    
    $stmt = $pdo->prepare("UPDATE " . TBL_HR_ATTENDANCE . " SET check_out_time = ? WHERE id = ?");
    $stmt->execute([$time, $att['id']]);
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Check-Out recorded successfully.',
        'employee' => $emp['full_name'],
        'time' => $time
    ]);
    exit;
}
