<?php
/**
 * scratch/apply_olt_updates.php
 * Programmatically merges the updated OLTMonitor class from shebafiolt/olt_monitor.php
 * into classes/OLTManager.php and demo.shebafi.com/classes/OLTManager.php
 */

$updatedOltMonitorFile = __DIR__ . '/../shebafiolt/olt_monitor.php';
$mainOltManagerFile = __DIR__ . '/../classes/OLTManager.php';
$demoOltManagerFile = __DIR__ . '/../demo.shebafi.com/classes/OLTManager.php';

// 1. Load updated OLTMonitor class
if (!file_exists($updatedOltMonitorFile)) {
    die("Error: Updated shebafiolt/olt_monitor.php not found.\n");
}
$updatedCode = file_get_contents($updatedOltMonitorFile);

$startPos = strpos($updatedCode, 'class OLTMonitor {');
$endPos = strpos($updatedCode, 'class OLTManager {');
if ($startPos === false || $endPos === false) {
    die("Error: Could not parse classes from shebafiolt/olt_monitor.php.\n");
}
$oltMonitorCode = trim(substr($updatedCode, $startPos, $endPos - $startPos));

// Modify log file path inside OLTMonitor to be __DIR__ . '/../debug_log.txt'
$oltMonitorCode = str_replace(
    "\$this->log_file = 'olt_monitor.log';",
    "\$this->log_file = __DIR__ . '/../debug_log.txt';",
    $oltMonitorCode
);

// Modify monitor_all_onus to return false on connection failure
$oltMonitorCode = str_replace(
    "if (!\$this->telnet_connect()) {\n            \$this->log(\"Failed to connect to OLT for monitoring\", 'ERROR');\n            return \$monitoring_data;\n        }",
    "if (!\$this->telnet_connect()) {\n            \$this->log(\"Failed to connect to OLT for monitoring\", 'ERROR');\n            return false;\n        }",
    $oltMonitorCode
);

echo "Extracted and prepared updated OLTMonitor class successfully.\n";

// Function to update OLTManager.php file
function updateOltManagerFile($filePath, $newOltMonitorCode) {
    if (!file_exists($filePath)) {
        echo "File $filePath does not exist, skipping.\n";
        return false;
    }
    
    $content = file_get_contents($filePath);
    $start = strpos($content, 'class OLTMonitor {');
    $end = strpos($content, 'class OLTManager {');
    
    if ($start === false || $end === false) {
        echo "Error: Could not parse classes in $filePath.\n";
        return false;
    }
    
    // Replace the OLTMonitor class block
    $prefix = substr($content, 0, $start);
    $suffix = substr($content, $end);
    $updatedContent = $prefix . $newOltMonitorCode . "\n\n\n" . $suffix;
    
    // Now apply getConnectedONUs caching and error check improvements in OLTManager
    $targetOldCache = "        \$use_cache = true;\n        if (\$refresh) {\n            \$use_cache = false;\n        } elseif (empty(\$olt['onu_cache'])) {\n            \$use_cache = false;\n        }";
    
    $targetNewCache = "        \$use_cache = true;\n        if (\$refresh) {\n            \$use_cache = false;\n        } elseif (empty(\$olt['onu_cache']) || \$olt['onu_cache'] === '[]') {\n            \$use_cache = false;\n        }";
    
    $updatedContent = str_replace($targetOldCache, $targetNewCache, $updatedContent);
    
    $targetOldSync = "            \$data = \$monitor->monitor_all_onus();\n            \n            if (empty(\$data['onu_list']) && !empty(\$olt['onu_cache'])) {";
    
    $targetNewSync = "            \$data = \$monitor->monitor_all_onus();\n            \n            if (\$data === false) {\n                if (!empty(\$olt['onu_cache'])) {\n                    \$cached = json_decode(\$olt['onu_cache'], true);\n                    if (is_array(\$cached)) {\n                        return \$cached;\n                    }\n                }\n                return ['error' => 'Failed to connect to OLT via Telnet for monitoring. Check credentials and configuration.'];\n            }\n            \n            if (empty(\$data['onu_list']) && !empty(\$olt['onu_cache'])) {";
            
    $updatedContent = str_replace($targetOldSync, $targetNewSync, $updatedContent);
    
    file_put_contents($filePath, $updatedContent);
    echo "Successfully updated $filePath.\n";
    return true;
}

// Update the main file
updateOltManagerFile($mainOltManagerFile, $oltMonitorCode);

// Update the demo file
updateOltManagerFile($demoOltManagerFile, $oltMonitorCode);
?>
