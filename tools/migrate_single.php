<?php
require_once __DIR__ . '/../includes/db_config.php';

echo "Migrating single DB...<br>";

try {
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $tableExists = $pdo->query("SHOW TABLES LIKE 'tenant_payment_gateways'")->rowCount() > 0;
    
    if ($tableExists) {
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
            $colName = explode(' ', $colDef)[0];
            try {
                $colExists = $pdo->query("SHOW COLUMNS FROM tenant_payment_gateways LIKE '$colName'")->rowCount() > 0;
                if (!$colExists) {
                    $pdo->exec("ALTER TABLE tenant_payment_gateways ADD COLUMN $colDef");
                    echo "+ Added $colName<br>";
                }
            } catch (Exception $e) {
                echo "x Error adding $colName: " . $e->getMessage() . "<br>";
            }
        }
        
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
        
        echo "+ Created payment_intents<br>";
    }
    echo "Done.<br>";
} catch (Exception $e) {
    echo "Failed: " . $e->getMessage() . "<br>";
}
