<?php
/**
 * BDCOM read-only learned/client MAC collectors ported from app.zip.
 * Priority: Q-BRIDGE -> BDCOM userFdb -> BDCOM private per-ONU FDB -> BRIDGE-MIB -> optional Telnet CLI.
 */
trait BDCOMSnmpTrait {
    protected function collectBdcomSnmpMacEntries($snmp) {
        $ifNames = $this->snmpIfNames($snmp);
        try {
            foreach ($snmp->walk('1.3.6.1.2.1.2.2.1.2') as $oid => $value) {
                $idx = intval(substr((string)$oid, strrpos((string)$oid, '.') + 1));
                if (!isset($ifNames[$idx]) || trim((string)$ifNames[$idx]) === '') $ifNames[$idx] = (string)$value;
            }
        } catch (Throwable $e) {}

        $rows = $this->collectBdcomQBridgeFdb($snmp, $ifNames);
        if (!$rows) $rows = $this->collectBdcomUserFdb($snmp, $ifNames);
        if (!$rows) $rows = $this->collectBdcomPrivateFdb($snmp, $ifNames);
        if (!$rows) $rows = $this->collectBdcomBridgeFdb($snmp, $ifNames);
        return $this->dedupeBdcomMacRows($rows);
    }

    private function collectBdcomQBridgeFdb($snmp, $ifNames) {
        $portOid = '1.3.6.1.2.1.17.7.1.2.2.1.2';
        try { $fdbPorts = $snmp->walk($portOid); } catch (Throwable $e) { return array(); }
        if (!$fdbPorts) return array();
        $bridgeToIf = array();
        try {
            $boid = '1.3.6.1.2.1.17.1.4.1.2';
            foreach ($snmp->walk($boid) as $oid => $value) {
                $bridge = intval(substr((string)$oid, strrpos((string)$oid, '.') + 1));
                $ifidx = $this->snmpInt($value);
                if ($bridge > 0 && $ifidx !== null) $bridgeToIf[$bridge] = $ifidx;
            }
        } catch (Throwable $e) {}
        $fdbToVlan = array();
        try {
            $void = '1.3.6.1.2.1.17.7.1.4.2.1.3';
            foreach ($snmp->walk($void) as $oid => $value) {
                $fdb = $this->snmpInt($value); if ($fdb === null) continue;
                $suffix = $this->snmpSuffix((string)$oid, $void); $parts = explode('.', $suffix); $vlan = intval(end($parts));
                if ($vlan >= 1 && $vlan <= 4094) $fdbToVlan[$fdb] = $vlan;
            }
        } catch (Throwable $e) {}
        $out = array();
        foreach ($fdbPorts as $oid => $value) {
            $suffix = $this->snmpSuffix((string)$oid, $portOid); if ($suffix === '') continue;
            $parts = explode('.', $suffix); if (count($parts) < 7) continue;
            $fdbId = intval(array_shift($parts));
            $mac = $this->bdcomMacFromDecimalSuffix(array_slice($parts, -6));
            if (!$mac || !$this->validBdcomClientMac($mac)) continue;
            $bridgePort = $this->snmpInt($value); if ($bridgePort === null || $bridgePort <= 0) continue;
            $ifidx = isset($bridgeToIf[$bridgePort]) ? $bridgeToIf[$bridgePort] : $bridgePort;
            $ifname = isset($ifNames[$ifidx]) ? $ifNames[$ifidx] : null;
            list($pon, $onu) = $this->snmpParseIfName($ifname);
            if ($pon === null || $onu === null) continue;
            $vlan = isset($fdbToVlan[$fdbId]) ? $fdbToVlan[$fdbId] : (($fdbId >= 1 && $fdbId <= 4094) ? $fdbId : 0);
            $out[] = $this->bdcomMacRow($pon, $onu, $mac, $vlan, $ifname, 'bdcom_qbridge_fdb', $suffix);
        }
        return $out;
    }

