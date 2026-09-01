<?php
use RouterOS\Client;
use RouterOS\Query;

// Mikrotik Wrapper - RE-SYNC TRIGGERED
class MikrotikApp {
    private $client;
    public $error;
    public function __construct($r, $timeout = 5) {
        if(class_exists('RouterOS\Client')) {
            try { 
                $this->client = new Client([
                    'host' => $r['ip_address'], 
                    'user' => $r['username'], 
                    'pass' => $r['api_password'], 
                    'port' => (int)$r['port'], 
                    'ssl' => (bool)$r['use_ssl'], 
                    'timeout' => $timeout,
                    'attempts' => 1
                ]); 
            } catch(Exception $e) { 
                $this->error = $e->getMessage(); 
            }
        }
    }
    
    public function getClient() {
        return $this->client;
    }
    
    public function isOnline() {
        if(!$this->client) return false;
        try { 
            $this->client->query(new Query('/system/identity/print'))->read(); 
            return true; 
        } catch (Exception $e) { 
            return false; 
        }
    }
    
    public function toggle($user, $enable, $profile, $password = false) {
        if(!$this->client) return false;
        try {
            // Speed optimization: Skip print check if possible, or just be very quick
            $q = new Query('/ppp/secret/print'); 
            $q->where('name', $user);
            $exist = $this->client->query($q)->read();
            
            if ($password !== false) {
                $pass = ($password !== null) ? $password : '';
                
                // Compare database password with MikroTik password to log mismatches
                if (!empty($exist)) {
                    $mt_pass = isset($exist[0]['password']) ? $exist[0]['password'] : '';
                    if ($pass !== $mt_pass) {
                        global $pdo;
                        if (isset($pdo) && function_exists('writeLog')) {
                            $admin = $_SESSION['admin_username'] ?? 'System';
                            $target = 0;
                            try {
                                $user_rec = safeFetch($pdo, "SELECT id FROM " . TBL_USERS . " WHERE user_id = ?", [$user]);
                                if ($user_rec) {
                                    $target = $user_rec['id'];
                                }
                            } catch (Exception $e) {}
                            
                            writeLog($pdo, $admin, 'Password Mismatch', $target, "Password mismatch for client {$user}: Database has '{$pass}', MikroTik has '{$mt_pass}'.");
                        }
                    } else {
                        global $pdo;
                        if (isset($pdo)) {
                            try {
                                $user_rec = safeFetch($pdo, "SELECT id FROM " . TBL_USERS . " WHERE user_id = ?", [$user]);
                                if ($user_rec) {
                                    $user_id_val = $user_rec['id'];
                                    $pdo->prepare("UPDATE " . TBL_LOGS . " SET description = CONCAT(description, ' (Solved)') WHERE target_id = ? AND action_type = 'Password Mismatch' AND description NOT LIKE '%(Solved)%'")->execute([$user_id_val]);
                                }
                            } catch (Exception $e) {}
                        }
                    }
                }
            } else {
                $pass = $user;
            }
            
            if(empty($exist)) {
                $q = new Query('/ppp/secret/add');
                $q->equal('name',$user)->equal('password',$pass)->equal('service','pppoe')->equal('profile',$profile);
                $q->equal('disabled', $enable ? 'no' : 'yes');
                $this->client->query($q)->read();
            } else {
                $q = new Query('/ppp/secret/set');
                $q->equal('.id',$exist[0]['.id'])->equal('disabled', $enable?'no':'yes');
                if (!empty($profile)) { $q->equal('profile',$profile); }
                if ($password !== false) {
                    $set_pass = ($password !== null) ? $password : '';
                    $q->equal('password', $set_pass);
                }
                $this->client->query($q)->read();
            } 
            
            // Disconnect active session(s) to force profile change or kick disabled user
            $q_act = new Query('/ppp/active/print'); 
            $q_act->where('name', $user);
            $act_list = $this->client->query($q_act)->read();
            if(!empty($act_list) && is_array($act_list)) {
                foreach($act_list as $act_item) {
                    if(isset($act_item['.id'])) {
                        $this->client->query((new Query('/ppp/active/remove'))->equal('.id', $act_item['.id']))->read();
                    }
                }
            }
            return true;
        } catch(Exception $e) { 
            $this->error = $e->getMessage(); 
            return false; 
        }
    }
    
