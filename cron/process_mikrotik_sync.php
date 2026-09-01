<?php
/**
 * cron/process_mikrotik_sync.php
 * Background MikroTik sync worker.
 * Synchronizes users that need activation on MikroTik routers without blocking the web interface.
 */

// Check for tenant override from CLI arguments or HTTP GET
if (isset($_GET['tenant'])) {
    define('TENANT_OVERRIDE', preg_replace('/[^a-zA-Z0-9-]/', '', $_GET['tenant']));
} elseif (isset($argv)) {
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
require_once __DIR__ . '/../classes/MikrotikApp.php';

// Enable error logging for cron
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../debug_mikrotik_sync_cron.log');

try {
    // Fetch users needing sync
    $stmt = $pdo->prepare("SELECT * FROM " . TBL_USERS . " WHERE needs_sync = 1");
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($users)) {
        exit;
    }
    
    // Group users by router_id
    $grouped_users = [];
    foreach ($users as $u) {
        if ($u['router_id']) {
            $grouped_users[$u['router_id']][] = $u;
        } else {
            // No router assigned, mark as synced immediately
            $pdo->prepare("UPDATE " . TBL_USERS . " SET needs_sync = 0 WHERE id = ?")->execute([$u['id']]);
        }
    }
    
    // Fetch services to map profiles
    $services_map = [];
    $s_stmt = $pdo->query("SELECT id, name, mikrotik_profile_name FROM " . TBL_SERVICES);
    while ($row = $s_stmt->fetch(PDO::FETCH_ASSOC)) {
        $services_map[trim($row['name'])] = $row['mikrotik_profile_name'];
    }
    
    // Perform sync per router
    foreach ($grouped_users as $router_id => $router_users) {
        $r_data = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id = ?", [$router_id]);
        if (!$r_data) {
            // Router does not exist anymore, mark users as synced
            $ids = array_map(function($u) { return $u['id']; }, $router_users);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $pdo->prepare("UPDATE " . TBL_USERS . " SET needs_sync = 0 WHERE id IN ($placeholders)")->execute($ids);
            continue;
        }
        
        $mk = new MikrotikApp($r_data, 10);
        if ($mk->isOnline()) {
            foreach ($router_users as $u) {
                $pkg_name = trim($u['user_package']);
                $profile = $services_map[$pkg_name] ?? '';
                
                try {
                    $res = $mk->toggle($u['user_id'], true, $profile, $u['password']);
                    // If toggle succeeded, mark as synced
                    $pdo->prepare("UPDATE " . TBL_USERS . " SET needs_sync = 0 WHERE id = ?")->execute([$u['id']]);
                } catch (Exception $e) {
                    error_log("MikroTik sync error for user {$u['user_id']} on router {$r_data['name']}: " . $e->getMessage());
                }
            }
        } else {
            error_log("Router {$r_data['name']} is offline. Skipping sync for " . count($router_users) . " users until next run.");
        }
    }
} catch (Exception $e) {
    error_log("MikroTik sync background process general error: " . $e->getMessage());
}
?>
