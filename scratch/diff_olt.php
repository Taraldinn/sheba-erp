<?php
$file1 = __DIR__ . '/../classes/OLTManager.php';
$file2 = __DIR__ . '/../shebafiolt/olt_monitor.php';

$code1 = file_get_contents($file1);
$code2 = file_get_contents($file2);

// Extract OLTMonitor class from both
function get_class_content($code) {
    $start = strpos($code, 'class OLTMonitor');
    if ($start === false) return '';
    $end = strpos($code, 'class OLTManager');
    if ($end === false) {
        return substr($code, $start);
    }
    return substr($code, $start, $end - $start);
}

$monitor1 = trim(get_class_content($code1));
$monitor2 = trim(get_class_content($code2));

if ($monitor1 === $monitor2) {
    echo "OLTMonitor classes are identical.\n";
} else {
    echo "OLTMonitor classes DIFFER.\n";
    // Write out classes to temp files for diff
    file_put_contents(__DIR__ . '/monitor_class_main.txt', $monitor1);
    file_put_contents(__DIR__ . '/monitor_class_updated.txt', $monitor2);
    
    // Perform simple line-by-line comparison
    $lines1 = explode("\n", $monitor1);
    $lines2 = explode("\n", $monitor2);
    
    echo "Main file lines: " . count($lines1) . "\n";
    echo "Updated file lines: " . count($lines2) . "\n";
}
?>
