<?php
// tools/migrate_sms_checkout.php
// Run this via browser or CLI to migrate the database for the SMS Checkout feature.

require_once __DIR__ . '/../includes/db_config.php';

echo "<h2>Migrating SMS Checkout System</h2>";

// Connect to MySQL server (assuming we can read DB_HOST, DB_USER, DB_PASS)
try {
    $dsn = "mysql:host=" . DB_HOST . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Get all databases that might be tenants
    $stmt = $pdo->query("SHOW DATABASES");
    $databases = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    foreach ($databases as $db) {
        // Filter system DBs
        if (in_array($db, ['information_schema', 'mysql', 'performance_schema', 'sys'])) continue;
        
        echo "Checking Database: $db<br>";
        $pdo->exec("USE `$db`");
        
        // Check if tenant_payment_gateways exists
        $tableExists = $pdo->query("SHOW TABLES LIKE 'tenant_payment_gateways'")->rowCount() > 0;
        
        if ($tableExists) {
            echo "- Altering tenant_payment_gateways...<br>";
            
            // Add columns safely
            $columnsToAdd = [
                "account_type ENUM('Merchant', 'Personal Retail', 'Personal') DEFAULT 'Personal'",
                "instruction_type ENUM('Payment', 'Send Money') DEFAULT 'Send Money'",
                "display_name VARCHAR(100) DEFAULT ''",
                "qr_image_url VARCHAR(255) NULL",
                "checkout_enabled TINYINT(1) DEFAULT 0",
                "checkout_expiry_mins INT DEFAULT 10",
                "min_amount DECIMAL(10,2) DEFAULT 10.00",
                "max_amount DECIMAL(10,2) DEFAULT 25000.00",
                "auto_activate TINYINT(1) DEFAULT 1"
            ];
            
            foreach ($columnsToAdd as $colDef) {
                // Extract column name
                $colName = explode(' ', $colDef)[0];
                try {
                    $colExists = $pdo->query("SHOW COLUMNS FROM tenant_payment_gateways LIKE '$colName'")->rowCount() > 0;
                    if (!$colExists) {
                        $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN $colDef");
                        echo "&nbsp;&nbsp;+ Added column $colName<br>";
                    }
                } catch (Exception $e) {
                    echo "&nbsp;&nbsp;x Error adding $colName: " . $e->getMessage() . "<br>";
                }
            }
            
            echo "- Creating payment_intents table...<br>";
            $pdo->exec("CREATE TABLE IF NOT EXISTS payment_intents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                public_token VARCHAR(64) NOT NULL UNIQUE,
                tenant_id VARCHAR(50) DEFAULT NULL,
                manager_id INT DEFAULT 0,
                customer_id INT DEFAULT 0,
                entity_type ENUM('customer', 'staff') DEFAULT 'customer',
                invoice_id VARCHAR(50) DEFAULT NULL,
                gateway_id INT NOT NULL,
                gateway_name VARCHAR(20) NOT NULL,
                payer_mobile VARCHAR(20) DEFAULT NULL,
                receiver_mobile VARCHAR(20) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'BDT',
                status ENUM('created', 'waiting', 'processing', 'paid', 'expired', 'cancelled', 'failed', 'review') DEFAULT 'created',
                provider_trx_id VARCHAR(50) DEFAULT NULL,
                matched_sms_log_id INT DEFAULT NULL,
                expires_at DATETIME NOT NULL,
                detected_at DATETIME NULL,
                paid_at DATETIME NULL,
                client_ip VARCHAR(45) NULL,
                user_agent TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX(public_token),
                INDEX(gateway_id),
                INDEX(status),
                INDEX(expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            
            echo "&nbsp;&nbsp;+ Created payment_intents<br>";
        } else {
             echo "- Skipping (not a tenant db or missing tables)<br>";
        }
    }
    
    echo "<h3>Migration Complete!</h3>";
    
} catch (Exception $e) {
    echo "<h3>Migration Failed: " . htmlspecialchars($e->getMessage()) . "</h3>";
}
?>
