<?php
// includes/license.php

if (!function_exists('get_opt')) {
    require_once __DIR__ . '/functions.php';
}

// DEFAULT CONFIGURATION (Fallback)
define('DEFAULT_SAAS_API_URL', 'https://netbills.work.gd/saas_admin/api.php'); 

// GLOBAL LICENSE STATUS (Default to Invalid)
$g_license_status = [
    'valid' => false,
    'message' => 'No License Found',
    'max_users' => 0, 
    'expiry_date' => '1970-01-01',
    'days_remaining' => 0
];

function check_license_server($pdo) {
    global $g_license_status;
    
    // Support local development / offline testing
    if ((defined('APP_ENV') && (APP_ENV === 'local' || APP_ENV === 'development')) || 
        in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost', 'localhost:8080', '127.0.0.1', '127.0.0.1:8080'])) {
        $g_license_status = [
            'valid' => true,
            'message' => 'Active (Local Development)',
            'max_users' => 99999,
            'expiry_date' => '2099-12-31',
            'days_remaining' => 99999,
            'key' => 'LOCAL_DEV_KEY'
        ];
        return;
    }
    
    // Get Key & URL from DB
    $license_key = get_opt($pdo, 'saas_license_key', '');
    $api_url = get_opt($pdo, 'saas_api_url', DEFAULT_SAAS_API_URL);
    
    if (empty($license_key)) {
        $g_license_status['message'] = 'License Key Missing';
        return;
    }

    // Cache for 10 seconds (Near Instant Check)
    $cache_file = __DIR__ . '/../cache/license_cache.json';
    if (file_exists($cache_file) && (time() - filemtime($cache_file) < 10)) { 
        $data = json_decode(file_get_contents($cache_file), true);
        if ($data) {
            $g_license_status = $data;
             // Simple check if key changed
            if (isset($data['key']) && $data['key'] !== $license_key) {
               // force refresh
            } else {
                return;
            }
        }
    }

    // Call API
    $domain = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    $url = $api_url . '?key=' . urlencode($license_key) . '&domain=' . urlencode($domain);
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    // Disable SSL verify for local testing if needed, but risky for prod
    // curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); 
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($response) {
        $json = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
             // START DEBUG HTML STRIPPING
             $clean_response = strip_tags($response);
             $g_license_status['message'] = 'API Error: Invalid JSON. Code: ' . $http_code . '. Response: ' . htmlspecialchars(substr($clean_response, 0, 100));
             $g_license_status['valid'] = false;
        } elseif (isset($json['status']) && $json['status'] === 'success') {
            $g_license_status = [
                'valid' => $json['valid'],
                'message' => $json['valid'] ? 'Active' : 'Expired/Suspended',
                'max_users' => $json['data']['max_users'],
                'expiry_date' => $json['data']['expiry_date'],
                'days_remaining' => $json['data']['days_remaining'],
                'key' => $license_key
            ];
            // Save cache
            @file_put_contents($cache_file, json_encode($g_license_status));
        } else {
            $g_license_status['valid'] = false;
            $g_license_status['message'] = $json['message'] ?? 'Invalid License Status';
        }
    } else {
        $g_license_status['message'] = 'Connection Error';
    }
}

// HANDLE ACTIVATION POST
if (isset($_POST['activate_license'])) {
    $new_key = trim($_POST['license_key']);
    $new_url = trim($_POST['api_url']);
    
    set_opt($pdo, 'saas_license_key', $new_key);
    // Remove trailing slash and ensures api.php is there if user forgot? 
    // Actually, let's just trust the user or default to appending api.php if missing
    if (strpos($new_url, 'api.php') === false) {
        $new_url = rtrim($new_url, '/') . '/api.php';
    }
    set_opt($pdo, 'saas_api_url', $new_url);
    
    // Clear cache to force refresh
    @unlink(__DIR__ . '/../cache/license_cache.json');
    header("Location: index.php");
    exit;
}

