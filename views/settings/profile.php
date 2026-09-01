<?php
// PROFILE VIEW
$client_id = intval($_GET['view_id'] ?? 0);
$c = safeFetch($pdo, "SELECT u.*, r.name as r_name FROM ".TBL_USERS." u LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id WHERE u.id=?", [$client_id]);

if (!$c) { echo "<div class='alert alert-danger'>Client not found.</div>"; return; }

$services = safeFetchAll($pdo, "SELECT * FROM ".TBL_SERVICES);
$offers = safeFetchAll($pdo, "SELECT * FROM ".TBL_OFFERS." WHERE status='Active' AND (staff_id=? OR staff_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id=?))", [$user, $user]);

// Fetch Recharge History (Short for sidebar)
$recharge_history = safeFetchAll($pdo, "SELECT * FROM ".TBL_LOGS." WHERE target_id=? AND action_type IN ('Recharge', 'Add Client') ORDER BY timestamp DESC LIMIT 5", [$client_id]);

// Fetch All History (For Modal)
$all_history = safeFetchAll($pdo, "SELECT * FROM ".TBL_LOGS." WHERE target_id=? AND action_type IN ('Recharge', 'Add Client', 'Pay Due', 'Pay Expire', 'Make Left', 'Extend Service') ORDER BY timestamp DESC", [$client_id]);

// Check if online
$is_online = false;
$ip = $c['assigned_ip'] ?? 'N/A';
$mac = $c['onu_mac'] ?? 'N/A';

if ($c['router_id'] > 0) {
    // We skip synchronous MikroTik checks here to avoid page hang.
    // Status and live stats will be loaded via AJAX.
}
?>

