<?php
$dbs = ['shebafi_master', 'shebafi_minhaj', 'shebafi_ripa1'];
foreach ($dbs as $db) {
    try {
        $p = new PDO("mysql:host=127.0.0.1;dbname=$db;charset=utf8", 'root', '');
        $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // check if table exists
        $tableExists = false;
        try {
            $p->query("SELECT 1 FROM tenant_payment_gateways LIMIT 1");
            $tableExists = true;
        } catch (Exception $e) {
            // Table doesn't exist
        }
        
        if ($tableExists) {
            $rows = $p->query("SELECT * FROM tenant_payment_gateways")->fetchAll(PDO::FETCH_ASSOC);
            echo "Database $db has " . count($rows) . " gateways:\n";
            print_r($rows);
        } else {
            echo "Database $db: tenant_payment_gateways table does not exist.\n";
        }
    } catch (Exception $e) {
        echo "Database $db Error: " . $e->getMessage() . "\n";
    }
}
?>
