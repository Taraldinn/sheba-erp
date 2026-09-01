<?php
class Logger {
    private static function write($level, $message) {
        $logDir = API_ROOT . '/var/logs';
        if (!is_dir($logDir)) {
             @mkdir($logDir, 0755, true);
             @file_put_contents($logDir . '/.htaccess', "Order deny,allow\nDeny from all\n");
        }
        $date = date('Y-m-d');
        $file = $logDir . "/api_{$level}_{$date}.log";
        $timestamp = date('Y-m-d H:i:s');
        
        // Mask highly sensitive parameters before writing to the file
        if (is_array($message)) {
            $message = json_encode(mask_sensitive_data($message));
        } else {
            $message = mask_sensitive_string($message);
        }

        // Partially mask phone numbers in message
        if (is_string($message)) {
            $message = preg_replace_callback('/(\+?88)?01[3-9]\d{8}/', function($m) {
                $num = $m[0];
                return substr($num, 0, 5) . '***' . substr($num, -3);
            }, $message);
        }
        
        $logStr = "[{$timestamp}] [{$level}] {$message}" . PHP_EOL;
        
        if (file_exists($file) && filesize($file) > 10 * 1024 * 1024) {
            @rename($file, $file . '.' . date('YmdHis') . '.bak');
        }

        file_put_contents($file, $logStr, FILE_APPEND);
    }

    public static function info($message) { self::write('INFO', $message); }
    public static function error($message) { self::write('ERROR', $message); }
    public static function performance($message) { self::write('PERF', $message); }
    public static function audit($message) { self::write('AUDIT', $message); }
}
