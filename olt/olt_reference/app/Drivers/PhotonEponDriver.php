<?php
namespace App\Drivers;

use App\Services\SnmpClient;

/**
 * Photon EPON / TBS compatible driver.
 *
 * Based only on the PHOTON-EPON-MIB enterprise tree 1.3.6.1.4.1.12170.
 * TBS is exposed as a separate UI profile but intentionally shares this exact
 * driver because the operator confirmed both OLT families are the same.
 */
final class PhotonEponDriver extends AbstractDriver
{
    private const ROOT='1.3.6.1.4.1.12170';

    public function name(): string { return 'Photon/TBS compatible EPON'; }
    public function probeOid(): string { return self::ROOT.'.2.3.4.1.1.8'; } // onuOperationStatus

    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        $b=self::ROOT.'.2.3.4.1.1.';
        $rows=$this->walkColumns($snmp,[
            'name'=>$b.'2',
            'mac'=>$b.'7',
            'status_raw'=>$b.'8',
            'admin_raw'=>$b.'9',
            'chip_vendor'=>$b.'10',
            'chip_type'=>$b.'11',
            'chip_version'=>$b.'12',
            'software'=>$b.'13',
            'firmware'=>$b.'14',
            'distance_m'=>$b.'15',
            'uptime_sec'=>$b.'18',
            'model'=>$b.'25',
            'attribute_type'=>$b.'26',
        ]);

        $ponMap=$this->physicalPonMap($snmp);
        $out=[];
        foreach($rows as $r){
            $idx=$this->deviceIndexFromSuffix($r);
            if($idx===null) continue;
            $d=$this->cdataIndex($idx); // same EponDeviceIndex layout documented by Photon MIB
            if($d['pon']<=0 || $d['onu']<=0) continue;
            $physicalPon=$this->physicalPon((int)$d['slot'],(int)$d['pon'],$ponMap);
            $pon=$this->ponLabel((int)$d['slot'],$physicalPon);

            $sv=$this->int($r['status_raw']??null);
            $status=$sv===1?'online':($sv===2?'offline':($sv===3?'testing':'unknown'));
            $av=$this->int($r['admin_raw']??null);
            $admin=$av===1?'up':($av===2?'down':($av===3?'testing':null));
            $model=$this->text($r['model']??null) ?: $this->text($r['chip_type']??null) ?: $this->text($r['attribute_type']??null);
            $vendor=$this->text($r['chip_vendor']??null) ?: $this->profileVendor($olt);

            $x=[
                'device_index'=>(string)$idx,
                'pon'=>(string)$pon,
                'onu_id'=>(string)$d['onu'],
                'mac'=>$this->mac($r['mac']??null),
                'serial'=>null,
                'name'=>$this->text($r['name']??null),
                'description'=>$this->text($r['attribute_type']??null),
                'vendor'=>$vendor,
                'model'=>$model,
                'firmware'=>$this->text($r['firmware']??null) ?: $this->text($r['software']??null),
                'hardware'=>$this->text($r['chip_version']??null),
                'status'=>$status,
                'admin_status'=>$admin,
                'down_reason'=>null,
                'distance_m'=>$this->int($r['distance_m']??null),
                'uptime_sec'=>$this->int($r['uptime_sec']??null),
                'last_register'=>null,
                'last_deregister'=>null,
                'rx_power'=>null,'tx_power'=>null,'olt_rx_power'=>null,
                'temperature_c'=>null,'voltage_v'=>null,
                'onu_key'=>'photon-epon:'.(int)$d['slot'].'/'.$physicalPon.'/'.$d['onu'],
            ];
            $out[]=$x;
        }

