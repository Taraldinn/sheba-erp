<?php
// PAYMENT HISTORY VIEW (RESELLER / STAFF PERSPECTIVE)
if (isAdminRole($role)) { echo "<div class='alert alert-info'>Admins should use the Reports tab for full details.</div>"; }

$payments = safeFetchAll($pdo, "SELECT * FROM ".TBL_TX." WHERE staff_id=? AND type='Income' ORDER BY id DESC LIMIT 50", [$user]);
?>

<div class="mb-4">
    <h4><i class="fas fa-history me-2 text-info"></i> My Deposit History</h4>
    <p class="text-muted">A list of your last 50 wallet deposits.</p>
</div>

<div class="card shadow-sm border-0">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Transaction ID</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Method</th>
                        <th class="text-end pe-3">Date</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($payments)): ?>
                        <tr><td colspan="5" class="text-center py-5 text-muted">No deposit history found.</td></tr>
                    <?php else: foreach($payments as $p): ?>
                        <tr>
                            <td class="ps-3 fw-bold">#TX-<?= str_pad($p['id'], 6, '0', STR_PAD_LEFT) ?></td>
                            <td class="text-primary fw-bold">৳<?= number_format($p['amount'], 2) ?></td>
                            <td><span class="badge bg-success">Completed</span></td>
                            <td><span class="badge bg-light text-dark border"><?= $p['method'] ?></span></td>
                            <td class="text-end pe-3 small text-muted"><?= date('d M Y, H:i', strtotime($p['created_at'])) ?></td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
