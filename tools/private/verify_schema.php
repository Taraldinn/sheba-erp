<?php
require_once 'includes/config.php';
echo "--- TBL_STAFF Schema After Fix ---\n";
try {
    // Run migration just in case
    $pdo->exec("ALTER TABLE ".TBL_STAFF." ADD COLUMN can_undo_recharge TINYINT(1) DEFAULT 0");
    echo "Migration script ran.\n";
    
    $stmt = $pdo->query("DESCRIBE " . TBL_STAFF);
    $found = false;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if ($row['Field'] === 'can_undo_recharge') {
            echo "FOUND: can_undo_recharge column exists!\n";
            print_r($row);
            $found = true;
        }
    }
    if (!$found) {
        echo "ERROR: can_undo_recharge column NOT found!\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
