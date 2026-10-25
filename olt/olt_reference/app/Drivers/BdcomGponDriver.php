<?php
namespace App\Drivers;
use App\Services\SnmpClient;

final class BdcomGponDriver extends AbstractDriver
{
    use BdcomFdbTrait;
    public function name(): string { return 'BDCOM GPON'; }
    public function collectMacEntries(SnmpClient $snmp,array $olt): ?array { return $this->collectBdcomMacEntries($snmp,$olt); }
    public function probeOid(): string { return '1.3.6.1.4.1.3320.10.3.1.1.8'; }
    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        $b='1.3.6.1.4.1.3320.10.3.1.1.';
        $rows=$this->walkColumns($snmp,['device_index'=>$b.'1','vendor'=>$b.'2','version'=>$b.'3','serial'=>$b.'4','admin_raw'=>$b.'7','status_raw'=>$b.'8','model'=>$b.'9','hardware'=>$b.'12','uptime_sec'=>$b.'19','mac'=>$b.'28','distance_m'=>$b.'33','down_raw'=>$b.'35']);
        $ifnames=$this->ifNames($snmp);$out=[];
        foreach($rows as $r){$idx=$this->int($r['device_index']??null)??(int)explode('.',(string)$r['_suffix'])[0];[$pon,$onu]=$this->parseIfName($ifnames[$idx]??null);$status=$this->int($r['status_raw']??null)===1?'online':'offline';$admin=$this->int($r['admin_raw']??null)===1?'up':'down';
          $x=['device_index'=>(string)$idx,'pon'=>$pon,'onu_id'=>$onu?:($ifnames[$idx]??(string)$idx),'mac'=>$this->mac($r['mac']??null),'serial'=>$this->serial($r['serial']??null),'name'=>$ifnames[$idx]??null,'description'=>null,'vendor'=>$this->text($r['vendor']??null)?:'BDCOM','model'=>$this->text($r['model']??null),'firmware'=>$this->text($r['version']??null),'hardware'=>$this->text($r['hardware']??null),'status'=>$status,'admin_status'=>$admin,'down_reason'=>$this->text($r['down_raw']??null),'distance_m'=>$this->int($r['distance_m']??null),'uptime_sec'=>$this->int($r['uptime_sec']??null),'last_register'=>null,'last_deregister'=>null,'rx_power'=>null,'tx_power'=>null,'olt_rx_power'=>null,'temperature_c'=>null,'voltage_v'=>null];$out[]=$this->normalizeBase($x);}
        return $out;
    }
}
