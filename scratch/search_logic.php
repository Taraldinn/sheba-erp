<?php
$lines = file(__DIR__ . '/../controllers/logic.php');
foreach ($lines as $i => $line) {
    if (strpos($line, 'global_online') !== false || strpos($line, 'get_global_online_users') !== false) {
        echo ($i + 1) . ': ' . trim($line) . "\n";
    }
}
