<?php
$r1 = file_get_contents(__DIR__ . '/../shebafiolt/reboot_onu.php');
$r2 = file_get_contents(__DIR__ . '/../olt new/reboot_onu.php');

echo "shebafiolt/reboot_onu.php starts with:\n";
echo substr($r1, 0, 500) . "\n";
echo "...\n\n";

echo "olt new/reboot_onu.php starts with:\n";
echo substr($r2, 0, 500) . "\n";
echo "...\n\n";
?>
