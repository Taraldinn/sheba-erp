<?php
// debug_view.php
// View logs on remote server.

ob_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

// Only logged in staff can access this page
if (!isLoggedIn()) {
    die("Access Denied: Please log in first.");
}

echo "<html><head><title>System Logs Viewer</title>";
echo "<link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'></head>";
echo "<body class='bg-light'><div class='container my-5'><div class='card shadow-sm'><div class='card-header bg-dark text-white'>";
echo "<h3 class='mb-0'>System Logs Viewer</h3></div><div class='card-body'>";

$log_files = [
    'debug_request.log',
    'debug_post.log',
    'debug_all.log',
    'debug_log.txt',
    'error_log', // standard cPanel PHP error log
];

echo "<ul class='nav nav-tabs' id='logTabs' role='tablist'>";
$first = true;
foreach ($log_files as $index => $file) {
    $active = $first ? 'active' : '';
    echo "<li class='nav-item' role='presentation'>";
    echo "<button class='nav-link $active' id='tab-$index' data-bs-toggle='tab' data-bs-target='#content-$index' type='button' role='tab'>" . htmlspecialchars($file) . "</button>";
    echo "</li>";
    $first = false;
}
echo "</ul>";

echo "<div class='tab-content p-3 border border-top-0 bg-white' id='logTabsContent'>";
$first = true;
foreach ($log_files as $index => $file) {
    $active = $first ? 'show active' : '';
    echo "<div class='tab-pane fade $active' id='content-$index' role='tabpanel'>";
    
    $path = __DIR__ . '/' . $file;
    if (file_exists($path)) {
        $size = filesize($path);
        echo "<p class='text-muted small'>File: <code>" . htmlspecialchars($path) . "</code> (Size: " . number_format($size) . " bytes)</p>";
        
        // Read last 100 lines
        $lines = file($path);
        if ($lines === false) {
            echo "<div class='alert alert-warning'>Could not read file.</div>";
        } else {
            $last_lines = array_slice($lines, -100);
            echo "<pre class='bg-dark text-light p-3 rounded' style='max-height: 500px; overflow-y: auto; font-size: 0.85rem;'>" . htmlspecialchars(implode("", $last_lines)) . "</pre>";
        }
    } else {
        echo "<div class='alert alert-secondary'>File does not exist.</div>";
    }
    
    echo "</div>";
    $first = false;
}
echo "</div>";

echo "</div></div></div>";
echo "<script src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js'></script>";
echo "</body></html>";
?>
