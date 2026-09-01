<?php
// scratch/create_zip.php
$rootPath = realpath(__DIR__ . '/..');
$zipFile = $rootPath . '/sheba_23_may_2026_full.zip';

// Initialize archive object
$zip = new ZipArchive();
if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
    die("Cannot open $zipFile\n");
}

echo "Compressing files in $rootPath (including vendor)...\n";

// Create recursive directory iterator
$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($rootPath),
    RecursiveIteratorIterator::LEAVES_ONLY
);

$count = 0;
foreach ($files as $name => $file) {
    // Skip directories
    if ($file->isDir()) {
        continue;
    }

    // Get real and relative path for current file
    $filePath = $file->getRealPath();
    $relativePath = substr($filePath, strlen($rootPath) + 1);
    
    // Normalize path separators to forward slash
    $relativePath = str_replace('\\', '/', $relativePath);

    // Exclude patterns: .git, scratch, existing zip files, temporary log files
    if (preg_match('/^(\.git|scratch|.*\.zip|.*\.log)/i', $relativePath) || (preg_match('/^debug_/i', $relativePath) && !in_array($relativePath, ['debug_store.php', 'debug_view.php']))) {
        continue;
    }

    // Add current file to archive
    $zip->addFile($filePath, $relativePath);
    $count++;
}

// Close ZipArchive
$zip->close();

echo "Successfully created full zip file: sheba_23_may_2026_full.zip\n";
echo "Total files packed: $count\n";
?>
