<?php
$files = [
    __DIR__ . '/../controllers/logic.php',
    __DIR__ . '/../controllers/client_controller.php',
    __DIR__ . '/../controllers/view_data.php'
];

foreach ($files as $file) {
    if (!file_exists($file)) continue;
    $content = file_get_contents($file);
    echo "=== Scanning $file ===\n";
    
    // Look for bulk actions
    preg_match_all('/(bulk|recharge|action|select|post).*?([a-zA-Z0-9_]+)/i', $content, $matches, PREG_SET_ORDER);
    
    // Search for specific keywords
    $keywords = ['bulk', 'recharge', 'MikrotikApp', 'pppoe', 'password', 'secret'];
    foreach ($keywords as $kw) {
        $count = substr_count(strtolower($content), strtolower($kw));
        echo "Keyword '$kw' found $count times.\n";
    }
}
?>
