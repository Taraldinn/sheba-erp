<?php
$files = [
    'controllers/logic.php',
    'views/clients/clients.php',
    'views/clients/online_clients.php',
    'views/clients.php',
    'views/networking/olt_onus.php',
    'views/online_clients.php'
];

foreach ($files as $f) {
    $path = __DIR__ . '/../' . $f;
    if (!file_exists($path)) {
        echo "File not found: $f\n";
        continue;
    }
    echo "=========================================\n";
    echo "FILE: $f\n";
    echo "=========================================\n";
    $lines = file($path);
    foreach ($lines as $i => $line) {
        if (strpos($line, 'global_online.json') !== false) {
            $start = max(0, $i - 3);
            $end = min(count($lines) - 1, $i + 3);
            for ($k = $start; $k <= $end; $k++) {
                echo ($k + 1) . ': ' . $lines[$k];
            }
            echo "-----------------------------------------\n";
        }
    }
}
