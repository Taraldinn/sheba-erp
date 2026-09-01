<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

echo "<h2>System Logs (Last 10)</h2>";
echo "<table border='1' cellpadding='5'>";
echo "<tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Description</th></tr>";

$stmt = $pdo->query("SELECT * FROM ".TBL_LOGS." ORDER BY id DESC LIMIT 10");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo "<tr>";
    echo "<td>" . htmlspecialchars($row['timestamp']) . "</td>";
    echo "<td>" . htmlspecialchars($row['admin_user']) . "</td>";
    echo "<td>" . htmlspecialchars($row['action_type']) . "</td>";
    echo "<td>" . htmlspecialchars($row['target_id']) . "</td>";
    echo "<td>" . htmlspecialchars($row['description']) . "</td>";
    echo "</tr>";
}
echo "</table>";
?>