    private function collectBdcomUserFdb($snmp, $ifNames) {
        $base = '1.3.6.1.4.1.3320.152.2.1'; $indexBySuffix = array();
        try {
            foreach ($snmp->walk($base . '.2') as $oid => $value) {
                $suffix = $this->snmpSuffix((string)$oid, $base . '.2'); $idx = $this->snmpInt($value);
                if ($suffix !== '' && $idx !== null) $indexBySuffix[$suffix] = $idx;
            }
        } catch (Throwable $e) { return array(); }
        if (!$indexBySuffix) return array();
        $out = array();
        for ($col = 3; $col <= 10; $col++) {
            try { $walk = $snmp->walkLibrary($base . '.' . $col); } catch (Throwable $e) { continue; }
            foreach ($walk as $oid => $raw) {
                $suffix = $this->snmpSuffix((string)$oid, $base . '.' . $col); if ($suffix === '') continue;
                $ifidx = isset($indexBySuffix[$suffix]) ? $indexBySuffix[$suffix] : null;
                if ($ifidx === null) { $parts = explode('.', $suffix); $ifidx = intval(end($parts)); }
                if ($ifidx <= 0) continue;
                $ifname = isset($ifNames[$ifidx]) ? $ifNames[$ifidx] : null;
                list($pon, $onu) = $this->snmpParseIfName($ifname); if ($pon === null || $onu === null) continue;
                $mac = $this->snmpMac($raw); if (!$mac || !$this->validBdcomClientMac($mac)) continue;
                $out[] = $this->bdcomMacRow($pon, $onu, $mac, 0, $ifname, 'bdcom_user_fdb', $suffix . '.' . $col);
            }
        }
        return $out;
    }

    private function collectBdcomPrivateFdb($snmp, $ifNames) {
        $oid = '1.3.6.1.4.1.3320.152.1.1.3'; $onuIfs = array();
        foreach ($ifNames as $ifidx => $ifname) {
            list($pon, $onu) = $this->snmpParseIfName($ifname);
            if ($pon !== null && $onu !== null) $onuIfs[intval($ifidx)] = array($pon, $onu, $ifname);
        }
        if (!$onuIfs) return array();
        $active = array();
        try {
            $statusBase = '1.3.6.1.4.1.3320.101.10.1.1.26';
            foreach ($snmp->walk($statusBase) as $soid => $value) {
                $suffix = $this->snmpSuffix((string)$soid, $statusBase); $parts = explode('.', $suffix); $ifidx = intval(isset($parts[0]) ? $parts[0] : 0);
                $st = $this->snmpInt($value); if ($ifidx > 0 && in_array($st, array(0,1,3), true)) $active[$ifidx] = true;
            }
        } catch (Throwable $e) {}
        if ($active) {
            foreach (array_keys($onuIfs) as $idx) if (!isset($active[$idx])) unset($onuIfs[$idx]);
        }
        $out = array(); $unsupported = 0; $attempted = 0;
        foreach ($onuIfs as $ifidx => $meta) {
            list($pon, $onu, $ifname) = $meta; $base = $oid . '.' . $ifidx;
            try { $walk = $snmp->walkLibrary($base); }
            catch (Throwable $e) {
                $attempted++; $msg = strtolower($e->getMessage());
                if (strpos($msg, 'no such object') !== false || strpos($msg, 'no such instance') !== false || strpos($msg, 'timeout') !== false || strpos($msg, 'no response') !== false) $unsupported++;
                if (!$out && $attempted >= 4 && $unsupported === $attempted) break;
                continue;
            }
            $attempted++;
            foreach ($walk as $woid => $raw) {
                $suffix = $this->snmpSuffix((string)$woid, $base); if ($suffix === '') continue;
                $parts = explode('.', $suffix); if (count($parts) >= 8 && intval($parts[0]) === intval($ifidx)) array_shift($parts);
                if (count($parts) < 7) continue;
                $vlan = intval(array_shift($parts)); $mac = $this->snmpMac($raw);
                if (!$mac) $mac = $this->bdcomMacFromDecimalSuffix(array_slice($parts, -6));
                if (!$mac || !$this->validBdcomClientMac($mac)) continue;
                $out[] = $this->bdcomMacRow($pon, $onu, $mac, $vlan, $ifname, 'bdcom_private_fdb', $ifidx . '.' . $suffix);
            }
        }
        return $out;
    }

