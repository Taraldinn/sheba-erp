<?php
namespace App\Drivers;
use App\Services\SnmpClient;

final class CDataEponDriver extends AbstractDriver
{
    public function __construct(private string $version='v2'){}
    public function name(): string { return 'C-DATA '.$this->version.' EPON'; }
    public function probeOid(): string { return '1.3.6.1.4.1.17409.2.3.4.1.1.8'; }

    public function collectMacEntries(SnmpClient $snmp,array $olt): ?array
    {
        // Native C-DATA EPON FDB. The table index is fixed-length MAC(6 octets)
        // + VLAN, while column 4 returns EponDeviceIndex. That gives us the
        // subscriber MAC and the exact ONU logical interface without relying on
        // CLI or a generic bridge-port guess.
        $native=$this->collectSniLearnedMacs($snmp);
        if($native) return $native;

        // Several C-DATA V2 builds define the vendor SNI FDB in the MIB but
        // leave it empty at runtime. Try the standard bridge/Q-BRIDGE tables
        // before falling back to CLI. If the bridge port resolves to an ONU
        // interface name (for example EPON0/0/1:10), this gives an exact
        // per-ONU Caller-ID without any vendor-specific guess.
        $bridge=$this->collectStandardBridgeMacs($snmp);
        if($bridge) return $bridge;

        // V3 additionally exposes a per-ONU learned MAC table. Keep it as a
        // fallback for firmware that leaves the global SNI FDB empty.
        if(strtoupper($this->version)==='V3'){
            $base='1.3.6.1.4.1.17409.2.3.4.7.1';
            $rows=$this->walkIndexedTable($snmp,$base,[1=>'device_index',2=>'mac_index',3=>'mac',4=>'vlan',5=>'service_port',6=>'pon_port',7=>'gem_id',8=>'type']);
            $out=[];
            $ponMap=$this->physicalPonMap($snmp);
            foreach($rows as $r){
                $idx=$this->deviceIndex($r);
                $mac=$this->mac($r['mac']??null);
                if($idx===null || !$mac) continue;
                $d=$this->cdataIndex($idx);
                if($d['pon']<=0 || $d['onu']<=0) continue;
                $pon=$this->physicalPon((int)$d['slot'],(int)$d['pon'],$ponMap);
                $vlan=$this->int($r['vlan']??null)??0;
                $type=$this->int($r['type']??null);
                $out[]=[
                    'pon'=>(string)$pon,'onu_id'=>(string)$d['onu'],'mac'=>$mac,'vlan_id'=>$vlan,
                    'mac_type'=>$type===1?'static':($type===2?'dynamic':($type!==null?'type_'.$type:null)),
                    'port_id'=>$this->text($r['pon_port']??null),'service_port'=>$this->int($r['service_port']??null),
                    'gem_id'=>$this->int($r['gem_id']??null),'age_sec'=>null,'source'=>'cdata_v3_onu_mac_table',
                    'entry_key'=>strtolower($pon.'/'.$d['onu'].'/'.str_replace(':','',$mac).'/'.$vlan)
                ];
            }
            return $out;
        }
        return [];
    }

