<?php
$f1 = file_get_contents(__DIR__ . '/../shebafiolt/index.php');
$f2 = file_get_contents(__DIR__ . '/../olt new/index.php');

echo "shebafiolt/index.php starts with:\n";
echo substr($f1, 0, 500) . "\n";
echo "...\n\n";

echo "olt new/index.php starts with:\n";
echo substr($f2, 0, 500) . "\n";
echo "...\n\n";
?>
