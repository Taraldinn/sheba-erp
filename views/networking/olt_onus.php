<?php
// OLT ONU List & Dashboard View
require_once __DIR__ . '/../../classes/OLTManager.php';
$oltMgr = new OLTManager($pdo);

$id = $_GET['id'] ?? 0;
$refresh = isset($_GET['refresh']) && $_GET['refresh'] == 1;
$olt = $oltMgr->getOLT($id);

$current_staff_id = $_SESSION['admin_id'] ?? 0;
$is_admin = hasRole('Admin');

if (!$olt || (!$is_admin && $olt['staff_id'] != $current_staff_id)) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm glass-card'><i class='fas fa-exclamation-triangle me-2'></i> OLT Not Found or Access Denied</div></div>";
    return;
}

// Fetch Data — OLTManager handles connectivity check + cache fallback internally
$is_olt_online = true;
if ($refresh && function_exists('get_global_online_users')) {
    try {
        get_global_online_users($pdo, true);
    } catch (Exception $e) {
        // Silence router connection errors
    }
}
$onus = $oltMgr->getConnectedONUs($id, $refresh);
$error = isset($onus['error']) ? $onus['error'] : null;
// If we got an error AND a refresh was requested, OLT is likely offline
if ($error && $refresh) {
    $is_olt_online = false;
}
// If we got an error but NOT refreshing (cache existed), it means OLT is offline but we have cache
if ($error && !$refresh && !is_array($onus)) {
    $is_olt_online = false;
}

// Load client MAC mappings from database and cache for live / ONU MAC matching
$macMap = [];
if (!$error && is_array($onus)) {
    try {
        $usersByUserId = [];
        $client_stmt = $pdo->query("SELECT id, user_id, name, onu_mac FROM users");
        while ($row = $client_stmt->fetch(PDO::FETCH_ASSOC)) {
            if (!empty($row['user_id'])) {
                $usersByUserId[strtolower(trim($row['user_id']))] = $row;
            }
            if (!empty($row['onu_mac'])) {
                $cleanMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $row['onu_mac']));
                if ($cleanMac) {
                    $macMap[$cleanMac] = $row;
                }
            }
        }

        // Map live MACs from active PPPoE sessions
        $cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../../cache/global_online.json';
        if (file_exists($cache_file)) {
            $cache_raw = json_decode(file_get_contents($cache_file), true);
            $online_users = isset($cache_raw['data']) ? $cache_raw['data'] : $cache_raw;
            if (is_array($online_users)) {
                foreach ($online_users as $username => $session) {
                    $caller_id = $session['caller_id'] ?? '';
                    if ($caller_id) {
                        $cleanLiveMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $caller_id));
                        if ($cleanLiveMac) {
                            $lowerUsername = strtolower(trim($username));
                            if (isset($usersByUserId[$lowerUsername])) {
                                $macMap[$cleanLiveMac] = $usersByUserId[$lowerUsername];
                            } else {
                                $baseUsername = strtolower(trim(explode('@', $username)[0]));
                                if (isset($usersByUserId[$baseUsername])) {
                                    $macMap[$cleanLiveMac] = $usersByUserId[$baseUsername];
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (Exception $e) {
        // Silence potential database or cache issues
    }

    // DEBUG LOGGING START
    try {
        $logData = [
            'timestamp' => date('Y-m-d H:i:s'),
            'macMapKeys' => array_keys($macMap),
            'onus_matching' => []
        ];
        foreach ($onus as $onu) {
            $onu_debug = [
                'interface' => $onu['interface'],
                'mac' => $onu['mac'],
                'mactable' => $onu['mactable'] ?? [],
                'matched' => []
            ];
            
            $cleanOnuMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $onu['mac']));
            if (isset($macMap[$cleanOnuMac])) {
                $onu_debug['matched'][] = [
                    'source' => 'onu_mac',
                    'mac' => $cleanOnuMac,
                    'user' => $macMap[$cleanOnuMac]['user_id']
                ];
            }
            
            if (!empty($onu['mactable']) && is_array($onu['mactable'])) {
                foreach ($onu['mactable'] as $mObj) {
                    $bridgedMac = $mObj['mac'] ?? '';
                    $cleanBridgedMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $bridgedMac));
                    if ($cleanBridgedMac && isset($macMap[$cleanBridgedMac])) {
                        $onu_debug['matched'][] = [
                            'source' => 'bridged_mac',
                            'mac' => $cleanBridgedMac,
                            'user' => $macMap[$cleanBridgedMac]['user_id']
                        ];
                    }
                }
            }
            $logData['onus_matching'][] = $onu_debug;
        }
        file_put_contents(__DIR__ . '/../../debug_match.log', json_encode($logData, JSON_PRETTY_PRINT) . "\n", FILE_APPEND);
    } catch (Exception $e) {
        // Safe silence
    }
    // DEBUG LOGGING END
}

