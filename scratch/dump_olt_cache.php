<?php
// scratch/dump_olt_cache.php
$host = 'localhost';
$db = 'shebafi_ripa1';
$user = 'shebafi_ripa1';
$pass = 'ripaonline1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    echo "Running OLTManager migration...\n";
    require_once __DIR__ . '/../classes/OLTManager.php';
    $oltMgr = new OLTManager($pdo);
    echo "Migration completed.\n";

    $stmt = $pdo->query("SELECT id, name, brand, onu_cache FROM olts");
    while ($row = $stmt->fetch()) {
        echo "OLT ID: {$row['id']} | Name: {$row['name']} | Brand: {$row['brand']}\n";
        if (empty($row['onu_cache'])) {
            echo "ONU Cache is empty!\n";
        } else {
            $cache = json_decode($row['onu_cache'], true);
            echo "Total ONUs in cache: " . count($cache) . "\n";
            $found_interface = null;
            $any_mactable = [];
            foreach ($cache as $onu) {
                if ($onu['interface'] === '1:2') {
                    $found_interface = $onu;
                }
                if (!empty($onu['mactable'])) {
                    $any_mactable[] = $onu['interface'] . " (Count: " . count($onu['mactable']) . ")";
                }
            }
            if ($found_interface) {
                echo "Interface 1:2 details in cache:\n";
                print_r($found_interface);
            } else {
                echo "Interface 1:2 not found in cache!\n";
            }
            echo "ONUs with non-empty mactable: " . implode(', ', $any_mactable) . "\n";
            
            if (!empty($cache)) {
                echo "Sample ONU cache structure:\n";
                print_r($cache[0]);
            }
        }
        echo "-------------------------------------------\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
