<?php
require_once 'includes/config.php';

echo "--- TBL_STAFF Schema ---\n";
try {
    $stmt = $pdo->query("DESCRIBE " . TBL_STAFF);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        print_r($row);
    }
} catch (Exception $e) {
    echo "Error describing table: " . $e->getMessage() . "\n";
}

echo "\n--- Staff Count by Status ---\n";
try {
    $stmt = $pdo->query("SELECT status, COUNT(*) as count FROM " . TBL_STAFF . " GROUP BY status");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        print_r($row);
    }
} catch (Exception $e) {
    echo "Error counting by status: " . $e->getMessage() . "\n";
}

echo "\n--- Recent Staff Members ---\n";
try {
    $stmt = $pdo->query("SELECT id, name, username, status, role, parent_id FROM " . TBL_STAFF . " ORDER BY id DESC LIMIT 5");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        print_r($row);
    }
} catch (Exception $e) {
    echo "Error fetching recent staff: " . $e->getMessage() . "\n";
}