// Calculate Stats
$stats = [
    'total' => 0,
    'online' => 0,
    'offline' => 0,
    'ports' => [],
    'alerts' => []
];

if (!$error && is_array($onus)) {
    $stats['total'] = count($onus);
    foreach ($onus as $onu) {
        $online = ($onu['state'] === 'Connect');
        if ($online) {
            $stats['online']++;
            
            // Low signal check (-25 to -40 dBm)
            $rx_power = $onu['rx_power'] ?? 'N/A';
            if ($rx_power !== 'N/A' && $rx_power !== '') {
                $rx_num = floatval(preg_replace('/[^0-9.-]/', '', $rx_power));
                if ($rx_num <= -25 && $rx_num >= -40) {
                    $stats['alerts'][] = [
                        'type' => 'low_signal',
                        'msg' => "ONU {$onu['interface']} has low signal: {$rx_power} dBm",
                        'mac' => $onu['mac']
                    ];
                }
            }
        } else {
            $stats['offline']++;
            $stats['alerts'][] = ['type' => 'offline', 'msg' => "ONU {$onu['interface']} went Offline", 'mac' => $onu['mac']];
        }
        
        // Extract PON Port (e.g. EPON0/1:2 -> "1" or "0/1", or VSOL "1:3" -> "1")
        if (preg_match('/^(?:epon|gpon)?\s?\d*\/(\d+):/i', $onu['interface'], $m)) {
            $port = $m[1];
        } elseif (preg_match('/^(\d+):/', $onu['interface'], $m)) {
            $port = $m[1];
        } else {
            $port = '1';
        }
        
        if (!isset($stats['ports'][$port])) {
            $stats['ports'][$port] = ['total' => 0, 'online' => 0, 'offline' => 0];
        }
        $stats['ports'][$port]['total']++;
        if ($online) {
            $stats['ports'][$port]['online']++;
        } else {
            $stats['ports'][$port]['offline']++;
        }
    }
}
ksort($stats['ports']);
?>

<style>
.glass-card {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
    border-radius: 12px;
}
.glass-header {
    background: linear-gradient(135deg, rgba(37, 117, 252, 0.1) 0%, rgba(106, 17, 203, 0.05) 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}
.stat-card {
    transition: transform 0.2s, box-shadow 0.2s;
    border-radius: 12px;
}
.stat-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 18px rgba(0,0,0,0.08) !important;
}
.port-badge {
    transition: background-color 0.2s, transform 0.2s;
    cursor: pointer;
}
.port-badge:hover {
    transform: scale(1.05);
}
.details-row {
    background-color: rgba(248, 250, 252, 0.6) !important;
}
.onu-row {
    cursor: pointer;
    transition: background-color 0.2s;
}
.onu-row:hover {
    background-color: rgba(241, 245, 249, 0.6) !important;
}
.text-high-contrast {
    color: #0f172a !important; /* Extremely readable dark slate */
}
.text-high-contrast-muted {
    color: #475569 !important; /* Readable dark grey */
}
</style>

