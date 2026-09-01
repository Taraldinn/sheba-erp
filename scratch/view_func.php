<?php
$file_path = "d:/Ashik/Sheba June/includes/functions.php";
if (file_exists($file_path)) {
    $content = file_get_contents($file_path);
    $pos = strpos($content, "function processOnlinePaymentSuccess");
    if ($pos !== false) {
        $sub = substr($content, $pos, 8000);
        echo $sub;
    } else {
        echo "Function not found.\n";
    }
} else {
    echo "File not found: $file_path\n";
}
