<?php
// ACCOUNTS VIEW
?>
<?php if (isset($error) && $error !== ''): ?>
    <div class="alert alert-danger alert-dismissible fade show shadow-sm border-start border-4 border-danger" role="alert">
        <i class="fas fa-exclamation-triangle me-2"></i><strong>Payment Error:</strong> <?= htmlspecialchars($error) ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
<?php endif; ?>

<?php if (isset($msg) && $msg !== ''): ?>
    <div class="alert alert-success alert-dismissible fade show shadow-sm border-start border-4 border-success" role="alert">
        <i class="fas fa-check-circle me-2"></i><?= htmlspecialchars($msg) ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
<?php endif; ?>

<div class="row mb-4">
    <div class="col-md-12">
        <div class="card shadow-sm border-0 bg-primary text-white">
            <div class="card-body p-4">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h4 class="fw-bold mb-1"><i class="fas fa-wallet me-2"></i> Add Funds to Wallet</h4>
                        <p class="mb-0 text-white-50">Instant deposit via bKash.</p>
                    </div>
                </div>
                <hr class="bg-white opacity-25">
                <form method="POST" action="?tab=accounts" class="row g-3 align-items-end">
                    <div class="col-md-4">
                        <label class="form-label small text-white-50">Amount (BDT)</label>
                        <input type="number" name="amount" class="form-control form-control-lg fw-bold" placeholder="500" min="10" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small text-white-50">Payment Method</label>
                        <select name="gateway" class="form-select form-select-lg fw-bold text-dark">
                            <option value="bKash">bKash Payment</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <button type="submit" name="initiate_payment" class="btn btn-light btn-lg w-100 fw-bold text-primary shadow-sm">
                            <i class="fas fa-bolt me-2"></i> Pay Now
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<div class="row">
    <div class="col-md-12">
        <div class="card shadow-sm">
            <div class="card-header bg-white py-3">
                <h6 class="mb-0 fw-bold"><i class="fas fa-list me-2"></i> Recent Transactions</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Type</th>
                                <th>Amount</th>
                                <th>Description</th>
                                <th>Method</th>
                                <th class="text-end pe-3">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php 
                            $txs = safeFetchAll($pdo, "SELECT * FROM ".TBL_TX." WHERE staff_id=? ORDER BY id DESC LIMIT 10", [$user]);
                            if(empty($txs)): ?>
                                <tr><td colspan="5" class="text-center py-5 text-muted">No transactions found</td></tr>
                            <?php else: foreach($txs as $t): ?>
                                <tr>
                                    <td class="ps-3">
                                        <span class="badge <?= ($t['type']=='Income')?'bg-success':'bg-danger' ?>">
                                            <?= $t['type'] ?>
                                        </span>
                                    </td>
                                    <td class="fw-bold">৳<?= number_format($t['amount'], 2) ?></td>
                                    <td><?= $t['description'] ?></td>
                                    <td><span class="badge bg-light text-dark border"><?= $t['method'] ?></span></td>
                                    <td class="text-end pe-3 small text-muted"><?= date('d M, H:i', strtotime($t['created_at'])) ?></td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>
