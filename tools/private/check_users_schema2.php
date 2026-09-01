<?php
require_once __DIR__ . '/includes/config.php';
try {
    $stmt = $pdo->query("DESCRIBE " . TBL_USERS);
    $cols = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $cols[] = $row['Field'];
    }
    file_put_contents(__DIR__ . '/debug_cols.txt', json_encode($cols));
} catch (Exception $e) {
    file_put_contents(__DIR__ . '/debug_cols.txt', "Error: " . $e->getMessage());
}
