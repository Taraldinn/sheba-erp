<?php
require 'includes/config.php';
$stmt = $pdo->prepare('SELECT * FROM users WHERE user_id = ? OR id = ?');
$stmt->execute(['ashiktest', 0]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if ($user) {
    echo "USER_FOUND: " . $user['user_id'] . "\n";
    print_r($user);
} else {
    echo "USER_NOT_FOUND\n";
    // List some users to see what they look like
    $stmt = $pdo->query('SELECT user_id FROM users LIMIT 5');
    echo "Recent users:\n";
    print_r($stmt->fetchAll(PDO::FETCH_COLUMN));
}
