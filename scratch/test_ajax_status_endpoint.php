<?php
define('APP_DEBUG', true);
define('TENANT_OVERRIDE', 'billing');

// Mock session
$_SESSION['admin_id'] = 1;
$_SESSION['admin_username'] = 'ripaonline';
$_SESSION['user_role'] = 'Admin';

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/MikrotikApp.php';

$_GET['ajax_status'] = 1;
$_GET['uids'] = 'RO0200,ro0200,RO0001,INVALID';

require_once __DIR__ . '/../controllers/logic.php';
