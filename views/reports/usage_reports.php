<?php
/**
 * views/reports/usage_reports.php
 * Bandwidth Usage Reports & Analytics Panel.
 */

// Safety check
if (!hasRole('Admin') && !hasRole('Reseller') && !hasPermission('monitoring')) {
    echo "<div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied.</div>";
    return;
}

// Fetch routers for selection dropdown
$routers = safeFetchAll($pdo, "SELECT id, name, ip_address FROM " . TBL_ROUTERS);

// Fetch customers list for filtering
$customers = safeFetchAll($pdo, "SELECT id, name, user_id FROM " . TBL_USERS . " ORDER BY name ASC");

// Calculate direct KPI counters from TBL_USAGE_LOGS / daily_traffic
// Today
$kpi_today = safeFetch($pdo, "
    SELECT SUM(upload_bytes) as upload, SUM(download_bytes) as download 
    FROM " . TBL_USAGE_LOGS . " 
    WHERE usage_date = CURDATE()
");
$today_total = ($kpi_today['upload'] ?? 0) + ($kpi_today['download'] ?? 0);

// Last 7 Days
$kpi_7days = safeFetch($pdo, "
    SELECT SUM(upload_bytes) as upload, SUM(download_bytes) as download 
    FROM " . TBL_USAGE_LOGS . " 
    WHERE usage_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
");
$seven_total = ($kpi_7days['upload'] ?? 0) + ($kpi_7days['download'] ?? 0);

// Last 30 Days
$kpi_30days = safeFetch($pdo, "
    SELECT SUM(upload_bytes) as upload, SUM(download_bytes) as download 
    FROM " . TBL_USAGE_LOGS . " 
    WHERE usage_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
");
$thirty_total = ($kpi_30days['upload'] ?? 0) + ($kpi_30days['download'] ?? 0);

// Helper function in-view
if (!function_exists('formatBytesView')) {
    function formatBytesView($bytes, $precision = 2) {
        $units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= pow(1024, $pow);
        return round($bytes, $precision) . ' ' . $units[$pow];
    }
}
?>

<!-- Custom Analytics Panel Styles -->
<style>
    .glass-card-static {
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 14px;
        box-shadow: 0 4px 18px 0 rgba(0, 0, 0, 0.02);
    }
    .kpi-title {
        font-size: 0.8rem;
        color: #868e96;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
    }
    .nav-pills .nav-link {
        color: #495057;
        font-weight: 500;
        border-radius: 30px;
        padding: 8px 18px;
        font-size: 0.85rem;
    }
    .nav-pills .nav-link.active {
        background-color: #228be6 !important;
        box-shadow: 0 4px 12px rgba(34, 139, 230, 0.25);
    }
</style>

<div class="container-fluid py-2">
    <!-- Page Header -->
    <div class="row mb-4">
        <div class="col-12">
            <h4 class="mb-0 fw-bold text-dark"><i class="fas fa-file-invoice me-2 text-success"></i> Bandwidth Audits & Analytics Reports</h4>
            <p class="text-muted small mb-0">Generate, analyze, and export network consumption records for PPPoE customers</p>
        </div>
    </div>

    <!-- Analytics KPIs -->
    <div class="row g-3 mb-4">
        <!-- Today Usage -->
        <div class="col-md-4 col-sm-6 col-12">
            <div class="card border-0 glass-card-static p-3 h-100">
                <span class="kpi-title mb-2">Today's Consumption</span>
                <h3 class="mb-0 fw-bold text-success font-monospace"><?= formatBytesView($today_total) ?></h3>
                <div class="mt-2 text-muted small">
                    <span class="text-secondary"><i class="fas fa-arrow-up me-1"></i><?= formatBytesView($kpi_today['upload'] ?? 0) ?></span> Upload | 
                    <span class="text-secondary"><i class="fas fa-arrow-down me-1"></i><?= formatBytesView($kpi_today['download'] ?? 0) ?></span> Download
                </div>
            </div>
        </div>

        <!-- Last 7 Days -->
        <div class="col-md-4 col-sm-6 col-12">
            <div class="card border-0 glass-card-static p-3 h-100">
                <span class="kpi-title mb-2">Last 7 Days Consumption</span>
                <h3 class="mb-0 fw-bold text-primary font-monospace"><?= formatBytesView($seven_total) ?></h3>
                <div class="mt-2 text-muted small">
                    <span class="text-secondary"><i class="fas fa-arrow-up me-1"></i><?= formatBytesView($kpi_7days['upload'] ?? 0) ?></span> Upload | 
                    <span class="text-secondary"><i class="fas fa-arrow-down me-1"></i><?= formatBytesView($kpi_7days['download'] ?? 0) ?></span> Download
                </div>
            </div>
        </div>

        <!-- Last 30 Days -->
        <div class="col-md-4 col-sm-12 col-12">
            <div class="card border-0 glass-card-static p-3 h-100">
                <span class="kpi-title mb-2">Last 30 Days Consumption</span>
                <h3 class="mb-0 fw-bold text-dark font-monospace"><?= formatBytesView($thirty_total) ?></h3>
                <div class="mt-2 text-muted small">
                    <span class="text-secondary"><i class="fas fa-arrow-up me-1"></i><?= formatBytesView($kpi_30days['upload'] ?? 0) ?></span> Upload | 
                    <span class="text-secondary"><i class="fas fa-arrow-down me-1"></i><?= formatBytesView($kpi_30days['download'] ?? 0) ?></span> Download
                </div>
            </div>
        </div>
    </div>

    <!-- Filter Card & Form -->
    <div class="row g-3 mb-4">
        <div class="col-12">
            <div class="card border-0 glass-card-static p-3">
                <div class="row g-2 align-items-end">
                    <!-- Date From -->
                    <div class="col-md-2 col-sm-6 col-12">
                        <label class="form-label small fw-semibold text-secondary"><i class="far fa-calendar-alt me-1"></i> Date From:</label>
                        <input type="date" class="form-control form-control-sm border-light shadow-sm" id="filterDateFrom" value="<?= date('Y-m-d', strtotime('-30 days')) ?>" style="border-radius: 8px;">
                    </div>
                    
                    <!-- Date To -->
                    <div class="col-md-2 col-sm-6 col-12">
                        <label class="form-label small fw-semibold text-secondary"><i class="far fa-calendar-alt me-1"></i> Date To:</label>
                        <input type="date" class="form-control form-control-sm border-light shadow-sm" id="filterDateTo" value="<?= date('Y-m-d') ?>" style="border-radius: 8px;">
                    </div>

                    <!-- Router Filter -->
                    <div class="col-md-2 col-sm-6 col-12">
                        <label class="form-label small fw-semibold text-secondary"><i class="fas fa-server me-1"></i> Router:</label>
                        <select class="form-select form-select-sm border-light shadow-sm" id="filterRouterId" style="border-radius: 8px;">
                            <option value="0">All Routers</option>
                            <?php foreach ($routers as $r): ?>
                                <option value="<?= $r['id'] ?>"><?= htmlspecialchars($r['name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <!-- Customer Filter -->
                    <div class="col-md-2 col-sm-6 col-12">
                        <label class="form-label small fw-semibold text-secondary"><i class="fas fa-user me-1"></i> Customer:</label>
                        <select class="form-select form-select-sm border-light shadow-sm" id="filterCustomerId" style="border-radius: 8px;">
                            <option value="0">All Customers</option>
                            <?php foreach ($customers as $c): ?>
                                <option value="<?= $c['id'] ?>"><?= htmlspecialchars($c['name']) ?> (<?= htmlspecialchars($c['user_id']) ?>)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <!-- Search Button -->
                    <div class="col-md-2 col-sm-6 col-12 d-grid">
                        <button class="btn btn-success btn-sm rounded shadow-sm border-0" id="btnFilterSubmit" style="background: #12b886;">
                            <i class="fas fa-search me-1"></i> Query Reports
                        </button>
                    </div>

                    <!-- Sync Button -->
                    <div class="col-md-2 col-sm-6 col-12 d-grid">
                        <button class="btn btn-primary btn-sm rounded shadow-sm border-0" id="btnSyncNow" style="background: #228be6;">
                            <i class="fas fa-sync-alt me-1"></i> Sync Bandwidth
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Reports Tab Layout -->
    <div class="row g-3">
        <div class="col-12">
            <div class="card border-0 glass-card-static p-3">
                <!-- Tab Headers -->
                <div class="d-flex flex-wrap align-items-center justify-content-between border-bottom pb-3 mb-3 gap-3">
                    <ul class="nav nav-pills" id="reportTabs" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" id="history-tab" data-bs-toggle="pill" data-bs-target="#tab-history" type="button" role="tab" aria-selected="true">
                                <i class="fas fa-history me-1"></i> Historical Usage Logs
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="topusers-tab" data-bs-toggle="pill" data-bs-target="#tab-topusers" type="button" role="tab" aria-selected="false">
                                <i class="fas fa-award me-1"></i> Top 50 Users
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="routerwise-tab" data-bs-toggle="pill" data-bs-target="#tab-routerwise" type="button" role="tab" aria-selected="false">
                                <i class="fas fa-network-wired me-1"></i> Router Summaries
                            </button>
                        </li>
                    </ul>

                    <!-- Export Controls -->
                    <button class="btn btn-outline-secondary btn-sm px-3 rounded shadow-sm" id="btnExportCSV">
                        <i class="fas fa-file-csv me-1 text-success"></i> Export CSV
                    </button>
                </div>

                <!-- Tab Contents -->
                <div class="tab-content" id="reportTabsContent">
                    
                    <!-- TAB 1: HISTORY LOGS -->
                    <div class="tab-pane fade show active" id="tab-history" role="tabpanel">
                        <!-- KPI Summary Row for Query -->
                        <div class="row g-2 mb-3 align-items-center bg-light p-2 rounded shadow-sm mx-1" id="historySummaryCard" style="display:none; font-size:0.85rem;">
                            <div class="col-md-4 text-center border-end">
                                Total Upload: <strong class="text-primary font-monospace" id="sumUpload">0 GB</strong>
                            </div>
                            <div class="col-md-4 text-center border-end">
                                Total Download: <strong class="text-success font-monospace" id="sumDownload">0 GB</strong>
                            </div>
                            <div class="col-md-4 text-center">
                                Total Combined Bandwidth: <strong class="text-dark font-monospace" id="sumCombined">0 GB</strong>
                            </div>
                        </div>

                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0" id="tableHistory" style="font-size:0.9rem;">
                                <thead class="table-light text-muted font-monospace" style="font-size:0.8rem;">
                                    <tr>
                                        <th class="ps-3 py-3">Date</th>
                                        <th class="py-3">PPPoE User ID</th>
                                        <th class="py-3">Customer Name</th>
                                        <th class="py-3 text-end"><i class="fas fa-arrow-up text-primary me-1"></i>Upload</th>
                                        <th class="py-3 text-end"><i class="fas fa-arrow-down text-success me-1"></i>Download</th>
                                        <th class="py-3 text-end">Total Combined</th>
                                        <th class="py-3 text-center">Session Uptime</th>
                                        <th class="pe-3 py-3 text-center">Router Source</th>
                                    </tr>
                                </thead>
                                <tbody id="tableHistoryBody">
                                    <tr>
                                        <td colspan="8" class="text-center py-4 text-muted">
                                            Click the "Query Reports" button to pull historical bandwidth logs based on the filters.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- TAB 2: TOP USERS -->
                    <div class="tab-pane fade" id="tab-topusers" role="tabpanel">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0" id="tableTopUsers" style="font-size:0.9rem;">
                                <thead class="table-light text-muted font-monospace" style="font-size:0.8rem;">
                                    <tr>
                                        <th class="ps-3 py-3 text-center" style="width: 80px;">Rank</th>
                                        <th class="py-3">PPPoE ID</th>
                                        <th class="py-3">Client Name</th>
                                        <th class="py-3">Active Profile</th>
                                        <th class="py-3 text-end"><i class="fas fa-arrow-up text-primary me-1"></i>Upload Traffic</th>
                                        <th class="py-3 text-end"><i class="fas fa-arrow-down text-success me-1"></i>Download Traffic</th>
                                        <th class="pe-3 py-3 text-end">Total Consumption</th>
                                    </tr>
                                </thead>
                                <tbody id="tableTopUsersBody">
                                    <tr>
                                        <td colspan="7" class="text-center py-4 text-muted">
                                            Click the "Query Reports" button to pull highest bandwidth consumers.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- TAB 3: ROUTER SUMMARIES -->
                    <div class="tab-pane fade" id="tab-routerwise" role="tabpanel">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0" id="tableRouterWise" style="font-size:0.9rem;">
                                <thead class="table-light text-muted font-monospace" style="font-size:0.8rem;">
                                    <tr>
                                        <th class="ps-3 py-3">Router Name</th>
                                        <th class="py-3">IP Address</th>
                                        <th class="py-3 text-center">Unique PPPoE Users</th>
                                        <th class="py-3 text-end"><i class="fas fa-arrow-up text-primary me-1"></i>Total Upload</th>
                                        <th class="py-3 text-end"><i class="fas fa-arrow-down text-success me-1"></i>Total Download</th>
                                        <th class="pe-3 py-3 text-end">Total Bandwidth</th>
                                    </tr>
                                </thead>
                                <tbody id="tableRouterWiseBody">
                                    <tr>
                                        <td colspan="6" class="text-center py-4 text-muted">
                                            Click the "Query Reports" button to pull router-wise traffic aggregates.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>
</div>

<!-- AJAX Report Fetcher & CSV Exporter -->
<script>
document.addEventListener("DOMContentLoaded", function() {
    let reportDataCache = [];
    let currentTab = 'history'; // history, top_users, router_wise

    // Initialize Select2 if supported (fallback if not loaded)
    try {
        if (typeof jQuery !== 'undefined' && jQuery.fn.select2) {
            jQuery('#filterCustomerId').select2({
                theme: 'bootstrap-5',
                width: '100%'
            });
        }
    } catch(e) {}

    // Track active Tab switching
    const tabTriggerEl = document.querySelectorAll('#reportTabs button');
    tabTriggerEl.forEach(el => {
        el.addEventListener('shown.bs.tab', event => {
            const targetId = event.target.id;
            if (targetId === 'history-tab') currentTab = 'history';
            else if (targetId === 'topusers-tab') currentTab = 'top_users';
            else if (targetId === 'routerwise-tab') currentTab = 'router_wise';
            
            fetchReportData(); // Query automatically on tab switch if needed
        });
    });

    // Fetch reports via AJAX
    function fetchReportData() {
        const dateFrom = document.getElementById('filterDateFrom').value;
        const dateTo = document.getElementById('filterDateTo').value;
        const routerId = document.getElementById('filterRouterId').value;
        const customerId = document.getElementById('filterCustomerId').value;

        const tableBody = getActiveTableBody();
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-muted">
                    <span class="spinner-border spinner-border-sm text-success me-2"></span>
                    Running database aggregated query for dates: ${dateFrom} to ${dateTo}...
                </td>
            </tr>
        `;

        let url = `index.php?action=get_usage_reports_data&type=${currentTab}&date_from=${dateFrom}&date_to=${dateTo}&router_id=${routerId}&customer_id=${customerId}`;
        
        fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                reportDataCache = data.records;
                renderReportTable(data);
            } else {
                showReportError(data.message || 'Database query failed.');
            }
        })
        .catch(err => {
            showReportError('API Connection failed. Ensure the server is online.');
        });
    }

    function getActiveTableBody() {
        if (currentTab === 'history') return document.getElementById('tableHistoryBody');
        if (currentTab === 'top_users') return document.getElementById('tableTopUsersBody');
        return document.getElementById('tableRouterWiseBody');
    }

    function renderReportTable(data) {
        const tbody = getActiveTableBody();
        tbody.innerHTML = '';
        
        const records = data.records;
        
        if (records.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-4 text-muted">
                        <i class="fas fa-info-circle me-1"></i> No usage records found matching the selected filters.
                    </td>
                </tr>
            `;
            document.getElementById('historySummaryCard').style.display = 'none';
            return;
        }

        if (currentTab === 'history') {
            // Render detailed history logs
            document.getElementById('historySummaryCard').style.display = 'flex';
            document.getElementById('sumUpload').innerText = data.summary.total_upload;
            document.getElementById('sumDownload').innerText = data.summary.total_download;
            document.getElementById('sumCombined').innerText = data.summary.total_bandwidth;

            let html = '';
            records.forEach(r => {
                html += `
                    <tr>
                        <td class="ps-3 fw-semibold text-dark">${r.date}</td>
                        <td class="font-monospace fw-bold text-dark">${r.username}</td>
                        <td>${r.client_name}</td>
                        <td class="text-end fw-semibold text-primary font-monospace">${r.upload}</td>
                        <td class="text-end fw-semibold text-success font-monospace">${r.download}</td>
                        <td class="text-end fw-bold font-monospace text-dark">${r.total}</td>
                        <td class="text-center text-secondary">${r.uptime}</td>
                        <td class="pe-3 text-center">
                            <span class="badge bg-light text-secondary border font-monospace" style="font-size:0.75rem;">${r.router_name}</span>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } 
        else if (currentTab === 'top_users') {
            // Render Top consumers table
            let html = '';
            records.forEach(r => {
                let medal = '';
                if (r.rank === 1) medal = '🥇 ';
                else if (r.rank === 2) medal = '🥈 ';
                else if (r.rank === 3) medal = '🥉 ';
                
                html += `
                    <tr>
                        <td class="ps-3 text-center fw-bold text-dark">${medal}${r.rank}</td>
                        <td class="font-monospace fw-bold text-dark">${r.username}</td>
                        <td>${r.client_name}</td>
                        <td><span class="badge bg-light text-dark border">${r.package}</span></td>
                        <td class="text-end fw-semibold text-primary font-monospace">${r.upload}</td>
                        <td class="text-end fw-semibold text-success font-monospace">${r.download}</td>
                        <td class="pe-3 text-end fw-bold font-monospace text-dark">${r.total}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } 
        else if (currentTab === 'router_wise') {
            // Render Router totals table
            let html = '';
            records.forEach(r => {
                html += `
                    <tr>
                        <td class="ps-3 fw-bold text-dark">${r.router_name}</td>
                        <td class="font-monospace">${r.ip_address}</td>
                        <td class="text-center fw-bold text-primary">${r.unique_users}</td>
                        <td class="text-end fw-semibold text-primary font-monospace">${r.upload}</td>
                        <td class="text-end fw-semibold text-success font-monospace">${r.download}</td>
                        <td class="pe-3 text-end fw-bold font-monospace text-dark">${r.total}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }
    }

    function showReportError(msg) {
        const tbody = getActiveTableBody();
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4 text-danger font-semibold">
                    <i class="fas fa-exclamation-triangle me-2"></i> ${msg}
                </td>
            </tr>
        `;
        document.getElementById('historySummaryCard').style.display = 'none';
    }

    // Export cached datatable data to CSV
    function exportToCSV() {
        if (reportDataCache.length === 0) {
            alert('No records loaded to export. Run a query first!');
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        let headers = [];
        let rows = [];

        if (currentTab === 'history') {
            headers = ["Date", "Username", "Client Name", "Upload", "Download", "Total Combined", "Uptime", "Router"];
            rows = reportDataCache.map(r => [
                r.date, r.username, r.client_name, r.upload, r.download, r.total, r.uptime, r.router_name
            ]);
        } else if (currentTab === 'top_users') {
            headers = ["Rank", "Username", "Client Name", "Package Profile", "Upload Traffic", "Download Traffic", "Total Consumption"];
            rows = reportDataCache.map(r => [
                r.rank, r.username, r.client_name, r.package, r.upload, r.download, r.total
            ]);
        } else if (currentTab === 'router_wise') {
            headers = ["Router Name", "IP Address", "Unique Users", "Total Upload", "Total Download", "Total Combined Bandwidth"];
            rows = reportDataCache.map(r => [
                r.router_name, r.ip_address, r.unique_users, r.upload, r.download, r.total
            ]);
        }

        // Add UTF-8 BOM so MS Excel opens Arabic/Bengali chars correctly
        csvContent += "\uFEFF";
        
        // Add headers
        csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
        
        // Add rows
        rows.forEach(row => {
            csvContent += row.map(val => {
                let cellVal = val === null || val === undefined ? '' : String(val);
                return `"${cellVal.replace(/"/g, '""')}"`;
            }).join(",") + "\n";
        });

        // Trigger download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        
        const dateFrom = document.getElementById('filterDateFrom').value;
        const dateTo = document.getElementById('filterDateTo').value;
        link.setAttribute("download", `ISP_Bandwidth_Report_${currentTab}_${dateFrom}_to_${dateTo}.csv`);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Sync Bandwidth Now Action
    document.getElementById('btnSyncNow').addEventListener('click', function() {
        const btn = document.getElementById('btnSyncNow');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Syncing...`;

        fetch('index.php?action=sync_now')
        .then(res => res.json())
        .then(data => {
            btn.disabled = false;
            btn.innerHTML = origText;
            if (data.success) {
                alert(data.summary || 'Bandwidth synced successfully!');
                window.location.reload();
            } else {
                alert(data.message || 'Sync failed.');
            }
        })
        .catch(err => {
            btn.disabled = false;
            btn.innerHTML = origText;
            alert('API Connection failed during sync.');
        });
    });

    // Event Bindings
    document.getElementById('btnFilterSubmit').addEventListener('click', fetchReportData);
    document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);

    // Initial Load
    fetchReportData();
});
</script>