    private function collectBdcomBridgeFdb($snmp, $ifNames) {
        $portOid = '1.3.6.1.2.1.17.4.3.1.2';
        try { $fdbPorts = $snmp->walk($portOid); } catch (Throwable $e) { return array(); }
        $bridgeToIf = array();
        try {
            $boid = '1.3.6.1.2.1.17.1.4.1.2';
            foreach ($snmp->walk($boid) as $oid => $value) {
                $bridge = intval(substr((string)$oid, strrpos((string)$oid, '.') + 1)); $ifidx = $this->snmpInt($value);
                if ($bridge > 0 && $ifidx !== null) $bridgeToIf[$bridge] = $ifidx;
            }
        } catch (Throwable $e) {}
        $out = array();
        foreach ($fdbPorts as $oid => $value) {
            $suffix = $this->snmpSuffix((string)$oid, $portOid); $parts = explode('.', $suffix); if (count($parts) < 6) continue;
            $mac = $this->bdcomMacFromDecimalSuffix(array_slice($parts, -6)); if (!$mac || !$this->validBdcomClientMac($mac)) continue;
            $bridge = $this->snmpInt($value); if ($bridge === null || $bridge <= 0) continue;
            $ifidx = isset($bridgeToIf[$bridge]) ? $bridgeToIf[$bridge] : $bridge; $ifname = isset($ifNames[$ifidx]) ? $ifNames[$ifidx] : null;
            list($pon, $onu) = $this->snmpParseIfName($ifname); if ($pon === null || $onu === null) continue;
            $out[] = $this->bdcomMacRow($pon, $onu, $mac, 0, $ifname, 'bdcom_bridge_fdb', $suffix);
        }
        return $out;
    }

    protected function collectBdcomCliMacEntries($onuRows, $tech) {
        if (!$this->ctx->isCliMacEnabled()) return array();
        if (!$this->ctx->telnet_connect()) return array();
        $all = array(); $seen = array();
        try {
            $global = array('show mac address table', 'show mac address-table', 'show mac-address-table', 'show mac address-table dynamic', 'show mac-address-table dynamic', 'show mac address table dynamic');
            foreach ($global as $cmd) {
                try { $output = $this->ctx->execute_command_bounded($cmd, 4); } catch (Throwable $e) { $output = ''; }
                $rows = $this->parseBdcomCliMacTable($output);
                if ($rows) { $all = $rows; break; }
            }
            if (!$all) {
                $pons = array();
                foreach ($onuRows as $r) {
                    $p = intval(isset($r['port']) ? $r['port'] : (isset($r['pon']) ? $r['pon'] : 0));
                    if ($p > 0 && $p <= 64) $pons[$p] = $p;
                }
                if (!$pons && strtolower($tech) === 'epon') for ($p = 1; $p <= 8; $p++) $pons[$p] = $p;
                ksort($pons);
                foreach ($pons as $p) {
                    $prefix = strtolower($tech) === 'gpon' ? 'gpon' : 'epon';
                    $cmds = array(
                        'show mac address-table interface ' . $prefix . ' 0/' . $p,
                        'show mac-address-table interface ' . $prefix . ' 0/' . $p,
                        'show mac address table interface ' . $prefix . ' 0/' . $p,
                        'show mac address-table int ' . $prefix . ' 0/' . $p,
                        'show mac-address-table int ' . $prefix . ' 0/' . $p
                    );
                    foreach ($cmds as $cmd) {
                        try { $output = $this->ctx->execute_command_bounded($cmd, 3); } catch (Throwable $e) { $output = ''; }
                        $rows = $this->parseBdcomCliMacTable($output);
                        if ($rows) {
                            foreach ($rows as $r) {
                                $k = strtolower(($r['pon'] ?? '').'/'.($r['onu_id'] ?? '').'/'.str_replace(':','',$r['mac'] ?? '').'/'.($r['vlan_id'] ?? 0));
                                if (!isset($seen[$k])) { $seen[$k] = true; $all[] = $r; }
                            }
                            break;
                        }
                    }
                }
            }
        } finally { $this->ctx->telnet_disconnect(); }
        return $this->dedupeBdcomMacRows($all);
    }

