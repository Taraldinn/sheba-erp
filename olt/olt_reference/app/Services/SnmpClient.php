<?php
namespace App\Services;

use App\Core\Crypto;
use RuntimeException;

final class SnmpClient
{
    private array $olt;
    private string $transport;
    /** Cached working SNMPv3 transport for VSOL/DM/DBC during this request. */
    private ?string $v3Route=null;

    public function __construct(array $olt)
    {
        $this->olt=$olt;
        $this->transport=$this->detectTransport();
        if ($this->transport==='none') throw new RuntimeException('SNMP unavailable: enable PHP SNMP extension or install Net-SNMP snmpget/snmpwalk binaries.');
    }

    public static function systemTransport(): string
    {
        if (extension_loaded('snmp') && function_exists('snmp2_get')) return 'PHP SNMP extension';
        if (self::commandExists('snmpget') && self::commandExists('snmpwalk')) return 'Net-SNMP CLI';
        return 'Unavailable';
    }

    private function detectTransport(): string
    {
        if (extension_loaded('snmp') && function_exists('snmp2_get')) return 'php';
        if (self::commandExists('snmpget') && self::commandExists('snmpwalk')) return 'cli';
        return 'none';
    }

    private static function commandExists(string $cmd): bool
    {
        if (!function_exists('shell_exec')) return false;
        $disabled=array_map('trim',explode(',',(string)ini_get('disable_functions')));
        if (in_array('shell_exec',$disabled,true)) return false;
        $out=@shell_exec('command -v '.escapeshellarg($cmd).' 2>/dev/null');
        return is_string($out) && trim($out)!=='';
    }

    public function get(string $oid): string
    {
        return $this->transport==='php' ? $this->phpGet($oid) : $this->cliGet($oid);
    }

    /** @return array<string,string> numeric OID => plain value */
    public function walk(string $oid): array
    {
        return $this->transport==='php' ? $this->phpWalk($oid) : $this->cliWalk($oid);
    }

    /**
     * Walk preserving Net-SNMP's library representation. This is important for
     * binary OCTET STRING values such as switch FDB MAC addresses: PHP's PLAIN
     * retrieval can contain invalid UTF-8/control bytes which render as blank.
     * @return array<string,string> numeric OID => library/raw value
     */
    public function walkLibrary(string $oid): array
    {
        if ($this->transport!=='php') return $this->cliWalkLibrary($oid);
        return $this->phpWalkLibrary($oid);
    }

    /** Raw host exactly as saved in the OLT form (no default :161 suffix). */
    private function rawHost(): string
    {
        $host=trim((string)$this->olt['host']);
        if (!preg_match('/^[A-Za-z0-9_.:\-\[\]]+$/',$host)) throw new RuntimeException('Invalid OLT host.');
        return $host;
    }

    /**
     * Target for PHP's SNMP extension.
     *
     * Net-SNMP/PHP is most interoperable on port 161 when it receives only the
     * IP/hostname.  This intentionally matches the known-good direct test:
     *   snmp2_get('172.30.30.2','public','.1.3.6.1.2.1.1.1.0',5000000,2)
     * Older monitor builds always appended :161, which some PHP/Net-SNMP builds
     * treat differently and can cause a false timeout even though direct SNMP
     * from the same server works.
     */
    private function phpHost(): string
    {
        $host=$this->rawHost();
        $port=(int)($this->olt['snmp_port']??161);
        if ($port===161) return $host;

        // Custom ports are uncommon. Preserve explicit port support.
        if (preg_match('/^\[[0-9A-Fa-f:]+\]:\d+$/',$host) || preg_match('/^[A-Za-z0-9_.-]+:\d+$/',$host)) return $host;
        if (str_contains($host,':') && !str_starts_with($host,'[')) return '['.$host.']:'.$port;
        return $host.':'.$port;
    }

    /** Target used by Net-SNMP CLI commands. */
    private function host(): string
    {
        $host=$this->rawHost();
        if (preg_match('/^\[[0-9A-Fa-f:]+\]:\d+$/',$host) || preg_match('/^[A-Za-z0-9_.-]+:\d+$/',$host)) return $host;
        $port=(int)($this->olt['snmp_port']??161);
        if (str_contains($host,':') && !str_starts_with($host,'[')) return '['.$host.']:'.$port;
        return $host.':'.$port;
    }

