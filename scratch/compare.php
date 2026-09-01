<?php
$dir1 = 'g:/Shebafi/sheba 22 2nd round';
$dir2 = 'g:/Shebafi/Sheba 23 may 2026';

function compare_dirs($d1, $d2, $base = '') {
    $path1 = $d1 . ($base ? '/' . $base : '');
    $path2 = $d2 . ($base ? '/' . $base : '');
    
    if (!is_dir($path1)) return;
    
    $files = scandir($path1);
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        
        $rel = $base ? $base . '/' . $file : $file;
        
        // Skip logs, caches, scratch, vendor, .git, zip files
        if (preg_match('/^(\.git|vendor|cache|tmp|uploads|scratch|.*\.zip|.*\.log|debug_.*)/i', $rel)) {
            continue;
        }
        
        $f1 = $d1 . '/' . $rel;
        $f2 = $d2 . '/' . $rel;
        
        if (is_dir($f1)) {
            if (!is_dir($f2)) {
                echo "Directory only in dir1: $rel\n";
            } else {
                compare_dirs($d1, $d2, $rel);
            }
        } else {
            if (!file_exists($f2)) {
                echo "File only in dir1: $rel\n";
            } else {
                $h1 = md5_file($f1);
                $h2 = md5_file($f2);
                if ($h1 !== $h2) {
                    echo "File differs: $rel\n";
                }
            }
        }
    }
    
    // Also check for files only in dir2
    if ($base === '') {
        $files2 = scandir($path2);
        foreach ($files2 as $file) {
            if ($file === '.' || $file === '..') continue;
            if (preg_match('/^(\.git|vendor|cache|tmp|uploads|scratch|.*\.zip|.*\.log|debug_.*)/i', $file)) {
                continue;
            }
            $f1 = $d1 . '/' . $file;
            if (!file_exists($f1)) {
                echo "File only in dir2: $file\n";
            }
        }
    }
}

echo "Comparing folders:\n1: $dir1\n2: $dir2\n\n";
compare_dirs($dir1, $dir2);
echo "\nComparison complete.\n";
