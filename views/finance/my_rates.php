<?php
// MY RATES VIEW - Reseller / POP / Branch panel
// Shows ONLY the packages assigned to this reseller by the admin

$allowed_roles = ['Reseller', 'SubReseller', 'Sub-Reseller'];
$curr_role     = $_SESSION['user_role'] ?? '';
$is_allowed    = in_array($curr_role, $allowed_roles) || (isOffice() && !isSystemAuthority());

if (!$is_allowed) {
    echo "<div class='alert alert-danger'><i class='fas fa-lock me-2'></i>Access Denied.</div>";
    return;
}

// Determine the effective owner_id (branch office staff resolves to parent)
$owner_id = (int)($_SESSION['admin_id'] ?? 0);
if (isOffice() && !isSystemAuthority()) {
    $parent = safeFetch($pdo, "SELECT parent_id, allowed_packages FROM " . TBL_STAFF . " WHERE id=?", [$owner_id]);
    if ($parent && $parent['parent_id'] > 0) {
        // Use parent's allowed_packages for branch/office staff
        $owner_id = (int)$parent['parent_id'];
        $parent_row = safeFetch($pdo, "SELECT allowed_packages FROM " . TBL_STAFF . " WHERE id=?", [$owner_id]);
        $assigned_packages = isset($parent_row['allowed_packages']) && !empty($parent_row['allowed_packages'])
            ? json_decode($parent_row['allowed_packages'], true) : null;
    } else {
        $assigned_packages = $_SESSION['allowed_packages'] ?? null;
    }
} else {
    $assigned_packages = $_SESSION['allowed_packages'] ?? null;
}

// Retrieve settings for profile/speed column visibility
$show_profile_speed = get_opt($pdo, 'show_reseller_profile_speed', '1') == '1';

// Build query — only show assigned packages
$services_sql = "SELECT s.id, s.name, s.price AS default_sell_price, s.buying_price AS default_buy_price,
                        s.mikrotik_profile_name, s.rate_limit_profile,
                        r.name AS router_name
                 FROM " . TBL_SERVICES . " s
                 LEFT JOIN " . TBL_ROUTERS . " r ON s.router_id = r.id";

$sql_params = [];

if (!empty($assigned_packages) && is_array($assigned_packages)) {
    $pkg_ids = array_map('intval', $assigned_packages);
    $placeholders = implode(',', $pkg_ids);
    $services_sql .= " WHERE s.id IN ($placeholders)";
}

$services_sql .= " ORDER BY s.price ASC";
$services = safeFetchAll($pdo, $services_sql);

// Build per-service custom pricing maps for this owner
$custom_buy  = [];
$custom_sell = [];

$buy_rows  = safeFetchAll($pdo, "SELECT service_id, custom_price FROM " . TBL_PRICING       . " WHERE staff_id=?", [$owner_id]);
$sell_rows = safeFetchAll($pdo, "SELECT service_id, price        FROM " . TBL_SELL_PRICING  . " WHERE staff_id=?", [$owner_id]);

foreach ($buy_rows  as $row) $custom_buy[$row['service_id']]  = floatval($row['custom_price']);
foreach ($sell_rows as $row) $custom_sell[$row['service_id']] = floatval($row['price']);

// Check if no packages assigned at all
$no_packages_assigned = !empty($assigned_packages) && is_array($assigned_packages) && count($assigned_packages) === 0;
?>

<div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
    <div>
        <h4 class="mb-1"><i class="fas fa-tags me-2 text-primary"></i> My Rates</h4>
        <p class="text-muted small mb-0">Package rates assigned to your account by the administrator.</p>
    </div>
    <span class="badge bg-primary bg-opacity-10 text-primary border border-primary px-3 py-2 fs-6">
        <i class="fas fa-user-tag me-1"></i> <?= htmlspecialchars($curr_role) ?>
    </span>
</div>

