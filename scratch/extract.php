<?php
$zipFile = __DIR__ . '/../4 Sheba 19 june 26.zip';
$zip = new ZipArchive;
if ($zip->open($zipFile) === TRUE) {
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if (strpos($name, 'quick_pay.php') !== false) {
            copy("zip://" . $zipFile . "#" . $name, __DIR__ . '/../views/auth/quick_pay.php');
            echo "RESTORED: " . $name . "\n";
            exit;
        }
    }
    echo "ERROR: quick_pay.php not found in zip\n";
    $zip->close();
} else {
    echo "ERROR: Could not open zip file $zipFile\n";
}
?>
