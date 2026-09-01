<?php
function search_files($dir) {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($iterator as $file) {
        if ($file->isFile() && $file->getExtension() === 'php') {
            $content = file_get_contents($file->getPathname());
            if (stripos($content, 'vsol') !== false) {
                echo "Found 'vsol' in: " . $file->getPathname() . "\n";
            }
        }
    }
}
search_files(__DIR__ . '/../views');
?>
