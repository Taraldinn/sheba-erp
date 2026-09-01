<?php
// PipraPay Gateway Wrapper

class PipraPayGateway {
    private $api_key;
    private $base_url;

    public function __construct($api_key, $base_url = 'https://pay.donet.work.gd/api/create-charge') {
        $this->api_key = $api_key;
        $this->base_url = $base_url;
    }

    public function createPayment($amount, $payer) {
        $postData = [
            'amount' => $amount,
            'name' => $payer['name'],
            'email_mobile' => $payer['email_mobile'],
            'redirect_url' => $payer['redirect_url'],
            'cancel_url' => $payer['cancel_url'],
            'webhook_url' => $payer['webhook_url'],
            'metadata' => json_encode($payer['metadata'])
        ];

        $ch = curl_init($this->base_url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'MH-PIPRAPAY-API-KEY: ' . $this->api_key
        ]);

        $response = curl_exec($ch);
        curl_close($ch);
        return json_decode($response, true);
    }

    public function verifyPayment($pp_id) {
        $verify_url = str_replace('create-charge', 'verify-payment', $this->base_url);
        if ($verify_url === $this->base_url) {
            $verify_url = 'https://pay.donet.work.gd/api/verify-payment';
        }

        $ch = curl_init($verify_url . '?pp_id=' . $pp_id);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'MH-PIPRAPAY-API-KEY: ' . $this->api_key
        ]);

        $response = curl_exec($ch);
        curl_close($ch);
        return json_decode($response, true);
    }
}
?>
