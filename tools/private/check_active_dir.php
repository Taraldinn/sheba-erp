<?php
header('Content-Type: text/plain');
$logFile = __DIR__ . '/views/auth/debug_quick_pay.log';
if (file_exists($logFile)) {
    echo file_get_contents($logFile);
} else {
    echo "Log file not found at " . $logFile;
}
?>
