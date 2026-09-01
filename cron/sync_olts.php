<?php
/**
 * cron/sync_olts.php
 * Synchronizes OLT ONU data with database cache.
 * Respects an 8-hour sync interval per OLT.
 */

// Check for tenant override from CLI arguments
if (isset($argv)) {
    foreach ($argv as $arg) {
        if (strpos($arg, '--tenant=') === 0) {
            $tenant = substr($arg, 9);
            define('TENANT_OVERRIDE', $tenant);
            break;
        }
    }
}

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/OLTManager.php';

// Enable error logging for cron
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../debug_cron_olt.log');

echo "[" . date('Y-m-d H:i:s') . "] Starting OLT ONU Sync...\n";

$oltMgr = new OLTManager($pdo);
$olts = $oltMgr->getAllOLTs();

foreach ($olts as $olt) {
    // Check if enabled column exists and is false
    if (isset($olt['enabled']) && !$olt['enabled']) {
        echo "  - OLT {$olt['name']} ({$olt['ip']}) is disabled. Skipping.\n";
        continue;
    }

    $last_sync = !empty($olt['last_sync']) ? strtotime($olt['last_sync']) : 0;
    $time_since_sync = time() - $last_sync;

    $is_web = (($olt['mode'] ?? 'telnet') === 'web' || $olt['brand'] === 'hsgq_epon');
    $sync_interval = $is_web ? 600 : 28800;

    // Check if interval has passed
    if ($time_since_sync < $sync_interval) {
        if ($is_web) {
            $mins_left = round(($sync_interval - $time_since_sync) / 60, 1);
            echo "  - OLT {$olt['name']} ({$olt['ip']}) web-synced {$mins_left}m ago. Skipping.\n";
        } else {
            $hours_left = round((28800 - $time_since_sync) / 3600, 1);
            echo "  - OLT {$olt['name']} ({$olt['ip']}) synced {$hours_left}h ago. Skipping.\n";
        }
        continue;
    }

    echo "  * Syncing OLT {$olt['name']} ({$olt['ip']})...\n";
    try {
        $onus = $oltMgr->getConnectedONUs($olt['id'], true);
        if (is_array($onus) && !isset($onus['error'])) {
            echo "    -> Success: Synced " . count($onus) . " ONUs.\n";
        } else {
            $err = $onus['error'] ?? 'Unknown Error';
            echo "    -> Failed: " . $err . "\n";
            error_log("OLT Sync Error for OLT ID {$olt['id']} ({$olt['ip']}): " . $err);
        }
    } catch (Exception $e) {
        echo "    -> Exception: " . $e->getMessage() . "\n";
        error_log("OLT Sync Exception for OLT ID {$olt['id']} ({$olt['ip']}): " . $e->getMessage());
    }
}

echo "[" . date('Y-m-d H:i:s') . "] OLT ONU Sync Complete.\n";
