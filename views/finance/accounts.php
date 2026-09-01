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
                            <option value="bKash">bKash API Gateway</option>
                            <?php 
                            $parent_id = $_SESSION['parent_id'] ?? 0;
                            $auto_gws = safeFetchAll($pdo, "SELECT id, gateway_name FROM tenant_payment_gateways WHERE staff_id = ? AND status = 'active' AND checkout_enabled = 1", [$parent_id]);
                            foreach($auto_gws as $agw):
                            ?>
                            <option value="AUTO_<?= $agw['id'] ?>"><?= htmlspecialchars($agw['gateway_name']) ?> Auto Checkout</option>
                            <?php endforeach; ?>
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
            <div class="card-header bg-white py-0 border-bottom-0">
                <ul class="nav nav-tabs mt-3" id="walletTabs" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active fw-bold text-dark" id="tx-tab" data-bs-toggle="tab" data-bs-target="#tx" type="button" role="tab" aria-controls="tx" aria-selected="true"><i class="fas fa-list me-2"></i> Recent Transactions</button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link fw-bold text-dark" id="profit-tab" data-bs-toggle="tab" data-bs-target="#profit" type="button" role="tab" aria-controls="profit" aria-selected="false"><i class="fas fa-chart-line text-success me-2"></i> Profit Ledger</button>
                    </li>
                </ul>
            </div>
            <div class="card-body p-0 border-top">
                <div class="tab-content" id="walletTabsContent">
                    
                    <!-- TRANSACTIONS TAB -->
                    <div class="tab-pane fade show active" id="tx" role="tabpanel" aria-labelledby="tx-tab">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="bg-light">
                                    <tr>
                                        <th class="ps-3">Type</th>
                                        <th>Amount</th>
                                        <th>Description</th>
                                        <th>Staff/Panel</th>
                                        <th>Method</th>
                                        <th class="text-end pe-3">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php 
                                    $user_role = $_SESSION['user_role'] ?? '';
                                    $is_office = isOfficeRole($user_role);
                                    $wallet_owner = ($is_office && ($_SESSION['parent_id'] ?? 0) > 0) ? $_SESSION['parent_id'] : $user;
                                    
                                    $txs = safeFetchAll($pdo, "SELECT t.*, s.username as staff_name FROM ".TBL_TX." t LEFT JOIN ".TBL_STAFF." s ON t.added_by = s.id WHERE t.staff_id=? OR t.staff_id IN (SELECT id FROM ".TBL_STAFF." WHERE parent_id=?) ORDER BY t.id DESC LIMIT 50", [$wallet_owner, $wallet_owner]);
                                    if(empty($txs)): ?>
                                        <tr><td colspan="6" class="text-center py-5 text-muted">No transactions found</td></tr>
                                    <?php else: foreach($txs as $t): ?>
                                        <tr>
                                            <td class="ps-3">
                                                <span class="badge <?= ($t['type']=='Income')?'bg-success':'bg-danger' ?>">
                                                    <?= $t['type'] ?>
                                                </span>
                                            </td>
                                            <td class="fw-bold">৳<?= number_format($t['amount'], 2) ?></td>
                                            <td><?= $t['description'] ?></td>
                                            <td class="small fw-bold text-dark"><span class="badge bg-light text-dark border"><i class="fas fa-user-shield me-1 text-primary"></i> <?= htmlspecialchars($t['staff_name'] ?? 'System') ?></span></td>
                                            <td><span class="badge bg-light text-dark border"><?= $t['method'] ?></span></td>
                                            <td class="text-end pe-3 small text-muted"><?= date('d M, H:i', strtotime($t['created_at'])) ?></td>
                                        </tr>
                                    <?php endforeach; endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- PROFIT TAB -->
                    <div class="tab-pane fade" id="profit" role="tabpanel" aria-labelledby="profit-tab">
                        <div class="p-3 bg-light border-bottom d-flex justify-content-between align-items-center">
                            <?php 
                            if (hasRole('Admin')) {
                                $total_profit = $pdo->query("SELECT SUM(CASE WHEN s.role IN ('Admin', 'Super Admin') THEN p.profit ELSE p.admin_profit END) FROM ".TBL_STAFF_PROFIT." p LEFT JOIN ".TBL_STAFF." s ON p.staff_id = s.id")->fetchColumn() ?: 0;
                            } else {
                                $total_profit = $pdo->query("SELECT SUM(profit) FROM ".TBL_STAFF_PROFIT." WHERE staff_id=".(int)$user)->fetchColumn() ?: 0;
                            }
                            ?>
                            <h6 class="mb-0 text-success fw-bold">Total Net Profit: ৳<?= number_format($total_profit, 2) ?></h6>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="bg-light">
                                    <tr>
                                        <th class="ps-3">Client ID</th>
                                        <?php if (hasRole('Admin')): ?>
                                            <th>Reseller</th>
                                        <?php endif; ?>
                                        <th>Collected</th>
                                        <th>Cost</th>
                                        <th>Net Profit</th>
                                        <th>Source</th>
                                        <th class="text-end pe-3">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php 
                                    if (hasRole('Admin')) {
                                        $profits = safeFetchAll($pdo, "SELECT p.*, s.username as reseller_name, s.role as reseller_role FROM ".TBL_STAFF_PROFIT." p LEFT JOIN ".TBL_STAFF." s ON p.staff_id = s.id ORDER BY p.id DESC LIMIT 50");
                                    } else {
                                        $profits = safeFetchAll($pdo, "SELECT p.* FROM ".TBL_STAFF_PROFIT." p WHERE p.staff_id=? ORDER BY p.id DESC LIMIT 50", [$user]);
                                    }
                                    
                                    if(empty($profits)): ?>
                                        <tr><td colspan="<?= hasRole('Admin') ? 7 : 6 ?>" class="text-center py-5 text-muted">No profit records found</td></tr>
                                    <?php else: foreach($profits as $p): 
                                        $is_mgr_admin = hasRole('Admin') && in_array($p['reseller_role'] ?? '', ['Admin', 'Super Admin']);
                                        $display_cost = (hasRole('Admin') && !$is_mgr_admin) ? $p['admin_cost'] : $p['package_cost'];
                                        $display_profit = (hasRole('Admin') && !$is_mgr_admin) ? $p['admin_profit'] : $p['profit'];
                                    ?>
                                        <tr>
                                            <td class="ps-3 fw-bold text-primary"><?= htmlspecialchars($p['client_user_id']) ?></td>
                                            <?php if (hasRole('Admin')): ?>
                                                <td><span class="badge bg-secondary"><?= htmlspecialchars($p['reseller_name'] ?? 'Direct') ?></span></td>
                                            <?php endif; ?>
                                            <td class="fw-bold text-success">৳<?= number_format($p['bill_amount'], 2) ?></td>
                                            <td class="fw-bold text-warning">৳<?= number_format($display_cost, 2) ?></td>
                                            <td class="fw-bold text-success">+৳<?= number_format($display_profit, 2) ?></td>
                                            <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($p['source']) ?></span></td>
                                            <td class="text-end pe-3 small text-muted"><?= date('d M, h:i A', strtotime($p['created_at'])) ?></td>
                                        </tr>
                                    <?php endforeach; endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>
</div>