    /** VSOL-compatible profiles that use the adaptive SNMPv3 transport. */
    private function isVsolCompatV3(): bool
    {
        if (($this->olt['snmp_version']??'2c')!=='3') return false;
        return in_array((string)($this->olt['driver_profile']??''),[
            'vsol_epon','vsol_gpon','vsol_gpon_1port',
            'dm_epon','dm_gpon','dbc_epon','dbc_gpon'
        ],true);
    }

    /**
     * Some VSOL/DM/DBC agents are sensitive to the PHP/Net-SNMP target form.
     * We therefore do not hard-code one form globally.  During one request we
     * discover a working route once and cache it for every subsequent OID:
     *   1) PHP SNMPv3 with bare host (10.0.0.2)
     *   2) PHP SNMPv3 with explicit port (10.0.0.2:161)
     *   3) Net-SNMP CLI (udp:10.0.0.2:161), when installed/allowed
     * This path is used ONLY for VSOL/DM/DBC SNMPv3.  C-DATA, ECOM, BDCOM and
     * all v2c behaviour remain unchanged.
     */
    private function v3HostForRoute(string $route): string
    {
        return $route==='php_port' ? $this->host() : $this->phpHost();
    }

    private function v3CliAvailable(): bool
    {
        return self::commandExists('snmpget') && self::commandExists('snmpwalk');
    }

    private function v3PhpWithHost(string $mode,string $oid,string $host): mixed
    {
        $this->validateV3Credentials();
        $user=(string)($this->olt['snmp_v3_user']??'');
        $level=(string)($this->olt['snmp_v3_level']??'authPriv');
        $ap=$level==='noAuthNoPriv' ? '' : (string)($this->olt['snmp_v3_auth_proto']??'SHA');
        $aa=$level==='noAuthNoPriv' ? '' : Crypto::decrypt($this->olt['snmp_v3_auth_pass_enc']??null);
        $pp=$level==='authPriv' ? (string)($this->olt['snmp_v3_priv_proto']??'AES') : '';
        $pa=$level==='authPriv' ? Crypto::decrypt($this->olt['snmp_v3_priv_pass_enc']??null) : '';
        if ($mode==='get') return snmp3_get($host,$user,$level,$ap,$aa,$pp,$pa,$this->phpOid($oid),$this->timeoutUs(),$this->retries());
        return snmp3_real_walk($host,$user,$level,$ap,$aa,$pp,$pa,$this->phpOid($oid),$this->timeoutUs(),$this->retries());
    }

    /**
     * Alternate SNMPv3 path using PHP's persistent SNMP session object.
     * Some VSOL/DM/DBC agents complete USM engine discovery more reliably on
     * a session object than on the one-shot snmp3_* functions.  This route is
     * used only by the VSOL-compatible adaptive v3 code path.
     */
    private function v3Session(string $mode,string $oid,bool $library=false): mixed
    {
        if (!class_exists('\\SNMP')) throw new RuntimeException('PHP SNMP session class is unavailable.');
        $this->validateV3Credentials();

        $user=(string)($this->olt['snmp_v3_user']??'');
        $level=(string)($this->olt['snmp_v3_level']??'authPriv');
        $ap=$level==='noAuthNoPriv' ? '' : (string)($this->olt['snmp_v3_auth_proto']??'SHA');
        $aa=$level==='noAuthNoPriv' ? '' : Crypto::decrypt($this->olt['snmp_v3_auth_pass_enc']??null);
        $pp=$level==='authPriv' ? (string)($this->olt['snmp_v3_priv_proto']??'AES') : '';
        $pa=$level==='authPriv' ? Crypto::decrypt($this->olt['snmp_v3_priv_pass_enc']??null) : '';

        // Give SNMPv3 engine discovery a little more room on routed/VPN links,
        // but keep this scoped to VSOL-family v3 so other OLTs are untouched.
        $timeout=max($this->timeoutUs(),5000000);
        $retries=max($this->retries(),1);
        $session=new \SNMP(\SNMP::VERSION_3,$this->host(),$user,$timeout,$retries);
        try {
            if (!$session->setSecurity($level,$ap,$aa,$pp,$pa)) {
                throw new RuntimeException('SNMP::setSecurity returned false.');
            }
            if (defined('SNMP_OID_OUTPUT_NUMERIC')) $session->oid_output_format=SNMP_OID_OUTPUT_NUMERIC;
            if ($library && defined('SNMP_VALUE_LIBRARY')) $session->valueretrieval=SNMP_VALUE_LIBRARY;
            elseif (defined('SNMP_VALUE_PLAIN')) $session->valueretrieval=SNMP_VALUE_PLAIN;

            if ($mode==='get') {
                $v=$session->get($this->phpOid($oid));
                if ($v===false) throw new RuntimeException($session->getError() ?: 'SNMP session GET returned no value.');
                return $v;
            }
            $v=$session->walk($this->phpOid($oid));
            if (!is_array($v)) throw new RuntimeException($session->getError() ?: 'SNMP session WALK returned no rows.');
            return $v;
        } finally {
            $session->close();
        }
    }

