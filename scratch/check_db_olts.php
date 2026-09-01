<?php
// scratch/check_db_olts.php
$host = 'localhost';
$db = 'shebafi_ripa1';
$user = 'shebafi_ripa1';
$pass = 'ripaonline1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $stmt = $pdo->query("SELECT * FROM olts");
    $rows = $stmt->fetchAll();
    echo "Total OLTs: " . count($rows) . "\n";
    foreach ($rows as $r) {
        unset($r['onu_cache']); // hide cache for brevity
        print_r($r);
        echo "===========================================\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