    public function renamePppoe($old_user, $new_user) {
        if(!$this->client || empty($old_user) || empty($new_user) || $old_user === $new_user) return false;
        try {
            $q = new Query('/ppp/secret/print'); 
            $q->where('name', $old_user);
            $exist = $this->client->query($q)->read();
            if(!empty($exist)) {
                $this->client->query((new Query('/ppp/secret/set'))->equal('.id',$exist[0]['.id'])->equal('name', $new_user))->read();
                
                // Disconnect active session of the old user so they reconnect with the new ID
                $q_act = new Query('/ppp/active/print');
                $q_act->where('name', $old_user);
                $act = $this->client->query($q_act)->read();
                if(!empty($act)) {
                    $this->client->query((new Query('/ppp/active/remove'))->equal('.id',$act[0]['.id']))->read();
                }
                return true;
            }
            return false;
        } catch(Exception $e) {
            $this->error = $e->getMessage();
            return false;
        }
    }

    public function removePppoe($user) {
        if(!$this->client || empty($user)) return false;
        try {
            $q = new Query('/ppp/secret/print'); 
            $q->where('name', $user);
            $exist = $this->client->query($q)->read();
            if(!empty($exist)) {
                $this->client->query((new Query('/ppp/secret/remove'))->equal('.id', $exist[0]['.id']))->read();
                $q_act = new Query('/ppp/active/print');
                $q_act->where('name', $user);
                $act_list = $this->client->query($q_act)->read();
                if(!empty($act_list) && is_array($act_list)) {
                    foreach($act_list as $act_item) {
                        if(isset($act_item['.id'])) {
                            $this->client->query((new Query('/ppp/active/remove'))->equal('.id', $act_item['.id']))->read();
                        }
                    }
                }
                return true;
            }
            return false;
        } catch(Exception $e) {
            $this->error = $e->getMessage();
            return false;
        }
    }

    public function executeScript($script) {
        if (!$this->client) return false;
        try {
            return $this->client->query((new Query('/system/script/execute-script'))->equal('source', $script))->read();
        } catch (Exception $e) {
            $this->error = $e->getMessage();
            return false;
        }
    }
    
    public function getOnlineUsers() {
        if(!$this->client) return [];
        try {
            $sessions = $this->client->query(new Query('/ppp/active/print'))->read();
            if (!is_array($sessions)) return [];
            
            // Check if we need to fetch interface bytes fallback (only if bytes-in key is missing)
            $need_fallback = false;
            if (!empty($sessions)) {
                $first = $sessions[0];
                if (!isset($first['bytes-in']) && !isset($first['bytes-out'])) {
                    $need_fallback = true;
                }
            }
            
            if ($need_fallback) {
                try {
                    $iface_q = new Query('/interface/print');
                    $iface_q->add('=stats=');
                    $interfaces = $this->client->query($iface_q)->read();
                    
                    if (is_array($interfaces)) {
                        $iface_map = [];
                        foreach ($interfaces as $if) {
                            if (isset($if['name'])) {
                                $rx = (float)($if['rx-byte'] ?? $if['rx-bytes'] ?? $if['rx_byte'] ?? 0);
                                $tx = (float)($if['tx-byte'] ?? $if['tx-bytes'] ?? $if['tx_byte'] ?? 0);
                                $iface_map[strtolower($if['name'])] = ['rx' => $rx, 'tx' => $tx];
                            }
                        }
                        
                        foreach ($sessions as &$s) {
                            if (isset($s['name'])) {
                                $username = strtolower($s['name']);
                                $possible_names = [
                                    "<pppoe-{$username}>",
                                    "pppoe-{$username}",
                                    $username
                                ];
                                
                                foreach ($possible_names as $p_name) {
                                    if (isset($iface_map[$p_name])) {
                                        $s['bytes-in'] = $iface_map[$p_name]['rx'];
                                        $s['bytes-out'] = $iface_map[$p_name]['tx'];
                                        break; // Found matching interface
                                    }
                                }
                            }
                        }
                    }
                } catch (Exception $ex) {
                    // Fail silently and return sessions as is
                }
            }
            
            return $sessions;
        } catch(Exception $e) {
            return [];
        }
    }

