<?php
// Simulate logged in admin session
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
$_SESSION['admin_id'] = 1;
$_SESSION['admin_username'] = 'Admin';
$_SESSION['user_role'] = 'Admin';

require_once 'includes/config.php';
require_once 'includes/functions.php';
require_once 'classes/MikrotikApp.php';
require_once 'classes/UsageEngine.php';

// Enable full error reporting
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "Testing get_usage_reports_data...\n";

$_GET['type'] = 'history';
$_GET['date_from'] = date('Y-m-d', strtotime('-30 days'));
$_GET['date_to'] = date('Y-m-d');
$_GET['router_id'] = 0;
$_GET['customer_id'] = 0;

try {
    ob_start();
    require 'controllers/usage_controller.php';
    $output = ob_get_clean();
    echo "Output successfully received:\n";
    echo $output . "\n";
} catch (Exception $e) {
    echo "Exception Caught: " . $e->getMessage() . "\n";
}
