<?php
require_once __DIR__ . '/includes/config.php';
try {
    $stmt = $pdo->query("DESCRIBE " . TBL_USERS);
    $cols = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $cols[] = $row['Field'];
    }
    echo json_encode($cols);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
