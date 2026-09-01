<?php
// debug_store.php
// Diagnostic page to verify store database tables and dry-run product addition.

ob_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

// Only logged in staff can access this page
if (!isLoggedIn()) {
    die("Access Denied: Please log in first.");
}

echo "<html><head><title>Store Module Debugger</title>";
echo "<link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'></head>";
echo "<body class='bg-light'><div class='container my-5'><div class='card shadow-sm'><div class='card-header bg-primary text-white'>";
echo "<h3 class='mb-0'>Store Module Database Diagnostics</h3></div><div class='card-body'>";

try {
    echo "<h5>1. Checking Database Constants</h5>";
    echo "<ul>";
    echo "<li>TBL_STORE_CATEGORIES: " . (defined('TBL_STORE_CATEGORIES') ? TBL_STORE_CATEGORIES : 'UNDEFINED') . "</li>";
    echo "<li>TBL_STORE_PRODUCTS: " . (defined('TBL_STORE_PRODUCTS') ? TBL_STORE_PRODUCTS : 'UNDEFINED') . "</li>";
    echo "<li>TBL_STORE_SALES: " . (defined('TBL_STORE_SALES') ? TBL_STORE_SALES : 'UNDEFINED') . "</li>";
    echo "<li>TBL_STORE_SUPPORT: " . (defined('TBL_STORE_SUPPORT') ? TBL_STORE_SUPPORT : 'UNDEFINED') . "</li>";
    echo "</ul>";

    echo "<h5 class='mt-4'>2. Checking Database Connection & Active Database</h5>";
    $db_name = $pdo->query("SELECT DATABASE()")->fetchColumn();
    echo "<div class='alert alert-success'>Connected successfully to database: <strong>" . htmlspecialchars($db_name) . "</strong></div>";

    echo "<h5 class='mt-4'>3. Verifying Tables and Schema</h5>";
    $tables = ['store_categories', 'store_products', 'store_sales', 'store_support_devices'];
    
    foreach ($tables as $table) {
        echo "<div class='mb-3 p-3 border rounded bg-white'>";
        echo "<h6>Table: <strong>$table</strong></h6>";
        
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE '$table'");
            $exists = $stmt->rowCount() > 0;
            
            if ($exists) {
                echo "<span class='badge bg-success mb-2'>Exists</span>";
                
                // Show columns
                $cols = $pdo->query("DESCRIBE `$table`")->fetchAll(PDO::FETCH_ASSOC);
                echo "<table class='table table-sm table-striped mt-2' style='font-size: 0.85rem;'>";
                echo "<thead><tr><th>Field</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th><th>Extra</th></tr></thead>";
                echo "<tbody>";
                foreach ($cols as $col) {
                    echo "<tr>";
                    echo "<td><code>" . htmlspecialchars($col['Field']) . "</code></td>";
                    echo "<td>" . htmlspecialchars($col['Type']) . "</td>";
                    echo "<td>" . htmlspecialchars($col['Null']) . "</td>";
                    echo "<td>" . htmlspecialchars($col['Key']) . "</td>";
                    echo "<td>" . htmlspecialchars($col['Default']) . "</td>";
                    echo "<td>" . htmlspecialchars($col['Extra']) . "</td>";
                    echo "</tr>";
                }
                echo "</tbody></table>";
            } else {
                echo "<span class='badge bg-danger'>MISSING</span>";
            }
        } catch (Exception $ex) {
            echo "<div class='alert alert-danger'>Error checking table $table: " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
        echo "</div>";
    }

    echo "<h5 class='mt-4'>4. Dry-run Add Product Test</h5>";
    // Check if we have at least one category
    $category = $pdo->query("SELECT * FROM store_categories LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$category) {
        echo "<div class='alert alert-warning'>No categories found in <code>store_categories</code>. Please add a category first. Trying to auto-create a 'Test Category' for this test...</div>";
        try {
            $pdo->query("INSERT INTO store_categories (name) VALUES ('Test Category')");
            $category = $pdo->query("SELECT * FROM store_categories LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            echo "<div class='alert alert-success'>Successfully created Test Category! ID: " . $category['id'] . "</div>";
        } catch (Exception $ex) {
            echo "<div class='alert alert-danger'>Failed to auto-create category: " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
    }

    if ($category) {
        echo "<p>Using Category ID: " . $category['id'] . " (" . htmlspecialchars($category['name']) . ")</p>";
        
        $test_serial = "TEST-MAC-" . mt_rand(100000, 999999);
        echo "<p>Attempting to insert product with SQ ID (serial_mac): <code>$test_serial</code>...</p>";
        
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("INSERT INTO store_products (category_id, brand_model, name, serial_mac, purchase_price, selling_price, supplier, warranty, stock_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $category['id'],
                'Test Brand',
                'Test Product Name',
                $test_serial,
                100.00,
                150.00,
                'Test Supplier',
                '1 Year',
                'Available'
            ]);
            
            $product_id = $pdo->lastInsertId();
            echo "<div class='alert alert-success'>Successfully inserted product! ID: $product_id. (Transaction will be rolled back so database stays clean)</div>";
        } catch (Exception $ex) {
            echo "<div class='alert alert-danger'><strong>INSERT FAILED:</strong> " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
        $pdo->rollBack();
    } else {
        echo "<div class='alert alert-danger'>Cannot run product insert test without a category.</div>";
    }

} catch (Exception $e) {
    echo "<div class='alert alert-danger'><h4>Critical Error:</h4>" . htmlspecialchars($e->getMessage()) . "</div>";
}

echo "</div></div></div></body></html>";
?>
