<?php
// views/client/payment_verification.php
require_once __DIR__ . '/layout/header.php';

$error = '';
$success_msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['verify_payment'])) {
    $trx_id = strtoupper(trim($_POST['trx_id'] ?? ''));
    $amount = floatval($_POST['amount'] ?? 0);
    $gateway = trim($_POST['gateway'] ?? '');
    $invoice_id = trim($_POST['invoice_id'] ?? 'RECHARGE');

    if (empty($trx_id) || $amount <= 0 || empty($gateway)) {
        $error = 'All fields are required. Amount must be positive.';
    } else {
        require_once __DIR__ . '/../../classes/PaymentMatchingEngine.php';
        $engine = new PaymentMatchingEngine($pdo);
        $res = $engine->processClientRequest($client_id, $invoice_id, $gateway, $amount, $trx_id);
        
        if ($res['success']) {
            $success_msg = $res['message'];
        } else {
            $error = $res['message'];
        }
    }
}
?>

<div class="row justify-content-center">
    <div class="col-md-8 col-lg-6">
        <div class="card shadow-sm border-0">
            <div class="card-header bg-gradient-purple text-white py-3 border-0 rounded-top">
                <h5 class="mb-0 fw-bold"><i class="fas fa-sms me-2"></i> SMS Payment Verification</h5>
            </div>
            <div class="card-body p-4">
                <div class="alert alert-info border-0 bg-info bg-opacity-10 text-dark small rounded-3 mb-4">
                    <div class="d-flex">
                        <i class="fas fa-info-circle me-2 mt-1 text-info"></i>
                        <div>
                            Please enter the transaction ID and exact paid amount of your payment. The connection will be activated automatically when matched with our merchant receiver.
                        </div>
                    </div>
                </div>

                <?php if ($error): ?>
                    <div class="alert alert-danger border-0 bg-danger bg-opacity-10 text-danger small rounded-3 mb-3 d-flex align-items-center">
                        <i class="fas fa-times-circle me-2"></i> <?= htmlspecialchars($error) ?>
                    </div>
                <?php endif; ?>
                <?php if ($success_msg): ?>
                    <div class="alert alert-success border-0 bg-success bg-opacity-10 text-success small rounded-3 mb-3 d-flex align-items-center">
                        <i class="fas fa-check-circle me-2"></i> <?= htmlspecialchars($success_msg) ?>
                    </div>
                <?php endif; ?>

                <form method="POST">
                    <div class="mb-3">
                        <label class="form-label fw-semibold text-secondary small">MFS Gateway Provider</label>
                        <select name="gateway" class="form-select" required>
                            <option value="">-- Choose Gateway --</option>
                            <option value="bKash">bKash</option>
                            <option value="Nagad">Nagad</option>
                            <option value="Rocket">Rocket</option>
                            <option value="Upay">Upay</option>
                        </select>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label fw-semibold text-secondary small">Paid Amount (৳)</label>
                        <input type="number" step="0.01" name="amount" class="form-control" placeholder="e.g. 500.00" required>
                    </div>

                    <div class="mb-3">
                        <label class="form-label fw-semibold text-secondary small">Transaction ID (TrxID)</label>
                        <input type="text" name="trx_id" class="form-control font-monospace" placeholder="e.g. 8K90XT51" required style="text-transform: uppercase;">
                    </div>

                    <div class="mb-4">
                        <label class="form-label fw-semibold text-secondary small">Reference / Invoice (Optional)</label>
                        <input type="text" name="invoice_id" class="form-control" placeholder="RECHARGE" value="RECHARGE">
                    </div>

                    <button type="submit" name="verify_payment" class="btn btn-primary w-100 py-2.5 fw-bold shadow-sm">
                        <i class="fas fa-shield-alt me-1"></i> Verify & Activate Connection
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>

<?php require_once __DIR__ . '/layout/footer.php'; ?>
