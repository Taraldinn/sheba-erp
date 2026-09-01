<?php
// MY PACKAGES VIEW (RESELLER / SUB-RESELLER PERSPECTIVE)
if(!hasRole('Reseller') && !hasRole('SubReseller')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$services_query = "SELECT * FROM ".TBL_SERVICES;
if (isset($_SESSION['allowed_packages']) && is_array($_SESSION['allowed_packages']) && !empty($_SESSION['allowed_packages'])) {
    $allowed_ids = implode(',', array_map('intval', $_SESSION['allowed_packages']));
    $services_query .= " WHERE id IN ($allowed_ids)";
}
$services = safeFetchAll($pdo, $services_query);

// Fetch existing sell prices
$stmt = $pdo->prepare("SELECT service_id, price FROM ".TBL_SELL_PRICING." WHERE staff_id=?");
$stmt->execute([$_SESSION['admin_id']]);
$sell_prices = [];
while ($r = $stmt->fetch()) {
    $sell_prices[$r['service_id']] = floatval($r['price']);
}
?>

<div class="mb-4">
    <h4><i class="fas fa-box-open me-2"></i> Configure Package Selling Price</h4>
    <p class="text-muted">Set your custom selling prices for clients below. The <strong>Buying Price</strong> is what you pay to the main Admin.</p>
</div>

<form method="POST" action="">
    <div class="row g-3">
        <?php foreach($services as $s): 
            $buy_price = getBuyPrice($pdo, $_SESSION['admin_id'], $s['id']);
            $current_sell_price = isset($sell_prices[$s['id']]) ? $sell_prices[$s['id']] : $buy_price;
        ?>
            <div class="col-md-4">
                <div class="card h-100 shadow-sm border-primary">
                    <div class="card-body">
                        <h5 class="card-title text-primary"><i class="fas fa-wifi me-2"></i> <?= htmlspecialchars($s['name']) ?></h5>
                        <hr>
                        <div class="mb-3 d-flex justify-content-between align-items-center">
                            <span class="text-muted small">Your Cost (Buying Price):</span>
                            <span class="fw-bold text-danger">৳<?= number_format($buy_price, 2) ?></span>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Selling Price For Clients (৳)</label>
                            <div class="input-group">
                                <span class="input-group-text bg-light">৳</span>
                                <input type="number" step="0.01" name="rates[<?= $s['id'] ?>]" class="form-control fw-bold text-success" value="<?= $current_sell_price ?>" required min="<?= $buy_price ?>">
                            </div>
                            <div class="form-text">Minimum price allowed is your buying cost.</div>
                        </div>
                    </div>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
    
    <div class="mt-4 text-end">
        <button type="submit" name="save_my_rates" class="btn btn-primary btn-lg shadow"><i class="fas fa-save me-2"></i> Save Package Prices</button>
    </div>
</form>
