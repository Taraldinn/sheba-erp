<?php
// BKashGateway.php

class BKashGateway {
    private $app_key;
    private $app_secret;
    private $username;
    private $password;
    private $base_url;
    private $proxy;

    public function __construct($app_key, $app_secret, $username, $password, $sandbox = false) {
        $this->app_key = $app_key;
        $this->app_secret = $app_secret;
        $this->username = $username;
        $this->password = $password;
        $this->base_url = $sandbox ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta' : 'https://tokenized.pay.bka.sh/v1.2.0-beta';
        // Some bKash accounts use checkout.pay.bka.sh instead. We will try tokenized first.
        $this->proxy = null;
    }

    private function callAPI($method, $endpoint, $headers = [], $data = null) {
        $url = $this->base_url . $endpoint;
        $ch = curl_init($url);
        
        // Default headers for authentication (token grant)
        $defaultHeaders = [
            'Content-Type: application/json',
            'Accept: application/json'
        ];
        
        // Only add username/password if NOT already in headers to avoid duplicates
        $hasUsername = false;
        foreach($headers as $h) { if(stripos($h, 'username:') === 0) $hasUsername = true; }

        if (strpos($endpoint, 'token/grant') !== false && !$hasUsername) {
             $defaultHeaders[] = 'username: ' . $this->username;
             $defaultHeaders[] = 'password: ' . $this->password;
        }
        $allHeaders = array_merge($defaultHeaders, $headers);

        curl_setopt($ch, CURLOPT_HTTPHEADER, $allHeaders);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        
        if ($method == 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($data) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_SLASHES));
        }

        $result = curl_exec($ch);
        $error = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // Safe Debug Logging
        $safeHeaders = $allHeaders;
        foreach ($safeHeaders as &$header) {
            if (stripos($header, 'password:') === 0) {
                $header = 'password: [MASKED]';
            }
            if (stripos($header, 'Authorization:') === 0) {
                $header = 'Authorization: [MASKED]';
            }
        }
        unset($header);

        $safeData = $data;
        if (is_array($safeData)) {
            if (isset($safeData['app_secret'])) {
                $safeData['app_secret'] = '[MASKED]';
            }
        }

        $maskedResult = $result;
        if (strpos($endpoint, 'token/grant') !== false) {
            $decodedResult = json_decode($result, true);
            if (is_array($decodedResult)) {
                if (isset($decodedResult['id_token'])) {
                    $decodedResult['id_token'] = substr($decodedResult['id_token'], 0, 8) . "..." . substr($decodedResult['id_token'], -8);
                }
                if (isset($decodedResult['refresh_token'])) {
                    $decodedResult['refresh_token'] = '[MASKED]';
                }
                $maskedResult = json_encode($decodedResult, JSON_UNESCAPED_SLASHES);
            }
        }

        $env = (strpos($this->base_url, 'sandbox') !== false) ? 'Sandbox' : 'Production';
        $logFile = __DIR__ . '/../debug_bkash.log';
        $logMsg = date('Y-m-d H:i:s') . " | Environment: $env | Method: $method | URL: $url | HTTP: $httpCode\n";
        $logMsg .= "Headers: " . json_encode($safeHeaders) . "\n";
        if ($safeData) $logMsg .= "Payload: " . json_encode($safeData) . "\n";
        $logMsg .= "Response: " . $maskedResult . "\n";
        if ($error) $logMsg .= "CURL Error: " . $error . "\n";
        $logMsg .= "-----------------------------------\n";
        @file_put_contents($logFile, $logMsg, FILE_APPEND);

        if ($error) {
            return ['status' => 'fail', 'msg' => $error, 'http_code' => $httpCode, 'raw' => $result];
        }
        $decoded = json_decode($result, true);
        if ($decoded === null) {
             return ['status' => 'fail', 'msg' => 'Invalid JSON Response', 'http_code' => $httpCode, 'raw' => $result];
        }
        return $decoded;
    }

    public function grantToken() {
        $data = [
            'app_key' => $this->app_key,
            'app_secret' => $this->app_secret
        ];
        
        // Grant token headers are slightly different (no authorization token yet)
        $headers = [
            'username: ' . $this->username,
            'password: ' . $this->password
        ];

        return $this->callAPI('POST', '/tokenized/checkout/token/grant', $headers, $data);
    }

    public function createPayment($token, $amount, $invoice, $callbackUrl) {
        $headers = [
            'Authorization: ' . $token,
            'X-APP-Key: ' . $this->app_key
        ];
        
        $data = [
            'payerReference' => $invoice,
            'callbackURL' => $callbackUrl,
            'amount' => strval(number_format($amount, 2, '.', '')),
            'currency' => 'BDT',
            'intent' => 'sale',
            'merchantInvoiceNumber' => $invoice,
            'mode' => '0011'
        ];

        return $this->callAPI('POST', '/tokenized/checkout/create', $headers, $data);
    }

    public function executePayment($token, $paymentID) {
        $headers = [
            'Authorization: ' . $token,
            'X-APP-Key: ' . $this->app_key
        ];
        
        $data = [
            'paymentID' => $paymentID
        ];

        return $this->callAPI('POST', '/tokenized/checkout/execute', $headers, $data);
    }

    public function queryPayment($token, $paymentID) {
        $headers = [
            'Authorization: ' . $token,
            'X-APP-Key: ' . $this->app_key
        ];

        return $this->callAPI('GET', '/tokenized/checkout/payment/status?paymentID=' . $paymentID, $headers);
    }
    
    public function searchTransaction($token, $trxID) {
         $headers = [
            'Authorization: ' . $token,
            'X-APP-Key: ' . $this->app_key
        ];
        return $this->callAPI('GET', '/tokenized/checkout/general/searchTransaction?trxID=' . $trxID, $headers);
    }
}
?>
