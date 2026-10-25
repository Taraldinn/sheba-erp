<?php
// classes/olt_drivers/HSGQEponDriver.php

require_once __DIR__ . '/OLTInterface.php';

class HSGQEponDriver implements OLTInterface {
    private $ctx;

    public function __construct($context) {
        $this->ctx = $context;
    }

    public function getOnuList($interface = '') {
        return array();
    }

    public function getOnuPower($interface = '') {
        return array();
    }

    public function getUptime($interface = '') {
        return array();
    }

    public function rebootOnu($interface, $onu_id = null) {
        // If $onu_id is null, it means $interface is passed as "port:onu_id"
        if ($onu_id === null) {
            $parts = explode(':', $interface);
            if (count($parts) !== 2) return false;
            $port = $parts[0];
            $onu_idx = $parts[1];
        } else {
            // $interface is "epon 0/X" or similar, $onu_id is ONU index
            if (preg_match('/(\d+)$/', $interface, $m)) {
                $port = $m[1];
            } else {
                $port = 1;
            }
            $onu_idx = $onu_id;
        }

        if (!$this->ctx->telnet_connect()) return false;
        
        try {
            // HSGQ Telnet command to reboot ONU
            $cmd = "epon reboot-onu interface epon 0/$port onu $onu_idx\r\n";
            $this->ctx->log("Sending HSGQ reboot command: $cmd");
            $this->ctx->write($cmd);
            sleep(1);
            $output = $this->ctx->telnet_read(5);
            
            if (strpos($output, 'y/n') !== false || strpos($output, 'confirm') !== false) {
                $this->ctx->write("y\r\n");
                sleep(1);
                $output .= $this->ctx->telnet_read(5);
            }
            
            $this->ctx->log("HSGQ Reboot output: " . str_replace("\n", " ", $output));
            $this->ctx->telnet_disconnect();
            return true;
        } catch (Exception $e) {
            $this->ctx->log("HSGQ Reboot error: " . $e->getMessage(), 'ERROR');
            return false;
        }
    }

    public function testLogin() {
        $protocol = $this->ctx->getHttpProtocol();
        $ip = $this->ctx->getOltIp();
        $port = $this->ctx->getWebPort();
        $baseUrl = "$protocol://$ip:$port";
        $token = $this->login($baseUrl);
        return !empty($token);
    }

    public function monitorAllOnus() {
        $data = array('onu_list' => array(), 'power' => array(), 'mactable' => array(), 'uptime' => array());
        
        $protocol = $this->ctx->getHttpProtocol();
        $ip = $this->ctx->getOltIp();
        $port = $this->ctx->getWebPort();
        $baseUrl = "$protocol://$ip:$port";
        
        $token = $this->login($baseUrl);
        if (empty($token)) {
            $this->ctx->log("HSGQ Monitor failed: Authentication token could not be obtained", 'ERROR');
            return false;
        }
        
        // Loop ports 1 to 16
        for ($p = 1; $p <= 16; $p++) {
            $result = $this->getOnuListFromPort($baseUrl, $token, $p);
            if (!$result['success']) {
                // If it fails, check if the OLT is responding or if it's just an invalid port.
                // Usually we just continue to scan next ports.
                continue;
            }
            
            foreach ($result['data'] as $onu) {
                if (!is_array($onu)) continue;
                
                $onu_idx = $onu['onu_id'] ?? 0;
                $full_id = "$p:$onu_idx";
                
                // Normalise MAC
                $mac_raw = $onu['macaddr'] ?? '';
                $mac_clean = strtoupper(str_replace([':', '-', '.'], '', $mac_raw));
                $mac = implode(':', str_split($mac_clean, 2));
                
                $status = $onu['status'] ?? 'offline';
                
                $data['onu_list'][] = array(
                    'onu_id' => $full_id,
                    'mac' => $mac,
                    'status' => $status,
                    'port' => $p
                );
                
                // Power
                $rx_power = $onu['receive_power'] ?? 'N/A';
                $data['power'][$full_id] = array(
                    'rx_power' => $rx_power,
                    'tx_power' => 'N/A',
                    'temperature' => 'N/A',
                    'voltage' => 'N/A'
                );
                
                // Uptime
                $data['uptime'][$full_id] = $onu['alive_time'] ?? 'N/A';
            }
        }
        
        // Fetch learned MAC table
        $macResult = $this->getPonMacTable($baseUrl, $token);
        if ($macResult['success'] && is_array($macResult['data'])) {
            $data['mactable'] = $this->buildCallerIdMap($macResult['data']);
        } else {
            $this->ctx->log("HSGQ MAC table fetch warning: " . $macResult['error'], 'WARNING');
        }
        
        return $data;
    }

