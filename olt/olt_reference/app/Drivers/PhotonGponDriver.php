<?php
namespace App\Drivers;

use App\Services\SnmpClient;

/** Photon GPON / TBS compatible driver using PHOTON-GPON-MIB (enterprise 12170). */
final class PhotonGponDriver extends AbstractDriver
{
    private const ROOT='1.3.6.1.4.1.12170.4.2.4.1';

    public function name(): string { return 'Photon/TBS compatible GPON'; }
    public function probeOid(): string { return self::ROOT.'.1.1.6'; } // ontRunStatus

    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        $b=self::ROOT.'.1.1.'; // ontBaseInfoEntry
        $rows=$this->walkColumns($snmp,[
            'slot'=>$b.'1','pon'=>$b.'2','onu_id'=>$b.'3','description'=>$b.'4','device_type'=>$b.'5',
            'status_raw'=>$b.'6','distance'=>$b.'7','serial'=>$b.'8','down_reason'=>$b.'12',
            'last_state_time'=>$b.'13','up_down_time'=>$b.'14'
        ]);

        // Join version/equipment information by slot.pon.onu.
        $vb=self::ROOT.'.2.1.';
        $versions=$this->walkColumns($snmp,[
            'slot'=>$vb.'1','pon'=>$vb.'2','onu_id'=>$vb.'3','vendor'=>$vb.'4','version'=>$vb.'5',
            'equipment'=>$vb.'6','software'=>$vb.'7','software_alt'=>$vb.'8'
        ]);
        $vmap=[];
        foreach($versions as $v){
            $key=$this->tripleKey($v);
            if($key!==null) $vmap[$key]=$v;
        }

        $out=[];
        foreach($rows as $r){
            $key=$this->tripleKey($r);
            if($key===null) continue;
            [$slot,$pon,$onu]=array_map('intval',explode('.',$key));
            if($pon<=0 || $onu<=0) continue;
            $v=$vmap[$key]??[];
            $sv=$this->int($r['status_raw']??null);
            $status=$sv===1?'online':($sv===0?'offline':'unknown');
            $ponLabel=$this->ponLabel($slot,$pon);
            $vendor=$this->text($v['vendor']??null) ?: $this->profileVendor($olt);
            $model=$this->text($v['equipment']??null) ?: $this->text($r['device_type']??null);
            $firmware=$this->text($v['software']??null) ?: $this->text($v['software_alt']??null) ?: $this->text($v['version']??null);
            $serial=$this->serial($r['serial']??null);

            $out[]=[
                'device_index'=>$key,
                'pon'=>$ponLabel,
                'onu_id'=>(string)$onu,
                'mac'=>null,
                'serial'=>$serial,
                'name'=>null,
                'description'=>$this->text($r['description']??null),
                'vendor'=>$vendor,
                'model'=>$model,
                'firmware'=>$firmware,
                'hardware'=>$this->text($v['version']??null),
                'status'=>$status,
                'admin_status'=>null,
                'down_reason'=>$status==='online'?null:$this->text($r['down_reason']??null),
                'distance_m'=>$this->distanceMeters($r['distance']??null),
                'uptime_sec'=>$this->durationSeconds($r['up_down_time']??null),
                'last_register'=>$status==='online'?$this->text($r['last_state_time']??null):null,
                'last_deregister'=>$status==='offline'?$this->text($r['last_state_time']??null):null,
                'rx_power'=>null,'tx_power'=>null,'olt_rx_power'=>null,'temperature_c'=>null,'voltage_v'=>null,
                'onu_key'=>'photon-gpon:'.$slot.'/'.$pon.'/'.$onu,
            ];
        }

