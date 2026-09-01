<?php
/**
 * views/dashboard/usage_dashboard.php
 * Live Bandwidth Usage Dashboard for ISP Administrator.
 */

// Safety check
if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('monitoring')) {
    echo "<div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied.</div>";
    return;
}

// Fetch routers for selection dropdown
$routers = safeFetchAll($pdo, "SELECT id, name, ip_address FROM " . TBL_ROUTERS);
?>

<!-- Custom Premium Dashboard Styles -->
<style>
    .glass-card {
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 16px;
        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.05);
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    .glass-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.08);
    }
    .pulse-green {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #20c997;
        box-shadow: 0 0 0 0 rgba(32, 201, 151, 0.7);
        animation: pulse 1.6s infinite;
        vertical-align: middle;
    }
    .pulse-orange {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #fd7e14;
        box-shadow: 0 0 0 0 rgba(253, 126, 20, 0.7);
        animation: pulse-org 1.6s infinite;
        vertical-align: middle;
    }
    @keyframes pulse {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(32, 201, 151, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(32, 201, 151, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(32, 201, 151, 0); }
    }
    @keyframes pulse-org {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(253, 126, 20, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(253, 126, 20, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(253, 126, 20, 0); }
    }
    .stats-icon {
        width: 52px;
        height: 52px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        background: linear-gradient(135deg, rgba(51, 154, 240, 0.15) 0%, rgba(34, 139, 230, 0.15) 100%);
        color: #228be6;
    }
    .bg-green-soft {
        background: linear-gradient(135deg, rgba(32, 201, 151, 0.15) 0%, rgba(18, 184, 134, 0.15) 100%) !important;
        color: #12b886 !important;
    }
    .bg-orange-soft {
        background: linear-gradient(135deg, rgba(253, 126, 20, 0.15) 0%, rgba(232, 89, 12, 0.15) 100%) !important;
        color: #e8590c !important;
    }
    .badge-status {
        font-size: 0.75rem;
        padding: 5px 12px;
        border-radius: 30px;
        font-weight: 600;
        display: inline-block;
    }
    .badge-active {
        background-color: rgba(25, 135, 84, 0.15) !important;
        color: #198754 !important;
        border: 1px solid rgba(25, 135, 84, 0.3) !important;
    }
    .badge-expired {
        background-color: rgba(220, 53, 69, 0.15) !important;
        color: #dc3545 !important;
        border: 1px solid rgba(220, 53, 69, 0.3) !important;
    }
    .badge-free {
        background-color: rgba(13, 202, 240, 0.15) !important;
        color: #0dcaf0 !important;
        border: 1px solid rgba(13, 202, 240, 0.3) !important;
    }
    .badge-promise {
        background-color: rgba(253, 126, 20, 0.15) !important;
        color: #fd7e14 !important;
        border: 1px solid rgba(253, 126, 20, 0.3) !important;
    }
    .rate-text {
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: -0.5px;
    }
</style>

<div class="container-fluid py-2">
    <!-- Page Title & Router Filter -->
    <div class="row align-items-center mb-4">
        <div class="col-md-6 col-12 mb-3 mb-md-0">
            <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-chart-area me-2 text-info animate-pulse"></i> Live PPPoE Usage Dashboard</h4>
            <p class="text-muted small mb-0">Real-time bandwidth parsing directly from active RouterOS API connections</p>
        </div>
        <div class="col-md-6 col-12 d-flex justify-content-md-end justify-content-start align-items-center gap-2">
            <span class="text-muted small fw-semibold"><i class="fas fa-filter me-1"></i> Router:</span>
            <select class="form-select form-select-sm shadow-sm border-0" id="routerFilterSelect" style="max-width: 220px; border-radius: 8px;">
                <option value="0">All Connected Routers</option>
                <?php foreach ($routers as $r): ?>
                    <option value="<?= $r['id'] ?>"><?= htmlspecialchars($r['name']) ?> (<?= htmlspecialchars($r['ip_address']) ?>)</option>
                <?php endforeach; ?>
            </select>
            <button class="btn btn-primary btn-sm rounded shadow-sm px-3 border-0" id="btnRefreshSync" style="background: #228be6;">
                <i class="fas fa-sync-alt me-1"></i> Sync Now
            </button>
        </div>
    </div>

    <!-- Live Performance Cards -->
    <div class="row g-3 mb-4">
        <!-- Live PPPoE Active Users -->
        <div class="col-md-3 col-sm-6 col-12">
            <div class="card border-0 glass-card p-3 h-100">
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <span class="small text-muted fw-semibold uppercase tracking-wider">Online PPPoE Clients</span>
                    <span class="pulse-green" id="pulseIndicator"></span>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="stats-icon bg-green-soft"><i class="fas fa-users"></i></div>
                    <div>
                        <h2 class="mb-0 fw-bold text-dark" id="cardActiveCount"><i class="fas fa-circle-notch fa-spin text-muted"></i></h2>
                        <span class="small text-muted" id="cardActiveSubtitle">Connecting to API...</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Live Download Throughput Rate -->
        <div class="col-md-3 col-sm-6 col-12">
            <div class="card border-0 glass-card p-3 h-100">
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <span class="small text-muted fw-semibold uppercase tracking-wider">Live Download Speed</span>
                    <i class="fas fa-arrow-circle-down text-success"></i>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="stats-icon bg-green-soft" style="color: #2b8a3e;"><i class="fas fa-download"></i></div>
                    <div>
                        <div class="rate-text text-success" id="cardLiveDownload">0.00 Mbps</div>
                        <span class="small text-muted">Aggregated RX rate</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Live Upload Throughput Rate -->
        <div class="col-md-3 col-sm-6 col-12">
            <div class="card border-0 glass-card p-3 h-100">
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <span class="small text-muted fw-semibold uppercase tracking-wider">Live Upload Speed</span>
                    <i class="fas fa-arrow-circle-up text-primary"></i>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="stats-icon" style="background: rgba(34,139,230,0.15); color: #228be6;"><i class="fas fa-upload"></i></div>
                    <div>
                        <div class="rate-text text-primary" id="cardLiveUpload">0.00 Mbps</div>
                        <span class="small text-muted">Aggregated TX rate</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Connection Status Indicator -->
        <div class="col-md-3 col-sm-6 col-12">
            <div class="card border-0 glass-card p-3 h-100">
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <span class="small text-muted fw-semibold uppercase tracking-wider">Router API Connection</span>
                    <i class="fas fa-network-wired text-muted" id="routerStatusIcon"></i>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="stats-icon bg-orange-soft" id="routerStatusBg"><i class="fas fa-server"></i></div>
                    <div>
                        <h4 class="mb-0 fw-bold text-dark" id="cardRouterStatus">Checking...</h4>
                        <span class="small text-muted" id="cardRouterStatusText">Ping testing MikroTik...</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Charts Section -->
    <div class="row g-3 mb-4">
        <!-- Live Real-Time Throughput Graph -->
        <div class="col-lg-8 col-12">
            <div class="card border-0 glass-card h-100">
                <div class="card-header bg-transparent border-0 d-flex justify-content-between align-items-center pt-3 px-3">
                    <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-wave-square me-2 text-primary"></i> Real-time Network Throughput (Last 2 Mins)</h6>
                    <span class="badge bg-light text-primary border px-2 py-1"><i class="fas fa-clock me-1"></i> Updates every 10s</span>
                </div>
                <div class="card-body p-3">
                    <div style="height: 270px; position: relative;">
                        <canvas id="liveThroughputChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Weekly Traffic Comparison (Upload vs Download) -->
        <div class="col-lg-4 col-12">
            <div class="card border-0 glass-card h-100">
                <div class="card-header bg-transparent border-0 d-flex justify-content-between align-items-center pt-3 px-3">
                    <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-calendar-week me-2 text-success"></i> Weekly Traffic Consumption</h6>
                    <a href="?tab=usage_reports" class="btn btn-sm btn-link text-decoration-none p-0 fw-semibold" style="color: #228be6;">Reports</a>
                </div>
                <div class="card-body p-3">
                    <div style="height: 270px; position: relative;">
                        <canvas id="weeklyTrafficChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Live Active Sessions Datatable -->
    <div class="row g-3">
        <div class="col-12">
            <div class="card border-0 glass-card">
                <div class="card-header bg-transparent border-0 d-flex flex-wrap align-items-center justify-content-between gap-3 pt-3 px-3">
                    <div>
                        <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-list-alt me-2 text-info"></i> Active PPPoE Session Monitor</h6>
                        <p class="text-muted small mb-0">Live table of active sessions retrieved from RouterOS print queue</p>
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-grow-1 flex-md-grow-0" style="max-width: 350px;">
                        <div class="input-group input-group-sm bg-light rounded-pill border overflow-hidden">
                            <span class="input-group-text bg-transparent border-0 text-muted"><i class="fas fa-search"></i></span>
                            <input type="text" class="form-control bg-transparent border-0 ps-1" placeholder="Search customer, IP, profile..." id="tableSearchInput">
                        </div>
                    </div>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0 mt-2" id="liveUsageTable" style="font-size: 0.9rem;">
                            <thead class="bg-light text-muted uppercase font-monospace" style="font-size: 0.8rem;">
                                <tr>
                                    <th class="ps-4 py-3">PPPoE ID</th>
                                    <th class="py-3">Client Name</th>
                                    <th class="py-3">IP Address</th>
                                    <th class="py-3">MAC / Caller ID</th>
                                    <th class="py-3 text-center">Uptime</th>
                                    <th class="py-3 text-end"><i class="fas fa-arrow-down text-success me-1"></i>Download</th>
                                    <th class="py-3 text-end"><i class="fas fa-arrow-up text-primary me-1"></i>Upload</th>
                                    <th class="py-3">Profile Package</th>
                                    <th class="py-3 text-center">Billing</th>
                                    <th class="pe-4 py-3 text-center">Router</th>
                                </tr>
                            </thead>
                            <tbody id="liveUsageTableBody">
                                <tr>
                                    <td colspan="10" class="text-center py-5 text-muted">
                                        <div class="spinner-border spinner-border-sm text-info me-2"></div>
                                        Establishing connection and fetching live active sessions...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <!-- Pagination Footer -->
                <div class="card-footer bg-transparent border-0 d-flex align-items-center justify-content-between px-3 py-3" id="paginationControlsContainer">
                </div>
            </div>
        </div>
    </div>
</div>

<!-- AJAX and Chart rendering logic -->
<script>
document.addEventListener("DOMContentLoaded", function() {
    let activeSessionsCache = [];
    let currentPage = 1;
    let itemsPerPage = 50;
    let searchDebounceTimeout = null;
    let liveChart = null;
    let weeklyChart = null;
    const updateInterval = 10000; // Update rate every 10 seconds

    // 1. Initialize Real-Time Speed Chart
    const liveCtx = document.getElementById('liveThroughputChart').getContext('2d');
    const liveChartData = {
        labels: [], // Time stamps
        datasets: [
            {
                label: 'Download Rate (Mbps)',
                data: [],
                borderColor: '#12b886',
                backgroundColor: 'rgba(18, 184, 132, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5
            },
            {
                label: 'Upload Rate (Mbps)',
                data: [],
                borderColor: '#228be6',
                backgroundColor: 'rgba(34, 139, 230, 0.05)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5
            }
        ]
    };
    
    // Seed last 10 points on the graph
    const initialTime = Date.now();
    for (let i = 11; i >= 0; i--) {
        const timeStr = new Date(initialTime - i * updateInterval).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        liveChartData.labels.push(timeStr);
        liveChartData.datasets[0].data.push(0);
        liveChartData.datasets[1].data.push(0);
    }

    liveChart = new Chart(liveCtx, {
        type: 'line',
        data: liveChartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { display: false } },
                y: { 
                    beginAtZero: true, 
                    title: { display: true, text: 'Mbps' },
                    grid: { borderDash: [2, 2] }
                }
            }
        }
    });

    // 2. Initialize Weekly Consumption Chart
    const weeklyCtx = document.getElementById('weeklyTrafficChart').getContext('2d');
    weeklyChart = new Chart(weeklyCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Download (GB)',
                    data: [],
                    backgroundColor: 'rgba(32, 201, 151, 0.75)',
                    borderRadius: 5
                },
                {
                    label: 'Upload (GB)',
                    data: [],
                    backgroundColor: 'rgba(34, 139, 230, 0.75)',
                    borderRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'GigaBytes (GB)' }, grid: { borderDash: [2, 2] } }
            }
        }
    });

    // 3. Fetch Router Status Check
    function checkRouterStatus() {
        const rSelect = document.getElementById('routerFilterSelect');
        const rId = parseInt(rSelect.value);
        
        if (rId <= 0) {
            document.getElementById('cardRouterStatus').innerText = 'Online';
            document.getElementById('cardRouterStatusText').innerText = 'Main API server operational';
            document.getElementById('routerStatusIcon').className = 'fas fa-network-wired text-success';
            document.getElementById('routerStatusBg').className = 'stats-icon bg-green-soft';
            return;
        }

        fetch('index.php?action=check_router_status&router_id=' + rId)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (data.online) {
                    document.getElementById('cardRouterStatus').innerText = 'Online';
                    document.getElementById('cardRouterStatusText').innerText = 'Connected successfully';
                    document.getElementById('routerStatusIcon').className = 'fas fa-server text-success';
                    document.getElementById('routerStatusBg').className = 'stats-icon bg-green-soft';
                } else {
                    document.getElementById('cardRouterStatus').innerText = 'Offline';
                    document.getElementById('cardRouterStatusText').innerText = 'API port 8728 closed';
                    document.getElementById('routerStatusIcon').className = 'fas fa-server text-danger';
                    document.getElementById('routerStatusBg').className = 'stats-icon bg-orange-soft';
                }
            }
        })
        .catch(err => {
            document.getElementById('cardRouterStatus').innerText = 'Offline';
            document.getElementById('cardRouterStatusText').innerText = 'Connection timed out';
            document.getElementById('routerStatusIcon').className = 'fas fa-server text-danger';
            document.getElementById('routerStatusBg').className = 'stats-icon bg-orange-soft';
        });
    }

    // 4. Fetch Weekly Analytical Data
    function loadWeeklyCharts() {
        fetch('index.php?action=get_usage_charts&range=7days')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                weeklyChart.data.labels = data.labels;
                weeklyChart.data.datasets[0].data = data.download;
                weeklyChart.data.datasets[1].data = data.upload;
                weeklyChart.update();
            }
        });
    }

    // 5. Fetch Live Active Users & Bandwidth Sync
    function syncLiveUsage(isManual = false) {
        const rSelect = document.getElementById('routerFilterSelect');
        const rId = parseInt(rSelect.value);
        const searchQuery = encodeURIComponent(document.getElementById('tableSearchInput').value.trim());
        
        if (isManual) {
            document.getElementById('btnRefreshSync').disabled = true;
            document.getElementById('btnRefreshSync').innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Syncing...';
            document.getElementById('liveUsageTableBody').innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-4 text-muted">
                        <span class="spinner-border spinner-border-sm me-2"></span>
                        Re-polling router active user caches...
                    </td>
                </tr>
            `;
        }

        const url = 'index.php?action=get_live_usage&router_id=' + rId + 
                    '&page=' + currentPage + 
                    '&limit=' + itemsPerPage + 
                    '&search=' + searchQuery + 
                    '&force_refresh=' + (isManual ? 1 : 0) +
                    '&_t=' + Date.now();

        fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                activeSessionsCache = data.sessions;
                document.getElementById('cardActiveCount').innerText = data.count;
                document.getElementById('cardActiveSubtitle').innerText = 'Sessions active now';
                
                // Set aggregate rates
                const downMbps = data.down_speed || 0.0;
                const upMbps = data.up_speed || 0.0;
                document.getElementById('cardLiveDownload').innerText = downMbps.toFixed(2) + ' Mbps';
                document.getElementById('cardLiveUpload').innerText = upMbps.toFixed(2) + ' Mbps';

                // Append to real-time Chart
                const timeLabel = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                
                liveChart.data.labels.push(timeLabel);
                liveChart.data.datasets[0].data.push(parseFloat(downMbps.toFixed(2)));
                liveChart.data.datasets[1].data.push(parseFloat(upMbps.toFixed(2)));

                // Maintain only the last 12 points
                if (liveChart.data.labels.length > 12) {
                    liveChart.data.labels.shift();
                    liveChart.data.datasets[0].data.shift();
                    liveChart.data.datasets[1].data.shift();
                }
                liveChart.update('none'); // Quick animation-free update

                renderSessionsTable(data.page, data.total_pages, data.filtered_count);
                checkRouterStatus();
            } else {
                showTableError(data.message || 'API query failed.');
            }
        })
        .catch(err => {
            showTableError('Failed to contact the API backend controller.');
        })
        .finally(() => {
            if (isManual) {
                document.getElementById('btnRefreshSync').disabled = false;
                document.getElementById('btnRefreshSync').innerHTML = '<i class="fas fa-sync-alt me-1"></i>Sync Now';
            }
        });
    }

    // 6. Render Pagination Controls
    function renderPaginationControls(page, totalPages, filteredCount) {
        const container = document.getElementById('paginationControlsContainer');
        if (!container) return;

        if (totalPages <= 1) {
            container.innerHTML = `
                <div class="small text-muted">Showing <b>${filteredCount}</b> active sessions</div>
                <div></div>
            `;
            return;
        }

        const startIdx = (page - 1) * itemsPerPage + 1;
        const endIdx = Math.min(page * itemsPerPage, filteredCount);

        let paginationHtml = `
            <div class="small text-muted">
                Showing <b>${startIdx}</b> to <b>${endIdx}</b> of <b>${filteredCount}</b> sessions
            </div>
            <nav aria-label="Page navigation" class="mb-0">
                <ul class="pagination pagination-sm mb-0 gap-1">
                    <li class="page-item ${page === 1 ? 'disabled' : ''}">
                        <button class="page-link border-0 rounded" id="btnPrevPage" style="background: rgba(34, 139, 230, 0.1); color: #228be6;"><i class="fas fa-chevron-left"></i></button>
                    </li>
                    <li class="page-item active">
                        <span class="page-link border-0 rounded bg-primary text-white px-3">Page ${page} of ${totalPages}</span>
                    </li>
                    <li class="page-item ${page === totalPages ? 'disabled' : ''}">
                        <button class="page-link border-0 rounded" id="btnNextPage" style="background: rgba(34, 139, 230, 0.1); color: #228be6;"><i class="fas fa-chevron-right"></i></button>
                    </li>
                </ul>
            </nav>
        `;

        container.innerHTML = paginationHtml;

        const prevBtn = document.getElementById('btnPrevPage');
        const nextBtn = document.getElementById('btnNextPage');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    syncLiveUsage();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    syncLiveUsage();
                }
            });
        }
    }

    // 7. Render Online Session list in the Table
    function renderSessionsTable(page, totalPages, filteredCount) {
        const tbody = document.getElementById('liveUsageTableBody');
        tbody.innerHTML = '';

        if (activeSessionsCache.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-4 text-muted">
                        <i class="fas fa-info-circle me-1"></i> No matching online sessions found.
                    </td>
                </tr>
            `;
            renderPaginationControls(1, 1, 0);
            return;
        }

        let html = '';
        activeSessionsCache.forEach(s => {
            // Curate color for client state
            let badgeClass = 'badge-active';
            const statusLower = s.status.toLowerCase();
            if (statusLower.includes('expire') || statusLower.includes('inactive') || statusLower.includes('suspended')) {
                badgeClass = 'badge-expired';
            } else if (statusLower.includes('free')) {
                badgeClass = 'badge-free';
            } else if (statusLower.includes('promise')) {
                badgeClass = 'badge-promise';
            }

            html += `
                <tr>
                    <td class="ps-4 font-monospace fw-bold text-dark">${s.username}</td>
                    <td>
                        <div class="fw-semibold text-dark">${s.name}</div>
                        <div class="text-muted small font-monospace" style="font-size:0.75rem;"><i class="fas fa-phone-alt me-1"></i>${s.phone}</div>
                    </td>
                    <td class="font-monospace">${s.ip}</td>
                    <td class="font-monospace text-muted">${s.mac}</td>
                    <td class="text-center text-secondary">${s.uptime}</td>
                    <td class="text-end fw-semibold text-success font-monospace">${s.download_formatted}</td>
                    <td class="text-end fw-semibold text-primary font-monospace">${s.upload_formatted}</td>
                    <td><span class="badge bg-light text-dark border">${s.package}</span></td>
                    <td class="text-center">
                        <span class="badge badge-status ${badgeClass}">${s.status}</span>
                    </td>
                    <td class="pe-4 text-center">
                        <span class="badge bg-light text-secondary border font-monospace" style="font-size:0.75rem;">${s.router_name}</span>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        renderPaginationControls(page, totalPages, filteredCount);
    }

    function showTableError(msg) {
        document.getElementById('liveUsageTableBody').innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4 text-danger font-semibold">
                     <i class="fas fa-exclamation-triangle me-2"></i> ${msg}
                </td>
            </tr>
        `;
        document.getElementById('cardActiveCount').innerText = '-';
        document.getElementById('cardLiveDownload').innerText = '0.00 Mbps';
        document.getElementById('cardLiveUpload').innerText = '0.00 Mbps';
        document.getElementById('cardRouterStatus').innerText = 'Offline';
        document.getElementById('cardRouterStatusText').innerText = 'API Server check failed';
        
        const container = document.getElementById('paginationControlsContainer');
        if (container) container.innerHTML = '';
    }

    // 8. Event Handlers
    document.getElementById('routerFilterSelect').addEventListener('change', function() {
        currentPage = 1; // Reset page
        syncLiveUsage(true);
    });

    document.getElementById('tableSearchInput').addEventListener('input', function() {
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            currentPage = 1; // Reset to page 1
            syncLiveUsage();
        }, 350);
    });
    
    document.getElementById('btnRefreshSync').addEventListener('click', function() {
        currentPage = 1; // Reset page
        syncLiveUsage(true);
        loadWeeklyCharts();
    });

    // 9. Initial Load & Loops
    syncLiveUsage();
    loadWeeklyCharts();
    
    setInterval(() => syncLiveUsage(false), updateInterval);
    setInterval(checkRouterStatus, 30000); // Check router connection status every 30s
});
</script>
