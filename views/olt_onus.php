<?php
// OLT ONU List & Dashboard View
require_once __DIR__ . '/../classes/OLTManager.php';
$oltMgr = new OLTManager($pdo);

$id = $_GET['id'] ?? 0;
$olt = $oltMgr->getOLT($id);

if (!$olt) {
    echo "<div class='alert alert-danger'>OLT Not Found</div>";
    return;
}

// Fetch Data
$onus = $oltMgr->getConnectedONUs($id);
$error = isset($onus['error']) ? $onus['error'] : null;

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
        // Status
        if ($onu['state'] === 'Connect') {
            $stats['online']++;
        } else {
            $stats['offline']++;
            $stats['alerts'][] = ['type' => 'offline', 'msg' => "{$onu['interface']} is Offline", 'mac' => $onu['mac']];
        }
        
        // Port Extraction (e.g. EPON0/1:2 -> EPON0/1)
        if (preg_match('/^(.*):/', $onu['interface'], $m)) {
            $port = $m[1];
        } else {
            $port = 'Unknown';
        }
        
        if (!isset($stats['ports'][$port])) {
            $stats['ports'][$port] = ['total' => 0, 'online' => 0, 'offline' => 0];
        }
        $stats['ports'][$port]['total']++;
        if ($onu['state'] === 'Connect') $stats['ports'][$port]['online']++;
        else $stats['ports'][$port]['offline']++;
    }
}
ksort($stats['ports']);
?>

<!-- Header -->
<div class="mb-4 d-flex justify-content-between align-items-center">
    <div>
        <a href="index.php?tab=olt" class="text-decoration-none text-muted small"><i class="fas fa-arrow-left"></i> Back to OLTs</a>
        <h4 class="mt-1 mb-0 fw-bold"><i class="fas fa-server text-primary"></i> <?= htmlspecialchars($olt['name']) ?> Dashboard</h4>
        <small class="text-muted"><?= $olt['ip_address'] ?> (<?= htmlspecialchars($olt['brand']) ?>)</small>
    </div>
    <button class="btn btn-primary" onclick="location.reload()"><i class="fas fa-sync-alt"></i> Refresh Data</button>
</div>

<?php if ($error): ?>
    <div class="alert alert-danger shadow-sm">
        <h5 class="alert-heading"><i class="fas fa-exclamation-triangle"></i> Data Fetch Error</h5>
        <p class="mb-0"><?= $error ?></p>
        <hr>
        <small>Please check the OLT connection, Credentials (Telnet/Web), and ensure the device is reachable.</small>
    </div>
