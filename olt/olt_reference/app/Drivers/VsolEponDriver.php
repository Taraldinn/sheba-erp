<?php
namespace App\Drivers;
use App\Services\SnmpClient;

final class VsolEponDriver extends AbstractDriver
{
    public function name(): string { return 'VSOL-compatible EPON'; }
    public function probeOid(): string { return '1.3.6.1.4.1.37950.1.1.5.12.1.25.1.4'; }

    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        // Provisioned ONU table used by V1600D/V1600D4 and compatible clones.
        $base='1.3.6.1.4.1.37950.1.1.5.12.1.25.1.';
        $rows=$this->walkColumns($snmp,[
            'pon'=>$base.'1','onu_id'=>$base.'2','status_raw'=>$base.'4','mac'=>$base.'5',
            'model'=>$base.'6','description'=>$base.'9','model_alt'=>$base.'13',
            'down_reason'=>$base.'15','distance_m'=>$base.'17','last_register'=>$base.'18',
            'last_deregister'=>$base.'19','uptime_sec'=>$base.'20'
        ]);

        $out=[];
        foreach($rows as $r){
            $pon=$this->text($r['pon']??null);
            $onu=$this->text($r['onu_id']??null);
            if($pon===null || $onu===null) continue;
            $status=$this->int($r['status_raw']??null)===1?'online':'offline';
            $reasonRaw=$this->int($r['down_reason']??null);
            $reason=$reasonRaw===0?'wire_down':($reasonRaw===1?'power_off':$this->text($r['down_reason']??null));
            $model=$this->text($r['model']??null) ?: $this->text($r['model_alt']??null);
            $out[]=[
                'device_index'=>$r['_suffix']??($pon.'.'.$onu),
                'pon'=>$pon,'onu_id'=>$onu,
                'mac'=>$this->mac($r['mac']??null),'serial'=>null,'name'=>null,
                'description'=>$this->text($r['description']??null),
                'vendor'=>'VSOL-compatible','model'=>$model,'firmware'=>null,'hardware'=>null,
                'status'=>$status,'admin_status'=>null,'down_reason'=>$status==='online'?null:$reason,
                'distance_m'=>$this->int($r['distance_m']??null),'uptime_sec'=>$this->int($r['uptime_sec']??null),
                'last_register'=>$this->text($r['last_register']??null),'last_deregister'=>$this->text($r['last_deregister']??null),
                'rx_power'=>null,'tx_power'=>null,'olt_rx_power'=>null,'temperature_c'=>null,'voltage_v'=>null,
                'onu_key'=>'vsol-epon:'.$pon.'/'.$onu,
            ];
        }

        // V1600D4 can expose BOTH optical tables at the same time, but the newer
        // 'preferred' table may contain only one diagnostic row while the legacy
        // opmDiagInfoTable contains every provisioned ONU.  Never select an
        // optical source merely because it is non-empty: choose the table with
        // the best PON/ONU coverage.  This prevents a one-row table from wiping
        // RX/TX for the other ~100 ONUs.
        $preferred=$this->collectOpticsFromDiag($snmp,'1.3.6.1.4.1.37950.1.1.5.12.2.1.13.1.');
        $legacy=$this->collectOpticsFromDiag($snmp,'1.3.6.1.4.1.37950.1.1.5.12.2.1.8.1.');

        // Do not choose one table globally. V1600D4 firmware can return a nearly
        // complete legacy table while one or two rows are blank, and at the same
        // time expose a tiny newer table. Merge all sources field-by-field so a
        // valid value from ANY confirmed table fills the gap.
        // Merge the two confirmed diagnostic tables first.  V1600D4 exposes
        // the legacy table for the whole chassis (typically 125 ONUs) while
        // the optional onuOpmPowerTable (.14.1.*) is absent and can TIME OUT
        // instead of returning No-Such-Object.  Do not probe that optional
        // table when confirmed diag coverage is already healthy.
        $opt=$this->mergeOpticsSources([$preferred,$legacy]);
        $confirmedCoverage=$this->opticsCoverage($opt);
        $onuCount=count($out);
        if($confirmedCoverage < max(1,(int)ceil($onuCount*0.50))){
            $namedPower=$this->collectOpticsFromPowerNameTable($snmp);
            if($namedPower) $opt=$this->mergeOpticsSources([$preferred,$legacy,$namedPower]);
        }
        $this->mergeByPonOnu($out,$opt);

