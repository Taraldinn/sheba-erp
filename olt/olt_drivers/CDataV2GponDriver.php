<?php
require_once __DIR__ . '/CDataV2BaseDriver.php';

class CDataV2GponDriver extends CDataV2BaseDriver {
    public function probeOid() { return '1.3.6.1.4.1.17409.2.8.4.1.1.7'; }

    protected function collectOnus($snmp) {
        $b='1.3.6.1.4.1.17409.2.8.4.1.1.';
        $rows=$this->walkColumns($snmp,array(
            'device_index'=>$b.'1','name'=>$b.'2','serial'=>$b.'3','vendor'=>$b.'5','model'=>$b.'6',
            'status_raw'=>$b.'7','admin_raw'=>$b.'8','distance_m'=>$b.'9','uptime_sec'=>$b.'13','hardware'=>$b.'14',
            'last_deregister'=>$b.'102','down_reason'=>$b.'103'
        ));
        $out=array();
        foreach($rows as $r){
            $idx=$this->intVal($r['device_index']??null);
            if($idx===null){$s=(string)($r['_suffix']??'');$idx=$this->intVal(strrchr($s,'.')?:$s);}
            if(!$idx)continue;$d=$this->cdataIndex($idx);if($d['pon']<=0||$d['onu']<=0)continue;
            $status=$this->intVal($r['status_raw']??null)===1?'online':'offline';
            $admin=$this->intVal($r['admin_raw']??null)===1?'up':'down';
            $out[]=array(
                'device_index'=>(string)$idx,'pon'=>(string)$d['pon'],'onu_id'=>(string)$d['onu'],'mac'=>'',
                'serial'=>$this->serialVal($r['serial']??null),'name'=>$this->textVal($r['name']??null),'description'=>null,
                'vendor'=>$this->textVal($r['vendor']??null)?:'C-DATA-compatible','model'=>$this->textVal($r['model']??null),
                'firmware'=>null,'software'=>null,'hardware'=>$this->textVal($r['hardware']??null),'status'=>$status,'admin_status'=>$admin,
                'down_reason'=>$this->textVal($r['down_reason']??null),'distance_m'=>$this->intVal($r['distance_m']??null),
                'uptime_sec'=>$this->intVal($r['uptime_sec']??null),'last_register'=>null,'last_deregister'=>$this->textVal($r['last_deregister']??null),
                'rx_power'=>null,'tx_power'=>null,'temperature_c'=>null,'voltage_v'=>null
            );
        }
        $ob='1.3.6.1.4.1.17409.2.8.4.4.1.';
        $orows=$this->walkColumns($snmp,array('device_index'=>$ob.'1','rx'=>$ob.'4','tx'=>$ob.'5','voltage'=>$ob.'7','temperature'=>$ob.'8'));
        $om=array();
        foreach($orows as $r){$idx=$this->intVal($r['device_index']??null);if($idx===null){$s=(string)($r['_suffix']??'');$idx=$this->intVal(strrchr($s,'.')?:$s);}if(!$idx)continue;$om[(string)$idx]=array('rx_power'=>$this->scaledDbm($r['rx']??null),'tx_power'=>$this->scaledDbm($r['tx']??null),'temperature_c'=>$this->scaledTemp($r['temperature']??null),'voltage_v'=>$this->scaledVoltage($r['voltage']??null));}
        foreach($out as &$r)if(isset($om[$r['device_index']]))$r=array_merge($r,$om[$r['device_index']]);unset($r);
        return $out;
    }

    protected function collectMacTable($snmp, $onus) {
        // C-DATA V2 GPON core inventory/optics comes from SNMP.  In dual mode,
        // Telnet is also used for the learned client MAC/Caller-ID table.  This
        // runs in the background MAC worker, never in the browser request.
        if (!$this->ctx->shouldUseTelnet()) return array();
        $rows = $this->collectCliGlobalMacs($onus);
        $mapped = array(); $seen = array();
        foreach ($rows as $r) {
            $pon=(string)($r['pon']??''); $onu=(string)($r['onu_id']??''); $mac=(string)($r['mac']??'');
            if ($pon==='' || $onu==='' || $mac==='') continue;
            $hex=strtoupper(preg_replace('/[^0-9A-F]/i','',$mac));
            $key=$pon.':'.$onu; $dk=$key.':'.$hex.':'.intval($r['vlan_id']??0);
            if (isset($seen[$dk])) continue; $seen[$dk]=true;
            if (!isset($mapped[$key])) $mapped[$key]=array();
            $mapped[$key][]=array('mac'=>$mac,'vlan'=>intval($r['vlan_id']??0),'vlan_id'=>intval($r['vlan_id']??0),'type'=>$r['mac_type']??'dynamic','source'=>$r['source']??'cdata_gpon_cli');
        }
        return $mapped;
    }

