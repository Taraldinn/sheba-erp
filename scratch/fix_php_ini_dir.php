<?php
$iniPath = 'C:\\xampp\\php\\php.ini';
if (!file_exists($iniPath)) {
    die("php.ini not found\n");
}

$content = file_get_contents($iniPath);
if ($content === false) {
    die("Failed to read php.ini\n");
}

// Check if C:\xampp\php\ext exists
$extPath = 'C:\\xampp\\php\\ext';
if (is_dir($extPath)) {
    echo "Extension directory exists at $extPath\n";
} else {
    echo "Warning: Extension directory does not exist at $extPath\n";
}

// Find extension_dir configuration lines
// We want to uncomment or set extension_dir = "C:\xampp\php\ext" for absolute paths, which is safer
$newExtensionDirSetting = "extension_dir = \"C:\\xampp\\php\\ext\"";

// Let's replace the commented ;extension_dir = "ext" or similar with the absolute path
if (strpos($content, ';extension_dir = "ext"') !== false) {
    $content = str_replace(';extension_dir = "ext"', $newExtensionDirSetting, $content);
    echo "Set extension_dir to absolute path using str_replace\n";
} else {
    // If not found, let's find any other variation
    $content = preg_replace('/;?\s*extension_dir\s*=\s*"ext"/', $newExtensionDirSetting, $content, 1, $count);
    if ($count > 0) {
        echo "Set extension_dir using preg_replace\n";
    } else {
        echo "Could not find standard extension_dir = \"ext\" line.\n";
    }
}

$result = file_put_contents($iniPath, $content);
if ($result === false) {
    die("Failed to write php.ini\n");
}
echo "php.ini extension_dir updated successfully\n";
?>