    public function stats($user) {
        $res = ['online'=>false, 'ip'=>'', 'mac'=>''];
        if(!$this->client) return $res;
        
        try {
            // Method 1: Check PPP active
            $q = new Query('/ppp/active/print'); 
            $q->where('name', $user);
            $act = $this->client->query($q)->read();
            
            if(!empty($act) && is_array($act)) { 
                $res['online'] = true; 
                $res['ip'] = $act[0]['address']??''; 
                $res['mac'] = $act[0]['caller-id']??''; 
            } else {
                // Method 2: Check DHCP leases - ONLY if no PPP session
                $q = new Query('/ip/dhcp-server/lease/print');
                $q->where('host-name', $user);
                $leases = $this->client->query($q)->read();
                
                if(!empty($leases) && is_array($leases)) {
                    $is_bound = ($leases[0]['status'] ?? '') === 'bound';
                    $res['online'] = $is_bound;
                    $res['ip'] = $leases[0]['address'] ?? '';
                    $res['mac'] = $leases[0]['mac-address'] ?? '';
                    if ($is_bound) $res['method'] = 'dhcp';
                }
                
                // Method 3: Static IP (Simple Queue) - Must check Address List or ARP by parsing queue target
                if (!$res['online']) {
                    $q = new Query('/queue/simple/print');
                    $q->where('name', $user);
                    $queues = $this->client->query($q)->read();
                    if (!empty($queues) && is_array($queues) && isset($queues[0]['target'])) {
                        $target_ip = explode('/', $queues[0]['target'])[0];
                        if ($target_ip && filter_var($target_ip, FILTER_VALIDATE_IP)) {
                            // Check ARP
                            $q_arp = new Query('/ip/arp/print');
                            $q_arp->where('address', $target_ip);
                            $arp = $this->client->query($q_arp)->read();
                            if (!empty($arp) && is_array($arp)) {
                                $res['online'] = true;
                                $res['ip'] = $target_ip;
                                $res['mac'] = $arp[0]['mac-address'] ?? '';
                                $res['method'] = 'static_arp';
                            }
                        }
                    }
                }
            }
        } catch(Exception $e) {
            // Silent error
        }
        return $res;
    }
    