    private function httpRequest($url, $method = 'GET', $headers = [], $body = null) {
        $ch = curl_init();
        if ($ch === false) {
            return ['status' => 0, 'body' => '', 'headers' => [], 'error' => 'Unable to initialise cURL.'];
        }

        $responseHeaders = [];
        $timeout = $this->ctx->getTimeout() ?: 10;
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADERFUNCTION => function ($curl, string $line) use (&$responseHeaders): int {
                $length = strlen($line);
                $line = trim($line);
                if ($line === '' || !str_contains($line, ':')) {
                    return $length;
                }
                list($name, $value) = explode(':', $line, 2);
                $responseHeaders[strtolower(trim($name))] = trim($value);
                return $length;
            },
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_ENCODING => '',
            CURLOPT_USERAGENT => 'Mozilla/5.0 HSGQ-Monitor/4.0',
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $responseBody = curl_exec($ch);
        $error = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        return [
            'status' => $status,
            'body' => is_string($responseBody) ? $responseBody : '',
            'headers' => $responseHeaders,
            'error' => $error,
        ];
    }

    private function login($baseUrl) {
        $username = $this->ctx->getUsername();
        $password = $this->ctx->getPassword();
        
        $loginKey = $this->ctx->getSnmpCommunity();
        if (empty($loginKey) || $loginKey === 'public' || strlen($loginKey) !== 32) {
            $loginKey = '1761d487ba0cde5f285059b5cca9a22c';
        }

        $payload = [
            'method' => 'set',
            'param' => [
                'name' => $username,
                'key' => $loginKey,
                'value' => base64_encode($password),
                'captcha_v' => '',
            ],
        ];

        $response = $this->httpRequest(
            $baseUrl . '/userlogin?form=login',
            'POST',
            [
                'Accept: application/json, text/plain, */*',
                'Content-Type: application/json;charset=UTF-8',
                'Origin: ' . $baseUrl,
                'Referer: ' . $baseUrl . '/',
                'X-Token: null',
            ],
            json_encode($payload, JSON_UNESCAPED_SLASHES)
        );

        $token = $response['headers']['x-token'] ?? '';
        $decoded = json_decode($response['body'], true);

        if ($token === '' && is_array($decoded)) {
            foreach (['token', 'x_token', 'x-token', 'data'] as $key) {
                if (isset($decoded[$key]) && is_string($decoded[$key]) && strlen($decoded[$key]) >= 16) {
                    $token = $decoded[$key];
                    break;
                }
            }
        }

        return $token;
    }

    private function getOnuListFromPort($baseUrl, $token, $portId) {
        $url = $baseUrl . '/onu_allow_list?port_id=' . $portId . '&t=' . (string) round(microtime(true) * 1000);
        $response = $this->httpRequest($url, 'GET', [
            'Accept: application/json, text/plain, */*',
            'Referer: ' . $baseUrl . '/',
            'X-Token: ' . $token,
        ]);

        if ($response['error'] !== '') {
            return ['success' => false, 'data' => [], 'error' => $response['error']];
        }

        $decoded = json_decode($response['body'], true);
        if (!is_array($decoded)) {
            return ['success' => false, 'data' => [], 'error' => 'OLT returned invalid JSON.'];
        }

        $data = $decoded['data'] ?? [];
        if (!is_array($data)) {
            $data = [];
        }

        $success = (($decoded['code'] ?? null) === 1 || ($decoded['message'] ?? '') === 'success') && $response['status'] === 200;
        if (!$success && $data !== []) {
            $success = true;
        }

        return [
            'success' => $success,
            'data' => $data,
            'error' => $success ? '' : ($decoded['message'] ?? 'ONU list request failed.'),
        ];
    }

    private function getPonMacTable($baseUrl, $token) {
        // Initialize table
        $this->httpRequest($baseUrl . '/pon_mac?form=table', 'GET', [
            'Accept: application/json, text/plain, */*',
            'Referer: ' . $baseUrl . '/',
            'X-Token: ' . $token,
        ]);

        $url = $baseUrl . '/pon_mac_table?t=' . (string) round(microtime(true) * 1000);
        $response = $this->httpRequest($url, 'GET', [
            'Accept: application/json, text/plain, */*',
            'Referer: ' . $baseUrl . '/',
            'X-Token: ' . $token,
        ]);

        if ($response['error'] !== '') {
            return ['success' => false, 'data' => [], 'error' => $response['error']];
        }

        $rows = $this->parsePonMacResponse($response['body']);
        return ['success' => !empty($rows), 'data' => $rows, 'error' => empty($rows) ? 'PON MAC table parsing failed' : ''];
    }

    private function parsePonMacResponse($raw) {
        $raw = trim($raw);
        if ($raw === '') return [];

        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw) ?? $raw;
        $decoded = json_decode($raw, true);

        if (is_array($decoded)) {
            $candidates = [$decoded];
            foreach (['data', 'rows', 'list', 'table', 'items', 'result'] as $key) {
                if (isset($decoded[$key]) && is_array($decoded[$key])) {
                    $candidates[] = $decoded[$key];
                }
            }
            if (isset($decoded['data']) && is_array($decoded['data'])) {
                foreach (['rows', 'list', 'items', 'table'] as $key) {
                    if (isset($decoded['data'][$key]) && is_array($decoded['data'][$key])) {
                        $candidates[] = $decoded['data'][$key];
                    }
                }
            }

            foreach ($candidates as $candidate) {
                $rows = $this->flattenMacRows($candidate);
                if (!empty($rows)) return $rows;
            }
        }

