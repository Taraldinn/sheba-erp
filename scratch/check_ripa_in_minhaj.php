<?php
$dbs = ['shebafi_master', 'shebafi_minhaj', 'shebafi_ripa1'];
foreach ($dbs as $db) {
    try {
        $p = new PDO("mysql:host=127.0.0.1;dbname=$db;charset=utf8", "root", "");
        $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $rows = $p->query("SELECT id, username, role FROM staff WHERE username LIKE '%ripa%'")->fetchAll(PDO::FETCH_ASSOC);
        echo "Database $db staff records matching ripa:\n";
        print_r($rows);
    } catch (Exception $e) {
        echo "Database $db Error: " . $e->getMessage() . "\n";
    }
}
?>
