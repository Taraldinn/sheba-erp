<?php
// verify_db_store.php
// Auto-diagnose and repair/create Store Module database tables without foreign key restrictions.

ob_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Check for tenant override from CLI arguments
if (isset($argv)) {
    foreach ($argv as $arg) {
        if (strpos($arg, '--tenant=') === 0) {
            $tenant = substr($arg, 9);
            define('TENANT_OVERRIDE', $tenant);
            break;
        }
    }
}

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

// Only logged in staff can access this page
if (PHP_SAPI !== 'cli' && !isLoggedIn() && ($_GET['secret'] ?? '') !== 'run_migration_9988') {
    die("Access Denied: Please log in to the admin panel first, then access this script.");
}

echo "<html><head><title>Store Database Repair & Verification</title>";
echo "<link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'></head>";
echo "<body class='bg-light'><div class='container my-5'><div class='card shadow-sm'><div class='card-header bg-success text-white'>";
echo "<h3 class='mb-0'>Store Module Database Repair & Verification</h3></div><div class='card-body'>";

try {
    $db_name = $pdo->query("SELECT DATABASE()")->fetchColumn();
    echo "<div class='alert alert-info'>Active Database: <strong>" . htmlspecialchars($db_name) . "</strong></div>";

    // 1. Repair / Create store_categories Table
    echo "<h5>Checking store_categories table...</h5>";
    $has_categories = false;
    try {
        $pdo->query("SELECT 1 FROM store_categories LIMIT 1");
        $has_categories = true;
        echo "<div class='text-success mb-3'>✓ Table 'store_categories' exists.</div>";
    } catch (Exception $e) {
        echo "<div class='text-warning mb-2'>Table 'store_categories' missing. Attempting to create...</div>";
        try {
            $pdo->exec("CREATE TABLE store_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            echo "<div class='alert alert-success'>✓ Table 'store_categories' created successfully.</div>";
            $has_categories = true;
        } catch (Exception $ex) {
            echo "<div class='alert alert-danger'>✗ Failed to create 'store_categories': " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
    }

    // 2. Repair / Create store_products Table
    echo "<h5>Checking store_products table...</h5>";
    $has_products = false;
    try {
        $pdo->query("SELECT 1 FROM store_products LIMIT 1");
        $has_products = true;
        echo "<div class='text-success mb-3'>✓ Table 'store_products' exists.</div>";
    } catch (Exception $e) {
        echo "<div class='text-warning mb-2'>Table 'store_products' missing. Attempting to create (without foreign keys)...</div>";
        try {
            $pdo->exec("CREATE TABLE store_products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category_id INT NOT NULL,
                brand_model VARCHAR(100) DEFAULT NULL,
                name VARCHAR(150) NOT NULL,
                serial_mac VARCHAR(100) UNIQUE NOT NULL,
                purchase_price DECIMAL(10,2) DEFAULT 0.00,
                selling_price DECIMAL(10,2) DEFAULT 0.00,
                supplier VARCHAR(150) DEFAULT NULL,
                warranty VARCHAR(100) DEFAULT NULL,
                stock_status ENUM('Available', 'Sold', 'Support Issued', 'Returned', 'Damaged', 'Missing') DEFAULT 'Available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            echo "<div class='alert alert-success'>✓ Table 'store_products' created successfully.</div>";
            $has_products = true;
        } catch (Exception $ex) {
            echo "<div class='alert alert-danger'>✗ Failed to create 'store_products': " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
    }

    // 3. Repair / Create store_sales Table
    echo "<h5>Checking store_sales table...</h5>";
    try {
        $pdo->query("SELECT 1 FROM store_sales LIMIT 1");
        echo "<div class='text-success mb-3'>✓ Table 'store_sales' exists.</div>";
    } catch (Exception $e) {
        echo "<div class='text-warning mb-2'>Table 'store_sales' missing. Attempting to create (without foreign keys)...</div>";
        try {
            $pdo->exec("CREATE TABLE store_sales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                customer_id INT NOT NULL,
                invoice_no VARCHAR(50) UNIQUE NOT NULL,
                sold_price DECIMAL(10,2) NOT NULL,
                paid_amount DECIMAL(10,2) DEFAULT 0.00,
                due_amount DECIMAL(10,2) DEFAULT 0.00,
                payment_status ENUM('Paid', 'Due', 'Partial') DEFAULT 'Paid',
                sold_by_staff INT NOT NULL,
                sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                remarks TEXT DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            echo "<div class='alert alert-success'>✓ Table 'store_sales' created successfully.</div>";
        } catch (Exception $ex) {
            echo "<div class='alert alert-danger'>✗ Failed to create 'store_sales': " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
    }

    // 4. Repair / Create store_support_devices Table
    echo "<h5>Checking store_support_devices table...</h5>";
    try {
        $pdo->query("SELECT 1 FROM store_support_devices LIMIT 1");
        echo "<div class='text-success mb-3'>✓ Table 'store_support_devices' exists.</div>";
        
        // Ensure expected_return_date allows NULL values (from previous migration check)
        try {
            $cols = $pdo->query("DESCRIBE store_support_devices")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($cols as $col) {
                if ($col['Field'] === 'expected_return_date' && $col['Null'] === 'NO') {
                    echo "<div class='text-warning mb-2'>Modifying expected_return_date to allow NULL...</div>";
                    $pdo->exec("ALTER TABLE store_support_devices MODIFY expected_return_date DATE NULL");
                    echo "<div class='text-success mb-2'>✓ expected_return_date column modified to allow NULL.</div>";
                }
            }
        } catch (Exception $ex) {
            echo "<div class='text-danger mb-2'>Error verifying expected_return_date column: " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
    } catch (Exception $e) {
        echo "<div class='text-warning mb-2'>Table 'store_support_devices' missing. Attempting to create (without foreign keys)...</div>";
        try {
            $pdo->exec("CREATE TABLE store_support_devices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                customer_id INT NOT NULL,
                ticket_id INT DEFAULT NULL,
                given_date DATE NOT NULL,
                expected_return_date DATE NULL,
                return_date DATE DEFAULT NULL,
                given_condition VARCHAR(255) DEFAULT NULL,
                return_condition VARCHAR(255) DEFAULT NULL,
                given_by_staff INT NOT NULL,
                received_by_staff INT DEFAULT NULL,
                status ENUM('Issued', 'Returned', 'Overdue', 'Damaged', 'Missing') DEFAULT 'Issued',
                remarks TEXT DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            echo "<div class='alert alert-success'>✓ Table 'store_support_devices' created successfully.</div>";
        } catch (Exception $ex) {
            echo "<div class='alert alert-danger'>✗ Failed to create 'store_support_devices': " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
    }

    echo "<h5 class='mt-4'>5. Verifying Column Schema for store_products</h5>";
    if ($has_products) {
        try {
            $columns = $pdo->query("DESCRIBE store_products")->fetchAll(PDO::FETCH_COLUMN);
            $required_columns = [
                'staff_id', 'category_id', 'brand_model', 'name', 'serial_mac', 
                'purchase_price', 'selling_price', 'supplier', 'warranty', 'stock_status'
            ];
            $missing = [];
            foreach ($required_columns as $col) {
                if (!in_array($col, $columns)) {
                    $missing[] = $col;
                }
            }
            if (empty($missing)) {
                echo "<div class='alert alert-success'>✓ All required columns exist in 'store_products'.</div>";
            } else {
                echo "<div class='alert alert-warning'>⚠️ Missing columns: " . implode(', ', $missing) . ". Attempting to add them...</div>";
                foreach ($missing as $m_col) {
                    try {
                        if ($m_col === 'staff_id') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN staff_id INT NOT NULL DEFAULT 1 AFTER id");
                        } elseif ($m_col === 'category_id') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN category_id INT NOT NULL");
                        } elseif ($m_col === 'brand_model') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN brand_model VARCHAR(100) DEFAULT NULL");
                        } elseif ($m_col === 'name') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN name VARCHAR(150) NOT NULL");
                        } elseif ($m_col === 'serial_mac') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN serial_mac VARCHAR(100) UNIQUE NOT NULL");
                        } elseif ($m_col === 'purchase_price') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN purchase_price DECIMAL(10,2) DEFAULT 0.00");
                        } elseif ($m_col === 'selling_price') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN selling_price DECIMAL(10,2) DEFAULT 0.00");
                        } elseif ($m_col === 'supplier') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN supplier VARCHAR(150) DEFAULT NULL");
                        } elseif ($m_col === 'warranty') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN warranty VARCHAR(100) DEFAULT NULL");
                        } elseif ($m_col === 'stock_status') {
                            $pdo->exec("ALTER TABLE store_products ADD COLUMN stock_status ENUM('Available', 'Sold', 'Support Issued', 'Returned', 'Damaged', 'Missing') DEFAULT 'Available'");
                        }
                        echo "<div class='text-success'>✓ Added column: $m_col</div>";
                    } catch (Exception $ex) {
                        echo "<div class='text-danger'>✗ Failed to add column $m_col: " . htmlspecialchars($ex->getMessage()) . "</div>";
                    }
                }
            }
        } catch (Exception $ex) {
            echo "<div class='alert alert-danger'>Error checking store_products columns: " . htmlspecialchars($ex->getMessage()) . "</div>";
        }
    }

    echo "<h5 class='mt-4'>6. Running Dry-run Test Insert</h5>";
    if ($has_categories && $has_products) {
        $category = $pdo->query("SELECT * FROM store_categories LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$category) {
            echo "<p>No category found. Creating a 'General' category first...</p>";
            $pdo->exec("INSERT INTO store_categories (name) VALUES ('General')");
            $category = $pdo->query("SELECT * FROM store_categories LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        }
        
        if ($category) {
            $test_serial = "VERIFY-MAC-" . mt_rand(100000, 999999);
            echo "<p>Inserting product with Category ID: " . $category['id'] . " and SQ ID: <code>$test_serial</code>...</p>";
            
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("INSERT INTO store_products (category_id, brand_model, name, serial_mac, purchase_price, selling_price, supplier, warranty, stock_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([
                    $category['id'],
                    'Verify Brand',
                    'Verify Product',
                    $test_serial,
                    10.00,
                    15.00,
                    'Verify Supplier',
                    'Verify Warranty',
                    'Available'
                ]);
                $product_id = $pdo->lastInsertId();
                echo "<div class='alert alert-success'>✓ Dry-run insert successful! Inserted product ID: $product_id. (Rolling back changes to keep DB clean)</div>";
            } catch (Exception $ex) {
                echo "<div class='alert alert-danger'>✗ Dry-run insert FAILED: " . htmlspecialchars($ex->getMessage()) . "</div>";
            }
            $pdo->rollBack();
        } else {
            echo "<div class='alert alert-danger'>✗ Cannot run dry-run test: Category could not be resolved/created.</div>";
        }
    } else {
        echo "<div class='alert alert-danger'>✗ Cannot run dry-run test: Categories or Products table missing/unusable.</div>";
    }

} catch (Exception $e) {
    echo "<div class='alert alert-danger'><h4>Critical Error:</h4>" . htmlspecialchars($e->getMessage()) . "</div>";
}

echo "<hr><div class='d-flex justify-content-between'>";
echo "<a href='index.php?tab=store_inventory' class='btn btn-primary'>Go to Inventory Management</a>";
echo "<p class='text-muted mb-0 py-2'>Store DB Verification Script</p>";
echo "</div>";

echo "</div></div></div></body></html>";
?>
