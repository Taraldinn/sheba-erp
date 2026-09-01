<?php
require_once 'includes/config.php';
require_once 'includes/functions.php';

header('Content-Type: text/plain');
echo "Database: " . DB_NAME . "\n";
$keys = ['bkash_app_key', 'bkash_app_secret', 'bkash_username', 'bkash_password', 'bkash_sandbox'];
foreach ($keys as $key) {
    $val = get_opt($pdo, $key, 'NOT_SET');
    echo "$key: $val\n";
}
