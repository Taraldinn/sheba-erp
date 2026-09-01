<?php require_once __DIR__ . '/layout/header.php'; ?>

<!-- Current Package Section -->
<div class="card bg-gradient-purple text-white mb-4">
    <div class="card-body p-4 d-flex justify-content-between align-items-center">
        <div>
            <h6 class="text-uppercase small fw-bold opacity-75">CURRENT PACKAGE</h6>
            <h2 class="fw-bold mb-0"><?= htmlspecialchars($c['user_package'] ?? 'N/A') ?></h2>
        </div>
        <div class="bg-white bg-opacity-20 p-3 rounded-circle">
            <i class="fas fa-cube fa-2x"></i>
        </div>
    </div>
</div>

<!-- Widgets Row -->
<div class="row g-3 mb-4">
    <!-- Account Status -->
    <div class="col-6 col-md-3">
        <div class="card h-100">
            <div class="card-body d-flex align-items-center">
                <div class="p-3 rounded-circle bg-light me-3">
                    <i class="fas fa-user-check <?= $c['status'] == 'Active' ? 'text-success' : 'text-danger' ?> fa-lg"></i>
                </div>
                <div>
                    <div class="text-muted small">Status</div>
                    <div class="fw-bold <?= $c['status'] == 'Active' ? 'text-success' : 'text-danger' ?>"><?= htmlspecialchars($c['status']) ?></div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Connection Status -->
    <div class="col-6 col-md-3">
        <div class="card h-100">
            <div class="card-body d-flex align-items-center">
                <div class="p-3 rounded-circle bg-light me-3">
                    <i id="connection_icon" class="fas fa-circle-notch fa-spin text-warning fa-lg"></i>
                </div>
                <div>
                    <div class="text-muted small">Connection</div>
                    <div id="connection_status" class="fw-bold text-warning small">Checking...</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Expiry Date -->
    <div class="col-6 col-md-3">
        <div class="card h-100">
            <div class="card-body d-flex align-items-center">
                <div class="p-3 rounded-circle bg-light me-3">
                    <i class="fas fa-calendar-alt text-primary fa-lg"></i>
                </div>
                <div>
                    <div class="text-muted small">Expiry Date</div>
                    <div class="fw-bold text-dark small text-nowrap"><?= ($c['status'] == 'Free') ? 'Infinity' : date('d M Y', strtotime($c['current_bill_date'])) ?></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Plan Rate -->
    <div class="col-6 col-md-3">
        <div class="card h-100">
            <div class="card-body d-flex align-items-center">
                <div class="p-3 rounded-circle bg-light me-3">
                    <i class="fas fa-wallet text-success fa-lg"></i>
                </div>
                <div>
                    <div class="text-muted small">Plan Rate</div>
                    <div class="fw-bold text-dark">৳<?= number_format($c['bill_amount'], 2) ?></div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="row g-4">
    <!-- Left: Payment History -->
    <div class="col-lg-8">
        <div class="card h-100">
            <div class="card-header bg-transparent border-bottom py-3">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-history me-2 text-primary"></i> Recent Recharges</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover mb-0 align-middle" style="font-size: 0.88rem;">
                        <thead class="table-light">
                            <tr>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Remarks</th>
                                <th class="text-end">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($invoices_recent)): ?>
                                <tr><td colspan="4" class="text-center text-muted py-4">No recent history found.</td></tr>
                            <?php else: ?>
                                <?php foreach ($invoices_recent as $inv): 
                                    // Parse recharge amount from log description
                                    $amt = 0.00;
                                    if (preg_match('/Amount:\s*(?:৳|BDT|Tk)?\s*([0-9,.]+)/iu', $inv['description'], $matches)) {
                                        $amt = floatval(str_replace(',', '', $matches[1]));
                                    } else {
                                        $amt = floatval($c['bill_amount']);
                                    }
                                ?>
                                    <tr>
                                        <td><?= date('d M Y, h:i A', strtotime($inv['timestamp'])) ?></td>
                                        <td class="fw-bold text-success">৳<?= number_format($amt, 2) ?></td>
                                        <td class="text-muted small"><?= htmlspecialchars($inv['description']) ?></td>
                                        <td class="text-end">
                                            <a href="?panel=client&tab=recharge_invoice&id=<?= $inv['id'] ?>" class="btn btn-xs btn-outline-primary rounded-pill" style="font-size: 0.78rem; padding: 2px 8px;">
                                                <i class="fas fa-file-invoice me-1"></i> Invoice
                                            </a>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- Right: Quick Actions or Tickets -->
    <div class="col-lg-4">
        <div class="card mb-3 shadow-sm border-0">
            <div class="card-header bg-transparent border-bottom py-3 d-flex justify-content-between align-items-center">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-ticket-alt text-warning me-2"></i> Recent Tickets</h6>
                <a href="?panel=client&tab=ticket&action=new" class="btn btn-xs btn-outline-primary"><i class="fas fa-plus"></i></a>
            </div>
            <div class="card-body p-0">
                <?php if (empty($tickets)): ?>
                    <div class="text-center py-4 text-muted">
                        <div class="mb-1"><i class="fas fa-folder-open fa-lg opacity-50"></i></div>
                        <p class="small mb-2">No active tickets found.</p>
                        <a href="?panel=client&tab=ticket&action=new" class="btn btn-xs btn-light border">Open Ticket</a>
                    </div>
                <?php else: ?>
                    <ul class="list-group list-group-flush small">
                        <?php foreach (array_slice($tickets, 0, 3) as $t): ?>
                            <li class="list-group-item d-flex justify-content-between align-items-center">
                                <span class="text-truncate" style="max-width:180px;"><?= htmlspecialchars($t['category']) ?></span>
                                <span class="badge <?= $t['status'] === 'Open' ? 'bg-warning text-dark' : 'bg-success' ?> p-1"><?= $t['status'] ?></span>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
        </div>

        
        <div class="card mb-3 shadow-sm border-0">
            <div class="card-header bg-transparent border-bottom py-3">
                <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-tools text-info me-2"></i> Diagnostics</h6>
            </div>
            <div class="card-body">
                <div class="row g-2">
                    <div class="col-6">
                        <button class="btn btn-outline-info btn-sm w-100 py-2" id="btnPingTestMobile">
                            <i class="fas fa-terminal me-1"></i> Ping Test
                        </button>
                    </div>
                    <div class="col-6">
                        <button class="btn btn-outline-secondary btn-sm w-100 py-2" id="btnTraceTestMobile">
                            <i class="fas fa-route me-1"></i> IP Trace
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-body d-grid gap-2">
                <a href="?panel=client&tab=pay_bill" class="btn btn-primary btn-sm py-2">
                    <i class="fas fa-bolt me-1"></i> Pay Bill Now
                </a>
                <?php 
                    $video_url = get_opt($pdo, 'payment_tutorial_video', '');
                    if (!empty($video_url)): 
                ?>
                <a href="<?= htmlspecialchars($video_url) ?>" target="_blank" class="btn btn-outline-danger btn-sm py-2">
                    <i class="fab fa-youtube me-1"></i> Watch How to Pay
                </a>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<script>
    document.addEventListener("DOMContentLoaded", function() {
        // Fetch real connection status
        fetch('?panel=client&ajax_client_bw=1')
            .then(response => response.json())
            .then(data => {
                const icon = document.getElementById('connection_icon');
                const txt = document.getElementById('connection_status');
                if (icon && txt) {
                    if (data.status === 'online') {
                        icon.className = 'fas fa-check-circle text-success fa-lg';
                        txt.innerText = 'Online';
                        txt.className = 'fw-bold text-success';
                    } else {
                        icon.className = 'fas fa-times-circle text-danger fa-lg';
                        txt.innerText = 'Offline';
                        txt.className = 'fw-bold text-danger';
                    }
                }
            })
            .catch(err => {
                console.error("Connection Check error:", err);
                const txt = document.getElementById('connection_status');
                if (txt) txt.innerText = 'Offline';
            });
    });
