<?php
// api/hr_attendance.php
// Endpoint for ZKTeco or other fingerprint machines to push attendance records

require_once __DIR__ . '/../includes/config.php';

header('Content-Type: application/json');

// Simple API Key validation
$headers = getallheaders();
$api_key = $headers['X-API-Key'] ?? ($_GET['api_key'] ?? '');

// Optional: In a real environment, you should check this against TBL_SETTINGS or hardcode for now
$valid_api_key = 'sheba-hr-12345';
if ($api_key !== $valid_api_key) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized. Invalid API Key.']);
    exit;
}

// Ensure it's a POST request
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed. Use POST.']);
    exit;
}

// Get JSON payload
$raw_data = file_get_contents("php://input");
$data = json_decode($raw_data, true);

if (!$data) {
    // Try POST variables if not JSON
    $data = $_POST;
}

$staff_id = $data['staff_id'] ?? '';
$timestamp = $data['timestamp'] ?? ''; // Format: YYYY-MM-DD HH:MM:SS
$type = $data['type'] ?? ''; // check-in or check-out

if (empty($staff_id) || empty($timestamp) || empty($type)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required fields: staff_id, timestamp, type']);
    exit;
}

// Validate date and time
$date = date('Y-m-d', strtotime($timestamp));
$time = date('H:i:s', strtotime($timestamp));

// Find employee
$emp = safeFetch($pdo, "SELECT id, full_name, shift_start_time FROM " . TBL_HR_EMPLOYEES . " WHERE staff_id = ?", [$staff_id]);

if (!$emp) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => "Employee not found with staff_id: $staff_id"]);
    exit;
}

$emp_id = $emp['id'];

// Check existing record for today
$record = safeFetch($pdo, "SELECT * FROM " . TBL_HR_ATTENDANCE . " WHERE employee_id = ? AND date = ?", [$emp_id, $date]);

if (strtolower($type) === 'check-in') {
    if ($record) {
        // Already checked in, update check-in time? Usually we don't overwrite if it exists, or maybe we do for corrections.
        echo json_encode(['success' => true, 'message' => 'Check-in already exists for today.', 'action' => 'ignored']);
        exit;
    }
    
    // Calculate Late Status
    $office_start = !empty($emp['shift_start_time']) ? $emp['shift_start_time'] : getHRPolicy($pdo, 'office_start_time', '09:00:00');
    $grace = intval(getHRPolicy($pdo, 'grace_time', '10'));
    $deadline = date('H:i:s', strtotime("+$grace minutes", strtotime($office_start)));
    $status = ($time > $deadline) ? 'Late' : 'Present';
    
    $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_ATTENDANCE . " (employee_id, date, check_in, status, note) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$emp_id, $date, $time, $status, 'API Check-in']);
    
    echo json_encode(['success' => true, 'message' => "Check-in recorded for {$emp['full_name']} at $time", 'status' => $status]);

} elseif (strtolower($type) === 'check-out') {
    if (!$record) {
        // No check-in found, we can't reliably calculate hours yet, but let's record it anyway
        $stmt = $pdo->prepare("INSERT INTO " . TBL_HR_ATTENDANCE . " (employee_id, date, check_out, status, note) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$emp_id, $date, $time, 'Present', 'API Check-out (No Check-in)']);
        echo json_encode(['success' => true, 'message' => "Check-out recorded without check-in for {$emp['full_name']} at $time"]);
        exit;
    }
    
    // Calculate working hours
    $in_time = strtotime($record['check_in'] ?? $time);
    $out_time = strtotime($time);
    $work_hrs = round(($out_time - $in_time) / 3600, 2);
    
    $stmt = $pdo->prepare("UPDATE " . TBL_HR_ATTENDANCE . " SET check_out = ?, working_hours = ? WHERE id = ?");
    $stmt->execute([$time, $work_hrs, $record['id']]);
    
    echo json_encode(['success' => true, 'message' => "Check-out recorded for {$emp['full_name']} at $time. Hours: $work_hrs"]);
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid type. Use check-in or check-out.']);
}
