<?php
// BDCOM GPON hybrid driver: app.zip SNMP implementation + ShebaFi Telnet compatibility/reboot/optical fallback.
require_once __DIR__ . '/BDCOMSnmpBaseDriver.php';

class BDCOMGponDriver extends BDCOMSnmpBaseDriver {
    public function probeOid() { return '1.3.6.1.4.1.3320.10.3.1.1.8'; }

    protected function collectSnmpOnus($snmp) {
        $b='1.3.6.1.4.1.3320.10.3.1.1.';
        $rows=$this->snmpWalkColumns($snmp,array('device_index'=>$b.'1','vendor'=>$b.'2','version'=>$b.'3','serial'=>$b.'4','admin_raw'=>$b.'7','status_raw'=>$b.'8','model'=>$b.'9','hardware'=>$b.'12','uptime_sec'=>$b.'19','mac'=>$b.'28','distance_m'=>$b.'33','down_raw'=>$b.'35'));
        // Vendor NMS-GPON-MIB: status index is ONU device index, values 0=offline, 1=inactive, 2=disabled, 3=active.
        // Optical entries use the same device index. Optical readings are in tenths.
        $statusRows=$this->snmpWalkColumns($snmp,array(
            'device_index'=>'1.3.6.1.4.1.3320.10.3.3.1.1',
            'serial'=>'1.3.6.1.4.1.3320.10.3.3.1.2',
            'pon_index'=>'1.3.6.1.4.1.3320.10.3.3.1.3',
            'status_raw'=>'1.3.6.1.4.1.3320.10.3.3.1.4'));
        $statusByIndex=array();
        foreach($statusRows as $sr){
            $si=$this->snmpInt($sr['device_index']??null);
            if($si===null){$bits=explode('.',(string)($sr['_suffix']??''));$si=intval($bits[0]??0);}
            if($si>0)$statusByIndex[$si]=$sr;
        }
        $optRows=$this->snmpWalkColumns($snmp,array(
            'device_index'=>'1.3.6.1.4.1.3320.10.3.4.1.1',
            'rx'=>'1.3.6.1.4.1.3320.10.3.4.1.2',
            'tx'=>'1.3.6.1.4.1.3320.10.3.4.1.3',
            'voltage'=>'1.3.6.1.4.1.3320.10.3.4.1.4',
            'temperature'=>'1.3.6.1.4.1.3320.10.3.4.1.6'));
        $optByIndex=array();
        foreach($optRows as $or){
            $oi=$this->snmpInt($or['device_index']??null);
            if($oi===null){$bits=explode('.',(string)($or['_suffix']??''));$oi=intval($bits[0]??0);}
            if($oi>0)$optByIndex[$oi]=$or;
        }
        $ifnames=$this->snmpIfNames($snmp); $out=array();
        foreach($rows as $r){
            $idx=$this->snmpInt($r['device_index']??null);if($idx===null){$p=explode('.',(string)($r['_suffix']??''));$idx=intval($p[0]??0);}if(!$idx)continue;
            list($pon,$onu)=$this->snmpParseIfName(isset($ifnames[$idx])?$ifnames[$idx]:null);if($pon===null||$onu===null)continue;
            $vendorStatus=$statusByIndex[$idx]??array();
            $vendorOpt=$optByIndex[$idx]??array();
            $rawStatus=isset($vendorStatus['status_raw'])?$this->snmpInt($vendorStatus['status_raw']):null;
            // Only 3 denotes active in the official GPON status MIB.
            // Fallback operational state from info MIB: 1=enabled; it is not proof of online registration.
            $status=$rawStatus===3?'online':($rawStatus===0?'offline':($rawStatus===1?'inactive':($rawStatus===2?'disabled':'unknown')));
            $rawRx=$this->snmpNum($vendorOpt['rx']??null);
            $rawTx=$this->snmpNum($vendorOpt['tx']??null);
            $rawTemp=$this->snmpNum($vendorOpt['temperature']??null);
            $rawVolt=$this->snmpNum($vendorOpt['voltage']??null);
            $rx=$rawRx===null?null:round($rawRx/10,2);
            $tx=$rawTx===null?null:round($rawTx/10,2);
            $temp=$rawTemp===null?null:round($rawTemp/10,2);
            $volt=$rawVolt===null?null:round($rawVolt/10,2);$admin=$this->snmpInt($r['admin_raw']??null)===1?'up':'down';
            $out[]=array('device_index'=>(string)$idx,'pon'=>$pon,'onu_id'=>$onu,'mac'=>$this->snmpMac($r['mac']??null),'serial'=>$this->snmpSerial($vendorStatus['serial']??($r['serial']??null)),
                'name'=>isset($ifnames[$idx])?(string)$ifnames[$idx]:null,'vendor'=>$this->snmpText($r['vendor']??null)?:'BDCOM','model'=>$this->snmpText($r['model']??null),
                'firmware'=>$this->snmpText($r['version']??null),'hardware'=>$this->snmpText($r['hardware']??null),'status'=>$status,'admin_status'=>$admin,
                'down_reason'=>$this->snmpText($r['down_raw']??null),'distance_m'=>$this->snmpInt($r['distance_m']??null),'uptime_sec'=>$this->snmpInt($r['uptime_sec']??null),
                'last_register'=>null,'last_deregister'=>null,'rx_power'=>$rx,'tx_power'=>$tx,'temperature_c'=>$temp,'voltage_v'=>$volt);
        }
        return $out;
    }

