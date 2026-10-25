<?php
namespace App\Drivers;

use App\Services\SnmpClient;

/**
 * Shared BDCOM learned/client MAC collector.
 *
 * Newer P360x firmware is usually fastest/reliable through standard Q-BRIDGE-MIB.
 * Older builds also expose BDCOM NMS-MAC-MIB fdbReadByPortTable.
 * Both are read-only here.
 */
trait BdcomFdbTrait
{
    /** @return array<int,array<string,mixed>> */
    protected function collectBdcomMacEntries(SnmpClient $snmp,array $olt): array
    {
        $ifNames=$this->ifNames($snmp);
        // Some firmware exposes ifDescr more consistently than ifName.
        try {
            foreach($snmp->walk('1.3.6.1.2.1.2.2.1.2') as $oid=>$value){
                $idx=(int)substr((string)$oid,strrpos((string)$oid,'.')+1);
                if(!isset($ifNames[$idx]) || trim((string)$ifNames[$idx])==='') $ifNames[$idx]=(string)$value;
            }
        } catch (\Throwable $e) {}

        // 1) Standards-based Q-BRIDGE FDB. BDCOM 10.1.0F and other newer
        // firmware generally handles this much better than the private table.
        $q=$this->collectBdcomQBridgeFdb($snmp,$ifNames);
        if($q) return $this->dedupeBdcomMacRows($q);

        // 2) NMS-MAC-MIB userFdbTable. Several P360x builds expose the learned
        // subscriber MACs here even when the Q-BRIDGE port mapping is incomplete.
        // It is cheap to read (global table) and gives up to 8 user MACs per ifIndex.
        $user=$this->collectBdcomUserFdb($snmp,$ifNames);
        if($user) return $this->dedupeBdcomMacRows($user);

        // 3) BDCOM private fdbReadByPortTable. Important BDCOM quirk: on many
        // P360x firmwares the root table should NOT be walked globally. The MAC
        // column has to be walked separately for every ONU ifIndex:
        //   ...3320.152.1.1.3.<ifIndex>
        // and the remaining suffix is VLAN.MAC[6].
        $private=$this->collectBdcomPrivateFdb($snmp,$ifNames);
        if($private) return $this->dedupeBdcomMacRows($private);

        // 4) VLAN-unaware BRIDGE-MIB fallback for older firmware.
        $legacy=$this->collectBdcomBridgeFdb($snmp,$ifNames);
        return $this->dedupeBdcomMacRows($legacy);
    }

    /** @param array<int,string> $ifNames @return array<int,array<string,mixed>> */
    private function collectBdcomQBridgeFdb(SnmpClient $snmp,array $ifNames): array
    {
        $portOid='1.3.6.1.2.1.17.7.1.2.2.1.2'; // dot1qTpFdbPort
        try {$fdbPorts=$snmp->walk($portOid);} catch (\Throwable $e) {return [];}
        if(!$fdbPorts) return [];

        $bridgeToIf=[];
        try {
            $boid='1.3.6.1.2.1.17.1.4.1.2'; // dot1dBasePortIfIndex
            foreach($snmp->walk($boid) as $oid=>$value){
                $bridge=(int)substr((string)$oid,strrpos((string)$oid,'.')+1);
                $ifidx=$this->int($value);
                if($bridge>0 && $ifidx!==null) $bridgeToIf[$bridge]=$ifidx;
            }
        } catch (\Throwable $e) {}

        // dot1qFdbId is not guaranteed to equal VLAN ID. Reverse-map the
        // current VLAN table when the device exposes it.
        $fdbToVlan=[];
        try {
            $void='1.3.6.1.2.1.17.7.1.4.2.1.3'; // dot1qVlanFdbId
            foreach($snmp->walk($void) as $oid=>$value){
                $fdb=$this->int($value); if($fdb===null) continue;
                $suffix=$this->suffix((string)$oid,$void); $parts=explode('.',$suffix);
                $vlan=(int)end($parts);
                if($vlan>=1 && $vlan<=4094) $fdbToVlan[$fdb]=$vlan;
            }
        } catch (\Throwable $e) {}

        $out=[];
        foreach($fdbPorts as $oid=>$value){
            $suffix=$this->suffix((string)$oid,$portOid); if($suffix==='') continue;
            $parts=explode('.',$suffix); if(count($parts)<7) continue;
            $fdbId=(int)array_shift($parts);
            $mac=$this->macFromDecimalSuffix(array_slice($parts,-6));
            if(!$mac || !$this->validBdcomClientMac($mac)) continue;
            $bridgePort=$this->int($value); if($bridgePort===null || $bridgePort<=0) continue;
            $ifidx=$bridgeToIf[$bridgePort]??$bridgePort;
            $ifname=$ifNames[$ifidx]??null;
            [$pon,$onu]=$this->parseIfName($ifname);
            if($pon===null || $onu===null) continue; // CPU/uplink/PON aggregate
            $vlan=$fdbToVlan[$fdbId]??(($fdbId>=1 && $fdbId<=4094)?$fdbId:0);
            $out[]=$this->bdcomMacRow($pon,$onu,$mac,$vlan,$ifname,'bdcom_qbridge_fdb',$suffix);
        }
        return $out;
    }

