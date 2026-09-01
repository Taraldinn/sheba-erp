<?php
// scratch/check_syntax.php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Define basic context
define('CURRENT_TENANT', 'main');
$_SESSION['admin_id'] = 1;
$_SESSION['admin_user'] = 'Admin';
$_SESSION['user_role'] = 'Admin';

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/IPPhoneDriver.php';

// Include the controller to see if there is any syntax error
try {
    echo "Checking controllers/call_center_controller.php... ";
    ob_start();
    include __DIR__ . '/../controllers/call_center_controller.php';
    ob_end_clean();
    echo "OK!\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

// Include the view to see if there is any syntax error
try {
    echo "Checking views/call_center/ip_phone_config.php... ";
    ob_start();
    include __DIR__ . '/../views/call_center/ip_phone_config.php';
    ob_end_clean();
    echo "OK!\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
