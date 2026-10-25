<?php
// BDCOM EPON hybrid driver: app.zip SNMP implementation + ShebaFi Telnet compatibility/reboot.
require_once __DIR__ . '/BDCOMSnmpBaseDriver.php';

class BDCOMEponDriver extends BDCOMSnmpBaseDriver {
    public function probeOid() { return '1.3.6.1.4.1.3320.101.10.1.1.26'; }

    protected function collectSnmpOnus($snmp) {
        $b='1.3.6.1.4.1.3320.101.10.1.1.';
        $rows=$this->snmpWalkColumns($snmp,array('vendor'=>$b.'1','model'=>$b.'2','mac'=>$b.'3','hardware'=>$b.'4','software'=>$b.'5','firmware'=>$b.'6','status_raw'=>$b.'26','distance_m'=>$b.'27'));
        $ifnames=$this->snmpIfNames($snmp); $out=array();
        foreach($rows as $r){
            $suffix=(string)($r['_suffix']??''); $parts=explode('.',$suffix); $idx=intval($parts[0]??0); if($idx<=0)continue;
            list($pon,$onu)=$this->snmpParseIfName(isset($ifnames[$idx])?$ifnames[$idx]:null); if($pon===null||$onu===null)continue;
            $sv=$this->snmpInt($r['status_raw']??null);
            $status=$sv===1?'online':($sv===2?'offline':($sv===3?'online':($sv===0?'authenticated':'unknown')));
            $software=$this->snmpText($r['software']??null); $firmware=$this->snmpText($r['firmware']??null);
            if(($firmware===null||strpos($firmware,'HEX:')===0)&&$software!==null&&strpos($software,'HEX:')!==0)$firmware=$software;
            $out[]=array('device_index'=>(string)$idx,'pon'=>$pon,'onu_id'=>$onu,'mac'=>$this->snmpMac($r['mac']??null),'serial'=>null,
                'name'=>$this->snmpText(isset($ifnames[$idx])?$ifnames[$idx]:null),'vendor'=>$this->snmpText($r['vendor']??null)?:'BDCOM',
                'model'=>$this->snmpText($r['model']??null),'firmware'=>$firmware,'software'=>$software,'hardware'=>$this->snmpText($r['hardware']??null),
                'status'=>$status,'admin_status'=>null,'down_reason'=>null,'distance_m'=>$this->snmpInt($r['distance_m']??null),'uptime_sec'=>null,
                'last_register'=>null,'last_deregister'=>null,'rx_power'=>null,'tx_power'=>null,'temperature_c'=>null,'voltage_v'=>null);
        }
        // BDCOM NMS-EPON optical table: temperature / 256, voltage / 10000, RX/TX / 10.
        $ob='1.3.6.1.4.1.3320.101.10.5.1.';
        $orows=$this->snmpWalkColumns($snmp,array('device_index'=>$ob.'1','temperature'=>$ob.'2','voltage'=>$ob.'3','rx'=>$ob.'5','tx'=>$ob.'6'));
        $opt=array();
        foreach($orows as $r){$idx=$this->snmpInt($r['device_index']??null);if($idx===null){$p=explode('.',(string)($r['_suffix']??''));$idx=intval($p[0]??0);}if(!$idx)continue;
            $n=$this->snmpNum($r['temperature']??null);$temp=$n===null?null:round($n/256,2);
            $n=$this->snmpNum($r['voltage']??null);$volt=$n===null?null:round($n/10000,3);
            $n=$this->snmpNum($r['rx']??null);$rx=$n===null?null:round($n/10,2);
            $n=$this->snmpNum($r['tx']??null);$tx=$n===null?null:round($n/10,2);
            $opt[(string)$idx]=array('temperature_c'=>$temp,'voltage_v'=>$volt,'rx_power'=>$rx,'tx_power'=>$tx);
        }
        foreach($out as &$r)if(isset($opt[$r['device_index']]))$r=array_merge($r,$opt[$r['device_index']]);unset($r);
        return $out;
    }

    public function getOnuList($interface='') {
        $snap=$this->snmpSnapshot('epon');
        if(is_array($snap)&&isset($snap['onu_list'])){
            if($interface==='')return $snap['onu_list'];
            $p=$this->portFromInterface($interface); return array_values(array_filter($snap['onu_list'],function($r)use($p){return (string)($r['port']??'')===(string)$p;}));
        }
        return $this->telnetGetOnuList($interface);
    }
    public function getOnuPower($interface='') {$snap=$this->snmpSnapshot('epon');if(is_array($snap)&&isset($snap['power']))return $snap['power'];return $this->telnetGetOnuPower($interface);}
    public function getUptime($interface='') {$snap=$this->snmpSnapshot('epon');if(is_array($snap)&&isset($snap['uptime']))return $snap['uptime'];return $this->telnetGetUptime($interface);}

    public function rebootOnu($interface,$onu_id=null) {
        if(!$this->ctx->telnet_connect())return false;
        try{$cmd="epon reboot-onu interface $interface onu $onu_id\r\n";$this->ctx->log("Sending reboot command: $cmd");$this->ctx->write($cmd);sleep(1);$output=$this->ctx->telnet_read(5);if(stripos($output,'y/n')!==false||stripos($output,'confirm')!==false){$this->ctx->write("y\r\n");sleep(1);$output.=$this->ctx->telnet_read(5);}return true;}catch(Throwable $e){$this->ctx->log('Reboot error: '.$e->getMessage(),'ERROR');return false;}
    }

