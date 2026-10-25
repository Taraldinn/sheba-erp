<?php
namespace App\Drivers;
use App\Services\SnmpClient;

final class GenericDriver extends AbstractDriver
{
    public function __construct(private array $oids=[]){ }
    public function name(): string { return 'Generic / Custom OID'; }
    public function probeOid(): string { return (string)($this->oids['status']??'1.3.6.1.2.1.1.1'); }
    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        $allowed=['device_index','pon','onu_id','mac','serial','name','description','vendor','model','firmware','hardware','status','admin_status','down_reason','rx_power','tx_power','olt_rx_power','distance_m','temperature_c','voltage_v','uptime_sec','last_register','last_deregister'];
        $cols=[];foreach($allowed as $f)if(!empty($this->oids[$f]))$cols[$f]=$this->oids[$f];
        if(!$cols) return [];$rows=$this->walkColumns($snmp,$cols);$out=[];
        foreach($rows as $r){$idx=$this->text($r['device_index']??null)?:$r['_suffix'];$statusRaw=strtolower((string)($r['status']??'unknown'));$status=in_array($statusRaw,['1','up','online','working','registered'],true)?'online':(in_array($statusRaw,['0','2','down','offline','los'],true)?'offline':$statusRaw);
          $x=['device_index'=>$idx,'pon'=>$this->text($r['pon']??null),'onu_id'=>$this->text($r['onu_id']??null),'mac'=>$this->mac($r['mac']??null),'serial'=>$this->serial($r['serial']??null),'name'=>$this->text($r['name']??null),'description'=>$this->text($r['description']??null),'vendor'=>$this->text($r['vendor']??null),'model'=>$this->text($r['model']??null),'firmware'=>$this->text($r['firmware']??null),'hardware'=>$this->text($r['hardware']??null),'status'=>$status,'admin_status'=>$this->text($r['admin_status']??null),'down_reason'=>$this->text($r['down_reason']??null),'distance_m'=>$this->int($r['distance_m']??null),'uptime_sec'=>$this->int($r['uptime_sec']??null),'last_register'=>$this->text($r['last_register']??null),'last_deregister'=>$this->text($r['last_deregister']??null),'rx_power'=>$this->smartDbm($r['rx_power']??null),'tx_power'=>$this->smartDbm($r['tx_power']??null),'olt_rx_power'=>$this->smartDbm($r['olt_rx_power']??null),'temperature_c'=>$this->num($r['temperature_c']??null),'voltage_v'=>$this->num($r['voltage_v']??null)];$out[]=$this->normalizeBase($x);}
        return $out;
    }
}
