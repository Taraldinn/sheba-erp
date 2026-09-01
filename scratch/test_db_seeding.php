<?php
require_once __DIR__ . '/../includes/tenant.php';

// Mock DB connection if it fails
$config_file = __DIR__ . '/../includes/db_config.php';
$db_connected = false;
$pdo = null;

if (file_exists($config_file)) {
    include $config_file;
    if (defined('DB_HOST') && defined('DB_NAME') && defined('DB_USER') && defined('DB_PASS')) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8";
            $pdo = new PDO($dsn, DB_USER, DB_PASS);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $db_connected = true;
            echo "Successfully connected to DB: " . DB_NAME . "\n";
        } catch (Exception $e) {
            echo "Mock Mode: Database connection could not be established (" . $e->getMessage() . "). Proceeding with dry-run/simulation.\n";
        }
    }
} else {
    echo "Mock Mode: db_config.php not found. Proceeding with dry-run/simulation.\n";
}

$configFile = __DIR__ . '/../olt new/olts_config.json';
if (!file_exists($configFile)) {
    echo "Error: olt new/olts_config.json does not exist.\n";
    exit(1);
}

$jsonContent = file_get_contents($configFile);
$olts = json_decode($jsonContent, true);

if (!is_array($olts)) {
    echo "Error: Failed to decode json file.\n";
    exit(1);
}

echo "Found " . count($olts) . " OLTs in olt new/olts_config.json:\n\n";

foreach ($olts as $index => $olt) {
    $ip = $olt['ip'] ?? '';
    $brand = $olt['type'] ?? 'vsol_epon';
    $user = $olt['username'] ?? '';
    $pass = $olt['password'] ?? '';
    $telnet_port = intval($olt['port'] ?? 23);
    $snmp_community = $olt['snmp_community'] ?? 'public';
    $timeout = intval($olt['timeout'] ?? 10);
    $enabled = isset($olt['enabled']) ? ($olt['enabled'] ? 1 : 0) : 1;
    
    $name = isset($olt['name']) ? $olt['name'] : ('OLT-' . $ip);
    $port = 80;
    $protocol = 'http';
    
    echo "[$index] IP: $ip | Brand/Type: $brand | User: $user | Pass: $pass | Port: $telnet_port | Enabled: $enabled\n";
    
    if ($db_connected && $pdo) {
        try {
            // Check if OLT with this IP already exists
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM olts WHERE ip = ?");
            $stmt->execute([$ip]);
            $exists = $stmt->fetchColumn();
            
            if (!$exists) {
                $insertStmt = $pdo->prepare("INSERT INTO olts (staff_id, name, ip, port, protocol, telnet_port, user, pass, brand, snmp_community, timeout, enabled) VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $res = $insertStmt->execute([$name, $ip, $port, $protocol, $telnet_port, $user, $pass, $brand, $snmp_community, $timeout, $enabled]);
                echo "  -> SUCCESS: Inserted OLT into DB.\n";
            } else {
                echo "  -> SKIP: OLT already exists in DB.\n";
            }
        } catch (Exception $e) {
            echo "  -> ERROR: Failed to insert/check DB (" . $e->getMessage() . ")\n";
        }
    } else {
        echo "  -> SIMULATION: Would insert into DB table 'olts'\n";
    }
}
?>
