<?php
header('Content-Type: text/plain');
$logs = [
    '../debug_post.log',
    '../debug_request.log',
    '../debug_all.log',
    '../debug_ajax.log',
    '../debug_payment.log'
];

foreach ($logs as $log) {
    echo "--- $log ---\n";
    if (file_exists(__DIR__ . '/' . $log)) {
        echo file_get_contents(__DIR__ . '/' . $log);
    } else {
        echo "NOT FOUND\n";
    }
    echo "\n\n";
}
?>
