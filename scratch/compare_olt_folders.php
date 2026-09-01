<?php
$file1 = __DIR__ . '/../shebafiolt/index.php';
$file2 = __DIR__ . '/../olt new/index.php';

echo "Comparing index.php sizes:\n";
echo "shebafiolt/index.php: " . filesize($file1) . " bytes\n";
echo "olt new/index.php: " . filesize($file2) . " bytes\n\n";

$reboot1 = __DIR__ . '/../shebafiolt/reboot_onu.php';
$reboot2 = __DIR__ . '/../olt new/reboot_onu.php';

echo "Comparing reboot_onu.php sizes:\n";
echo "shebafiolt/reboot_onu.php: " . filesize($reboot1) . " bytes\n";
echo "olt new/reboot_onu.php: " . filesize($reboot2) . " bytes\n\n";
?>