    // --- UPDATED TRAFFIC METHOD ---
    public function traffic($user, $strict = false) {
        $rx = 0; $tx = 0;
        if(!$this->client) return $strict ? ['up_speed'=>0, 'down_speed'=>0, 'status'=>'offline'] : $this->generateDemoTraffic();
        
        try {
            $possible_names = [];
            
            // 0. Get Reliability Online Status first
            $real_stats = $this->stats($user);
            $is_really_online = $real_stats['online'] ?? false;
            
            $session_stats = ['uptime' => '0:00:00', 'bytes_in' => 0, 'bytes_out' => 0];
            $q = new Query('/ppp/active/print'); 
            $q->where('name', $user);
            $act = $this->client->query($q)->read();
            if(!empty($act) && is_array($act)) {
                $session_stats['uptime'] = $act[0]['uptime'] ?? '0:00:00';
                $session_stats['bytes_in'] = (float)($act[0]['bytes-in'] ?? 0);
                $session_stats['bytes_out'] = (float)($act[0]['bytes-out'] ?? 0);
                if (isset($act[0]['interface'])) {
                    $possible_names[] = $act[0]['interface'];
                }
            }
            
            // 2. Common naming patterns
            $possible_names[] = "<pppoe-$user>";
            $possible_names[] = "pppoe-$user";
            $possible_names[] = $user;
            
            foreach (array_unique($possible_names) as $iface) {
                try {
                    $q = new Query('/interface/monitor-traffic');
                    $q->equal('interface', $iface);
                    $q->equal('once');
                    $stats = $this->client->query($q)->read();
                    
                    if(!empty($stats) && is_array($stats) && isset($stats[0]) && !isset($stats[0]['!trap'])) {
                        $rx = $stats[0]['rx-bits-per-second'] ?? ($stats[0]['rx-rate'] ?? 0);
                        $tx = $stats[0]['tx-bits-per-second'] ?? ($stats[0]['tx-rate'] ?? 0);
                        if ($rx > 0 || $tx > 0) {
                            return array_merge($session_stats, [
                                'up_speed' => round((float)$rx / 1000000, 2), // RX from client = Upload
                                'down_speed' => round((float)$tx / 1000000, 2), // TX to client = Download
                                'status' => $is_really_online ? 'online' : 'offline', // Use Real Status
                                'iface' => $iface,
                                'mac' => $real_stats['mac'] ?? '',
                                'ip' => $real_stats['ip'] ?? ''
                            ]);
                        }
                    }
                } catch(Exception $e) {}
            }
 
            // 3. Fallback to Simple Queues
            $q = new Query('/queue/simple/print');
            $q->where('name', $user);
            $queues = $this->client->query($q)->read();
            if (!empty($queues) && is_array($queues) && isset($queues[0]['rate'])) {
                $rates = explode('/', $queues[0]['rate']);
                if (count($rates) == 2) {
                    // Simple Queue rate format is "upload/download" (usually)
                    // But in Mikrotik /queue/simple, 'rate' field is "upload/download" in bits/s
                    return array_merge($session_stats, [
                        'up_speed' => round((float)$rates[0] / 1000000, 2),
                        'down_speed' => round((float)$rates[1] / 1000000, 2),
                        'status' => $is_really_online ? 'online' : 'offline', // Use Real Status
                        'method' => 'simple_queue',
                        'mac' => $real_stats['mac'] ?? '',
                        'ip' => $real_stats['ip'] ?? ''
                    ]);
                }
            }
            
            return array_merge($session_stats, ['up_speed' => 0, 'down_speed' => 0, 'status' => $is_really_online ? 'online' : 'offline', 'msg' => 'no_traffic', 'mac' => $real_stats['mac'] ?? '', 'ip' => $real_stats['ip'] ?? '']);
            
        } catch(Exception $e) {
            return ['up_speed' => 0, 'down_speed' => 0, 'status' => 'error', 'msg' => $e->getMessage(), 'mac' => ''];
        }
    }
    
    private function generateDemoTraffic() {
        static $demo_rx = 5.0;
        static $demo_tx = 2.0;
        $demo_rx += (rand(-100, 100) / 1000);
        $demo_tx += (rand(-50, 50) / 1000);
        $demo_rx = max(0.1, min(20.0, $demo_rx));
        $demo_tx = max(0.1, min(10.0, $demo_tx));
        return [
            'up_speed' => round($demo_tx, 2),
            'down_speed' => round($demo_rx, 2),
            'uptime' => '1d 02:30:45',
            'bytes_in' => 1234567,
            'bytes_out' => 7654321,
            'status' => 'demo'
        ];
    }
    
