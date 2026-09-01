<?php require_once __DIR__ . '/layout/header.php'; ?>

<div class="card mb-4 min-vh-50">
    <div class="card-header bg-transparent border-bottom py-3">
        <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-history me-2 text-primary"></i> Detailed Payment History</h6>
    </div>
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
                <thead class="table-light">
                    <tr>
                        <th class="ps-3">Date & Time</th>
                        <th>Transaction ID</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th class="text-end pe-3">Action</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($invoices)): ?>
                        <tr><td colspan="5" class="text-center text-muted py-5">No transaction history found to display.</td></tr>
                    <?php else: ?>
                        <?php foreach ($invoices as $inv):
                            $inv_desc = $inv['description'];
                            $inv_type = $inv['action_type'];

                            // Parse transaction ID
                            $trx_id = 'N/A';
                            if (preg_match('/Trx:\s*([a-zA-Z0-9\-\_]+)/i', $inv_desc, $matches)) {
                                $trx_id = trim($matches[1]);
                            }

                            // Parse amount
                            $amt = 0.00;
                            if (preg_match('/Amount:\s*(?:৳|BDT|Tk)?\s*([0-9,.]+)/iu', $inv_desc, $matches)) {
                                $amt = floatval(str_replace(',', '', $matches[1]));
                            } elseif (preg_match('/[৳]?\s*([0-9,.]+)/u', $inv_desc, $matches)) {
                                $amt = floatval(str_replace(',', '', $matches[1]));
                            } else {
                                $amt = floatval($c['bill_amount']);
                            }

                            // Determine status
                            $row_is_due      = ($inv_type === 'Recharge' && stripos($inv_desc, 'Trx: Due') !== false);
                            $row_is_pay_due  = ($inv_type === 'Pay Due');
                            $row_due_paid    = false;

                            if ($row_is_due) {
                                // Check if a Pay Due entry exists after this recharge
                                foreach ($invoices as $chk) {
                                    if ($chk['action_type'] === 'Pay Due' && $chk['timestamp'] >= $inv['timestamp']) {
                                        $row_due_paid = true;
                                        break;
                                    }
                                }
                            }

                            // Badge & amount color
                            if ($row_is_pay_due) {
                                $badge_html  = '<span class="badge rounded-pill" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;font-size:0.7rem;"><i class="fas fa-money-bill-wave me-1"></i>Due Cleared</span>';
                                $amt_class   = 'text-info';
                                $amt_prefix  = '+ ';
                            } elseif ($row_is_due && !$row_due_paid) {
                                $badge_html  = '<span class="badge rounded-pill" style="background:#fffbeb;color:#d97706;border:1px solid #fcd34d;font-size:0.7rem;"><i class="fas fa-clock me-1"></i>Payment Due</span>';
                                $amt_class   = 'text-warning';
                                $amt_prefix  = '';
                            } elseif ($row_is_due && $row_due_paid) {
                                $badge_html  = '<span class="badge rounded-pill" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;font-size:0.7rem;"><i class="fas fa-check-circle me-1"></i>Due Paid</span>';
                                $amt_class   = 'text-success';
                                $amt_prefix  = '';
                            } else {
                                $badge_html  = '<span class="badge rounded-pill" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;font-size:0.7rem;"><i class="fas fa-check-circle me-1"></i>Paid</span>';
                                $amt_class   = 'text-success';
                                $amt_prefix  = '';
                            }
                        ?>
                            <tr>
                                <td class="ps-3 text-muted"><?= date('d F Y, h:i A', strtotime($inv['timestamp'])) ?></td>
                                <td>
                                    <?php if ($trx_id !== 'N/A'): ?>
                                        <span class="badge bg-light text-dark border font-monospace"><?= htmlspecialchars($trx_id) ?></span>
                                    <?php else: ?>
                                        <span class="text-muted">—</span>
                                    <?php endif; ?>
                                </td>
                                <td class="fw-bold <?= $amt_class ?>">৳<?= number_format($amt, 2) ?></td>
                                <td><?= $badge_html ?></td>
                                <td class="text-end pe-3">
                                    <a href="?panel=client&tab=recharge_invoice&id=<?= $inv['id'] ?>" class="btn btn-xs btn-outline-primary btn-sm rounded-pill">
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

<?php require_once __DIR__ . '/layout/footer.php'; ?>

