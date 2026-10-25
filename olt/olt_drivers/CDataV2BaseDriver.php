<?php
require_once __DIR__ . '/OLTInterface.php';
require_once __DIR__ . '/CDataV2SnmpClient.php';

abstract class CDataV2BaseDriver implements OLTInterface {
    protected $ctx;
    private $lastCollection = null;

    public function __construct($context) { $this->ctx = $context; }
    abstract protected function collectOnus($snmp);
    abstract public function probeOid();

    protected function snmp($polling = false) {
        // Full C-DATA table polling uses many independent walks. Keep each walk
        // bounded so one unsupported/slow OID cannot hold a web/cron worker for
        // minutes. The normal connection test still honours the configured
        // timeout/retry values.
        $timeout = $polling ? max(1, min(2, intval($this->ctx->getTimeout()))) : $this->ctx->getTimeout();
        $retries = $polling ? 0 : $this->ctx->getSnmpRetries();
        return new CDataV2SnmpClient(
            $this->ctx->getOltIp(),
            $this->ctx->getSnmpCommunity(),
            $this->ctx->getSnmpPort(),
            $timeout,
            $retries
        );
    }

    public function testSnmp() {
        try {
            $snmp = $this->snmp();
            try {
                $snmp->get('1.3.6.1.2.1.1.1.0');
                return true;
            } catch (Throwable $e) {
                $rows = $snmp->walk($this->probeOid());
                return is_array($rows);
            }
        } catch (Throwable $e) {
            $this->ctx->log('C-DATA V2 SNMP test failed: ' . $e->getMessage(), 'ERROR');
            return false;
        }
    }

    public function getOnuList($interface = '') {
        $all = $this->monitorAllOnus();
        if (!is_array($all) || !isset($all['onu_list'])) return array();
        if ($interface === '') return $all['onu_list'];
        $needle = trim(str_ireplace(array('epon', 'gpon', 'pon', '0/', ' '), '', (string)$interface), '/');
        if ($needle === '') return $all['onu_list'];
        return array_values(array_filter($all['onu_list'], function($row) use ($needle) {
            return (string)($row['port'] ?? '') === $needle;
        }));
    }

    public function getOnuPower($interface = '') {
        $all = $this->monitorAllOnus();
        return (is_array($all) && isset($all['power'])) ? $all['power'] : array();
    }

    public function getUptime($interface = '') {
        $all = $this->monitorAllOnus();
        return (is_array($all) && isset($all['uptime'])) ? $all['uptime'] : array();
    }

    public function rebootOnu($interface, $onu_id = null) {
        $this->ctx->log('C-DATA V2 driver is read-only; reboot command is not mapped in the source implementation.', 'WARNING');
        return false;
    }