    /**
     * C-DATA V2/V3 EPON native learned-MAC table.
     *   sniMacAddrType   .1.3.6.1.4.1.17409.2.3.2.4.2.1.3
     *   sniMacAddrPortId .1.3.6.1.4.1.17409.2.3.2.4.2.1.4
     * INDEX = MacAddress(6 octets) + VLAN. PortId = EponDeviceIndex.
     */
    private function collectSniLearnedMacs(SnmpClient $snmp): array
    {
        $typeOid='1.3.6.1.4.1.17409.2.3.2.4.2.1.3';
        $portOid='1.3.6.1.4.1.17409.2.3.2.4.2.1.4';
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
            // MacAddress is SIZE(6), so most agents emit 6 octets directly. A
            // few Net-SNMP encodings include a leading length=6; accept both.
            if(count($parts)>=8 && (int)$parts[0]===6) array_shift($parts);
            if(count($parts)<7) continue;
            $vlan=(int)array_pop($parts);
            $macOctets=array_slice($parts,0,6);
            if(count($macOctets)!==6) continue;
            $ok=true;foreach($macOctets as $b){if(!ctype_digit((string)$b) || (int)$b<0 || (int)$b>255){$ok=false;break;}}
            if(!$ok) continue;
            $mac=strtoupper(implode(':',array_map(fn($b)=>sprintf('%02X',(int)$b),$macOctets)));
            $idx=$this->int($value);
            if($idx===null || $idx<=0) continue;
            $d=$this->cdataIndex($idx);
            // ONU 0 means an OLT/SNI/PON-only port, not a subscriber ONU.
            if($d['pon']<=0 || $d['onu']<=0) continue;
            $pon=$this->physicalPon((int)$d['slot'],(int)$d['pon'],$ponMap);
            $type=$typeMap[$suffix]??null;
            $out[]=[
                'pon'=>(string)$pon,
                'onu_id'=>(string)$d['onu'],
                'mac'=>$mac,
                'vlan_id'=>max(0,$vlan),
                'mac_type'=>$type===1?'static':($type===2?'dynamic':($type===3?'blackhole':($type!==null?'type_'.$type:null))),
                'port_id'=>(string)$idx,
                'service_port'=>null,'gem_id'=>null,'age_sec'=>null,
                'source'=>'cdata_sni_mac_table',
                'entry_key'=>strtolower($pon.'/'.$d['onu'].'/'.str_replace(':','',$mac).'/'.max(0,$vlan))
            ];
        }
        return $out;
    }

    /**
     * Standard IEEE bridge FDB fallback. C-DATA firmware often exposes the
     * learned table through Q-BRIDGE even when the vendor sniMacAddressTable is
     * empty. The bridge-port -> ifIndex -> ifName chain is authoritative; rows
     * are accepted only when the interface name contains both PON and ONU.
     */
    private function collectStandardBridgeMacs(SnmpClient $snmp): array
    {
        $bridgeToIf=[];
        try{$bp=$snmp->walk('1.3.6.1.2.1.17.1.4.1.2');}catch(\Throwable $e){$bp=[];}
        foreach($bp as $oid=>$value){
            $bridge=(int)substr((string)$oid,strrpos((string)$oid,'.')+1);
            $ifi=$this->int($value);
            if($bridge>0 && $ifi!==null && $ifi>0)$bridgeToIf[$bridge]=$ifi;
        }
        if(!$bridgeToIf)return [];

        $ifNames=$this->ifNames($snmp);
        try{$ifDescrRaw=$snmp->walk('1.3.6.1.2.1.2.2.1.2');}catch(\Throwable $e){$ifDescrRaw=[];}
        $ifDescr=[];
        foreach($ifDescrRaw as $oid=>$value){$idx=(int)substr((string)$oid,strrpos((string)$oid,'.')+1);$ifDescr[$idx]=(string)$value;}

        $out=[];$seen=[];
        // Q-BRIDGE: index is FDB/VLAN id followed by six MAC octets; value is bridge port.
        try{$q=$snmp->walk('1.3.6.1.2.1.17.7.1.2.2.1.2');}catch(\Throwable $e){$q=[];}
        foreach($q as $oid=>$value){
            $sf=$this->suffix((string)$oid,'1.3.6.1.2.1.17.7.1.2.2.1.2');
            $parts=array_values(array_filter(explode('.',$sf),'strlen'));
            if(count($parts)<7)continue;
            $macParts=array_slice($parts,-6);
            $prefix=array_slice($parts,0,-6);
            $vlan=$prefix?max(0,(int)end($prefix)):0;
            $mac=$this->macFromOidOctets($macParts); if(!$mac)continue;
            $bridge=$this->int($value); if($bridge===null||!isset($bridgeToIf[$bridge]))continue;
            $ifi=$bridgeToIf[$bridge];
            $name=(string)($ifNames[$ifi]??$ifDescr[$ifi]??'');
            [$pon,$onu]=$this->cdataInterfacePosition($name);
            if($pon===null||$onu===null)continue;
            $key=strtolower($pon.'/'.$onu.'/'.str_replace(':','',$mac).'/'.$vlan);
            if(isset($seen[$key]))continue;$seen[$key]=true;
            $out[]=['pon'=>(string)$pon,'onu_id'=>(string)$onu,'mac'=>$mac,'vlan_id'=>$vlan,'mac_type'=>'dynamic','port_id'=>$name?:('ifIndex '.$ifi),'service_port'=>null,'gem_id'=>null,'age_sec'=>null,'source'=>'cdata_qbridge','entry_key'=>$key];
        }
        if($out)return $out;

        // Legacy BRIDGE-MIB has no VLAN in its index but can still provide a
        // reliable Caller-ID when the bridge port maps directly to an ONU ifName.
        try{$b=$snmp->walk('1.3.6.1.2.1.17.4.3.1.2');}catch(\Throwable $e){$b=[];}
        foreach($b as $oid=>$value){
            $sf=$this->suffix((string)$oid,'1.3.6.1.2.1.17.4.3.1.2');
            $parts=array_values(array_filter(explode('.',$sf),'strlen'));
            if(count($parts)<6)continue;
            $mac=$this->macFromOidOctets(array_slice($parts,-6)); if(!$mac)continue;
            $bridge=$this->int($value); if($bridge===null||!isset($bridgeToIf[$bridge]))continue;
            $ifi=$bridgeToIf[$bridge];$name=(string)($ifNames[$ifi]??$ifDescr[$ifi]??'');
            [$pon,$onu]=$this->cdataInterfacePosition($name);
            if($pon===null||$onu===null)continue;
            $key=strtolower($pon.'/'.$onu.'/'.str_replace(':','',$mac).'/0');
            if(isset($seen[$key]))continue;$seen[$key]=true;
            $out[]=['pon'=>(string)$pon,'onu_id'=>(string)$onu,'mac'=>$mac,'vlan_id'=>0,'mac_type'=>'dynamic','port_id'=>$name?:('ifIndex '.$ifi),'service_port'=>null,'gem_id'=>null,'age_sec'=>null,'source'=>'cdata_bridge_mib','entry_key'=>$key];
        }
        return $out;
    }

    private function macFromOidOctets(array $parts): ?string
    {
        if(count($parts)!==6)return null;$bytes=[];
        foreach($parts as $p){if(!preg_match('/^\d+$/',(string)$p))return null;$n=(int)$p;if($n<0||$n>255)return null;$bytes[]=$n;}
        return strtoupper(implode(':',array_map(fn($n)=>sprintf('%02X',$n),$bytes)));
    }

    /** @return array{0:?int,1:?int} */
    private function cdataInterfacePosition(string $name): array
    {
        $n=trim($name);if($n==='')return [null,null];
        // New C-DATA naming: EPON0/0/1:10 or PON0/0/1:10.
        if(preg_match('/(?:epon|pon)\s*\d+\s*\/\s*\d+\s*\/\s*(\d+)\s*[:\/-]\s*(\d+)/i',$n,$m))return [(int)$m[1],(int)$m[2]];
        // Older EasyPath naming: EPON0/1:10.
        if(preg_match('/(?:epon|pon)\s*\d+\s*\/\s*(\d+)\s*[:\/-]\s*(\d+)/i',$n,$m))return [(int)$m[1],(int)$m[2]];
        // Compact labels sometimes use PON1/ONU10 or PON1:10.
        if(preg_match('/pon\s*(\d+)\s*(?:\/\s*(?:onu)?|:)\s*(\d+)/i',$n,$m))return [(int)$m[1],(int)$m[2]];
        return [null,null];
    }

    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        $b='1.3.6.1.4.1.17409.2.3.4.1.1.';
        // onuDeviceIndex is INDEX/not-accessible on many C-DATA V2 builds. The
        // authoritative 32-bit EponDeviceIndex therefore comes from each OID
        // suffix. Do not use MAC/serial bytes as the database identity key.
        $rows=$this->walkColumns($snmp,[
            'name'=>$b.'2','mac'=>$b.'7','status_raw'=>$b.'8','admin_raw'=>$b.'9',
            'software'=>$b.'13','firmware_raw'=>$b.'14','distance_m'=>$b.'15','uptime_sec'=>$b.'18',
            'vendor'=>$b.'25','model'=>$b.'26','hardware'=>$b.'27','serial'=>$b.'28','last_register'=>$b.'29'
        ]);

        // C-DATA fixed EPON platforms frequently number their internal PON
        // interfaces after SNI/GE ports (for example internal port 13 is the
        // front-panel PON0/0/1). Build a physical PON map from ponPortInfoTable
        // instead of exposing that internal port index to the operator.
        $ponMap=$this->physicalPonMap($snmp);

        $out=[];
        foreach($rows as $r){
            $idx=$this->deviceIndex($r);
            if($idx===null) continue;
            $d=$this->cdataIndex($idx);
            // The MIB explicitly reserves PON 0 and ONU 0 as "not applied".
            // Skipping those also prevents malformed index rows from colliding.
            if($d['pon']<=0 || $d['onu']<=0) continue;
            $physicalPon=$this->physicalPon((int)$d['slot'],(int)$d['pon'],$ponMap);

            $sv=$this->int($r['status_raw']??null);
            $status=$sv===1?'online':($sv===2?'offline':($sv===3?'testing':'unknown'));
            $av=$this->int($r['admin_raw']??null);
            $admin=$av===1?'up':($av===2?'down':($av===3?'testing':null));
            $firmware=$this->text($r['firmware_raw']??null) ?: $this->text($r['software']??null);

            $x=[
                'device_index'=>(string)$idx,
                'pon'=>(string)$physicalPon,
                'onu_id'=>(string)$d['onu'],
                'mac'=>$this->mac($r['mac']??null),
                'serial'=>$this->serial($r['serial']??null),
                'name'=>$this->text($r['name']??null),
                'description'=>null,
                'vendor'=>$this->text($r['vendor']??null)?:'C-DATA-compatible',
                'model'=>$this->text($r['model']??null),
                'firmware'=>$firmware,
                'hardware'=>$this->text($r['hardware']??null),
                'status'=>$status,
                'admin_status'=>$admin,
                'down_reason'=>null,
                'distance_m'=>$this->int($r['distance_m']??null),
                'uptime_sec'=>$this->int($r['uptime_sec']??null),
                'last_register'=>$this->text($r['last_register']??null),
                'last_deregister'=>null,
                'rx_power'=>null,'tx_power'=>null,'olt_rx_power'=>null,
                'temperature_c'=>null,'voltage_v'=>null
            ];
            $x=$this->normalizeBase($x);
            // Stable ASCII identity for C-DATA/ECOM EPON. Serial/MAC can be
            // missing, binary or duplicated on clone ONUs; PON+ONU is the OLT's
            // actual logical identity and is unique within one OLT.
            $x['onu_key']=$this->positionKey($physicalPon,$d['onu']);
            $out[]=$x;
        }

        $ob='1.3.6.1.4.1.17409.2.3.4.2.1.';
        $orows=$this->walkColumns($snmp,[
            'rx'=>$ob.'4','tx'=>$ob.'5','voltage'=>$ob.'7','temperature'=>$ob.'8'
        ]);
        $om=[];
        foreach($orows as $r){
            // onuPonPortOpticalTransmissionPropertyEntry is indexed by THREE
            // values: DeviceIndex + CardIndex + PortIndex. walkColumns() keeps
            // the complete suffix (e.g. 16846081.0.1), so taking the whole
            // suffix as one EponDeviceIndex makes every RX/TX merge miss.
            $idx=$this->opticalDeviceIndex($r);
            if($idx===null) continue;
            $om[(string)$idx]=[
                'rx_power'=>$this->centiDbm($r['rx']??null),
                'tx_power'=>$this->centiDbm($r['tx']??null),
                'temperature_c'=>$this->safeTemperature($r['temperature']??null),
                'voltage_v'=>$this->safeVoltage($r['voltage']??null)
            ];
        }
        foreach($out as &$r){ if(isset($om[$r['device_index']])) $r=array_merge($r,$om[$r['device_index']]); }
        unset($r);
        return $out;
    }

    private function deviceIndex(array $row): ?int
    {
        $idx=$this->int($row['device_index']??null);
        if($idx===null && isset($row['_suffix'])){
            $suffix=trim((string)$row['_suffix']);
            // EponDeviceIndex is one Unsigned32 INDEX value. Reject dotted or
            // binary-looking suffixes rather than silently taking the last byte.
            if(preg_match('/^\d+$/',$suffix)) $idx=(int)$suffix;
        }
        return ($idx!==null && $idx>0) ? $idx : null;
    }

    /**
     * Return a map of C-DATA internal PON port index -> front-panel PON number.
     * ponPortInfoTable is indexed by device, card and internal port. On fixed
     * chassis builds the internal ports may be 13..20 while the GUI calls them
     * PON0/0/1..8. If ponPortName contains an explicit number, prefer it;
     * otherwise map the sorted PON-only indexes to 1..N per card.
     */
    private function physicalPonMap(SnmpClient $snmp): array
    {
        $base='1.3.6.1.4.1.17409.2.3.3.1.1.';
        $entries=[];
        foreach(['status'=>$base.'5','name'=>$base.'21'] as $field=>$oid){
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
                // Examples seen in C-DATA UI/MIB builds: PON0/0/1, EPON0/1.
                if($name!=='' && preg_match('/(?:PON|EPON)[^0-9]*(?:\d+\D+)*?(\d+)\s*$/i',$name,$m))
                    $physical=(int)$m[1];
                if(!$physical) $physical=$i+1;
                $map[$card.':'.(int)$e['port']]=$physical;
                // Fixed chassis EponDeviceIndex often carries card byte 0 even
                // if ponPortInfoTable uses another encoded card index.
                $map['*:'.(int)$e['port']]=$map['*:'.(int)$e['port']]??$physical;
            }
        }
        return $map;
    }

    private function physicalPon(int $card,int $internalPon,array $map): int
    {
        return (int)($map[$card.':'.$internalPon]??$map['*:'.$internalPon]??$internalPon);
    }

    /** Extract DeviceIndex from optical table suffix DeviceIndex.CardIndex.PortIndex. */
    private function opticalDeviceIndex(array $row): ?int
    {
        $idx=$this->int($row['device_index']??null);
        if($idx!==null && $idx>0) return $idx;
        $suffix=trim((string)($row['_suffix']??''));
        if($suffix==='' || !preg_match('/^(\d+)(?:\.\d+){2,}$/',$suffix,$m)) return null;
        $idx=(int)$m[1];
        return $idx>0?$idx:null;
    }

    private function centiDbm(mixed $value): ?float
    {
        $n=$this->num($value);
        if($n===null) return null;
        $v=round($n/100,2);
        // Filter common invalid/sentinel values instead of poisoning alerts.
        return ($v < -60 || $v > 20) ? null : $v;
    }

    private function safeTemperature(mixed $value): ?float
    {
        $n=$this->num($value);
        if($n===null) return null;
        $v=round($n/100,2);
        return ($v < -50 || $v > 150) ? null : $v;
    }

    private function safeVoltage(mixed $value): ?float
    {
        $n=$this->num($value);
        if($n===null) return null;
        $v=round($n/100000,3); // centi-mV -> V
        return ($v <= 0 || $v > 10) ? null : $v;
    }

    private function positionKey(int $pon,int $onu): string
    {
        return 'pon-'.$pon.'-onu-'.$onu;
    }
}
