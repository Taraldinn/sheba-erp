<?php
/**
 * Minimal SNMP v2c transport used only by C-DATA Version 2 EPON/GPON drivers.
 * Uses PHP SNMP when available and falls back to Net-SNMP CLI.
 */
class CDataV2SnmpClient {
    private $host;
    private $community;
    private $port;
    private $timeout;
    private $retries;
    private $transport;
    private $fallbackTransport;

    public function __construct($host, $community = 'public', $port = 161, $timeout = 5, $retries = 1) {
        $this->host = trim((string)$host);
        $this->community = (string)$community;
        $this->port = max(1, min(65535, intval($port ?: 161)));
        $this->timeout = max(1, min(60, intval($timeout ?: 5)));
        $this->retries = max(0, min(5, intval($retries)));
        if (!preg_match('/^[A-Za-z0-9_.:\-\[\]]+$/', $this->host)) {
            throw new RuntimeException('Invalid C-DATA OLT host.');
        }
        if ($this->community === '') {
            throw new RuntimeException('SNMP community is required for C-DATA V2.');
        }
        $phpAvailable = extension_loaded('snmp') && function_exists('snmp2_get') && function_exists('snmp2_real_walk');
        $cliAvailable = $this->commandExists('snmpget') && ($this->commandExists('snmpbulkwalk') || $this->commandExists('snmpwalk'));

        // MikroTik DNAT deployments commonly expose SNMP on a non-standard
        // public UDP port (for example 10161 -> OLT 161). Net-SNMP CLI is the
        // exact transport operators use for verification and is more consistent
        // across cPanel PHP builds for custom ports, so prefer it there. On
        // standard :161 keep PHP SNMP first. Whichever route is secondary is
        // retained as an automatic fallback.
        if ($this->port !== 161 && $cliAvailable) {
            $this->transport = 'cli';
            $this->fallbackTransport = $phpAvailable ? 'php' : null;
        } elseif ($phpAvailable) {
            $this->transport = 'php';
            $this->fallbackTransport = $cliAvailable ? 'cli' : null;
        } elseif ($cliAvailable) {
            $this->transport = 'cli';
            $this->fallbackTransport = null;
        } else {
            throw new RuntimeException('SNMP unavailable: enable PHP SNMP extension or install Net-SNMP snmpget/snmpwalk.');
        }
    }

    public static function isSupported() {
        if (extension_loaded('snmp') && function_exists('snmp2_get') && function_exists('snmp2_real_walk')) return true;
        return self::staticCommandExists('snmpget') && (self::staticCommandExists('snmpbulkwalk') || self::staticCommandExists('snmpwalk'));
    }

    public function get($oid) {
        try {
            return $this->transport === 'php' ? $this->phpGet($oid) : $this->cliGet($oid);
        } catch (Throwable $e) {
            if (!$this->fallbackTransport) throw $e;
            return $this->fallbackTransport === 'php' ? $this->phpGet($oid) : $this->cliGet($oid);
        }
    }

    /** @return array numeric OID => value */
    public function walk($oid, $library = false) {
        try {
            $rows = $this->transport === 'php' ? $this->phpWalk($oid, $library) : $this->cliWalk($oid, $library);
            $this->assertWalkPrefix($oid, $rows);
            return $rows;
        } catch (Throwable $e) {
            if (!$this->fallbackTransport) throw $e;
            $rows = $this->fallbackTransport === 'php' ? $this->phpWalk($oid, $library) : $this->cliWalk($oid, $library);
            $this->assertWalkPrefix($oid, $rows);
            return $rows;
        }
    }

    /** Preserve Net-SNMP type/binary representation; required for BDCOM FDB MAC OCTET STRINGs. */
    public function walkLibrary($oid) { return $this->walk($oid, true); }

    private function phpHost() {
        if ($this->port === 161) return $this->host;
        if (preg_match('/^\[[0-9A-Fa-f:]+\]:\d+$/', $this->host) || preg_match('/^[A-Za-z0-9_.-]+:\d+$/', $this->host)) return $this->host;
        if (strpos($this->host, ':') !== false && substr($this->host, 0, 1) !== '[') return '[' . $this->host . ']:' . $this->port;
        return $this->host . ':' . $this->port;
    }

