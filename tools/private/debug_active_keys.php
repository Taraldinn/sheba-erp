<?php
/**
 * debug_active_keys.php
 * Diagnostic script to dump raw MikroTik active session and interface fields.
 * Open this in your browser: http://your-billing-domain/debug_active_keys.php
 */

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/classes/MikrotikApp.php';

// Prevent caching
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

echo "<h2>MikroTik Active Session Keys Diagnosis</h2>";

try {
    $routers = safeFetchAll($pdo, "SELECT * FROM " . TBL_ROUTERS);
    if (empty($routers)) {
        die("<p style='color:red;'>No routers found in the database.</p>");
    }

    foreach ($routers as $r) {
        echo "<div style='border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; border-radius: 8px; font-family: monospace;'>";
        echo "<h3>Router: " . htmlspecialchars($r['name']) . " (" . htmlspecialchars($r['ip_address']) . ")</h3>";
        
        $mk = new MikrotikApp($r, 5);
        if ($mk->isOnline()) {
            echo "<p style='color:green;'>Status: Online</p>";
            
            // 1. Try standard /ppp/active/print without any custom options (known to work)
            try {
                $client = new RouterOS\Client([
                    'host' => $r['ip_address'], 
                    'user' => $r['username'], 
                    'pass' => $r['api_password'], 
                    'port' => (int)$r['port'], 
                    'ssl' => (bool)$r['use_ssl'], 
                    'timeout' => 5,
                    'attempts' => 1
                ]);
                
                $active = $client->query(new RouterOS\Query('/ppp/active/print'))->read();
                echo "<p><b>Standard /ppp/active/print</b> returned " . count($active) . " sessions. First session keys:</p>";
                if (!empty($active)) {
                    echo "<pre style='background: #f8f9fa; padding: 10px; border: 1px solid #ddd;'>";
                    print_r($active[0]);
                    echo "</pre>";
                } else {
                    echo "<p style='color:orange;'>No active sessions found.</p>";
                }
                
                // 2. Try /interface/print to see if stats are returned by default or with =stats=
                $iface_q = new RouterOS\Query('/interface/print');
                $iface_q->add('=stats=');
                $interfaces = $client->query($iface_q)->read();
                echo "<p><b>/interface/print with =stats=</b> returned " . count($interfaces) . " interfaces. First interface keys:</p>";
                if (!empty($interfaces)) {
                    echo "<pre style='background: #f8f9fa; padding: 10px; border: 1px solid #ddd;'>";
                    print_r($interfaces[0]);
                    echo "</pre>";
                    
                    // Show a few PPPoE dynamic interfaces if present
                    $pppoe_ifaces = [];
                    foreach ($interfaces as $if) {
                        if (isset($if['name']) && (strpos($if['name'], 'pppoe') !== false || strpos($if['name'], '<') !== false)) {
                            $pppoe_ifaces[] = $if;
                            if (count($pppoe_ifaces) >= 3) break;
                        }
                    }
                    if (!empty($pppoe_ifaces)) {
                        echo "<p>Sample PPPoE interface stats:</p>";
                        echo "<pre style='background: #e9ecef; padding: 10px; border: 1px solid #ccc;'>";
                        print_r($pppoe_ifaces);
                        echo "</pre>";
                    }
                } else {
                    echo "<p style='color:orange;'>No interfaces returned with =stats=.</p>";
                }
                
            } catch (Exception $e) {
                echo "<p style='color:red;'>API Error: " . htmlspecialchars($e->getMessage()) . "</p>";
            }
            
        } else {
            echo "<p style='color:red;'>Status: Offline. Error: " . htmlspecialchars($mk->error ?? 'Unknown error') . "</p>";
        }
        echo "</div>";
    }
} catch (Exception $e) {
    echo "<p style='color:red;'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
}
?>