    public function monitorAllOnus() {
        $snmp=$this->snmpSnapshot('epon');
        if(is_array($snmp)&&!empty($snmp['onu_list'])){
            // Dual transport enrichment: SNMP remains primary for inventory,
            // while Telnet contributes optical/uptime values when available.
            if($this->ctx->shouldUseTelnet()){
                $p=$this->telnetGetOnuPower(''); if($p) $snmp['power']=array_replace($snmp['power'],$p);
                $u=$this->telnetGetUptime(''); if($u) $snmp['uptime']=array_replace($snmp['uptime'],$u);
            }
            return $snmp;
        }
        $this->ctx->log('BDCOM EPON SNMP returned no ONU rows; using legacy Telnet fallback.','WARNING');
        return $this->monitorAllOnusTelnet();
    }

    private function monitorAllOnusTelnet(){
        $d=array('onu_list'=>array(),'power'=>array(),'uptime'=>array(),'mactable'=>array());$d['onu_list']=$this->telnetGetOnuList('');
        if($d['onu_list']){$d['power']=$this->telnetGetOnuPower('');$d['uptime']=$this->telnetGetUptime('');
            if(!$d['power']||!$d['uptime']){foreach(array_unique(array_column($d['onu_list'],'port')) as $p){if(!$d['power'])$d['power']=array_merge($d['power'],$this->telnetGetOnuPower('epon 0/'.$p));if(!$d['uptime'])$d['uptime']=array_merge($d['uptime'],$this->telnetGetUptime('epon 0/'.$p));}}
        }
        $cli=$this->collectBdcomCliMacEntries($d['onu_list'],'epon');$d['mactable']=$this->bdcomMacRowsToMap($cli,$d['onu_list']);
        if(!$d['mactable'])$d['mactable']=$this->ctx->bdcom_get_all_macs(); return $d;
    }

    private function telnetGetOnuList($interface=''){
        $onus=array();if(!$this->ctx->telnet_connect())return $onus;try{$cmd=$interface?"show epon onu-information interface $interface":"show epon onu-information";$output=$this->ctx->execute_command($cmd);if(!$output)return $onus;$lines=explode("\n",$output);for($i=0;$i<count($lines);$i++){$line=trim($lines[$i]);if(preg_match('/EPON\s?\d+\/(\d+):(\d+)\s+.*?\s+([0-9a-fA-F:.\-]{12,17})\s+/i',$line,$m)){$p=$m[1];$id=$m[2];$mac=$this->normalizeBdcomMacForDriver($m[3]);$status='offline';if(isset($lines[$i+1])&&preg_match('/(?:static|dynamic)\s+(\S+)/i',trim($lines[$i+1]),$sm)){$raw=strtolower($sm[1]);$status=(strpos($raw,'configured')!==false||in_array($raw,array('up','online','active'),true))?'active':'offline';$i++;}$onus[]=array('onu_id'=>$p.':'.$id,'mac'=>$mac,'status'=>$status,'port'=>$p,'onu_number'=>$id);}}return $onus;}catch(Throwable $e){return $onus;}}
    private function telnetGetOnuPower($interface=''){$power=array();if(!$this->ctx->telnet_connect())return $power;try{$cmd=$interface?"show epon onu-ctc-optical-transceiver-diagnosis interface $interface":"show epon onu-ctc-optical-transceiver-diagnosis";$output=$this->ctx->execute_command($cmd,5);foreach(explode("\n",(string)$output) as $line)if(preg_match('/epon\s?\d+\/(\d+):(\d+)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)/i',$line,$m)){$key=$m[1].':'.$m[2];$power[$key]=array('rx_power'=>$m[7]==='--'?'N/A':$m[7],'tx_power'=>$m[6]==='--'?'N/A':$m[6],'temperature'=>$m[3]==='--'?'N/A':$m[3]);}return $power;}catch(Throwable $e){return $power;}}
    private function telnetGetUptime($interface=''){$up=array();if(!$this->ctx->telnet_connect())return $up;try{$cmd=$interface?"show epon onu-sequence-time interface $interface":"show epon onu-sequence-time";$output=$this->ctx->execute_command($cmd,5);foreach(explode("\n",(string)$output) as $line)if(preg_match('/epon\s?\d+\/(\d+):(\d+)\s+(\d+)\s+(.+)$/i',$line,$m))$up[$m[1].':'.$m[2]]=trim($m[4]);return $up;}catch(Throwable $e){return $up;}}
    private function portFromInterface($s){if(preg_match('/(?:epon\s*)?\d*\/(\d+)/i',(string)$s,$m))return $m[1];if(preg_match('/^(\d+)/',(string)$s,$m))return $m[1];return trim((string)$s);}
    private function normalizeBdcomMacForDriver($mac){$h=strtoupper(preg_replace('/[^0-9A-F]/i','',(string)$mac));return strlen($h)===12?implode(':',str_split($h,2)):strtoupper((string)$mac);}
}
?>