<?php else: ?>

    <!-- Stats Cards -->
    <div class="row g-3 mb-4">
        <!-- Total -->
        <div class="col-md-3">
            <div class="card border-0 shadow-sm h-100 border-start border-4 border-primary">
                <div class="card-body">
                    <div class="text-uppercase text-muted small fw-bold">Total ONUs</div>
                    <div class="h2 fw-bold mb-0 text-dark"><?= $stats['total'] ?></div>
                    <small class="text-secondary">Registered</small>
                </div>
            </div>
        </div>
        <!-- Online -->
        <div class="col-md-3">
            <div class="card border-0 shadow-sm h-100 border-start border-4 border-success">
                <div class="card-body">
                    <div class="text-uppercase text-muted small fw-bold">Online</div>
                    <div class="h2 fw-bold mb-0 text-success"><?= $stats['online'] ?></div>
                    <div class="progress" style="height: 3px;">
                        <div class="progress-bar bg-success" style="width: <?= ($stats['total']>0) ? ($stats['online']/$stats['total']*100) : 0 ?>%"></div>
                    </div>
                </div>
            </div>
        </div>
        <!-- Offline -->
        <div class="col-md-3">
            <div class="card border-0 shadow-sm h-100 border-start border-4 border-danger">
                <div class="card-body">
                    <div class="text-uppercase text-muted small fw-bold">Offline</div>
                    <div class="h2 fw-bold mb-0 text-danger"><?= $stats['offline'] ?></div>
                    <small class="text-muted"><?= ($stats['total']>0) ? round(($stats['offline']/$stats['total']*100),1) : 0 ?>% Failure Rate</small>
                </div>
            </div>
        </div>
        <!-- Active Ports -->
        <div class="col-md-3">
            <div class="card border-0 shadow-sm h-100 border-start border-4 border-info">
                <div class="card-body">
                    <div class="text-uppercase text-muted small fw-bold">Active Ports</div>
                    <div class="h2 fw-bold mb-0 text-info"><?= count($stats['ports']) ?></div>
                    <small class="text-muted">PON Interfaces</small>
                </div>
            </div>
        </div>
    </div>

    <div class="row">
        <!-- Left Column: Port Stats & Alerts -->
        <div class="col-lg-4 mb-4">
            <!-- Port Breakdown -->
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-white fw-bold">
                    <i class="fas fa-ethernet me-2 text-secondary"></i> Port Distribution
                </div>
                <div class="list-group list-group-flush">
                    <?php if(empty($stats['ports'])): ?>
                        <div class="list-group-item text-muted text-center py-3">No Ports Found</div>
                    <?php else: ?>
                        <?php foreach($stats['ports'] as $port => $pStats): ?>
                        <div class="list-group-item d-flex justify-content-between align-items-center">
                            <div>
                                <strong><?= $port ?></strong>
                                <div class="progress mt-1" style="width: 100px; height: 4px;">
                                    <div class="progress-bar bg-success" style="width: <?= ($pStats['total']>0)?($pStats['online']/$pStats['total']*100):0 ?>%"></div>
                                </div>
                            </div>
                            <div class="text-end">
                                <span class="badge bg-light text-dark border"><?= $pStats['online'] ?> / <?= $pStats['total'] ?></span>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Alerts -->
            <div class="card shadow-sm border-0">
                <div class="card-header bg-white fw-bold text-danger">
                    <i class="fas fa-bell me-2"></i> Recent Alerts
                </div>
                <div class="card-body p-0" style="max-height: 300px; overflow-y: auto;">
                    <?php if(empty($stats['alerts'])): ?>
                        <div class="text-center p-4 text-muted">
                            <i class="fas fa-check-circle fa-2x text-success mb-2"></i><br>
                            All Systems Normal
                        </div>
                    <?php else: ?>
                        <ul class="list-group list-group-flush">
                            <?php foreach($stats['alerts'] as $alert): ?>
                            <li class="list-group-item border-start border-3 border-danger bg-light">
                                <div class="d-flex w-100 justify-content-between">
                                    <strong class="text-danger mb-1"><?= $alert['msg'] ?></strong>
                                </div>
                                <small class="text-muted font-monospace"><i class="fas fa-microchip"></i> <?= $alert['mac'] ?></small>
                            </li>
                            <?php endforeach; ?>
                        </ul>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Right Column: ONU List -->
        <div class="col-lg-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-white d-flex justify-content-between align-items-center">
                    <span class="fw-bold"><i class="fas fa-list me-2 text-secondary"></i> ONU Details</span>
                    <input type="text" id="searchInput" class="form-control form-control-sm w-auto" placeholder="Search MAC or Interface...">
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0" id="onu-table">
                        <thead class="table-light">
                            <tr>
                                <th>Interface</th>
                                <th>MAC Address</th>
                                <th>Signal (Rx/Tx)</th>
                                <th>Health</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($onus as $i => $onu): ?>
                            <tr class="onu-row" data-search="<?= strtolower($onu['interface'].' '.$onu['mac']) ?>">
                                <td class="fw-bold text-nowrap" data-bs-toggle="tooltip" title="Model: <?= $onu['model'] ?>">
                                    <?= $onu['interface'] ?>
                                    <div class="small text-muted fw-normal"><?= $onu['model'] ?></div>
                                </td>
                                <td class="font-monospace text-primary small"><?= $onu['mac'] ?></td>
                                <!-- Signal Column (Consolidated) -->
                                <td id="row-<?= $i ?>" data-interface="<?= $onu['interface'] ?>" class="small">
                                    <div class="d-flex flex-column gap-1">
                                        <span class="cell-rx" title="Rx Power"><i class="fas fa-download text-muted me-1"></i> <span class="spinner-border spinner-border-sm text-secondary" style="width:0.7em;height:0.7em;"></span></span>
                                        <span class="cell-tx" title="Tx Power"><i class="fas fa-upload text-muted me-1"></i> <span class="text-muted">-</span></span>
                                    </div>
                                </td>
                                <!-- Health Column -->
                                <td class="cell-env small">
                                    <div class="d-flex flex-column">
                                        <span class="cell-volt" title="Voltage">-</span>
                                        <span class="cell-temp" title="Temperature">-</span>
                                    </div>
                                </td>
                                <td>
                                    <?php if($onu['state'] == 'Connect'): ?>
                                        <span class="badge bg-success rounded-pill">Online</span>
                                    <?php else: ?>
                                        <span class="badge bg-secondary rounded-pill">Offline</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <div class="card-footer bg-white small text-muted">
                    Showing <?= $stats['total'] ?> Devices
                </div>
            </div>
        </div>
    </div>

    <!-- JS for Logic -->
    <script>
        document.addEventListener("DOMContentLoaded", function() {
            // Search Function
            const searchInput = document.getElementById('searchInput');
            const tableRows = document.querySelectorAll('.onu-row');
            
            searchInput.addEventListener('keyup', function() {
                const term = this.value.toLowerCase();
                tableRows.forEach(row => {
                    const text = row.getAttribute('data-search');
                    row.style.display = text.includes(term) ? '' : 'none';
                });
            });

            // Signal Fetcher
            // Only fetch for Online devices to save resources
            const rowsToFetch = [];
            document.querySelectorAll('tr.onu-row').forEach((row, index) => {
                // Check if online badge exists
                if(row.querySelector('.badge.bg-success')) {
                    const cell = row.querySelector('td[id^="row-"]');
                    if(cell) rowsToFetch.push(cell);
                } else {
                    // Set offline text
                    const cell = row.querySelector('td[id^="row-"]');
                    if(cell) {
                         cell.querySelector('.cell-rx').innerHTML = '<span class="text-muted">Offline</span>';
                         cell.querySelector('.cell-tx').innerHTML = '';
                    }
                }
            });
            
            let fetchIdx = 0;
            const oltId = <?= $id ?>;

            function fetchNext() {
                if(fetchIdx >= rowsToFetch.length) return;
                
                const cell = rowsToFetch[fetchIdx];
                const interface = cell.getAttribute('data-interface');
                const row = cell.closest('tr');
                
                fetch(`index.php?ajax_olt_signal=1&id=${oltId}&interface=${encodeURIComponent(interface)}`)
                    .then(res => res.json())
                    .then(data => {
                        // RX
                        let rxHtml = data.rx;
                        if(data.rx !== 'N/A') {
                            const rx = parseFloat(data.rx);
                            let color = 'text-success';
                            if(rx < -27) color = 'text-danger fw-bold';
                            else if(rx < -24) color = 'text-warning fw-bold';
                            rxHtml = `<span class="${color}">${data.rx} dBm</span>`;
                            
                            // Check for Critical Signal (> -27) and Add to Alerts if needed (Optional: Client side alert injection)
                            // For now just color code.
                        }
                        cell.querySelector('.cell-rx').innerHTML = `<i class="fas fa-download text-muted me-1"></i> ${rxHtml}`;
                        
                        // TX
                        const tx = (data.tx !== 'N/A') ? data.tx + ' dBm' : '-';
                        cell.querySelector('.cell-tx').innerHTML = `<i class="fas fa-upload text-muted me-1"></i> ${tx}`;
                        
                        // Env
                        const volt = (data.voltage !== 'N/A') ? data.voltage + ' V' : '-';
                        const temp = (data.temp !== 'N/A') ? data.temp + ' °C' : '-';
                        
                        row.querySelector('.cell-volt').innerText = `Volt: ${volt}`;
                        row.querySelector('.cell-temp').innerText = `Temp: ${temp}`;
                        
                        fetchIdx++;
                        fetchNext();
                    })
                    .catch(e => {
                        console.error(e);
                        fetchIdx++;
                        fetchNext();
                    });
            }
            
            // Start Fetching
            fetchNext();
        });
    </script>

<?php endif; ?>
