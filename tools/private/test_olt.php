<?php
require_once 'includes/config.php';
require_once 'classes/OLTManager.php';
$oltMgr = new OLTManager($pdo);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

try {
    $data = [
        'name' => 'Test OLT',
        'ip_address' => '1.1.1.1',
        'port' => 80,
        'brand' => 'Generic',
        'http_scheme' => 'http'
    ];
    $res = $oltMgr->addOLT($data);
    echo "Result: " . ($res ? "Success" : "Failure") . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
