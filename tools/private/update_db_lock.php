<?php
require_once 'includes/config.php';

echo "Updating Database Schema for Reseller Lock Feature...\n";

try {
    // 1. Update TBL_STAFF
    $cols = $pdo->query("DESCRIBE ".TBL_STAFF)->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('lock_status', $cols)) {
        $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN lock_status ENUM('None','Panel','Full') DEFAULT 'None'");
        echo "Added 'lock_status' to ".TBL_STAFF."\n";
    }
    if (!in_array('lock_note', $cols)) {
        $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN lock_note TEXT DEFAULT NULL");
        echo "Added 'lock_note' to ".TBL_STAFF."\n";
    }

    // 2. Update TBL_USERS
    $cols_u = $pdo->query("DESCRIBE ".TBL_USERS)->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('is_parent_locked', $cols_u)) {
        $pdo->exec("ALTER TABLE ".TBL_USERS." ADD COLUMN is_parent_locked TINYINT(1) DEFAULT 0");
        echo "Added 'is_parent_locked' to ".TBL_USERS."\n";
    }
    
    echo "Database Update Completed Successfully.\n";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
