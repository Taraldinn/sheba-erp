<?php
/**
 * cron/master_vpn_worker.php
 * Master orchestrator for Multi-Tenant PPTP VPN Management.
 * Styled after master_cron.php. It loops through all active SaaS tenants
 * and triggers vpn_worker.php for each.
 * 
 * Usage (Single-pass Cron):
 * php cron/master_vpn_worker.php
 * 
 * Usage (Spawn all tenants as background daemons):
 * php cron/master_vpn_worker.php --daemon --interval=10
 */

$base_dir = dirname(__DIR__);
$tenants_dir = $base_dir . '/includes/tenants';
$worker_script = __DIR__ . '/vpn_worker.php';

// Detect CLI arguments
$is_daemon = false;
$interval = 10;
$argv_str = '';

if (isset($argv)) {
    foreach ($argv as $arg) {
        if ($arg === '--daemon') {
            $is_daemon = true;
            $argv_str .= ' --daemon';
        }
        if (strpos($arg, '--interval=') === 0) {
            $interval = intval(substr($arg, 11));
            $argv_str .= ' ' . $arg;
        }
    }
}

echo "[" . date('Y-m-d H:i:s') . "] Starting Master VPN Worker (Multi-Tenant)...\n";
echo "Worker script: {$worker_script}\n";

// 1. Process Main System
echo "--------------------------------------------------\n";
echo "Executing Main System VPN Worker...\n";

// Detect PHP executable path (standard Linux binary or Windows mock path)
$php_bin = 'php';
if (stripos(PHP_OS, 'WIN') !== false) {
    if (file_exists('c:\xampp3\php\php.exe')) {
        $php_bin = 'c:\xampp3\php\php.exe';
    }
}

if ($is_daemon) {
    if (stripos(PHP_OS, 'WIN') !== false) {
        // Windows background process spawning (mock)
        $cmd = sprintf("start /B \"\" %s %s%s", escapeshellarg($php_bin), escapeshellarg($worker_script), $argv_str);
        pclose(popen($cmd, "r"));
    } else {
        // Linux background process spawning
        $cmd = sprintf("%s %s%s > /dev/null 2>&1 &", escapeshellarg($php_bin), escapeshellarg($worker_script), $argv_str);
        shell_exec($cmd);
    }
    echo "  Main VPN Worker spawned in background.\n";
} else {
    $cmd = sprintf("%s %s", escapeshellarg($php_bin), escapeshellarg($worker_script));
    passthru($cmd);
}

// 2. Process All SaaS Tenants
if (is_dir($tenants_dir)) {
    $tenant_files = glob($tenants_dir . '/*.php');
    foreach ($tenant_files as $file) {
        $tenant_name = basename($file, '.php');
        if ($tenant_name === '.htaccess') continue;
        
        echo "--------------------------------------------------\n";
        echo "Executing Tenant VPN Worker: {$tenant_name}...\n";
        
        if ($is_daemon) {
            if (stripos(PHP_OS, 'WIN') !== false) {
                // Windows background process spawning (mock)
                $cmd = sprintf("start /B \"\" %s %s --tenant=%s%s", escapeshellarg($php_bin), escapeshellarg($worker_script), escapeshellarg($tenant_name), $argv_str);
                pclose(popen($cmd, "r"));
            } else {
                // Linux background process spawning
                $cmd = sprintf("%s %s --tenant=%s%s > /dev/null 2>&1 &", escapeshellarg($php_bin), escapeshellarg($worker_script), escapeshellarg($tenant_name), $argv_str);
                shell_exec($cmd);
            }
            echo "  Tenant '{$tenant_name}' VPN Worker spawned in background.\n";
        } else {
            $cmd = sprintf("%s %s --tenant=%s", escapeshellarg($php_bin), escapeshellarg($worker_script), escapeshellarg($tenant_name));
            passthru($cmd);
        }
    }
}

echo "--------------------------------------------------\n";
echo "[" . date('Y-m-d H:i:s') . "] Master VPN Worker execution completed.\n";
?>
