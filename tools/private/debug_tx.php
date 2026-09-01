<?php
require 'includes/config.php';
require 'includes/functions.php';

// Only allow logged in admin
if (!isset($_SESSION['user_id'])) { die("Login required"); }

echo "<h3>Last 20 Transactions</h3>";
echo "<table border='1' cellpadding='5'>";
echo "<tr><th>ID</th><th>Staff ID</th><th>Type</th><th>Amount</th><th>Desc</th><th>Method</th><th>Run Balance</th><th>Run Due</th><th>Time</th></tr>";

$stmt = $pdo->query("SELECT * FROM ".TBL_TX." ORDER BY id DESC LIMIT 20");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo "<tr>";
    echo "<td>{$row['id']}</td>";
    echo "<td>{$row['staff_id']}</td>";
    echo "<td>{$row['type']}</td>";
    echo "<td>{$row['amount']}</td>";
    echo "<td>{$row['description']}</td>";
    echo "<td>{$row['method']}</td>";
    echo "<td>" . ($row['running_balance'] ?? 'NULL') . "</td>";
    echo "<td>" . ($row['running_due'] ?? 'NULL') . "</td>";
    echo "<td>{$row['created_at']}</td>";
    echo "</tr>";
}
echo "</table>";