<div class="row">
    <div class="col-md-4">
        <div class="card mb-3 shadow-sm border-0">
            <div class="card-header text-white d-flex justify-content-between align-items-center py-3" style="background-color: #212529;">
                <h6 class="mb-0 fw-bold"><i class="fas fa-user-circle me-2"></i> Client Identity</h6>
                <span class="badge <?= ($c['status'] == 'Active') ? 'bg-light text-success' : 'bg-light text-danger' ?>"><?= $c['status'] ?></span>
            </div>
            <div class="card-body p-0" style="max-height: 700px; overflow-y: auto;">
                <div class="p-3">
                    <div class="text-center mb-4 position-relative">
                        <div class="position-relative d-inline-block">
                            <?php 
                            $pic_path = $c['profile_pic'] ? ltrim($c['profile_pic'], '/') : '';
                            if($pic_path && file_exists(__DIR__ . '/../../' . $pic_path)): 
                            ?>
                                <img src="/<?= htmlspecialchars($pic_path) ?>" class="rounded-circle shadow-sm border mb-3" style="width: 120px; height: 120px; object-fit: cover;">
                            <?php else: ?>
                                <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center mx-auto mb-3 shadow-sm" style="width: 120px; height: 120px; font-size: 3rem; font-weight: bold;">
                                    <?= strtoupper(substr($c['name'], 0, 1)) ?>
                                </div>
                            <?php endif; ?>
                            <div id="status_light" class="position-absolute border border-white border-3 rounded-circle" style="width: 25px; height: 25px; bottom: 20px; right: 5px; background-color: <?= $is_online ? '#28a745' : '#dc3545' ?>;"></div>
                        </div>
                        <div class="h3 mb-0 fw-bold text-dark"><?= $c['name'] ?></div>
                        <div class="text-primary fw-bold small"><?= !empty($c['client_code']) ? htmlspecialchars($c['client_code']) : htmlspecialchars($c['user_id']) ?></div>
                    </div>
                    
                    <h6 class="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">Basic Info</h6>
                    <div class="d-flex justify-content-between small mb-2"><span>Phone:</span> <strong><?= $c['phone'] ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Alt Phone:</span> <span class="text-muted"><?= $c['phone2'] ?: 'N/A' ?></span></div>
                    <?php if (!empty($c['client_code'])): ?>
                        <div class="d-flex justify-content-between small mb-2"><span>Custom ID:</span> <strong class="text-primary"><?= htmlspecialchars($c['client_code']) ?></strong></div>
                    <?php endif; ?>
                    <div class="d-flex justify-content-between small mb-2"><span>NID/ID:</span> <span class="text-muted"><?= $c['nid'] ?: 'N/A' ?></span></div>
                    <div class="d-flex justify-content-between small mb-3"><span>Joined:</span> <span class="text-muted"><?= date('d M Y', strtotime($c['joining_date'])) ?></span></div>

                    <h6 class="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">Network Setup</h6>
                    <div class="d-flex justify-content-between small mb-2"><span>Package:</span> <strong class="text-success"><?= $c['user_package'] ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Net Bill Amount:</span> <strong>৳<?= number_format($c['bill_amount'],2) ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2 <?= (isset($c['due']) && $c['due'] > 0) ? 'text-danger' : 'text-success' ?>"><span>Due Balance:</span> <strong>৳<?= number_format($c['due'] ?? 0, 2) ?></strong></div>
                    <?php if ($c['discount'] > 0): ?>
                    <div class="d-flex justify-content-between small mb-2 text-success"><span>Included Discount:</span> <strong>৳<?= number_format($c['discount'],2) ?></strong></div>
                    <?php endif; ?>
                    <div class="d-flex justify-content-between small mb-2"><span>Bill Status:</span> <span class="badge bg-light text-primary border"><?= $c['bill_position'] ?: 'Paid' ?></span></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Expiry:</span> <strong class="<?= ($c['status'] == 'Free') ? 'text-success' : 'text-danger' ?>"><?= ($c['status'] == 'Free') ? 'Infinity' : date('d M Y', strtotime($c['current_bill_date'])) ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Router:</span> <span class="text-muted"><?= $c['r_name'] ?: 'N/A' ?></span></div>
                    <div class="d-flex justify-content-between small mb-2 bg-light p-1 rounded border-start border-3 border-danger"><span>Caller ID (Live):</span> <span id="live_mikrotik_mac" class="text-danger fw-bold"><i class="fas fa-spinner fa-spin small"></i></span></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Zone:</span> <span class="text-muted"><?= $c['zone_name'] ?? 'Default' ?></span></div>
                    <div class="d-flex justify-content-between small mb-2"><span>TJ / Box:</span> <span class="text-muted"><?= $c['tj_box_name'] ?: 'N/A' ?></span></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Conn Type:</span> <span class="text-muted"><?= $c['connection_type'] ?: 'N/A' ?></span></div>
                    <div class="d-flex justify-content-between small mb-1 align-items-center">
                        <span>MAC:</span> 
                        <span class="text-muted small"><?= $mac ?></span>
                    </div>
                    <div id="onu_signal_container" class="mt-2" style="display:none;">
                        <div class="alert alert-info p-2 mb-0 small shadow-sm d-flex align-items-center">
                            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                            <span>Checking ONU Signal...</span>
                        </div>
                    </div>

                    <h6 class="text-muted small fw-bold text-uppercase border-bottom pb-1 mb-2">Location & Logs</h6>
                    <div class="d-flex justify-content-between small mb-2"><span>District:</span> <strong class="text-dark"><?= $c['district'] ?: 'N/A' ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Thana:</span> <strong class="text-dark"><?= $c['thana'] ?: 'N/A' ?></strong></div>
                    <div class="d-flex justify-content-between small mb-2"><span>Client Type:</span> <strong class="text-primary"><?= $c['client_type'] ?: 'Home' ?></strong></div>
                    <div class="small mb-2">
                        <span class="text-muted d-block small">Address:</span>
                        <strong><?= $c['address'] ?: 'No address provided' ?></strong>
                    </div>
                    <div class="d-flex justify-content-between small mb-2">
                        <span>GPS:</span> 
                        <?php if($c['lat_long']): ?>
                            <a href="https://www.google.com/maps/search/?api=1&query=<?= $c['lat_long'] ?>" target="_blank" class="text-decoration-none">
                                <i class="fas fa-map-marker-alt text-danger me-1"></i> View Map
                            </a>
                        <?php else: ?>
                            <span class="text-muted small">Not set</span>
                        <?php endif; ?>
                    </div>
                    <div class="small mb-1">
                        <span class="text-muted d-block small">Remarks:</span>
                        <span class="text-muted italic small"><?= $c['remarks'] ?: 'None' ?></span>
                    </div>

                    <div class="d-flex justify-content-between align-items-center border-bottom pb-1 mb-2 mt-3">
                        <h6 class="text-muted small fw-bold text-uppercase mb-0">Recharge History</h6>
                        <button class="btn btn-link btn-sm p-0 text-primary text-decoration-none small" data-bs-toggle="modal" data-bs-target="#allHistoryModal">View</button>
                    </div>
                    <?php if(empty($recharge_history)): ?>
                        <div class="text-muted small italic">No history found.</div>
                    <?php else: ?>
                        <?php foreach($recharge_history as $log): ?>
                            <div class="mb-2 pb-2 border-bottom border-light">
                                <div class="d-flex justify-content-between small">
                                    <span class="fw-bold"><?= $log['action_type'] ?></span>
                                    <span class="text-muted" style="font-size: 0.75rem;"><?= date('d M, h:i A', strtotime($log['timestamp'])) ?></span>
                                </div>
                                <div class="text-muted" style="font-size: 0.8rem; line-height: 1.2;"><?= $log['description'] ?></div>
                            </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Live Usage Graph Section -->
    <div class="col-md-8">
        <div class="card mb-3 shadow-sm border-0">
            <div class="card-header bg-white border-bottom py-3">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-bolt me-2 text-warning"></i> Quick Actions</h6>
            </div>
            <div class="card-body">
                <form method="POST" class="row g-2">
                    <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                    <div class="col-md-5">
                        <select name="offer_id" id="rechargeOfferSelect" class="form-select form-select-sm">
                            <option value="0">Regular Recharge (30 Days)</option>
                            <?php foreach($offers as $o): ?>
                                <option value="<?= $o['id'] ?>"><?= $o['name'] ?> (<?= $o['buy_days'] ?>+<?= $o['free_days'] ?> Days)</option>
                            <?php endforeach; ?>
                            <option value="custom">Manual Days...</option>
                        </select>
                    </div>
                    <div id="manual_days_div" class="col-md-2" style="display:none;">
                        <input type="number" name="days" class="form-control form-control-sm" placeholder="Days" value="30">
                    </div>
                    <div class="col-md-3">
                        <select name="pay_method" id="recharge_pay_method" class="form-select form-select-sm fw-bold text-success border-success">
                            <option value="Cash">Cash</option>
                            <option value="Bank">Bank</option>
                            <option value="bKash">bKash</option>
                            <option value="Nagad">Nagad</option>
                            <option value="Rocket">Rocket</option>
                            <option value="Expire">Due</option>
                        </select>
                    </div>
                    <div id="recharge_trx_id_div" class="col-md-2" style="display:none;">
                        <input type="text" name="trx_id" id="recharge_trx_id_input" class="form-control form-control-sm" placeholder="Memo/TrxID">
                    </div>
                    <?php if (floatval($c['due'] ?? 0) > 0): ?>
                    <div class="col-12" id="recharge_due_deduct_wrap">
                        <div class="form-check form-switch border rounded-3 px-3 py-2 bg-light">
                            <input class="form-check-input ms-0 me-2" type="checkbox" name="deduct_due_balance" value="1" id="recharge_deduct_due">
                            <label class="form-check-label small" for="recharge_deduct_due">
                                <strong>Deduct Due Balance First</strong> — Current Due: <span class="text-danger fw-bold">৳<?= number_format(floatval($c['due']), 2) ?></span>. Remaining payment will be used for recharge validity.
                            </label>
                        </div>
                    </div>
                    <?php endif; ?>
                    <div class="col-md-4 mt-2">
                        <button type="submit" name="recharge" class="btn btn-primary btn-sm w-100 rounded-pill shadow-sm">Recharge Now</button>
                    </div>
                </form>
                <hr class="bg-light">
                <div class="d-flex flex-wrap gap-2">
                    <?php if (isset($c['due']) && $c['due'] > 0): ?>
                    <button class="btn btn-success btn-sm rounded-pill px-3 shadow-sm text-white" data-bs-toggle="modal" data-bs-target="#payDueModal">
                        <i class="fas fa-hand-holding-usd me-1"></i> Pay Due
                    </button>
                    <?php endif; ?>
                    <button class="btn btn-warning btn-sm rounded-pill px-3 shadow-sm btn-toggle-service" data-id="<?= $c['id'] ?>" data-status="<?= $c['status'] ?>">
                        <i class="fas <?= ($c['status']=='Active' || $c['status']=='Expire') ? 'fa-pause' : 'fa-play' ?> me-1"></i> <?= ($c['status']=='Active' || $c['status']=='Expire') ? 'Disable' : 'Enable' ?> Service
                    </button>
                    <button class="btn btn-info btn-sm text-white rounded-pill px-3 shadow-sm btn-extend-service" data-id="<?= $c['id'] ?>" data-days="3"><i class="fas fa-calendar-plus me-1"></i> 3 Days Credit</button>
                    <button class="btn btn-outline-danger btn-sm rounded-pill px-3 shadow-sm btn-make-left" data-id="<?= $c['id'] ?>"><i class="fas fa-user-slash me-1"></i> Make Left</button>
                    <a href="?tab=edit_client&uid=<?= $c['id'] ?>" class="btn btn-outline-secondary btn-sm rounded-pill px-3 shadow-sm"><i class="fas fa-edit me-1"></i> Edit Profile</a>
                </div>
            </div>
        </div>

        <div class="card mb-3 shadow-sm border-0">
             <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center py-3">
                <h6 class="mb-0 fw-bold"><i class="fas fa-chart-line me-2"></i> Live Usage Graph</h6>
                <div>
                    <span class="badge bg-primary rounded-pill" id="live_rx">0</span> <small class="text-white-50">Rx</small>
                    <span class="badge bg-danger rounded-pill ms-2" id="live_tx">0</span> <small class="text-white-50">Tx</small>
                </div>
            </div>
            <div class="card-body p-2" style="height: 300px;">
                <canvas id="bwChart"></canvas>
            </div>
            <div class="card-footer bg-white border-top-0 d-flex flex-wrap justify-content-between gap-3 py-3">
                <div class="small">
                    <span class="text-muted d-block small">Session Upload:</span> <strong id="session_up" class="text-danger">0 B</strong>
                </div>
                <div class="small">
                    <span class="text-muted d-block small">Session Download:</span> <strong id="session_down" class="text-primary">0 B</strong>
                </div>
                <div class="small">
                    <span class="text-muted d-block small">Active Time:</span> <strong id="session_uptime" class="text-dark">0:00:00</strong>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Pay Due Modal -->
