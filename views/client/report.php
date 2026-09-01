<?php require_once __DIR__ . '/layout/header.php'; ?>

<!-- Highcharts Script CDN -->
<script src="https://code.highcharts.com/highcharts.js"></script>

<!-- Real Time Graph Card -->
<div class="card mb-4 shadow-sm border-0">
    <div class="card-header bg-transparent border-bottom py-3 d-flex justify-content-between align-items-center">
        <div>
            <h6 class="mb-0 fw-bold text-dark">Real Time Download-Upload Graph</h6>
            <small class="text-muted">Username: <?= htmlspecialchars($c['user_id']) ?> | Router: <?= htmlspecialchars($c['r_name'] ?? 'N/A') ?></small>
        </div>
    </div>
    <div class="card-body">
        <!-- Live Graph Container -->
        <div id="live_graph_container" style="width: 100%; height: 350px; background-color: #ffffff !important; color-scheme: light !important;"></div>
        
        <!-- Live Traffic Value indicators -->
        <div class="d-flex justify-content-center mt-3 gap-4">
            <div class="d-flex align-items-center">
                <span class="bg-primary rounded-circle me-2" style="width:12px; height:12px; display:inline-block;"></span>
                <span class="small text-muted">Download: </span>
                <strong id="live_down_val" class="ms-1">0.00 Mbps</strong>
            </div>
            <div class="d-flex align-items-center">
                <span class="bg-danger rounded-circle me-2" style="width:12px; height:12px; display:inline-block;"></span>
                <span class="small text-muted">Upload: </span>
                <strong id="live_up_val" class="ms-1">0.00 Mbps</strong>
            </div>
        </div>
    </div>
</div>


<!-- Session Log Card -->
<div class="card shadow-sm border-0">
    <div class="card-header bg-transparent border-bottom py-3">
        <h6 class="mb-0 fw-bold text-dark">Session Log</h6>
    </div>
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle" style="font-size: 0.88rem;">
                <thead class="table-light">
                    <tr>
                        <th>Connection Date</th>
                        <th>Disconnection Date</th>
                        <th>Upload</th>
                        <th>Download</th>
                        <th>Session time</th>
                    </tr>
                </thead>
                <tbody>
                    <?php 
                    $sessions = safeFetchAll($pdo, "SELECT * FROM " . TBL_SESSIONS . " WHERE client_id = ? ORDER BY started_at DESC LIMIT 50", [$c['id']]);
                    if (!empty($sessions)): 
                        foreach ($sessions as $sess): 
                            $is_active = ($sess['status'] === 'active');
                            $start_time = strtotime($sess['started_at']);
                            $end_time = $is_active ? time() : strtotime($sess['ended_at']);
                            $duration_secs = max(0, $end_time - $start_time);
                            
                            // Format Duration: H:i:s
                            $h = floor($duration_secs / 3600);
                            $m = floor(($duration_secs % 3600) / 60);
                            $s = $duration_secs % 60;
                            $duration_str = sprintf('%d:%02d:%02d', $h, $m, $s);
                            
                            $upload_bytes = $is_active ? $sess['last_tx_bytes'] : $sess['total_tx_bytes'];
                            $download_bytes = $is_active ? $sess['last_rx_bytes'] : $sess['total_rx_bytes'];
                            ?>
                            <tr>
                                <td><?= htmlspecialchars(date('d M, Y h:i A', $start_time)) ?></td>
                                <td>
                                    <?php if ($is_active): ?>
                                        <span class="badge bg-success px-2 py-1 small">Active / Online</span>
                                    <?php else: ?>
                                        <?= htmlspecialchars(date('d M, Y h:i A', strtotime($sess['ended_at']))) ?>
                                    <?php endif; ?>
                                </td>
                                <td class="text-danger font-monospace fw-semibold"><?= htmlspecialchars(formatBytes($upload_bytes)) ?></td>
                                <td class="text-primary font-monospace fw-semibold"><?= htmlspecialchars(formatBytes($download_bytes)) ?></td>
                                <td class="font-monospace fw-semibold"><?= htmlspecialchars($duration_str) ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php else: ?>
                        <tr>
                            <td colspan="5" class="text-center py-5 text-muted">
                                <i class="fas fa-history fa-2x mb-2 opacity-50"></i><br>
                                No session history found for this account.
                            </td>
                        </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Live Graph Script -->
<script>
Highcharts.setOptions({
    global: { useUTC: false }
});

const chart = Highcharts.chart('live_graph_container', {
    chart: {
        type: 'areaspline',
        backgroundColor: '#ffffff',
        animation: Highcharts.svg, // don't animate on old IE
        marginRight: 10,
        events: {
            load: function () {
                // set up the updating of the chart every second
                const seriesDown = this.series[0];
                const seriesUp = this.series[1];
                
                setInterval(function () {
                    fetch('?panel=client&ajax_client_bw=1')
                        .then(response => response.json())
                        .then(data => {
                            const x = (new Date()).getTime(); // current time
                            let down = parseFloat(data.down_speed) || 0;
                            let up = parseFloat(data.up_speed) || 0;
                            
                            // Convert to Mbps for label (if returning bps)
                            // Safe check: if speed is returned in Kbps/Mbps adjust calculations. 
                            // Standard response tends to provide values suitable for graphing directly
                            seriesDown.addPoint([x, down], true, true);
                            seriesUp.addPoint([x, up], true, true);
                            
                            document.getElementById('live_down_val').innerText = (down).toFixed(2) + ' Mbps';
                            document.getElementById('live_up_val').innerText = (up).toFixed(2) + ' Mbps';
                        })
                        .catch(err => console.error("Graph Error:", err));
                }, 2000);
            }
        }
    },
    title: { text: null },
    xAxis: {
        type: 'datetime',
        tickPixelInterval: 150,
        lineColor: '#cbd5e1',
        tickColor: '#cbd5e1',
        labels: {
            style: { color: '#4a5568', fontFamily: 'Inter, sans-serif' }
        }
    },
    yAxis: {
        title: { 
            text: 'Speed (Mbps)',
            style: { color: '#4a5568', fontFamily: 'Inter, sans-serif' }
        },
        gridLineColor: '#f1f5f9',
        labels: {
            style: { color: '#4a5568', fontFamily: 'Inter, sans-serif' }
        },
        plotLines: [{ value: 0, width: 1, color: '#cbd5e1' }]
    },
    tooltip: {
        formatter: function () {
            return '<b>' + this.series.name + '</b><br/>' +
                Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>' +
                Highcharts.numberFormat(this.y, 2) + ' Mbps';
        }
    },
    legend: { enabled: false },
    exporting: { enabled: false },
    series: [{
        name: 'Download',
        color: '#5a67d8',
        fillOpacity: 0.1,
        data: (function () {
            // generate an array of random data
            const data = [];
            const time = (new Date()).getTime();
            for (let i = -19; i <= 0; i += 1) {
                data.push({ x: time + i * 1000, y: 0 });
            }
            return data;
        }())
    }, {
        name: 'Upload',
        color: '#e53e3e',
        fillOpacity: 0.1,
        data: (function () {
            const data = [];
            const time = (new Date()).getTime();
            for (let i = -19; i <= 0; i += 1) {
                data.push({ x: time + i * 1000, y: 0 });
            }
            return data;
        }())
    }]
});
</script>

<?php require_once __DIR__ . '/layout/footer.php'; ?>
