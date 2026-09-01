<?php
// scratch/mock_onu_cache.php
$host = 'localhost';
$db = 'shebafi_ripa1';
$user = 'shebafi_ripa1';
$pass = 'ripaonline1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $mock_onus = [
        [
            'interface' => '1:2',
            'mac' => '4C:46:D1:1A:4F:21',
            'model' => 'VSOL_EPON',
            'state' => 'Connect',
            'status' => 'active',
            'rx_power' => '-15.51',
            'tx_power' => '1.47',
            'temp' => '45.66',
            'voltage' => '3.28',
            'signal_quality' => 'Good',
            'uptime' => '1d2h3m',
            'mactable' => [
                [
                    'mac' => 'BC62:CE08:32EC',
                    'vlan' => '671'
                ]
            ]
        ]
    ];

    $cache_json = json_encode($mock_onus);
    
    $stmt = $pdo->prepare("UPDATE olts SET onu_cache = ?, last_sync = NOW() WHERE id = 3");
    $stmt->execute([$cache_json]);
    
    echo "Successfully updated OLT ID 3 with mock ONU cache!\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
