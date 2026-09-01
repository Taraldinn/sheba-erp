<?php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../classes/OLTManager.php';

echo "=== INITIALIZING OLT MANAGER ===\n";
$mgr = new OLTManager($pdo);

$count = count($mgr->getAllOLTs());
echo "Current OLT Count in DB: $count\n";

if ($count === 0) {
    echo "SUCCESS: Auto-seeding was skipped! OLT isolation is fully active.\n";
} else {
    echo "WARNING: OLTs were found in database.\n";
}
?>