    public function monitorAllOnus($includeMac = true) {
        if ($this->lastCollection !== null && $includeMac) return $this->lastCollection;
        $result = array('onu_list' => array(), 'power' => array(), 'uptime' => array(), 'mactable' => array());
        try {
            $snmp = $this->snmp(true);
            $rows = $this->collectOnus($snmp);
            // Never silently mark a populated C-DATA OLT as a successful
            // zero-ONU sync. If the probe table has rows but the collector
            // produced none, surface it as a parser/transport error so the
            // dashboard keeps the previous cache and shows a useful error.
            if (!$rows) {
                try {
                    $probeRows = $snmp->walk($this->probeOid());
                    if (is_array($probeRows) && count($probeRows) > 0) {
                        throw new RuntimeException('C-DATA ONU probe returned ' . count($probeRows) . ' rows but the collector parsed 0 rows.');
                    }
                } catch (RuntimeException $probeError) {
                    throw $probeError;
                } catch (Throwable $ignore) {}
            }
            foreach ($rows as $r) {
                $pon = (string)($r['pon'] ?? '');
                $onuNo = (string)($r['onu_id'] ?? '');
                if ($pon === '' || $onuNo === '' || intval($pon) <= 0 || intval($onuNo) <= 0) continue;
                $key = $pon . ':' . $onuNo;
                $status = strtolower((string)($r['status'] ?? 'unknown'));
                $result['onu_list'][] = array(
                    'onu_id' => $key,
                    'port' => $pon,
                    'onu_number' => $onuNo,
                    'mac' => $r['mac'] ?? '',
                    'serial' => $r['serial'] ?? '',
                    'status' => $status,
                    'name' => $r['name'] ?? null,
                    'description' => $r['description'] ?? null,
                    'vendor' => $r['vendor'] ?? null,
                    'model' => $r['model'] ?? null,
                    'firmware' => $r['firmware'] ?? null,
                    'software' => $r['software'] ?? null,
                    'hardware' => $r['hardware'] ?? null,
                    'admin_status' => $r['admin_status'] ?? null,
                    'down_reason' => $r['down_reason'] ?? null,
                    'distance' => isset($r['distance_m']) && $r['distance_m'] !== null ? $r['distance_m'] : 'N/A',
                    'distance_m' => $r['distance_m'] ?? null,
                    'device_index' => $r['device_index'] ?? null,
                    'last_register' => $r['last_register'] ?? null,
                    'last_deregister' => $r['last_deregister'] ?? null,
                    'deregister_reason' => $r['down_reason'] ?? null,
                    'vendor_id' => $r['vendor'] ?? null
                );
                $result['power'][$key] = array(
                    'rx_power' => $r['rx_power'] === null ? 'N/A' : $r['rx_power'],
                    'tx_power' => $r['tx_power'] === null ? 'N/A' : $r['tx_power'],
                    'temperature' => $r['temperature_c'] === null ? 'N/A' : $r['temperature_c'],
                    'voltage' => $r['voltage_v'] === null ? 'N/A' : $r['voltage_v'],
                    'vendor_id' => $r['vendor'] ?? 'N/A'
                );
                $result['uptime'][$key] = $this->formatUptime($r['uptime_sec'] ?? null);
            }
            // Caller/FDB collection can be much slower than ONU/optics polling
            // (especially when a large bridge table or CLI fallback is used).
            // It is intentionally separable so the core ONU cache can be saved
            // immediately and the MAC enrichment can continue in background.
            if ($includeMac) {
                $result['mactable'] = $this->collectMacTable($snmp, $rows);
            }
        } catch (Throwable $e) {
            $this->ctx->log('C-DATA V2 collection failed: ' . $e->getMessage(), 'ERROR');
            return false;
        }
        if ($includeMac) $this->lastCollection = $result;
        return $result;
    }

    public function collectMacSnapshot(array $onus) {
        try {
            $snmp = $this->snmp(true);
            return $this->collectMacTable($snmp, $onus);
        } catch (Throwable $e) {
            $this->ctx->log('C-DATA V2 MAC collection failed: ' . $e->getMessage(), 'ERROR');
            return array();
        }
    }

    protected function collectMacTable($snmp, $onus) { return array(); }

    protected function formatUptime($seconds) {
        if ($seconds === null || !is_numeric($seconds)) return 'N/A';
        $s = max(0, intval($seconds));
        $d = intdiv($s, 86400); $s %= 86400;
        $h = intdiv($s, 3600); $s %= 3600;
        $m = intdiv($s, 60); $s %= 60;
        $parts = array();
        if ($d) $parts[] = $d . 'd';
        if ($h || $d) $parts[] = $h . 'h';
        if ($m || $h || $d) $parts[] = $m . 'm';
        $parts[] = $s . 's';
        return implode(' ', $parts);
    }

    protected function walkColumns($snmp, $cols) {
        $rows = array();
        foreach ($cols as $field => $base) {
            if (!$base) continue;
            try { $walk = $snmp->walk($base); } catch (Throwable $e) { continue; }
            foreach ($walk as $oid => $val) {
                $suffix = $this->suffix($oid, $base);
                if ($suffix === '') continue;
                if (!isset($rows[$suffix])) $rows[$suffix] = array('_suffix' => $suffix);
                $rows[$suffix][$field] = $val;
            }
        }
        return array_values($rows);
    }

