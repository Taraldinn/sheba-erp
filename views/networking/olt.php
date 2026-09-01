<?php
// OLT Management View
require_once __DIR__ . '/../../classes/OLTManager.php';
$oltMgr = new OLTManager($pdo);

$current_staff_id = $_SESSION['admin_id'] ?? 0;
$is_admin = hasRole('Admin');

$olts = $oltMgr->getAllOLTs($is_admin ? null : $current_staff_id);
?>

<!-- Live Network Topology quick access -->
<div class="d-flex justify-content-end mb-3 topology-quick-link">
    <a href="?tab=network_topology" class="btn btn-dark">
        <i class="fas fa-project-diagram me-2 text-info"></i> Live Network Topology
    </a>
</div>


<!-- Load Leaflet Map Library -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<style>
@keyframes blink-green {
    0% { box-shadow: 0 0 0 0 rgba(32, 201, 151, 0.7); }
    70% { box-shadow: 0 0 0 8px rgba(32, 201, 151, 0); }
    100% { box-shadow: 0 0 0 0 rgba(32, 201, 151, 0); }
}
@keyframes blink-red {
    0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); }
    70% { box-shadow: 0 0 0 8px rgba(220, 53, 69, 0); }
    100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
}

.blink-green {
    animation: blink-green 2s infinite;
}
.blink-red {
    animation: blink-red 2s infinite;
}

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
    border-top-left-radius: 12px !important;
    border-top-right-radius: 12px !important;
}
.olt-card {
    transition: transform 0.2s, box-shadow 0.2s;
    border-radius: 12px;
}
.olt-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
}
.badge-epon {
    background-color: #6f42c1;
    color: white;
}
.badge-gpon {
    background-color: #20c997;
    color: white;
}
.terminal-output-box {
    background-color: #0b0f19;
    color: #00ff66;
    padding: 1rem;
    border-radius: 8px;
    font-family: 'Courier New', Courier, monospace;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    font-size: 0.85rem;
    border: 1px solid #1e293b;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);
}
.status-badge {
    font-size: 0.8rem;
    padding: 0.4em 0.6em;
}
</style>

<div class="row">
    <div class="col-12 mb-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="fw-bold text-dark"><i class="fas fa-server me-2 text-primary"></i> OLT Monitoring System <small class="text-secondary">(Total: <?= count($olts) ?>)</small></h4>
            <button class="btn btn-primary shadow-sm" data-bs-toggle="modal" data-bs-target="#addOLTModal">
                <i class="fas fa-plus me-2"></i> Add New OLT
            </button>
        </div>
        
        <!-- OLT Navigation Tabs -->
        <ul class="nav nav-tabs mb-4 border-bottom-0 shadow-sm p-1 bg-white rounded-3" id="oltTabs" role="tablist" style="width: fit-content;">
            <li class="nav-item" role="presentation">
                <button class="nav-link active fw-bold text-dark px-4 py-2 border-0 rounded-3" id="olt-list-tab" data-bs-toggle="tab" data-bs-target="#olt-list-pane" type="button" role="tab">
                    <i class="fas fa-server me-2 text-primary"></i> OLT Devices
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link fw-bold text-dark px-4 py-2 border-0 rounded-3" id="network-map-tab" data-bs-toggle="tab" data-bs-target="#network-map-pane" type="button" role="tab">
                    <i class="fas fa-map-marked-alt me-2 text-success"></i> Network Map
                </button>
            </li>
        </ul>
    </div>
</div>

