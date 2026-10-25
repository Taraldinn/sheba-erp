<?php
namespace App\Drivers;
use App\Services\SnmpClient;

abstract class AbstractDriver implements DriverInterface
{
    /**
     * Optional learned/caller MAC collection. null means this profile has no
     * confirmed per-ONU MAC table. An empty array means a successful empty table.
     * @return array<int,array<string,mixed>>|null
     */
    public function collectMacEntries(SnmpClient $snmp,array $olt): ?array { return null; }

    /**
     * Optional read-only status of the vendor Rogue ONU detector. The returned
     * array uses: supported(bool), enabled(?bool), disabled_pons(array),
     * enabled_pons(array), summary(string). null means no confirmed mapping.
     * @return array<string,mixed>|null
     */
    public function collectRogueDetectorState(SnmpClient $snmp,array $olt): ?array { return null; }

    /**
     * Optional native Rogue ONU / continuous back-laser detection. null means
     * this driver has no confirmed/readable rogue-ONU list. An empty array
     * means the table is supported and no rogue ONU is currently reported.
     * @return array<int,array<string,mixed>>|null
     */
    public function collectRogueOnus(SnmpClient $snmp,array $olt): ?array { return null; }

    /** Parse one SNMP table with column-numbered OIDs using a single walk. */
    protected function walkIndexedTable(SnmpClient $snmp,string $entryBase,array $columnMap): array
    {
        $rows=[];
        $walk=$snmp->walk($entryBase);
        $base=ltrim($entryBase,'.');
        foreach($walk as $oid=>$value){
            $oid=ltrim((string)$oid,'.');
            if(!str_starts_with($oid,$base.'.')) continue;
            $rest=substr($oid,strlen($base)+1);
            $parts=explode('.',$rest);
            $col=(int)array_shift($parts);
            if(!isset($columnMap[$col]) || !$parts) continue;
            $idx=implode('.',$parts);
            $rows[$idx][$columnMap[$col]]=$value;
            $rows[$idx]['_suffix']=$idx;
        }
        return array_values($rows);
    }
    protected function walkColumns(SnmpClient $snmp,array $cols): array
    {
        $rows=[];
        foreach($cols as $field=>$base){
            if (!$base) continue;
            try{$walk=$snmp->walk($base);}catch(\Throwable $e){continue;}
            foreach($walk as $oid=>$val){$suffix=$this->suffix($oid,$base);if($suffix==='')continue;$rows[$suffix][$field]=$val;$rows[$suffix]['_suffix']=$suffix;}
        }
        return array_values($rows);
    }
    protected function suffix(string $oid,string $base): string {
        $oid=ltrim($oid,'.');$base=ltrim($base,'.'); if(str_starts_with($oid,$base.'.'))return substr($oid,strlen($base)+1); return '';
    }
    protected function int(mixed $v): ?int { if($v===null||$v==='')return null; if(preg_match('/-?\d+/',(string)$v,$m))return (int)$m[0]; return null; }
    protected function num(mixed $v): ?float { if($v===null||$v==='')return null; if(preg_match('/-?\d+(?:\.\d+)?/',str_replace(',','.',(string)$v),$m))return (float)$m[0]; return null; }
    protected function dbm(mixed $v,float $scale=1.0): ?float { $n=$this->num($v); if($n===null)return null; return round($n/$scale,2); }
    protected function smartDbm(mixed $v): ?float { $n=$this->num($v); if($n===null)return null; if(abs($n)>=1000)$n/=100; elseif(abs($n)>=100)$n/=10; return round($n,2); }
    protected function temp(mixed $v,float $scale=1.0): ?float { $n=$this->num($v); return $n===null?null:round($n/$scale,2); }
    protected function voltage(mixed $v,float $scale=1.0): ?float { $n=$this->num($v); return $n===null?null:round($n/$scale,3); }
    /**
     * Convert an SNMP DisplayString/OCTET STRING into database-safe UTF-8 text.
     * Some BDCOM firmware releases return binary version bytes from fields that
     * the MIB declares as DisplayString (for example \x96\x01\x02). Never
     * pass those bytes directly to an utf8mb4 MySQL column.
     */
    protected function text(mixed $v): ?string {
        if($v===null)return null;
        $s=(string)$v;
        if($s==='')return null;

        // Strip a textual SNMP wrapper only when the payload itself is textual.
        foreach(['OCTET STRING:','STRING:'] as $prefix){
            if(str_starts_with(strtoupper($s),$prefix)){
                $s=ltrim(substr($s,strlen($prefix)));
                break;
            }
        }
        if(strlen($s)>=2 && $s[0]==='"' && $s[strlen($s)-1]==='"') $s=substr($s,1,-1);
        if($s==='')return null;

        $hasBinary=(bool)preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/',$s);
        $validUtf8=function_exists('mb_check_encoding') ? mb_check_encoding($s,'UTF-8') : (preg_match('//u',$s)===1);
        if($hasBinary || !$validUtf8){
            // ASCII HEX is deterministic, searchable and always valid utf8mb4.
            return 'HEX:'.strtoupper(bin2hex($s));
        }

        $s=preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u','',$s)??$s;
        $s=trim($s);
        return $s===''?null:$s;
    }
    protected function mac(mixed $v): ?string {
        $s=(string)$v; if($s==='')return null;

        // Net-SNMP library mode: Hex-STRING: F8 4A BF 47 A2 D3
        $t=trim($s);
        if(preg_match('/^Hex-STRING:\s*((?:[0-9A-Fa-f]{2}(?:\s+|$)){6})/i',$t,$m)){
            $hex=preg_replace('/[^0-9A-Fa-f]/','',$m[1]);
            if(strlen((string)$hex)===12) return strtoupper(implode(':',str_split($hex,2)));
        }

        // Some builds return STRING: followed by six raw octets. Strip only the
        // textual wrapper, never trim the binary payload itself.
        foreach(['OCTET STRING:','STRING:'] as $prefix){
            if(str_starts_with(strtoupper($s),$prefix)){
                $s=ltrim(substr($s,strlen($prefix)));
                break;
            }
        }
        if(strlen($s)>=2 && $s[0]==='"' && $s[strlen($s)-1]==='"') $s=substr($s,1,-1);

        // A MAC OCTET STRING is exactly six bytes. Treat all six-byte payloads
        // as binary, even when every byte happens to be printable ASCII.
        if(strlen($s)===6) return strtoupper(implode(':',str_split(bin2hex($s),2)));

        // Fallback textual forms: aa:bb:cc:dd:ee:ff, aa-bb..., aabb.ccdd.eeff,
        // or a compact 12-hex string.
        $t=trim($s);
        if(str_starts_with(strtolower($t),'hex-string:'))$t=trim(substr($t,11));
        $hex=preg_replace('/[^0-9a-f]/i','',$t);
        if(strlen((string)$hex)===12)return strtoupper(implode(':',str_split($hex,2)));
        return null;
    }
    protected function serial(mixed $v): ?string {
        $s=(string)$v; if($s==='')return null;
        if(strlen($s)===8 && preg_match('/[^\x20-\x7E]/',$s)) { $vendor=substr($s,0,4); return (preg_match('/^[\x20-\x7E]{4}$/',$vendor)?strtoupper($vendor):strtoupper(bin2hex($vendor))).strtoupper(bin2hex(substr($s,4))); }
        $s=trim($s);
        if(str_starts_with(strtolower($s),'hex-string:'))$s=trim(substr($s,11));
        $hex=preg_replace('/[^0-9a-f]/i','',$s);
        if(strlen((string)$hex)===16){$bytes=hex2bin($hex);if($bytes!==false){$vendor=substr($bytes,0,4);if(preg_match('/^[\x20-\x7E]{4}$/',$vendor))return strtoupper($vendor).strtoupper(bin2hex(substr($bytes,4)));}return strtoupper($hex);}
        return trim($s,'"');
    }
    protected function key(array $r): string {
        foreach(['serial','mac'] as $f)if(!empty($r[$f]))return strtolower(str_replace([':', '-', ' '],'',(string)$r[$f]));
        return ($r['pon']??'x').'/'.($r['onu_id']??($r['device_index']??uniqid('onu',true)));
    }
    protected function normalizeBase(array $r): array {
        $r['onu_key']=$this->key($r); return $r;
    }
    protected function mergeByPonOnu(array &$out,array $optics): void {
        $map=[];foreach($optics as $o){$p=(string)($o['pon']??'');$n=(string)($o['onu_id']??'');if($p!==''&&$n!=='')$map[$p.'/'.$n]=$o;}
        foreach($out as &$r){$k=($r['pon']??'').'/'.($r['onu_id']??'');if(isset($map[$k]))$r=array_merge($r,$map[$k]);}unset($r);
    }
    protected function cdataIndex(int $idx): array { return ['slot'=>(($idx>>16)&0xFF),'pon'=>(($idx>>8)&0xFF),'onu'=>($idx&0xFF)]; }
    protected function ifNames(SnmpClient $snmp): array {
        try{$raw=$snmp->walk('1.3.6.1.2.1.31.1.1.1.1');}catch(\Throwable $e){return [];}$m=[];
        foreach($raw as $oid=>$v){$idx=(int)substr($oid,strrpos($oid,'.')+1);$m[$idx]=$v;}return $m;
    }
    protected function parseIfName(?string $name): array {
        if(!$name)return [null,null];
        if(preg_match('/(?:epon|gpon|pon)?\s*([0-9]+)\s*\/\s*([0-9]+)\s*[:\/]\s*([0-9]+)/i',$name,$m))return [$m[2],$m[3]];
        if(preg_match('/(?:epon|gpon|pon)?\s*([0-9]+)\s*\/\s*([0-9]+):([0-9]+)/i',$name,$m))return [$m[2],$m[3]];
        return [null,null];
    }
}
