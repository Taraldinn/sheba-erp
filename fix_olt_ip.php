<?php
require_once __DIR__ . '/includes/db.php';
$stmt = $pdo->prepare("UPDATE olts SET ip_address = '103.135.253.112' WHERE ip_address LIKE '%:2712%'");
if ($stmt->execute()) {
    echo "Successfully updated " . $stmt->rowCount() . " OLTs.";
} else {
    echo "Update failed.";
}
?>
