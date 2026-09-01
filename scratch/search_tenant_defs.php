<?php
// scratch/search_tenant_defs.php

$dir = realpath(__DIR__ . '/../');
$patterns = ['CURRENT_TENANT', 'TENANT_OVERRIDE'];

echo "Scanning directory: $dir\n";

function scan($path, $patterns) {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path));
    foreach ($iterator as $file) {
        if ($file->isDir()) continue;
        $filePath = $file->getPathname();
        
        // Skip vendor, cache, git, scratch
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
