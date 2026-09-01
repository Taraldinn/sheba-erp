<?php
$lines = file('g:/Shebafi/Sheba 22 MAY 2026/views/profile.php');
foreach ($lines as $i => $line) {
    if (stripos($line, 'recharge') !== false || stripos($line, 'status') !== false || stripos($line, 'action') !== false) {
        if (strpos($line, '<form') !== false || strpos($line, 'btn') !== false || strpos($line, '$_POST') !== false || strpos($line, '$_GET') !== false) {
            echo ($i + 1) . ": " . trim($line) . "\n";
        }
    }
}
?>