        // Photon MIB: onuPonPortOpticalTransmissionPropertyEntry
        // index = DeviceIndex.CardIndex.PortIndex, values in centi-units.
        $ob=self::ROOT.'.2.3.4.2.1.';
        $optRows=$this->walkColumns($snmp,[
            'rx'=>$ob.'4','tx'=>$ob.'5','voltage'=>$ob.'7','temperature'=>$ob.'8'
        ]);
        $opt=[];
        foreach($optRows as $r){
            $idx=$this->opticalDeviceIndex($r);
            if($idx===null) continue;
            $opt[(string)$idx]=[
                'rx_power'=>$this->centiDbm($r['rx']??null),
                'tx_power'=>$this->centiDbm($r['tx']??null),
                'voltage_v'=>$this->centiMilliVoltToVolt($r['voltage']??null),
                'temperature_c'=>$this->centiTemperature($r['temperature']??null),
            ];
        }
        foreach($out as &$r){
            if(isset($opt[$r['device_index']])) $r=array_merge($r,$opt[$r['device_index']]);
        }
        unset($r);
        return $out;
    }

    public function collectMacEntries(SnmpClient $snmp,array $olt): ?array
    {
        // Photon EPON native SNI FDB: index = MAC(6 octets) + VLAN,
        // sniMacAddrPortId value = EponDeviceIndex, so mapping to ONU is exact.
        $typeOid=self::ROOT.'.2.3.2.4.2.1.3';
        $portOid=self::ROOT.'.2.3.2.4.2.1.4';
        try{$ports=$snmp->walk($portOid);}catch(\Throwable $e){return [];}
        if(!$ports) return [];
        try{$types=$snmp->walk($typeOid);}catch(\Throwable $e){$types=[];}

        $typeMap=[];
        foreach($types as $oid=>$value){
            $sf=$this->suffix((string)$oid,$typeOid);
            if($sf!=='') $typeMap[$sf]=$this->int($value);
        }
        $ponMap=$this->physicalPonMap($snmp);
        $out=[];
        foreach($ports as $oid=>$value){
            $suffix=$this->suffix((string)$oid,$portOid);
            if($suffix==='') continue;
            $parts=array_values(array_filter(explode('.',$suffix),'strlen'));
            if(count($parts)>=8 && (int)$parts[0]===6) array_shift($parts);
            if(count($parts)<7) continue;
            $vlan=(int)array_pop($parts);
            $macParts=array_slice($parts,0,6);
            $mac=$this->macFromOidOctets($macParts);
            if(!$mac) continue;
            $idx=$this->int($value);
            if($idx===null || $idx<=0) continue;
            $d=$this->cdataIndex($idx);
            if($d['pon']<=0 || $d['onu']<=0) continue;
            $physicalPon=$this->physicalPon((int)$d['slot'],(int)$d['pon'],$ponMap);
            $pon=$this->ponLabel((int)$d['slot'],$physicalPon);
            $type=$typeMap[$suffix]??null;
            $out[]=[
                'pon'=>(string)$pon,'onu_id'=>(string)$d['onu'],'mac'=>$mac,
                'vlan_id'=>max(0,$vlan),
                'mac_type'=>$type===1?'static':($type===2?'dynamic':($type!==null?'other':null)),
                'port_id'=>(string)$idx,'service_port'=>null,'gem_id'=>null,'age_sec'=>null,
                'source'=>'photon_epon_sni_mac_table',
                'entry_key'=>strtolower($pon.'/'.$d['onu'].'/'.str_replace(':','',$mac).'/'.max(0,$vlan)),
            ];
        }
        return $out;
    }

    private function profileVendor(array $olt): string
    {
        $p=(string)($olt['driver_profile']??'');
        return str_starts_with($p,'tbs_')?'TBS':'Photon';
    }

    private function deviceIndexFromSuffix(array $row): ?int
    {
        $suffix=trim((string)($row['_suffix']??''));
        if($suffix!=='' && preg_match('/^\d+$/',$suffix)){
            $idx=(int)$suffix;
            return $idx>0?$idx:null;
        }
        return null;
    }

    private function opticalDeviceIndex(array $row): ?int
    {
        $suffix=trim((string)($row['_suffix']??''));
        if($suffix==='' || !preg_match('/^(\d+)(?:\.\d+){2,}$/',$suffix,$m)) return null;
        $idx=(int)$m[1];
        return $idx>0?$idx:null;
    }

    private function physicalPonMap(SnmpClient $snmp): array
    {
        // Photon ponPortInfoEntry: status=.5, ponPortName=.22.
        $base=self::ROOT.'.2.3.3.1.1.';
        $entries=[];
        foreach(['status'=>$base.'5','name'=>$base.'22'] as $field=>$oid){
            try{$walk=$snmp->walk($oid);}catch(\Throwable $e){continue;}
            foreach($walk as $fullOid=>$value){
                $suffix=$this->suffix((string)$fullOid,$oid);
                $parts=array_values(array_filter(explode('.',$suffix),'strlen'));
                if(count($parts)<3) continue;
                $port=(int)array_pop($parts);
                $card=(int)array_pop($parts);
                if($port<=0) continue;
                $cardByte=$card & 0xFF;
                $k=$cardByte.':'.$port;
                $entries[$k]['card']=$cardByte;
                $entries[$k]['port']=$port;
                if($field==='name') $entries[$k]['name']=$this->text($value);
            }
        }
        if(!$entries) return [];
        $groups=[];
        foreach($entries as $e) $groups[(int)$e['card']][]=$e;
        $map=[];
        foreach($groups as $card=>$list){
            usort($list,fn($a,$b)=>((int)$a['port'])<=>((int)$b['port']));
            foreach($list as $i=>$e){
                $physical=null;
                $name=trim((string)($e['name']??''));
                if($name!=='' && preg_match('/(?:PON|EPON)[^0-9]*(?:\d+\D+)*?(\d+)\s*$/i',$name,$m)) $physical=(int)$m[1];
                if(!$physical) $physical=$i+1;
                $map[$card.':'.(int)$e['port']]=$physical;
                $map['*:'.(int)$e['port']]=$map['*:'.(int)$e['port']]??$physical;
            }
        }
        return $map;
    }

    private function physicalPon(int $card,int $internalPon,array $map): int
    {
        return (int)($map[$card.':'.$internalPon]??$map['*:'.$internalPon]??$internalPon);
    }

    private function ponLabel(int $slot,int $pon): string
    {
        return $slot>0 ? ($slot.'/'.$pon) : (string)$pon;
    }

    private function macFromOidOctets(array $parts): ?string
    {
        if(count($parts)!==6) return null;
        $bytes=[];
        foreach($parts as $p){
            if(!preg_match('/^\d+$/',(string)$p)) return null;
            $n=(int)$p; if($n<0 || $n>255) return null; $bytes[]=$n;
        }
        return strtoupper(implode(':',array_map(fn($n)=>sprintf('%02X',$n),$bytes)));
    }

    private function centiDbm(mixed $value): ?float
    {
        $n=$this->num($value); if($n===null) return null;
        $v=round($n/100,2);
        return ($v < -60 || $v > 20)?null:$v;
    }

    private function centiTemperature(mixed $value): ?float
    {
        $n=$this->num($value); if($n===null) return null;
        $v=round($n/100,2);
        return ($v < -50 || $v > 150)?null:$v;
    }

    private function centiMilliVoltToVolt(mixed $value): ?float
    {
        // MIB unit is centi-mV: 330000 => 3300mV => 3.3V.
        $n=$this->num($value); if($n===null) return null;
        $v=round($n/100000,3);
        return ($v<=0 || $v>10)?null:$v;
    }
}