    private function cliHost() {
        if (preg_match('/^\[[0-9A-Fa-f:]+\]:\d+$/', $this->host) || preg_match('/^[A-Za-z0-9_.-]+:\d+$/', $this->host)) return $this->host;
        if (strpos($this->host, ':') !== false && substr($this->host, 0, 1) !== '[') return '[' . $this->host . ']:' . $this->port;
        return $this->host . ':' . $this->port;
    }

    private function preparePhp($library = false) {
        if (function_exists('snmp_set_oid_output_format') && defined('SNMP_OID_OUTPUT_NUMERIC')) {
            @snmp_set_oid_output_format(SNMP_OID_OUTPUT_NUMERIC);
        }
        if (function_exists('snmp_set_oid_numeric_print')) {
            @snmp_set_oid_numeric_print(1);
        }
        if (function_exists('snmp_set_valueretrieval')) {
            if ($library && defined('SNMP_VALUE_LIBRARY')) @snmp_set_valueretrieval(SNMP_VALUE_LIBRARY);
            elseif (defined('SNMP_VALUE_PLAIN')) @snmp_set_valueretrieval(SNMP_VALUE_PLAIN);
        }
    }

    private function phpOid($oid) {
        $oid = trim((string)$oid);
        return substr($oid, 0, 1) === '.' ? $oid : '.' . $oid;
    }

    private function phpGet($oid) {
        $this->preparePhp(false);
        $old = set_error_handler(function($severity, $message) { throw new RuntimeException($message); });
        try {
            $v = snmp2_get($this->phpHost(), $this->community, $this->phpOid($oid), $this->timeout * 1000000, $this->retries);
        } finally {
            restore_error_handler();
        }
        if ($v === false) throw new RuntimeException('SNMP GET failed for ' . $oid);
        return $this->plain((string)$v);
    }

    private function phpWalk($oid, $library = false) {
        $this->preparePhp($library);
        set_error_handler(function($severity, $message) { throw new RuntimeException($message); });
        try {
            $raw = snmp2_real_walk($this->phpHost(), $this->community, $this->phpOid($oid), $this->timeout * 1000000, $this->retries);
        } finally {
            restore_error_handler();
            if ($library && function_exists('snmp_set_valueretrieval') && defined('SNMP_VALUE_PLAIN')) @snmp_set_valueretrieval(SNMP_VALUE_PLAIN);
        }
        if (!is_array($raw)) throw new RuntimeException('SNMP WALK failed for ' . $oid);
        $out = array();
        foreach ($raw as $k => $v) $out[$this->numericOid((string)$k)] = $library ? (string)$v : $this->plain((string)$v);
        return $out;
    }

    private function cliBase($cmd) {
        return array($cmd, '-v2c', '-c', $this->community, '-On', '-t', (string)$this->timeout, '-r', (string)$this->retries, 'udp:' . $this->cliHost());
    }

    private function cliGet($oid) {
        $args = $this->cliBase('snmpget');
        $args[] = (string)$oid;
        $out = $this->runCli($args);
        $line = trim(strtok($out, "\n"));
        if (preg_match('/^\.?[0-9.]+\s*=\s*(.*)$/', $line, $m)) return $this->plain($m[1]);
        return $this->plain($line);
    }

    private function cliWalk($oid, $library = false) {
        // Prefer SNMP GETBULK over classic GETNEXT walking. On WAN/NAT links a
        // C-DATA OLT can expose hundreds of ONUs; classic snmpwalk may require
        // thousands of request/response round-trips and hold the OLT sync lock
        // for many minutes. snmpbulkwalk fetches multiple varbinds per PDU and
        // falls back to snmpwalk when GETBULK is unavailable on the host.
        $walkCmd = $this->commandExists('snmpbulkwalk') ? 'snmpbulkwalk' : 'snmpwalk';
        $args = $this->cliBase($walkCmd);
        if ($walkCmd === 'snmpbulkwalk') $args[] = '-Cr25';
        $args[] = (string)$oid;
        $out = $this->runCli($args);
        $rows = array();
        foreach (preg_split('/\r?\n/', trim($out)) as $line) {
            if (preg_match('/^(\.?[0-9.]+)\s*=\s*(.*)$/', trim($line), $m)) {
                $rows[$this->numericOid($m[1])] = $library ? trim($m[2]) : $this->plain($m[2]);
            }
        }
        if (!$rows) throw new RuntimeException('Could not parse SNMP WALK output for ' . $oid);
        return $rows;
    }

