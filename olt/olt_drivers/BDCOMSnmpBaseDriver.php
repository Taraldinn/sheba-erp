<?php
require_once __DIR__ . '/OLTInterface.php';
require_once __DIR__ . '/CDataV2SnmpClient.php';
require_once __DIR__ . '/BDCOMSnmpTrait.php';

abstract class BDCOMSnmpBaseDriver implements OLTInterface {
    use BDCOMSnmpTrait;
    protected $ctx;
    protected $lastSnmpCollection = null;

    public function __construct($context) { $this->ctx = $context; }
    abstract public function probeOid();
    abstract protected function collectSnmpOnus($snmp);

    protected function snmpClient() {
        return new CDataV2SnmpClient($this->ctx->getOltIp(), $this->ctx->getSnmpCommunity(), $this->ctx->getSnmpPort(), $this->ctx->getTimeout(), $this->ctx->getSnmpRetries());
    }

    public function testSnmp() {
        try {
            $snmp = $this->snmpClient();
            try { $snmp->get('1.3.6.1.2.1.1.1.0'); return true; }
            catch (Throwable $e) { $rows = $snmp->walk($this->probeOid()); return is_array($rows); }
        } catch (Throwable $e) {
            $this->ctx->log('BDCOM SNMP test failed: ' . $e->getMessage(), 'ERROR');
            return false;
        }
    }

    protected function snmpSnapshot($tech) {
        if ($this->lastSnmpCollection !== null) return $this->lastSnmpCollection;
        try {
            $snmp = $this->snmpClient();
            $onus = $this->collectSnmpOnus($snmp);
            if (!$onus) { $this->ctx->log('BDCOM SNMP returned zero usable ONUs: verify UDP SNMP access, OID availability and ifName index mapping.', 'WARNING'); return false; }
            $result = array('onu_list'=>array(), 'power'=>array(), 'uptime'=>array(), 'mactable'=>array());
            foreach ($onus as $r) {
                $pon=(string)($r['pon']??''); $onu=(string)($r['onu_id']??''); if($pon===''||$onu==='')continue;
                $key=$pon.':'.$onu;
                $result['onu_list'][]=array(
                    'onu_id'=>$key,'port'=>$pon,'onu_number'=>$onu,'mac'=>$r['mac']??'',
                    'serial'=>$r['serial']??'', 'status'=>$r['status']??'unknown', 'name'=>$r['name']??null,
                    'vendor'=>$r['vendor']??'BDCOM','model'=>$r['model']??null,'firmware'=>$r['firmware']??null,
                    'software'=>$r['software']??null,'hardware'=>$r['hardware']??null,'admin_status'=>$r['admin_status']??null,
                    'down_reason'=>$r['down_reason']??null,'distance'=>isset($r['distance_m'])&&$r['distance_m']!==null?$r['distance_m']:'N/A',
                    'distance_m'=>$r['distance_m']??null,'device_index'=>$r['device_index']??null,'last_register'=>$r['last_register']??null,
                    'last_deregister'=>$r['last_deregister']??null,'deregister_reason'=>$r['down_reason']??null,'vendor_id'=>$r['vendor']??'BDCOM'
                );
                $result['power'][$key]=array(
                    'rx_power'=>isset($r['rx_power'])&&$r['rx_power']!==null?$r['rx_power']:'N/A',
                    'tx_power'=>isset($r['tx_power'])&&$r['tx_power']!==null?$r['tx_power']:'N/A',
                    'temperature'=>isset($r['temperature_c'])&&$r['temperature_c']!==null?$r['temperature_c']:'N/A',
                    'voltage'=>isset($r['voltage_v'])&&$r['voltage_v']!==null?$r['voltage_v']:'N/A','vendor_id'=>$r['vendor']??'BDCOM'
                );
                $result['uptime'][$key]=$this->formatSnmpUptime($r['uptime_sec']??null);
            }
            // Caller ID / learned client MAC is sourced from Telnet CLI, not SNMP FDB.
            $macRows = array();
            if ($this->ctx->shouldUseTelnet()) {
                $cliRows = $this->collectBdcomCliMacEntries($result['onu_list'], $tech);
                if ($cliRows) $macRows = $cliRows;
                else $this->ctx->log('BDCOM Telnet MAC table returned no mapped client entries; ONU SNMP data remains available.', 'WARNING');
            }
            $result['mactable']=$this->bdcomMacRowsToMap($macRows ?: array(),$result['onu_list']);
            $this->lastSnmpCollection=$result;
            return $result;
        } catch (Throwable $e) {
            $this->ctx->log('BDCOM SNMP collection failed: '.$e->getMessage(), 'ERROR');
            return false;
        }
    }