    public function getAllActive() {
        if(!$this->client) return [];
        
        try {
            $sessions = $this->client->query(new Query('/ppp/active/print'))->read();
            if (!is_array($sessions)) return [];
            
            $need_fallback = false;
            if (!empty($sessions)) {
                $first = $sessions[0];
                if (!isset($first['bytes-in']) || (float)$first['bytes-in'] == 0) {
                    $need_fallback = true;
                }
            }
            
            $iface_map = [];
            if ($need_fallback) {
                try {
                    $iface_q = new Query('/interface/print');
                    $iface_q->add('=stats=');
                    $interfaces = $this->client->query($iface_q)->read();
                    if (is_array($interfaces)) {
                        foreach ($interfaces as $if) {
                            if (isset($if['name'])) {
                                $rx = (float)($if['rx-byte'] ?? $if['rx-bytes'] ?? $if['rx_byte'] ?? 0);
                                $tx = (float)($if['tx-byte'] ?? $if['tx-bytes'] ?? $if['tx_byte'] ?? 0);
                                $iface_map[strtolower($if['name'])] = ['rx' => $rx, 'tx' => $tx];
                            }
                        }
                    }
                } catch (Exception $ex) {}
            }
            
            $res = [];
            foreach($sessions as $s) {
                if(isset($s['name'])) {
                    $username = $s['name'];
                    $username_lower = strtolower($username);
                    
                    $upload = 0;
                    $download = 0;
                    
                    if (isset($s['bytes-in']) && (float)$s['bytes-in'] > 0) {
                        $upload = (float)$s['bytes-in'];
                        $download = (float)$s['bytes-out'];
                    } else if (!empty($iface_map)) {
                        $possible_names = [
                            "<pppoe-{$username_lower}>",
                            "pppoe-{$username_lower}",
                            $username_lower
                        ];
                        foreach ($possible_names as $p_name) {
                            if (isset($iface_map[$p_name])) {
                                $upload = $iface_map[$p_name]['rx'];
                                $download = $iface_map[$p_name]['tx'];
                                break;
                            }
                        }
                    }
                    
                    $res[$username] = [
                        'ip' => $s['address'] ?? '',
                        'mac' => $s['caller-id'] ?? '',
                        'uptime' => $s['uptime'] ?? '',
                        'upload' => $upload,
                        'download' => $download
                    ];
                }
            }
            return $res;
        } catch (Exception $e) { 
            return []; 
        }
    }

    public function getSecrets() {
        if(!$this->client) return [];
        try {
            $q = new Query('/ppp/secret/print');
            $res = $this->client->query($q)->read();
            return is_array($res) ? $res : [];
        } catch (Exception $e) {
            return [];
        }
    }

    public static function parseUptime($uptime) {
        $total_seconds = 0;
        // Handle weeks, days, hours, minutes, seconds with suffixes
        if (preg_match_all('/(\d+)([wdhms])/', $uptime, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $val = (int)$match[1];
                switch ($match[2]) {
                    case 'w': $total_seconds += $val * 604800; break;
                    case 'd': $total_seconds += $val * 86400; break;
                    case 'h': $total_seconds += $val * 3600; break;
                    case 'm': $total_seconds += $val * 60; break;
                    case 's': $total_seconds += $val; break;
                }
            }
        }
        // Handle HH:MM:SS or MM:SS format (even mixed with suffixes like 2d03:04:05)
        if (preg_match('/(?:(\d+):)?(\d+):(\d+)$/', $uptime, $m)) {
            $h = isset($m[1]) ? (int)$m[1] : 0;
            $i = (int)$m[2];
            $s = (int)$m[3];
            $total_seconds += ($h * 3600) + ($i * 60) + $s;
        }
        return $total_seconds;
    }

    public function ping($target, $count = 4) {
        if(!$this->client) return "Router connection error.";
        try {
            $q = new Query('/ping');
            $q->equal('address', (string)$target);
            $q->equal('count', (string)$count);
            return $this->client->query($q)->read();
        } catch(Exception $e) {
            return "Ping Error: " . $e->getMessage();
        }
    }

    public function traceroute($target) {
        if(!$this->client) return "Router connection error.";
        try {
            $q = new Query('/tool/traceroute');
            $q->equal('address', (string)$target);
            $q->equal('count', '1'); // Perform one pass
            return $this->client->query($q)->read();
        } catch(Exception $e) {
            return "Trace Error: " . $e->getMessage();
        }
    }

