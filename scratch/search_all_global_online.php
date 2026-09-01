<?php
function search_dir($dir, &$results) {
    $files = scandir($dir);
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        $path = $dir . '/' . $file;
        if (is_dir($path)) {
            // Skip vendor, tmp, install, .git
            if (in_array($file, ['vendor', 'tmp', 'install', '.git', '.system_generated'])) continue;
            search_dir($path, $results);
        } else {
            if (pathinfo($path, PATHINFO_EXTENSION) === 'php') {
                $content = file_get_contents($path);
                if (strpos($content, 'global_online.json') !== false) {
                    $results[] = $path;
                }
            }
        }
    }
}
$results = [];
search_dir(__DIR__ . '/..', $results);
foreach ($results as $r) {
    echo $r . "\n";
}
