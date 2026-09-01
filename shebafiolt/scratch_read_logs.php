<?php
/**
 * shebafiolt/scratch_read_logs.php
 * Diagnostic endpoint to view the payment debug log.
 */
header('Content-Type: text/plain');

$log_file = __DIR__ . '/../debug_payment.log';
if (file_exists($log_file)) {
    echo file_get_contents($log_file);
} else {
    echo "Log file debug_payment.log does not exist.";
}
exit;
