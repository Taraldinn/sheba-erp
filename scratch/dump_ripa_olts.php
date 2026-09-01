<?php
$host = 'localhost';
$db = 'shebafi_ripa1';
$user = 'shebafi_ripa1';
$pass = 'ripaonline1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    echo "Connected successfully to shebafi_ripa1!\n";

    $stmt = $pdo->query("SELECT id, name, brand, onu_cache, last_sync FROM olts");
    $olts = $stmt->fetchAll();
    
    foreach ($olts as $olt) {
        echo "OLT ID: " . $olt['id'] . " | Name: " . $olt['name'] . " | Brand: " . $olt['brand'] . " | Last Sync: " . $olt['last_sync'] . "\n";
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
            
            $bridgedMacs = [];
            if (!empty($onu['mactable'])) {
                foreach ($onu['mactable'] as $mObj) {
                    $bridgedMacs[] = $mObj['mac'];
                }
            }
            
            echo "   -> ONU: " . $onu['interface'] . " | MAC: " . $onu['mac'] . " | State: " . $onu['state'] . "\n";
            if (!empty($bridgedMacs)) {
                echo "      Bridged MACs: " . implode(', ', $bridgedMacs) . "\n";
            } else {
                echo "      [No Bridged MACs]\n";
            }
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
