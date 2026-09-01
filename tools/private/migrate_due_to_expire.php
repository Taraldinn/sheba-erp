<?php
/**
 * Database Migration Script: Rename 'Due' to 'Expire'
 * This script updates the 'status' and 'bill_position' columns in the 'users' table.
 */

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

echo "Starting migration: Renaming 'Due' to 'Expire' in users table...\n";

try {
    // 1. Update 'status' column
    $stmt1 = $pdo->prepare("UPDATE " . TBL_USERS . " SET status = 'Expire' WHERE status = 'Due'");
    $stmt1->execute();
    $count1 = $stmt1->rowCount();
    echo "Updated $count1 records where status was 'Due' to 'Expire'.\n";

    // 2. Update 'bill_position' column
    $stmt2 = $pdo->prepare("UPDATE " . TBL_USERS . " SET bill_position = 'Expire' WHERE bill_position = 'Due'");
    $stmt2->execute();
    $count2 = $stmt2->rowCount();
    echo "Updated $count2 records where bill_position was 'Due' to 'Expire'.\n";

    echo "Migration completed successfully.\n";

} catch (Exception $e) {
    echo "ERROR during migration: " . $e->getMessage() . "\n";
    exit(1);
}
?>
