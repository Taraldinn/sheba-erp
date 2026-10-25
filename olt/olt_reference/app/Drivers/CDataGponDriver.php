<?php
namespace App\Drivers;
use App\Services\SnmpClient;

final class CDataGponDriver extends AbstractDriver
{
    public function __construct(private string $version='v2'){}
    public function name(): string { return 'C-DATA '.$this->version.' GPON'; }
    public function probeOid(): string { return '1.3.6.1.4.1.17409.2.8.4.1.1.7'; }
    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        $b='1.3.6.1.4.1.17409.2.8.4.1.1.';
        $rows=$this->walkColumns($snmp,['device_index'=>$b.'1','name'=>$b.'2','serial'=>$b.'3','vendor'=>$b.'5','model'=>$b.'6','status_raw'=>$b.'7','admin_raw'=>$b.'8','distance_m'=>$b.'9','uptime_sec'=>$b.'13','hardware'=>$b.'14','last_deregister'=>$b.'102','down_reason'=>$b.'103']);
        $out=[];foreach($rows as $r){$idx=$this->int($r['device_index']??null)??$this->int(strrchr((string)($r['_suffix']??''),'.')?:'')??0;$d=$this->cdataIndex($idx);$status=$this->int($r['status_raw']??null)===1?'online':'offline';$admin=$this->int($r['admin_raw']??null)===1?'up':'down';$x=['device_index'=>(string)$idx,'pon'=>(string)$d['pon'],'onu_id'=>(string)$d['onu'],'mac'=>null,'serial'=>$this->serial($r['serial']??null),'name'=>$this->text($r['name']??null),'description'=>null,'vendor'=>$this->text($r['vendor']??null)?:'C-DATA-compatible','model'=>$this->text($r['model']??null),'firmware'=>null,'hardware'=>$this->text($r['hardware']??null),'status'=>$status,'admin_status'=>$admin,'down_reason'=>$this->text($r['down_reason']??null),'distance_m'=>$this->int($r['distance_m']??null),'uptime_sec'=>$this->int($r['uptime_sec']??null),'last_register'=>null,'last_deregister'=>$this->text($r['last_deregister']??null),'rx_power'=>null,'tx_power'=>null,'olt_rx_power'=>null,'temperature_c'=>null,'voltage_v'=>null];$out[]=$this->normalizeBase($x);}
        $ob='1.3.6.1.4.1.17409.2.8.4.4.1.';$orows=$this->walkColumns($snmp,['device_index'=>$ob.'1','rx'=>$ob.'4','tx'=>$ob.'5','voltage'=>$ob.'7','temperature'=>$ob.'8']);$om=[];foreach($orows as $r){$idx=$this->int($r['device_index']??null)??$this->int(strrchr((string)($r['_suffix']??''),'.')?:'')??0;$om[(string)$idx]=['rx_power'=>$this->dbm($r['rx']??null,100),'tx_power'=>$this->dbm($r['tx']??null,100),'temperature_c'=>$this->temp($r['temperature']??null,100),'voltage_v'=>$this->voltage($r['voltage']??null,100000)];}foreach($out as &$r){if(isset($om[$r['device_index']]))$r=array_merge($r,$om[$r['device_index']]);}unset($r);return $out;
    }
}