<div class="container-fluid px-2 px-sm-4 py-3">
    <!-- Header -->
    <div class="mb-4 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
        <div>
            <a href="index.php?tab=olt" class="text-decoration-none text-high-contrast-muted small fw-bold"><i class="fas fa-arrow-left me-1"></i> Back to OLTs</a>
            <h3 class="mt-1 mb-0 fw-bold text-high-contrast"><i class="fas fa-server text-primary me-2"></i> <?= htmlspecialchars($olt['name']) ?> Dashboard</h3>
            <small class="text-high-contrast-muted">IP Address: <strong><?= $olt['ip'] ?></strong> | Brand: <strong><?= strtoupper(str_replace('_', ' ', $olt['brand'])) ?></strong> | Last Synced: <span class="badge bg-light text-dark border"><i class="fas fa-history text-secondary me-1"></i> <?= !empty($olt['last_sync']) ? date('Y-m-d h:i:s A', strtotime($olt['last_sync'])) : 'Never' ?></span></small>
        </div>
        <div>
            <a href="index.php?tab=olt_onus&id=<?= (int)$id ?>&refresh=1"
               class="btn btn-primary px-4 py-2 shadow-sm fw-bold w-100 text-center"
               id="refreshOltBtn">
                <i class="fas fa-sync-alt me-2"></i> Refresh OLT Data
            </a>
        </div>
    </div>

    <?php if ($error): 
        $is_web = ($olt['mode'] ?? 'telnet') === 'web';
        $mode_title = $is_web ? 'Web' : 'Telnet';
        $port_label = $is_web ? 'Web Port, Protocol' : 'Telnet Port';
    ?>
        <div class="alert alert-danger shadow-sm glass-card border-0 p-4">
            <h5 class="alert-heading fw-bold"><i class="fas fa-exclamation-triangle me-2"></i> OLT <?= htmlspecialchars($mode_title) ?> Connection Failed</h5>
            <p class="mb-0 text-high-contrast">Error: <?= htmlspecialchars($error) ?></p>
            <hr class="my-3">
            <small class="text-high-contrast-muted">Ensure the OLT is powered on, connected to the internet, and that the <?= htmlspecialchars($port_label) ?>, Username, and Password are configured correctly in the OLT Edit tab.</small>
        </div>
    <?php else: ?>

        <?php if (!$is_olt_online): ?>
            <div class="alert alert-warning shadow-sm glass-card border-start border-5 border-warning p-3 mb-4 animate__animated animate__fadeIn">
                <div class="d-flex align-items-center">
                    <i class="fas fa-exclamation-triangle text-warning fs-4 me-3"></i>
                    <div>
                        <h6 class="alert-heading fw-bold mb-1 text-high-contrast">OLT is Offline / Unreachable</h6>
                        <span class="text-high-contrast-muted small">Could not establish Telnet link. Showing last synchronized data from <strong><?= !empty($olt['last_sync']) ? date('Y-m-d h:i:s A', strtotime($olt['last_sync'])) : 'N/A' ?></strong>. Real-time statistics are currently unavailable.</span>
                    </div>
                </div>
            </div>
        <?php endif; ?>

        <!-- Stats Cards -->
        <div class="row g-3 mb-4">
            <!-- Total -->
            <div class="col-6 col-md-3">
                <div class="card stat-card border-0 shadow-sm h-100 border-start border-5 border-primary glass-card">
                    <div class="card-body py-3">
                        <div class="text-uppercase text-high-contrast-muted small fw-bold mb-1">Total ONUs</div>
                        <div class="h2 fw-bold mb-0 text-high-contrast"><?= $stats['total'] ?></div>
                        <small class="text-high-contrast-muted"><i class="fas fa-info-circle me-1"></i> Registered devices</small>
                    </div>
                </div>
            </div>
            <!-- Online -->
            <div class="col-6 col-md-3">
                <div class="card stat-card border-0 shadow-sm h-100 border-start border-5 border-success glass-card">
                    <div class="card-body py-3">
                        <div class="text-uppercase text-high-contrast-muted small fw-bold mb-1">Online</div>
                        <div class="h2 fw-bold mb-0 text-success"><?= $stats['online'] ?></div>
                        <div class="progress mt-2" style="height: 6px; border-radius: 4px;">
                            <div class="progress-bar bg-success" style="width: <?= ($stats['total']>0) ? ($stats['online']/$stats['total']*100) : 0 ?>%"></div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Offline -->
            <div class="col-6 col-md-3">
                <div class="card stat-card border-0 shadow-sm h-100 border-start border-5 border-danger glass-card">
                    <div class="card-body py-3">
                        <div class="text-uppercase text-high-contrast-muted small fw-bold mb-1">Offline</div>
                        <div class="h2 fw-bold mb-0 text-danger"><?= $stats['offline'] ?></div>
                        <div class="progress mt-2" style="height: 6px; border-radius: 4px;">
                            <div class="progress-bar bg-danger" style="width: <?= ($stats['total']>0) ? ($stats['offline']/$stats['total']*100) : 0 ?>%"></div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Active Ports -->
            <div class="col-6 col-md-3">
                <div class="card stat-card border-0 shadow-sm h-100 border-start border-5 border-info glass-card">
                    <div class="card-body py-3">
                        <div class="text-uppercase text-high-contrast-muted small fw-bold mb-1">PON Ports</div>
                        <div class="h2 fw-bold mb-0 text-info"><?= count($stats['ports']) ?></div>
                        <small class="text-high-contrast-muted"><i class="fas fa-network-wired me-1"></i> Active PON interfaces</small>
                    </div>
                </div>
            </div>
        </div>

        <div class="row g-4">
            <!-- Port Breakdowns & Alerts -->
            <div class="col-lg-3">
                <!-- Port Selection Badges -->
                <div class="card shadow-sm border-0 glass-card mb-4">
                    <div class="card-header bg-transparent border-0 pt-3">
                        <h6 class="fw-bold text-high-contrast mb-0"><i class="fas fa-network-wired text-primary me-2"></i> PON Interface Distribution</h6>
                    </div>
                    <div class="card-body py-2">
                        <div class="d-flex flex-column gap-2" id="port-selection-list">
                            <button class="btn btn-sm btn-primary text-start border-2 w-100 px-3 py-2 rounded shadow-sm fw-bold active" data-port-filter="all">
                                <i class="fas fa-globe me-2"></i> Show All Ports
                                <span class="badge bg-white text-dark float-end"><?= $stats['total'] ?></span>
                            </button>
                            <?php foreach($stats['ports'] as $port => $pStats): ?>
                            <button class="btn btn-sm btn-outline-secondary text-start border-2 w-100 px-3 py-2 rounded fw-bold text-high-contrast" data-port-filter="<?= $port ?>">
                                <i class="fas fa-ethernet me-2 text-primary"></i> PON Port <?= $port ?>
                                <span class="badge bg-success float-end ms-1 text-white"><?= $pStats['online'] ?></span>
                                <span class="badge bg-secondary float-end text-white"><?= $pStats['total'] - $pStats['online'] ?></span>
                            </button>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>

                <!-- Recent Alerts -->
                <div class="card shadow-sm border-0 glass-card">
                    <div class="card-header bg-transparent border-0 pt-3 d-flex justify-content-between align-items-center">
                        <h6 class="fw-bold mb-0 text-high-contrast"><i class="fas fa-bell text-danger me-2"></i> Recent PON Alerts</h6>
                        <span class="badge bg-danger text-white rounded-pill"><?= count($stats['alerts']) ?></span>
                    </div>
                    <div class="card-body p-0" style="max-height: 280px; overflow-y: auto;">
                        <?php if(empty($stats['alerts'])): ?>
                            <div class="text-center py-4 text-high-contrast-muted">
                                <i class="fas fa-check-circle fa-2x text-success mb-2"></i><br>
                                <span class="small fw-bold">All Systems Normal</span>
                            </div>
                        <?php else: ?>
                            <div class="list-group list-group-flush">
                                <?php foreach($stats['alerts'] as $alert): 
                                    $border_color = ($alert['type'] === 'low_signal') ? 'border-warning' : 'border-danger';
                                    $text_style = ($alert['type'] === 'low_signal') ? 'color: #d97706; font-weight: bold;' : 'color: #dc3545; font-weight: bold;';
                                ?>
                                <div class="list-group-item border-start border-4 <?= $border_color ?> bg-light py-2">
                                    <div class="small text-truncate" style="<?= $text_style ?>" title="<?= htmlspecialchars($alert['msg']) ?>"><?= htmlspecialchars($alert['msg']) ?></div>
                                    <div class="font-monospace text-high-contrast-muted" style="font-size: 0.75rem;"><i class="fas fa-microchip"></i> MAC: <?= htmlspecialchars($alert['mac']) ?></div>
                                </div>
                                <?php endforeach; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <!-- ONU Details Table -->
            <div class="col-lg-9">
                <div class="card shadow-sm border-0 glass-card">
                    <div class="card-header bg-transparent border-0 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 pt-3">
                        <span class="fw-bold text-high-contrast h6 mb-0"><i class="fas fa-list me-2 text-secondary"></i> Active ONUs and Connected Interfaces</span>
                        <div class="d-flex flex-wrap gap-2 align-items-center w-100 w-md-auto">
                            <select id="stateFilter" class="form-select form-select-sm" style="border-radius: 20px; width: 130px; border-color: rgba(0,0,0,0.15);">
                                <option value="all">All States</option>
                                <option value="active">Active Only</option>
                                <option value="offline">Offline Only</option>
                            </select>
                            <input type="text" id="searchInput" class="form-control form-control-sm px-3 py-1.5" style="border-radius: 20px; min-width: 150px; flex-grow: 1;" placeholder="Search MAC, ID, or port...">
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0" id="onu-table" style="min-width: 750px;">
                            <thead class="table-light">
                                <tr class="text-high-contrast-muted small text-uppercase fw-bold">
                                    <th width="40"></th>
                                    <th>Interface</th>
                                    <th>MAC Address</th>
                                    <th>Client User ID</th>
                                    <th>Rx Power (Signal)</th>
                                    <th>Tx Power</th>
                                    <th>State</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($onus as $i => $onu): 
                                    // Extract Port
                                    if (preg_match('/^(?:epon|gpon)?\s?\d*\/(\d+):/i', $onu['interface'], $m)) {
                                        $pNum = $m[1];
                                    } elseif (preg_match('/^(\d+):/', $onu['interface'], $m)) {
                                        $pNum = $m[1];
                                    } else {
                                        $pNum = '1';
                                    }
                                    
                                    // Match with Client User ID
                                    $matched_clients = [];
                                    
                                    // 1. Match by main ONU MAC
                                    $cleanOnuMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $onu['mac']));
                                    if (isset($macMap[$cleanOnuMac])) {
                                        $matched_clients[$cleanOnuMac] = $macMap[$cleanOnuMac];
                                    }
                                    
                                    // 2. Match by bridged MACs (live macs)
                                    if (!empty($onu['mactable']) && is_array($onu['mactable'])) {
                                        foreach ($onu['mactable'] as $mObj) {
                                            $bridgedMac = $mObj['mac'] ?? '';
                                            $cleanBridgedMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $bridgedMac));
                                            if ($cleanBridgedMac && isset($macMap[$cleanBridgedMac])) {
                                                $matched_clients[$cleanBridgedMac] = $macMap[$cleanBridgedMac];
                                            }
                                        }
                                    }
                                    
                                    // Build search terms containing client information
                                    $searchTerms = [$onu['interface'], $onu['mac']];
                                    foreach ($matched_clients as $c) {
                                        $searchTerms[] = $c['user_id'];
                                        $searchTerms[] = $c['name'];
                                    }
                                    $searchStr = strtolower(implode(' ', array_filter($searchTerms)));
                                ?>
                                <!-- ONU Row -->
                                <tr class="onu-row" data-port="<?= $pNum ?>" data-state="<?= ($onu['state'] === 'Connect') ? 'active' : 'offline' ?>" data-search="<?= htmlspecialchars($searchStr) ?>" data-index="<?= $i ?>">
                                    <td class="text-center text-high-contrast-muted">
                                        <i id="chevron-<?= $i ?>" class="fas fa-chevron-right transition-transform"></i>
                                    </td>
                                    <td class="fw-bold text-high-contrast">
                                        <?= htmlspecialchars($onu['interface']) ?>
                                        <div class="small text-high-contrast-muted fw-normal" style="font-size: 0.75rem;">Model: <?= htmlspecialchars($onu['model']) ?></div>
                                    </td>
                                    <td class="font-monospace text-primary fw-bold small"><?= htmlspecialchars($onu['mac']) ?></td>
                                    <!-- Client ID Badge -->
                                    <td>
                                        <?php if (empty($matched_clients)): ?>
                                            <span class="text-muted small">N/A</span>
                                        <?php else: ?>
                                            <div class="d-flex flex-wrap gap-1">
                                                <?php foreach ($matched_clients as $mMac => $c): ?>
                                                    <a href="index.php?view_id=<?= $c['id'] ?>" class="badge bg-info text-white text-decoration-none fw-bold" title="<?= htmlspecialchars($c['name']) ?> (MAC: <?= $mMac ?>)" style="border-radius: 6px; font-size: 0.8rem; padding: 4px 8px;">
                                                        <i class="fas fa-user me-1"></i> <?= htmlspecialchars($c['user_id']) ?>
                                                    </a>
                                                <?php endforeach; ?>
                                            </div>
                                        <?php endif; ?>
                                    </td>
                                    <!-- Signal Rx -->
                                    <td id="rx-row-<?= $i ?>" data-interface="<?= $onu['interface'] ?>" class="text-high-contrast small font-monospace fw-bold">
                                        <span class="cell-rx">
                                            <?php 
                                            $rx_power = $onu['rx_power'] ?? 'N/A';
                                            if ($rx_power !== 'N/A' && $rx_power !== '') {
                                                $rx_num = floatval($rx_power);
                                                $color = 'text-success';
                                                if ($rx_num < -28) {
                                                    $color = 'text-danger fw-bold';
                                                } elseif ($rx_num < -25) {
                                                    $color = 'text-warning fw-bold';
                                                }
                                                echo '<span class="' . $color . '">' . htmlspecialchars($rx_power) . ' dBm</span>';
                                            } else {
                                                echo '<span class="text-secondary">-</span>';
                                            }
                                            ?>
                                        </span>
                                    </td>
                                    <!-- Signal Tx -->
                                    <td id="tx-row-<?= $i ?>" class="text-high-contrast-muted small font-monospace">
                                        <span class="cell-tx">
                                            <?php 
                                            $tx_power = $onu['tx_power'] ?? 'N/A';
                                            if ($tx_power !== 'N/A' && $tx_power !== '') {
                                                echo htmlspecialchars($tx_power) . ' dBm';
                                            } else {
                                                echo '-';
                                            }
                                            ?>
                                        </span>
                                    </td>
                                    <td>
                                        <?php if($onu['state'] == 'Connect'): ?>
                                            <span class="badge bg-success rounded-pill px-3 py-1 shadow-sm"><i class="fas fa-check-circle me-1"></i> Active</span>
                                        <?php else: ?>
                                            <span class="badge bg-danger rounded-pill px-3 py-1 shadow-sm"><i class="fas fa-times-circle me-1"></i> Offline</span>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                                
                                <!-- Toggleable Details subrow -->
                                <tr id="details-<?= $i ?>" class="details-row d-none">
                                    <td></td>
                                    <td colspan="6" class="p-3">
                                        <div class="card border-0 shadow-sm rounded p-3 bg-white border-start border-4 border-info">
                                            <div class="row">
                                                <div class="col-md-4 mb-2">
                                                    <h6 class="fw-bold text-high-contrast mb-2"><i class="fas fa-clock text-info me-2"></i> Connection Diagnostics</h6>
                                                    <ul class="list-unstyled mb-0 small text-high-contrast-muted">
                                                        <li class="mb-1">Device Uptime: <strong class="text-dark"><?= htmlspecialchars($onu['uptime'] ?? 'N/A') ?></strong></li>
                                                        <li class="mb-1">Signal Quality: 
                                                            <?php if ($onu['signal_quality'] === 'Good'): ?>
                                                                <span class="badge bg-success">Good Signal</span>
                                                            <?php elseif ($onu['signal_quality'] === 'Fair'): ?>
                                                                <span class="badge bg-warning text-dark">Fair Signal</span>
                                                            <?php elseif ($onu['signal_quality'] === 'Poor'): ?>
                                                                <span class="badge bg-danger">Poor Signal (Alert)</span>
                                                            <?php else: ?>
                                                                <span class="badge bg-secondary"><?= $onu['signal_quality'] ?></span>
                                                            <?php endif; ?>
                                                        </li>
                                                        <li class="mb-1">Operating Voltage: <strong class="text-dark cell-volt"><?= ($onu['voltage'] !== 'N/A' && $onu['voltage'] !== '') ? htmlspecialchars($onu['voltage']) . ' V' : 'N/A' ?></strong></li>
                                                        <li class="mb-1">Temperature: <strong class="text-dark cell-temp"><?= ($onu['temp'] !== 'N/A' && $onu['temp'] !== '') ? htmlspecialchars($onu['temp']) . ' °C' : 'N/A' ?></strong></li>
                                                        <?php if (isset($onu['distance']) && $onu['distance'] !== 'N/A'): ?>
                                                            <li class="mb-1">Distance: <strong class="text-dark"><?= htmlspecialchars($onu['distance']) ?> m</strong></li>
                                                        <?php endif; ?>
                                                        <?php if (isset($onu['vendor_id']) && $onu['vendor_id'] !== 'N/A' && $onu['vendor_id'] !== ''): ?>
                                                            <li class="mb-1">Vendor ID: <strong class="text-dark"><?= htmlspecialchars($onu['vendor_id']) ?></strong></li>
                                                        <?php endif; ?>
                                                    </ul>
                                                </div>
                                                
                                                <?php if (isset($onu['last_register']) && $onu['last_register'] !== 'N/A' || isset($onu['last_deregister']) && $onu['last_deregister'] !== 'N/A'): ?>
                                                <div class="col-md-3 mb-2">
                                                    <h6 class="fw-bold text-high-contrast mb-2"><i class="fas fa-history text-secondary me-2"></i> Registration History</h6>
                                                    <ul class="list-unstyled mb-0 small text-high-contrast-muted">
                                                        <?php if (isset($onu['last_register']) && $onu['last_register'] !== 'N/A'): ?>
                                                            <li class="mb-1">Last Register:<br> <strong class="text-dark"><?= htmlspecialchars($onu['last_register']) ?></strong></li>
                                                        <?php endif; ?>
                                                        <?php if (isset($onu['last_deregister']) && $onu['last_deregister'] !== 'N/A'): ?>
                                                            <li class="mb-1">Last Deregister:<br> <strong class="text-dark"><?= htmlspecialchars($onu['last_deregister']) ?></strong></li>
                                                        <?php endif; ?>
                                                        <?php if (isset($onu['deregister_reason']) && $onu['deregister_reason'] !== 'N/A'): ?>
                                                            <li class="mb-1 text-danger">Reason: <strong><?= htmlspecialchars($onu['deregister_reason']) ?></strong></li>
                                                        <?php endif; ?>
                                                    </ul>
                                                </div>
                                                <div class="col-md-5 mb-2">
                                                <?php else: ?>
                                                <div class="col-md-8 mb-2">
                                                <?php endif; ?>
                                                    <h6 class="fw-bold text-high-contrast mb-2"><i class="fas fa-ethernet text-secondary me-2"></i> Bridged MAC Addresses (VLANs)</h6>
                                                    <div class="mac-table-container">
                                                        <?php if (empty($onu['mactable'])): ?>
                                                            <span class="text-high-contrast-muted small"><i class="fas fa-info-circle me-1"></i> No bridged MACs or active client sessions detected on this ONU port.</span>
                                                        <?php else: ?>
                                                            <div class="d-flex flex-wrap gap-2">
                                                                <?php foreach ($onu['mactable'] as $macObj): ?>
                                                                    <span class="badge bg-light text-high-contrast border px-2 py-1.5 small font-monospace shadow-sm" title="VLAN ID: <?= $macObj['vlan'] ?>">
                                                                        <i class="fas fa-network-wired text-primary me-1"></i> <?= htmlspecialchars($macObj['mac']) ?> 
                                                                        <span class="text-high-contrast-muted small">(V: <?= htmlspecialchars($macObj['vlan']) ?>)</span>
                                                                    </span>
                                                                <?php endforeach; ?>
                                                            </div>
                                                        <?php endif; ?>
                                                    </div>
                                                </div>
                                                <div class="col-md-3 d-flex align-items-center justify-content-end">
                                                    <?php if($onu['state'] == 'Connect'): ?>
                                                    <form method="POST" action="" class="reboot-onu-form" data-confirm-msg="WARNING: Are you absolutely sure you want to reboot ONU <?= htmlspecialchars($onu['interface']) ?>? This will drop connection for the client.">
                                                        <input type="hidden" name="id" value="<?= $id ?>">
                                                        <input type="hidden" name="interface" value="<?= htmlspecialchars($onu['interface']) ?>">
                                                        <button type="submit" name="reboot_onu" class="btn btn-sm btn-outline-danger fw-bold shadow-sm">
                                                            <i class="fas fa-power-off me-2"></i> Reboot ONU Device
                                                        </button>
                                                    </form>
                                                    <?php else: ?>
                                                    <button class="btn btn-sm btn-outline-secondary fw-bold shadow-sm" disabled>
                                                        <i class="fas fa-ban me-2"></i> Device Offline
                                                    </button>
                                                    <?php endif; ?>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                    <div class="card-footer bg-transparent border-0 text-high-contrast-muted small py-3">
                        Total Connected Devices on OLT: <strong><?= $stats['total'] ?></strong>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let selectedPort = 'all';
            let selectedState = 'all';
            let searchTerm = '';

            function applyFilters() {
                const rows = document.querySelectorAll('.onu-row');
                rows.forEach(row => {
                    const rowPort = row.getAttribute('data-port');
                    const rowState = row.getAttribute('data-state');
                    const searchStr = row.getAttribute('data-search') || '';
                    const detailsRow = row.nextElementSibling;
                    
                    const portMatches = (selectedPort === 'all' || rowPort === selectedPort);
                    const stateMatches = (selectedState === 'all' || rowState === selectedState);
                    const searchMatches = (searchTerm === '' || searchStr.includes(searchTerm));
                    
                    if (portMatches && stateMatches && searchMatches) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                        // Close details row if filtered out
                        if (detailsRow && detailsRow.classList.contains('details-row')) {
                            detailsRow.classList.add('d-none');
                            const chevron = row.querySelector('.fa-chevron-right');
                            if (chevron) chevron.style.transform = '';
                        }
                    }
                });
            }

            document.addEventListener("DOMContentLoaded", function() {
                // Search Input listener
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.addEventListener('keyup', function() {
                        searchTerm = this.value.toLowerCase().trim();
                        applyFilters();
                    });
                }

                // State Filter dropdown listener
                const stateFilter = document.getElementById('stateFilter');
                if (stateFilter) {
                    stateFilter.addEventListener('change', function() {
                        selectedState = this.value;
                        applyFilters();
                    });
                }

                // Refresh Button listener
                const refreshBtn = document.getElementById('refreshOltBtn');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', function() {
                        this.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Syncing...';
                        this.classList.add('disabled');
                    });
                }

                // Port selection buttons listener
                const filterButtons = document.querySelectorAll('#port-selection-list button[data-port-filter]');
                filterButtons.forEach(btn => {
                    btn.addEventListener('click', function() {
                        const port = this.getAttribute('data-port-filter');
                        filterPort(port, this);
                    });
                });

                // ONU Rows toggle click listener
                const onuRows = document.querySelectorAll('.onu-row[data-index]');
                onuRows.forEach(row => {
                    row.addEventListener('click', function(e) {
                        // Prevent toggling if clicking links or forms inside the row
                        if (e.target.closest('a') || e.target.closest('form') || e.target.closest('button')) {
                            return;
                        }
                        const index = this.getAttribute('data-index');
                        toggleDetails(index);
                    });
                });

                // Reboot form confirmations listener
                const rebootForms = document.querySelectorAll('form.reboot-onu-form');
                rebootForms.forEach(form => {
                    form.addEventListener('submit', function(e) {
                        const msg = this.getAttribute('data-confirm-msg');
                        if (!confirm(msg)) {
                            e.preventDefault();
                        }
                    });
                });
            });

            // PON Port Filtering Function
            function filterPort(port, btn) {
                // Update active button styling
                const btns = document.getElementById('port-selection-list').querySelectorAll('button');
                btns.forEach(b => {
                    b.classList.remove('active', 'btn-primary');
                    b.classList.add('btn-outline-secondary');
                });
                btn.classList.add('active', 'btn-primary');
                btn.classList.remove('btn-outline-secondary');
                
                selectedPort = port;
                applyFilters();
            }

            // Details Toggle Function
            function toggleDetails(index) {
                const details = document.getElementById('details-' + index);
                const chevron = document.getElementById('chevron-' + index);
                
                if (details) {
                    if (details.classList.contains('d-none')) {
                        details.classList.remove('d-none');
                        if (chevron) chevron.style.transform = 'rotate(90deg)';
                    } else {
                        details.classList.add('d-none');
                        if (chevron) chevron.style.transform = '';
                    }
                }
            }

            // triggerRefresh is defined globally above the if/else block (always available)
        </script>

    <?php endif; ?>
</div>