    public function getOnuList($interface=''){$snap=$this->snmpSnapshot('gpon');if(is_array($snap)&&isset($snap['onu_list'])){if($interface==='')return $snap['onu_list'];$p=$this->portFromInterface($interface);return array_values(array_filter($snap['onu_list'],function($r)use($p){return (string)($r['port']??'')===(string)$p;}));}return $this->telnetGetOnuList($interface);}
    public function getOnuPower($interface=''){$tel=$this->telnetGetOnuPower($interface);if($tel)return $tel;$snap=$this->snmpSnapshot('gpon');return is_array($snap)&&isset($snap['power'])?$snap['power']:array();}
    public function getUptime($interface=''){$snap=$this->snmpSnapshot('gpon');if(is_array($snap)&&isset($snap['uptime']))return $snap['uptime'];return $this->telnetGetUptime($interface);}

    public function rebootOnu($interface,$onu_id=null){if(!$this->ctx->telnet_connect())return false;try{$this->ctx->write("gpon reboot onu interface $interface:$onu_id\r\n");$output=$this->ctx->telnet_read(3);if(stripos($output,'Are you sure')!==false||stripos($output,'confirm')!==false){$this->ctx->write("y\r\n");$this->ctx->telnet_read(3);}return true;}catch(Throwable $e){$this->ctx->log('Reboot error: '.$e->getMessage(),'ERROR');return false;}}

    public function monitorAllOnus(){
        $d=$this->snmpSnapshot('gpon');
        if(is_array($d)&&!empty($d['onu_list'])){
            // app.zip has confirmed GPON ONU/status/distance/uptime SNMP OIDs. Keep ShebaFi's existing optical CLI as optional enrichment only when CLI credentials were saved.
            if($this->ctx->shouldUseTelnet()){
                $p=$this->telnetGetOnuPower(''); if($p) foreach($p as $k=>$v){if(!isset($d['power'][$k]))$d['power'][$k]=$v;else foreach($v as $metric=>$val){if(!isset($d['power'][$k][$metric])||$d['power'][$k][$metric]==='N/A')$d['power'][$k][$metric]=$val;}}
                $u=$this->telnetGetUptime(''); if($u) $d['uptime']=array_replace($d['uptime'],$u);
            }
            return $d;
        }
        $this->ctx->log('BDCOM GPON SNMP returned no ONU rows; using legacy Telnet fallback.','WARNING');
        $d=array('onu_list'=>$this->telnetGetOnuList(''),'power'=>array(),'uptime'=>array(),'mactable'=>array());
        if($d['onu_list']){$d['power']=$this->telnetGetOnuPower('');$d['uptime']=$this->telnetGetUptime('');}
        $cli=$this->collectBdcomCliMacEntries($d['onu_list'],'gpon');$d['mactable']=$this->bdcomMacRowsToMap($cli,$d['onu_list']);if(!$d['mactable'])$d['mactable']=$this->ctx->bdcom_get_all_macs();return $d;
    }

    private function monitorAllOnusTelnet(){
        $d=array('onu_list'=>$this->telnetGetOnuList(''),'power'=>array(),'uptime'=>array(),'mactable'=>array());
        if($d['onu_list']){$d['power']=$this->telnetGetOnuPower('');$d['uptime']=$this->telnetGetUptime('');}
        $cli=$this->collectBdcomCliMacEntries($d['onu_list'],'gpon');
        $d['mactable']=$this->bdcomMacRowsToMap($cli,$d['onu_list']);
        return $d;
    }