<?php if (empty($services)): ?>
<div class="text-center py-5">
    <div class="mb-3">
        <i class="fas fa-box-open fa-4x text-muted opacity-25"></i>
    </div>
    <h5 class="text-muted">No Packages Assigned</h5>
    <p class="text-muted small">The administrator has not assigned any packages to your account yet.<br>Please contact your administrator.</p>
</div>
<?php else: ?>

<!-- Summary cards -->
<?php
$total_buy  = 0;
$total_sell = 0;
foreach ($services as $s) {
    $total_buy  += isset($custom_buy[$s['id']])  ? $custom_buy[$s['id']]  : floatval($s['default_buy_price']);
    $total_sell += isset($custom_sell[$s['id']]) ? $custom_sell[$s['id']] : floatval($s['default_sell_price']);
}
?>
<div class="row g-3 mb-4">
    <div class="col-sm-4">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color:#fff;">
            <div class="card-body py-3">
                <div class="small opacity-75 mb-1"><i class="fas fa-box me-1"></i> Assigned Packages</div>
                <div class="fs-2 fw-bold"><?= count($services) ?></div>
            </div>
        </div>
    </div>
    <div class="col-sm-4">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #d97706, #f59e0b); color:#fff;">
            <div class="card-body py-3">
                <div class="small opacity-75 mb-1"><i class="fas fa-shopping-cart me-1"></i> Total Buy Rates</div>
                <div class="fs-4 fw-bold">৳<?= number_format($total_buy, 0) ?></div>
                <small class="opacity-75">Your cost per package</small>
            </div>
        </div>
    </div>
    <div class="col-sm-4">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #059669, #10b981); color:#fff;">
            <div class="card-body py-3">
                <div class="small opacity-75 mb-1"><i class="fas fa-hand-holding-usd me-1"></i> Total Sell Rates</div>
                <div class="fs-4 fw-bold">৳<?= number_format($total_sell, 0) ?></div>
                <small class="opacity-75">Charge to client</small>
            </div>
        </div>
    </div>
</div>