<div class="tab-content" id="oltTabsContent">
    <div class="tab-pane fade show active" id="olt-list-pane" role="tabpanel">
        <div class="row">
            <?php if(empty($olts)): ?>
    <div class="col-12">
        <div class="alert alert-info shadow-sm glass-card">
            <i class="fas fa-info-circle me-2 text-info"></i> No OLTs found in the system. Use the "Add New OLT" button above to register your first device.
        </div>
    </div>
    <?php endif; ?>
    
    <?php foreach($olts as $olt): 
        $brand_label = strtoupper(str_replace('_', ' ', $olt['brand']));
        $brand_class = (strpos(strtolower($olt['brand']), 'gpon') !== false) ? 'badge-gpon' : 'badge-epon';
    ?>
    <div class="col-md-4 mb-4">
        <div class="card shadow-sm h-100 olt-card border-0 glass-card">
            <div class="card-body d-flex flex-column justify-content-between">
                <div>
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title fw-bold text-dark mb-0"><?= htmlspecialchars($olt['name']) ?></h5>
                        <div class="text-end">
                            <span class="badge <?= $brand_class ?> mb-1"><?= htmlspecialchars($brand_label) ?></span>
                            <br>
                            <span id="status-badge-<?= $olt['id'] ?>" class="badge bg-secondary status-badge"><i class="fas fa-spinner fa-spin"></i> Checking...</span>
                        </div>
                    </div>
                    
                    <p class="card-text text-secondary mb-3 small">
                        <i class="fas fa-network-wired me-2 text-primary"></i> IP Address: <strong class="text-dark"><?= $olt['ip'] ?></strong><br>
                        <i class="fas fa-globe me-2 text-primary"></i> Web Port: <span class="text-dark"><?= $olt['port'] ?> (<?= strtoupper($olt['protocol']) ?>)</span><br>
                        <i class="fas fa-terminal me-2 text-primary"></i> Telnet Port: <span class="text-dark"><?= $olt['telnet_port'] ?? 23 ?></span>
                        <?php if (!empty($olt['latlong'])): ?>
                            <br><i class="fas fa-map-marker-alt me-2 text-danger"></i> Latlong: <a href="https://maps.google.com/?q=<?= urlencode($olt['latlong']) ?>" target="_blank" class="text-dark fw-bold"><?= htmlspecialchars($olt['latlong']) ?></a>
                        <?php endif; ?>
                    </p>
                </div>
        
                <div class="d-flex gap-1 mt-auto">
                    <button class="btn btn-sm btn-outline-primary flex-fill" data-bs-toggle="modal" data-bs-target="#editOLTModal<?= $olt['id'] ?>">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-info flex-fill" onclick="testConnection(<?= $olt['id'] ?>)">
                        <i class="fas fa-plug"></i> Test
                    </button>
                    <a href="index.php?tab=olt_onus&id=<?= $olt['id'] ?>" class="btn btn-sm btn-success flex-fill text-white fw-bold">
                        <i class="fas fa-list"></i> ONUs
                    </a>
                    <form method="POST" class="d-inline" onsubmit="return confirm('Are you sure you want to delete this OLT? This will remove cached devices and connection credentials.');">
                        <input type="hidden" name="id" value="<?= $olt['id'] ?>">
                        <button type="submit" name="delete_olt" class="btn btn-sm btn-outline-danger" title="Delete OLT">
                            <i class="fas fa-trash"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Edit Modal -->
    <div class="modal fade animate__animated animate__fadeIn" id="editOLTModal<?= $olt['id'] ?>" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content glass-card border-0">
                <form method="POST">
                    <div class="modal-header glass-header">
                        <h5 class="modal-title fw-bold text-dark"><i class="fas fa-edit text-primary me-2"></i> Edit OLT Settings</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" name="id" value="<?= $olt['id'] ?>">
                        <div class="mb-3">
                            <label class="form-label fw-bold text-secondary">OLT Name</label>
                            <input type="text" name="name" class="form-control" value="<?= htmlspecialchars($olt['name']) ?>" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold text-secondary">OLT Latlong</label>
                            <input type="text" name="latlong" class="form-control" value="<?= htmlspecialchars($olt['latlong'] ?? '') ?>" placeholder="e.g. 23.8103,90.4125">
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-6">
                                <label class="form-label fw-bold text-secondary">OLT Brand & Technology Type</label>
                                <select name="brand" id="olt-brand-<?= $olt['id'] ?>" class="form-select olt-brand-selector" required>
                                    <option value="bdcom_epon" <?= $olt['brand']=='bdcom_epon'?'selected':'' ?>>BDCOM EPON</option>
                                    <option value="bdcom_gpon" <?= $olt['brand']=='bdcom_gpon'?'selected':'' ?>>BDCOM GPON</option>
                                    <option value="vsol_epon" <?= $olt['brand']=='vsol_epon'?'selected':'' ?>>VSOL EPON</option>
                                    <option value="vsol_gpon" <?= $olt['brand']=='vsol_gpon'?'selected':'' ?>>VSOL GPON</option>
                                    <option value="dm_epon" <?= $olt['brand']=='dm_epon'?'selected':'' ?>>DM EPON</option>
                                    <option value="dm_gpon" <?= $olt['brand']=='dm_gpon'?'selected':'' ?>>DM GPON</option>
                                    <option value="hsgq_epon" <?= $olt['brand']=='hsgq_epon'?'selected':'' ?>>HSGQ EPON</option>
                                </select>
                            </div>
                            <div class="col-6">
                                <label class="form-label fw-bold text-secondary">Access Mode</label>
                                <select name="mode" id="olt-access-mode-<?= $olt['id'] ?>" class="form-select olt-mode-selector" required>
                                    <option value="telnet" <?= ($olt['mode']??'telnet')=='telnet'?'selected':'' ?>>Telnet Mode</option>
                                    <option value="web" <?= ($olt['mode']??'telnet')=='web'?'selected':'' ?>>Web Mode</option>
                                </select>
                            </div>
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-8">
                                <label class="form-label fw-bold text-secondary">IP Address</label>
                                <input type="text" name="ip_address" class="form-control" value="<?= htmlspecialchars($olt['ip']) ?>" required>
                            </div>
                            <div class="col-4 telnet-only-field-<?= $olt['id'] ?>">
                                <label class="form-label fw-bold text-secondary">Telnet Port</label>
                                <input type="number" name="telnet_port" class="form-control" value="<?= $olt['telnet_port'] ?? 23 ?>">
                            </div>
                        </div>
                        <div class="row g-2 mb-3 web-only-field-<?= $olt['id'] ?>">
                            <div class="col-6">
                                <label class="form-label fw-bold text-secondary">Web Port</label>
                                <input type="number" name="port" class="form-control" value="<?= $olt['port'] ?>" placeholder="e.g. 80">
                            </div>
                            <div class="col-6">
                                <label class="form-label fw-bold text-secondary">Protocol</label>
                                <select name="http_scheme" class="form-select">
                                    <option value="http" <?= ($olt['protocol']??'http')=='http'?'selected':'' ?>>HTTP</option>
                                    <option value="https" <?= ($olt['protocol']??'http')=='https'?'selected':'' ?>>HTTPS</option>
                                </select>
                            </div>
                        </div>
                        <hr class="text-secondary">
                        <h6 class="fw-bold text-dark mb-3"><i class="fas fa-key me-2 text-warning"></i> Access Credentials</h6>
                        <div class="row g-2 mb-2">
                            <div class="col-6">
                                <label class="form-label fw-bold text-secondary" id="username-label-<?= $olt['id'] ?>">Username</label>
                                <input type="text" name="snmp_user" class="form-control" value="<?= htmlspecialchars($olt['user'] ?? '') ?>" required placeholder="Username">
                            </div>
                            <div class="col-6">
                                <label class="form-label fw-bold text-secondary" id="password-label-<?= $olt['id'] ?>">Password</label>
                                <input type="text" name="snmp_password" class="form-control" value="<?= htmlspecialchars($olt['pass'] ?? '') ?>" required placeholder="Password">
                            </div>
                        </div>
                        <div class="mb-2 telnet-only-field-<?= $olt['id'] ?>">
                            <label class="form-label fw-bold text-secondary">SNMP Read Community</label>
                            <input type="text" name="snmp_community" class="form-control" value="<?= htmlspecialchars($olt['snmp_community'] ?? 'public') ?>">
                        </div>
                        <div class="mb-2">
                            <label class="form-label fw-bold text-secondary">Timeout (s)</label>
                            <input type="number" name="timeout" class="form-control" value="<?= $olt['timeout'] ?? 10 ?>">
                        </div>
                    </div>
                    <div class="modal-footer border-0">
                        <button type="button" class="btn btn-light" data-bs-dismiss="modal">Close</button>
                        <button type="submit" name="edit_olt" class="btn btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    <?php endforeach; ?>
        </div>
    </div>
    
    <div class="tab-pane fade" id="network-map-pane" role="tabpanel">
        <div class="card border-0 shadow-sm glass-card mb-4">
            <div class="card-header bg-white py-3 border-0 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bold text-dark"><i class="fas fa-network-wired text-primary me-2"></i> Select OLT:</span>
                    <select id="map-olt-select" class="form-select form-select-sm" style="width: 250px; border-radius: 20px;">
                        <option value="all">-- All OLTs --</option>
                        <?php foreach($olts as $o): ?>
                            <option value="<?= $o['id'] ?>"><?= htmlspecialchars($o['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <!-- Map Legend -->
                <div class="d-flex align-items-center gap-3 flex-wrap small text-muted">
                    <div><span class="badge me-1" style="width:12px; height:12px; display:inline-block; border-radius:50%; vertical-align:middle; background-color:#0d6efd;"></span> OLT Node</div>
                    <div><span class="badge me-1" style="width:12px; height:12px; display:inline-block; border-radius:50%; vertical-align:middle; background-color:#6f42c1;"></span> OLT Node</div>
                    <div><span class="badge me-1" style="width:12px; height:12px; display:inline-block; border-radius:50%; vertical-align:middle; background-color:#fd7e14;"></span> Zone TJ Box</div>
                    <div><span class="badge me-1" style="width:12px; height:12px; display:inline-block; border-radius:50%; vertical-align:middle; background-color:#20c997;"></span> Client / ONU</div>
                </div>
            </div>
            <div class="card-body p-0">
                <div id="networkMap" style="height: 600px; width: 100%; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;"></div>
            </div>
        </div>
    </div>
</div>

<!-- Add Modal -->
<div class="modal fade animate__animated animate__fadeIn" id="addOLTModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content glass-card border-0">
            <form method="POST">
                <div class="modal-header glass-header">
                    <h5 class="modal-title fw-bold text-dark"><i class="fas fa-plus-circle text-primary me-2"></i> Register New OLT</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold text-secondary">OLT Name</label>
                        <input type="text" name="name" class="form-control" placeholder="e.g. Core OLT 1" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold text-secondary">OLT Latlong</label>
                        <input type="text" name="latlong" class="form-control" placeholder="e.g. 23.8103,90.4125">
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col-6">
                            <label class="form-label fw-bold text-secondary">OLT Brand & Technology Type</label>
                            <select name="brand" id="olt-brand-add" class="form-select" required>
                                <option value="bdcom_epon">BDCOM EPON</option>
                                <option value="bdcom_gpon">BDCOM GPON</option>
                                <option value="vsol_epon">VSOL EPON</option>
                                <option value="vsol_gpon">VSOL GPON</option>
                                <option value="dm_epon">DM EPON</option>
                                <option value="dm_gpon">DM GPON</option>
                                <option value="hsgq_epon">HSGQ EPON</option>
                            </select>
                        </div>
                        <div class="col-6">
                            <label class="form-label fw-bold text-secondary">Access Mode</label>
                            <select name="mode" id="olt-access-mode-add" class="form-select" required>
                                <option value="telnet">Telnet Mode</option>
                                <option value="web">Web Mode</option>
                            </select>
                        </div>
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col-8">
                            <label class="form-label fw-bold text-secondary">IP Address</label>
                            <input type="text" name="ip_address" class="form-control" placeholder="e.g. 192.168.1.100" required>
                        </div>
                        <div class="col-4 telnet-only-field-add">
                            <label class="form-label fw-bold text-secondary">Telnet Port</label>
                            <input type="number" name="telnet_port" class="form-control" value="23">
                        </div>
                    </div>
                    <div class="row g-2 mb-3 web-only-field-add" style="display:none;">
                        <div class="col-6">
                            <label class="form-label fw-bold text-secondary">Web Port</label>
                            <input type="number" name="port" class="form-control" placeholder="80" value="80">
                        </div>
                        <div class="col-6">
                            <label class="form-label fw-bold text-secondary">Protocol</label>
                            <select name="http_scheme" class="form-select">
                                <option value="http">HTTP</option>
                                <option value="https">HTTPS</option>
                            </select>
                        </div>
                    </div>
                    <hr class="text-secondary">
                    <h6 class="fw-bold text-dark mb-3"><i class="fas fa-key me-2 text-warning"></i> Access Credentials</h6>
                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label fw-bold text-secondary" id="username-label-add">Telnet User</label>
                            <input type="text" name="snmp_user" class="form-control" required placeholder="admin">
                        </div>
                        <div class="col-6">
                            <label class="form-label fw-bold text-secondary" id="password-label-add">Telnet Password</label>
                            <input type="text" name="snmp_password" class="form-control" required placeholder="password">
                        </div>
                    </div>
                    <div class="mb-2 telnet-only-field-add">
                        <label class="form-label fw-bold text-secondary">SNMP Read Community</label>
                        <input type="text" name="snmp_community" class="form-control" value="public">
                    </div>
                    <div class="mb-2">
                        <label class="form-label fw-bold text-secondary">Timeout (s)</label>
                        <input type="number" name="timeout" class="form-control" value="10">
                    </div>
                </div>
                <div class="modal-footer border-0">
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Close</button>
                    <button type="submit" name="add_olt" class="btn btn-primary">Add OLT</button>
                </div>
            </form>
        </div>
    </div>
</div>

<?php if (hasRole('Admin')): 
    // Fetch active VPN configuration
    $vpn = safeFetch($pdo, "SELECT * FROM " . TBL_TENANT_VPN . " LIMIT 1");
    $vpn_status = $vpn['vpn_status'] ?? 'disabled';
    $vpn_server = $vpn['pptp_server'] ?? '';
    $vpn_user   = $vpn['pptp_username'] ?? '';
    $vpn_pass   = $vpn['pptp_password'] ?? '';
    $vpn_lan    = $vpn['olt_lan'] ?? '';
    $vpn_iface  = $vpn['ppp_interface'] ?? '';
    $vpn_error  = $vpn['error_message'] ?? '';
    $vpn_last_connected = $vpn['last_connected_at'] ?? '';
?>
<!-- PPTP VPN Connection Settings -->
<div class="row mt-4">
    <div class="col-12">
        <div class="card glass-card border-0 shadow-sm" id="vpnCard">
            <div class="card-header bg-transparent border-0 d-flex justify-content-between align-items-center pt-3">
                <div>
                    <h5 class="fw-bold text-dark mb-0">
                        <i class="fas fa-network-wired text-primary me-2"></i>
                        PPTP VPN LAN Connectivity Settings
                    </h5>
                    <p class="text-secondary small mb-0">
                        Establish a secure PPTP tunnel to route traffic from this server to your local OLT LAN in Bangladesh.
                    </p>
                </div>
                <div>
                    <span id="vpnStatusBadge" class="badge px-3 py-2 fs-6 shadow-sm
                        <?php if($vpn_status==='connected') echo 'bg-success';
                              elseif($vpn_status==='connecting') echo 'bg-warning text-dark';
                              elseif($vpn_status==='failed') echo 'bg-danger';
                              else echo 'bg-secondary'; ?>">
                        <i id="vpnStatusIcon" class="fas
                            <?php if($vpn_status==='connected') echo 'fa-check-circle';
                                  elseif($vpn_status==='connecting') echo 'fa-spinner fa-spin';
                                  elseif($vpn_status==='failed') echo 'fa-exclamation-triangle';
                                  else echo 'fa-power-off'; ?> me-2"></i>
                        <span id="vpnStatusText"><?php
                            if($vpn_status==='connected') echo 'Connected';
                            elseif($vpn_status==='connecting') echo 'Connecting...';
                            elseif($vpn_status==='failed') echo 'Failed';
                            elseif($vpn_status==='disconnected') echo 'Disconnected';
                            else echo 'Disabled'; ?></span>
                    </span>
                </div>
            </div>

            <div class="card-body">
                <div class="row g-3">
                    <div class="col-md-8">
                        <div class="p-3 bg-light rounded-3 border">
                            <h6 class="fw-bold text-dark mb-3"><i class="fas fa-info-circle text-info me-2"></i>Connection Parameters</h6>
                            <div class="row g-2">
                                <div class="col-sm-6">
                                    <span class="text-secondary small">PPTP Server IP:</span><br>
                                    <strong class="text-dark"><?= !empty($vpn_server) ? htmlspecialchars($vpn_server) : '<span class="text-muted fst-italic">Not configured</span>' ?></strong>
                                </div>
                                <div class="col-sm-6">
                                    <span class="text-secondary small">OLT LAN Subnet Route:</span><br>
                                    <strong class="text-primary font-monospace"><?= !empty($vpn_lan) ? htmlspecialchars($vpn_lan) : '<span class="text-muted fst-italic">Not configured</span>' ?></strong>
                                </div>
                                <div class="col-sm-6 mt-2">
                                    <span class="text-secondary small">Tunnel Username:</span><br>
                                    <strong class="text-dark"><?= !empty($vpn_user) ? htmlspecialchars($vpn_user) : '<span class="text-muted fst-italic">Not configured</span>' ?></strong>
                                </div>
                                <div class="col-sm-6 mt-2">
                                    <span class="text-secondary small">Active Interface:</span><br>
                                    <strong id="vpnIface" class="text-success font-monospace"><?= !empty($vpn_iface) ? htmlspecialchars($vpn_iface) : 'None' ?></strong>
                                </div>
                                <div class="col-sm-6 mt-2">
                                    <span class="text-secondary small">Encryption:</span><br>
                                    <strong class="<?= ($vpn['require_encryption'] ?? 1) ? 'text-primary' : 'text-warning' ?>">
                                        <?= ($vpn['require_encryption'] ?? 1) ? 'Required (MPPE-128)' : 'Optional / Disabled' ?>
                                    </strong>
                                </div>
                                <div class="col-12 mt-2">
                                    <span class="text-secondary small">Last Successful Handshake:</span>
                                    <span id="vpnLastConn" class="text-dark fw-bold ms-1"><?= !empty($vpn_last_connected) ? date('Y-m-d h:i:s A', strtotime($vpn_last_connected)) : '—' ?></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4 d-flex flex-column justify-content-between">
                        <div class="p-3 bg-light rounded-3 border h-100 d-flex flex-column justify-content-center">
                            <h6 class="fw-bold text-dark text-center mb-3"><i class="fas fa-sliders-h text-primary me-2"></i>Tunnel Controls</h6>
                            <div class="d-grid gap-2">
                                <button class="btn btn-outline-primary shadow-sm" data-bs-toggle="modal" data-bs-target="#configureVPNModal">
                                    <i class="fas fa-cog me-2"></i>Configure VPN
                                </button>

                                <button id="vpnConnectBtn" class="btn btn-success text-white shadow-sm"
                                    <?= empty($vpn_server) ? 'disabled' : '' ?>
                                    onclick="vpnConnect()"
                                    style="<?= in_array($vpn_status, ['connected','connecting']) ? 'display:none' : '' ?>">
                                    <i class="fas fa-play me-2"></i>Establish Tunnel (Connect)
                                </button>

                                <button id="vpnDisconnectBtn" class="btn btn-danger shadow-sm"
                                    onclick="vpnDisconnect()"
                                    style="<?= in_array($vpn_status, ['connected','connecting']) ? '' : 'display:none' ?>">
                                    <i class="fas fa-stop me-2"></i>Tear Down Tunnel (Disconnect)
                                </button>

                                <button class="btn btn-outline-warning shadow-sm" onclick="vpnDiagnose()">
                                    <i class="fas fa-stethoscope me-2"></i>Run Diagnostics
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Live Diagnostic Log (always visible after connect attempt) -->
                <div class="mt-3" id="vpnDiagBox" style="<?= ($vpn_status === 'failed' && !empty($vpn_error)) ? '' : 'display:none' ?>">
                    <div class="alert border-0 mb-0 shadow-sm" id="vpnDiagAlert"
                         style="background:#1a1a2e; border-left:4px solid #e74c3c !important;">
                        <h6 class="fw-bold text-danger"><i class="fas fa-terminal me-2"></i>PPTP Handshake / Diagnostic Log:</h6>
                        <pre id="vpnDiagLog" class="mb-0 mt-2 text-danger font-monospace small"
                             style="max-height:160px;overflow-y:auto;white-space:pre-wrap;background:transparent;"><?= htmlspecialchars($vpn_error) ?></pre>
                    </div>
                </div>

                <!-- Connection Progress Bar -->
                <div class="mt-3" id="vpnProgressBox" style="<?= $vpn_status === 'connecting' ? '' : 'display:none' ?>">
                    <div class="d-flex align-items-center gap-2 text-warning">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span class="fw-bold small">Negotiating PPTP handshake with server... Please wait up to 15 seconds.</span>
                    </div>
                    <div class="progress mt-2" style="height:6px;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated bg-warning w-100"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- VPN Diagnostics Modal -->
<div class="modal fade" id="vpnDiagModal" tabindex="-1">
    <div class="modal-dialog modal-xl">
        <div class="modal-content" style="background:#0d1117; border:1px solid #30363d;">
            <div class="modal-header" style="border-bottom:1px solid #30363d;">
                <h5 class="modal-title fw-bold" style="color:#58a6ff;"><i class="fas fa-stethoscope me-2"></i>VPN Server Diagnostics</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" style="color:#c9d1d9;">
                <div id="vpnDiagResult">
                    <div class="text-center py-5">
                        <i class="fas fa-spinner fa-spin fa-2x text-warning"></i>
                        <div class="mt-3 text-secondary">Running diagnostics on server...</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer" style="border-top:1px solid #30363d;">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-outline-info btn-sm" onclick="vpnDiagnose()"><i class="fas fa-redo me-1"></i>Re-Run</button>
            </div>
        </div>
    </div>
</div>

<!-- Configure VPN Modal -->
<div class="modal fade animate__animated animate__fadeIn" id="configureVPNModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content glass-card border-0">
            <form method="POST" action="">
                <div class="modal-header glass-header">
                    <h5 class="modal-title fw-bold text-dark"><i class="fas fa-cog text-primary me-2"></i>Configure PPTP VPN settings</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold text-secondary">PPTP VPN Server Address / IP</label>
                        <input type="text" name="pptp_server" class="form-control" placeholder="e.g. 163.61.217.81" value="<?= htmlspecialchars($vpn_server) ?>" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold text-secondary">VPN Username</label>
                        <input type="text" name="pptp_username" class="form-control" placeholder="e.g. ashik" value="<?= htmlspecialchars($vpn_user) ?>" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold text-secondary">VPN Password</label>
                        <input type="text" name="pptp_password" class="form-control" placeholder="e.g. secure_pass" value="<?= htmlspecialchars($vpn_pass) ?>" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold text-secondary">Bangladeshi OLT LAN Subnet</label>
                        <input type="text" name="olt_lan" class="form-control font-monospace" placeholder="e.g. 172.25.31.0/24" value="<?= htmlspecialchars($vpn_lan) ?>" required>
                        <div class="form-text text-muted">The LAN subnet where the remote OLT devices reside in Bangladesh.</div>
                    </div>
                    <div class="mb-3 form-check form-switch">
                        <input class="form-check-input" type="checkbox" name="require_encryption" id="require_encryption" <?= ($vpn['require_encryption'] ?? 1) ? 'checked' : '' ?>>
                        <label class="form-check-label fw-bold text-secondary text-dark" for="require_encryption">Require MPPE Encryption</label>
                        <div class="form-text text-muted">Disable this if your VPN server refuses MPPE encryption or fails to negotiate.</div>
                    </div>
                </div>
                <div class="modal-footer border-0">
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" name="save_vpn_config" class="btn btn-primary">Save Settings</button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
var vpnPollTimer = null;

function vpnConnect() {
    document.getElementById('vpnConnectBtn').disabled = true;
    document.getElementById('vpnConnectBtn').innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Initiating...';
    document.getElementById('vpnProgressBox').style.display = '';
    document.getElementById('vpnDiagBox').style.display = 'none';

    fetch('index.php?ajax_vpn_connect=1')
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                updateVpnBadge('connecting');
                showConnectBtn(false);
                startVpnPolling();
            } else {
                alert('Error: ' + (data.message || 'Unknown error'));
                document.getElementById('vpnConnectBtn').disabled = false;
                document.getElementById('vpnConnectBtn').innerHTML = '<i class="fas fa-play me-2"></i>Establish Tunnel (Connect)';
                document.getElementById('vpnProgressBox').style.display = 'none';
            }
        })
        .catch(() => {
            alert('Network error while connecting VPN.');
            document.getElementById('vpnConnectBtn').disabled = false;
            document.getElementById('vpnConnectBtn').innerHTML = '<i class="fas fa-play me-2"></i>Establish Tunnel (Connect)';
            document.getElementById('vpnProgressBox').style.display = 'none';
        });
}

