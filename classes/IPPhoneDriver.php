<?php
// classes/IPPhoneDriver.php

abstract class IPPhoneDriver {
    protected $config;
    
    public function __construct(array $config) {
        $this->config = $config;
    }
    
    /**
     * Trigger a click-to-call connection between staff extension and customer phone.
     * @param string $phone Customer phone number
     * @param string $extension Staff extension
     * @return array Array containing success (bool), message (string), and raw_response (string)
     */
    abstract public function clickToCall(string $phone, string $extension): array;
    
    /**
     * Trigger a voice broadcast or audio alert to a customer.
     * @param string $phone Customer phone number
     * @param string $message Text message or path/URL to audio file
     * @param bool $is_audio True if message is an audio file path, False if text (for TTS)
     * @return array Array containing success (bool), message (string), and raw_response (string)
     */
    abstract public function sendVoiceSMS(string $phone, string $message, bool $is_audio = true): array;
    
    /**
     * Factory method to load the active provider driver
     */
    public static function getDriver(PDO $pdo, int $owner_id = 1, bool $ignore_sip = false): ?IPPhoneDriver {
        $sip = null;
        if (!$ignore_sip) {
            // 1. Check if there is an active Main Direct SIP number
            $tenant_id = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
            try {
                $sip_stmt = $pdo->prepare("SELECT * FROM ip_phone_numbers WHERE tenant_id = ? AND staff_id = ? AND is_main = 1 LIMIT 1");
                $sip_stmt->execute([$tenant_id, $owner_id]);
                $sip = $sip_stmt->fetch();
            } catch (Exception $e) {
                // Table doesn't exist yet or column mismatch
                $sip = null;
            }
        }

        // 2. Fetch the API Gateway configuration
        $config = null;
        try {
            $stmt = $pdo->prepare("SELECT * FROM ip_phone_configs WHERE staff_id = ? LIMIT 1");
            $stmt->execute([$owner_id]);
            $config = $stmt->fetch();
        } catch (Exception $e) {
            // Table doesn't exist yet or column mismatch
            $config = null;
        }

        // If neither is configured, return null (disabled)
        if (!$sip && (!$config || !$config['enabled'])) {
            return null;
        }

        // If we have an active Main Direct SIP number, let it populate/override credentials
        if ($sip) {
            if ($config) {
                // If we have an API Gateway configuration, use its base URL but override credentials with the active Direct SIP number
                $config['username'] = $sip['ip_number'];
                $config['password_token'] = $sip['password']; // kept encrypted for decrypt() call below
                $config['caller_id'] = $sip['ip_number'];
                $config['enabled'] = 1;
            } else {
                // If there is no API Gateway configuration at all, create a virtual generic REST config
                // We use a default calling relay or standard HTTP mapping to the SIP server
                // We enable test_mode (Demo) by default so that testing simulates success rather than hitting SIP ports via HTTP
                $default_base_url = "http://" . $sip['sip_server'] . ":" . $sip['port'] . "/dial";
                $config = [
                    'driver' => 'generic_rest',
                    'base_url' => $default_base_url,
                    'username' => $sip['ip_number'],
                    'password_token' => $sip['password'],
                    'caller_id' => $sip['ip_number'],
                    'extension' => '100',
                    'enabled' => 1,
                    'test_mode' => 1
                ];
            }
        }

        // Decrypt password/token
        $config['password_token'] = self::decrypt($config['password_token']);
        
        if ($config['test_mode']) {
            return new DemoDriver($config);
        }
        
        switch ($config['driver']) {
            case 'generic_rest':
                return new GenericRestDriver($config);
            case 'flemsoft':
                return new FlemsoftDriver($config);
            default:
                return new DemoDriver($config);
        }
    }
    
    /**
     * Simple secure encryption helper for passwords
     */
    public static function encrypt(string $plainText): string {
        $key = 'callcenter-auth-key-secret-2026';
        $iv = substr(hash('sha256', $key), 0, 16);
        return base64_encode(openssl_encrypt($plainText, 'AES-256-CBC', $key, 0, $iv));
    }
    
    public static function decrypt(string $cipherText): string {
        $key = 'callcenter-auth-key-secret-2026';
        $iv = substr(hash('sha256', $key), 0, 16);
        return openssl_decrypt(base64_decode($cipherText), 'AES-256-CBC', $key, 0, $iv) ?: $cipherText;
    }
}

/**
 * Generic REST API Driver
 */
class GenericRestDriver extends IPPhoneDriver {
    
    public function clickToCall(string $phone, string $extension): array {
        $url = $this->config['base_url'];
        $username = $this->config['username'];
        $token = $this->config['password_token'];
        $caller_id = $this->config['caller_id'];
        
        // Dynamic payload substitution supporting standard formats
        $placeholders = [
            '{USERNAME}' => $username,
            '{TOKEN}' => $token,
            '{CALLER_ID}' => $caller_id,
            '{EXTENSION}' => $extension,
            '{PHONE}' => $phone
        ];
        
        // Build query string or POST parameters
        $ch = curl_init();
        
        // Check if there are query parameters in base_url
        $processed_url = str_replace(array_keys($placeholders), array_values($placeholders), $url);
        
        // If placeholder strings aren't in the URL, send as POST fields standard REST structure
        if (strpos($url, '{') === false) {
            $post_fields = [
                'username' => $username,
                'token' => $token,
                'caller_id' => $caller_id,
                'extension' => $extension,
                'phone' => $phone,
                'action' => 'call'
            ];
            curl_setopt($ch, CURLOPT_URL, $processed_url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post_fields));
        } else {
            // GET request with placeholders replaced
            curl_setopt($ch, CURLOPT_URL, $processed_url);
            curl_setopt($ch, CURLOPT_POST, false);
        }
        
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($err) {
            return [
                'success' => false,
                'message' => "CURL Error: " . $err,
                'raw_response' => "HTTP Code: $http_code | Error: $err"
            ];
        }
        
