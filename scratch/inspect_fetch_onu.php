<?php
$filepath = __DIR__ . '/../views/profile.php';
$lines = file($filepath);
foreach ($lines as $i => $line) {
    if (strpos($line, 'fetchOnuSignal') !== false && strpos($line, 'function') === false) {
        echo "Line " . ($i + 1) . ": " . trim($line) . "\n";
        // print surrounding lines
        $start = max(0, $i - 15);
        $end = min(count($lines) - 1, $i + 15);
        echo "--- Context ---\n";
        for ($j = $start; $j <= $end; $j++) {
            echo ($j + 1) . ": " . $lines[$j];
        }
        echo "\n---------------\n";
    }
}
?>
