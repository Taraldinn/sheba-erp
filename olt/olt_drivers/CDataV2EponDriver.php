<?php
require_once __DIR__ . '/CDataV2BaseDriver.php';

class CDataV2EponDriver extends CDataV2BaseDriver {
    public function probeOid() { return '1.3.6.1.4.1.17409.2.3.4.1.1.8'; }

    protected function collectOnus($snmp) {
        $b = '1.3.6.1.4.1.17409.2.3.4.1.1.';
        $rows = $this->walkColumns($snmp, array(
            'name' => $b.'2', 'mac' => $b.'7', 'status_raw' => $b.'8', 'admin_raw' => $b.'9',
            'software' => $b.'13', 'firmware_raw' => $b.'14', 'distance_m' => $b.'15', 'uptime_sec' => $b.'18',
            'vendor' => $b.'25', 'model' => $b.'26', 'hardware' => $b.'27', 'serial' => $b.'28', 'last_register' => $b.'29'
        ));
        $ponMap = $this->physicalPonMap($snmp);
        $out = array();
        foreach ($rows as $r) {
            $idx = $this->deviceIndex($r);
            if ($idx === null) continue;
            $d = $this->cdataIndex($idx);
            if ($d['pon'] <= 0 || $d['onu'] <= 0) continue;
            $pon = $this->physicalPon($d['slot'], $d['pon'], $ponMap);
            $sv = $this->intVal($r['status_raw'] ?? null);
            $av = $this->intVal($r['admin_raw'] ?? null);
            $status = $sv === 1 ? 'online' : ($sv === 2 ? 'offline' : ($sv === 3 ? 'testing' : 'unknown'));
            $admin = $av === 1 ? 'up' : ($av === 2 ? 'down' : ($av === 3 ? 'testing' : null));
            $firmware = $this->textVal($r['firmware_raw'] ?? null) ?: $this->textVal($r['software'] ?? null);
            $out[] = array(
                'device_index' => (string)$idx, 'pon' => (string)$pon, 'onu_id' => (string)$d['onu'],
                'mac' => $this->macVal($r['mac'] ?? null), 'serial' => $this->serialVal($r['serial'] ?? null),
                'name' => $this->textVal($r['name'] ?? null), 'description' => null,
                'vendor' => $this->textVal($r['vendor'] ?? null) ?: 'C-DATA-compatible',
                'model' => $this->textVal($r['model'] ?? null), 'firmware' => $firmware,
                'software' => $this->textVal($r['software'] ?? null), 'hardware' => $this->textVal($r['hardware'] ?? null),
                'status' => $status, 'admin_status' => $admin, 'down_reason' => null,
                'distance_m' => $this->intVal($r['distance_m'] ?? null), 'uptime_sec' => $this->intVal($r['uptime_sec'] ?? null),
                'last_register' => $this->textVal($r['last_register'] ?? null), 'last_deregister' => null,
                'rx_power' => null, 'tx_power' => null, 'temperature_c' => null, 'voltage_v' => null
            );
        }

        // Optical entry index = DeviceIndex.CardIndex.PortIndex. DeviceIndex is the first component.
        $ob = '1.3.6.1.4.1.17409.2.3.4.2.1.';
        $optRows = $this->walkColumns($snmp, array('rx' => $ob.'4', 'tx' => $ob.'5', 'voltage' => $ob.'7', 'temperature' => $ob.'8'));
        $opt = array();
        foreach ($optRows as $r) {
            $idx = $this->opticalDeviceIndex($r);
            if ($idx === null) continue;
            $opt[(string)$idx] = array(
                'rx_power' => $this->centiDbm($r['rx'] ?? null),
                'tx_power' => $this->centiDbm($r['tx'] ?? null),
                'temperature_c' => $this->safeTemperature($r['temperature'] ?? null),
                'voltage_v' => $this->safeVoltage($r['voltage'] ?? null)
            );
        }
        foreach ($out as &$row) if (isset($opt[$row['device_index']])) $row = array_merge($row, $opt[$row['device_index']]);
        unset($row);
        return $out;
    }

