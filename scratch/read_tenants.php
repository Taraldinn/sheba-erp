<?php
$dir = "d:/Ashik/Sheba June/includes/tenants";
if (is_dir($dir)) {
    $files = scandir($dir);
    foreach ($files as $f) {
        if ($f === '.' || $f === '..') continue;
        $path = "$dir/$f";
        if (is_file($path)) {
            $content = file_get_contents($path);
            if (preg_match("/define\('DB_NAME',\s*'([^']+)'\)/", $content, $matches)) {
                echo "File: $f => DB: {$matches[1]}\n";
            } else {
                echo "File: $f => DB constant not found\n";
            }
        }
    }
} else {
    echo "Directory not found: $dir\n";
}