        // Photon GPON optical table values are textual engineering units (dBm/V/C).
        $ob=self::ROOT.'.4.1.';
        $optRows=$this->walkColumns($snmp,[
            'slot'=>$ob.'1','pon'=>$ob.'2','onu_id'=>$ob.'3','voltage'=>$ob.'4','rx'=>$ob.'5','tx'=>$ob.'6',
            'temperature'=>$ob.'8','olt_rx'=>$ob.'11'
        ]);
        $omap=[];
        foreach($optRows as $r){
            $key=$this->tripleKey($r); if($key===null) continue;
            $omap[$key]=[
                'voltage_v'=>$this->engineeringValue($r['voltage']??null,0,10),
                'rx_power'=>$this->engineeringValue($r['rx']??null,-60,20),
                'tx_power'=>$this->engineeringValue($r['tx']??null,-60,20),
                'temperature_c'=>$this->engineeringValue($r['temperature']??null,-50,150),
                'olt_rx_power'=>$this->engineeringValue($r['olt_rx']??null,-60,20),
            ];
        }
        foreach($out as &$r){ if(isset($omap[$r['device_index']])) $r=array_merge($r,$omap[$r['device_index']]); }
        unset($r);
        return $out;
    }

    public function collectMacEntries(SnmpClient $snmp,array $olt): ?array
    {
        // ontMacAddrEntry: VLAN + MAC are the table indexes; slot/PON/ONT are
        // returned as columns, so no bridge-port guessing is required.
        $b=self::ROOT.'.10.1.';
        $cols=[
            'mac'=>$b.'2','slot'=>$b.'3','pon'=>$b.'4','onu_id'=>$b.'5','serial'=>$b.'6','gem_user'=>$b.'7','gem'=>$b.'8'
        ];
        $rows=$this->walkColumns($snmp,$cols);
        $out=[];
        foreach($rows as $r){
            $pon=$this->int($r['pon']??null); $onu=$this->int($r['onu_id']??null);
            if($pon===null || $pon<=0 || $onu===null || $onu<=0) continue;
            $suffix=trim((string)($r['_suffix']??''));
            [$vlan,$indexMac]=$this->parseMacIndex($suffix);
            $mac=$this->mac($r['mac']??null) ?: $indexMac;
            if(!$mac) continue;
            $gem=$this->int($r['gem']??null);
            $slot=$this->int($r['slot']??null)??0;
            $ponLabel=$this->ponLabel($slot,$pon);
            $out[]=[
                'pon'=>$ponLabel,'onu_id'=>(string)$onu,'mac'=>$mac,'vlan_id'=>$vlan,
                'mac_type'=>null,'port_id'=>'slot '.$slot.' / pon '.$pon,
                'service_port'=>null,'gem_id'=>$gem,'age_sec'=>null,
                'source'=>'photon_gpon_ont_mac_table',
                'entry_key'=>strtolower($ponLabel.'/'.$onu.'/'.str_replace(':','',$mac).'/'.$vlan),
            ];
        }
        return $out;
    }

    private function ponLabel(int $slot,int $pon): string
    {
        return $slot>0 ? ($slot.'/'.$pon) : (string)$pon;
    }

    private function profileVendor(array $olt): string
    {
        $p=(string)($olt['driver_profile']??'');
        return str_starts_with($p,'tbs_')?'TBS':'Photon';
    }

    private function tripleKey(array $row): ?string
    {
        $slot=$this->int($row['slot']??null);
        $pon=$this->int($row['pon']??null);
        $onu=$this->int($row['onu_id']??null);
        if($slot!==null && $pon!==null && $onu!==null) return $slot.'.'.$pon.'.'.$onu;
        $suffix=trim((string)($row['_suffix']??''));
        if(preg_match('/^(\d+)\.(\d+)\.(\d+)$/',$suffix,$m)) return ((int)$m[1]).'.'.((int)$m[2]).'.'.((int)$m[3]);
        return null;
    }

    /** @return array{0:int,1:?string} */
    private function parseMacIndex(string $suffix): array
    {
        $parts=array_values(array_filter(explode('.',$suffix),'strlen'));
        if(!$parts) return [0,null];
        $vlan=(int)array_shift($parts);
        // INDEX { INTEGER vlan, MacAddress }; agents may encode MAC as six
        // octets directly or with a leading OCTET STRING length=6.
        if(count($parts)>=7 && (int)$parts[0]===6) array_shift($parts);
        $macParts=array_slice($parts,0,6);
        if(count($macParts)!==6) return [max(0,$vlan),null];
        $bytes=[];
        foreach($macParts as $p){ if(!preg_match('/^\d+$/',$p)) return [max(0,$vlan),null]; $n=(int)$p; if($n<0||$n>255)return [max(0,$vlan),null]; $bytes[]=$n; }
        $mac=strtoupper(implode(':',array_map(fn($n)=>sprintf('%02X',$n),$bytes)));
        return [max(0,$vlan),$mac];
    }

    private function engineeringValue(mixed $value,float $min,float $max): ?float
    {
        $n=$this->num($value); if($n===null) return null;
        // Values are defined as OCTET STRING with engineering-unit text. Keep
        // them unscaled unless a firmware returns a clearly fixed-point integer.
        if(($n<$min || $n>$max) && abs($n)>=100){
            foreach([10,100,1000] as $scale){
                $v=$n/$scale;
                if($v>=$min && $v<=$max) return round($v,3);
            }
        }
        return ($n<$min || $n>$max)?null:round($n,3);
    }

    private function distanceMeters(mixed $value): ?int
    {
        if($value===null) return null;
        $s=strtolower((string)$value);
        $n=$this->num($value); if($n===null) return null;
        if(str_contains($s,'km')) $n*=1000;
        $m=(int)round($n);
        return ($m<0 || $m>100000)?null:$m;
    }

    private function durationSeconds(mixed $value): ?int
    {
        if($value===null) return null;
        $s=trim((string)$value);
        if(preg_match('/^\d+$/',$s)) return (int)$s;
        // Accept common "D days HH:MM:SS" / "HH:MM:SS" strings without
        // assuming a format when the firmware returns something else.
        if(preg_match('/(?:(\d+)\s*day[s]?\s*)?(\d{1,2}):(\d{1,2}):(\d{1,2})/i',$s,$m)){
            return ((int)($m[1]??0))*86400+(int)$m[2]*3600+(int)$m[3]*60+(int)$m[4];
        }
        return null;
    }
}