        // Simple success heuristic: HTTP 200 or 201 or specific keywords in body
        $is_success = ($http_code >= 200 && $http_code < 300);
        
        return [
            'success' => $is_success,
            'message' => $is_success ? "Call initiated successfully via REST API." : "API returned HTTP error code: $http_code",
            'raw_response' => "HTTP Code: $http_code | Body: " . substr($response, 0, 1000)
        ];
    }
    
    public function sendVoiceSMS(string $phone, string $message, bool $is_audio = true): array {
        $url = $this->config['base_url'];
        $username = $this->config['username'];
        $token = $this->config['password_token'];
        $caller_id = $this->config['caller_id'];
        
        $placeholders = [
            '{USERNAME}' => $username,
            '{TOKEN}' => $token,
            '{CALLER_ID}' => $caller_id,
            '{PHONE}' => $phone,
            '{MESSAGE}' => urlencode($message),
            '{TYPE}' => $is_audio ? 'audio' : 'tts'
        ];
        
        $ch = curl_init();
        $processed_url = str_replace(array_keys($placeholders), array_values($placeholders), $url);
        
        if (strpos($url, '{') === false) {
            $post_fields = [
                'username' => $username,
                'token' => $token,
                'caller_id' => $caller_id,
                'phone' => $phone,
                'message' => $message,
                'type' => $is_audio ? 'audio' : 'tts',
                'action' => 'voice_sms'
            ];
            curl_setopt($ch, CURLOPT_URL, $processed_url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post_fields));
        } else {
            curl_setopt($ch, CURLOPT_URL, $processed_url);
            curl_setopt($ch, CURLOPT_POST, false);
        }
        
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($err) {
            return [
                'success' => false,
                'message' => "CURL Error: " . $err,
                'raw_response' => "HTTP Code: $http_code | Error: $err"
            ];
        }
        
        $is_success = ($http_code >= 200 && $http_code < 300);
        
        return [
            'success' => $is_success,
            'message' => $is_success ? "Voice SMS campaign sent successfully via REST API." : "API returned HTTP error code: $http_code",
            'raw_response' => "HTTP Code: $http_code | Body: " . substr($response, 0, 1000)
        ];
    }
}

/**
 * Flemsoft Voice API Driver
 */
class FlemsoftDriver extends IPPhoneDriver {
    
    public function clickToCall(string $phone, string $extension): array {
        // Flemsoft is primarily a voice broadcast API, but we can trigger it as a voice request
        return $this->sendVoiceSMS($phone, "Click-to-call initiated via Flemsoft");
    }
    
    public function sendVoiceSMS(string $phone, string $message, bool $is_audio = true): array {
        $apiKey = $this->config['password_token'];
        $campaignName = $this->config['caller_id'];
        
        // Clean phone number to Bangladeshi format 01XXXXXXXXX
        $cleanPhone = preg_replace('/^(\+?88)?0?/', '0', trim($phone));
        
        $url = "https://flemsoft.com/voiceapi/newrequest/?"
             . "api_key="       . urlencode($apiKey)
             . "&number="       . urlencode($cleanPhone)
             . "&campaign_name=" . urlencode($campaignName);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $response = curl_exec($ch);
        $err = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($err) {
            return [
                'success' => false,
                'message' => "Flemsoft API Connection Error: " . $err,
                'raw_response' => "HTTP Code: $http_code | Error: $err"
            ];
        }

        $result = json_decode($response, true);
        $is_success = ($result && isset($result['status']) && strtolower($result['status']) === 'success');
        
        return [
            'success' => $is_success,
            'message' => $is_success ? ($result['message'] ?? 'Flemsoft request successful.') : ($result['message'] ?? 'Flemsoft request failed.'),
            'raw_response' => "HTTP Code: $http_code | Response: " . substr($response, 0, 1000)
        ];
    }
}

/**
 * Demo / Test Mode Driver for Mocking Operations
 */
class DemoDriver extends IPPhoneDriver {
    
    public function clickToCall(string $phone, string $extension): array {
        // Simulate a successful Answered call for demo/test validation
        $status = 'Answered';
        $duration = rand(30, 95);
        
        $mock_response = json_encode([
            'status' => 'success',
            'session_id' => 'mock-session-' . rand(100000, 999999),
            'call_status' => $status,
            'duration' => $duration,
            'recording_url' => 'https://example.com/mock-recordings/call-' . rand(5000, 20000) . '.wav',
            'message' => 'This is a simulated demo call response.'
        ], JSON_PRETTY_PRINT);
        
        return [
            'success' => true,
            'message' => "Simulated call status: $status ($duration seconds)",
            'raw_response' => $mock_response
        ];
    }
    
    public function sendVoiceSMS(string $phone, string $message, bool $is_audio = true): array {
        // Simulate a successful Sent status for voice SMS demo
        $status = 'Sent';
        
        $mock_response = json_encode([
            'status' => 'success',
            'sms_id' => 'mock-sms-' . rand(100000, 999999),
            'error' => null,
            'campaign' => 'Demo Campaign Broadcast'
        ], JSON_PRETTY_PRINT);
        
        return [
            'success' => true,
            'message' => "Simulated Voice SMS successfully sent.",
            'raw_response' => $mock_response
        ];
    }
}
