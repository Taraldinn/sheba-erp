<?php
$content = file_get_contents(__DIR__ . '/../views/profile.php');
$lines = explode("\n", $content);
foreach ($lines as $index => $line) {
    if (strpos($line, 'nav-tabs') !== false || strpos($line, 'nav nav-') !== false || strpos($line, 'tab-content') !== false) {
        echo "Line " . ($index + 1) . ": " . trim($line) . "\n";
    }
}
?>
