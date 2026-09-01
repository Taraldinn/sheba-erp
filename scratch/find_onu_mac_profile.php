<?php
// scratch/find_onu_mac_profile.php
$files = [
    'd:/Ashik/Shebad 21 may/views/profile.php',
    'd:/Ashik/Shebad 21 may/views/clients/clients.php',
    'd:/Ashik/Shebad 21 may/views/clients/edit_client.php',
    'd:/Ashik/Shebad 21 may/controllers/logic.php'
];

foreach ($files as $file) {
    if (file_exists($file)) {
        $content = file_get_contents($file);
        echo "=== Search in " . basename($file) . " ===\n";
        
        $lines = explode("\n", $content);
        foreach ($lines as $idx => $line) {
            if (stripos($line, 'onu_mac') !== false || stripos($line, 'mac') !== false) {
                if (strlen($line) < 150) {
                    echo "Line " . ($idx + 1) . ": " . trim($line) . "\n";
                } else {
                    echo "Line " . ($idx + 1) . ": [long line containing keyword]\n";
                }
            }
        }
    } else {
        echo "File not found: $file\n";
    }
}