function vpnDisconnect() {
    if (!confirm('Tear down the PPTP tunnel?')) return;
    document.getElementById('vpnDisconnectBtn').disabled = true;
    document.getElementById('vpnDisconnectBtn').innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Disconnecting...';
    stopVpnPolling();

    fetch('index.php?ajax_vpn_disconnect=1')
        .then(r => r.json())
        .then(data => {
            updateVpnBadge('disabled');
            showConnectBtn(true);
            document.getElementById('vpnProgressBox').style.display = 'none';
            document.getElementById('vpnIface').textContent = 'None';
        })
        .catch(() => {
            document.getElementById('vpnDisconnectBtn').disabled = false;
            document.getElementById('vpnDisconnectBtn').innerHTML = '<i class="fas fa-stop me-2"></i>Tear Down Tunnel (Disconnect)';
        });
}

function startVpnPolling() {
    stopVpnPolling();
    vpnPollTimer = setInterval(vpnPollStatus, 3000);
}

function stopVpnPolling() {
    if (vpnPollTimer) { clearInterval(vpnPollTimer); vpnPollTimer = null; }
}

function vpnPollStatus() {
    fetch('index.php?ajax_vpn_status=1')
        .then(r => r.json())
        .then(data => {
            updateVpnBadge(data.status);

            if (data.iface) {
                document.getElementById('vpnIface').textContent = data.iface;
            }
            if (data.last_connected) {
                document.getElementById('vpnLastConn').textContent = data.last_connected;
            }

            if (data.status === 'connected') {
                stopVpnPolling();
                showConnectBtn(false);
                document.getElementById('vpnProgressBox').style.display = 'none';
                document.getElementById('vpnDiagBox').style.display = 'none';
            } else if (data.status === 'failed') {
                stopVpnPolling();
                showConnectBtn(true);
                document.getElementById('vpnProgressBox').style.display = 'none';
                if (data.error) {
                    document.getElementById('vpnDiagBox').style.display = '';
                    document.getElementById('vpnDiagLog').textContent = data.error;
                }
            } else if (data.status === 'disabled' || data.status === 'disconnected') {
                stopVpnPolling();
                showConnectBtn(true);
                document.getElementById('vpnProgressBox').style.display = 'none';
            }
        });
}

