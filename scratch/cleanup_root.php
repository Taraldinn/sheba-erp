<?php
// scratch/cleanup_root.php
// Moves all debug, test, verify and check scripts from the root folder to the scratch folder.

$root = dirname(__DIR__);
$scratchDir = __DIR__;

$patterns = [
    'debug_*.php',
    'debug_*.log',
    'test_*.php',
    'test_*.txt',
    'check_*.php',
    'fix_*.php',
    'fix_*.py',
    'inspect_*.php',
    'verify_*.php',
    'test2.php',
    'test3.php',
    'apply_fix.py',
    'hide_index.py',
    'get_user.php',
    'dump_settings.php',
    'list_services.php',
    'view_logs.php',
    'count_routers.php',
    'read_debug_log.php',
    'run_migration_web.php',
    'migrate_due_to_expire.php',
    'migrate_standalone.php',
    'update_db_lock.php'
];

echo "Starting web root cleanup...\n";

foreach ($patterns as $pattern) {
    $files = glob($root . '/' . $pattern);
    if ($files === false) continue;
    
    foreach ($files as $file) {
        $basename = basename($file);
        // Do not move this script itself if it somehow matches
        if ($basename === 'cleanup_root.php') continue;
        
        $dest = $scratchDir . '/' . $basename;
        echo "Moving $basename to scratch/ ... ";
        if (rename($file, $dest)) {
            echo "Success\n";
        } else {
            echo "Failed\n";
        }
    }
}

echo "Cleanup completed successfully.\n";
?>
