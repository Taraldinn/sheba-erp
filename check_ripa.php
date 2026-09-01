<?php
$host = 'localhost';
$db   = 'shebafi_minhaj';
$user = 'shebafi_minhaj';
$pass = 'Mother519466@';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
     
     echo "Checking 'beeonline':\n";
     $stmt = $pdo->prepare("SELECT id, subdomain, name, status FROM tenants WHERE subdomain = 'beeonline'");
     $stmt->execute();
     print_r($stmt->fetch());
     
     $stmt = $pdo->prepare("SELECT * FROM api_tokens WHERE tenant_id = (SELECT id FROM tenants WHERE subdomain = 'beeonline')");
     $stmt->execute();
     echo "Tokens for beeonline: " . count($stmt->fetchAll()) . "\n";

     echo "\nChecking 'ripa':\n";
     $stmt = $pdo->prepare("SELECT id, subdomain, name, status FROM tenants WHERE subdomain = 'ripa'");
     $stmt->execute();
     $ripa = $stmt->fetch();
     if ($ripa) {
         print_r($ripa);
         $stmt = $pdo->prepare("SELECT * FROM api_tokens WHERE tenant_id = ?");
         $stmt->execute([$ripa['id']]);
         $tokens = $stmt->fetchAll();
         echo "Tokens for ripa: " . count($tokens) . "\n";
     } else {
         echo "Tenant 'ripa' NOT FOUND in 'tenants' table.\n";
     }
     
} catch (\PDOException $e) {
     echo "DB Error: " . $e->getMessage();
}