    /** Execute an adaptive VSOL-family v3 GET/WALK and remember the winner. */
    private function v3Adaptive(string $mode,string $oid,bool $library=false): mixed
    {
        if (!$this->isVsolCompatV3()) return $this->v3PhpWithHost($mode,$oid,$this->phpHost());

        $routes=$this->v3Route!==null ? [$this->v3Route] : ['php_bare','php_port','php_session'];
        if ($this->v3Route===null && $this->v3CliAvailable()) $routes[]='cli';
        $errors=[];

        foreach($routes as $route){
            try{
                if($route==='cli'){
                    if(!$this->v3CliAvailable()) throw new RuntimeException('Net-SNMP CLI is not installed or shell_exec is disabled.');
                    $v=$mode==='get' ? $this->cliGet($oid) : ($library ? $this->cliWalkLibrary($oid) : $this->cliWalk($oid));
                } elseif($route==='php_session') {
                    $v=$this->v3Session($mode,$oid,$library);
                } else {
                    $v=$this->v3PhpWithHost($mode,$oid,$this->v3HostForRoute($route));
                    if($mode==='walk' && !is_array($v)) throw new RuntimeException('SNMPv3 WALK returned no rows.');
                    if($mode==='get' && $v===false) throw new RuntimeException('SNMPv3 GET returned no value.');
                }
                $this->v3Route=$route;
                return $v;
            } catch(\Throwable $e){
                $errors[]=$route.': '.$e->getMessage();
                if($this->v3Route!==null) $this->v3Route=null; // stale cached route: rediscover below
            }
        }

        // A cached route may have gone stale mid-request. Retry full discovery once.
        if(count($routes)===1){
            $this->v3Route=null;
            return $this->v3Adaptive($mode,$oid,$library);
        }

        $cliNote=$this->v3CliAvailable() ? ' and Net-SNMP CLI' : '; Net-SNMP CLI fallback unavailable (install snmpget/snmpwalk and allow shell_exec)';
        throw new RuntimeException('VSOL-family SNMPv3 failed on PHP bare host, PHP explicit port, and PHP SNMP session'.$cliNote.'. '.implode(' | ',$errors));
    }

    private function v2Community(): string
    {
        $community=Crypto::decrypt($this->olt['snmp_community_enc']??null);
        if ($community==='') throw new RuntimeException('Saved SNMP v2c community is empty or could not be decrypted. Edit the OLT and save the community again.');
        return $community;
    }

    private function validateV3Credentials(): void
    {
        $user=trim((string)($this->olt['snmp_v3_user']??''));
        $level=(string)($this->olt['snmp_v3_level']??'authPriv');
        if ($user==='') throw new RuntimeException('SNMPv3 security user is required.');
        if (!in_array($level,['noAuthNoPriv','authNoPriv','authPriv'],true)) throw new RuntimeException('Invalid SNMPv3 security level.');

        if ($level!=='noAuthNoPriv') {
            $auth=Crypto::decrypt($this->olt['snmp_v3_auth_pass_enc']??null);
            if (strlen($auth)<8) {
                throw new RuntimeException('SNMPv3 authentication password must be at least 8 characters. Change the SNMPv3 user password on the OLT and update it here.');
            }
        }
        if ($level==='authPriv') {
            $priv=Crypto::decrypt($this->olt['snmp_v3_priv_pass_enc']??null);
            if (strlen($priv)<8) {
                throw new RuntimeException('SNMPv3 privacy password must be at least 8 characters for authPriv. Change it on the OLT and update it here.');
            }
        }
    }
    private function timeoutUs(): int { return max(1,(int)($this->olt['timeout_sec']??2))*1000000; }
    private function retries(): int { return max(0,min(5,(int)($this->olt['retries']??1))); }

