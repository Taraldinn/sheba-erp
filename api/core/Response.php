<?php
class Response {
    public static function end($status, $dataOrMessage, $httpCode, $errorCode = null, $requestId = null) {
        http_response_code($httpCode);
        header('Content-Type: application/json; charset=UTF-8');
        
        $response = [
            'status' => $status,
            'request_id' => $requestId ?? uniqid('req_'),
            'timestamp' => date('c')
        ];

        if ($status === 'success') {
            $response['data'] = $dataOrMessage;
        } elseif ($status === 'fail') {
            $response['data'] = $dataOrMessage; // fail means validation/client issue (4xx)
        } else {
            // error means server issue (5xx or specific auth issues)
            $response['message'] = $dataOrMessage;
            if ($errorCode) {
                $response['code'] = $errorCode;
            }
        }

        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success($data, $httpCode = 200, $requestId = null) {
        self::end('success', $data, $httpCode, null, $requestId);
    }

    public static function fail($data, $httpCode = 400, $requestId = null) {
        self::end('fail', $data, $httpCode, null, $requestId);
    }

    public static function error($message, $errorCode = 'INTERNAL_ERROR', $httpCode = 500, $requestId = null) {
        self::end('error', $message, $httpCode, $errorCode, $requestId);
    }
}