<div class="modal fade" id="payDueModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title"><i class="fas fa-hand-holding-usd"></i> Collect Due Payment</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="uid" value="<?= $c['id'] ?>">
                <div class="mb-3">
                    <label class="form-label text-muted small fw-bold">Amount Receiving (৳)</label>
                    <input type="number" name="amount" class="form-control" step="0.01" value="<?= $c['due'] ?? 0 ?>" required>
                </div>
                <div class="mb-3">
                    <label class="form-label text-muted small fw-bold">Payment Method</label>
                    <select name="pay_method" id="paydue_pay_method" class="form-select">
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank</option>
                        <option value="bKash">bKash</option>
                        <option value="Nagad">Nagad</option>
                        <option value="Rocket">Rocket</option>
                    </select>
                </div>
                <div id="paydue_trx_id_div" class="mb-3" style="display:none;">
                    <label class="form-label text-muted small fw-bold text-primary">Transaction ID (Required)</label>
                    <input type="text" name="trx_id" id="paydue_trx_id_input" class="form-control border-primary" placeholder="Enter Transaction ID">
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="pay_client_due" class="btn btn-success">Mark as Paid</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal for Confirms -->
<div class="modal fade" id="confirmModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header"><h5 class="modal-title" id="confirmTitle">Confirm</h5></div>
            <div class="modal-body" id="confirmBody"></div>
            <div class="modal-footer">
                <input type="hidden" name="id" id="confirmId">
                <input type="hidden" name="current_status" id="confirmCurStatus">
                <input type="hidden" name="extension_days" id="confirmExtDays">
                <input type="hidden" name="action" id="confirmActionInput">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">No</button>
                <button type="submit" name="" id="confirmSubmitBtn" class="btn btn-primary">Yes, Proccess</button>
            </div>
        </form>
    </div>