    private function telnetGetOnuList($interface=''){$onus=array();if(!$this->ctx->telnet_connect())return $onus;try{$cmd=$interface?"show gpon onu-information interface $interface":"show gpon onu-information";$output=$this->ctx->execute_command($cmd);foreach(explode("\n",(string)$output) as $line){
            if(preg_match('/gpon\s?\d+\/(\d+):(\d+)\s+.*?([0-9a-fA-F:.-]{12,17}).*?\b(active|online|up|offline|down)\b/i',$line,$m)){$p=$m[1];$id=$m[2];$status=strtolower($m[4]);$onus[]=array('onu_id'=>$p.':'.$id,'port'=>$p,'onu_number'=>$id,'mac'=>$this->normalizeMac($m[3]),'status'=>in_array($status,array('active','online','up'),true)?'online':'offline');}
            elseif(preg_match('/(\d+)\s+([0-9a-fA-F:]{17})\s+(\S+)\s+(\S+)/',$line,$m)){$id=$m[1];$p=$this->portFromInterface($interface?:'1');$onus[]=array('onu_id'=>$p.':'.$id,'port'=>$p,'onu_number'=>$id,'mac'=>strtoupper($m[2]),'status'=>$m[3],'serial'=>$m[4]);}
        }return $onus;}catch(Throwable $e){return $onus;}}
    private function telnetGetOnuPower($interface=''){$power=array();if(!$this->ctx->telnet_connect())return $power;try{$cmd=$interface?"show gpon onu-optical-transceiver-diagnosis interface $interface":"show gpon onu-optical-transceiver-diagnosis";$output=$this->ctx->execute_command($cmd,5);$current=null;$currentPort=$this->portFromInterface($interface?:'1');foreach(explode("\n",(string)$output) as $line){if(preg_match('/(?:gpon\s?\d+\/(\d+):(\d+)|ONU\s+(\d+))/i',$line,$m)){$p=!empty($m[1])?$m[1]:$currentPort;$id=!empty($m[2])?$m[2]:$m[3];$current=$p.':'.$id;$power[$current]=array('rx_power'=>'N/A','tx_power'=>'N/A','temperature'=>'N/A','voltage'=>'N/A');}if($current){if(preg_match('/Rx Power:\s*([-\d.]+)\s*dBm/i',$line,$m))$power[$current]['rx_power']=$m[1];if(preg_match('/Tx Power:\s*([-\d.]+)\s*dBm/i',$line,$m))$power[$current]['tx_power']=$m[1];if(preg_match('/Temperature:\s*([-\d.]+)/i',$line,$m))$power[$current]['temperature']=$m[1];if(preg_match('/Voltage:\s*([-\d.]+)/i',$line,$m))$power[$current]['voltage']=$m[1];}}
        return $power;}catch(Throwable $e){return $power;}}
    private function telnetGetUptime($interface=''){$up=array();if(!$this->ctx->telnet_connect())return $up;try{$cmd=$interface?"show gpon active-onu interface $interface":"show gpon active-onu";$output=$this->ctx->execute_command($cmd);$p=$this->portFromInterface($interface?:'1');foreach(explode("\n",(string)$output) as $line){if(preg_match('/gpon\s?\d+\/(\d+):(\d+).*?(?:Uptime|Up time):\s*(.+)$/i',$line,$m))$up[$m[1].':'.$m[2]]=trim($m[3]);elseif(preg_match('/ONU\s+(\d+).*?(?:Uptime|Up time):\s+(.+)$/i',$line,$m))$up[$p.':'.$m[1]]=trim($m[2]);}return $up;}catch(Throwable $e){return $up;}}
    private function portFromInterface($s){if(preg_match('/(?:gpon\s*)?\d*\/(\d+)/i',(string)$s,$m))return $m[1];if(preg_match('/^(\d+)/',(string)$s,$m))return $m[1];return trim((string)$s);}
    private function normalizeMac($mac){$h=strtoupper(preg_replace('/[^0-9A-F]/i','',(string)$mac));return strlen($h)===12?implode(':',str_split($h,2)):strtoupper((string)$mac);}
}
?>
