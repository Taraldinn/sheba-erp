<?php
/**
 * shebafiolt/check_sync.php
 * Verifies if workspace files are synced and checks for logic errors.
 */
header('Content-Type: application/json');

$files = [
    'controllers/logic.php',
    'views/finance/accounts.php',
    'views/accounts.php'
];

$results = [];
foreach ($files as $file) {
    $path = __DIR__ . '/../' . $file;
    if (file_exists($path)) {
        $content = file_get_contents($path);
        
        $results[$file] = [
            'exists' => true,
            'size' => strlen($content),
            'md5' => md5($content),
            'parent_id_check' => strpos($content, 'parent_id') !== false,
            'error_alert_check' => strpos($content, 'Payment Error') !== false,
        ];
    } else {
        $results[$file] = [
            'exists' => false
        ];
    }
}

echo json_encode($results, JSON_PRETTY_PRINT);
exit;