    protected function collectMacTable($snmp, $onus) {
        // Dual transport: SNMP and Telnet are complementary, not mutually
        // exclusive.  Keep SNMP as the fast/native source, then merge the
        // vendor-confirmed per-ONU Telnet learned-MAC table as a second source.
        $rows = $this->collectSniLearnedMacs($snmp);
        if (!$rows) $rows = $this->collectStandardBridgeMacs($snmp);
        if ($this->ctx->isCDataCliMacEnabled()) {
            $cliRows = $this->collectCliMacs($onus);
            if ($cliRows) $rows = array_merge($rows ?: array(), $cliRows);
        }
        $deduped = array();
        foreach ($rows ?: array() as $r) {
            $hex = strtoupper(preg_replace('/[^0-9A-F]/i', '', (string)($r['mac'] ?? '')));
            $k = (string)($r['pon'] ?? '') . ':' . (string)($r['onu_id'] ?? '') . ':' . $hex . ':' . intval($r['vlan_id'] ?? 0);
            if ($hex === '' || isset($deduped[$k])) continue;
            $deduped[$k] = $r;
        }
        $mapped = array();
        foreach ($deduped as $r) {
            $pon = (string)($r['pon'] ?? ''); $onu = (string)($r['onu_id'] ?? '');
            if ($pon === '' || $onu === '') continue;
            $key = $pon . ':' . $onu;
            if (!isset($mapped[$key])) $mapped[$key] = array();
            $mapped[$key][] = array(
                'mac' => $r['mac'] ?? '',
                'vlan' => $r['vlan_id'] ?? 0,
                'vlan_id' => $r['vlan_id'] ?? 0,
                'type' => $r['mac_type'] ?? null,
                'source' => $r['source'] ?? 'cdata_v2'
            );
        }
        return $mapped;
    }

    private function collectSniLearnedMacs($snmp) {
        $typeOid = '1.3.6.1.4.1.17409.2.3.2.4.2.1.3';
        $portOid = '1.3.6.1.4.1.17409.2.3.2.4.2.1.4';
        try { $ports = $snmp->walk($portOid); } catch (Throwable $e) { return array(); }
        if (!$ports) return array();
        try { $types = $snmp->walk($typeOid); } catch (Throwable $e) { $types = array(); }
        $typeMap = array();
        foreach ($types as $oid => $v) { $s = $this->suffix($oid, $typeOid); if ($s !== '') $typeMap[$s] = $this->intVal($v); }
        $ponMap = $this->physicalPonMap($snmp);
        $out = array();
        foreach ($ports as $oid => $value) {
            $suffix = $this->suffix($oid, $portOid); if ($suffix === '') continue;
            $parts = array_values(array_filter(explode('.', $suffix), 'strlen'));
            if (count($parts) >= 8 && intval($parts[0]) === 6) array_shift($parts);
            if (count($parts) < 7) continue;
            $vlan = intval(array_pop($parts)); $macOctets = array_slice($parts, 0, 6);
            if (count($macOctets) !== 6) continue;
            $ok = true; foreach ($macOctets as $b) if (!ctype_digit((string)$b) || intval($b) < 0 || intval($b) > 255) { $ok = false; break; }
            if (!$ok) continue;
            $mac = strtoupper(implode(':', array_map(function($b) { return sprintf('%02X', intval($b)); }, $macOctets)));
            $idx = $this->intVal($value); if ($idx === null || $idx <= 0) continue;
            $d = $this->cdataIndex($idx); if ($d['pon'] <= 0 || $d['onu'] <= 0) continue;
            $pon = $this->physicalPon($d['slot'], $d['pon'], $ponMap); $type = $typeMap[$suffix] ?? null;
            $out[] = array('pon'=>(string)$pon, 'onu_id'=>(string)$d['onu'], 'mac'=>$mac, 'vlan_id'=>max(0,$vlan),
                'mac_type'=>$type===1?'static':($type===2?'dynamic':($type===3?'blackhole':($type!==null?'type_'.$type:null))), 'source'=>'cdata_sni_mac_table');
        }
        return $out;
    }

