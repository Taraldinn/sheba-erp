<?php
require_once dirname(__DIR__) . '/../includes/db_config.php';
try {
    $masterPdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
    
    // Update the database name, user, and password for the Ripa/Billing tenant
    $stmt = $masterPdo->prepare("UPDATE tenants SET db_name = 'shebafi_ripa1', db_user = 'shebafi_ripa1', db_pass = 'ripaonline1' WHERE id = 2 OR name = 'ripa' OR name = 'billing'");
    $stmt->execute();
    
    if ($stmt->rowCount() > 0) {
        echo "<h2>Successfully fixed! The master database now correctly points to 'shebafi_ripa1' with the password 'ripaonline1'.</h2>";
        echo "<p>You can now test your Postman request again.</p>";
    } else {
        echo "<h2>No rows updated. Trying to verify if already correct:</h2>";
        $check = $masterPdo->query("SELECT db_name, db_user, db_pass FROM tenants WHERE id=2")->fetch();
        print_r($check);
    }
} catch (PDOException $e) {
    echo "Error updating master database: " . $e->getMessage();
}
?>
