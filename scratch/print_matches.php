<?php
// scratch/print_matches.php

$files = [
    'views/clients/clients.php',
    'views/clients/online_clients.php',
    'views/clients.php',
    'views/online_clients.php',
    'views/networking/olt_onus.php'
];

foreach ($files as $relPath) {
    $filePath = realpath(__DIR__ . '/../' . $relPath);
    if (!file_exists($filePath)) {
        echo "File does not exist: $relPath\n";
        continue;
    }
    
    echo "\n=== Matches in $relPath ===\n";
    $lines = file($filePath);
    foreach ($lines as $index => $line) {
        if (strpos($line, 'global_online.json') !== false || strpos($line, 'global_online.lock') !== false) {
            echo "Line " . ($index + 1) . ": " . trim($line) . "\n";
        }
    }
}
