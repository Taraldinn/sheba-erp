<?php
// OFFERS VIEW (SUB-RESELLER PROMOTIONS)
if(!hasRole('SubReseller')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

if (hasRole('Admin') || isOffice()) {
    $offers = safeFetchAll($pdo, "SELECT * FROM ".TBL_OFFERS." ORDER BY id DESC");
} else {
    $offers = safeFetchAll($pdo, "SELECT * FROM ".TBL_OFFERS." WHERE staff_id=? ORDER BY id DESC", [$user]);
}
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4><i class="fas fa-gift me-2 text-primary"></i> My Promo Offers</h4>
    <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#addOfferModal">
        <i class="fas fa-plus me-1"></i> New Offer
    </button>
</div>

<div class="row g-3">
    <?php if(empty($offers)): ?>
        <div class="col-12 text-center py-5">
            <h5 class="text-muted">No offers created yet.</h5>
            <p class="small text-muted">Create special deals (e.g., Buy 3 Months, Get 1 Free) for your clients.</p>
        </div>
    <?php else: foreach($offers as $o): ?>
        <div class="col-md-4">
            <div class="card h-100 shadow-sm border-0 border-start border-primary border-4">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <h5 class="card-title fw-bold"><?= $o['name'] ?></h5>
                        <span class="badge bg-<?= $o['status']=='Active'?'success':'secondary' ?>"><?= $o['status'] ?></span>
                    </div>
                    <div class="h4 text-primary my-3"><?= $o['buy_days'] ?>+<?= $o['free_days'] ?> Days</div>
                    <p class="card-text small text-muted mb-3"><?= $o['description'] ?? 'No description provided.' ?></p>
                    <div class="small text-muted"> <i class="far fa-calendar-alt me-1"></i> Valid until: <?= !empty($o['valid_until']) ? date('d M Y', strtotime($o['valid_until'])) : 'Unlimited' ?></div>
                </div>
                <div class="card-footer bg-white border-0 py-3">
                    <button class="btn btn-outline-danger btn-sm w-100" onclick="confirmDeleteOffer(<?= $o['id'] ?>)">Delete Offer</button>
                </div>
            </div>
        </div>
    <?php endforeach; endif; ?>
</div>

<!-- Add Offer Modal -->
<div class="modal fade" id="addOfferModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" class="modal-content">
            <div class="modal-header"><h5 class="modal-title">Create New Promo Offer</h5></div>
            <div class="modal-body">
                <div class="mb-3">
                    <label class="form-label">Offer Name</label>
                    <input type="text" name="name" class="form-control" placeholder="e.g. Winter Special" required>
                </div>
                <div class="row g-2">
                    <div class="col-6 mb-3">
                        <label class="form-label">Buy Days</label>
                        <input type="number" name="buy_days" class="form-control" value="90" required>
                    </div>
                    <div class="col-6 mb-3">
                        <label class="form-label">Free Days</label>
                        <input type="number" name="free_days" class="form-control" value="30" required>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Description</label>
                    <textarea name="description" class="form-control" rows="2"></textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label">Valid Until (Optional)</label>
                    <input type="date" name="valid_until" class="form-control">
                </div>
                <div class="alert alert-info small py-2">
                    <i class="fas fa-info-circle me-1"></i> Tip: 1 Month = 30 Days. <br>
                    Ex: 2 Months = 60 Buy Days.
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="submit" name="create_offer" class="btn btn-primary">Create Offer</button>
            </div>
        </form>
    </div>
</div>

<script>
    function confirmDeleteOffer(id) {
        if (confirm('Are you sure you want to delete this offer?')) {
            window.location.href = '?tab=offers&action=delete_offer&id=' + id;
        }
    }
</script>