<!-- Rates Table -->
<div class="card border-0 shadow-sm">
    <div class="card-header bg-white border-bottom py-3">
        <div class="row align-items-center g-2">
            <div class="col">
                <h6 class="mb-0 fw-bold">
                    <i class="fas fa-list me-2 text-secondary"></i>Assigned Package Rates
                    <span class="badge bg-primary ms-2"><?= count($services) ?></span>
                </h6>
            </div>
            <div class="col-auto">
                <input type="text" id="rateSearch" class="form-control form-control-sm" placeholder="&#xf002; Search package..."
                       style="width:200px; font-family: 'Font Awesome 5 Free', sans-serif;"
                       oninput="filterRates(this.value)">
            </div>
        </div>
    </div>
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="ratesTable">
            <thead class="table-light">
                <tr>
                    <th class="ps-3" style="width:40px">#</th>
                    <th>Package Name</th>
                    <?php if ($show_profile_speed): ?>
                    <th>Profile / Speed</th>
                    <?php endif; ?>
                    <th>Router</th>
                    <th class="text-warning fw-bold">
                        <i class="fas fa-shopping-cart me-1"></i> Buy Price
                        <small class="d-block fw-normal text-muted" style="font-size:11px">Cost per client</small>
                    </th>
                    <th class="text-success fw-bold">
                        <i class="fas fa-hand-holding-usd me-1"></i> Sell Price
                        <small class="d-block fw-normal text-muted" style="font-size:11px">Charge to client</small>
                    </th>
                    <th class="text-primary fw-bold">
                        <i class="fas fa-chart-line me-1"></i> Margin
                        <small class="d-block fw-normal text-muted" style="font-size:11px">Profit per renewal</small>
                    </th>
                    <th class="text-center">Rate Type</th>
                </tr>
            </thead>
            <tbody>
            <?php $i = 1; foreach ($services as $s):
                $buy_price  = isset($custom_buy[$s['id']])  ? $custom_buy[$s['id']]  : floatval($s['default_buy_price']);
                $sell_price = isset($custom_sell[$s['id']]) ? $custom_sell[$s['id']] : floatval($s['default_sell_price']);
                $margin     = $sell_price - $buy_price;
                $is_custom_buy  = isset($custom_buy[$s['id']]);
                $is_custom_sell = isset($custom_sell[$s['id']]);
                $margin_pct = ($sell_price > 0) ? round(($margin / $sell_price) * 100, 1) : 0;
            ?>
            <tr class="rate-row">
                <td class="ps-3 text-muted small"><?= $i++ ?></td>
                <td>
                    <div class="fw-semibold"><?= htmlspecialchars($s['name']) ?></div>
                    <?php if ($s['rate_limit_profile']): ?>
                    <small class="text-muted"><i class="fas fa-tachometer-alt me-1 text-secondary"></i><?= htmlspecialchars($s['rate_limit_profile']) ?></small>
                    <?php endif; ?>
                </td>
                <?php if ($show_profile_speed): ?>
                <td class="text-muted small"><?= htmlspecialchars($s['mikrotik_profile_name'] ?: '—') ?></td>
                <?php endif; ?>
                <td class="text-muted small">
                    <i class="fas fa-server me-1 opacity-50"></i><?= htmlspecialchars($s['router_name'] ?: 'Any / Global') ?>
                </td>
                <td>
                    <div class="fw-bold text-warning fs-6">৳<?= number_format($buy_price, 0) ?></div>
                    <?php if ($is_custom_buy): ?>
                    <span class="badge bg-warning text-dark" style="font-size:10px"><i class="fas fa-star me-1"></i>Custom</span>
                    <?php else: ?>
                    <span class="badge bg-light text-secondary border" style="font-size:10px">Default</span>
                    <?php endif; ?>
                </td>
                <td>
                    <div class="fw-bold text-success fs-6">৳<?= number_format($sell_price, 0) ?></div>
                    <?php if ($is_custom_sell): ?>
                    <span class="badge bg-success" style="font-size:10px"><i class="fas fa-star me-1"></i>Custom</span>
                    <?php else: ?>
                    <span class="badge bg-light text-secondary border" style="font-size:10px">Default</span>
                    <?php endif; ?>
                </td>
                <td>
                    <?php if ($margin > 0): ?>
                        <div class="fw-semibold text-success">+৳<?= number_format($margin, 0) ?></div>
                        <small class="text-success opacity-75"><?= $margin_pct ?>%</small>
                    <?php elseif ($margin < 0): ?>
                        <div class="fw-semibold text-danger">-৳<?= number_format(abs($margin), 0) ?></div>
                        <small class="text-danger opacity-75"><?= $margin_pct ?>%</small>
                    <?php else: ?>
                        <span class="text-muted">৳0 — 0%</span>
                    <?php endif; ?>
                </td>
                <td class="text-center">
                    <?php if ($is_custom_buy || $is_custom_sell): ?>
                    <span class="badge px-2 py-1" style="background:#ede9fe; color:#4f46e5; border:1px solid #c4b5fd;">
                        <i class="fas fa-user-cog me-1"></i> Custom Rate
                    </span>
                    <?php else: ?>
                    <span class="badge bg-light text-secondary border px-2 py-1">
                        <i class="fas fa-globe me-1"></i> Default Rate
                    </span>
                    <?php endif; ?>
                </td>
            </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <div class="card-footer bg-light border-top small text-muted py-2 px-3">
        <span class="me-3"><i class="fas fa-shopping-cart text-warning me-1"></i><b>Buy Price</b> = cost deducted from your wallet per renewal</span>
        <span class="me-3"><i class="fas fa-hand-holding-usd text-success me-1"></i><b>Sell Price</b> = amount you charge your client</span>
        <span><i class="fas fa-star text-primary me-1"></i><b>Custom Rate</b> = admin has set a special rate for your account</span>
    </div>
</div>

<?php endif; ?>

<script>
function filterRates(q) {
    q = q.toLowerCase();
    document.querySelectorAll('#ratesTable .rate-row').forEach(function(row) {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
</script>
