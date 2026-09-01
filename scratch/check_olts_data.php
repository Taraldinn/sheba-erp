<?php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../classes/OLTManager.php';

$oltMgr = new OLTManager($pdo);
$olts = $oltMgr->getAllOLTs();

echo "=== REGISTERED OLTS ===\n";
foreach ($olts as $o) {
    echo "ID: {$o['id']} | Name: {$o['name']} | IP: {$o['ip']} | Brand: {$o['brand']} | Last Sync: {$o['last_sync']}\n";
    if (!empty($o['onu_cache'])) {
        $cache = json_decode($o['onu_cache'], true);
        if (is_array($cache)) {
            echo "  Cached ONUs count: " . count($cache) . "\n";
            $has_macs = 0;
            foreach ($cache as $onu) {
                if (!empty($onu['mactable'])) {
                    $has_macs++;
                }
            }
            echo "  ONUs with bridged MACs in cache: $has_macs\n";
            
            // Print a sample ONU with mactable if exists
            foreach ($cache as $onu) {
                if (!empty($onu['mactable'])) {
                    echo "  Sample ONU with mactable: Interface: {$onu['interface']} | MAC: {$onu['mac']} | MacTable: " . json_encode($onu['mactable']) . "\n";
                    break;
                }
            }
        } else {
            echo "  onu_cache is not valid JSON.\n";
        }
    } else {
        echo "  onu_cache is empty.\n";
    }
    echo "--------------------------------------------------\n";
}
?>
