<?php
$lines = file(__DIR__ . '/../views/layout/header.php');
foreach ($lines as $i => $line) {
    if (stripos($line, 'store') !== false) {
        echo ($i + 1) . ': ' . trim($line) . "\n";
    }
}
?>