    private function parseBdcomCliMacTable($output) {
        $rows = array(); $seen = array(); $lines = preg_split('/\r?\n/', (string)$output); if (!$lines) return $rows;
        $count = count($lines);
        for ($i = 0; $i < $count; $i++) {
            $line = trim((string)$lines[$i]); if ($line === '') continue;
            $context = $line;
            if ($i + 1 < $count) $context .= ' ' . trim((string)$lines[$i+1]);
            if ($i > 0) $context = trim((string)$lines[$i-1]) . ' ' . $context;
            $mac = null; $token = null;
            foreach (array($line, $context) as $candidate) {
                if (preg_match('/\b([0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4})\b/i', $candidate, $m)) { $mac=$m[1]; $token=$m[1]; break; }
                if (preg_match('/\b([0-9A-F]{2}(?::[0-9A-F]{2}){5})\b/i', $candidate, $m)) { $mac=$m[1]; $token=$m[1]; break; }
                if (preg_match('/\b([0-9A-F]{2}(?:-[0-9A-F]{2}){5})\b/i', $candidate, $m)) { $mac=$m[1]; $token=$m[1]; break; }
                if (preg_match('/\b([0-9A-F]{4}(?:-[0-9A-F]{4}){2})\b/i', $candidate, $m)) { $mac=str_replace('-', '.', $m[1]); $token=$m[1]; break; }
                if (preg_match('/\b([0-9A-F]{12})\b/i', $candidate, $m)) { $mac=$m[1]; $token=$m[1]; break; }
            }
            if (!$mac) continue;
            $pon = null; $onu = null; $portText = null;
            if (preg_match('/\b(?:epon|gpon)\s*(\d+)\s*\/\s*(\d+)\s*:\s*(\d+)(?:[-\/.]\d+)?\b/i', $context, $pm)) { $pon=intval($pm[2]); $onu=intval($pm[3]); $portText=$pm[0]; }
            elseif (preg_match('/(?:^|\s)(\d+)\s*\/\s*(\d+)\s*:\s*(\d+)(?:[-\/.]\d+)?(?:\s|$)/', $context, $pm)) { $pon=intval($pm[2]); $onu=intval($pm[3]); $portText=trim($pm[0]); }
            elseif (preg_match('/\b(?:epon|gpon)\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\b/i', $context, $pm)) { $pon=intval($pm[2]); $onu=intval($pm[3]); $portText=$pm[0]; }
            if (!$pon || !$onu) continue;
            $formatted = $this->normalizeBdcomMac($mac); if (!$this->validBdcomClientMac($formatted)) continue;
            $vlan = 0; $pos = $token !== null ? stripos($line, $token) : false; $before = $pos === false ? '' : substr($line, 0, $pos);
            if (preg_match_all('/(?:^|\s)(\d{1,4})(?=\s|$)/', $before, $vm) && !empty($vm[1])) {
                foreach (array_reverse($vm[1]) as $vx) { $x = intval($vx); if ($x >= 1 && $x <= 4094) { $vlan=$x; break; } }
            }
            $type = preg_match('/\bstatic\b/i', $context) ? 'static' : (preg_match('/\bsecure\b/i', $context) ? 'secure' : 'dynamic');
            $key = strtolower($pon.'/'.$onu.'/bdcom_cli/'.str_replace(':','',$formatted).'/'.$vlan); if (isset($seen[$key])) continue; $seen[$key]=true;
            $rows[] = array('pon'=>(string)$pon,'onu_id'=>(string)$onu,'mac'=>$formatted,'vlan_id'=>$vlan,'mac_type'=>$type,'port_id'=>preg_replace('/\s+/','',(string)$portText),'source'=>'bdcom_cli_telnet','entry_key'=>$key);
        }
        return $rows;
    }