function showConnectBtn(showConnect) {
    var connectBtn = document.getElementById('vpnConnectBtn');
    var disconnectBtn = document.getElementById('vpnDisconnectBtn');
    if (showConnect) {
        connectBtn.style.display = '';
        connectBtn.disabled = false;
        connectBtn.innerHTML = '<i class="fas fa-play me-2"></i>Establish Tunnel (Connect)';
        disconnectBtn.style.display = 'none';
        disconnectBtn.disabled = false;
        disconnectBtn.innerHTML = '<i class="fas fa-stop me-2"></i>Tear Down Tunnel (Disconnect)';
    } else {
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = '';
        disconnectBtn.disabled = false;
        disconnectBtn.innerHTML = '<i class="fas fa-stop me-2"></i>Tear Down Tunnel (Disconnect)';
    }
}

function updateVpnBadge(status) {
    var badge = document.getElementById('vpnStatusBadge');
    var icon = document.getElementById('vpnStatusIcon');
    var text = document.getElementById('vpnStatusText');
    var card = document.getElementById('vpnCard');

    badge.className = 'badge px-3 py-2 fs-6 shadow-sm';
    card.classList.remove('border-success','border-warning','border-danger');

    if (status === 'connected') {
        badge.classList.add('bg-success');
        icon.className = 'fas fa-check-circle me-2';
        text.textContent = 'Connected';
        card.classList.add('border-success');
    } else if (status === 'connecting') {
        badge.classList.add('bg-warning','text-dark');
        icon.className = 'fas fa-spinner fa-spin me-2';
        text.textContent = 'Connecting...';
        card.classList.add('border-warning');
    } else if (status === 'failed') {
        badge.classList.add('bg-danger');
        icon.className = 'fas fa-exclamation-triangle me-2';
        text.textContent = 'Failed';
        card.classList.add('border-danger');
    } else if (status === 'disconnected') {
        badge.classList.add('bg-secondary');
        icon.className = 'fas fa-unlink me-2';
        text.textContent = 'Disconnected';
    } else {
        badge.classList.add('bg-secondary');
        icon.className = 'fas fa-power-off me-2';
        text.textContent = 'Disabled';
    }
}

