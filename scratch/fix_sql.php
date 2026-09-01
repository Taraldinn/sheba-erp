<?php
$inputFile = 'd:\\Ashik\\Sheba SQL backup\\shebafi_minhaj.sql';
$outputFile = 'd:\\Ashik\\Shebad 21 may\\scratch\\shebafi_minhaj_fixed.sql';

if (!file_exists($inputFile)) {
    die("Input file not found: $inputFile\n");
}

$sql = file_get_contents($inputFile);
if ($sql === false) {
    die("Failed to read input file.\n");
}

// Replace collation
$sql = str_replace('utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci', $sql);

if (file_put_contents($outputFile, $sql) === false) {
    die("Failed to write output file.\n");
}

echo "SQL collation fixed successfully.\n";
?>