    protected function snmpWalkColumns($snmp,$cols) {
        $rows=array(); foreach($cols as $field=>$base){ if(!$base)continue; try{$walk=$snmp->walk($base);}catch(Throwable $e){continue;} foreach($walk as $oid=>$val){$suffix=$this->snmpSuffix($oid,$base);if($suffix==='')continue;if(!isset($rows[$suffix]))$rows[$suffix]=array('_suffix'=>$suffix);$rows[$suffix][$field]=$val;}} return array_values($rows);
    }
    protected function snmpSuffix($oid,$base){$oid=ltrim((string)$oid,'.');$base=ltrim((string)$base,'.');return strpos($oid,$base.'.')===0?substr($oid,strlen($base)+1):'';}
    protected function snmpInt($v){if($v===null||$v==='')return null;return preg_match('/-?\d+/',(string)$v,$m)?intval($m[0]):null;}
    protected function snmpNum($v){if($v===null||$v==='')return null;return preg_match('/-?\d+(?:\.\d+)?/',str_replace(',','.',(string)$v),$m)?floatval($m[0]):null;}
    protected function snmpText($v){if($v===null)return null;$s=(string)$v;if($s==='')return null;foreach(array('OCTET STRING:','STRING:') as $p)if(stripos($s,$p)===0){$s=ltrim(substr($s,strlen($p)));break;}if(strlen($s)>=2&&$s[0]==='"'&&substr($s,-1)==='"')$s=substr($s,1,-1);if($s==='')return null;$binary=preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/',$s);$utf8=function_exists('mb_check_encoding')?mb_check_encoding($s,'UTF-8'):preg_match('//u',$s);if($binary||!$utf8)return 'HEX:'.strtoupper(bin2hex($s));$s=trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u','',$s));return $s===''?null:$s;}
    protected function snmpMac($v){$s=(string)$v;if($s==='')return null;$t=trim($s);if(preg_match('/^Hex-STRING:\s*((?:[0-9A-Fa-f]{2}(?:\s+|$)){6})/i',$t,$m)){$hex=preg_replace('/[^0-9A-Fa-f]/','',$m[1]);if(strlen($hex)===12)return strtoupper(implode(':',str_split($hex,2)));}foreach(array('OCTET STRING:','STRING:') as $p)if(stripos($s,$p)===0){$s=ltrim(substr($s,strlen($p)));break;}if(strlen($s)>=2&&$s[0]==='"'&&substr($s,-1)==='"')$s=substr($s,1,-1);if(strlen($s)===6)return strtoupper(implode(':',str_split(bin2hex($s),2)));$hex=preg_replace('/[^0-9a-f]/i','',trim($s));return strlen($hex)===12?strtoupper(implode(':',str_split($hex,2))):null;}
    protected function snmpSerial($v){$s=(string)$v;if($s==='')return null;if(strlen($s)===8&&preg_match('/[^\x20-\x7E]/',$s)){$vendor=substr($s,0,4);return (preg_match('/^[\x20-\x7E]{4}$/',$vendor)?strtoupper($vendor):strtoupper(bin2hex($vendor))).strtoupper(bin2hex(substr($s,4)));}$s=trim($s);if(stripos($s,'hex-string:')===0)$s=trim(substr($s,11));$hex=preg_replace('/[^0-9a-f]/i','',$s);if(strlen($hex)===16){$bytes=@hex2bin($hex);if($bytes!==false){$vendor=substr($bytes,0,4);if(preg_match('/^[\x20-\x7E]{4}$/',$vendor))return strtoupper($vendor).strtoupper(bin2hex(substr($bytes,4)));}return strtoupper($hex);}return trim($s,'"');}
    protected function snmpIfNames($snmp){try{$raw=$snmp->walk('1.3.6.1.2.1.31.1.1.1.1');}catch(Throwable $e){return array();}$m=array();foreach($raw as $oid=>$v){$idx=intval(substr($oid,strrpos($oid,'.')+1));$m[$idx]=$v;}return $m;}
    protected function snmpParseIfName($name){if(!$name)return array(null,null);if(preg_match('/(?:epon|gpon|pon)?\s*([0-9]+)\s*\/\s*([0-9]+)\s*[:\/]\s*([0-9]+)/i',(string)$name,$m))return array((string)intval($m[2]),(string)intval($m[3]));if(preg_match('/(?:epon|gpon|pon)?\s*([0-9]+)\s*\/\s*([0-9]+):([0-9]+)/i',(string)$name,$m))return array((string)intval($m[2]),(string)intval($m[3]));return array(null,null);}
    protected function formatSnmpUptime($seconds){if($seconds===null||!is_numeric($seconds))return 'N/A';$s=max(0,intval($seconds));$d=intdiv($s,86400);$s%=86400;$h=intdiv($s,3600);$s%=3600;$m=intdiv($s,60);$s%=60;$p=array();if($d)$p[]=$d.'d';if($h||$d)$p[]=$h.'h';if($m||$h||$d)$p[]=$m.'m';$p[]=$s.'s';return implode(' ',$p);}
}
