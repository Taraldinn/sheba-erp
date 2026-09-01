<?php
/**
 * AwajDigital Voice Broadcasting API Client
 * 
 * Reusable client containing central connection logic, Bearer token authentication,
 * validation, secure parsing, and SSL settings.
 */

class AwajDigitalClient {
    private $apiToken;
    private $baseUrl = 'https://api.awajdigital.com/api';
    private $timeout = 15;
    
    public function __construct($apiToken) {
        $this->apiToken = trim($apiToken);
    }
    
    /**
     * Executes HTTP requests with standard cURL options
     */
    private function request($endpoint, $method = 'GET', $data = null) {
        $url = $this->baseUrl . $endpoint;
        $ch = curl_init();
        
        $headers = [
            'Authorization: Bearer ' . $this->apiToken,
            'Accept: application/json'
        ];
        
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($data !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
                $headers[] = 'Content-Type: application/json';
            }
        }
        
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        
        if ($curlErr) {
            return [
                'success' => false,
                'status_code' => 0,
                'message' => 'Network error or timeout: ' . $curlErr
            ];
        }
        
        $json = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false,
                'status_code' => $httpCode,
                'message' => 'Invalid JSON payload from API. Raw: ' . substr($response, 0, 250)
            ];
        }
        
        return [
            'success' => ($httpCode >= 200 && $httpCode < 300),
            'status_code' => $httpCode,
            'data' => $json
        ];
    }
    
    public function getBalance() {
        return $this->request('/balance');
    }
    
    public function getSenders() {
        return $this->request('/senders');
    }
    
    public function getVoices() {
        return $this->request('/voices');
    }
    
    public function createBroadcast($requestId, $voice, $sender, $phoneNumbers) {
        $payload = [
            'request_id' => $requestId,
            'voice' => $voice,
            'sender' => $sender,
            'phone_numbers' => $phoneNumbers
        ];
        return $this->request('/broadcasts', 'POST', $payload);
    }
    
    public function getBroadcastResult($broadcastId) {
        return $this->request('/broadcasts/' . intval($broadcastId) . '/result');
    }
    
    /**
     * Uploads an audio voice file (multipart/form-data)
     */
    public function uploadVoice($name, $filePath, $mimeType, $originalName) {
        $url = $this->baseUrl . '/voices/upload';
        $ch = curl_init();
        
        $headers = [
            'Authorization: Bearer ' . $this->apiToken,
            'Accept: application/json'
        ];
        
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        curl_setopt($ch, CURLOPT_POST, true);
        
        $cfile = new CURLFile($filePath, $mimeType, $originalName);
        $postData = [
            'name' => $name,
            'audio' => $cfile
        ];
        
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        
        if ($curlErr) {
            return [
                'success' => false,
                'status_code' => 0,
                'message' => 'Upload timeout or network failure: ' . $curlErr
            ];
        }
        
        $json = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false,
                'status_code' => $httpCode,
                'message' => 'Invalid JSON from upload server. Raw: ' . substr($response, 0, 200)
            ];
        }
        
        return [
            'success' => ($httpCode === 201 || (isset($json['id']) && $httpCode >= 200 && $httpCode < 300)),
            'status_code' => $httpCode,
            'data' => $json
        ];
    }
    
    /**
     * Validates connection status across API endpoints
     */
    public function testConnection() {
        $balanceRes = $this->getBalance();
        if (!$balanceRes['success']) {
            $msg = $balanceRes['data']['message'] ?? $balanceRes['message'] ?? 'Connection Failed';
            return ['success' => false, 'message' => 'Balance verification failed: ' . $msg];
        }
        
        $sendersRes = $this->getSenders();
        if (!$sendersRes['success']) {
            $msg = $sendersRes['data']['message'] ?? $sendersRes['message'] ?? 'Connection Failed';
            return ['success' => false, 'message' => 'Senders verification failed: ' . $msg];
        }
        
        $voicesRes = $this->getVoices();
        if (!$voicesRes['success']) {
            $msg = $voicesRes['data']['message'] ?? $voicesRes['message'] ?? 'Connection Failed';
            return ['success' => false, 'message' => 'Voices verification failed: ' . $msg];
        }
        
        $balance = $balanceRes['data']['balance'] ?? 0;
        
        $activeSenders = 0;
        if (isset($sendersRes['data']['senders']) && is_array($sendersRes['data']['senders'])) {
            foreach ($sendersRes['data']['senders'] as $s) {
                if (isset($s['status']) && strtolower($s['status']) === 'active') {
                    $activeSenders++;
                }
            }
        }
        
        $approvedVoices = 0;
        if (isset($voicesRes['data']['voices']) && is_array($voicesRes['data']['voices'])) {
            foreach ($voicesRes['data']['voices'] as $v) {
                if (isset($v['status']) && strtolower($v['status']) === 'approved') {
                    $approvedVoices++;
                }
            }
        }
        
        return [
            'success' => true,
            'balance' => $balance,
            'active_senders' => $activeSenders,
            'approved_voices' => $approvedVoices
        ];
    }
}