    private function preparePhpSnmp(): void
    {
        if (defined('SNMP_VALUE_PLAIN') && function_exists('snmp_set_valueretrieval')) @snmp_set_valueretrieval(SNMP_VALUE_PLAIN);
        if (defined('SNMP_OID_OUTPUT_NUMERIC') && function_exists('snmp_set_oid_output_format')) @snmp_set_oid_output_format(SNMP_OID_OUTPUT_NUMERIC);
    }

    private function phpGet(string $oid): string
    {
        $this->preparePhpSnmp();
        set_error_handler(fn($s,$m)=>throw new RuntimeException($m));
        try {
            if (($this->olt['snmp_version']??'2c')==='3') {
                $v=$this->v3Adaptive('get',$oid,false);
            } else {
                $community=$this->v2Community();
                $v=snmp2_get($this->phpHost(),$community,$this->phpOid($oid),$this->timeoutUs(),$this->retries());
            }
        } finally { restore_error_handler(); }
        if ($v===false) throw new RuntimeException('SNMP GET failed for '.$oid);
        return $this->plain((string)$v);
    }

    private function phpWalk(string $oid): array
    {
        $this->preparePhpSnmp();
        set_error_handler(fn($s,$m)=>throw new RuntimeException($m));
        try {
            if (($this->olt['snmp_version']??'2c')==='3') {
                $raw=$this->v3Adaptive('walk',$oid,false);
            } else {
                $community=$this->v2Community();
                $raw=snmp2_real_walk($this->phpHost(),$community,$this->phpOid($oid),$this->timeoutUs(),$this->retries());
            }
        } finally { restore_error_handler(); }
        if (!is_array($raw)) throw new RuntimeException('SNMP WALK failed for '.$oid);
        $out=[]; foreach($raw as $k=>$v){$out[$this->numericOid((string)$k)]=$this->plain((string)$v);} return $out;
    }

    private function phpWalkLibrary(string $oid): array
    {
        $oldMode=defined('SNMP_VALUE_PLAIN') ? SNMP_VALUE_PLAIN : null;
        if (defined('SNMP_VALUE_LIBRARY') && function_exists('snmp_set_valueretrieval')) {
            @snmp_set_valueretrieval(SNMP_VALUE_LIBRARY);
        }
        if (defined('SNMP_OID_OUTPUT_NUMERIC') && function_exists('snmp_set_oid_output_format')) {
            @snmp_set_oid_output_format(SNMP_OID_OUTPUT_NUMERIC);
        }
        set_error_handler(fn($s,$m)=>throw new RuntimeException($m));
        try {
            if (($this->olt['snmp_version']??'2c')==='3') {
                $raw=$this->v3Adaptive('walk',$oid,true);
            } else {
                $community=$this->v2Community();
                $raw=snmp2_real_walk($this->phpHost(),$community,$this->phpOid($oid),$this->timeoutUs(),$this->retries());
            }
        } finally {
            restore_error_handler();
            if ($oldMode!==null && function_exists('snmp_set_valueretrieval')) @snmp_set_valueretrieval($oldMode);
        }
        if (!is_array($raw)) throw new RuntimeException('SNMP WALK failed for '.$oid);
        $out=[];
        foreach($raw as $k=>$v) $out[$this->numericOid((string)$k)]=(string)$v;
        return $out;
    }

    private function cliWalkLibrary(string $oid): array
    {
        // CLI output already includes Net-SNMP type/Hex-STRING formatting.
        $a=$this->cliBase('snmpwalk');$a[]=$oid;$out=$this->runCli($a);$rows=[];
        foreach(preg_split('/\r?\n/',trim($out)) as $line){
            if(preg_match('/^(\.?[0-9.]+)\s*=\s*(.*)$/',trim($line),$m))
                $rows[$this->numericOid($m[1])]=trim($m[2]);
        }
        if(!$rows) throw new RuntimeException('Could not parse SNMP WALK output for '.$oid);
        return $rows;
    }


