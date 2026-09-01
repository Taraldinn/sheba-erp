<?php
require_once __DIR__ . '/shebafiolt/classes.php';
$mgr = new ShebafiOLTManager(__DIR__ . '/shebafiolt/olts_config.json');
$ip = '172.25.31.86'; // From screenshot
echo "Attempting to delete OLT: $ip\n";
$res = $mgr->remove_olt($ip, null); // Delete as admin
echo "Result: " . ($res ? "Success" : "Failed") . "\n";
echo "Current OLTs:\n";
print_r($mgr->get_olts());
?>
