<?php
/**
 * cron/vpn_worker.php
 * Core worker for establishing and maintaining PPTP VPN connections.
 * Matches setup_vpn_guide.md and master_vpn_worker.php.
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

// Enable error logging for VPN cron
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../debug_vpn_worker.log');

    // Debug: list tenants
    $tenant_stmt = $pdo->query("SELECT id, name FROM tenants");
    $tenant_list = $tenant_stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Available tenants:\n";
    foreach ($tenant_list as $t) {
        echo "- ID {$t['id']}: {$t['name']}\n";
    }


$tenant_name = defined('TENANT_OVERRIDE') ? TENANT_OVERRIDE : 'main';
$peer_name = "shebafi_vpn_" . $tenant_name;
$peer_path = "/etc/ppp/peers/" . $peer_name;

echo "[" . date('Y-m-d H:i:s') . "] Starting VPN Worker for Tenant '{$tenant_name}'...\n";

try {
// Auto‑add missing columns to tenant_vpn if they do not exist
$requiredColumns = [
    "pptp_username VARCHAR(64) NOT NULL DEFAULT 'vpnuser'",
    "pptp_password VARCHAR(64) NOT NULL DEFAULT 'vpnpass'",
    "olt_lan VARCHAR(32) NOT NULL DEFAULT '172.25.31.0/24'",
    "require_encryption TINYINT(1) DEFAULT 1"
];
foreach ($requiredColumns as $colDef) {
    $colName = preg_split('/\s+/', $colDef)[0];
    $stmt = $pdo->prepare("SHOW COLUMNS FROM " . TBL_TENANT_VPN . " LIKE ?");
    $stmt->execute([$colName]);
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE " . TBL_TENANT_VPN . " ADD COLUMN $colDef");
    }
}

    // 1. Fetch active VPN configuration
    $vpn_debug = $vpn ? $vpn : null;
    if ($vpn_debug) {
        echo "VPN config found: ID {$vpn_debug['id']} status {$vpn_debug['vpn_status']}\n";
    } else {
        echo "DEBUG: No VPN config for tenant '{$tenant_name}'. Listing all tenant_vpn rows:\n";
        $all_vpns = safeFetchAll($pdo, "SELECT * FROM " . TBL_TENANT_VPN);
        foreach ($all_vpns as $row) {
            echo "- ID {$row['id']} tenant_id {$row['tenant_id']} server {$row['pptp_server']} status {$row['vpn_status']}\n";
        }
    }

    if (!$vpn) {
        echo "No VPN configuration found in database.\n";
        exit;
    }

    $vpn_id = $vpn['id'];
    $status = $vpn['vpn_status'];
    $server = $vpn['pptp_server'];
    $user = $vpn['pptp_username'];
    $pass = $vpn['pptp_password'];
    $lan = $vpn['olt_lan'];
    $current_iface = $vpn['ppp_interface'];

    // 2. Handle Disabled Connection
    if ($status === 'disabled') {
        echo "VPN status is disabled. Tearing down connection if active...\n";
        
        // Disconnect pppd
        safe_shell_exec("sudo pkill -f " . escapeshellarg("pppd call " . $peer_name) . " 2>&1");
        safe_shell_exec("sudo poff " . escapeshellarg($peer_name) . " 2>&1");
        
        // Remove static route if it exists
        if (!empty($current_iface)) {
            safe_shell_exec("sudo ip route del " . escapeshellarg($lan) . " dev " . escapeshellarg($current_iface) . " 2>&1");
        }
        
        // Delete peer config
        safe_shell_exec("sudo rm -f " . escapeshellarg($peer_path));
        
        // Update Database state
        $stmt = $pdo->prepare("UPDATE " . TBL_TENANT_VPN . " SET vpn_status = 'disabled', ppp_interface = NULL, error_message = NULL WHERE id = ?");
        $stmt->execute([$vpn_id]);
        
        echo "VPN tunnel torn down and disabled successfully.\n";
        exit;
    }

    // 3. Check current interface status
    $interface_active = false;
    if (!empty($current_iface)) {
        $dev_path = "/sys/class/net/" . $current_iface;
        if (file_exists($dev_path)) {
            // Verify if interface has active IP address binding
            $ip_output = safe_shell_exec("ip addr show dev " . escapeshellarg($current_iface) . " 2>&1");
            if (strpos($ip_output, 'inet ') !== false) {
                $interface_active = true;
            }
        }
    }

    // 4. VPN is active and healthy
    if ($interface_active && ($status === 'connected' || $status === 'connecting')) {
        echo "VPN is active on interface {$current_iface}. Checking static routes...\n";
        
        // Confirm OLT LAN routing exists
        $routes = safe_shell_exec("ip route show");
        if (strpos($routes, $lan) === false) {
            echo "Routing missing. Adding route: {$lan} via {$current_iface}...\n";
            safe_shell_exec("sudo ip route add " . escapeshellarg($lan) . " dev " . escapeshellarg($current_iface));
        } else {
            echo "Routing is active and healthy.\n";
        }
        
        // Maintain connected status
        if ($status !== 'connected') {
            $pdo->prepare("UPDATE " . TBL_TENANT_VPN . " SET vpn_status = 'connected', error_message = NULL WHERE id = ?")->execute([$vpn_id]);
        }
        exit;
    }

    // 5. VPN is disconnected or failed - Attempt Reconnection
    echo "VPN is offline (Status: {$status}). Initiating connection...\n";
    
    // Clear any stale pppd processes for this peer first
    safe_shell_exec("sudo pkill -f " . escapeshellarg("pppd call " . $peer_name) . " 2>&1");
    safe_shell_exec("sudo poff " . escapeshellarg($peer_name) . " 2>&1");
    if (!empty($current_iface)) {
        safe_shell_exec("sudo ip route del " . escapeshellarg($lan) . " dev " . escapeshellarg($current_iface) . " 2>&1");
    }

    $require_encryption = isset($vpn['require_encryption']) ? (int)$vpn['require_encryption'] : 1;

    // Generate fresh peer config
    $config_content = "pty \"pptp " . $server . " --nolaunchpppd\"\n"
                    . "name \"" . $user . "\"\n"
                    . "remotename pptp\n";
                    
    if ($require_encryption) {
        $config_content .= "require-mppe-128\n";
    } else {
        $config_content .= "nomppe\n";
    }

    $config_content .= "require-mschap-v2\n"
                    . "refuse-eap\n"
                    . "refuse-pap\n"
                    . "refuse-chap\n"
                    . "refuse-mschap\n"
                    . "nobsdcomp\n"
                    . "nodeflate\n"
                    . "noauth\n"
                    . "nodefaultroute\n"
                    . "persist\n"
                    . "maxfail 3\n"
                    . "holdoff 5\n"
                    . "ipparam " . $peer_name . "\n";

    // Write to /etc/ppp/peers/shebafi_vpn_{tenant} using secure sudo NOPASSWD tee
    $config_escaped = escapeshellarg($config_content);
    safe_shell_exec("echo {$config_escaped} | sudo tee " . escapeshellarg($peer_path) . " > /dev/null");
    safe_shell_exec("sudo chmod 600 " . escapeshellarg($peer_path));

    // Update chap-secrets for authentication
    update_ppp_secrets($user, $pass);
    // Spawn pppd connection without password argument
    safe_shell_exec("sudo pppd call " . escapeshellarg($peer_name));
    
    // Wait for PPP interface to initialize and bind IP
    $detected_iface = null;
    echo "Waiting for tunnel interface to bind...\n";
    
    for ($attempt = 1; $attempt <= 10; $attempt++) {
        sleep(1);
        $ppp_devices = glob('/sys/class/net/ppp*');
        foreach ($ppp_devices as $dev) {
            $dev_name = basename($dev);
            $ip_output = safe_shell_exec("ip addr show dev " . escapeshellarg($dev_name) . " 2>&1");
            if (strpos($ip_output, 'inet ') !== false) {
                // Confirm this interface corresponds to our connection param
                // In Linux, pppd with ipparam creates a system environment variable or configures routes
                // For safety, the first free ppp interface resolved with an IP is our active tunnel
                $detected_iface = $dev_name;
                break;
            }
        }
        if ($detected_iface) break;
    }

    if ($detected_iface) {
        echo "Tunnel connected successfully on interface: {$detected_iface}!\n";
        
        // Ensure IP forwarding is enabled and persists across reboots
        $sysctl_conf = '/etc/sysctl.conf';
        if (is_readable($sysctl_conf) && is_writable($sysctl_conf)) {
            $conf_content = file_get_contents($sysctl_conf);
            if (strpos($conf_content, 'net.ipv4.ip_forward = 1') === false) {
                safe_shell_exec("sudo bash -c 'echo \"net.ipv4.ip_forward = 1\" >> {$sysctl_conf}'");
            }
            if (strpos($conf_content, 'net.ipv4.conf.all.rp_filter = 0') === false) {
                safe_shell_exec("sudo bash -c 'echo \"net.ipv4.conf.all.rp_filter = 0\" >> {$sysctl_conf}'");
            }
            if (strpos($conf_content, 'net.ipv4.conf.default.rp_filter = 0') === false) {
                safe_shell_exec("sudo bash -c 'echo \"net.ipv4.conf.default.rp_filter = 0\" >> {$sysctl_conf}'");
            }
        }
        safe_shell_exec('sudo sysctl -w net.ipv4.ip_forward=1');
        safe_shell_exec('sudo sysctl -w net.ipv4.conf.all.rp_filter=0');
        safe_shell_exec('sudo sysctl -w net.ipv4.conf.default.rp_filter=0');
        // Detect primary LAN interface (default route interface)
        $primary_iface = trim(safe_shell_exec('ip route list default | awk \'{print $5}\''));
if (!$primary_iface) {
    // Fallback: pick the first non-loopback, non-ppp interface
    $primary_iface = trim(safe_shell_exec("ip -o link show | awk -F': ' '{print $2}' | grep -v '^lo$' | grep -v '^ppp' | head -n1"));
}
if ($primary_iface) {
            // Flush existing NAT and FORWARD rules for this interface to avoid duplicates
            safe_shell_exec("sudo iptables -t nat -D POSTROUTING -o {$detected_iface} -j MASQUERADE 2>/dev/null || true");
            safe_shell_exec("sudo iptables -D FORWARD -i {$primary_iface} -o {$detected_iface} -j ACCEPT 2>/dev/null || true");
            safe_shell_exec("sudo iptables -D FORWARD -i {$detected_iface} -o {$primary_iface} -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true");

            // Add NAT (MASQUERADE) for traffic exiting via the VPN interface
            safe_shell_exec("sudo iptables -t nat -A POSTROUTING -o {$detected_iface} -j MASQUERADE");
            // Allow forwarding from LAN to VPN
            safe_shell_exec("sudo iptables -A FORWARD -i {$primary_iface} -o {$detected_iface} -j ACCEPT");
            // Allow return traffic
            safe_shell_exec("sudo iptables -A FORWARD -i {$detected_iface} -o {$primary_iface} -m state --state ESTABLISHED,RELATED -j ACCEPT");
            safe_shell_exec("sudo iptables -A FORWARD -i {$detected_iface} -o {$primary_iface} -j ACCEPT");
        }

        // Inject static route to local OLT LAN
        echo "Adding static route: {$lan} via {$detected_iface}...\n";
        safe_shell_exec("sudo ip route add " . escapeshellarg($lan) . " dev " . escapeshellarg($detected_iface));
        
        // Save state to Database
        $stmt = $pdo->prepare("UPDATE " . TBL_TENANT_VPN . " SET vpn_status = 'connected', ppp_interface = ?, error_message = NULL, last_connected_at = NOW() WHERE id = ?");
        $stmt->execute([$detected_iface, $vpn_id]);
        
        echo "VPN orchestration completed successfully.\n";
    } else {
        echo "Tunnel negotiation timed out.\n";
        
        // Fetch last 50 lines of syslog or journalctl to log negotiation errors
        $error_log = "PPTP handshake timeout.";
        if (file_exists('/var/log/syslog')) {
            $syslog_lines = safe_shell_exec("tail -n 50 /var/log/syslog | grep pppd");
            if (!empty($syslog_lines)) {
                $error_log = trim($syslog_lines);
            }
        } elseif (file_exists('/var/log/messages')) {
            $syslog_lines = safe_shell_exec("tail -n 50 /var/log/messages | grep pppd");
            if (!empty($syslog_lines)) {
                $error_log = trim($syslog_lines);
            }
        } else {
            // Fallback for systemd journal logs
            $syslog_lines = safe_shell_exec("journalctl -n 50 --no-pager | grep pppd");
            if (!empty($syslog_lines)) {
                $error_log = trim($syslog_lines);
            }
        }
        
        $stmt = $pdo->prepare("UPDATE " . TBL_TENANT_VPN . " SET vpn_status = 'failed', error_message = ?, ppp_interface = NULL WHERE id = ?");
        $stmt->execute([substr($error_log, 0, 500), $vpn_id]);
        
        // Clean up peer config on failure
        safe_shell_exec("sudo pkill -f " . escapeshellarg("pppd call " . $peer_name) . " 2>&1");
        safe_shell_exec("sudo poff " . escapeshellarg($peer_name) . " 2>&1");
        safe_shell_exec("sudo rm -f " . escapeshellarg($peer_path));
    }

} catch (Exception $e) {
    error_log("VPN Worker Exception: " . $e->getMessage());
    echo "Exception: " . $e->getMessage() . "\n";
}
?>