    private function runCli($args) {
        $base = implode(' ', array_map('escapeshellarg', $args));
        // Net-SNMP's -t/-r controls each individual request, but a large walk
        // can still run for a very long time. Add an OS-level ceiling when the
        // GNU timeout utility is available so one slow/unsupported OID cannot
        // permanently hold the per-OLT sync lock.
        $hardSeconds = max(45, min(180, $this->timeout * max(1, $this->retries + 1) * 18));
        $cmd = $base . ' 2>&1';
        if ($this->commandExists('timeout')) {
            $cmd = 'timeout --signal=TERM ' . intval($hardSeconds) . 's ' . $base . ' 2>&1';
        }
        if (function_exists('exec')) {
            $lines = array(); $exit = 0;
            @exec($cmd, $lines, $exit);
            $out = implode("
", $lines);
            if ($exit === 124 || $exit === 137 || $exit === 143) {
                throw new RuntimeException('SNMP command exceeded hard timeout (' . $hardSeconds . 's).');
            }
        } else {
            $out = @shell_exec($cmd);
        }
        if (!is_string($out) || trim($out) === '') throw new RuntimeException('SNMP command returned no output.');
        if (preg_match('/Timeout|No Such Object|Unknown Object Identifier|Authentication failure|Error in packet/i', $out)) throw new RuntimeException(trim($out));
        return $out;
    }

    private function numericOid($oid) {
        $oid = trim((string)$oid);
        // Some PHP/Net-SNMP builds still return symbolic roots even after
        // SNMP_OID_OUTPUT_NUMERIC. Normalize the common roots used by C-DATA
        // so walkColumns() can match the requested numeric enterprise OID.
        if (preg_match('/^(?:SNMPv2-SMI::)?enterprises\.(.+)$/i', $oid, $m)) {
            return '1.3.6.1.4.1.' . ltrim($m[1], '.');
        }
        if (preg_match('/^(?:SNMPv2-SMI::)?mib-2\.(.+)$/i', $oid, $m)) {
            return '1.3.6.1.2.1.' . ltrim($m[1], '.');
        }
        if (preg_match('/^iso\.(.+)$/i', $oid, $m)) {
            return '1.' . ltrim($m[1], '.');
        }
        if (preg_match('/(\.?\d+(?:\.\d+)+)$/', $oid, $m)) return ltrim($m[1], '.');
        return ltrim($oid, '.');
    }

    private function assertWalkPrefix($oid, $rows) {
        if (!is_array($rows) || !$rows) throw new RuntimeException('SNMP WALK returned no rows for ' . $oid);
        $base = ltrim(trim((string)$oid), '.');
        foreach (array_keys($rows) as $key) {
            $key = ltrim((string)$key, '.');
            if ($key === $base || strpos($key, $base . '.') === 0) return;
        }
        $sample = (string)array_key_first($rows);
        throw new RuntimeException('SNMP WALK OID normalization mismatch for ' . $base . ' (sample: ' . $sample . ')');
    }

    private function plain($v) {
        $v = (string)$v;
        // Keep six/eight byte binary payloads intact for MAC/serial helpers.
        if (preg_match('/^(?:INTEGER|Gauge32|Counter32|Counter64|Timeticks|OID|IpAddress|STRING|OCTET STRING):\s*(.*)$/is', $v, $m)) $v = $m[1];
        $v = trim($v);
        if (strlen($v) >= 2 && $v[0] === '"' && substr($v, -1) === '"') $v = substr($v, 1, -1);
        return $v;
    }

    private function commandExists($cmd) { return self::staticCommandExists($cmd); }
    private static function staticCommandExists($cmd) {
        if (!function_exists('shell_exec')) return false;
        $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
        if (in_array('shell_exec', $disabled, true)) return false;
        $out = @shell_exec('command -v ' . escapeshellarg($cmd) . ' 2>/dev/null');
        return is_string($out) && trim($out) !== '';
    }
}
