<?php
require_once __DIR__ . '/../includes/db_config.php';

try {
    $dsn = "mysql:host=127.0.0.1;port=3306;dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    echo "Connected successfully to " . DB_NAME . " on port 3306!\n";

    $stmt = $pdo->query("SELECT id, name, brand, onu_cache FROM olts");
    $olts = $stmt->fetchAll();
    
    foreach ($olts as $olt) {
        echo "OLT ID: " . $olt['id'] . " | Name: " . $olt['name'] . " | Brand: " . $olt['brand'] . "\n";
        if (empty($olt['onu_cache'])) {
            echo "   [Cache is Empty]\n";
            continue;
        }
        
        $onus = json_decode($olt['onu_cache'], true);
        if (!is_array($onus)) {
            echo "   [Cache is Invalid JSON]\n";
            continue;
        }
        
        echo "   Total ONUs in cache: " . count($onus) . "\n";
        
        foreach ($onus as $onu) {
            $cleanOnuMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $onu['mac']));
            
            $hasBridgedTarget = false;
            $bridgedMacs = [];
            if (!empty($onu['mactable'])) {
                foreach ($onu['mactable'] as $mObj) {
                    $bridgedMacs[] = $mObj['mac'];
                    $cleanB = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $mObj['mac']));
                    if (strpos($cleanB, 'BC62CE') !== false) {
                        $hasBridgedTarget = true;
                    }
                }
            }
            
            if ($hasBridgedTarget || strpos($cleanOnuMac, 'BC62CE') !== false || strpos($cleanOnuMac, '4C46D1') !== false) {
                echo "   -> ONU: " . $onu['interface'] . " | MAC: " . $onu['mac'] . " | State: " . $onu['state'] . "\n";
                echo "      Bridged MACs: " . implode(', ', $bridgedMacs) . "\n";
                if (!empty($onu['mactable'])) {
                    echo "      Raw mactable: " . json_encode($onu['mactable']) . "\n";
                }
            }
        }
    }
} catch (Exception $e) {
    echo "Error querying database: " . $e->getMessage() . "\n";
}
