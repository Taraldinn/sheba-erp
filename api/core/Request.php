<?php
class Request {
    private $method;
    private $path;
    private $headers;
    private $body;
    private $queryParams;
    private $requestId;
    private $tenantData;
    private $customerData;

    public function __construct() {
        $this->method = $_SERVER['REQUEST_METHOD'];
        
        // First try to use the raw REQUEST_URI for consistency
        $rawPath = '/' . trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
        
        // Subdirectory deployment safety: strip any leading subdirectory path before /api/ or /v1/
        $apiPos = strpos($rawPath, '/api/');
        if ($apiPos !== false && $apiPos > 0) {
            $rawPath = substr($rawPath, $apiPos);
        } else {
            $v1Pos = strpos($rawPath, '/v1/');
            if ($v1Pos !== false && $v1Pos > 0) {
                $rawPath = substr($rawPath, $v1Pos);
            }
        }
        
        // If deployed inside an "api" folder, the server might strip "/api" depending on DocumentRoot.
        // Or if it's there natively, we want to ensure the routes match. 
        // Our routes are defined as `/api/v1/...`.
        // If the incoming path is just `/v1/health-check` because of .htaccess on a subdomain,
        // we prepend `/api` to match our router definitions.
        if (strpos($rawPath, '/api/') !== 0 && strpos($rawPath, '/v1/') === 0) {
            $rawPath = '/api' . $rawPath;
        }

        // Sometimes .htaccess passes the URL via $_GET['url'] with missing slashes
        if (isset($_GET['url']) && strpos($rawPath, $_GET['url']) === false) {
             $urlParam = '/' . trim($_GET['url'], '/');
             if (strpos($urlParam, '/api/') !== 0 && strpos($urlParam, '/v1/') === 0) {
                 $urlParam = '/api' . $urlParam;
             }
             // Prefer standard REQUEST_URI, but if it's utterly broken, fallback to GET param
             if (strlen($urlParam) > 4) {
                 $rawPath = $urlParam;
             }
        }
        
        $this->path = $rawPath;
        
        $headers = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
        if (!isset($headers['authorization'])) {
            if (isset($headers['x-api-token'])) {
                $headers['authorization'] = 'Bearer ' . trim($headers['x-api-token']);
            } elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) {
                $headers['authorization'] = trim($_SERVER['HTTP_AUTHORIZATION']);
            } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
                $headers['authorization'] = trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
            } elseif (function_exists('apache_request_headers')) {
                $apacheHeaders = apache_request_headers();
                if (isset($apacheHeaders['Authorization'])) {
                    $headers['authorization'] = trim($apacheHeaders['Authorization']);
                }
            }
        }
        $this->headers = $headers;
        $this->body = file_get_contents('php://input');
        $this->queryParams = $_GET;
        $this->requestId = $this->headers['x-request-id'] ?? uniqid('req_');
    }

    public function getMethod() { return $this->method; }
    public function getPath() { return $this->path; }
    public function getHeader($key) { return $this->headers[strtolower($key)] ?? null; }
    public function getRawBody() { return $this->body; }
    
    public function getJsonBody() {
        if (strpos(strtolower($this->getHeader('Content-Type') ?? ''), 'application/json') === false && $this->method === 'POST') {
             Response::error('Content-Type must be application/json', 'INVALID_CONTENT_TYPE', 415, $this->requestId);
        }
        $data = json_decode($this->body, true);
        if (json_last_error() !== JSON_ERROR_NONE && $this->method === 'POST') {
             Response::error('Invalid JSON payload', 'INVALID_JSON', 400, $this->requestId);
        }
        return $data;
    }

    public function getQueryParam($key, $default = null) {
        return $this->queryParams[$key] ?? $default;
    }

    public function getRequestId() { return $this->requestId; }

    public function getSubdomain() {
        $host = $this->getHeader('Host') ?? $_SERVER['HTTP_HOST'];
        $parts = explode('.', $host);
        return count($parts) > 2 ? $parts[0] : null; // basic subdomain extraction
    }

    public function setTenant($tenantData) {
        $this->tenantData = $tenantData;
    }

    public function getTenant() {
        return $this->tenantData;
    }

    public function setCustomer($customerData) {
        $this->customerData = $customerData;
    }

    public function getCustomer() {
        return $this->customerData;
    }
}