    /** @param array<int,string> $ifNames @return array<int,array<string,mixed>> */
    private function collectBdcomUserFdb(SnmpClient $snmp,array $ifNames): array
    {
        $base='1.3.6.1.4.1.3320.152.2.1';
        $indexBySuffix=[];
        try {
            foreach($snmp->walk($base.'.2') as $oid=>$value){ // ifUserFdbIndex
                $suffix=$this->suffix((string)$oid,$base.'.2');
                $idx=$this->int($value);
                if($suffix!=='' && $idx!==null) $indexBySuffix[$suffix]=$idx;
            }
        } catch (\Throwable $e) { return []; }
        if(!$indexBySuffix) return [];

        $out=[];
        for($col=3;$col<=10;$col++){
            try {$walk=$snmp->walkLibrary($base.'.'.$col);} catch (\Throwable $e) { continue; }
            foreach($walk as $oid=>$raw){
                $suffix=$this->suffix((string)$oid,$base.'.'.$col); if($suffix==='') continue;
                $ifidx=$indexBySuffix[$suffix]??null;
                if($ifidx===null){
                    $parts=explode('.',$suffix); $ifidx=(int)end($parts);
                }
                if($ifidx<=0) continue;
                $ifname=$ifNames[$ifidx]??null;
                [$pon,$onu]=$this->parseIfName($ifname);
                if($pon===null || $onu===null) continue;
                $mac=$this->mac($raw);
                if(!$mac || !$this->validBdcomClientMac($mac)) continue;
                $out[]=$this->bdcomMacRow($pon,$onu,$mac,0,$ifname,'bdcom_user_fdb',$suffix.'.'.$col);
            }
        }
        return $out;
    }

    /** @param array<int,string> $ifNames @return array<int,array<string,mixed>> */
    private function collectBdcomPrivateFdb(SnmpClient $snmp,array $ifNames): array
    {
        $oid='1.3.6.1.4.1.3320.152.1.1.3'; // ifFdbReadByPortMacAddress

        // Only query actual ONU interfaces. This avoids CPU/uplink ports and is
        // substantially faster on BDCOM, whose private FDB table is port-scoped.
        $onuIfs=[];
        foreach($ifNames as $ifidx=>$ifname){
            [$pon,$onu]=$this->parseIfName($ifname);
            if($pon!==null && $onu!==null) $onuIfs[(int)$ifidx]=[$pon,$onu,$ifname];
        }
        if(!$onuIfs) return [];

        // Prefer online/registered/auto-config ONU interfaces when the EPON
        // status table is readable. Offline ports normally have no useful FDB.
        $active=[];
        try {
            $statusBase='1.3.6.1.4.1.3320.101.10.1.1.26';
            foreach($snmp->walk($statusBase) as $soid=>$value){
                $suffix=$this->suffix((string)$soid,$statusBase);
                $parts=explode('.',$suffix); $ifidx=(int)($parts[0]??0);
                $st=$this->int($value);
                if($ifidx>0 && in_array($st,[0,1,3],true)) $active[$ifidx]=true;
            }
        } catch (\Throwable $e) {}
        if($active){
            $onuIfs=array_filter($onuIfs,fn($v,$k)=>isset($active[(int)$k]),ARRAY_FILTER_USE_BOTH);
        }

        $out=[];$unsupported=0;$attempted=0;
        foreach($onuIfs as $ifidx=>$meta){
            [$pon,$onu,$ifname]=$meta;
            $base=$oid.'.'.$ifidx;
            try {$walk=$snmp->walkLibrary($base);} catch (\Throwable $e) {
                $attempted++;
                $msg=strtolower($e->getMessage());
                if(str_contains($msg,'no such object') || str_contains($msg,'no such instance') || str_contains($msg,'timeout') || str_contains($msg,'no response')) $unsupported++;
                // If several real ONU ports reject the same subtree and we have
                // not collected anything, stop rather than causing minutes of
                // timeout delay on every automatic poll.
                if(!$out && $attempted>=4 && $unsupported===$attempted) break;
                continue;
            }
            $attempted++;
            foreach($walk as $woid=>$raw){
                $suffix=$this->suffix((string)$woid,$base); if($suffix==='') continue;
                $parts=explode('.',$suffix);
                // Expected suffix after .<ifIndex> is vlan.mac1.mac2...mac6.
                // Tolerate agents that redundantly repeat ifIndex.
                if(count($parts)>=8 && (int)$parts[0]===(int)$ifidx) array_shift($parts);
                if(count($parts)<7) continue;
                $vlan=(int)array_shift($parts);
                $mac=$this->mac($raw) ?: $this->macFromDecimalSuffix(array_slice($parts,-6));
                if(!$mac || !$this->validBdcomClientMac($mac)) continue;
                $out[]=$this->bdcomMacRow($pon,$onu,$mac,$vlan,$ifname,'bdcom_private_fdb',$ifidx.'.'.$suffix);
            }
        }
        return $out;
    }

