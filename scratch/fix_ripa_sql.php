<?php
$inputFile = 'd:\\Ashik\\Sheba SQL backup\\shebafi_ripa1.sql';
$outputFile = 'd:\\Ashik\\Shebad 21 may\\scratch\\shebafi_ripa1_fixed.sql';

if (!file_exists($inputFile)) {
    die("Input file not found: $inputFile\n");
}

echo "Reading SQL file...\n";
$sql = file_get_contents($inputFile);
if ($sql === false) {
    die("Failed to read input file.\n");
}

echo "Replacing collations...\n";
$sql = str_replace('utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci', $sql);

echo "Writing fixed SQL file...\n";
if (file_put_contents($outputFile, $sql) === false) {
    die("Failed to write output file.\n");
}

echo "SQL collation fixed successfully.\n";
?>