        // Try extracting array
        $firstArray = strpos($raw, '[');
        $lastArray = strrpos($raw, ']');
        if ($firstArray !== false && $lastArray !== false && $lastArray > $firstArray) {
            $part = substr($raw, $firstArray, $lastArray - $firstArray + 1);
            $decoded = json_decode($part, true);
            if (is_array($decoded)) {
                $rows = $this->flattenMacRows($decoded);
                if (!empty($rows)) return $rows;
            }
        }

        // Last fallback: delimited text
        $lines = preg_split('/\R+/', $raw) ?: [];
        $rows = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || stripos($line, 'mac') === 0) continue;
            $parts = preg_split('/\t+|\s{2,}|,/', $line) ?: [];
            if (count($parts) < 4) continue;
            $mac = '';
            foreach ($parts as $part) {
                if (preg_match('/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i', trim($part))) {
                    $mac = strtolower(trim($part));
                    break;
                }
            }
            if ($mac === '') continue;
            $rows[] = [
                'mac' => $mac,
                'vlan_id' => $parts[1] ?? '',
                'port_id' => $parts[2] ?? '',
                'onu_id' => $parts[3] ?? '',
                'name' => $parts[4] ?? '',
                'type' => $parts[5] ?? '',
            ];
        }
        return $rows;
    }

    private function flattenMacRows($candidate) {
        $isList = array_is_list($candidate);
        if ($isList) {
            $rows = [];
            foreach ($candidate as $item) {
                if (is_array($item)) {
                    if ($this->looksLikeMacRow($item)) {
                        $rows[] = $item;
                    } else {
                        $nested = $this->flattenMacRows($item);
                        if (!empty($nested)) $rows = array_merge($rows, $nested);
                    }
                }
            }
            return $rows;
        }

        if ($this->looksLikeMacRow($candidate)) {
            return [$candidate];
        }

        foreach ($candidate as $value) {
            if (is_array($value)) {
                $rows = $this->flattenMacRows($value);
                if (!empty($rows)) return $rows;
            }
        }
        return [];
    }

    private function looksLikeMacRow($row) {
        foreach (['mac', 'macaddr', 'mac_addr', 'mac_address', 'MAC', 'Mac'] as $key) {
            if (isset($row[$key]) && is_string($row[$key]) && preg_match('/(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/i', $row[$key])) {
                return true;
            }
        }
        return false;
    }

    private function firstValue($row, $keys, $default = '') {
        foreach ($keys as $key) {
            if (array_key_exists($key, $row) && $row[$key] !== null && $row[$key] !== '') {
                return $row[$key];
            }
        }
        return $default;
    }

    private function normalizeNumericId($value) {
        if (is_int($value)) return $value;
        if (is_numeric($value)) return (int)$value;
        $text = (string)$value;
        if (preg_match_all('/\d+/', $text, $matches) && !empty($matches[0])) {
            return (int)end($matches[0]);
        }
        return 0;
    }

    private function normalizePonId($value) {
        if (is_int($value)) return $value;
        if (is_numeric($value)) return (int)$value;
        $text = (string)$value;
        if (preg_match('/PON\s*0*(\d+)/i', $text, $m)) return (int)$m[1];
        if (preg_match('/\d+/', $text, $m)) return (int)$m[0];
        return 0;
    }

    private function normalizeMac($mac) {
        $mac = strtolower(trim($mac));
        $mac = str_replace('-', ':', $mac);
        return $mac;
    }

    private function buildCallerIdMap($rows) {
        $map = [];
        foreach ($rows as $row) {
            $mac = $this->normalizeMac((string)$this->firstValue($row, ['mac', 'macaddr', 'mac_addr', 'mac_address', 'MAC', 'Mac']));
            if (!preg_match('/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/', $mac)) continue;

            $pon = $this->normalizePonId($this->firstValue($row, ['pon', 'pon_id', 'port_id', 'port', 'port_name', 'pon_port', 'Port ID', 'portid']));
            $onu = $this->normalizeNumericId($this->firstValue($row, ['onu_id', 'onuid', 'onu', 'onu_index', 'ONU ID', 'onuId']));
            if ($pon <= 0 || $onu <= 0) continue;

            $key = $pon . ':' . $onu;
            $entry = [
                'mac' => strtoupper($mac),
                'vlan' => (string)$this->firstValue($row, ['vlan_id', 'vlan', 'vid', 'VLAN ID']),
                'name' => (string)$this->firstValue($row, ['name', 'onu_name', 'ONU Name']),
                'type' => (string)$this->firstValue($row, ['mac_type', 'type', 'address_type', 'MAC Address Type']),
            ];

            $map[$key][$mac] = $entry; // MAC key removes duplicates
        }

        foreach ($map as $key => $entries) {
            $map[$key] = array_values($entries);
        }
        return $map;
    }
}
