<?php
/**
 * Automatically builds olt_monitor.php from classes/OLTManager.php
 * and appends the JSON-based OLTManager class.
 */

$sourceFile = __DIR__ . '/../classes/OLTManager.php';
if (!file_exists($sourceFile)) {
    die("Error: Source file classes/OLTManager.php not found.\n");
}

$sourceCode = file_get_contents($sourceFile);

// Extract the OLTMonitor class
// Find start of OLTMonitor class definition
$classStartPos = strpos($sourceCode, 'class OLTMonitor {');
if ($classStartPos === false) {
    die("Error: class OLTMonitor not found in classes/OLTManager.php\n");
}

// Find the end of OLTMonitor class definition
// OLTMonitor class ends just before OLTManager class starts
$managerClassStartPos = strpos($sourceCode, 'class OLTManager {');
if ($managerClassStartPos === false) {
    die("Error: class OLTManager not found in classes/OLTManager.php\n");
}

// Extract OLTMonitor class content
$oltMonitorCode = substr($sourceCode, $classStartPos, $managerClassStartPos - $classStartPos);

// Clean up/Adjust OLTMonitor code
// Modify log file path to write to local directory in standalone panel
$oltMonitorCode = str_replace(
    "\$this->log_file = __DIR__ . '/../debug_log.txt';",
    "\$this->log_file = 'olt_monitor.log';",
    $oltMonitorCode
);

// Define the JSON-based OLTManager class
$jsonManagerCode = <<<'CODE'

// OLT Manager Class (JSON configuration based)
class OLTManager {
    private $config_file;
    private $olts;
    
    public function __construct($config_file = 'olts_config.json') {
        $this->config_file = $config_file;
        $this->olts = array();
        $this->load_config();
    }
    
    private function load_config() {
        if (file_exists($this->config_file)) {
            $content = file_get_contents($this->config_file);
            $this->olts = json_decode($content, true);
            if (!is_array($this->olts)) $this->olts = array();
        }
    }
    
    private function save_config() {
        file_put_contents($this->config_file, json_encode($this->olts, JSON_PRETTY_PRINT));
    }
    
    public function add_olt($olt_type, $ip, $username, $password, $snmp_community = 'public', $port = 23, $timeout = 10) {
        foreach ($this->olts as $olt) {
            if ($olt['ip'] === $ip) return false;
        }
        $this->olts[] = array(
            'type' => $olt_type, 'ip' => $ip, 'username' => $username, 'password' => $password,
            'snmp_community' => $snmp_community, 'port' => $port, 'timeout' => $timeout,
            'enabled' => true, 'added_date' => date('Y-m-d H:i:s')
        );
        $this->save_config();
        return true;
    }
    
    public function update_olt($ip, $data) {
        foreach ($this->olts as $key => $olt) {
            if ($olt['ip'] === $ip) {
                $this->olts[$key] = array_merge($olt, $data);
                $this->save_config();
                return true;
            }
        }
        return false;
    }
    
    public function remove_olt($ip) {
        $new_olts = array();
        $found = false;
        foreach ($this->olts as $olt) {
            if ($olt['ip'] === $ip) { $found = true; continue; }
            $new_olts[] = $olt;
        }
        if ($found) { $this->olts = $new_olts; $this->save_config(); return true; }
        return false;
    }
    
    public function get_olts() { return $this->olts; }
    
    public function test_olt_connection($ip) {
        foreach ($this->olts as $olt) {
            if ($olt['ip'] === $ip) {
                $monitor = new OLTMonitor($olt['type'], $olt['ip'], $olt['username'], $olt['password'], 
                    isset($olt['snmp_community']) ? $olt['snmp_community'] : 'public',
                    isset($olt['port']) ? $olt['port'] : 23,
                    isset($olt['timeout']) ? $olt['timeout'] : 5);
                return $monitor->test_connection();
            }
        }
        return false;
    }
}
CODE;

// Construct full file content
$compiledCode = "<?php\nset_time_limit(0);\nignore_user_abort(true);\n/**\n * OLT Monitor Classes for ISP OLT Monitoring System\n * Automatically generated from classes/OLTManager.php\n */\n\n" . trim($oltMonitorCode) . "\n\n" . $jsonManagerCode . "\n";

// Write to olt new/olt_monitor.php
$dest1 = __DIR__ . '/../olt new/olt_monitor.php';
file_put_contents($dest1, $compiledCode);
echo "Successfully compiled to: $dest1\n";

// Write to shebafiolt/olt_monitor.php
$dest2 = __DIR__ . '/../shebafiolt/olt_monitor.php';
file_put_contents($dest2, $compiledCode);
echo "Successfully compiled to: $dest2\n";

?>