// Auto-start polling if currently connecting
document.addEventListener('DOMContentLoaded', function() {
    <?php if ($vpn_status === 'connecting'): ?>
    startVpnPolling();
    <?php endif; ?>
});

function vpnDiagnose() {
    // Show modal immediately with spinner
    var modal = new bootstrap.Modal(document.getElementById('vpnDiagModal'));
    modal.show();
    document.getElementById('vpnDiagResult').innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-warning"></i><div class="mt-3 text-secondary">Running full diagnostics on server... (may take 15–30 seconds)</div></div>';

    fetch('index.php?ajax_vpn_diag=1', {credentials: 'same-origin'})
        .then(r => {
            if (!r.ok) {
                return r.text().then(t => { throw new Error('HTTP ' + r.status + ': ' + t.substring(0, 500)); });
            }
            return r.text().then(t => {
                try { return JSON.parse(t); }
                catch(e) { throw new Error('Bad JSON from server:\n' + t.substring(0, 1000)); }
            });
        })
        .then(data => {
            var html = '<div class="font-monospace small">';

            function row(label, value, good) {
                var isBlocked = String(value).indexOf('BLOCKED') >= 0;
                var color = isBlocked ? '#e3b341' : (good === true) ? '#3fb950' : (good === false) ? '#f85149' : '#c9d1d9';
                var icon = isBlocked ? '⚠️' : (good === true) ? '✅' : (good === false) ? '❌' : 'ℹ️';
                return '<div class="d-flex border-bottom py-2" style="border-color:#30363d !important;">'
                    + '<div class="fw-bold me-3" style="min-width:200px;color:#58a6ff;">' + label + '</div>'
                    + '<div style="color:' + color + ';word-break:break-all;">' + icon + ' ' + escHtml(String(value)) + '</div>'
                    + '</div>';
            }

            function block(label, value) {
                return '<div class="mt-3"><div class="fw-bold mb-1" style="color:#58a6ff;">' + label + '</div>'
                    + '<pre class="p-2 rounded small mb-0" style="background:#161b22;color:#7ee787;max-height:200px;overflow-y:auto;white-space:pre-wrap;border:1px solid #30363d;">'
                    + escHtml(String(value || '(empty)'))
                    + '</pre></div>';
            }

            function escHtml(t) {
                return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            }

            if (data.note) {
                html += '<div class="alert alert-warning">' + escHtml(data.note) + '</div>';
            } else {
                if (data.shell_exec_enabled === false) {
                    html += '<div class="alert alert-warning border-0 shadow-sm mb-4" style="background: rgba(227, 179, 65, 0.1); border-left: 4px solid #e3b341 !important; color: #e3b341; padding: 12px 16px; border-radius: 6px;">'
                        + '<i class="fas fa-exclamation-triangle me-2"></i>'
                        + '<strong>Web PHP Restriction:</strong> Command execution (<code>shell_exec</code>) is disabled in your web server\'s PHP configuration (disable_functions). '
                        + 'Web-based diagnostics cannot directly test binaries or list routes, but your background cron tasks running via SSH/CLI will still function normally.'
                        + '</div>';
                } else if (data.pppd_path === 'NOT FOUND' || data.pptp_path === 'NOT FOUND') {
                    html += '<div class="alert alert-info border-0 shadow-sm mb-4" style="background: rgba(58, 166, 255, 0.1); border-left: 4px solid #3aa6ff !important; color: #58a6ff; padding: 12px 16px; border-radius: 6px;">'
                        + '<i class="fas fa-info-circle me-2"></i>'
                        + '<strong>Web Hosting Environment:</strong> The VPN tools (<code>pppd</code>/<code>pptp</code>) are not installed on this Web Server. '
                        + 'This is completely normal and expected if your website is hosted on a shared cPanel web host, and your VPN tunnel is actually managed on a separate local Gateway/Router server running the cron script.'
                        + '</div>';
                }
                html += '<h6 class="fw-bold mb-3" style="color:#e3b341;border-bottom:1px solid #30363d;padding-bottom:8px;">🖥️ Server Environment</h6>';
                html += row('OS', data.os);
                html += row('PHP Binary', data.php_binary);
                html += row('PHP Version', data.php_version);
                html += row('Server IP', data.server_ip);

                html += '<h6 class="fw-bold mt-4 mb-3" style="color:#e3b341;border-bottom:1px solid #30363d;padding-bottom:8px;">🔧 Tools & Packages</h6>';
                html += row('pppd path', data.pppd_path, data.pppd_path && data.pppd_path !== 'NOT FOUND');
                html += row('pptp path', data.pptp_path, data.pptp_path && data.pptp_path !== 'NOT FOUND');
                html += row('poff path', data.poff_path, data.poff_path && data.poff_path !== 'NOT FOUND');
                html += row('pppd version', data.pppd_ver, data.pppd_ver && data.pppd_ver !== 'NOT FOUND');
                html += row('sudo test', data.sudo_test, !data.sudo_test || data.sudo_test.indexOf('OK') >= 0 || data.sudo_test === '');

                html += '<h6 class="fw-bold mt-4 mb-3" style="color:#e3b341;border-bottom:1px solid #30363d;padding-bottom:8px;">🌐 Network Connectivity</h6>';
                var portOk = data.port_1723 && data.port_1723.indexOf('OPEN') >= 0;
                html += row('Port 1723 (PPTP)', data.port_1723, portOk);
                html += row('Active PPP Interfaces', data.ppp_interfaces || 'none');

                html += '<h6 class="fw-bold mt-4 mb-3" style="color:#e3b341;border-bottom:1px solid #30363d;padding-bottom:8px;">📋 VPN Configuration (DB)</h6>';
                if (data.vpn_config) {
                    html += row('Server', data.vpn_config.server);
                    html += row('Username', data.vpn_config.username);
                    html += row('LAN Route', data.vpn_config.lan);
                    html += row('DB Status', data.vpn_config.status);
                    html += row('Interface', data.vpn_config.iface);
                }

                html += '<h6 class="fw-bold mt-4 mb-3" style="color:#e3b341;border-bottom:1px solid #30363d;padding-bottom:8px;">📂 PPP Files</h6>';
                html += row('chap-secrets', data.chap_secrets_exists, data.chap_secrets_exists === 'exists');
                html += row('pap-secrets', data.pap_secrets_exists);
                html += block('Peers directory (/etc/ppp/peers/)', data.peers_dir);

                if (data.syslog_pppd) {
                    html += block('🪵 Syslog/Journal (pppd entries)', data.syslog_pppd);
                }
                if (data.worker_output) {
                    html += block('🚀 VPN Worker Output (live run)', data.worker_output);
                }
            }
            html += '</div>';
            document.getElementById('vpnDiagResult').innerHTML = html;
        })
        .catch(err => {
            document.getElementById('vpnDiagResult').innerHTML = '<div class="alert alert-danger">Failed to fetch diagnostics: ' + err + '</div>';
        });
}
</script>

<?php endif; ?>