</script>


<!-- Ping Modal -->
<div class="modal fade" id="pingModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow-lg">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title"><i class="fas fa-terminal me-2 text-primary"></i> Live Ping Report</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div id="pingIp" class="p-2 bg-light border-bottom small px-3 text-center fw-bold"></div>
                <div id="pingResult" class="p-3" style="min-height: 200px;">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                        <div class="mt-2 text-muted">Connecting to Router...</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary btn-sm" id="rePingBtn"><i class="fas fa-sync me-1"></i> Retest</button>
            </div>
        </div>
    </div>
</div>

<!-- Trace Modal -->
<div class="modal fade" id="traceModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow-lg">
            <div class="modal-header bg-secondary text-white">
                <h5 class="modal-title"><i class="fas fa-route me-2"></i> Network Trace Report</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div id="traceIp" class="p-2 bg-light border-bottom small px-3 text-center fw-bold"></div>
                <div id="traceResult" class="p-3" style="min-height: 200px;">
                    <div class="text-center py-5">
                        <div class="spinner-border text-secondary" role="status"></div>
                        <div class="mt-2 text-muted">Analyzing route...</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-dark btn-sm" id="reTraceBtn"><i class="fas fa-sync me-1"></i> Refresh</button>
            </div>
        </div>
    </div>
