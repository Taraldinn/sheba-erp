<?php
$files = [
    "d:/Ashik/Sheba June/controllers/logic.php",
    "d:/Ashik/Sheba June/controllers/payment_callback.php"
];

foreach ($files as $file_path) {
    if (file_exists($file_path)) {
        echo "Searching in $file_path...\n";
        $lines = file($file_path);
        foreach ($lines as $i => $line) {
            $line_num = $i + 1;
            if (stripos($line, "Recharge") !== false || stripos($line, "audit_log") !== false || stripos($line, "action_type") !== false) {
                $trimmed = trim($line);
                if (strlen($trimmed) < 150) {
                    echo "  Line $line_num: $trimmed\n";
                } else {
                    echo "  Line $line_num: " . substr($trimmed, 0, 150) . "...\n";
                }
            }
        }
    } else {
        echo "File not found: $file_path\n";
    }
}
