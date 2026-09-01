<?php
// scratch/cleanup_and_relocate.php

$rootDir = dirname(__DIR__);
$toolsDir = $rootDir . '/tools/private';

if (!is_dir($toolsDir)) {
    mkdir($toolsDir, 0755, true);
}

// Write .htaccess to deny web access in tools/private
file_put_contents($toolsDir . '/.htaccess', "Order deny,allow\nDeny from all\n");

// Write README.md
$readmeContent = "# Private Tools Directory\n\nThese scripts are utility/diagnostic scripts used for migration, checking DB consistency, and testing. They are moved outside the public root directory to prevent web exposure.\nDirect HTTP access is blocked via .htaccess.\n";
file_put_contents($toolsDir . '/README.md', $readmeContent);

$safeToDelete = [
    'debug_ashiktest.php',
    'test2.php',
    'test3.php',
    'test_db.php',
    'test_direct.php',
    'test_email_debug.php',
    'test_global.php',
    'test_mac_web.php',
    'test_olt.php',
    'test_olt_connect.php',
    'test_report_data.php',
    'test_rx0002.php',
    'test_sms_log.php'
];

$moveToPrivate = [
    'apply_fix.py',
    'check_active_dir.php',
    'check_bo103.php',
    'check_db.php',
    'check_db_diag.php',
    'check_db_schema.php',
    'check_olts.php',
    'check_olts_schema.php',
    'check_replies.php',
    'check_ripa.php',
    'check_roles.php',
    'check_services.php',
    'check_tokens.php',
    'check_user.php',
    'check_users.php',
    'check_users_schema.php',
    'check_users_schema2.php',
    'count_routers.php',
    'debug_active_keys.php',
    'debug_auth.php',
    'debug_db_check.php',
    'debug_deduct.php',
    'debug_delete.php',
    'debug_diag.php',
    'debug_mik.php',
    'debug_payment.php',
    'debug_prices.php',
    'debug_role.php',
    'debug_smtp.php',
    'debug_store.php',
    'debug_tx.php',
    'debug_users.php',
    'debug_websip.php',
    'dump_settings.php',
    'fix_db_schema.php',
    'fix_logic.py',
    'fix_olt_ip.php',
    'fix_tx_logs.py',
    'fix_tx_logs_php.php',
    'fix_zero_bills.php',
    'get_user.php',
    'hide_index.py',
    'inspect_schema.php',
    'inspect_tickets.php',
    'list_services.php',
    'migrate_due_to_expire.php',
    'migrate_standalone.php',
    'read_debug_log.php',
    'run_migration_web.php',
    'update_db_lock.php',
    'verify_db_store.php',
    'verify_schema.php',
    'verify_tables.php',
    'view_logs.php'
];

foreach ($safeToDelete as $file) {
    $filePath = $rootDir . '/' . $file;
    if (file_exists($filePath)) {
        if (unlink($filePath)) {
            echo "Deleted: $file\n";
        } else {
            echo "Failed to delete: $file\n";
        }
    }
}

foreach ($moveToPrivate as $file) {
    $srcPath = $rootDir . '/' . $file;
    if (file_exists($srcPath)) {
        $destPath = $toolsDir . '/' . $file;
        if (rename($srcPath, $destPath)) {
            echo "Moved to tools/private: $file\n";
        } else {
            echo "Failed to move: $file\n";
        }
    }
}

echo "Cleanup done.\n";
?>