</div>

<script>
    const pingModal = new bootstrap.Modal(document.getElementById('pingModal'));
    const traceModal = new bootstrap.Modal(document.getElementById('traceModal'));

    document.addEventListener('DOMContentLoaded', function() {
        document.getElementById('btnPingTestMobile')?.addEventListener('click', runPing);
        document.getElementById('btnTraceTestMobile')?.addEventListener('click', runTrace);
    });

    function runPing() {
        document.getElementById('pingIp').innerText = "Target: Checking...";
        document.getElementById('pingResult').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Pinging from router...</div></div>';
        pingModal.show();
        executePing();
    }
    function executePing() {
        fetch('?panel=client&ajax_client_ping=1')
            .then(r => r.json())
            .then(data => {
                if(data.success) {
                    document.getElementById('pingIp').innerText = "Target IP: " + data.ip;
                    document.getElementById('pingResult').innerHTML = data.html;
                } else {
                    document.getElementById('pingResult').innerHTML = '<div class="alert alert-danger small">' + data.error + '</div>';
                }
            });
    }
    document.getElementById('rePingBtn').addEventListener('click', () => {
        document.getElementById('pingResult').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Testing...</div></div>';
        executePing();
    });

    function runTrace() {
        document.getElementById('traceIp').innerText = "Target: Checking...";
        document.getElementById('traceResult').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-secondary" role="status"></div><div class="mt-2 text-muted">Tracing path...</div></div>';
        traceModal.show();
        executeTrace();
    }
    function executeTrace() {
        fetch('?panel=client&ajax_client_trace=1')
            .then(r => r.json())
            .then(data => {
                if(data.success) {
                    document.getElementById('traceIp').innerText = "Target IP: " + data.ip;
                    document.getElementById('traceResult').innerHTML = data.html;
                } else {
                    document.getElementById('traceResult').innerHTML = '<div class="alert alert-danger small">' + data.error + '</div>';
                }
            });
    }
    document.getElementById('reTraceBtn').addEventListener('click', () => {
        document.getElementById('traceResult').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-secondary" role="status"></div><div class="mt-2 text-muted">Analyzing...</div></div>';
        executeTrace();
    });
</script>

<?php require_once __DIR__ . '/layout/footer.php'; ?>
