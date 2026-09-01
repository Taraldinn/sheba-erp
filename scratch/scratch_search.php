<?php
$workspace = "g:/Shebafi/sheba 22 2nd round";
$logic_path = "$workspace/controllers/logic.php";

if (!file_exists($logic_path)) {
    die("logic.php does not exist at $logic_path\n");
}

$lines = file($logic_path);
echo "Total lines: " . count($lines) . "\n";

$recharge_matches = [];
foreach ($lines as $idx => $line) {
    $line_lower = strtolower($line);
    if (strpos($line_lower, 'recharge') !== false || strpos($line_lower, 'status') !== false || strpos($line_lower, 'mikrotik') !== false) {
        $recharge_matches[] = [
            'line' => $idx + 1,
            'content' => trim($line)
        ];
    }
}

echo "Found " . count($recharge_matches) . " matches.\n";
foreach (array_slice($recharge_matches, 0, 150) as $match) {
    echo "L" . $match['line'] . ": " . substr($match['content'], 0, 150) . "\n";
}
