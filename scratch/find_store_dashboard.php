<?php
echo "--- views/dashboard/dashboard.php ---\n";
$lines1 = file(__DIR__ . '/../views/dashboard/dashboard.php');
foreach ($lines1 as $i => $line) {
    if (stripos($line, 'store') !== false || stripos($line, 'support') !== false) {
        echo ($i + 1) . ': ' . trim($line) . "\n";
    }
}

echo "\n--- views/profile.php ---\n";
$lines2 = file(__DIR__ . '/../views/profile.php');
foreach ($lines2 as $i => $line) {
    if (stripos($line, 'store') !== false || stripos($line, 'support') !== false || stripos($line, 'warranty') !== false) {
        // Output a max of 20 matches to avoid overwhelming output
        echo ($i + 1) . ': ' . trim($line) . "\n";
    }
}
?>
