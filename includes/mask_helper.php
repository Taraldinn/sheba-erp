<?php
// includes/mask_helper.php
// Helper utility to mask sensitive parameters from logs

function mask_sensitive_data($data) {
    if (is_array($data)) {
        $keys_to_mask = [
            'password', 'confirm_pass', 'new_pass', 'current_pass', 
            'api_token', 'api_key', 'api_secret', 'app_secret', 
            'password_token', 'snmp_password', 'pptp_password', 
            'pass', 'snmp_community', 'db_pass', 'api_password'
        ];
        foreach ($data as $key => $value) {
            if (in_array(strtolower($key), $keys_to_mask)) {
                $data[$key] = '********';
            } elseif (is_array($value)) {
                $data[$key] = mask_sensitive_data($value);
            }
        }
    }
    return $data;
}

function mask_sensitive_string($str) {
    if (!is_string($str) || empty($str)) {
        return $str;
    }
    // Mask patterns like "password=xxxx" or "pass: xxxx" in log strings
    $patterns = [
        '/(password|pass|secret|token|api_key|api_token|api_password|db_pass)(["\'\s\:\=\_]*)([^\s&"\',\r\n\)\(]+)/i'
    ];
    return preg_replace_callback($patterns, function($m) {
        return $m[1] . $m[2] . '********';
    }, $str);
}

function safe_log($channel, $message, $context = []) {
    $app_debug = isset($_ENV['APP_DEBUG']) ? filter_var($_ENV['APP_DEBUG'], FILTER_VALIDATE_BOOLEAN) : true;
    if (stripos($channel, 'debug') !== false && !$app_debug) {
        return;
    }
    
    $log_dir = defined('LOG_PATH') ? LOG_PATH : dirname(__DIR__) . '/logs';
    if (!is_dir($log_dir)) {
        @mkdir($log_dir, 0755, true);
        @file_put_contents($log_dir . '/.htaccess', "Order deny,allow\nDeny from all\n");
    }
    
    // Mask sensitive data in context
    $context = mask_sensitive_data($context);
    
    // Mask sensitive data in message
    $message = mask_sensitive_string($message);
    
    // Partially mask phone numbers in message
    $message = preg_replace_callback('/(\+?88)?01[3-9]\d{8}/', function($m) {
        $num = $m[0];
        return substr($num, 0, 5) . '***' . substr($num, -3);
    }, $message);
    
    // Mask context phone numbers if any
    if (is_array($context)) {
        foreach ($context as $key => $val) {
            if (is_string($val) && preg_match('/^(\+?88)?01[3-9]\d{8}$/', $val)) {
                $context[$key] = substr($val, 0, 5) . '***' . substr($val, -3);
            }
            // Mask transaction ID partially if needed (e.g. bkash transaction ID has 10 alphanumeric chars)
            if (is_string($val) && in_array(strtolower($key), ['trx_id', 'transaction_id', 'txnid'])) {
                if (strlen($val) > 4) {
                    $context[$key] = substr($val, 0, 2) . '*****' . substr($val, -2);
                }
            }
        }
    }
    
    $timestamp = date('Y-m-d H:i:s');
    $context_str = !empty($context) ? ' | Context: ' . json_encode($context, JSON_UNESCAPED_SLASHES) : '';
    $log_entry = "[$timestamp] [$channel] $message$context_str\n";
    
    $log_file = $log_dir . '/' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $channel) . '.log';
    
    if (file_exists($log_file) && filesize($log_file) > 10 * 1024 * 1024) {
        @rename($log_file, $log_file . '.' . date('YmdHis') . '.bak');
    }
    
    @file_put_contents($log_file, $log_entry, FILE_APPEND);
}
?>