    protected function suffix($oid, $base) {
        $oid = ltrim((string)$oid, '.'); $base = ltrim((string)$base, '.');
        return strpos($oid, $base . '.') === 0 ? substr($oid, strlen($base) + 1) : '';
    }
    protected function intVal($v) { if ($v === null || $v === '') return null; return preg_match('/-?\d+/', (string)$v, $m) ? intval($m[0]) : null; }
    protected function numVal($v) { if ($v === null || $v === '') return null; return preg_match('/-?\d+(?:\.\d+)?/', str_replace(',', '.', (string)$v), $m) ? floatval($m[0]) : null; }
    protected function textVal($v) {
        if ($v === null) return null; $s = (string)$v; if ($s === '') return null;
        foreach (array('OCTET STRING:', 'STRING:') as $p) if (stripos($s, $p) === 0) { $s = ltrim(substr($s, strlen($p))); break; }
        if (strlen($s) >= 2 && $s[0] === '"' && substr($s, -1) === '"') $s = substr($s, 1, -1);
        if ($s === '') return null;
        $binary = preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $s);
        $utf8 = function_exists('mb_check_encoding') ? mb_check_encoding($s, 'UTF-8') : preg_match('//u', $s);
        if ($binary || !$utf8) return 'HEX:' . strtoupper(bin2hex($s));
        $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s));
        return $s === '' ? null : $s;
    }
    protected function macVal($v) {
        $s = (string)$v; if ($s === '') return null; $t = trim($s);
        if (preg_match('/^Hex-STRING:\s*((?:[0-9A-Fa-f]{2}(?:\s+|$)){6})/i', $t, $m)) {
            $hex = preg_replace('/[^0-9A-Fa-f]/', '', $m[1]);
            if (strlen($hex) === 12) return strtoupper(implode(':', str_split($hex, 2)));
        }
        foreach (array('OCTET STRING:', 'STRING:') as $p) if (stripos($s, $p) === 0) { $s = ltrim(substr($s, strlen($p))); break; }
        if (strlen($s) >= 2 && $s[0] === '"' && substr($s, -1) === '"') $s = substr($s, 1, -1);
        if (strlen($s) === 6) return strtoupper(implode(':', str_split(bin2hex($s), 2)));
        $hex = preg_replace('/[^0-9a-f]/i', '', trim($s));
        return strlen($hex) === 12 ? strtoupper(implode(':', str_split($hex, 2))) : null;
    }
    protected function serialVal($v) {
        $s = (string)$v; if ($s === '') return null;
        if (strlen($s) === 8 && preg_match('/[^\x20-\x7E]/', $s)) {
            $vendor = substr($s, 0, 4);
            return (preg_match('/^[\x20-\x7E]{4}$/', $vendor) ? strtoupper($vendor) : strtoupper(bin2hex($vendor))) . strtoupper(bin2hex(substr($s, 4)));
        }
        $s = trim($s);
        if (stripos($s, 'hex-string:') === 0) $s = trim(substr($s, 11));
        $hex = preg_replace('/[^0-9a-f]/i', '', $s);
        if (strlen($hex) === 16) {
            $bytes = @hex2bin($hex);
            if ($bytes !== false) {
                $vendor = substr($bytes, 0, 4);
                if (preg_match('/^[\x20-\x7E]{4}$/', $vendor)) return strtoupper($vendor) . strtoupper(bin2hex(substr($bytes, 4)));
            }
            return strtoupper($hex);
        }
        return trim($s, '"');
    }
    protected function cdataIndex($idx) { $idx = intval($idx); return array('slot' => (($idx >> 16) & 0xFF), 'pon' => (($idx >> 8) & 0xFF), 'onu' => ($idx & 0xFF)); }
    protected function ifNames($snmp) {
        try { $raw = $snmp->walk('1.3.6.1.2.1.31.1.1.1.1'); } catch (Throwable $e) { return array(); }
        $m = array(); foreach ($raw as $oid => $v) { $idx = intval(substr($oid, strrpos($oid, '.') + 1)); $m[$idx] = $v; } return $m;
    }
}
