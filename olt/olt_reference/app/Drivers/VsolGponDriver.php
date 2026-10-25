<?php
namespace App\Drivers;
use App\Services\SnmpClient;

final class VsolGponDriver extends AbstractDriver
{
    public function name(): string { return 'VSOL-compatible GPON'; }
    public function probeOid(): string { return '1.3.6.1.4.1.37950.1.1.6.1.1.1.1.5'; }
    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        $b='1.3.6.1.4.1.37950.1.1.6.1.1.1.1.';
        $rows=$this->walkColumns($snmp,['pon'=>$b.'1','onu_id'=>$b.'2','status_raw'=>$b.'5','description'=>$b.'7','last_register'=>$b.'8','last_deregister'=>$b.'9','down_raw'=>$b.'10']);
        $auth=$this->walkColumns($snmp,['pon'=>'1.3.6.1.4.1.37950.1.1.6.1.1.2.1.1','onu_id'=>'1.3.6.1.4.1.37950.1.1.6.1.1.2.1.2','serial'=>'1.3.6.1.4.1.37950.1.1.6.1.1.2.1.5','model'=>'1.3.6.1.4.1.37950.1.1.6.1.1.2.1.6']);
        $am=[];foreach($auth as $a){$am[($a['pon']??'').'/'.($a['onu_id']??'')]=$a;}
        $statusMap=[0=>'logging',1=>'los',2=>'syncMib',3=>'online',4=>'dyingGasp',5=>'authFail',6=>'offline',7=>'deactivated',8=>'configFail'];
        $out=[];foreach($rows as $r){$p=$this->text($r['pon']??null);$n=$this->text($r['onu_id']??null);$a=$am[$p.'/'.$n]??[];$sv=$this->int($r['status_raw']??null);$status=$statusMap[$sv??-1]??'unknown';
          $x=['device_index'=>$r['_suffix']??null,'pon'=>$p,'onu_id'=>$n,'mac'=>null,'serial'=>$this->serial($a['serial']??null),'name'=>null,'description'=>$this->text($r['description']??null),'vendor'=>'VSOL-compatible','model'=>$this->text($a['model']??null),'firmware'=>null,'hardware'=>null,'status'=>$status,'admin_status'=>null,'down_reason'=>$this->text($r['down_raw']??null),'distance_m'=>null,'uptime_sec'=>null,'last_register'=>$this->text($r['last_register']??null),'last_deregister'=>$this->text($r['last_deregister']??null),'rx_power'=>null,'tx_power'=>null,'olt_rx_power'=>null,'temperature_c'=>null,'voltage_v'=>null];$out[]=$this->normalizeBase($x);}
        $ob='1.3.6.1.4.1.37950.1.1.6.1.1.3.1.';$orows=$this->walkColumns($snmp,['pon'=>$ob.'1','onu_id'=>$ob.'2','temperature'=>$ob.'3','voltage'=>$ob.'4','tx'=>$ob.'6','rx'=>$ob.'7','olt_rx'=>$ob.'8']);
        $opt=[];foreach($orows as $r)$opt[]=['pon'=>$this->text($r['pon']??null),'onu_id'=>$this->text($r['onu_id']??null),'temperature_c'=>$this->num($r['temperature']??null),'voltage_v'=>$this->num($r['voltage']??null),'tx_power'=>$this->smartDbm($r['tx']??null),'rx_power'=>$this->smartDbm($r['rx']??null),'olt_rx_power'=>$this->smartDbm($r['olt_rx']??null)];$this->mergeByPonOnu($out,$opt);
        $dist=$this->walkColumns($snmp,['pon'=>'1.3.6.1.4.1.37950.1.1.6.1.1.12.1.1','onu_id'=>'1.3.6.1.4.1.37950.1.1.6.1.1.12.1.2','distance'=>'1.3.6.1.4.1.37950.1.1.6.1.1.12.1.3']);$dm=[];foreach($dist as $d)$dm[($d['pon']??'').'/'.($d['onu_id']??'')]=$this->int($d['distance']??null);foreach($out as &$r){$k=($r['pon']??'').'/'.($r['onu_id']??'');if(isset($dm[$k]))$r['distance_m']=$dm[$k];}unset($r);return $out;
    }

    /** Read-only GPON Rogue detector status. Prefer per-PON extended table. */
    public function collectRogueDetectorState(SnmpClient $snmp,array $olt): ?array
    {
        $base='1.3.6.1.4.1.37950.1.1.6.1.5.5.1.';
        try {
            $states=$snmp->walk($base.'2'); // disable(1), enable(2)
            if($states){
                $pons=[]; try{foreach($snmp->walk($base.'1') as $oid=>$v){$sf=$this->suffix((string)$oid,$base.'1');if($sf!=='')$pons[$sf]=(string)($this->text($v)??$sf);}}catch(\Throwable $e){}
                $enabled=[];$disabled=[];
                foreach($states as $oid=>$v){$sf=$this->suffix((string)$oid,$base.'2');if($sf==='')continue;$pon=$pons[$sf]??explode('.',$sf)[0]??$sf;$n=$this->int($v);if($n===2)$enabled[]=(string)$pon;elseif($n===1)$disabled[]=(string)$pon;}
                $enabledState=($disabled?false:(count($enabled)>0?true:null));
                return ['supported'=>true,'enabled'=>$enabledState,'disabled_pons'=>array_values(array_unique($disabled)),'enabled_pons'=>array_values(array_unique($enabled)),'summary'=>$disabled?('Disabled on PON '.implode(', ',$disabled)):($enabledState===true?'Enabled on all reported PONs':'Detector state unknown')];
            }
        } catch (\Throwable $e) {}
        // Older V1600G firmware exposes one global detector state: 0=off, 1=on.
        try {
            $v=$this->int($snmp->get('1.3.6.1.4.1.37950.1.1.6.1.5.1.1.0'));
            if($v!==null) return ['supported'=>true,'enabled'=>$v===1,'disabled_pons'=>$v===1?[]:['ALL'],'enabled_pons'=>$v===1?['ALL']:[],'summary'=>$v===1?'Global Rogue detector enabled':'Global Rogue detector disabled'];
        } catch (\Throwable $e) {}
        return null;
    }

    /** Native VSOL GPON rogue ONU list (read-only). */
    public function collectRogueOnus(SnmpClient $snmp,array $olt): ?array
    {
        $base='1.3.6.1.4.1.37950.1.1.6.1.5.3.1.';
        try { $ponWalk=$snmp->walk($base.'1'); }
        catch (\Throwable $e) { return $this->collectRogueDetectorState($snmp,$olt)!==null ? [] : null; }
        $map=[];
        foreach($ponWalk as $oid=>$v){$sf=$this->suffix((string)$oid,$base.'1');if($sf!==''){$map[$sf]['pon']=$v;$map[$sf]['_suffix']=$sf;}}
        foreach(['onu_id'=>'2','keywords'=>'3','detected_time'=>'4','state'=>'5'] as $field=>$col){
            try{$walk=$snmp->walk($base.$col);}catch(\Throwable $e){$walk=[];}
            foreach($walk as $oid=>$v){$sf=$this->suffix((string)$oid,$base.$col);if($sf!==''){$map[$sf][$field]=$v;$map[$sf]['_suffix']=$sf;}}
        }
        $out=[];
        foreach($map as $r){
            $pon=$this->text($r['pon']??null);$onu=$this->text($r['onu_id']??null);
            if(($pon===null || $onu===null) && !empty($r['_suffix'])){
                $parts=explode('.',(string)$r['_suffix']);
                if($pon===null && isset($parts[0]))$pon=$parts[0];
                if($onu===null && isset($parts[1]))$onu=$parts[1];
            }
            if($pon===null && $onu===null) continue;
            $out[]=[
                'pon'=>(string)$pon,'onu_id'=>(string)$onu,'llid'=>null,'mac'=>null,
                'status'=>null,'state'=>$this->text($r['state']??null),
                'keywords'=>$this->text($r['keywords']??null) ?: 'rogue-onu',
                'detected_time'=>$this->text($r['detected_time']??null),
                'source'=>'vsol_gpon_rogue_table'
            ];
        }
        return $out;
    }

}
