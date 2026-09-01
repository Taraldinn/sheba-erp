<?php
header('Content-Type: text/plain; charset=utf-8');
$log_file = __DIR__ . '/debug_request.log';
if (file_exists($log_file)) {
    echo file_get_contents($log_file);
} else {
    echo "No error log found yet.";
}
?>