    private function collectStandardBridgeMacs($snmp) {
        $bridgeToIf = array();
        try { $bp = $snmp->walk('1.3.6.1.2.1.17.1.4.1.2'); } catch (Throwable $e) { $bp = array(); }
        foreach ($bp as $oid => $value) {
            $bridge = intval(substr($oid, strrpos($oid, '.') + 1)); $ifi = $this->intVal($value);
            if ($bridge > 0 && $ifi !== null && $ifi > 0) $bridgeToIf[$bridge] = $ifi;
        }
        if (!$bridgeToIf) return array();
        $ifNames = $this->ifNames($snmp);
        try { $raw = $snmp->walk('1.3.6.1.2.1.2.2.1.2'); } catch (Throwable $e) { $raw = array(); }
        $ifDescr = array(); foreach ($raw as $oid => $v) $ifDescr[intval(substr($oid, strrpos($oid, '.') + 1))] = (string)$v;
        $seen = array(); $out = array();
        try { $q = $snmp->walk('1.3.6.1.2.1.17.7.1.2.2.1.2'); } catch (Throwable $e) { $q = array(); }
        foreach ($q as $oid => $value) {
            $sf = $this->suffix($oid, '1.3.6.1.2.1.17.7.1.2.2.1.2'); $parts = array_values(array_filter(explode('.', $sf), 'strlen'));
            if (count($parts) < 7) continue; $mac = $this->macFromOidOctets(array_slice($parts, -6)); if (!$mac) continue;
            $prefix = array_slice($parts, 0, -6); $vlan = $prefix ? max(0, intval(end($prefix))) : 0;
            $bridge = $this->intVal($value); if ($bridge === null || !isset($bridgeToIf[$bridge])) continue;
            $ifi = $bridgeToIf[$bridge]; $name = (string)($ifNames[$ifi] ?? $ifDescr[$ifi] ?? '');
            list($pon,$onu) = $this->cdataInterfacePosition($name); if ($pon === null || $onu === null) continue;
            $key = strtolower($pon.'/'.$onu.'/'.str_replace(':','',$mac).'/'.$vlan); if (isset($seen[$key])) continue; $seen[$key] = true;
            $out[] = array('pon'=>(string)$pon,'onu_id'=>(string)$onu,'mac'=>$mac,'vlan_id'=>$vlan,'mac_type'=>'dynamic','source'=>'cdata_qbridge');
        }
        if ($out) return $out;
        try { $b = $snmp->walk('1.3.6.1.2.1.17.4.3.1.2'); } catch (Throwable $e) { $b = array(); }
        foreach ($b as $oid => $value) {
            $parts = array_values(array_filter(explode('.', $this->suffix($oid, '1.3.6.1.2.1.17.4.3.1.2')), 'strlen'));
            if (count($parts) < 6) continue; $mac = $this->macFromOidOctets(array_slice($parts, -6)); if (!$mac) continue;
            $bridge = $this->intVal($value); if ($bridge === null || !isset($bridgeToIf[$bridge])) continue;
            $ifi = $bridgeToIf[$bridge]; $name = (string)($ifNames[$ifi] ?? $ifDescr[$ifi] ?? '');
            list($pon,$onu) = $this->cdataInterfacePosition($name); if ($pon === null || $onu === null) continue;
            $key = strtolower($pon.'/'.$onu.'/'.str_replace(':','',$mac)); if (isset($seen[$key])) continue; $seen[$key] = true;
            $out[] = array('pon'=>(string)$pon,'onu_id'=>(string)$onu,'mac'=>$mac,'vlan_id'=>0,'mac_type'=>'dynamic','source'=>'cdata_bridge_mib');
        }
        return $out;
    }

    private function collectCliMacs($onus) {
        if (!$this->ctx->telnet_connect()) return array();
        $out = array(); $seen = array();
        try {
            $onlineTargets = array_values(array_filter($onus, function($onu) {
                return in_array(strtolower((string)($onu['status'] ?? '')), array('online','up','working','registered','enable','enabled'), true);
            }));
            $targets = $onlineTargets ? $onlineTargets : $onus;
            foreach ($targets as $onu) {
                $pon = intval($onu['pon'] ?? 0); $id = intval($onu['onu_id'] ?? 0); if ($pon <= 0 || $id <= 0) continue;
                $cmd = "show mac-address ont 0/0/{$pon} {$id}";
                $text = $this->ctx->execute_command_bounded($cmd, max(2, min(5, $this->ctx->getTimeout())));
                foreach ($this->parseOntMacOutput((string)$text, $pon, $id, (string)($onu['mac'] ?? '')) as $row) {
                    $k = strtolower($pon.'/'.$id.'/'.str_replace(':','',$row['mac']).'/'.$row['vlan_id']); if (isset($seen[$k])) continue; $seen[$k] = true; $out[] = $row;
                }
            }
        } finally { $this->ctx->telnet_disconnect(); }
        return $out;
    }

    private function parseOntMacOutput($output, $pon, $onu, $onuMac = '') {
        $out = preg_replace('/\x1B\[[0-?]*[ -\/]*[@-~]/', '', (string)$output);
        $out = str_replace("\0", '', $out); $onuNorm = strtoupper(preg_replace('/[^0-9A-F]/i', '', (string)$onuMac));
        if (preg_match('/no\s+(?:mac\s+address|mac-address).*learn|there\s+is\s+not\s+any\s+mac|not\s+found/i', $out)) return array();
        $rows = array(); $seen = array();
        foreach (preg_split('/\r?\n/', $out) as $line) {
            if (!preg_match_all('/\b([0-9A-F]{2}(?::[0-9A-F]{2}){5}|[0-9A-F]{2}(?:-[0-9A-F]{2}){5}|[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4})\b/i', $line, $ms)) continue;
            foreach ($ms[1] as $rawMac) {
                $hex = strtoupper(preg_replace('/[^0-9A-F]/i', '', $rawMac)); if (strlen($hex) !== 12 || $hex === $onuNorm) continue;
                $first = hexdec(substr($hex,0,2)); if (($first & 1) === 1 || $hex === 'FFFFFFFFFFFF' || $hex === '000000000000') continue;
                $mac = implode(':', str_split($hex, 2)); $vlan = 0; $type = 'dynamic';
                $tail = preg_replace('/^.*?'.preg_quote($rawMac,'/').'\s*/i', '', $line, 1);
                if (is_string($tail) && preg_match('/^(\d{1,4})(?:\s|$)/', trim($tail), $m)) $vlan = intval($m[1]);
                if (preg_match('/\b(static|dynamic|black-?hole|blackhole)\b/i', $line, $m)) $type = strtolower(str_replace('-','',$m[1]));
                $k = strtolower($pon.'/'.$onu.'/'.$hex.'/'.$vlan); if (isset($seen[$k])) continue; $seen[$k] = true;
                $rows[] = array('pon'=>(string)$pon,'onu_id'=>(string)$onu,'mac'=>$mac,'vlan_id'=>$vlan,'mac_type'=>$type,'source'=>'cdata_cli_ont');
            }
        }
        return $rows;
    }

