<?php
$filepath = __DIR__ . '/../controllers/logic.php';
$lines = file($filepath);
foreach ($lines as $i => $line) {
    if (strpos($line, 'global_online.json') !== false) {
        echo "Line " . ($i + 1) . ": " . trim($line) . "\n";
        // print surrounding lines
        $start = max(0, $i - 10);
        $end = min(count($lines) - 1, $i + 10);
        echo "--- Context ---\n";
        for ($j = $start; $j <= $end; $j++) {
            echo ($j + 1) . ": " . $lines[$j];
        }
        echo "\n---------------\n";
    }
}
?>
