<?php
// scratch/search_global_online.php

$dir = realpath(__DIR__ . '/../');
$patterns = ['global_online.json', 'global_online.lock'];

echo "Scanning directory: $dir\n";

function scan($path, $patterns) {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path));
    foreach ($iterator as $file) {
        if ($file->isDir()) continue;
        $filePath = $file->getPathname();
        
        // Skip vendor, cache, and git directories
        if (strpos($filePath, 'vendor') !== false || 
            strpos($filePath, '.git') !== false || 
            strpos($filePath, 'cache') !== false ||
            strpos($filePath, 'scratch') !== false) {
            continue;
        }
        
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        if (in_array($ext, ['php', 'html', 'js'])) {
            $content = file_get_contents($filePath);
            foreach ($patterns as $pattern) {
                if (strpos($content, $pattern) !== false) {
                    echo "Match found for '$pattern' in file: $filePath\n";
                }
            }
        }
    }
}

scan($dir, $patterns);
echo "Scan complete.\n";
