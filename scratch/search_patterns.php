<?php
// scratch/search_patterns.php

$rootDir = dirname(__DIR__);

$patterns = [
    'users_queries' => '/FROM\s+["\']?\s*\.\s*TBL_USERS/i',
];

$results = [];
foreach ($patterns as $name => $regex) {
    $results[$name] = [];
}

$excludeDirs = ['.git', 'vendor', 'laravel', 'node_modules', 'scratch'];

$scan = null;
$scan = function($dir) use (&$results, $patterns, $excludeDirs, $rootDir, &$scan) {
    $files = scandir($dir);
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        $path = $dir . '/' . $file;
        if (is_dir($path)) {
            if (in_array($file, $excludeDirs)) continue;
            $scan($path);
        } else {
            if (pathinfo($path, PATHINFO_EXTENSION) !== 'php') continue;
            $content = file_get_contents($path);
            $lines = explode("\n", $content);
            foreach ($lines as $idx => $line) {
                foreach ($patterns as $name => $regex) {
                    if (preg_match($regex, $line)) {
                        $results[$name][] = [
                            'file' => str_replace($rootDir . '/', '', $path),
                            'line' => $idx + 1,
                            'content' => trim($line),
                        ];
                    }
                }
            }
        }
    }
};

$scan($rootDir);

echo "--- RESULTS ---\n";
foreach ($results as $name => $matches) {
    if (!in_array($name, ['users_queries'])) continue;
    echo "\n[" . strtoupper($name) . "] Matches count: " . count($matches) . "\n";
    foreach ($matches as $m) {
        if ($m['file'] !== 'controllers/logic.php') continue;
        echo "  " . $m['file'] . ":" . $m['line'] . " -> " . $m['content'] . "\n";
    }
}
?>