<?php if (hasRole('Admin') && !empty($olts)): ?>
<!-- CLI Console Diagnostics Tab -->
<div class="row mt-4">
    <div class="col-12">
        <div class="card glass-card border-0 shadow-sm">
            <div class="card-header bg-transparent border-0 pt-3">
                <h5 class="fw-bold text-dark"><i class="fas fa-terminal text-info me-2"></i> OLT Diagnostics & CLI Console</h5>
                <p class="text-secondary small mb-0">Directly execute diagnostics terminal commands on active OLT systems.</p>
            </div>
            <div class="card-body">
                <form method="POST" action="">
                    <div class="row g-2">
                        <div class="col-md-3">
                            <label class="form-label text-secondary small fw-bold">Select target OLT</label>
                            <select name="id" class="form-select" required>
                                <?php foreach($olts as $o): ?>
                                <option value="<?= $o['id'] ?>"><?= htmlspecialchars($o['name']) ?> (<?= $o['ip'] ?>)</option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-md-7">
                            <label class="form-label text-secondary small fw-bold">Command Line</label>
                            <input type="text" name="command" class="form-control font-monospace" placeholder="e.g. show epon onu-information, show clock, show active-onu" required value="<?= htmlspecialchars($_SESSION['terminal_command'] ?? '') ?>">
                        </div>
                        <div class="col-md-2 d-flex align-items-end">
                            <button type="submit" name="run_command" class="btn btn-dark w-100 shadow-sm"><i class="fas fa-play me-2 text-success"></i> Execute</button>
                        </div>
                    </div>
                </form>
                
                <?php if (isset($_SESSION['terminal_output'])): ?>
                <div class="mt-3">
                    <label class="form-label text-secondary small fw-bold">Terminal Response</label>
                    <div class="terminal-output-box">
                        <?= htmlspecialchars($_SESSION['terminal_output']) ?>
                    </div>
                </div>
                <?php 
                    unset($_SESSION['terminal_output']);
                    unset($_SESSION['terminal_command']);
                endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- Logs Tab -->
<div class="row mt-4 mb-4">
    <div class="col-12">
        <div class="card glass-card border-0 shadow-sm">
            <div class="card-header bg-transparent border-0 d-flex justify-content-between align-items-center pt-3">
                <div>
                    <h5 class="fw-bold text-danger mb-0"><i class="fas fa-file-alt me-2 text-danger"></i> Live Telnet Log Viewer</h5>
                    <p class="text-secondary small mb-0">Recent telnet monitoring socket requests, diagnostic parsing results, and authentication logs.</p>
                </div>
                <button class="btn btn-sm btn-outline-danger shadow-sm" onclick="fetchLogs()"><i class="fas fa-sync-alt me-1"></i> Refresh Logs</button>
            </div>
            <div class="card-body">
                <pre id="log-console" class="bg-dark text-light p-3 rounded font-monospace" style="max-height: 250px; overflow-y: auto; font-size: 0.8rem; white-space: pre-wrap; border: 1px solid #1e293b;">Loading logs...</pre>
            </div>
        </div>
    </div>
</div>

<script>
function fetchLogs() {
    const consoleBox = document.getElementById('log-console');
    if(consoleBox) consoleBox.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing live socket log files...';
    
    fetch('index.php?ajax_olt_logs=1')
        .then(res => res.text())
        .then(data => {
            if(consoleBox) {
                consoleBox.innerText = data ? data : 'No recent OLT debug logs recorded.';
                consoleBox.scrollTop = consoleBox.scrollHeight;
            }
        })
        .catch(err => {
            if(consoleBox) consoleBox.innerText = 'Error loading log file.';
        });
}
document.addEventListener("DOMContentLoaded", fetchLogs);
</script>
<?php endif; ?>

<script>
function updateOltFields(scope) {
    const brandSel = document.getElementById('olt-brand-' + scope);
    const modeSel = document.getElementById('olt-access-mode-' + scope);
    if (!brandSel || !modeSel) return;

    const brand = brandSel.value;
    
    // Auto toggle/disable modes based on brand support
    const telnetOpt = modeSel.querySelector('option[value="telnet"]');
    const webOpt = modeSel.querySelector('option[value="web"]');
    
    if (brand === 'hsgq_epon') {
        modeSel.value = 'web';
        if (telnetOpt) telnetOpt.disabled = true;
        if (webOpt) webOpt.disabled = false;
    } else if (brand === 'bdcom_epon' || brand === 'bdcom_gpon') {
        modeSel.value = 'telnet';
        if (webOpt) webOpt.disabled = true;
        if (telnetOpt) telnetOpt.disabled = false;
    } else {
        if (telnetOpt) telnetOpt.disabled = false;
        if (webOpt) webOpt.disabled = false;
    }

    const mode = modeSel.value;
    
    // Toggle field visibility
    const telnetFields = document.querySelectorAll('.telnet-only-field-' + scope);
    const webFields = document.querySelectorAll('.web-only-field-' + scope);
    
    if (mode === 'web') {
        telnetFields.forEach(f => f.style.display = 'none');
        webFields.forEach(f => f.style.display = '');
        
        // Change credential labels
        const userLabel = document.getElementById('username-label-' + scope);
        if (userLabel) userLabel.textContent = 'Web User';
        const passLabel = document.getElementById('password-label-' + scope);
        if (passLabel) passLabel.textContent = 'Web Password';
    } else {
        telnetFields.forEach(f => f.style.display = '');
        webFields.forEach(f => f.style.display = 'none');
        
        // Change credential labels
        const userLabel = document.getElementById('username-label-' + scope);
        if (userLabel) userLabel.textContent = 'Telnet User';
        const passLabel = document.getElementById('password-label-' + scope);
        if (passLabel) passLabel.textContent = 'Telnet Password';
    }
}

document.addEventListener("DOMContentLoaded", function() {
    // Auto-check status for all OLTs
    <?php foreach($olts as $o): ?>
    checkStatus(<?= $o['id'] ?>);
    <?php endforeach; ?>

    // Initialize Add OLT modal listeners
    const addBrand = document.getElementById('olt-brand-add');
    const addMode = document.getElementById('olt-access-mode-add');
    if (addBrand && addMode) {
        addBrand.addEventListener('change', () => updateOltFields('add'));
        addMode.addEventListener('change', () => updateOltFields('add'));
        updateOltFields('add');
    }
    
    // Initialize Edit OLT modal listeners for each OLT
    document.querySelectorAll('.olt-brand-selector').forEach(selectEl => {
        const id = selectEl.id.replace('olt-brand-', '');
        const modeSelect = document.getElementById('olt-access-mode-' + id);
        
        selectEl.addEventListener('change', () => updateOltFields(id));
        if (modeSelect) {
            modeSelect.addEventListener('change', () => updateOltFields(id));
        }
        updateOltFields(id);
    });
});

function checkStatus(id) {
    const badge = document.getElementById('status-badge-' + id);
    if(badge) badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    
    fetch('index.php?ajax_olt_check=1&id=' + id)
        .then(response => response.json())
        .then(data => {
            if(data.status) {
                if(badge) {
                    badge.className = 'badge bg-success status-badge';
                    badge.innerHTML = '<i class="fas fa-check-circle"></i> Online';
                    badge.title = data.message;
                }
            } else {
                if(badge) {
                    badge.className = 'badge bg-danger status-badge';
                    badge.innerHTML = '<i class="fas fa-times-circle"></i> Offline';
                    badge.title = data.message;
                }
            }
        })
        .catch(err => {
            if(badge) {
                badge.className = 'badge bg-secondary status-badge';
                badge.innerHTML = '<i class="fas fa-question-circle"></i> Connection Error';
            }
        });
}

function testConnection(id) {
    const badge = document.getElementById('status-badge-' + id);
    if(badge) badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
    
    fetch('index.php?ajax_olt_check=1&deep=1&id=' + id)
        .then(response => response.json())
        .then(data => {
            checkStatus(id); // Refresh badge
            alert(data.message);
        })
        .catch(err => {
            checkStatus(id);
            alert("Telnet Connection timeout. Please check device configuration, IP, routing and firewall settings.");
        });
}

// Map variables
let networkMap = null;
let mapData = null;
let markersGroup = null;
let linesGroup = null;

// CSS Pin style helper
const createPinMarkup = (color, iconClass, animClass = '') => {
    return `<div class="${animClass}" style="
        width: 30px;
        height: 30px;
        border-radius: 50% 50% 50% 0;
        background: ${color};
        position: absolute;
        transform: rotate(-45deg);
        left: 50%;
        top: 50%;
        margin: -15px 0 0 -15px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    ">
        <i class="${iconClass} text-white" style="transform: rotate(45deg); font-size: 11px;"></i>
    </div>`;
};