// Initial Check
if (isset($pdo)) {
    check_license_server($pdo);
}

// ACTIVATION SCREEN (If Invalid)
if (!$g_license_status['valid'] && php_sapi_name() !== 'cli') {
    // Send No-Cache Headers
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Cache-Control: post-check=0, pre-check=0", false);
    header("Pragma: no-cache");

    $msg = $g_license_status['message'];
    $current_url = get_opt($pdo, 'saas_api_url', DEFAULT_SAAS_API_URL);
    $current_key = get_opt($pdo, 'saas_license_key', '');
    
    echo <<<HTML
    <!DOCTYPE html>
    <html>
    <head>
        <title>License Activation</title>
        <style>
            body { font-family: sans-serif; background: #f4f6f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 450px; text-align: center; }
            h2 { color: #333; margin-top: 0; }
            .form-group { margin-bottom: 15px; text-align:left; }
            label { display:block; margin-bottom:5px; font-weight:bold; color:#555; }
            input[type="text"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
            button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; width: 100%; font-size: 16px; margin-top:10px; }
            button.secondary { background: #6c757d; margin-top: 5px; }
            button:hover { opacity: 0.9; }
            .error { color: #dc3545; margin-bottom: 15px; background: #ffe6e6; padding: 10px; border-radius: 4px; font-size: 14px; }
            .hint { font-size: 12px; color: #777; margin-top: 5px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>System Activation</h2>
            <p>Please enter your license details.</p>
            <div class="error">Status: $msg</div>
            
            <form method="POST">
                <button type="submit" name="check_again" class="secondary" style="margin-bottom:20px;">Check Status Again</button>
            </form>

            <form method="POST">
                <div class="form-group">
                    <label>License Key</label>
                    <input type="text" name="license_key" placeholder="Enter License Key" value="$current_key" required>
                </div>
                <div class="form-group">
                    <label>SaaS Server URL (API URL)</label>
                    <input type="text" name="api_url" placeholder="http://server.com/saas_admin/api.php" value="$current_url" required>
                    <div class="hint">The full URL to the saas_admin/api.php file.</div>
                </div>
                <button type="submit" name="activate_license">Update License</button>
            </form>
        </div>
    </body>
    </html>
HTML;
    exit;
}

// INTERCEPT: User Limit Check
if (isset($_POST['add_client']) && isset($pdo)) {
    try {
        $stmt = $pdo->query("SELECT COUNT(*) FROM " . TBL_USERS . " WHERE status != 'Left'");
        $current_users = $stmt->fetchColumn();

        if ($g_license_status['max_users'] > 0 && $current_users >= $g_license_status['max_users']) {
            http_response_code(403);
            exit("<div style='padding:20px; text-align:center; color:red;'>
                    <h1>License Limit Reached</h1>
                    <p>You have reached your limit of <strong>{$g_license_status['max_users']}</strong> users.</p>
                    <p>Upgrade your package to add more clients.</p>
                    <a href='index.php'>Go Back</a>
                 </div>");
        }
    } catch (Exception $e) {}
}

// FRONTEND POPUP
function show_license_popup() {
    global $g_license_status;
    if ($g_license_status['days_remaining'] <= 7 && $g_license_status['days_remaining'] > 0) {
        echo "
        <div id='license-warning' style='position:fixed; bottom:20px; right:20px; background:#fff3cd; color:#856404; padding:15px; border:1px solid #ffeeba; border-radius:5px; box-shadow:0 0 10px rgba(0,0,0,0.1); z-index:9999;'>
            <strong>Subscription Expiring Soon!</strong><br>
            Your license expires in <strong>{$g_license_status['days_remaining']} days</strong>.
            <button onclick='document.getElementById(\"license-warning\").style.display=\"none\"' style='margin-left:10px; border:none; background:none; cursor:pointer;'>x</button>
        </div>";
    }
}
?>
