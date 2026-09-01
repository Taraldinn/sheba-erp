<?php
/**
 * cron/usage-sync.php
 * Synchronizes PPPoE bandwidth usage logs from MikroTik active sessions.
 * Run this via cron job every 1 minute.
 * 
 * Single-Tenant / Specific Tenant CLI:
 *   php /path/to/cron/usage-sync.php --tenant=client1
 * 
 * Auto-discovery / Global Cron:
 *   php /path/to/cron/usage-sync.php
 */

// 1. CLI Tenant Argument Parsing
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

// Enable error logging for cron execution
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../debug_usage_cron.log');

// 2. Global Sync Mode (Discovers and syncs all tenants sequentially)
if ($tenant_override === null && PHP_SAPI === 'cli') {
    echo "[" . date('Y-m-d H:i:s') . "] Starting ISP Usage Tracker (Global Orchestration)...\n";
    
    // Sync Main System
    echo "==================================================\n";
    echo "Syncing Main System...\n";
    runTenantSync(null);

    // Sync all Tenants dynamically
    $tenants_dir = __DIR__ . '/../includes/tenants';
    if (is_dir($tenants_dir)) {
        $tenant_files = glob($tenants_dir . '/*.php');
        foreach ($tenant_files as $file) {
            $tenant_name = basename($file, '.php');
            if ($tenant_name === '.htaccess') continue;
            
            echo "==================================================\n";
            echo "Syncing Tenant: {$tenant_name}...\n";
            runTenantSync($tenant_name);
        }
    }
    
    echo "==================================================\n";
    echo "[" . date('Y-m-d H:i:s') . "] Global Sync Complete.\n";
    exit;
}

// 3. Single-Tenant Mode (Invoked for current process or through command execution)
$current_tenant = defined('TENANT_OVERRIDE') ? TENANT_OVERRIDE : 'Main';
echo "[" . date('Y-m-d H:i:s') . "] Syncing Bandwidth for Tenant Scope: [{$current_tenant}]\n";

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/MikrotikApp.php';
require_once __DIR__ . '/../classes/UsageEngine.php';

// Fetch all active routers
try {
    $routers = safeFetchAll($pdo, "SELECT * FROM " . TBL_ROUTERS);
    if (empty($routers)) {
        echo "  - No routers found for this scope.\n";
        exit;
    }

    foreach ($routers as $r) {
        echo "  Processing Router: {$r['name']} ({$r['ip_address']})\n";
        $res = UsageEngine::syncRouterUsage($pdo, $r);
        
        if ($res['error']) {
            echo "    - Status: Connection Failed. Error: {$res['error']}\n";
        } else {
            echo "    - Status: Online | Sessions: {$res['active_sessions']} | Synced: {$res['synced_sessions']}\n";
            $up_mb = round($res['bytes_uploaded'] / 1048576, 2);
            $down_mb = round($res['bytes_downloaded'] / 1048576, 2);
            echo "    - Traffic Synced: Upload: {$up_mb} MB | Download: {$down_mb} MB\n";
        }
    }
} catch (Exception $e) {
    error_log("Usage Sync Cron Critical Failure ({$current_tenant}): " . $e->getMessage());
    echo "  - Critical Failure: " . $e->getMessage() . "\n";
}

echo "[" . date('Y-m-d H:i:s') . "] Completed Scope: [{$current_tenant}]\n\n";

/**
 * Runs a child process for a specific tenant to prevent global state/constants contamination.
 */
function runTenantSync($tenant = null) {
    $script = __FILE__;
    $command = "php \"" . $script . "\"";
    if ($tenant) {
        $command .= " --tenant=" . escapeshellarg($tenant);
    }
    
    // Execute command and capture output
    $output = shell_exec($command);
    echo $output;
}
