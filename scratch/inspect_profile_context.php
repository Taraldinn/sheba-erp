<?php
$filepath = __DIR__ . '/../views/profile.php';
$lines = file($filepath);
foreach ($lines as $i => $line) {
    if (strpos($line, 'ONU Monitor') !== false) {
        echo "Line " . ($i + 1) . ": " . trim($line) . "\n";
        // print surrounding lines
        $start = max(0, $i - 40);
        $end = min(count($lines) - 1, $i + 40);
        echo "--- Context ---\n";
        for ($j = $start; $j <= $end; $j++) {
            echo ($j + 1) . ": " . $lines[$j];
        }
        echo "\n---------------\n";
    }
}
?>
