<?php
function searchDir($dir) {
    $it = new RecursiveDirectoryIterator($dir);
    foreach(new RecursiveIteratorIterator($it) as $file) {
        if ($file->isDir()) continue;
        if (pathinfo($file->getPathname(), PATHINFO_EXTENSION) !== 'php') continue;
        $content = file_get_contents($file->getPathname());
        if (stripos($content, 'pptp') !== false || stripos($content, 'vpn') !== false) {
            $lines = file($file->getPathname());
            foreach ($lines as $i => $line) {
                if (stripos($line, 'pptp') !== false || stripos($line, 'vpn') !== false) {
                    echo $file->getPathname() . " (line " . ($i + 1) . "): " . trim($line) . "\n";
                }
            }
        }
    }
}
searchDir(__DIR__ . '/..');
?>
