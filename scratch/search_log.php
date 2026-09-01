<?php
$logFile = 'C:\\Users\\4fndb\\.gemini\\antigravity\\brain\\1838ea2b-4092-498e-a3a7-e8db80d7853c\\.system_generated\\logs\\transcript.jsonl';
if (!file_exists($logFile)) {
    die("Log file not found.\n");
}

$handle = fopen($logFile, 'r');
if ($handle) {
    while (($line = fgets($handle)) !== false) {
        if (strpos($line, 'vsol_gpon_get_all_data') !== false) {
            $data = json_decode($line, true);
            // Search inside tool calls output or output content
            $content = $data['content'] ?? '';
            if (strpos($content, 'public function vsol_gpon_get_all_data') !== false) {
                // Find where the function starts
                $pos = strpos($content, 'public function vsol_gpon_get_all_data');
                echo "FOUND ORIGINAL FUNCTION DEFINITION:\n";
                echo substr($content, $pos, 2500);
                echo "\n======================\n";
            }
        }
    }
    fclose($handle);
}
?>
