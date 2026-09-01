<?php
// MY PACKAGES VIEW (RESELLER PERSPECTIVE)
if(!hasRole('SubReseller')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$services = safeFetchAll($pdo, "SELECT * FROM ".TBL_SERVICES);
?>

<div class="mb-4">
    <h4><i class="fas fa-box-open me-2"></i> My Available Packages</h4>
    <p class="text-muted">Below are the service packages available for you to assign to your clients. Pricing is set by the master admin.</p>
</div>

<div class="row g-3">
    <?php foreach($services as $s): 
        $my_price = getBuyPrice($pdo, $user, $s['id']);
    ?>
        <div class="col-md-4">
            <div class="card h-100 shadow-sm">
                <div class="card-body">
                    <h5 class="card-title"><?= $s['name'] ?></h5>
                    <div class="h3 fw-bold text-primary mb-3">৳<?= number_format($my_price, 0) ?> <small class="fs-6 text-muted">/ mo</small></div>
                    <ul class="list-unstyled mb-0 small">
                        <li class="mb-1"><i class="fas fa-check text-success me-2"></i> Standard Managed Speed</li>
                        <li class="mb-1"><i class="fas fa-check text-success me-2"></i> 30 Days Cycle</li>
                        <li><i class="fas fa-check text-success me-2"></i> Auto-recharge Enabled</li>
                    </ul>
                </div>
            </div>
        </div>
    <?php endforeach; ?>
</div>
