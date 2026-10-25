<?php
namespace App\Drivers;
use App\Services\SnmpClient;

final class BdcomEponDriver extends AbstractDriver
{
    use BdcomFdbTrait;
    public function name(): string { return 'BDCOM EPON'; }
    public function collectMacEntries(SnmpClient $snmp,array $olt): ?array { return $this->collectBdcomMacEntries($snmp,$olt); }
    public function probeOid(): string { return '1.3.6.1.4.1.3320.101.10.1.1.26'; }
    public function collectOnus(SnmpClient $snmp,array $olt): array
    {
        $b='1.3.6.1.4.1.3320.101.10.1.1.';
        $rows=$this->walkColumns($snmp,['vendor'=>$b.'1','model'=>$b.'2','mac'=>$b.'3','hardware'=>$b.'4','software'=>$b.'5','firmware'=>$b.'6','status_raw'=>$b.'26','distance_m'=>$b.'27']);
        $ifnames=$this->ifNames($snmp);$out=[];
        foreach($rows as $r){
          $idx=(int)explode('.',(string)$r['_suffix'])[0];[$pon,$onu]=$this->parseIfName($ifnames[$idx]??null);$sv=$this->int($r['status_raw']??null);// NMS-EPON-ONU-MIB: 0=authenticated, 1=registered, 2=deregistered, 3=auto_config.
          // P3608/P3608-2TE builds commonly keep active auto-provisioned ONUs at raw state 3,
          // so normalize both registered(1) and auto_config(3) as ONLINE for NOC monitoring.
          // authenticated(0) is also link-present but not fully registered; keep it visible as authenticated.
          $status=match($sv){1=>'online',2=>'offline',3=>'online',0=>'authenticated',default=>'unknown'};
          $software=$this->text($r['software']??null);
          $firmware=$this->text($r['firmware']??null);
          // Several BDCOM EPON builds expose onuFirmwareVersion as binary bytes
          // even though the MIB says DisplayString. Prefer the readable software
          // version when available; otherwise retain a safe HEX representation.
          if(($firmware===null || str_starts_with($firmware,'HEX:')) && $software!==null && !str_starts_with($software,'HEX:')) $firmware=$software;
          $x=['device_index'=>(string)$idx,'pon'=>$pon,'onu_id'=>$onu?:($ifnames[$idx]??(string)$idx),'mac'=>$this->mac($r['mac']??null),'serial'=>null,'name'=>$this->text($ifnames[$idx]??null),'description'=>null,'vendor'=>$this->text($r['vendor']??null)?:'BDCOM','model'=>$this->text($r['model']??null),'firmware'=>$firmware,'hardware'=>$this->text($r['hardware']??null),'status'=>$status,'admin_status'=>null,'down_reason'=>null,'distance_m'=>$this->int($r['distance_m']??null),'uptime_sec'=>null,'last_register'=>null,'last_deregister'=>null,'rx_power'=>null,'tx_power'=>null,'olt_rx_power'=>null,'temperature_c'=>null,'voltage_v'=>null];$out[]=$this->normalizeBase($x);
        }
        $ob='1.3.6.1.4.1.3320.101.10.5.1.';$orows=$this->walkColumns($snmp,['device_index'=>$ob.'1','temperature'=>$ob.'2','voltage'=>$ob.'3','rx'=>$ob.'5','tx'=>$ob.'6']);$om=[];foreach($orows as $r){$idx=$this->int($r['device_index']??null)??(int)explode('.',(string)$r['_suffix'])[0];$om[(string)$idx]=['temperature_c'=>$this->temp($r['temperature']??null,256),'voltage_v'=>$this->voltage($r['voltage']??null,10000),'rx_power'=>$this->dbm($r['rx']??null,10),'tx_power'=>$this->dbm($r['tx']??null,10)];}foreach($out as &$r){if(isset($om[$r['device_index']]))$r=array_merge($r,$om[$r['device_index']]);}unset($r);return $out;
    }
}