    private function collectCliGlobalMacs($onus) {
        if (!$this->ctx->telnet_connect()) return array();
        $registered=array();
        foreach ($onus as $o) {
            $k=(string)intval($o['pon']??0).':'.(string)intval($o['onu_id']??0);
            $registered[$k]=strtoupper(preg_replace('/[^0-9A-F]/i','',(string)($o['mac']??'')));
        }
        $out=array(); $seen=array();
        try {
            foreach (array('show mac-address dynamic','show mac-address all') as $cmd) {
                try { $text=$this->ctx->execute_command_bounded($cmd, 8); } catch (Throwable $e) { $text=''; }
                foreach (preg_split('/\r?\n/', (string)$text) as $line) {
                    $line=trim(preg_replace('/\s+/',' ',(string)$line)); if($line==='') continue;
                    if(!preg_match('/\b([0-9A-F]{2}(?::[0-9A-F]{2}){5}|[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4})\b/i',$line,$mm)) continue;
                    $hex=strtoupper(preg_replace('/[^0-9A-F]/i','',$mm[1])); if(strlen($hex)!==12) continue;
                    $first=hexdec(substr($hex,0,2)); if(($first&1)===1 || $hex==='000000000000' || $hex==='FFFFFFFFFFFF') continue;
                    $pon=0; $onu=0; $type='dynamic';
                    if(preg_match('/(?:^|\s)(?:g?pon|epon)\s*0\/0\/(\d+)\s+(\d+)\s+(?:\d+|-)?\s*(dynamic|static|black-?hole|blackhole)\b/i',$line,$pm)){
                        $pon=intval($pm[1]); $onu=intval($pm[2]); $type=strtolower(str_replace('-','',$pm[3]));
                    } elseif(preg_match('/(?:^|\s)(?:g?pon|epon)\s*0\/0\/(\d+)\s+(\d+)\b/i',$line,$pm)){
                        $pon=intval($pm[1]); $onu=intval($pm[2]);
                        if(preg_match('/\b(dynamic|static|black-?hole|blackhole)\b/i',$line,$tm))$type=strtolower(str_replace('-','',$tm[1]));
                    } else continue;
                    if($pon<=0||$onu<=0)continue;
                    $posKey=$pon.':'.$onu; if(isset($registered[$posKey])&&$registered[$posKey]!==''&&$registered[$posKey]===$hex)continue;
                    $vlan=0; $after=preg_replace('/^.*?'.preg_quote($mm[1],'/').'\s*/i','',$line,1);
                    if(is_string($after)&&preg_match('/^(\d{1,4})(?:\s|$)/',trim($after),$vm))$vlan=intval($vm[1]);
                    $mac=implode(':',str_split($hex,2)); $dk=strtolower($posKey.'/'.$hex.'/'.$vlan); if(isset($seen[$dk]))continue; $seen[$dk]=true;
                    $out[]=array('pon'=>(string)$pon,'onu_id'=>(string)$onu,'mac'=>$mac,'vlan_id'=>$vlan,'mac_type'=>$type,'source'=>'cdata_gpon_cli');
                }
                if($out) break;
            }
        } finally { $this->ctx->telnet_disconnect(); }
        return $out;
    }

    private function scaledDbm($v){$n=$this->numVal($v);return $n===null?null:round($n/100,2);}
    private function scaledTemp($v){$n=$this->numVal($v);return $n===null?null:round($n/100,2);}
    private function scaledVoltage($v){$n=$this->numVal($v);return $n===null?null:round($n/100000,3);}
}
