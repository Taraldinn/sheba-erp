<?php
// classes/olt_drivers/VSOLGponWebDriver.php

require_once __DIR__ . '/OLTInterface.php';

class VSOLGponWebDriver implements OLTInterface {
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
        if ($onu_id === null) {
            $parts = explode(':', $interface);
            if (count($parts) != 2) return false;
            $port = $parts[0];
            $onu_id = $parts[1];
        } else {
            $port = $interface;
        }

        if (!$this->ctx->telnet_connect()) return false;
        try {
            $this->ctx->execute_command("interface gpon 0/$port", 2);
            $res = $this->ctx->execute_command("onu $onu_id reboot", 2);
            $this->ctx->execute_command("exit", 1);
            $this->ctx->telnet_disconnect();
            
            if ($res && (strpos($res, 'OK') !== false || strpos($res, 'success') !== false)) {
                $this->ctx->log("GPON ONU $port:$onu_id rebooted successfully via Telnet (web mode fallback)", 'INFO');
                return true;
            }
            return false;
        } catch (Exception $e) {
            $this->ctx->log("VSOL GPON Reboot error: " . $e->getMessage(), 'ERROR');
            return false;
        }
    }

    private function getCookiePath() {
        $ip = $this->ctx->getOltIp();
        $user = $this->ctx->getUsername();
        $cookie_dir = __DIR__ . '/../../cache/olt_cookies';
        if (!is_dir($cookie_dir)) {
            @mkdir($cookie_dir, 0775, true);
        }
        return $cookie_dir . '/' . md5($ip . '_' . $user) . '_vsolgpon.txt';
    }

    private function curlOptions() {
        return [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 4,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $this->ctx->getTimeout() ?: 12,
            CURLOPT_COOKIEJAR => $this->getCookiePath(),
            CURLOPT_COOKIEFILE => $this->getCookiePath(),
            CURLOPT_USERAGENT => 'Mozilla/5.0 GPONMonitor/4.2',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_ENCODING => '',
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,application/xhtml+xml,*/*',
                'Connection: keep-alive',
                'Cache-Control: no-cache',
            ],
        ];
    }

    private function requestPage($baseUrl, $path, $method = 'GET', $fields = []) {
        $url = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');
        $ch = curl_init($url);
        $options = $this->curlOptions();

        if (strtoupper($method) === 'POST') {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = http_build_query($fields);
            $options[CURLOPT_HTTPHEADER][] = 'Content-Type: application/x-www-form-urlencoded';
            $options[CURLOPT_REFERER] = $url;
        }

        curl_setopt_array($ch, $options);

        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

        curl_close($ch);

        return [
            'ok' => $body !== false && $errno === 0 && $httpCode > 0 && $httpCode < 400,
            'body' => is_string($body) ? $body : '',
            'http_code' => $httpCode,
            'error' => $errno ? "cURL {$errno}: {$error}" : ($httpCode >= 400 ? "HTTP {$httpCode}" : ''),
        ];
    }

    private function xpathFor($html) {
        libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        if (!$dom->loadHTML($html, LIBXML_NOWARNING | LIBXML_NOERROR)) {
            return null;
        }
        return new DOMXPath($dom);
    }

    private function cellText($node) {
        return trim((string)preg_replace('/\s+/', ' ', $node->textContent));
    }

    private function normaliseHeader($header) {
        $header = strtolower(trim((string)preg_replace('/\s+/', ' ', $header)));
        if (str_contains($header, 'rx power') || str_contains($header, 'rx_power') || str_contains($header, 'receive power') || str_contains($header, 'rx-power')) return 'rx_power';
        if (str_contains($header, 'tx power') || str_contains($header, 'tx_power') || str_contains($header, 'transmit power') || str_contains($header, 'tx-power')) return 'tx_power';
        if (str_contains($header, 'onu id') || str_contains($header, 'onu_id')) return 'onu_id';
        if (str_contains($header, 'onu serial') || str_contains($header, 'onu_serial') || $header === 'serial' || $header === 'onu_sn' || $header === 'onu sn') return 'onu_serial';
        if (str_contains($header, 'distance')) return 'distance';
        if (str_contains($header, 'last register')) return 'last_register';
        if (str_contains($header, 'deregister reason') || $header === 'reason') return 'deregister_reason';
        if (str_contains($header, 'last deregister')) return 'last_deregister';
        
        return match ($header) {
            'status' => 'status',
            'descriptions', 'description', 'desc' => 'description',
            'model' => 'model',
            'profile' => 'profile',
            'mode' => 'mode',
            'info' => 'onu_serial',
            'admin state' => 'admin_state',
            'omcc state' => 'omcc_state',
            'phase state' => 'phase_state',
            'alive time' => 'alive_time',
            'vlan id', 'vlan' => 'vlan_id',
            'mac' => 'mac_address',
            'type' => 'mac_type',
            'pon:onu' => 'pon_onu',
            'gemport index:id' => 'gemport',
            default => preg_replace('/[^a-z0-9]+/', '_', $header),
        };
    }

    private function parseTables($html) {
        $xpath = $this->xpathFor($html);
        if (!$xpath) {
            return [];
        }

        $tables = [];
        foreach ($xpath->query('//table') as $table) {
            $headers = [];
            $rowsOut = [];

            foreach ($xpath->query('.//tr', $table) as $row) {
                $values = [];
                foreach ($xpath->query('./th|./td', $row) as $cell) {
                    $values[] = $this->cellText($cell);
                }

                if (!$values) {
                    continue;
                }

                if (!$headers) {
                    $candidate = array_map([$this, 'normaliseHeader'], $values);
                    if (
                        in_array('onu_id', $candidate, true) ||
                        in_array('mac_address', $candidate, true)
                    ) {
                        $headers = $candidate;
                    }
                    continue;
                }

                $item = [];
                foreach ($values as $index => $value) {
                    $item[$headers[$index] ?? "column_{$index}"] = $value;
                }

                if ($item) {
                    $rowsOut[] = $item;
                }
            }

            if ($headers) {
                $tables[] = ['headers' => $headers, 'rows' => $rowsOut];
            }
        }

        return $tables;
    }

    private function firstMatchingTable($html, $required) {
        foreach ($this->parseTables($html) as $table) {
            $valid = true;
            foreach ($required as $field) {
                if (!in_array($field, $table['headers'], true)) {
                    $valid = false;
                    break;
                }
            }
            if ($valid) {
                return $table['rows'];
            }
        }
        return [];
    }

    private function parsePon($onuId) {
        if (preg_match('#GPON\d+/(\d+):\d+#i', $onuId, $match)) {
            return (int)$match[1];
        }
        return 0;
    }

    private function parseOnuNumber($onuId) {
        if (preg_match('#:(\d+)$#', $onuId, $match)) {
            return (int)$match[1];
        }
        return 0;
    }

    private function pageLooksLikeLogin($html) {
        $plain = strtolower(strip_tags($html));
        return (
            str_contains($plain, 'login') &&
            (
                str_contains($html, 'name="user"') ||
                str_contains($html, "name='user'") ||
                str_contains($html, 'name="pass"') ||
                str_contains($html, "name='pass'")
            )
        );
    }

    private function pageLooksAuthenticated($html) {
        if ($html === '' || $this->pageLooksLikeLogin($html)) {
            return false;
        }
        $plain = strtolower(strip_tags($html));
        return
            str_contains($plain, 'onu authentication info') ||
            str_contains($plain, 'onu status info') ||
            str_contains($plain, 'onu optical info') ||
            str_contains($plain, 'onu list') ||
            str_contains($plain, 'logout');
    }

    private function extractOnuCount($html, $fallback = '0/0') {
        $xpath = $this->xpathFor($html);
        if ($xpath) {
            foreach ($xpath->query('//input') as $input) {
                $name = strtolower(trim((string)$input->attributes?->getNamedItem('name')?->nodeValue));
                $id = strtolower(trim((string)$input->attributes?->getNamedItem('id')?->nodeValue));

                if ($name === 'onucount' || $id === 'onucount') {
                    $value = trim((string)$input->attributes?->getNamedItem('value')?->nodeValue);
                    if (preg_match('/^\d+\s*\/\s*\d+$/', $value)) {
                        return preg_replace('/\s+/', '', $value);
                    }
                }
            }
        }

        if (preg_match('/ONU\s*Count.*?(\d+\s*\/\s*\d+)/is', $html, $match)) {
            return preg_replace('/\s+/', '', $match[1]);
        }

        return $fallback;
    }

    private function login($baseUrl) {
        @unlink($this->getCookiePath());
        $this->requestPage($baseUrl, '/action/login_first.html');

        $login = $this->requestPage(
            $baseUrl,
            '/action/main.html',
            'POST',
            [
                'user' => (string)$this->ctx->getUsername(),
                'pass' => (string)$this->ctx->getPassword(),
                'button' => 'Login',
                'who' => '100',
            ]
        );

        if (!$login['ok']) {
            return false;
        }

        $verify = $this->requestPage($baseUrl, '/action/onuauthinfo.html');
        return $verify['ok'] && $this->pageLooksAuthenticated($verify['body']);
    }

    private function ensureAuthenticated($baseUrl) {
        $check = $this->requestPage($baseUrl, '/action/onuauthinfo.html');
        if ($check['ok'] && $this->pageLooksAuthenticated($check['body'])) {
            return true;
        }
        return $this->login($baseUrl);
    }

    private function authRowsForPon($baseUrl, $pon, &$onuCount) {
        $response = $this->requestPage(
            $baseUrl,
            '/action/onuauthinfo.html',
            'POST',
            [
                'select' => (string)$pon,
                'authmode' => '0',
                'searchONU' => '',
                'onuCount' => $onuCount,
                'who' => '100',
                'onuid' => '0',
            ]
        );

        if (!$response['ok']) {
            return [
                'ok' => false,
                'rows' => [],
            ];
        }

        $rows = $this->firstMatchingTable(
            $response['body'],
            ['onu_id', 'status', 'onu_serial']
        );

        $rows = array_values(array_filter(
            $rows,
            fn($row) => $this->parsePon((string)($row['onu_id'] ?? '')) === $pon
        ));

        $onuCount = $this->extractOnuCount($response['body'], $onuCount);

        return [
            'ok' => $this->pageLooksAuthenticated($response['body']),
            'rows' => $rows,
        ];
    }

    private function statusRowsForCurrentPon($baseUrl, $pon) {
        foreach ([
            ['GET', []],
            ['POST', ['select' => (string)$pon, 'who' => '100']],
        ] as [$method, $payload]) {
            $response = $this->requestPage(
                $baseUrl,
                '/action/onustatusinfo.html',
                $method,
                $payload
            );

            if (!$response['ok']) {
                continue;
            }

            $rows = $this->firstMatchingTable(
                $response['body'],
                ['onu_id', 'admin_state', 'omcc_state', 'phase_state']
            );

            $matching = array_values(array_filter(
                $rows,
                fn($row) => $this->parsePon((string)($row['onu_id'] ?? '')) === $pon
            ));

            if ($matching) {
                return $matching;
            }
        }

        return [];
    }

    private function opticalFormRequests($html, $pon) {
        $xpath = $this->xpathFor($html);
        if (!$xpath) {
            return [];
        }

        $requests = [];
        foreach ($xpath->query('//form') as $form) {
            $action = trim((string)$form->attributes?->getNamedItem('action')?->nodeValue);
            if ($action !== '' && !str_contains(strtolower($action), 'pononuopticalinfo')) {
                continue;
            }

            $basePayload = [];
            $rangeSelects = [];

            foreach ($xpath->query('.//input', $form) as $input) {
                $name = trim((string)$input->attributes?->getNamedItem('name')?->nodeValue);
                if ($name === '') continue;

                $type = strtolower(trim((string)$input->attributes?->getNamedItem('type')?->nodeValue));
                $value = trim((string)$input->attributes?->getNamedItem('value')?->nodeValue);

                if (in_array($type, ['submit', 'button', 'image', 'reset'], true)) {
                    continue;
                }

                if (in_array($type, ['checkbox', 'radio'], true)) {
                    $checked = $input->attributes?->getNamedItem('checked');
                    if (!$checked) continue;
                }

                $basePayload[$name] = $value;
            }

            foreach ($xpath->query('.//select', $form) as $select) {
                $name = trim((string)$select->attributes?->getNamedItem('name')?->nodeValue);
                if ($name === '') continue;

                $options = [];
                $selectedValue = '';

                foreach ($xpath->query('./option', $select) as $option) {
                    $value = trim((string)$option->attributes?->getNamedItem('value')?->nodeValue);
                    $label = $this->cellText($option);

                    if ($value === '') {
                        $value = $label;
                    }

                    $options[] = [
                        'value' => $value,
                        'label' => $label,
                    ];

                    if ($option->attributes?->getNamedItem('selected')) {
                        $selectedValue = $value;
                    }
                }

                if ($selectedValue === '' && $options) {
                    $selectedValue = (string)$options[0]['value'];
                }

                $basePayload[$name] = $selectedValue;

                $looksLikeRange = false;
                foreach ($options as $option) {
                    if (preg_match('/\b\d+\s*-\s*\d+\b/', (string)$option['label'])) {
                        $looksLikeRange = true;
                        break;
                    }
                }

                if ($looksLikeRange && count($options) > 1) {
                    $rangeSelects[] = [
                        'name' => $name,
                        'options' => $options,
                    ];
                }
            }

            foreach (['select', 'pon', 'ponid', 'pon_id', 'port', 'portid', 'port_id'] as $ponField) {
                if (array_key_exists($ponField, $basePayload)) {
                    $basePayload[$ponField] = (string)$pon;
                }
            }

            if (!$rangeSelects) {
                $requests[] = $basePayload;
                continue;
            }

            $rangeSelect = $rangeSelects[0];
            foreach ($rangeSelect['options'] as $option) {
                $payload = $basePayload;
                $payload[$rangeSelect['name']] = (string)$option['value'];
                $requests[] = $payload;
            }
        }

        return $requests;
    }

    private function opticalRowsForCurrentPon($baseUrl, $pon) {
        $all = [];
        $initial = $this->requestPage(
            $baseUrl,
            '/action/pononuopticalinfo.html'
        );

        if (!$initial['ok']) {
            return [];
        }

        $firstRows = $this->firstMatchingTable(
            $initial['body'],
            ['onu_id', 'rx_power', 'tx_power']
        );

        foreach ($firstRows as $row) {
            if ($this->parsePon((string)($row['onu_id'] ?? '')) === $pon) {
                $all[strtoupper((string)$row['onu_id'])] = $row;
            }
        }

        $requests = $this->opticalFormRequests($initial['body'], $pon);
        if (!$requests) {
            foreach (['onusel', 'onurange', 'onu_range', 'group', 'onugroup', 'onuGroup'] as $field) {
                for ($group = 1; $group <= 4; $group++) {
                    $requests[] = [
                        'select' => (string)$pon,
                        $field => (string)$group,
                        'who' => '100',
                    ];
                }
            }
        }

        $seenPayloads = [];
        foreach ($requests as $payload) {
            $signature = http_build_query($payload);
            if (isset($seenPayloads[$signature])) continue;
            $seenPayloads[$signature] = true;

            $response = $this->requestPage(
                $baseUrl,
                '/action/pononuopticalinfo.html',
                'POST',
                $payload
            );

            if (!$response['ok']) {
                continue;
            }

            $rows = $this->firstMatchingTable(
                $response['body'],
                ['onu_id', 'rx_power', 'tx_power']
            );

            foreach ($rows as $row) {
                if ($this->parsePon((string)($row['onu_id'] ?? '')) === $pon) {
                    $all[strtoupper((string)$row['onu_id'])] = $row;
                }
            }
        }

        return array_values($all);
    }

    private function macRows($baseUrl) {
        $response = $this->requestPage(
            $baseUrl,
            '/action/macinfoPon.html'
        );

        if (!$response['ok']) {
            return [];
        }

        return $this->firstMatchingTable(
            $response['body'],
            ['vlan_id', 'mac_address', 'mac_type', 'pon_onu']
        );
    }

    private function mergePonRows($authRows, $statusRows, $opticalRows) {
        $merged = [];

        foreach ($authRows as $row) {
            $id = strtoupper(trim((string)($row['onu_id'] ?? '')));
            if ($id === '') continue;

            $merged[$id] = [
                'onu_id' => $id,
                'pon' => $this->parsePon($id),
                'onu_number' => $this->parseOnuNumber($id),
                'status' => (string)($row['status'] ?? ''),
                'description' => (string)($row['description'] ?? ''),
                'model' => (string)($row['model'] ?? ''),
                'profile' => (string)($row['profile'] ?? ''),
                'mode' => (string)($row['mode'] ?? ''),
                'onu_serial' => (string)($row['onu_serial'] ?? ''),
                'admin_state' => '',
                'omcc_state' => '',
                'phase_state' => '',
                'rx_power' => '',
                'tx_power' => '',
                'last_register' => '',
                'last_deregister' => '',
                'deregister_reason' => '',
                'alive_time' => '',
            ];
        }

        foreach ($statusRows as $row) {
            $id = strtoupper(trim((string)($row['onu_id'] ?? '')));
            if ($id === '' || !isset($merged[$id])) continue;

            $merged[$id]['admin_state'] = (string)($row['admin_state'] ?? '');
            $merged[$id]['omcc_state'] = (string)($row['omcc_state'] ?? '');
            $merged[$id]['phase_state'] = (string)($row['phase_state'] ?? '');
            $merged[$id]['last_register'] = (string)($row['last_register'] ?? '');
            $merged[$id]['last_deregister'] = (string)($row['last_deregister'] ?? '');
            $merged[$id]['deregister_reason'] = (string)($row['deregister_reason'] ?? '');
            $merged[$id]['alive_time'] = (string)($row['alive_time'] ?? '');

            if ($merged[$id]['description'] === '') {
                $merged[$id]['description'] = (string)($row['description'] ?? '');
            }
        }

        foreach ($opticalRows as $row) {
            $id = strtoupper(trim((string)($row['onu_id'] ?? '')));
            if ($id === '' || !isset($merged[$id])) continue;

            $merged[$id]['rx_power'] = (string)($row['rx_power'] ?? '');
            $merged[$id]['tx_power'] = (string)($row['tx_power'] ?? '');
        }

        return array_values($merged);
    }

    private function getBaseUrls() {
        $protocol = strtolower(trim($this->ctx->getHttpProtocol()));
        $ip = $this->ctx->getOltIp();
        $port = trim((string)$this->ctx->getWebPort());
        
        $urls = [];
        $port_suffix_https = ($port !== '' && $port !== '443' && $port !== '0') ? ":$port" : '';
        $port_suffix_http = ($port !== '' && $port !== '80' && $port !== '0') ? ":$port" : '';

        if ($protocol === 'https') {
            $urls[] = "https://$ip" . $port_suffix_https;
        } elseif ($protocol === 'http') {
            $urls[] = "http://$ip" . $port_suffix_http;
        } else {
            $urls[] = "https://$ip" . $port_suffix_https;
            $urls[] = "http://$ip" . $port_suffix_http;
        }
        
        $selected = $protocol === 'https' ? "https://$ip" . $port_suffix_https : "http://$ip" . $port_suffix_http;
        $fallback = $protocol === 'https' ? "http://$ip" . $port_suffix_http : "https://$ip" . $port_suffix_https;
        
        if (!in_array($selected, $urls)) $urls[] = $selected;
        if (!in_array($fallback, $urls)) $urls[] = $fallback;
        
        return $urls;
    }

    public function testLogin() {
        $baseUrls = $this->getBaseUrls();
        foreach ($baseUrls as $url) {
            if ($this->login($url)) {
                return true;
            }
        }
        return false;
    }

    public function monitorAllOnus() {
        $data = array('onu_list' => array(), 'power' => array(), 'mactable' => array(), 'uptime' => array());
        
        $baseUrls = $this->getBaseUrls();
        $authenticated = false;
        $baseUrl = '';
        
        foreach ($baseUrls as $url) {
            if ($this->ensureAuthenticated($url)) {
                $baseUrl = $url;
                $authenticated = true;
                break;
            }
        }

        if (!$authenticated) {
            $this->ctx->log("VSOL GPON Web Monitor: OLT login failed for all candidate URLs: " . implode(', ', $baseUrls), 'ERROR');
            return false;
        }

        // Fetch MAC table for the whole GPON OLT first
        $mac_by_onu = [];
        try {
            $macs = $this->macRows($baseUrl);
            foreach ($macs as $row) {
                $pon_onu = trim($row['pon_onu'] ?? '');
                if (preg_match('/GPON\d+\/(\d+):(\d+)/i', $pon_onu, $matches)) {
                    $onu_key = $matches[1] . ":" . $matches[2];
                } elseif (preg_match('/(\d+)\/(\d+):(\d+)/', $pon_onu, $matches)) {
                    $onu_key = $matches[2] . ":" . $matches[3];
                } elseif (preg_match('/(\d+):(\d+)/', $pon_onu, $matches)) {
                    $onu_key = $matches[1] . ":" . $matches[2];
                } else {
                    continue;
                }

                $mac = trim($row['mac_address'] ?? '');
                if (!empty($mac)) {
                    $mac_clean = strtoupper(str_replace([':', '-', '.'], '', $mac));
                    $mac_formatted = implode(':', str_split($mac_clean, 2));
                    $vlan = trim($row['vlan_id'] ?? '');
                    $mac_by_onu[$onu_key][] = array('mac' => $mac_formatted, 'vlan' => $vlan);
                }
            }
        } catch (Exception $e) {
            $this->ctx->log("VSOL GPON Web Monitor: MAC table fetch error: " . $e->getMessage(), 'WARNING');
        }

        $onuCount = '0/0';

        // Loop through 16 GPON ports
        for ($pon = 1; $pon <= 16; $pon++) {
            $auth = $this->authRowsForPon($baseUrl, $pon, $onuCount);
            if (!$auth['ok']) {
                continue;
            }

            $status = $this->statusRowsForCurrentPon($baseUrl, $pon);
            $optical = $this->opticalRowsForCurrentPon($baseUrl, $pon);
            $rows = $this->mergePonRows($auth['rows'], $status, $optical);

            foreach ($rows as $row) {
                $p = $row['pon'];
                $onu_num = $row['onu_number'];
                $full_id = "$p:$onu_num";

                // Format serial/mac
                $serial_raw = !empty($row['onu_serial']) ? $row['onu_serial'] : '';
                $status_str = $row['status'] ?? 'offline';

                $data['onu_list'][] = array(
                    'onu_id' => $full_id,
                    'mac' => $serial_raw,
                    'status' => $status_str,
                    'port' => $p,
                    'distance' => $row['distance'] ?? 'N/A',
                    'last_register' => $row['last_register'] ?? 'N/A',
                    'last_deregister' => $row['last_deregister'] ?? 'N/A',
                    'deregister_reason' => $row['deregister_reason'] ?? 'N/A',
                    'vendor_id' => $row['vendor_id'] ?? 'N/A'
                );

                // Optical Power
                $rx_power = $row['rx_power'] ?? 'N/A';
                $tx_power = $row['tx_power'] ?? 'N/A';
                
                $rx_power_clean = 'N/A';
                if (preg_match('/\(([-\d.]+)\s*dBm\)/i', $rx_power, $match) || preg_match('/([-\d.]+)\s*dBm/i', $rx_power, $match)) {
                    $rx_power_clean = $match[1];
                } elseif (preg_match('/(-?\d+(?:\.\d+)?)/', $rx_power, $match)) {
                    $rx_power_clean = $match[1];
                }
                
                $tx_power_clean = 'N/A';
                if (preg_match('/\(([-\d.]+)\s*dBm\)/i', $tx_power, $match) || preg_match('/([-\d.]+)\s*dBm/i', $tx_power, $match)) {
                    $tx_power_clean = $match[1];
                } elseif (preg_match('/(-?\d+(?:\.\d+)?)/', $tx_power, $match)) {
                    $tx_power_clean = $match[1];
                }
                
                $vendor_id = $row['vendor_id'] ?? 'N/A';
                if (isset($row['manufacturer'])) $vendor_id = $row['manufacturer'];
                if (isset($row['vendor'])) $vendor_id = $row['vendor'];

                $data['power'][$full_id] = array(
                    'rx_power' => $rx_power_clean,
                    'tx_power' => $tx_power_clean,
                    'temperature' => $row['temperature'] ?? 'N/A',
                    'voltage' => $row['voltage'] ?? 'N/A',
                    'vendor_id' => $vendor_id
                );

                $data['uptime'][$full_id] = $row['alive_time'] ?? 'N/A';

                // Add learned MACs if mapped
                if (isset($mac_by_onu[$full_id])) {
                    $data['mactable'][$full_id] = $mac_by_onu[$full_id];
                } else {
                    $data['mactable'][$full_id] = [];
                }
            }
        }

        return $data;
    }
}
