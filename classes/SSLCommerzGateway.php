<?php
// classes/SSLCommerzGateway.php

class SSLCommerzGateway {
    private $store_id;
    private $store_passwd;
    private $is_sandbox;
    private $base_url;

    public function __construct($store_id, $store_passwd, $is_sandbox = false) {
        $this->store_id = $store_id;
        $this->store_passwd = $store_passwd;
        $this->is_sandbox = $is_sandbox;
        
        if ($this->is_sandbox) {
            $this->base_url = 'https://sandbox.sslcommerz.com';
        } else {
            $this->base_url = 'https://securepay.sslcommerz.com';
        }
    }

    private function callAPI($endpoint, $post_data = null) {
        $url = $this->base_url . $endpoint;
        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        
        if ($post_data !== null) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post_data));
        }

        $result = curl_exec($ch);
        $error = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $logFile = __DIR__ . '/../debug_sslcommerz.log';
        $logMsg = date('Y-m-d H:i:s') . " | ENV: " . ($this->is_sandbox ? 'Sandbox' : 'Production') . " | URL: $url | HTTP: $httpCode\n";
        
        // Mask passwords in log
        if ($post_data !== null) {
            $safe_data = $post_data;
            if (isset($safe_data['store_passwd'])) $safe_data['store_passwd'] = '[MASKED]';
            $logMsg .= "Payload: " . json_encode($safe_data) . "\n";
        }
        
        $logMsg .= "Response: " . $result . "\n";
        if ($error) $logMsg .= "CURL Error: " . $error . "\n";
        $logMsg .= "-----------------------------------\n";
        @file_put_contents($logFile, $logMsg, FILE_APPEND);

        if ($error) {
            return ['status' => 'FAILED', 'failedreason' => $error];
        }

        $decoded = json_decode($result, true);
        if ($decoded === null) {
            return ['status' => 'FAILED', 'failedreason' => 'Invalid JSON Response: ' . $result];
        }
        return $decoded;
    }

    public function createPayment($amount, $trx_id, $customer_info, $urls) {
        $post_data = [
            'store_id' => $this->store_id,
            'store_passwd' => $this->store_passwd,
            'total_amount' => strval(number_format($amount, 2, '.', '')),
            'currency' => 'BDT',
            'tran_id' => $trx_id,
            'success_url' => $urls['success_url'],
            'fail_url' => $urls['fail_url'],
            'cancel_url' => $urls['cancel_url'],
            'ipn_url' => $urls['ipn_url'],
            'cus_name' => $customer_info['name'],
            'cus_email' => $customer_info['email'] ?: 'noreply@isp.com',
            'cus_add1' => $customer_info['address'] ?: 'Dhaka',
            'cus_city' => 'Dhaka',
            'cus_state' => 'Dhaka',
            'cus_postcode' => '1000',
            'cus_country' => 'Bangladesh',
            'cus_phone' => $customer_info['phone'] ?: '01700000000',
            'shipping_method' => 'NO',
            'product_category' => 'Internet Service',
            'product_profile' => 'non-physical-goods',
            'product_name' => 'ISP Bill Recharge'
        ];

        return $this->callAPI('/gwprocess/v4/api.php', $post_data);
    }

    public function validatePayment($val_id) {
        $endpoint = "/validator/api/validationserverAPI.php?val_id=" . urlencode($val_id) . "&store_id=" . urlencode($this->store_id) . "&store_passwd=" . urlencode($this->store_passwd) . "&v=1&format=json";
        return $this->callAPI($endpoint, null);
    }
}
?>