// Create base icons using divIcon (default fallback version)
const oltIcon = L.divIcon({
    html: createPinMarkup('#0d6efd', 'fas fa-server', 'blink-green'),
    className: 'custom-map-pin',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

const masterTJIcon = L.divIcon({
    html: createPinMarkup('#6f42c1', 'fas fa-box', 'blink-green'),
    className: 'custom-map-pin',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

const zoneTJIcon = L.divIcon({
    html: createPinMarkup('#fd7e14', 'fas fa-box-open', 'blink-green'),
    className: 'custom-map-pin',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

const clientIcon = L.divIcon({
    html: createPinMarkup('#20c997', 'fas fa-home', 'blink-green'),
    className: 'custom-map-pin',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

function initNetworkMap() {
    if (networkMap) return;
    
    networkMap = L.map('networkMap').setView([23.8103, 90.4125], 13); // Default Dhaka

    L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0','mt1','mt2','mt3'],
        attribution: '&copy; Google Maps'
    }).addTo(networkMap);

    markersGroup = L.layerGroup().addTo(networkMap);
    linesGroup = L.layerGroup().addTo(networkMap);

    // Fetch data
    fetch('index.php?ajax_olt_network_map=1')
        .then(res => res.json())
        .then(data => {
            mapData = data;
            plotTopology();
        })
        .catch(err => {
            console.error("Error loading map data:", err);
        });
}

function plotTopology() {
    if (!mapData || !networkMap) return;
    
    markersGroup.clearLayers();
    linesGroup.clearLayers();

    const selectedOltId = document.getElementById('map-olt-select').value;
    
    // 1. Gather OLTs to plot and their positions
    let oltLatLngs = {};
    const oltsToPlot = (selectedOltId === 'all') ? mapData.olts : mapData.olts.filter(o => o.id == selectedOltId);
    
    // 2. Map clients to OLTs based on server-side resolved client_ids
    let clientOltMap = {};
    mapData.olts.forEach(olt => {
        if (olt.client_ids && Array.isArray(olt.client_ids)) {
            olt.client_ids.forEach(cid => {
                clientOltMap[cid] = olt.id;
            });
        }
    });

    // 3. Filter clients to plot
    const clientsToPlot = mapData.clients.filter(c => {
        const oltId = clientOltMap[c.id];
        if (!oltId) return false;
        if (selectedOltId !== 'all' && oltId != selectedOltId) return false;
        return true;
    });

    // 4. Gather boxes to plot and index box names
    let boxesToPlot = new Set();
    let boxNameToObj = {};
    mapData.tj_boxes.forEach(b => {
        boxNameToObj[b.name.trim()] = b;
    });

    // Build adjacency list for TJ Box graph based on matching fiber codes
    let adj = {};
    mapData.tj_boxes.forEach(b => {
        const name = b.name.trim();
        adj[name] = [];
    });

    // Initialize box wise fiber link counts
    let boxLinks = {};
    mapData.tj_boxes.forEach(b => {
        boxLinks[b.name.trim()] = { inCount: 0, outCount: 0, total: 0 };
    });

    const getFiberLines = (box) => {
        let lines = [];
        if (box.fiber_code) {
            try {
                const parsed = JSON.parse(box.fiber_code);
                if (Array.isArray(parsed)) {
                    parsed.forEach(l => {
                        const code = l.code ? l.code.trim() : '';
                        if (code) {
                            const brand = l.brand ? l.brand.trim() : '';
                            const combined = brand ? (brand + ' ' + code) : code;
                            lines.push({
                                code: combined,
                                in_out: l.in_out ? l.in_out.trim() : ''
                            });
                        }
                    });
                }
            } catch(e) {
                // Fallback for plain text
                const rawLines = box.fiber_code.split('\n');
                rawLines.forEach(rl => {
                    const trimmed = rl.trim();
                    if (trimmed) {
                        lines.push({
                            code: trimmed,
                            in_out: ''
                        });
                    }
                });
            }
        }
        return lines;
    };

    const boxNames = Object.keys(boxNameToObj);
    for (let i = 0; i < boxNames.length; i++) {
        const name1 = boxNames[i];
        const lines1 = getFiberLines(boxNameToObj[name1]);
        
        for (let j = i + 1; j < boxNames.length; j++) {
            const name2 = boxNames[j];
            const lines2 = getFiberLines(boxNameToObj[name2]);
            
            lines1.forEach(l1 => {
                const l2 = lines2.find(item => {
                    if (item.code !== l1.code) return false;
                    const dir1 = l1.in_out.toLowerCase();
                    const dir2 = item.in_out.toLowerCase();
                    if (dir1 === 'in' && dir2 === 'out') return true;
                    if (dir1 === 'out' && dir2 === 'in') return true;
                    if (dir1 === '' || dir2 === '') return true;
                    return false;
                });
                if (l2) {
                    if (!adj[name1].some(n => n.neighbor === name2 && n.code === l1.code)) {
                        adj[name1].push({ neighbor: name2, code: l1.code });
                        adj[name2].push({ neighbor: name1, code: l1.code });
                    }
                    
                    let dir1 = l1.in_out.toLowerCase();
                    let dir2 = l2.in_out.toLowerCase();
                    
                    if (dir1 === 'in') {
                        boxLinks[name1].inCount++;
                    } else if (dir1 === 'out') {
                        boxLinks[name1].outCount++;
                    }
                    
                    if (dir2 === 'in') {
                        boxLinks[name2].inCount++;
                    } else if (dir2 === 'out') {
                        boxLinks[name2].outCount++;
                    }
                    
                    boxLinks[name1].total++;
                    boxLinks[name2].total++;
                }
            });
        }
    }

    // BFS solver to find shortest path to any Master Box
    const findPathToMaster = (startBoxName) => {
        if (!boxNameToObj[startBoxName]) return null;
        if (boxNameToObj[startBoxName].box_category === 'Master Box') {
            return [startBoxName];
        }
        
        let queue = [ [startBoxName] ];
        let visited = new Set([startBoxName]);
        
        while (queue.length > 0) {
            let path = queue.shift();
            let current = path[path.length - 1];
            
            if (boxNameToObj[current] && boxNameToObj[current].box_category === 'Master Box') {
                return path;
            }
            
            let neighbors = adj[current] || [];
            for (let i = 0; i < neighbors.length; i++) {
                let nextNode = neighbors[i].neighbor;
                if (!visited.has(nextNode)) {
                    visited.add(nextNode);
                    queue.push([...path, nextNode]);
                }
            }
        }
        
        return null;
    };

    // Auto-discover all intermediate path boxes and group downstream clients per box
    let boxDownstreamClients = {};
    mapData.tj_boxes.forEach(b => {
        boxDownstreamClients[b.name.trim()] = [];
    });

    clientsToPlot.forEach(c => {
        const bName = c.tj_box_name.trim();
        if (boxNameToObj[bName]) {
            boxesToPlot.add(boxNameToObj[bName]);
            
            const path = findPathToMaster(bName);
            if (path && path.length > 0) {
                path.forEach(node => {
                    const nTrim = node.trim();
                    if (boxNameToObj[nTrim]) {
                        boxesToPlot.add(boxNameToObj[nTrim]);
                        if (!boxDownstreamClients[nTrim]) boxDownstreamClients[nTrim] = [];
                        boxDownstreamClients[nTrim].push(c);
                    }
                });
            } else {
                if (!boxDownstreamClients[bName]) boxDownstreamClients[bName] = [];
                boxDownstreamClients[bName].push(c);
            }
        }
    });

    // Compute online status per OLT
    let oltOnlineMap = {};
    oltsToPlot.forEach(olt => {
        const oltClients = clientsToPlot.filter(c => clientOltMap[c.id] == olt.id);
        oltOnlineMap[olt.id] = oltClients.some(c => c.is_online);
    });

    // Plot OLTs
    oltsToPlot.forEach(olt => {
        if (olt.latlong && olt.latlong.includes(',')) {
            const parts = olt.latlong.split(',').map(p => parseFloat(p.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const latLng = [parts[0], parts[1]];
                oltLatLngs[olt.id] = latLng;
                
                const isOltOnline = oltOnlineMap[olt.id];
                const oltIconColor = isOltOnline ? '#0d6efd' : '#dc3545';
                const oltIconBlink = isOltOnline ? 'blink-green' : 'blink-red';
                const currentOltIcon = L.divIcon({
                    html: createPinMarkup(oltIconColor, 'fas fa-server', oltIconBlink),
                    className: 'custom-map-pin',
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                    popupAnchor: [0, -30]
                });
                
                L.marker(latLng, {icon: currentOltIcon})
                    .bindPopup(`<b>OLT Device: ${olt.name}</b><br><small class="text-muted">Status: ${isOltOnline ? 'Online' : 'Offline (All ONUs down)'}</small>`)
                    .addTo(markersGroup);
            }
        }
    });

    // 5. Plot clients
    clientsToPlot.forEach(c => {
        if (c.lat_long && c.lat_long.includes(',')) {
            const parts = c.lat_long.split(',').map(p => parseFloat(p.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const isClientOnline = c.is_online;
                const clientIconColor = isClientOnline ? '#20c997' : '#dc3545';
                const clientIconBlink = isClientOnline ? 'blink-green' : 'blink-red';
                const currentClientIcon = L.divIcon({
                    html: createPinMarkup(clientIconColor, 'fas fa-home', clientIconBlink),
                    className: 'custom-map-pin',
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                    popupAnchor: [0, -30]
                });
                
                L.marker([parts[0], parts[1]], {icon: currentClientIcon})
                    .bindPopup(`<b>Client: ${c.name} (${c.user_id})</b><br><small class="text-muted">Status: ${isClientOnline ? 'Online' : 'Offline'}</small><br><small class="text-muted">TJ Box: ${c.tj_box_name}</small>`)
                    .addTo(markersGroup);
            }
        }
    });

    // 6. Plot TJ Boxes
    boxesToPlot.forEach(box => {
        if (box.lat_long && box.lat_long.includes(',')) {
            const parts = box.lat_long.split(',').map(p => parseFloat(p.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const downstream = boxDownstreamClients[box.name.trim()] || [];
                const isBoxOnline = downstream.length > 0 && downstream.some(c => c.is_online);
                const boxIconColor = isBoxOnline ? (box.box_category === 'Master Box' ? '#6f42c1' : '#fd7e14') : '#dc3545';
                const boxIconBlink = isBoxOnline ? 'blink-green' : 'blink-red';
                const currentBoxIcon = L.divIcon({
                    html: createPinMarkup(boxIconColor, box.box_category === 'Master Box' ? 'fas fa-box' : 'fas fa-box-open', boxIconBlink),
                    className: 'custom-map-pin',
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                    popupAnchor: [0, -30]
                });
                const links = boxLinks[box.name.trim()] || { inCount: 0, outCount: 0, total: 0 };
                L.marker([parts[0], parts[1]], {icon: currentBoxIcon})
                    .bindPopup(`<b>TJ Box: ${box.name}</b> <span class="badge bg-secondary small" style="font-size:0.75rem;">${box.box_category}</span><br>` +
                               `<small class="text-muted">Status: ${isBoxOnline ? 'Online' : 'Offline (All downstream users down)'}</small><br>` +
                               `<small class="text-muted">Zone: ${box.zone_name || 'N/A'}</small><br>` +
                               `<div class="mt-2">` +
                                 `<span class="badge bg-success" title="In Links"><i class="fas fa-arrow-circle-down"></i> In: ${links.inCount}</span> ` +
                                 `<span class="badge bg-primary" title="Out Links"><i class="fas fa-arrow-circle-up"></i> Out: ${links.outCount}</span> ` +
                                 `<span class="badge bg-info text-dark" title="Total Links"><i class="fas fa-link"></i> Total: ${links.total}</span>` +
                               `</div>`)
                    .addTo(markersGroup);
            }
        }
    });

    // 7. Draw connection lines
    let drawnConnections = new Set();
    const drawLine = (p1, p2, color, label) => {
        const key = `${p1.join(',')}|${p2.join(',')}`;
        if (drawnConnections.has(key)) return;
        drawnConnections.add(key);
        
        L.polyline([p1, p2], {
            color: color,
            weight: 3.5,
            opacity: 0.85
        }).addTo(linesGroup).bindTooltip(label, {sticky: true});
    };

    clientsToPlot.forEach(c => {
        const oltId = clientOltMap[c.id];
        if (!oltId) return;
        const oltLatLng = oltLatLngs[oltId];
        if (!oltLatLng) return;
        
        if (!c.lat_long || !c.lat_long.includes(',')) return;
        const cParts = c.lat_long.split(',').map(p => parseFloat(p.trim()));
        if (cParts.length !== 2 || isNaN(cParts[0]) || isNaN(cParts[1])) return;
        
        const bName = c.tj_box_name.trim();
        const clientBox = boxNameToObj[bName];
        if (!clientBox || !clientBox.lat_long || !clientBox.lat_long.includes(',')) return;
        
        const bParts = clientBox.lat_long.split(',').map(p => parseFloat(p.trim()));
        if (bParts.length !== 2 || isNaN(bParts[0]) || isNaN(bParts[1])) return;
        
        // Connection: TJ Box -> Client
        drawLine(bParts, cParts, '#20c997', `Drop Cable: ${clientBox.name} to ${c.name} (${c.user_id})`);
        
        // Trace and draw intermediate links
        const path = findPathToMaster(bName);
        if (path && path.length > 0) {
            // Draw links along the daisy chain path
            for (let i = 0; i < path.length - 1; i++) {
                const node1 = path[i];
                const node2 = path[i+1];
                
                const box1 = boxNameToObj[node1];
                const box2 = boxNameToObj[node2];
                
                if (box1 && box2 && box1.lat_long && box2.lat_long) {
                    const p1 = box1.lat_long.split(',').map(p => parseFloat(p.trim()));
                    const p2 = box2.lat_long.split(',').map(p => parseFloat(p.trim()));
                    
                    if (p1.length === 2 && p2.length === 2 && !isNaN(p1[0]) && !isNaN(p2[0])) {
                        const neighbors = adj[node1] || [];
                        const match = neighbors.find(n => n.neighbor === node2);
                        const code = match ? match.code : '';
                        
                        drawLine(p1, p2, '#fd7e14', `Dist Fiber: ${box2.name} to ${box1.name} (Code: ${code})`);
                    }
                }
            }
            
            // Draw link: OLT -> Master Box (last node in path)
            const masterNodeName = path[path.length - 1];
            const masterBox = boxNameToObj[masterNodeName];
            if (masterBox && masterBox.lat_long) {
                const mbParts = masterBox.lat_long.split(',').map(p => parseFloat(p.trim()));
                if (mbParts.length === 2 && !isNaN(mbParts[0]) && !isNaN(mbParts[1])) {
                    drawLine(oltLatLng, mbParts, '#0d6efd', `Core Fiber: OLT to ${masterBox.name}`);
                }
            }
        } else {
            // Fallback OLT -> Zone Box
            drawLine(oltLatLng, bParts, '#fd7e14', `Dist Fiber: OLT to ${clientBox.name}`);
        }
    });

    // 8. Auto zoom & fit map bounds
    let bounds = [];
    Object.values(oltLatLngs).forEach(ll => bounds.push(ll));
    boxesToPlot.forEach(b => {
        if (b.lat_long && b.lat_long.includes(',')) {
            const parts = b.lat_long.split(',').map(p => parseFloat(p.trim()));
            if (parts.length === 2) bounds.push(parts);
        }
    });
    clientsToPlot.forEach(c => {
        if (c.lat_long && c.lat_long.includes(',')) {
            const parts = c.lat_long.split(',').map(p => parseFloat(p.trim()));
            if (parts.length === 2) bounds.push(parts);
        }
    });

    if (bounds.length > 0) {
        networkMap.fitBounds(bounds, {padding: [50, 50]});
    }
}

// Bind events on document load
document.addEventListener("DOMContentLoaded", function() {
    const mapTab = document.getElementById('network-map-tab');
    if (mapTab) {
        mapTab.addEventListener('shown.bs.tab', function () {
            initNetworkMap();
            if (networkMap) networkMap.invalidateSize();
        });
    }
    
    const mapSelect = document.getElementById('map-olt-select');
    if (mapSelect) {
        mapSelect.addEventListener('change', plotTopology);
    }
});
</script>