    /** @param array<int,string> $ifNames @return array<int,array<string,mixed>> */
    private function collectBdcomBridgeFdb(SnmpClient $snmp,array $ifNames): array
    {
        $portOid='1.3.6.1.2.1.17.4.3.1.2'; // dot1dTpFdbPort
        try {$fdbPorts=$snmp->walk($portOid);} catch (\Throwable $e) {return [];}
        $bridgeToIf=[];
        try {
            $boid='1.3.6.1.2.1.17.1.4.1.2';
            foreach($snmp->walk($boid) as $oid=>$value){
                $bridge=(int)substr((string)$oid,strrpos((string)$oid,'.')+1);
                $ifidx=$this->int($value); if($bridge>0 && $ifidx!==null)$bridgeToIf[$bridge]=$ifidx;
            }
        } catch (\Throwable $e) {}
        $out=[];
        foreach($fdbPorts as $oid=>$value){
            $suffix=$this->suffix((string)$oid,$portOid); $parts=explode('.',$suffix);
            if(count($parts)<6) continue;
            $mac=$this->macFromDecimalSuffix(array_slice($parts,-6));
            if(!$mac || !$this->validBdcomClientMac($mac)) continue;
            $bridge=$this->int($value); if($bridge===null || $bridge<=0) continue;
            $ifidx=$bridgeToIf[$bridge]??$bridge; $ifname=$ifNames[$ifidx]??null;
            [$pon,$onu]=$this->parseIfName($ifname); if($pon===null || $onu===null)continue;
            $out[]=$this->bdcomMacRow($pon,$onu,$mac,0,$ifname,'bdcom_bridge_fdb',$suffix);
        }
        return $out;
    }

    /** @param array<int,string|int> $bytes */
    private function macFromDecimalSuffix(array $bytes): ?string
    {
        if(count($bytes)!==6) return null; $hex=[];
        foreach($bytes as $b){$n=(int)$b;if($n<0||$n>255)return null;$hex[]=sprintf('%02X',$n);}
        return implode(':',$hex);
    }

    /** @return array<string,mixed> */
    private function bdcomMacRow(string $pon,string $onu,string $mac,int $vlan,?string $port,string $source,string $entry): array
    {
        return [
            'pon'=>(string)(int)$pon,'onu_id'=>(string)(int)$onu,'mac'=>$mac,
            'vlan_id'=>max(0,min(4094,$vlan)),'mac_type'=>'dynamic','port_id'=>$port,
            'service_port'=>null,'gem_id'=>null,'age_sec'=>null,'source'=>$source,
            'entry_key'=>strtolower(((int)$pon).'/'.((int)$onu).'/'.$source.'/'.$entry.'/'.str_replace(':','',$mac).'/'.$vlan)
        ];
    }

    private function validBdcomClientMac(string $mac): bool
    {
        $hex=strtoupper((string)preg_replace('/[^0-9A-F]/i','',$mac));
        if(strlen($hex)!==12 || $hex==='000000000000' || $hex==='FFFFFFFFFFFF') return false;
        return (hexdec(substr($hex,0,2)) & 1)===0; // exclude multicast/group MACs
    }

    /** @param array<int,array<string,mixed>> $rows @return array<int,array<string,mixed>> */
    private function dedupeBdcomMacRows(array $rows): array
    {
        $out=[];
        foreach($rows as $r){
            $k=(string)($r['entry_key']??strtolower(($r['pon']??'').'/'.($r['onu_id']??'').'/'.($r['mac']??'').'/'.($r['vlan_id']??0)));
            $out[$k]=$r;
        }
        return array_values($out);
    }
}
