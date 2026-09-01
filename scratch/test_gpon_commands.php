<?php
/**
 * Interactive/CLI Debug Tool for VSOL GPON OLT
 * Run this on the VPS to test telnet commands and output parsing.
 */

// Load database configuration to fetch OLTs
$db_config = __DIR__ . '/../includes/db_config.php';
if (!file_exists($db_config)) {
    die("Database config not found at: $db_config\n");
}
include $db_config;

try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (Exception $e) {
    die("Database Connection Error: " . $e->getMessage() . "\n");
}

// Fetch VSOL GPON OLTs
$stmt = $pdo->query("SELECT * FROM olts WHERE brand = 'vsol_gpon' OR brand = 'vsol' OR brand LIKE '%gpon%'");
$olts = $stmt->fetchAll();

if (empty($olts)) {
    die("No GPON OLTs found in the database. Please make sure they are seeded first.\n");
}

echo "Select an OLT to debug:\n";
foreach ($olts as $idx => $olt) {
    echo "[" . ($idx + 1) . "] ID: {$olt['id']} | Name: {$olt['name']} | IP: {$olt['ip']} | Type/Brand: {$olt['brand']}\n";
}

$choice = 1; // Default to first OLT
if (count($olts) > 1) {
    echo "Enter selection [1-" . count($olts) . "]: ";
    $fp = fopen('php://stdin', 'r');
    $input = trim(fgets($fp));
    fclose($fp);
    if (is_numeric($input) && isset($olts[$input - 1])) {
        $choice = intval($input);
    }
}

$olt = $olts[$choice - 1];
echo "\nDebugging OLT: {$olt['name']} ({$olt['ip']})\n";

require_once __DIR__ . '/../classes/OLTManager.php';

// Instantiate the custom monitor class directly to test Telnet
class DebugOLTMonitor extends OLTManager {
    public function debug_scan() {
        echo "Testing Telnet Connection...\n";
        if (!$this->telnet_connect()) {
            echo "FAILED to connect to telnet!\n";
            return;
        }
        echo "CONNECTED to telnet successfully!\n\n";

        // Test Method A
        echo "========================================\n";
        echo "TESTING METHOD A (show onu state all):\n";
        echo "========================================\n";
        $this->execute_command("interface gpon 0/1", 2);
        $outputA = $this->execute_command("show onu state all", 10);
        $this->execute_command("exit", 1);
        echo "Output Length: " . strlen($outputA) . " bytes\n";
        echo "--- Raw Output Preview (First 500 chars) ---\n";
        echo substr($outputA, 0, 500) . "\n";
        echo "--------------------------------------------\n\n";

        // Test Method B
        echo "========================================\n";
        echo "TESTING METHOD B (show onu status pon 1):\n";
        echo "========================================\n";
        $outputB = $this->execute_command("show onu status pon 1", 5);
        echo "Output Length: " . strlen($outputB) . " bytes\n";
        echo "--- Raw Output Preview (First 500 chars) ---\n";
        echo substr($outputB, 0, 500) . "\n";
        echo "--------------------------------------------\n\n";

        // Test OPM-Diag
        echo "========================================\n";
        echo "TESTING OPTICAL POWER (show onu opm-diag pon 1):\n";
        echo "========================================\n";
        $outputC = $this->execute_command("show onu opm-diag pon 1", 5);
        echo "Output Length: " . strlen($outputC) . " bytes\n";
        echo "--- Raw Output Preview (First 500 chars) ---\n";
        echo substr($outputC, 0, 500) . "\n";
        echo "--------------------------------------------\n\n";

        // Test RX-Power Fallback
        echo "========================================\n";
        echo "TESTING OPTICAL POWER FALLBACK (Show pon onu all rx-power):\n";
        echo "========================================\n";
        $this->execute_command("interface gpon 0/1", 2);
        $outputD = $this->execute_command("Show pon onu all rx-power", 5);
        $this->execute_command("exit", 1);
        echo "Output Length: " . strlen($outputD) . " bytes\n";
        echo "--- Raw Output Preview (First 500 chars) ---\n";
        echo substr($outputD, 0, 500) . "\n";
        echo "--------------------------------------------\n\n";

        $this->telnet_disconnect();
    }
}

// Map db fields
$username = $olt['username'] ?? 'admin';
$password = $olt['password'] ?? 'admin';
$community = $olt['snmp_community'] ?? 'public';
$port = $olt['port'] ?? 23;

$monitor = new DebugOLTMonitor($olt['brand'], $olt['ip'], $username, $password, $community, $port);
$monitor->debug_scan();
?>
