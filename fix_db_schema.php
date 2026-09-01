<?php
require 'includes/config.php';
require 'includes/functions.php';

// Only allow logged in admin
if (!isset($_SESSION['user_id'])) { die("Login required"); }

try {
    echo "<h3>Fixing Database Schema...</h3>";

    // Fix TBL_TX type column length
    echo "Modifying TBL_TX 'type' column length to VARCHAR(50)... ";
    $pdo->exec("ALTER TABLE ".TBL_TX." MODIFY type VARCHAR(50)");
    echo "<span style='color:green'>Done</span><br>";

    // Fix TBL_TX method column length (just in case)
    echo "Modifying TBL_TX 'method' column length to VARCHAR(50)... ";
    $pdo->exec("ALTER TABLE ".TBL_TX." MODIFY method VARCHAR(50)");
    echo "<span style='color:green'>Done</span><br>";

    echo "<h3>Schema Update Complete.</h3>";

} catch (PDOException $e) {
    echo "<div style='color:red'>Error: " . $e->getMessage() . "</div>";
}
