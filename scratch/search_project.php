<?php
function scanDirRecursive($dir) {
    $results = [];
    $files = scandir($dir);
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        $path = $dir . '/' . $file;
        if (is_dir($path)) {
            if (strpos($file, 'vendor') !== false || strpos($file, 'olt new') !== false || strpos($file, 'scratch') !== false) continue;
            $results = array_merge($results, scanDirRecursive($path));
        } else {
            if (pathinfo($path, PATHINFO_EXTENSION) === 'php') {
                $results[] = $path;
            }
        }
    }
    return $results;
}

$allFiles = scanDirRecursive(__DIR__ . '/..');
echo "Searching " . count($allFiles) . " PHP files for OLTManager or OLTMonitor...\n";

foreach ($allFiles as $file) {
    $content = file_get_contents($file);
    $found = [];
    if (strpos($content, 'OLTManager') !== false) {
        $found[] = 'OLTManager';
    }
    if (strpos($content, 'OLTMonitor') !== false) {
        $found[] = 'OLTMonitor';
    }
    if (!empty($found)) {
        echo "Found in $file: " . implode(', ', $found) . "\n";
    }
}
?>
