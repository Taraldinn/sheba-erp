<?php
// MANAGE AGENTS VIEW
if (!hasRole('Admin')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$agents = safeFetchAll($pdo, "SELECT a.*, (SELECT COUNT(id) FROM ".TBL_STAFF." WHERE agent_id = a.id) as reseller_count FROM ".TBL_AGENTS." a ORDER BY a.id DESC");
?>

<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-user-tie me-2 text-primary"></i> Manage Agents</h4>
    <button type="button" id="btnAddRealAgent" class="btn btn-primary btn-sm rounded-pill px-3">
        <i class="fas fa-plus me-1"></i> Add New Agent
    </button>
</div>

<div class="card shadow-sm border-0">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Agent Info</th>
                        <th>Bank Details</th>
                        <th>Resellers</th>
                        <th>Balance</th>
                        <th class="text-end pe-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($agents)): ?>
                        <tr><td colspan="4" class="text-center py-5 text-muted">No agents found</td></tr>
                    <?php else: foreach($agents as $a):
                        $agentJson = htmlspecialchars(json_encode($a, JSON_HEX_APOS | JSON_HEX_QUOT), ENT_QUOTES, 'UTF-8');
                    ?>
                        <tr>
                            <td class="ps-3">
                                <div class="fw-bold text-dark"><?= htmlspecialchars($a['name']) ?></div>
                                <div class="small text-muted"><i class="fas fa-phone me-1"></i><?= htmlspecialchars($a['phone']) ?></div>
                                <div class="small text-muted"><i class="fas fa-envelope me-1"></i><?= htmlspecialchars($a['email']) ?></div>
                                <?php if($a['address']): ?>
                                    <div class="small text-muted italic" style="font-size: 0.75rem;"><i class="fas fa-map-marker-alt me-1"></i><?= htmlspecialchars($a['address']) ?></div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if($a['bank_name']): ?>
                                    <div class="small fw-bold"><?= htmlspecialchars($a['bank_name']) ?></div>
                                    <div class="small text-muted"><?= htmlspecialchars($a['account_name']) ?></div>
                                    <div class="small text-muted"><?= htmlspecialchars($a['account_no']) ?></div>
                                <?php else: ?>
                                    <span class="text-muted small">-</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <span class="badge bg-info text-dark rounded-pill fs-6"><?= $a['reseller_count'] ?></span>
                            </td>
                            <td class="fw-bold text-success">৳<?= number_format($a['balance'] ?? 0, 2) ?></td>
                            <td class="text-end pe-3">
                                <button type="button"
                                    class="btn btn-outline-secondary btn-sm btn-edit-real-agent"
                                    title="Edit"
                                    data-agent="<?= $agentJson ?>">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Add/Edit Agent Modal -->
<div class="modal fade" id="realAgentModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="realAgentModalTitle">Add New Agent</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" name="agent_id" id="ra_id">
                
                <h6 class="fw-bold text-primary mb-3">Basic Info</h6>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Name</label>
                        <input type="text" name="name" id="ra_name" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Phone</label>
                        <input type="text" name="phone" id="ra_phone" class="form-control form-control-sm" required>
                    </div>
                </div>
                <div class="mb-2">
                    <label class="form-label small fw-bold">Email</label>
                    <input type="email" name="email" id="ra_email" class="form-control form-control-sm">
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold">Address</label>
                    <textarea name="address" id="ra_address" class="form-control form-control-sm" rows="2"></textarea>
                </div>

                <h6 class="fw-bold text-primary mb-3">Bank Information (Optional)</h6>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Bank Name</label>
                        <input type="text" name="bank_name" id="ra_bank_name" class="form-control form-control-sm">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Account Name</label>
                        <input type="text" name="account_name" id="ra_account_name" class="form-control form-control-sm">
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Account No</label>
                        <input type="text" name="account_no" id="ra_account_no" class="form-control form-control-sm">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold">Branch Name</label>
                        <input type="text" name="branch_name" id="ra_branch_name" class="form-control form-control-sm">
                    </div>
                </div>
                <div class="mb-2">
                    <label class="form-label small fw-bold">Routing No</label>
                    <input type="text" name="routing_no" id="ra_routing_no" class="form-control form-control-sm">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="add_agent" id="ra_submit" class="btn btn-primary btn-sm">Save Agent</button>
            </div>
        </form>
    </div>
</div>

<script src="assets/js/manage-agents.js?v=<?= APP_DEPLOYMENT_ID ?>"></script>
