<?php
/**
 * cron/master_cron.php
 * Master cron job for SaaS / Multi-tenant setup.
 * It iterates through all SaaS tenants and the main system to sync sessions.
 * 
 * Run this via Windows Task Scheduler every 1-5 minutes:
 * php c:\path\to\cron\master_cron.php
 */

$base_dir = __DIR__ . '/..';
$tenants_dir = $base_dir . '/includes/tenants';
$sync_script = __DIR__ . '/sync_sessions.php';
$reminder_script = __DIR__ . '/sms_reminders.php';
$olt_sync_script = __DIR__ . '/sync_olts.php';
$sms_queue_script = __DIR__ . '/process_sms_queue.php';
$mikrotik_sync_script = __DIR__ . '/process_mikrotik_sync.php';
$voice_reminders_script = __DIR__ . '/voice_reminders.php';
$voice_results_script = __DIR__ . '/voice_broadcast_results.php';

$php_path = PHP_BINARY;
$task_scheduler_script = __DIR__ . '/task_scheduler.php';

echo "[" . date('Y-m-d H:i:s') . "] Starting Master Cron (Multi-Tenant)...\n";

// 1. Sync Main System (no tenant)
echo "--------------------------------------------------\n";
echo "Main System Sync:\n";
shell_exec("\"$php_path\" \"$sync_script\"");
shell_exec("\"$php_path\" \"$reminder_script\"");
shell_exec("\"$php_path\" \"$olt_sync_script\"");
shell_exec("\"$php_path\" \"$sms_queue_script\"");
shell_exec("\"$php_path\" \"$mikrotik_sync_script\"");
shell_exec("\"$php_path\" \"$voice_reminders_script\"");
shell_exec("\"$php_path\" \"$voice_results_script\"");
shell_exec("\"$php_path\" \"$task_scheduler_script\"");

// 2. Sync All SaaS Tenants
if (is_dir($tenants_dir)) {
    $tenant_files = glob($tenants_dir . '/*.php');
    foreach ($tenant_files as $file) {
        $tenant_name = basename($file, '.php');
        if ($tenant_name === '.htaccess') continue;
        
        echo "--------------------------------------------------\n";
        echo "Tenant Sync: $tenant_name\n";
        
        shell_exec("\"$php_path\" \"$sync_script\" --tenant=$tenant_name");
        shell_exec("\"$php_path\" \"$reminder_script\" --tenant=$tenant_name");
        shell_exec("\"$php_path\" \"$olt_sync_script\" --tenant=$tenant_name");
        shell_exec("\"$php_path\" \"$sms_queue_script\" --tenant=$tenant_name");
        shell_exec("\"$php_path\" \"$mikrotik_sync_script\" --tenant=$tenant_name");
        shell_exec("\"$php_path\" \"$voice_reminders_script\" --tenant=$tenant_name");
        shell_exec("\"$php_path\" \"$voice_results_script\" --tenant=$tenant_name");
        shell_exec("\"$php_path\" \"$task_scheduler_script\" --tenant=$tenant_name");
    }
}

echo "--------------------------------------------------\n";
echo "[" . date('Y-m-d H:i:s') . "] Master Cron Complete.\n";
?>