        // Some V1600D4 builds expose a dedicated MAC -> receive-power table. It
        // is especially useful for the exact case where an online ONU has a blank
        // RX cell in opmDiagInfoTable. Fill RX by matching the ONU identity MAC.
        $this->mergeRxByMac($snmp,$out);

        // Last-resort targeted reads for online ONUs only. A table walk can be
        // momentarily partial while a direct GET for that PON/ONU still works.
        // The retry budget is deliberately capped so cPanel polling cannot hang.
        $this->retryMissingOnlineFields($snmp,$out);
        return $out;
    }


    /** @param array<int,array<string,mixed>> $preferred @param array<int,array<string,mixed>> $legacy */
    private function selectBestOptics(array $preferred,array $legacy): array
    {
        $pc=$this->opticsCoverage($preferred);
        $lc=$this->opticsCoverage($legacy);
        if($pc===0) return $legacy;
        if($lc===0) return $preferred;

        // Prefer the source that covers more ONUs. If coverage is effectively
        // equal, use the newer table.  A tiny preferred table (for example 1
        // row vs 125 legacy rows on V1600D4) must never win.
        if($pc >= max(5,(int)ceil($lc*0.80))) return $preferred;
        return $legacy;
    }

    /** @param array<int,array<string,mixed>> $rows */
    private function opticsCoverage(array $rows): int
    {
        $seen=[];
        foreach($rows as $r){
            $pon=(string)($r['pon']??''); $onu=(string)($r['onu_id']??'');
            if($pon!=='' && $onu!=='') $seen[$pon.'/'.$onu]=true;
        }
        return count($seen);
    }

    /** @return array<int,array<string,mixed>> */
    private function collectOpticsFromDiag(SnmpClient $snmp,string $base): array
    {
        try {
            $rows=$this->walkColumns($snmp,[
                'pon'=>$base.'1','onu_id'=>$base.'2','temperature'=>$base.'3','voltage'=>$base.'4',
                'tx'=>$base.'6','rx'=>$base.'7'
            ]);
        } catch (\Throwable $e) { return []; }

        $opt=[];
        foreach($rows as $r){
            $pon=$this->text($r['pon']??null); $onu=$this->text($r['onu_id']??null);
            if($pon===null || $onu===null) continue;
            $opt[]=[
                'pon'=>$pon,'onu_id'=>$onu,
                'temperature_c'=>$this->normalisePlainMetric($r['temperature']??null),
                'voltage_v'=>$this->normalisePlainMetric($r['voltage']??null),
                'tx_power'=>$this->normaliseTxDbm($r['tx']??null),
                'rx_power'=>$this->normaliseRxDbm($r['rx']??null),
            ];
        }
        return $opt;
    }


    /** @param array<int,array<int,array<string,mixed>>> $sources @return array<int,array<string,mixed>> */
    private function mergeOpticsSources(array $sources): array
    {
        // Highest-coverage source gets first pick, but missing fields are filled
        // from every other source. This is safer than selecting one entire table.
        usort($sources,fn(array $a,array $b)=>$this->opticsCoverage($b)<=>$this->opticsCoverage($a));
        $map=[];
        foreach($sources as $rows){
            foreach($rows as $r){
                $pon=(string)($r['pon']??''); $onu=(string)($r['onu_id']??'');
                if($pon==='' || $onu==='') continue;
                $k=$pon.'/'.$onu;
                if(!isset($map[$k])) $map[$k]=['pon'=>$pon,'onu_id'=>$onu];
                foreach(['rx_power','tx_power','temperature_c','voltage_v','olt_rx_power'] as $f){
                    if(($map[$k][$f]??null)===null && array_key_exists($f,$r) && $r[$f]!==null)
                        $map[$k][$f]=$r[$f];
                }
            }
        }
        return array_values($map);
    }

    /** @return array<int,array<string,mixed>> */
    private function collectOpticsFromPowerNameTable(SnmpClient $snmp): array
    {
        // MIB: onuOpmPowerTable 1.3.6.1.4.1.37950.1.1.5.12.2.1.14.1
        // Some firmware names rows like EPON0/1:13, allowing direct PON/ONU map.
        $base='1.3.6.1.4.1.37950.1.1.5.12.2.1.14.1.';
        try{$rows=$this->walkColumns($snmp,['name'=>$base.'2','rx'=>$base.'3','tx'=>$base.'4']);}
        catch(\Throwable $e){return [];}
        $out=[];
        foreach($rows as $r){
            [$pon,$onu]=$this->parseMacPort($this->text($r['name']??null));
            if($pon===null || $onu===null) continue;
            $out[]=[
                'pon'=>$pon,'onu_id'=>$onu,
                'rx_power'=>$this->normaliseRxDbm($r['rx']??null),
                'tx_power'=>$this->normaliseTxDbm($r['tx']??null),
            ];
        }
        return $out;
    }

    /** @param array<int,array<string,mixed>> $out */
    private function mergeRxByMac(SnmpClient $snmp,array &$out): void
    {
        // MIB: onuRecievePowerTable
        // .2 = ONU MAC, .3 = ONU receive power. The table is indexed by an
        // internal ONU id, so MAC is the safest join key across firmware builds.
        $base='1.3.6.1.4.1.37950.1.1.5.12.1.28.1.';
        $macs=[];$powers=[];
        try{$macs=$snmp->walkLibrary($base.'2');}catch(\Throwable $e){try{$macs=$snmp->walk($base.'2');}catch(\Throwable $e2){return;}}
        try{$powers=$snmp->walk($base.'3');}catch(\Throwable $e){return;}
        $bySuffix=[];
        foreach($macs as $oid=>$raw){$sf=$this->suffix((string)$oid,$base.'2');if($sf!=='')$bySuffix[$sf]['mac']=$raw;}
        foreach($powers as $oid=>$raw){$sf=$this->suffix((string)$oid,$base.'3');if($sf!=='')$bySuffix[$sf]['rx']=$raw;}
        $byMac=[];
        foreach($bySuffix as $r){
            $m=$this->mac($r['mac']??null); $rx=$this->normaliseRxDbm($r['rx']??null);
            if($m && $rx!==null) $byMac[strtoupper(str_replace(':','',$m))]=$rx;
        }
        if(!$byMac) return;
        foreach($out as &$r){
            if(($r['rx_power']??null)!==null) continue;
            $m=strtoupper((string)preg_replace('/[^0-9A-F]/i','',(string)($r['mac']??'')));
            if($m!=='' && isset($byMac[$m])) $r['rx_power']=$byMac[$m];
        }
        unset($r);
    }

    /** @param array<int,array<string,mixed>> $out */
    private function retryMissingOnlineFields(SnmpClient $snmp,array &$out): void
    {
        $budget=30; // max ONUs receiving targeted retry in one poll
        $diagBases=[
            '1.3.6.1.4.1.37950.1.1.5.12.2.1.8.1.',
            '1.3.6.1.4.1.37950.1.1.5.12.2.1.13.1.',
        ];
        $identityBase='1.3.6.1.4.1.37950.1.1.5.12.1.25.1.';
        foreach($out as &$r){
            if($budget<=0) break;
            if(strtolower((string)($r['status']??''))!=='online') continue;
            $pon=(string)($r['pon']??'');$onu=(string)($r['onu_id']??'');
            if($pon===''||$onu==='') continue;
            $needRx=($r['rx_power']??null)===null;
            $needTx=($r['tx_power']??null)===null;
            $needMac=empty($r['mac']);
            if(!$needRx && !$needTx && !$needMac) continue;
            $budget--;

            // Retry identity MAC because MAC/Serial must never be lost due to a
            // partial column walk. EPON normally identifies ONU by MAC.
            if($needMac){
                for($a=0;$a<2 && empty($r['mac']);$a++){
                    try{$r['mac']=$this->mac($snmp->get($identityBase.'5.'.$pon.'.'.$onu));}catch(\Throwable $e){}
                    if(empty($r['mac'])) usleep(80000);
                }
            }

            for($a=0;$a<2 && (($r['rx_power']??null)===null || ($r['tx_power']??null)===null);$a++){
                foreach($diagBases as $b){
                    if(($r['rx_power']??null)===null){
                        try{$v=$snmp->get($b.'7.'.$pon.'.'.$onu);$x=$this->normaliseRxDbm($v);if($x!==null)$r['rx_power']=$x;}catch(\Throwable $e){}
                    }
                    if(($r['tx_power']??null)===null){
                        try{$v=$snmp->get($b.'6.'.$pon.'.'.$onu);$x=$this->normaliseTxDbm($v);if($x!==null)$r['tx_power']=$x;}catch(\Throwable $e){}
                    }
                    if(($r['rx_power']??null)!==null && ($r['tx_power']??null)!==null) break;
                }
                if(($r['rx_power']??null)===null || ($r['tx_power']??null)===null) usleep(100000);
            }
        }
        unset($r);
    }

    public function collectMacEntries(SnmpClient $snmp,array $olt): ?array
    {
        // V1600D/V1600D4 exposes the real learned/client MAC table in the
        // switch FDB.  Some firmware also exposes a tiny/partial ONU table
        // (sometimes only one row).  Do NOT let that partial table suppress
        // the full FDB collection.
        $fdb=[];
        try {
            $fdb=$this->collectSwitchFdb($snmp,'1.3.6.1.4.1.37950.1.1.5.10.3.2.1.',
                ['vlan'=>2,'mac'=>3,'type'=>4,'port'=>5],'vsol_switch_mac_table');
        } catch (\Throwable $e) {}
        if($fdb) return $this->dedupeMacRows($fdb);

        // Alternate FDB table used by some clone/newer firmware.
        try {
            $fdb=$this->collectSwitchFdb($snmp,'1.3.6.1.4.1.37950.1.1.5.10.3.8.1.',
                ['mac'=>1,'vlan'=>2,'type'=>3,'port'=>4],'vsol_switch_mac1_table');
        } catch (\Throwable $e) {}
        if($fdb) return $this->dedupeMacRows($fdb);

        $out=[];

        // Per-ONU learned MAC table. Useful on some VSOL builds, but it can be
        // incomplete on V1600D4, therefore it is only a fallback.
        $base='1.3.6.1.4.1.37950.1.1.5.12.1.26.1.';
        try {
            $rows=$this->walkColumns($snmp,['vlan'=>$base.'4','mac'=>$base.'5','age'=>$base.'6']);
            foreach($rows as $r){
                $ix=explode('.',(string)($r['_suffix']??''));
                $pon=$ix[0]??null; $onu=$ix[1]??null; $entry=$ix[2]??'0';
                $this->appendMacRow($out,$pon,$onu,$r['mac']??null,$r['vlan']??0,'dynamic',null,$r['age']??null,
                    'vsol_onu_mac_table',($entry?:'0'));
            }
        } catch (\Throwable $e) {}
        if($out) return $this->dedupeMacRows($out);

        // PRI/ONU Ethernet-port learned MAC table.
        $pbase='1.3.6.1.4.1.37950.1.1.5.12.4.2.6.1.';
        try {
            $rows=$this->walkColumns($snmp,['mac'=>$pbase.'7','vlan'=>$pbase.'8']);
            foreach($rows as $r){
                $ix=explode('.',(string)($r['_suffix']??''));
                $pon=$ix[0]??null; $onu=$ix[1]??null; $eth=$ix[2]??null; $entry=$ix[3]??'0';
                $this->appendMacRow($out,$pon,$onu,$r['mac']??null,$r['vlan']??0,'dynamic',
                    $eth!==null?('eth'.$eth):null,null,'vsol_pri_port_mac_table',($eth??'x').'/'.$entry);
            }
        } catch (\Throwable $e) {}

        return $this->dedupeMacRows($out);
    }

    /** @param array<int,array<string,mixed>> $rows */
    private function dedupeMacRows(array $rows): array
    {
        $uniq=[];
        foreach($rows as $r) $uniq[(string)($r['entry_key']??md5(json_encode($r))) ]=$r;
        return array_values($uniq);
    }

    /** @return array<int,array<string,mixed>> */
    private function collectSwitchFdb(SnmpClient $snmp,string $base,array $columns,string $source): array
    {
        $rows=[];
        foreach($columns as $field=>$col){
            $oid=$base.$col;
            try {
                $walk=$field==='mac' ? $snmp->walkLibrary($oid) : $snmp->walk($oid);
            } catch (\Throwable $e) {
                continue;
            }
            foreach($walk as $woid=>$value){
                $suffix=$this->suffix((string)$woid,$oid);
                if($suffix==='') continue;
                $rows[$suffix][$field]=$value;
                $rows[$suffix]['_suffix']=$suffix;
            }
        }

        $out=[];
        foreach($rows as $r){
            [$pon,$onu]=$this->parseMacPort($this->text($r['port']??null));
            if($pon===null || $onu===null) continue; // ignore CPU/uplink/SFP entries
            $typeRaw=$this->int($r['type']??null);
            // Firmware enum differs slightly across clones; 1/2 are normally
            // dynamic/static. Keep a readable fallback instead of discarding it.
            $type=$typeRaw===2?'static':'dynamic';
            $this->appendMacRow($out,$pon,$onu,$r['mac']??null,$r['vlan']??0,$type,
                $this->text($r['port']??null),null,$source,(string)($r['_suffix']??'0'));
        }
        return $out;
    }

    private function appendMacRow(
        array &$out,mixed $pon,mixed $onu,mixed $macRaw,mixed $vlanRaw,string $type,
        ?string $port,mixed $ageRaw,string $source,string $entry
    ): void {
        if($pon===null || $onu===null) return;
        $pon=(string)$pon; $onu=(string)$onu;
        if($pon==='' || $onu==='') return;
        $mac=$this->mac($macRaw);
        if(!$mac || !$this->validClientMac($mac)) return;
        $vlan=$this->int($vlanRaw)??0;
        $out[]=[
            'pon'=>$pon,'onu_id'=>$onu,'mac'=>$mac,'vlan_id'=>$vlan,
            'mac_type'=>$type,'port_id'=>$port,'service_port'=>null,'gem_id'=>null,
            'age_sec'=>$this->int($ageRaw),'source'=>$source,
            'entry_key'=>strtolower($pon.'/'.$onu.'/'.$entry.'/'.str_replace(':','',$mac).'/'.$vlan)
        ];
    }

    /** @return array{0:?string,1:?string} */
    private function parseMacPort(?string $port): array
    {
        if($port===null) return [null,null];
        $p=trim(str_replace("\\0",'',$port));
        if($p==='') return [null,null];

        // Common V1600D/clone forms:
        // EPON0/1:10, EPON 0/1:10, epon0/1/10, PON1/10, ONU1/10.
        if(preg_match('/(?:epon|gpon)\\s*\\d+\\s*\\/\\s*(\\d+)\\s*[:\\/]\\s*(\\d+)/i',$p,$m))
            return [(string)(int)$m[1],(string)(int)$m[2]];
        if(preg_match('/(?:pon|onu)\\s*(\\d+)\\s*[\\/:]\\s*(\\d+)/i',$p,$m))
            return [(string)(int)$m[1],(string)(int)$m[2]];
        if(preg_match('/^\\s*(\\d+)\\s*[\\/:]\\s*(\\d+)(?:\\D|$)/',$p,$m))
            return [(string)(int)$m[1],(string)(int)$m[2]];

        return [null,null];
    }

    private function explicitDbm(mixed $v): ?float
    {
        // V1600D4 often returns a formatted value such as:
        //   0.00 mW (-23.57 dBm)
        //   1.45 mW (1.61 dBm)
        // The first numeric token is mW, NOT dBm. Always trust the explicit
        // dBm token when the agent provides one. This also preserves RX when
        // mW is rounded to 0.00 while the parenthesised dBm is still valid.
        $s=trim((string)$v);
        if($s==='') return null;
        if(preg_match('/(-?\d+(?:[\.,]\d+)?)\s*dBm\b/i',$s,$m))
            return round((float)str_replace(',','.',$m[1]),2);
        return null;
    }

    private function normaliseRxDbm(mixed $v): ?float
    {
        $explicit=$this->explicitDbm($v);
        if($explicit!==null) return $explicit;

        $n=$this->num($v);
        if($n===null) return null;
        // 0 is not a believable live ONU RX value and is commonly a sentinel
        // when there is no explicit dBm token.
        if(abs($n)<0.0000001) return null;
        // V1600D4 commonly reports RX in milliwatts as a small positive decimal.
        if($n>0 && $n<=1.0) return round(10*log10($n),2);
        // Negative readings may already be dBm, or integer tenths/hundredths.
        if($n<0) return $this->smartDbm($n);
        // Positive >1 without an explicit dBm token is not a normal downstream
        // RX reading, so do not mislabel it as dBm.
        return null;
    }

    private function normaliseTxDbm(mixed $v): ?float
    {
        $explicit=$this->explicitDbm($v);
        if($explicit!==null) return $explicit;

        $n=$this->num($v);
        if($n===null || abs($n)<0.0000001) return null;
        // If firmware returns only a bare value, the common VSOL EPON form is
        // already dBm around 0..6. Keep the legacy fallback for compatibility.
        if($n>=-10 && $n<=10) return round($n,2);
        return $this->smartDbm($n);
    }

    private function normalisePlainMetric(mixed $v): ?float
    {
        $n=$this->num($v);
        return $n===null?null:round($n,3);
    }

    private function validClientMac(string $mac): bool
    {
        $hex=preg_replace('/[^0-9A-F]/i','',$mac)??'';
        if(strlen($hex)!==12) return false;
        if($hex==='000000000000' || strtoupper($hex)==='FFFFFFFFFFFF') return false;
        // Multicast/group addresses are not PPPoE caller/client identities.
        return (hexdec(substr($hex,0,2)) & 1)===0;
    }

    /** Read-only Rogue detector state per EPON PON. 0=disabled, 1=enabled. */
    public function collectRogueDetectorState(SnmpClient $snmp,array $olt): ?array
    {
        $base='1.3.6.1.4.1.37950.1.1.5.12.2.21.1.';
        try { $states=$snmp->walk($base.'2'); } catch (\Throwable $e) { return null; }
        if(!$states) return ['supported'=>true,'enabled'=>null,'disabled_pons'=>[],'enabled_pons'=>[],'summary'=>'Rogue detector table is present but returned no PON state.'];
        $ponNames=[];
        try {
            foreach($snmp->walk($base.'1') as $oid=>$v){ $sf=$this->suffix((string)$oid,$base.'1'); if($sf!=='') $ponNames[$sf]=(string)($this->text($v)??$sf); }
        } catch (\Throwable $e) {}
        $enabled=[];$disabled=[];
        foreach($states as $oid=>$v){
            $sf=$this->suffix((string)$oid,$base.'2'); if($sf==='') continue;
            $pon=$ponNames[$sf]??explode('.',$sf)[0]??$sf; $n=$this->int($v);
            if($n===1)$enabled[]=(string)$pon; elseif($n===0)$disabled[]=(string)$pon;
        }
        $enabledState=($disabled?false:(count($enabled)>0?true:null));
        $summary=$disabled ? ('Disabled on PON '.implode(', ',$disabled)) : ($enabledState===true?'Enabled on all reported PONs':'Detector state unknown');
        return ['supported'=>true,'enabled'=>$enabledState,'disabled_pons'=>array_values(array_unique($disabled)),'enabled_pons'=>array_values(array_unique($enabled)),'summary'=>$summary];
    }

    /**
     * Native V1600D/V1600D4 Rogue ONU table. VSOL calls the measurement
     * "laser-always-on"; this is the vendor-native signal used for what many
     * NOCs call back-laser / rogue ONU detection. Read-only: no OLT settings are
     * changed and no ONU is rebooted/disabled by this monitor.
     */
    public function collectRogueOnus(SnmpClient $snmp,array $olt): ?array
    {
        $base='1.3.6.1.4.1.37950.1.1.5.12.2.22.1.';
        try { $ponWalk=$snmp->walk($base.'1'); }
        catch (\Throwable $e) {
            // Dynamic rogue lists are commonly empty when no rogue ONU exists.
            // If the per-PON detector config table is readable, treat that as a
            // supported empty list rather than an unsupported driver.
            return $this->collectRogueDetectorState($snmp,$olt)!==null ? [] : null;
        }

        $map=[];
        foreach($ponWalk as $oid=>$v){$sf=$this->suffix((string)$oid,$base.'1');if($sf!==''){$map[$sf]['pon']=$v;$map[$sf]['_suffix']=$sf;}}
        foreach(['onu_id'=>'2','llid'=>'3','status_raw'=>'4','state'=>'6'] as $field=>$col){
            try{$walk=$snmp->walk($base.$col);}catch(\Throwable $e){$walk=[];}
            foreach($walk as $oid=>$v){$sf=$this->suffix((string)$oid,$base.$col);if($sf!==''){$map[$sf][$field]=$v;$map[$sf]['_suffix']=$sf;}}
        }
        try{$walk=$snmp->walkLibrary($base.'5');}catch(\Throwable $e){try{$walk=$snmp->walk($base.'5');}catch(\Throwable $e2){$walk=[];}}
        foreach($walk as $oid=>$v){$sf=$this->suffix((string)$oid,$base.'5');if($sf!==''){$map[$sf]['mac']=$v;$map[$sf]['_suffix']=$sf;}}

        $out=[];
        foreach($map as $r){
            $pon=$this->text($r['pon']??null);$onu=$this->text($r['onu_id']??null);
            if(($pon===null || $onu===null) && !empty($r['_suffix'])){
                $parts=explode('.',(string)$r['_suffix']);
                if($pon===null && isset($parts[0]))$pon=$parts[0];
                if($onu===null && isset($parts[1]))$onu=$parts[1];
            }
            if($pon===null && $onu===null) continue;
            $statusRaw=$this->int($r['status_raw']??null);
            $out[]=[
                'pon'=>(string)$pon,'onu_id'=>(string)$onu,
                'llid'=>$this->text($r['llid']??null),
                'status'=>$statusRaw===1?'online':($statusRaw===0?'offline':$this->text($r['status_raw']??null)),
                'mac'=>$this->mac($r['mac']??null),
                'state'=>$this->text($r['state']??null),
                'keywords'=>'laser-always-on',
                'detected_time'=>null,
                'source'=>'vsol_epon_rogue_table'
            ];
        }
        return $out;
    }

}
