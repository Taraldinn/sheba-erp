<?php
// classes/olt_drivers/VSOLEponWebDriver.php

require_once __DIR__ . '/OLTInterface.php';

class VSOLEponWebDriver implements OLTInterface {
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
        // Fall back to telnet reboot if telnet is configured
        $full_id = $interface;
        $parts = explode(':', $full_id);
        if (count($parts) != 2) return false;
        $port = $parts[0];
        $onu_idx = $parts[1];
        
        if (!$this->ctx->telnet_connect()) return false;
        try {
            $this->ctx->execute_command("interface epon 0/$port", 2);
            $this->ctx->execute_command("reset onu auth onuid $onu_idx", 2);
            $this->ctx->execute_command("exit", 1);
            $this->ctx->telnet_disconnect();
            $this->ctx->log("ONU $full_id rebooted via Telnet (web mode fallback)", 'INFO');
            return true;
        } catch (Exception $e) {
            $this->ctx->log("VSOL EPON Web mode reboot fallback error: " . $e->getMessage(), 'ERROR');
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
        return $cookie_dir . '/' . md5($ip . '_' . $user) . '_vsolepon.txt';
    }

    private function curlBaseOptions() {
        return [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $this->ctx->getTimeout() ?: 10,
            CURLOPT_COOKIEJAR => $this->getCookiePath(),
            CURLOPT_COOKIEFILE => $this->getCookiePath(),
            CURLOPT_USERAGENT => 'Mozilla/5.0 OLTMonitor/8.0',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_ENCODING => '',
            CURLOPT_FORBID_REUSE => false,
            CURLOPT_FRESH_CONNECT => false,
            CURLOPT_TCP_KEEPALIVE => 1,
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
        $options = $this->curlBaseOptions();

        if (strtoupper($method) === 'POST') {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = http_build_query($fields);
            $options[CURLOPT_HTTPHEADER][] = 'Content-Type: application/x-www-form-urlencoded';
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

    private function multiRequest($baseUrl, $requests, $concurrency = 16) {
        $results = [];

        foreach (array_chunk($requests, max(1, $concurrency), true) as $chunk) {
            $mh = curl_multi_init();
            $handles = [];

            foreach ($chunk as $key => $path) {
                $url = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');
                $ch = curl_init($url);
                curl_setopt_array($ch, $this->curlBaseOptions());
                curl_multi_add_handle($mh, $ch);
                $handles[$key] = $ch;
            }

            do {
                $status = curl_multi_exec($mh, $running);

                if ($running > 0) {
                    curl_multi_select($mh, 0.2);
                }
            } while ($running > 0 && $status === CURLM_OK);

            foreach ($handles as $key => $ch) {
                $body = curl_multi_getcontent($ch);
                $errno = curl_errno($ch);
                $httpCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

                $results[$key] = [
                    'ok' => $body !== false && $errno === 0 && $httpCode > 0 && $httpCode < 400,
                    'body' => is_string($body) ? $body : '',
                    'http_code' => $httpCode,
                ];

                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);
            }

            curl_multi_close($mh);
        }

        return $results;
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
        if (str_contains($header, 'onu id')) return 'onu_id';
        if (str_contains($header, 'mac address') || str_contains($header, 'mac')) return 'mac_address';
        if (str_contains($header, 'distance')) return 'distance';
        if (str_contains($header, 'rtt')) return 'rtt';
        if (str_contains($header, 'last register')) return 'last_register';
        if (str_contains($header, 'deregister reason') || $header === 'reason') return 'deregister_reason';
        if (str_contains($header, 'last deregister')) return 'last_deregister';
        if (str_contains($header, 'alive time')) return 'alive_time';
        if (str_contains($header, 'vlan id') || str_contains($header, 'vlan')) return 'vlan_id';
        
        return match ($header) {
            'status' => 'status',
            'description' => 'description',
            'type' => 'type',
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
            $rows = $xpath->query('.//tr', $table);
            $headers = [];
            $data = [];

            foreach ($rows as $index => $row) {
                $cells = $xpath->query('./th|./td', $row);
                $values = [];

                foreach ($cells as $cell) {
                    $values[] = $this->cellText($cell);
                }

                if (!$values) {
                    continue;
                }

                if ($index === 0) {
                    $headers = array_map([$this, 'normaliseHeader'], $values);
                    continue;
                }

                $item = [];
                foreach ($values as $i => $value) {
                    $item[$headers[$i] ?? "column_{$i}"] = $value;
                }

                $data[] = $item;
            }

            $tables[] = ['headers' => $headers, 'rows' => $data];
        }

        return $tables;
    }

    private function parseOnuRows($html, $pon) {
        foreach ($this->parseTables($html) as $table) {
            if (
                in_array('onu_id', $table['headers'], true) &&
                in_array('status', $table['headers'], true) &&
                in_array('mac_address', $table['headers'], true)
            ) {
                $result = [];

                foreach ($table['rows'] as $row) {
                    $onuId = trim((string)($row['onu_id'] ?? ''));

                    if (!preg_match('/(?:EPON|GPON)\d+\/\d+:(\d+)/i', $onuId, $match)) {
                        continue;
                    }

                    $row['pon'] = $pon;
                    $row['onu_number'] = $match[1];
                    $result[] = $row;
                }

                return $result;
            }
        }

        return [];
    }

    private function parseBasicInfo($html) {
        $xpath = $this->xpathFor($html);
        if (!$xpath) {
            return [];
        }

        $info = [];
        foreach ($xpath->query('//table//tr') as $row) {
            $cells = $xpath->query('./th|./td', $row);
            $values = [];

            foreach ($cells as $cell) {
                $values[] = $this->cellText($cell);
            }

            if (count($values) === 2) {
                if ($values[0] !== '' && $values[1] !== '') {
                    $info[$values[0]] = $values[1];
                }
            } elseif (count($values) >= 4) {
                if ($values[0] !== '' && $values[1] !== '') {
                    $info[$values[0]] = $values[1];
                }
                if ($values[2] !== '' && $values[3] !== '') {
                    $info[$values[2]] = $values[3];
                }
            }
        }

        return $info;
    }

    private function parseMacRows($html) {
        foreach ($this->parseTables($html) as $table) {
            if (
                in_array('onu_id', $table['headers'], true) &&
                in_array('vlan_id', $table['headers'], true) &&
                in_array('mac_address', $table['headers'], true)
            ) {
                return $table['rows'];
            }
        }

        return [];
    }

    private function infoValue($info, $labels) {
        foreach ($labels as $label) {
            foreach ($info as $key => $value) {
                if (strcasecmp(trim((string)$key), trim($label)) === 0) {
                    return trim((string)$value);
                }
            }
        }
        return '';
    }

    private function callerMacText($rows) {
        $items = [];
        foreach ($rows as $row) {
            $mac = trim((string)($row['mac_address'] ?? ''));
            if ($mac === '') {
                continue;
            }
            $text = $mac;
            $vlan = trim((string)($row['vlan_id'] ?? ''));
            $type = trim((string)($row['type'] ?? ''));
            if ($vlan !== '') {
                $text .= ' (VLAN ' . $vlan . ')';
            }
            if ($type !== '') {
                $text .= ' ' . $type;
            }
            $items[] = $text;
        }
        return implode(', ', $items);
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
            str_contains($plain, 'onu status') ||
            str_contains($plain, 'status info') ||
            str_contains($plain, 'logout') ||
            str_contains($html, 'select');
    }

    private function login($baseUrl) {
        $username = $this->ctx->getUsername();
        $password = $this->ctx->getPassword();

        if (empty($username) || empty($password)) {
            return false;
        }

        // POST login
        $login = $this->requestPage(
            $baseUrl,
            '/action/main.html',
            'POST',
            [
                'user' => $username,
                'pass' => $password,
                'button' => 'Login',
                'who' => '100',
            ]
        );

        if (!$login['ok']) {
            return false;
        }

        $verify = $this->requestPage($baseUrl, '/action/onustatusinfo.html?select=1');
        return $verify['ok'] && $this->pageLooksAuthenticated($verify['body']);
    }

    private function ensureAuthenticated($baseUrl) {
        $check = $this->requestPage($baseUrl, '/action/onustatusinfo.html?select=1');
        if ($check['ok'] && $this->pageLooksAuthenticated($check['body'])) {
            return true;
        }
        return $this->login($baseUrl);
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
            $this->ctx->log("VSOL EPON Web Monitor: OLT login failed for all candidate URLs: " . implode(', ', $baseUrls), 'ERROR');
            return false;
        }

        // Fetch ONU status of all 16 ports concurrently
        $requests = [];
        for ($pon = 1; $pon <= 16; $pon++) {
            $requests["pon_{$pon}"] = "/action/onustatusinfo.html?select={$pon}";
        }

        $responses = $this->multiRequest($baseUrl, $requests, 16);
        $onus = [];

        foreach ($responses as $key => $response) {
            if (!$response['ok']) {
                continue;
            }
            $pon = (int)str_replace('pon_', '', $key);
            $parsed_onus = $this->parseOnuRows($response['body'], $pon);
            foreach ($parsed_onus as $row) {
                $onus[] = $row;
            }
        }

        // Format into $data
        $online_onus = [];
        foreach ($onus as $onu) {
            $status = strtolower(trim($onu['status'] ?? 'offline'));
            $is_online = ($status === 'online' || $status === 'up' || $status === 'active');
            
            $onu_num = $onu['onu_number'] ?? '0';
            $pon = $onu['pon'];
            $full_id = "$pon:$onu_num";
            
            $mac_raw = $onu['mac_address'] ?? '';
            $mac_clean = strtoupper(str_replace([':', '-', '.'], '', $mac_raw));
            $mac = implode(':', str_split($mac_clean, 2));

            $data['onu_list'][] = array(
                'onu_id' => $full_id,
                'mac' => $mac,
                'status' => $onu['status'] ?? 'offline',
                'port' => $pon,
                'distance' => $onu['distance'] ?? 'N/A',
                'last_register' => $onu['last_register'] ?? 'N/A',
                'last_deregister' => $onu['last_deregister'] ?? 'N/A',
                'deregister_reason' => $onu['deregister_reason'] ?? 'N/A',
                'vendor_id' => $onu['vendor_id'] ?? 'N/A'
            );

            $data['uptime'][$full_id] = $onu['alive_time'] ?? 'N/A';

            if ($is_online) {
                $online_onus[] = [
                    'pon' => $pon,
                    'onu' => $onu_num,
                    'full_id' => $full_id
                ];
            }
        }

        // Fetch optical basic info and MAC info for all online ONUs in bulk
        if (!empty($online_onus)) {
            $detail_requests = [];
            foreach ($online_onus as $idx => $item) {
                $pon = $item['pon'];
                $onu_num = $item['onu'];
                
                $detail_requests["basic_{$idx}"] = "/action/onuBasic.html?gponid={$pon}&gonuid=" . rawurlencode((string)$onu_num);
                $detail_requests["mac_{$idx}"] = "/action/onumacinfo.html?gponid={$pon}&gonuid=" . rawurlencode((string)$onu_num);
            }

            $detail_responses = $this->multiRequest($baseUrl, $detail_requests, 24);

            foreach ($online_onus as $idx => $item) {
                $full_id = $item['full_id'];
                
                $basic_res = $detail_responses["basic_{$idx}"] ?? null;
                $mac_res = $detail_responses["mac_{$idx}"] ?? null;

                $basic = ($basic_res && $basic_res['ok']) ? $this->parseBasicInfo($basic_res['body']) : [];
                $mac_rows = ($mac_res && $mac_res['ok']) ? $this->parseMacRows($mac_res['body']) : [];

                $rx_power = $this->infoValue($basic, ['Receive Power', 'RX Power', 'Rx Power']);
                $tx_power = $this->infoValue($basic, ['Transmit Power', 'TX Power', 'Tx Power']);
                $temp = $this->infoValue($basic, ['Temperature']);
                $voltage = $this->infoValue($basic, ['Supply Voltage', 'Voltage']);

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

                $vendor_id = $this->infoValue($basic, ['Vendor ID', 'Vendor', 'Vendor Name', 'Manufacturer']);

                $data['power'][$full_id] = array(
                    'rx_power' => $rx_power_clean,
                    'tx_power' => $tx_power_clean,
                    'temperature' => $temp ?: 'N/A',
                    'voltage' => $voltage ?: 'N/A',
                    'vendor_id' => $vendor_id ?: 'N/A'
                );

                $macts = [];
                foreach ($mac_rows as $row) {
                    $mac_address = trim($row['mac_address'] ?? '');
                    if (!empty($mac_address)) {
                        $mac_clean = strtoupper(str_replace([':', '-', '.'], '', $mac_address));
                        $mac_formatted = implode(':', str_split($mac_clean, 2));
                        $vlan = trim($row['vlan_id'] ?? '');
                        $macts[] = array('mac' => $mac_formatted, 'vlan' => $vlan);
                    }
                }
                $data['mactable'][$full_id] = $macts;
            }
        }

        return $data;
    }
}
