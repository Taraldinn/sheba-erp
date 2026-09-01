<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

ini_set('session.cookie_secure', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax'
]);

session_start();

echo "User Role Session Check:\n";
echo "Session user_role: " . ($_SESSION['user_role'] ?? 'NOT SET') . "\n";
echo "Session admin_id: " . ($_SESSION['admin_id'] ?? 'NOT SET') . "\n";
echo "hasRole('Admin'): " . (hasRole('Admin') ? 'YES' : 'NO') . "\n";
?>