</div>

<script>
    // Toggle manual days input based on offer selection
    function toggleManualDays(sel) {
        document.getElementById('manual_days_div').style.display = (sel.value === 'custom') ? 'block' : 'none';
    }

    function toggleTrxId(sel, divId, inputId) {
        const div = document.getElementById(divId);
        const input = document.getElementById(inputId);
        const label = div.querySelector('label');
        const methodsRequiringTrx = ['Bank', 'bKash', 'Nagad', 'Rocket'];
        
        if (methodsRequiringTrx.includes(sel.value)) {
            div.style.display = 'block';
            input.setAttribute('required', 'required');
            input.placeholder = "Transaction ID";
            if (label) label.innerHTML = "Transaction ID (Required)";
        } else if (sel.value === 'Cash') {
            div.style.display = 'block';
            input.removeAttribute('required');
            input.placeholder = "Memo No (Optional)";
            if (label) label.innerHTML = "Memo No (Optional)";
        } else {
            div.style.display = 'none';
            input.removeAttribute('required');
        }
    }

    function confirmAction(action, id, extra) {
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        document.getElementById('confirmId').value = id;
        document.getElementById('confirmActionInput').value = action;
        document.getElementById('confirmSubmitBtn').name = action;
        
        if(action === 'toggle_service') {
            document.getElementById('confirmTitle').innerText = "Toggle Service";
            document.getElementById('confirmBody').innerText = "Are you sure you want to change the status of this client?";
            document.getElementById('confirmCurStatus').value = extra;
        } else if(action === 'extend_service') {
             document.getElementById('confirmTitle').innerText = "Extend Service";
             document.getElementById('confirmBody').innerText = "Give " + extra + " days of credit extension to this user?";
             document.getElementById('confirmExtDays').value = extra;
        }
        modal.show();
    }

    // Graph & Accumulation Logic
    const CLIENT_ID = <?= $c['id'] ?>;
    const POLLING_INTERVAL = 5000;
    const STORAGE_KEY = `profile_session_${CLIENT_ID}`;

    // Persistent storage initialization
    let stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"up":0, "down":0, "last_uptime":0, "online":false}');
    let session_up_bytes = stored.up || 0;
    let session_down_bytes = stored.down || 0;
    let last_uptime_secs = stored.last_uptime || 0;
    let is_online_prev = stored.online || false;

    const ctx = document.getElementById('bwChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'RX (Download)',
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                data: [],
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }, {
                label: 'TX (Upload)',
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                data: [],
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { display: true, grid: { display: false } },
                y: { display: true, beginAtZero: true, title: { display: true, text: 'Mbps' } }
            },
            plugins: { legend: { position: 'top' } }
        }
    });
    
    function formatBytesJS(bytes, decimals = 2) {
        if (!+bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function updateGraph() {
        fetch('?ajax_bw=1&uid=' + CLIENT_ID) 
        .then(r => r.json())
        .then(d => {
            console.log("Graph Update:", d);
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            if(chart.data.labels[chart.data.labels.length - 1] !== now) {
                if(chart.data.labels.length > 40){
                    chart.data.labels.shift();
                    chart.data.datasets.forEach(ds => ds.data.shift());
                }
                chart.data.labels.push(now);
                
                const is_active = (d.status === 'online');
                const up_mbps = is_active ? (parseFloat(d.up_speed) || 0) : 0; 
                const down_mbps = is_active ? (parseFloat(d.down_speed) || 0) : 0;

                chart.data.datasets[0].data.push(down_mbps); 
                chart.data.datasets[1].data.push(up_mbps);
                
                if(document.getElementById('live_tx')) document.getElementById('live_tx').innerText = up_mbps.toFixed(2);
                if(document.getElementById('live_rx')) document.getElementById('live_rx').innerText = down_mbps.toFixed(2);
 
                // Update status light
                const light = document.getElementById('status_light');
                if(light) light.style.backgroundColor = is_active ? '#28a745' : '#dc3545';

                // Update Caller ID (ONU Database MAC fallback)
                const callerIdSpan = document.getElementById('live_caller_id');
                if (callerIdSpan && d.mac && is_active) {
                    callerIdSpan.innerHTML = `<span class="text-success fw-bold">${d.mac}</span>`;
                } else if (callerIdSpan && !is_active) {
                    callerIdSpan.innerHTML = `<?= $mac ?>`; // Revert to database MAC if offline
                }
                
                // Update Live Mikrotik Caller ID Monitor
                const liveMacSpan = document.getElementById('live_mikrotik_mac');
                if (liveMacSpan) {
                    liveMacSpan.innerHTML = (is_active && d.mac) ? `<i class="fas fa-satellite-dish me-1 small"></i>${d.mac}` : '<span class="text-muted fw-normal italic">Offline</span>';
                }

                // Session Logic - Accumulative Every 5s
                if(d.status === 'online') {
                    const current_uptime_str = d.uptime || "00:00:00";
                    const hms = current_uptime_str.match(/(\d+):(\d+):(\d+)/);
                    let current_uptime_secs = 0;
                    if(hms) current_uptime_secs = (parseInt(hms[1]) * 3600) + (parseInt(hms[2]) * 60) + parseInt(hms[3]);
                    
                    if(!is_online_prev || current_uptime_secs < last_uptime_secs) {
                        // Reset session counters ONLY on a fresh connection or uptime reset
                        session_up_bytes = 0;
                        session_down_bytes = 0;
                        console.log("New session detected. Counter reset.");
                    }
                    
                    const slice_up = (up_mbps * 125000) * (POLLING_INTERVAL / 1000);
                    const slice_down = (down_mbps * 125000) * (POLLING_INTERVAL / 1000);
                    
                    session_up_bytes += slice_up;
                    session_down_bytes += slice_down;
                    last_uptime_secs = current_uptime_secs;
                    is_online_prev = true;
                } else {
                    is_online_prev = false;
                    last_uptime_secs = 0;
                }

                // Save to localStorage
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    up: session_up_bytes,
                    down: session_down_bytes,
                    last_uptime: last_uptime_secs,
                    online: is_online_prev
                }));

                if(document.getElementById('session_up')) document.getElementById('session_up').innerText = formatBytesJS(session_up_bytes);
                if(document.getElementById('session_down')) document.getElementById('session_down').innerText = formatBytesJS(session_down_bytes);
                if(document.getElementById('session_uptime')) document.getElementById('session_uptime').innerText = d.uptime || '0:00:00';
                
                chart.update('none'); 
            }
        })
        .catch(err => {
            console.error("Fetch/Graph Error:", err);
            // Push zeroes to keep the graph moving
            if(chart.data.labels.length > 0) {
                 chart.data.labels.push(new Date().toLocaleTimeString());
                 chart.data.datasets.forEach(ds => ds.data.push(0));
                 chart.update('none');
            }
        });
    }

    function pollGraph() {
        updateGraph();
        setTimeout(pollGraph, POLLING_INTERVAL);
    }

    // Start Polling
    pollGraph();

    function openLeftModal(id) {
        document.getElementById('leftClientId').value = id;
        new bootstrap.Modal(document.getElementById('leftModal')).show();
    }

    // ONU Signal Auto-Check
    (function() {
        const ONU_MAC = '<?= $c['onu_mac'] ?: ($mac != 'N/A' ? $mac : '') ?>';
        if (ONU_MAC && ONU_MAC !== 'N/A' && ONU_MAC !== '') {
            const signalContainer = document.getElementById('onu_signal_container');
            if(signalContainer) {
                signalContainer.style.display = 'block';
                fetch(`index.php?ajax_find_onu_signal=1&mac=${encodeURIComponent(ONU_MAC)}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.error) {
                            signalContainer.innerHTML = `<div class="alert alert-light border p-2 mb-0 small text-muted"><i class="fas fa-info-circle me-1"></i> ${data.error}</div>`;
                        } else {
                            let rx = data.rx || data.rx_power || 'N/A';
                            let tx = data.tx || data.tx_power || 'N/A';
                            
                            let rx_val = parseFloat(rx);
                            let rx_class = 'text-success';
                            if (rx_val < -27) rx_class = 'text-danger fw-bold';
                            else if (rx_val < -24) rx_class = 'text-warning fw-bold';

                            signalContainer.innerHTML = `
                                <div class="alert alert-success p-2 mb-0 small shadow-sm border-0 border-start border-4 border-success">
                                    <strong><i class="fas fa-microchip me-1"></i> ONU Live Signal</strong><br>
                                    <span class="text-muted">OLT:</span> ${data.olt_name} (${data.interface})<br>
                                    <span class="text-muted">Rx:</span> <span class="${rx_class}">${rx} dBm</span> | 
                                    <span class="text-muted">Tx:</span> ${tx} dBm
                                </div>
                            `;
                        }
                    })
                    .catch(e => {
                        console.error("ONU Signal Error:", e);
                        signalContainer.style.display = 'none';
                    });
            }
        }
    })();

    document.addEventListener("DOMContentLoaded", function() {
        const payduePayMethodSelect = document.getElementById('paydue_pay_method');
        if (payduePayMethodSelect) {
            payduePayMethodSelect.addEventListener('change', function() {
                toggleTrxId(this, 'paydue_trx_id_div', 'paydue_trx_id_input');
            });
            // Set initial visibility on load
            toggleTrxId(payduePayMethodSelect, 'paydue_trx_id_div', 'paydue_trx_id_input');
        }

        const rechargeOfferSelect = document.getElementById('rechargeOfferSelect');
        if (rechargeOfferSelect) {
            rechargeOfferSelect.addEventListener('change', function() {
                toggleManualDays(this);
            });
        }

        const rechargePayMethodSelect = document.getElementById('recharge_pay_method');
        if (rechargePayMethodSelect) {
            const syncRechargeDueOption = function() {
                toggleTrxId(rechargePayMethodSelect, 'recharge_trx_id_div', 'recharge_trx_id_input');
                const dueCheck = document.getElementById('recharge_deduct_due');
                const dueWrap = document.getElementById('recharge_due_deduct_wrap');
                if (dueCheck) {
                    const isDueMethod = rechargePayMethodSelect.value === 'Expire';
                    dueCheck.disabled = isDueMethod;
                    if (isDueMethod) dueCheck.checked = false;
                    if (dueWrap) dueWrap.style.opacity = isDueMethod ? '0.55' : '1';
                }
            };
            rechargePayMethodSelect.addEventListener('change', syncRechargeDueOption);
            syncRechargeDueOption();
        }

        const btnToggle = document.querySelector('.btn-toggle-service');
        if (btnToggle) {
            btnToggle.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                const status = this.getAttribute('data-status');
                confirmAction('toggle_service', id, status);
            });
        }

        const btnExtend = document.querySelector('.btn-extend-service');
        if (btnExtend) {
            btnExtend.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                const days = this.getAttribute('data-days');
                confirmAction('extend_service', id, days);
            });
        }

        const btnLeft = document.querySelector('.btn-make-left');
        if (btnLeft) {
            btnLeft.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                openLeftModal(id);
            });
        }
    });
</script>

<!-- Make Left Modal -->
<div class="modal fade" id="leftModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header bg-danger text-white"><h5 class="modal-title">Confirm Termination</h5></div>
            <div class="modal-body">
                <input type="hidden" name="id" id="leftClientId">
                <input type="hidden" name="make_left_confirm" value="1">
                <input type="hidden" name="action" value="make_left_confirm">
                <p>Are you sure you want to mark this client as <strong>Left</strong>?</p>
                <div class="mb-3">
                    <label class="form-label fw-bold">Refund Method:</label>
                    <select name="refund_method" class="form-select" required>
                        <option value="Wallet">Wallet (Add to my balance)</option>
                        <option value="Cash">Cash (Manual settlement)</option>
                        <option value="None">No Refund</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="make_left_confirm" class="btn btn-danger">Confirm</button>
            </div>
        </form>
    </div>
</div>
<!-- All History Modal -->
<div class="modal fade" id="allHistoryModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title"><i class="fas fa-history me-2"></i> Complete Transaction History</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <!-- Date Filter Section -->
                <div class="bg-light border-bottom p-3 d-flex flex-wrap gap-2 align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-2">
                        <input type="date" id="historyFilterStart" class="form-control form-control-sm" placeholder="Start Date">
                        <span class="text-muted small">to</span>
                        <input type="date" id="historyFilterEnd" class="form-control form-control-sm" placeholder="End Date">
                        <button class="btn btn-primary btn-sm" id="historyFilterBtn">Filter</button>
                        <button class="btn btn-outline-secondary btn-sm" id="historyResetBtn">Reset</button>
                    </div>
                </div>
                <!-- Scrollable Table -->
                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-striped table-hover mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Date & Time</th>
                                <th>Action</th>
                                <th>Description</th>
                                <th>Transaction ID</th>
                                <th class="pe-3">Staff</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if(empty($all_history)): ?>
                                <tr><td colspan="5" class="text-center py-3 text-muted">No history found.</td></tr>
                            <?php else: foreach($all_history as $h): 
                                $desc = $h['description'];
                                $trx_id = '---';
                                if (preg_match('/\(Trx: (.*?)\)/', $desc, $matches)) {
                                    $trx_id = $matches[1];
                                    $desc = str_replace($matches[0], '', $desc); 
                                } elseif (strpos($desc, 'Expire') !== false || strpos($desc, 'Due') !== false) {
                                    if ($h['action_type'] === 'Recharge') {
                                        $trx_id = 'Due';
                                    } elseif (in_array($h['action_type'], ['Pay Due', 'Pay Expire'])) {
                                        $trx_id = 'Cash';
                                    }
                                } elseif (in_array($h['action_type'], ['Recharge', 'Pay Due', 'Pay Expire', 'Add Client'])) {
                                    $trx_id = 'Cash';
                                }
                            ?>
                                <tr class="history-row" data-date="<?= date('Y-m-d', strtotime($h['timestamp'])) ?>">
                                    <td class="ps-3 small"><?= date('d M Y, h:i A', strtotime($h['timestamp'])) ?></td>
                                    <td><span class="badge bg-secondary"><?= $h['action_type'] ?></span></td>
                                    <td class="small" style="max-width: 250px;"><?= trim($desc) ?></td>
                                    <td class="fw-bold text-primary"><?= $trx_id ?></td>
                                    <td class="pe-3 small"><?= $h['admin_user'] ?></td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer bg-light">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>
</div>

<script>
function filterHistoryDates() {
    const start = document.getElementById('historyFilterStart').value;
    const end = document.getElementById('historyFilterEnd').value;
    const rows = document.querySelectorAll('.history-row');

    rows.forEach(row => {
        const rowDate = row.getAttribute('data-date');
        let show = true;

        if (start && rowDate < start) show = false;
        if (end && rowDate > end) show = false;

        row.style.display = show ? '' : 'none';
    });
}

function resetHistoryFilter() {
    document.getElementById('historyFilterStart').value = '';
    document.getElementById('historyFilterEnd').value = '';
    filterHistoryDates();
}

document.addEventListener("DOMContentLoaded", function() {
    const filterBtn = document.getElementById('historyFilterBtn');
    const resetBtn = document.getElementById('historyResetBtn');
    if (filterBtn) filterBtn.addEventListener('click', filterHistoryDates);
    if (resetBtn) resetBtn.addEventListener('click', resetHistoryFilter);
});
</script>