    private function cliBase(string $cmd): array
    {
        $a=[$cmd];
        if (($this->olt['snmp_version']??'2c')==='3') {
            $this->validateV3Credentials();
            $a[]='-v3'; $a[]='-l'; $a[]=(string)($this->olt['snmp_v3_level']??'authPriv'); $a[]='-u'; $a[]=(string)($this->olt['snmp_v3_user']??'');
            if (($this->olt['snmp_v3_level']??'authPriv')!=='noAuthNoPriv') { $a[]='-a';$a[]=(string)($this->olt['snmp_v3_auth_proto']??'SHA');$a[]='-A';$a[]=Crypto::decrypt($this->olt['snmp_v3_auth_pass_enc']??null); }
            if (($this->olt['snmp_v3_level']??'authPriv')==='authPriv') { $a[]='-x';$a[]=(string)($this->olt['snmp_v3_priv_proto']??'AES');$a[]='-X';$a[]=Crypto::decrypt($this->olt['snmp_v3_priv_pass_enc']??null); }
        } else { $a[]='-v2c';$a[]='-c';$a[]=$this->v2Community(); }
        $a[]='-On'; $a[]='-t';$a[]=(string)max(1,(int)($this->olt['timeout_sec']??2)); $a[]='-r';$a[]=(string)$this->retries(); $a[]='udp:'.$this->host();
        return $a;
    }

    private function runCli(array $args): string
    {
        $cmd=implode(' ',array_map('escapeshellarg',$args)).' 2>&1'; $out=@shell_exec($cmd);
        if (!is_string($out) || trim($out)==='') throw new RuntimeException('SNMP command returned no output.');
        if (preg_match('/Timeout|No Such Object|Unknown Object Identifier|Authentication failure|Error in packet/i',$out)) throw new RuntimeException(trim($out));
        return $out;
    }

    private function cliGet(string $oid): string
    {
        $a=$this->cliBase('snmpget');$a[]=$oid;$out=$this->runCli($a);$line=trim(strtok($out,"\n"));
        if (preg_match('/^\.?[0-9.]+\s*=\s*(.*)$/',$line,$m)) return $this->plain($m[1]);
        return $this->plain($line);
    }

    private function cliWalk(string $oid): array
    {
        $a=$this->cliBase('snmpwalk');$a[]=$oid;$out=$this->runCli($a);$rows=[];
        foreach(preg_split('/\r?\n/',trim($out)) as $line){if(preg_match('/^(\.?[0-9.]+)\s*=\s*(.*)$/',trim($line),$m))$rows[$this->numericOid($m[1])]=$this->plain($m[2]);}
        if (!$rows) throw new RuntimeException('Could not parse SNMP WALK output for '.$oid); return $rows;
    }

    private function phpOid(string $oid): string
    {
        $oid=trim($oid);
        return str_starts_with($oid,'.') ? $oid : '.'.$oid;
    }

    private function numericOid(string $oid): string
    {
        if (preg_match('/(\.?\d+(?:\.\d+)+)$/',$oid,$m)) return ltrim($m[1],'.');
        return ltrim($oid,'.');
    }

    private function plain(string $v): string
    {
        // Preserve raw binary OCTET STRING values (notably MAC addresses).
        // trim() can otherwise remove a trailing 00/0A/0D/20 byte and corrupt
        // an otherwise valid six-byte MAC address returned by PHP SNMP.
        if ($v!=='' && preg_match('/[^\x09\x0A\x0D\x20-\x7E]/',$v)) return $v;
        $v=trim($v);
        $v=preg_replace('/^(?:STRING|INTEGER|Gauge32|Counter32|Counter64|Timeticks|OID|IpAddress|Hex-STRING):\s*/i','',$v)??$v;
        $v=trim($v," \t\n\r\0\x0B\"");
        if (preg_match('/^([\-\d]+)\s*\([^)]+\)$/',$v,$m)) $v=$m[1];
        return $v;
    }
}
