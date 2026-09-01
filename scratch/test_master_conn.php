<?php
// Test master DB connection exactly as logic.php does
$envPath = __DIR__ . '/../api/.env';
$masterHost = '127.0.0.1'; $masterDb = ''; $masterUser = ''; $masterPass = '';
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name); $value = trim($value);
        if ($name == 'MASTER_DB_HOST') $masterHost = $value;
        if ($name == 'MASTER_DB_NAME') $masterDb = $value;
        if ($name == 'MASTER_DB_USER') $masterUser = $value;
        if ($name == 'MASTER_DB_PASS') $masterPass = $value;
    }
    echo "Loaded from api/.env:\n";
    echo "  Host: $masterHost\n";
    echo "  DB:   $masterDb\n";
    echo "  User: $masterUser\n";
    echo "  Pass: " . str_repeat('*', strlen($masterPass)) . "\n\n";
} else {
    echo "api/.env not found!\n";
}

try {
    $masterPdo = new PDO("mysql:host=$masterHost;dbname=$masterDb;charset=utf8", $masterUser, $masterPass);
    $masterPdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $masterPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "✅ Master DB Connection SUCCESSFUL!\n";
    
    // Check tenants table
    $masterPdo->exec("CREATE TABLE IF NOT EXISTS tenants (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, subdomain VARCHAR(50) UNIQUE NOT NULL, db_name VARCHAR(50) NOT NULL, db_user VARCHAR(50) NOT NULL, db_pass VARCHAR(100) NOT NULL, hmac_secret VARCHAR(100) NOT NULL, status ENUM('active', 'suspended') DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    $count = $masterPdo->query("SELECT COUNT(*) FROM tenants")->fetchColumn();
    echo "✅ 'tenants' table ready. Rows: $count\n";
} catch (Exception $e) {
    echo "❌ Master DB Connection FAILED: " . $e->getMessage() . "\n";
}