    protected function bdcomMacRowsToMap($rows, $onuRows) {
        $registered = array();
        foreach ($onuRows as $o) {
            $pon = isset($o['port']) ? (string)$o['port'] : (isset($o['pon']) ? (string)$o['pon'] : '');
            $onu = isset($o['onu_number']) ? (string)$o['onu_number'] : (isset($o['onu_id']) ? (string)$o['onu_id'] : '');
            if (strpos($onu, ':') !== false) { $x = explode(':', $onu, 2); $pon = $x[0]; $onu = $x[1]; }
            $k = $pon . ':' . $onu; $registered[$k] = strtoupper(preg_replace('/[^0-9A-F]/i','',(string)($o['mac'] ?? '')));
        }
        $out = array(); $seen = array();
        foreach ($rows as $r) {
            $pon=(string)($r['pon']??''); $onu=(string)($r['onu_id']??''); if ($pon===''||$onu==='') continue; $key=$pon.':'.$onu;
            $mac=(string)($r['mac']??''); $hex=strtoupper(preg_replace('/[^0-9A-F]/i','',$mac));
            if (isset($registered[$key]) && $registered[$key] !== '' && $registered[$key] === $hex) continue;
            $dedupe=$key.'/'.$hex.'/'.intval($r['vlan_id']??0); if(isset($seen[$dedupe]))continue; $seen[$dedupe]=true;
            if(!isset($out[$key]))$out[$key]=array();
            $out[$key][]=array('mac'=>$mac,'vlan'=>intval($r['vlan_id']??0),'vlan_id'=>intval($r['vlan_id']??0),'type'=>$r['mac_type']??'dynamic','source'=>$r['source']??'bdcom');
        }
        return $out;
    }

    private function bdcomMacFromDecimalSuffix($bytes) {
        if (count($bytes) !== 6) return null; $hex=array(); foreach($bytes as $b){$n=intval($b);if($n<0||$n>255)return null;$hex[]=sprintf('%02X',$n);} return implode(':',$hex);
    }
    private function bdcomMacRow($pon,$onu,$mac,$vlan,$port,$source,$entry) {
        return array('pon'=>(string)intval($pon),'onu_id'=>(string)intval($onu),'mac'=>$mac,'vlan_id'=>max(0,min(4094,intval($vlan))),'mac_type'=>'dynamic','port_id'=>$port,'source'=>$source,'entry_key'=>strtolower(intval($pon).'/'.intval($onu).'/'.$source.'/'.$entry.'/'.str_replace(':','',$mac).'/'.intval($vlan)));
    }
    private function validBdcomClientMac($mac) {
        $hex=strtoupper(preg_replace('/[^0-9A-F]/i','',(string)$mac)); if(strlen($hex)!==12||$hex==='000000000000'||$hex==='FFFFFFFFFFFF')return false; return (hexdec(substr($hex,0,2)) & 1)===0;
    }
    private function dedupeBdcomMacRows($rows) {
        $out=array(); foreach($rows as $r){$k=(string)($r['entry_key']??strtolower(($r['pon']??'').'/'.($r['onu_id']??'').'/'.($r['mac']??'').'/'.($r['vlan_id']??0)));$out[$k]=$r;} return array_values($out);
    }
    private function normalizeBdcomMac($mac){$h=strtoupper(preg_replace('/[^0-9A-F]/i','',(string)$mac));return strlen($h)===12?implode(':',str_split($h,2)):strtoupper(trim((string)$mac));}
}