    private function deviceIndex($row) {
        $idx = $this->intVal($row['device_index'] ?? null);
        if ($idx === null && isset($row['_suffix']) && preg_match('/^\d+$/', trim((string)$row['_suffix']))) $idx = intval($row['_suffix']);
        return ($idx !== null && $idx > 0) ? $idx : null;
    }
    private function physicalPonMap($snmp) {
        $base = '1.3.6.1.4.1.17409.2.3.3.1.1.'; $entries = array();
        foreach (array('status'=>$base.'5','name'=>$base.'21') as $field=>$oid) {
            try { $walk = $snmp->walk($oid); } catch (Throwable $e) { continue; }
            foreach ($walk as $fullOid=>$value) {
                $parts = array_values(array_filter(explode('.', $this->suffix($fullOid,$oid)), 'strlen')); if (count($parts)<3) continue;
                $port = intval(array_pop($parts)); $card = intval(array_pop($parts)); if ($port<=0) continue; $cardByte=$card & 0xFF; $k=$cardByte.':'.$port;
                $entries[$k]['card']=$cardByte; $entries[$k]['port']=$port; if ($field==='name') $entries[$k]['name']=$this->textVal($value);
            }
        }
        $groups=array(); foreach($entries as $e) $groups[intval($e['card'])][]=$e; $map=array();
        foreach($groups as $card=>$list){ usort($list,function($a,$b){return intval($a['port'])<=>intval($b['port']);}); foreach($list as $i=>$e){$physical=null;$name=trim((string)($e['name']??''));if($name!==''&&preg_match('/(?:PON|EPON)[^0-9]*(?:\d+\D+)*?(\d+)\s*$/i',$name,$m))$physical=intval($m[1]);if(!$physical)$physical=$i+1;$map[$card.':'.intval($e['port'])]=$physical;if(!isset($map['*:'.intval($e['port'])]))$map['*:'.intval($e['port'])]=$physical;}}
        return $map;
    }
    private function physicalPon($card,$internal,$map){return intval($map[intval($card).':'.intval($internal)] ?? $map['*:'.intval($internal)] ?? $internal);}
    private function opticalDeviceIndex($row){$idx=$this->intVal($row['device_index']??null);if($idx!==null&&$idx>0)return $idx;$s=trim((string)($row['_suffix']??''));return preg_match('/^(\d+)(?:\.\d+){2,}$/',$s,$m)?intval($m[1]):null;}
    private function centiDbm($v){$n=$this->numVal($v);if($n===null)return null;$x=round($n/100,2);return ($x < -60 || $x > 20)?null:$x;}
    private function safeTemperature($v){$n=$this->numVal($v);if($n===null)return null;$x=round($n/100,2);return ($x < -50 || $x > 150)?null:$x;}
    private function safeVoltage($v){$n=$this->numVal($v);if($n===null)return null;$x=round($n/100000,3);return ($x <= 0 || $x > 10)?null:$x;}
    private function macFromOidOctets($parts){if(count($parts)!==6)return null;$b=array();foreach($parts as $p){if(!preg_match('/^\d+$/',(string)$p)||intval($p)<0||intval($p)>255)return null;$b[]=intval($p);}return strtoupper(implode(':',array_map(function($n){return sprintf('%02X',$n);},$b)));}
    private function cdataInterfacePosition($name){$n=trim((string)$name);if($n==='')return array(null,null);if(preg_match('/(?:epon|pon)\s*\d+\s*\/\s*\d+\s*\/\s*(\d+)\s*[:\/-]\s*(\d+)/i',$n,$m))return array(intval($m[1]),intval($m[2]));if(preg_match('/(?:epon|pon)\s*\d+\s*\/\s*(\d+)\s*[:\/-]\s*(\d+)/i',$n,$m))return array(intval($m[1]),intval($m[2]));if(preg_match('/pon\s*(\d+)\s*(?:\/\s*(?:onu)?|:)\s*(\d+)/i',$n,$m))return array(intval($m[1]),intval($m[2]));return array(null,null);}
}
