<?php
$filesToCopy = [
    'olt new/olts_config.json' => 'shebafiolt/olts_config.json',
    'olt new/index.php' => 'shebafiolt/index.php',
    'olt new/reboot_onu.php' => 'shebafiolt/reboot_onu.php'
];

foreach ($filesToCopy as $src => $dest) {
    $srcPath = __DIR__ . '/../' . $src;
    $destPath = __DIR__ . '/../' . $dest;
    
    if (file_exists($srcPath)) {
        if (copy($srcPath, $destPath)) {
            echo "Copied: $src -> $dest\n";
        } else {
            echo "Failed to copy: $src\n";
        }
    } else {
        echo "Source file does not exist: $src\n";
    }
}
?>
