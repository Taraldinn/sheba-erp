<?php
// scratch/inspect_rx0002.php
$host = 'localhost';
$db = 'shebafi_ripa1';
$user = 'shebafi_ripa1';
$pass = 'ripaonline1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Check columns of users table
    $q = $pdo->query("DESCRIBE users");
    $columns = $q->fetchAll(PDO::FETCH_COLUMN);
    echo "Columns in users table:\n" . implode(", ", $columns) . "\n\n";

    // Query RX0002
    $stmt = $pdo->prepare("SELECT * FROM users WHERE user_id = 'RX0002'");
    $stmt->execute();
    $userRow = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($userRow) {
        echo "User RX0002 Info:\n";
        foreach ($userRow as $key => $val) {
            if (stripos($key, 'mac') !== false || in_array($key, ['id', 'user_id', 'name', 'status', 'onu_mac'])) {
                echo "  $key: " . json_encode($val) . "\n";
            }
        }
    } else {
        echo "User RX0002 not found in shebafi_ripa1!\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
