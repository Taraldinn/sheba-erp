<?php
// Quick debug script - delete after use
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
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

header('Content-Type: text/plain');

echo "=== WebSIP Debug ===\n\n";

// Test 1: Check ip_phone_numbers table
try {
    $res = $pdo->query("SELECT * FROM ip_phone_numbers LIMIT 1")->fetch();
    echo "ip_phone_numbers table: EXISTS\n";
    echo "Columns: " . implode(', ', array_keys($res ?: ['(empty table)' => 1])) . "\n";
    $main = $pdo->query("SELECT * FROM ip_phone_numbers WHERE is_main = 1 LIMIT 1")->fetch();
    echo "Main SIP number: " . ($main ? $main['ip_number'] . " (server: " . $main['sip_server'] . ")" : "NONE SET") . "\n";
} catch(Exception $e) {
    echo "ip_phone_numbers table: MISSING or ERROR - " . $e->getMessage() . "\n";
}

echo "\n";

// Test 2: Check ip_phone_configs table
try {
    $cfg = $pdo->query("SELECT * FROM ip_phone_configs LIMIT 1")->fetch();
    echo "ip_phone_configs table: EXISTS\n";
    echo "Enabled: " . ($cfg ? ($cfg['enabled'] ? 'YES' : 'NO') : 'empty table') . "\n";
} catch(Exception $e) {
    echo "ip_phone_configs table: MISSING or ERROR - " . $e->getMessage() . "\n";
}

echo "\n";

// Test 3: Check call_logs table
try {
    $pdo->query("SELECT id FROM call_logs LIMIT 1");
    echo "call_logs table: EXISTS\n";
} catch(Exception $e) {
    echo "call_logs table: MISSING or ERROR - " . $e->getMessage() . "\n";
}

echo "\n";

// Test 4: IPPhoneDriver class
if (file_exists(__DIR__ . '/classes/IPPhoneDriver.php')) {
    require_once __DIR__ . '/classes/IPPhoneDriver.php';
    echo "IPPhoneDriver class: LOADED\n";
    try {
        $driver = IPPhoneDriver::getDriver($pdo);
        echo "Active driver: " . ($driver ? get_class($driver) : "NONE (no API configured)") . "\n";
    } catch(Exception $e) {
        echo "Driver error: " . $e->getMessage() . "\n";
    }
} else {
    echo "IPPhoneDriver class: FILE MISSING\n";
}

echo "\n=== WebSIP Controller Test ===\n";
echo "Action 'click_to_call' would return is_sip_client = ";
try {
    $sip_check = $pdo->query("SELECT id FROM ip_phone_numbers WHERE is_main = 1 LIMIT 1")->fetch();
    echo $sip_check ? "TRUE (WebSIP mode)\n" : "FALSE (API mode - needs configured driver)\n";
} catch(Exception $e) {
    echo "TRUE (WebSIP mode - table missing, safe default)\n";
}

echo "\nDone. Delete this file after checking!\n";
