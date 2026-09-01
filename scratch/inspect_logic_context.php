<?php
$filepath = __DIR__ . '/../controllers/logic.php';
$lines = file($filepath);
foreach ($lines as $i => $line) {
    if (strpos($line, 'ajax_find_onu_signal') !== false) {
        echo "Line " . ($i + 1) . ": " . trim($line) . "\n";
        // print surrounding lines
        $start = max(0, $i - 20);
        $end = min(count($lines) - 1, $i + 60);
        echo "--- Context ---\n";
        for ($j = $start; $j <= $end; $j++) {
            echo ($j + 1) . ": " . $lines[$j];
        }
        echo "\n---------------\n";
    }
}
?>
