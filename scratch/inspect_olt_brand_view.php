<?php
$files = [__DIR__ . '/../views/olt.php', __DIR__ . '/../views/networking/olt.php'];
foreach ($files as $file) {
    if (file_exists($file)) {
        echo "=== File: " . basename($file) . " ===\n";
        $content = file_get_contents($file);
        $lines = explode("\n", $content);
        foreach ($lines as $i => $line) {
            if (strpos($line, 'brand') !== false || strpos($line, 'Brand') !== false) {
                if (strpos($line, '<select') !== false || strpos($line, '<option') !== false) {
                    echo "Line " . ($i + 1) . ": " . trim($line) . "\n";
                }
            }
        }
    }
}
?>
