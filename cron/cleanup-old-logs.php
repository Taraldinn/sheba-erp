<?php
/**
 * cron/cleanup-old-logs.php
 * Cleans up user bandwidth usage logs older than 90 days to preserve database sizing.
 * Run this via cron job daily or weekly.
 * 
 * Scope Arguments:
 *   php /path/to/cron/cleanup-old-logs.php --tenant=client1
 *   php /path/to/cron/cleanup-old-logs.php
 */

$tenant_override = null;
if (isset($argv)) {
    foreach ($argv as $arg) {
        if (strpos($arg, '--tenant=') === 0) {
            $tenant_override = substr($arg, 9);
            define('TENANT_OVERRIDE', $tenant_override);
            break;
        }
    }
}

// Global Orchestration Mode
if ($tenant_override === null && PHP_SAPI === 'cli') {
    echo "[" . date('Y-m-d H:i:s') . "] Starting ISP Database Maintenance (Global Orchestration)...\n";
    
    // Cleanup Main System
    echo "==================================================\n";
    echo "Cleaning Main System...\n";
    runTenantCleanup(null);

    // Dynamic Tenant Discovery
    $tenants_dir = __DIR__ . '/../includes/tenants';
    if (is_dir($tenants_dir)) {
        $tenant_files = glob($tenants_dir . '/*.php');
        foreach ($tenant_files as $file) {
            $tenant_name = basename($file, '.php');
            if ($tenant_name === '.htaccess') continue;
            
            echo "==================================================\n";
            echo "Cleaning Tenant: {$tenant_name}...\n";
            runTenantCleanup($tenant_name);
        }
    }
    
    echo "==================================================\n";
    echo "[" . date('Y-m-d H:i:s') . "] Database Maintenance Complete.\n";
    exit;
}

$current_tenant = defined('TENANT_OVERRIDE') ? TENANT_OVERRIDE : 'Main';
echo "[" . date('Y-m-d H:i:s') . "] Cleaning old logs for Tenant: [{$current_tenant}]\n";

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

try {
    // Delete logs older than 90 days (adjustable threshold)
    $retention_days = 90;
    $threshold_date = date('Y-m-d', strtotime("-{$retention_days} days"));

    $stmt = $pdo->prepare("DELETE FROM " . TBL_USAGE_LOGS . " WHERE usage_date < ?");
    $stmt->execute([$threshold_date]);
    
    $deleted_rows = $stmt->rowCount();
    echo "  - Successfully deleted {$deleted_rows} usage records older than {$threshold_date} ({$retention_days} days retention limit).\n";
    
    // Also optimize the tables to release disk space (MySQL InnoDB table defragmentation)
    $pdo->exec("OPTIMIZE TABLE " . TBL_USAGE_LOGS);
    echo "  - Table optimization successfully completed.\n";

} catch (Exception $e) {
    error_log("Database Maintenance Failure ({$current_tenant}): " . $e->getMessage());
    echo "  - Critical Error: " . $e->getMessage() . "\n";
}

echo "[" . date('Y-m-d H:i:s') . "] Maintenance Complete for: [{$current_tenant}]\n\n";

/**
 * Runs a child process for a specific tenant.
 */
function runTenantCleanup($tenant = null) {
    $script = __FILE__;
    $command = "php \"" . $script . "\"";
    if ($tenant) {
        $command .= " --tenant=" . escapeshellarg($tenant);
    }
    
    $output = shell_exec($command);
    echo $output;
}
