<?php
$filepath = __DIR__ . '/../controllers/logic.php';
$lines = file($filepath);
$start = 404;
$end = 480;
for ($j = $start; $j <= $end; $j++) {
    echo ($j + 1) . ": " . $lines[$j];
}
?>
