<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

echo "<h2>Staff List & Emails</h2>";
echo "<table border='1' cellpadding='5'>";
echo "<tr><th>ID</th><th>Username</th><th>Name</th><th>Email (in Database)</th><th>Role</th></tr>";

$stmt = $pdo->query("SELECT id, username, name, email, role FROM ".TBL_STAFF);
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo "<tr>";
    echo "<td>" . htmlspecialchars($row['id']) . "</td>";
    echo "<td>" . htmlspecialchars($row['username']) . "</td>";
    echo "<td>" . htmlspecialchars($row['name']) . "</td>";
    
    $email = $row['email'];
    if (empty($email)) {
        echo "<td style='color:red;'>[EMPTY] - Password Reset will NOT work for this user</td>";
    } else {
        echo "<td style='color:green;'>" . htmlspecialchars($email) . "</td>";
    }
    
    echo "<td>" . htmlspecialchars($row['role']) . "</td>";
    echo "</tr>";
}
echo "</table>";
echo "<p>To use 'Forgot Password', the email you enter must MATCH the email in this list associated with your account.</p>";
?>
