<?php
// debug_db_check.php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/includes/db.php';

echo "Database Host: " . DB_HOST . "\n";
echo "Database Name: " . DB_NAME . "\n";

try {
    echo "--- Tables ---\n";
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    print_r($tables);

    $store_tables = ['store_categories', 'store_products', 'store_sales', 'store_support_devices'];
    foreach ($store_tables as $table) {
        echo "\n--- Schema of $table ---\n";
        if (in_array($table, $tables)) {
            $cols = $pdo->query("DESCRIBE `$table`")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($cols as $col) {
                echo "  {$col['Field']} - {$col['Type']} - Null: {$col['Null']} - Key: {$col['Key']} - Default: {$col['Default']}\n";
            }
        } else {
            echo "  TABLE DOES NOT EXIST!\n";
        }
    }
    
    // Check writeLog
    echo "\n--- Checking TBL_LOGS (" . TBL_LOGS . ") ---\n";
    if (defined('TBL_LOGS') && in_array(TBL_LOGS, $tables)) {
        $cols = $pdo->query("DESCRIBE `" . TBL_LOGS . "`")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cols as $col) {
            echo "  {$col['Field']} - {$col['Type']} - Null: {$col['Null']} - Key: {$col['Key']} - Default: {$col['Default']}\n";
        }
    } else {
        echo "  Audit log table not found!\n";
    }

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
?>
