<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;charset=utf8", "root", "");
    echo "Connected as root.\n";
    
    // Create database shebafi_beeonline if not exists (for potential testing)
    $pdo->exec("CREATE DATABASE IF NOT EXISTS shebafi_beeonline");
    echo "Database shebafi_beeonline created or exists.\n";
    
    // List of users to create
    $users = [
        ['user' => 'shebafi_ripa1', 'pass' => 'Mother519466@', 'db' => 'shebafi_ripa1'],
        ['user' => 'shebafi_beeonline', 'pass' => 'Mother519466@', 'db' => 'shebafi_beeonline'],
        ['user' => 'shebafi_minhaj', 'pass' => 'Mother519466@', 'db' => 'shebafi_minhaj']
    ];
    
    foreach ($users as $u) {
        $username = $u['user'];
        $password = $u['pass'];
        $db = $u['db'];
        
        // Create user
        $pdo->exec("CREATE USER IF NOT EXISTS '$username'@'localhost' IDENTIFIED BY '$password'");
        $pdo->exec("CREATE USER IF NOT EXISTS '$username'@'127.0.0.1' IDENTIFIED BY '$password'");
        
        // Grant privileges
        $pdo->exec("GRANT ALL PRIVILEGES ON `$db`.* TO '$username'@'localhost'");
        $pdo->exec("GRANT ALL PRIVILEGES ON `$db`.* TO '$username'@'127.0.0.1'");
        
        echo "Created and granted privileges to $username on $db\n";
    }
    
    $pdo->exec("FLUSH PRIVILEGES");
    echo "Privileges flushed successfully.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
