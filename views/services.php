<?php
// SERVICES (PACKAGES) VIEW
if (!hasRole('Admin')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$services = safeFetchAll($pdo, "SELECT s.*, r.name as router_name FROM ".TBL_SERVICES." s LEFT JOIN ".TBL_ROUTERS." r ON s.router_id = r.id ORDER BY s.price ASC");
$routers = safeFetchAll($pdo, "SELECT id, name, ip_address FROM ".TBL_ROUTERS);
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4><i class="fas fa-box me-2 text-primary"></i> Service Packages</h4>
    <button type="button" id="btnAddService" class="btn btn-primary shadow-sm">
        <i class="fas fa-plus me-1"></i> Add New Package
    </button>
</div>

<div class="row g-3">
    <?php if(empty($services)): ?>
        <div class="col-12 text-center py-5">
            <div class="text-muted">No service packages found. Create one to start adding clients.</div>
        </div>
    <?php else: foreach($services as $s):
        $svcJson = htmlspecialchars(json_encode($s, JSON_HEX_APOS | JSON_HEX_QUOT), ENT_QUOTES, 'UTF-8');
    ?>
        <div class="col-md-4">
            <div class="card h-100 shadow-sm border-0 border-top border-primary border-4">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title mb-0 fw-bold"><?= $s['name'] ?></h5>
                        <div class="dropdown">
                            <button type="button" class="btn btn-link btn-sm text-muted p-0" data-bs-toggle="dropdown">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow border-0">
                                <li>
                                    <button type="button"
                                        class="dropdown-item btn-edit-service"
                                        data-service="<?= $svcJson ?>">
                                        <i class="fas fa-edit me-2"></i>Edit
                                    </button>
                                </li>
                                <li><hr class="dropdown-divider"></li>
                                <li>
                                    <a class="dropdown-item text-danger btn-delete-service"
                                       href="?tab=services&action=delete_service&id=<?= $s['id'] ?>">
                                        <i class="fas fa-trash me-2"></i>Delete
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="mb-3">
                        <div class="small text-muted mb-1">Selling Price</div>
                        <div class="h3 fw-bold text-primary mb-0">৳<?= number_format($s['price'], 0) ?></div>
                        <div class="small text-muted mt-1">Cost: ৳<?= number_format($s['buying_price'], 0) ?> | Profit: ৳<?= number_format($s['price'] - $s['buying_price'], 0) ?></div>
                    </div>

                    <div class="bg-light p-2 rounded small mb-2 text-dark">
                        <div class="mb-1"><i class="fas fa-server me-2 text-secondary"></i><b>Router:</b> <?= $s['router_name'] ?: 'Any / Global' ?></div>
                        <div class="mb-1"><i class="fas fa-id-badge me-2 text-secondary"></i><b>Profile:</b> <?= $s['mikrotik_profile_name'] ?: 'N/A' ?></div>
                        <div><i class="fas fa-tachometer-alt me-2 text-secondary"></i><b>Limit:</b> <?= $s['rate_limit_profile'] ?: 'No Limit' ?></div>
                    </div>
                </div>
                <div class="card-footer bg-white border-0 pt-0 pb-3">
                    <button type="button"
                        class="btn btn-sm btn-outline-primary w-100 btn-edit-service"
                        data-service="<?= $svcJson ?>">
                        Manage Package
                    </button>
                </div>
            </div>
        </div>
    <?php endforeach; endif; ?>
</div>

<!-- Service Modal -->
<div class="modal fade" id="serviceModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="modalTitle">Create New Package</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="id" id="svc_id">
                <div class="mb-3">
                    <label class="form-label fw-semibold">Package Name</label>
                    <input type="text" name="name" id="svc_name" class="form-control" placeholder="e.g. 10 Mbps Home" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold">Router / Mikrotik</label>
                    <select name="router_id" id="svc_router" class="form-select">
                        <option value="0">Any / Global</option>
                        <?php foreach($routers as $r): ?>
                            <option value="<?= $r['id'] ?>"><?= $r['name'] ?> (<?= $r['ip_address'] ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="form-label fw-semibold">Buying Price (Cost)</label>
                        <input type="number" step="0.01" name="buying_price" id="svc_buying_price" class="form-control" placeholder="400" required>
                    </div>
                    <div class="col-6">
                        <label class="form-label fw-semibold">Selling Price (Bill)</label>
                        <input type="number" step="0.01" name="price" id="svc_price" class="form-control" placeholder="500" required>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold">Mikrotik Profile Name</label>
                    <input type="text" name="profile" id="svc_profile" class="form-control" placeholder="10M_Profile" required>
                    <div class="form-text small">Must match exactly with Mikrotik PPP profile name.</div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold">Rate Limit (Bits/s)</label>
                    <input type="text" name="rate" id="svc_rate" class="form-control" placeholder="5M/5M">
                    <div class="form-text small">Optional (target limit in Mikrotik).</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="add_service" id="submitBtn" class="btn btn-primary px-4">Create Package</button>
            </div>
        </form>
    </div>
</div>

<script src="assets/js/service-management.js?v=<?= APP_DEPLOYMENT_ID ?>"></script>