    public function syncSession($pdo, $client_id, $router_id, $username, $bytes_in, $bytes_out, $uptime_str) {
        $uptime_secs = self::parseUptime($uptime_str);
        $now_dt = date('Y-m-d H:i:s');
        $started_at_ts = time() - $uptime_secs;
        $started_at_dt = date('Y-m-d H:i:s', $started_at_ts);
        
        try {
            // Use a broader check for active session: same user and router
            $stmt = $pdo->prepare("SELECT * FROM ".TBL_SESSIONS." WHERE client_id = ? AND router_id = ? AND status = 'active' LIMIT 1");
            $stmt->execute([$client_id, $router_id]);
            $existing = $stmt->fetch();
            
            if ($existing) {
                // Detect reconnect: uptime reset or bytes counter decreased significantly
                $recorded_uptime = time() - strtotime($existing['started_at']);
                $bytes_decreased  = ($bytes_in < ((float)$existing['last_rx_bytes'] - 1000000));
                $uptime_reset     = ($uptime_secs < ($recorded_uptime - 120));
                
                if ($bytes_decreased || $uptime_reset) {
                    // RECONNECT DETECTED: Save final totals and close old session
                    $final_rx = max(0, (float)$existing['last_rx_bytes'] - (float)$existing['start_rx_bytes']);
                    $final_tx = max(0, (float)$existing['last_tx_bytes'] - (float)$existing['start_tx_bytes']);
                    $pdo->prepare("UPDATE ".TBL_SESSIONS." SET 
                            status = 'closed', 
                            ended_at = ?,
                            total_rx_bytes = ?,
                            total_tx_bytes = ?,
                            last_updated = CURRENT_TIMESTAMP
                        WHERE id = ?")
                        ->execute([$now_dt, $final_rx, $final_tx, $existing['id']]);
                    $existing = null; // Create a new session below
                }
            }
            
            if ($existing) {
                // UPDATE EXISTING SESSION — accumulate increments only
                $rx_inc = max(0, (float)$bytes_in  - (float)$existing['last_rx_bytes']);
                $tx_inc = max(0, (float)$bytes_out - (float)$existing['last_tx_bytes']);
                
                $pdo->prepare("UPDATE ".TBL_SESSIONS." SET 
                        last_rx_bytes = ?, 
                        last_tx_bytes = ?, 
                        last_updated = CURRENT_TIMESTAMP 
                    WHERE id = ?")
                    ->execute([$bytes_in, $bytes_out, $existing['id']]);
                
                // Only count increments in daily (not full session bytes)
                if ($rx_inc > 0 || $tx_inc > 0) {
                    $pdo->prepare("INSERT INTO ".TBL_DAILY_TRAFFIC." (client_id, traffic_date, rx_bytes, tx_bytes) 
                                   VALUES (?, CURDATE(), ?, ?) 
                                   ON DUPLICATE KEY UPDATE rx_bytes = rx_bytes + ?, tx_bytes = tx_bytes + ?")
                        ->execute([$client_id, $rx_inc, $tx_inc, $rx_inc, $tx_inc]);
                }
                return $existing['id'];
            } else {
                // NEW SESSION: store current MikroTik byte-counter as start baseline
                // Session usage shown to user = last_rx_bytes - start_rx_bytes (starts from 0)
                $session_key = hash('sha256', $username . "_" . $router_id . "_" . $started_at_dt . "_" . uniqid());
                $pdo->prepare("INSERT INTO ".TBL_SESSIONS." 
                    (client_id, mikrotik_username, router_id, session_key, 
                     start_rx_bytes, start_tx_bytes, last_rx_bytes, last_tx_bytes, 
                     started_at, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')")
                    ->execute([
                        $client_id, $username, $router_id, $session_key,
                        $bytes_in, $bytes_out,  // start = current counter (usage = 0 at start)
                        $bytes_in, $bytes_out,  // last = same as start initially
                        $started_at_dt
                    ]);
                // Do NOT add to daily_traffic on new session start (no usage yet)
                return $pdo->lastInsertId();
            }
        } catch (Exception $e) {
            error_log("Session Sync Error: " . $e->getMessage());
            return false;
        }
    }
}
