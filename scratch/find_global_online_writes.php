<?php
// scratch/find_global_online_writes.php
$dir = __DIR__ . '/../';

function search_dir($path) {
    $files = scandir($path);
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        $full_path = $path . '/' . $file;
        if (is_dir($full_path)) {
            if (strpos($file, 'vendor') === false && strpos($file, '.git') === false) {
                search_dir($full_path);
            }
        } else {
            if (pathinfo($full_path, PATHINFO_EXTENSION) === 'php') {
                $content = file_get_contents($full_path);
                if (strpos($content, 'global_online') !== false) {
                    echo "Found in: $full_path\n";
                    // print lines containing global_online
                    $lines = explode("\n", $content);
                    foreach ($lines as $i => $line) {
                        if (strpos($line, 'global_online') !== false) {
                            echo "  Line " . ($i + 1) . ": " . trim($line) . "\n";
                        }
                    }
                }
            }
        }
    }
}

search_dir($dir);
?>
