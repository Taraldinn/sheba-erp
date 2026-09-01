<?php
// EDIT CLIENT VIEW
$uid = intval($_GET['uid'] ?? 0);
$u = safeFetch($pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [$uid]);

if(!$u) { echo "<div class='alert alert-danger'>Client not found.</div>"; return; }

$routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS);
$services_query = "SELECT * FROM ".TBL_SERVICES;
if (isset($_SESSION['allowed_packages']) && is_array($_SESSION['allowed_packages']) && !empty($_SESSION['allowed_packages'])) {
    $allowed_ids = implode(',', array_map('intval', $_SESSION['allowed_packages']));
    $services_query .= " WHERE id IN ($allowed_ids)";
}
$services = safeFetchAll($pdo, $services_query);
$zones = safeFetchAll($pdo, "SELECT * FROM ".TBL_ZONES." WHERE staff_id=?", [$u['manager_id']]);
$tj_boxes = safeFetchAll($pdo, "SELECT * FROM ".TBL_TJ_BOXES." WHERE staff_id=?", [$u['manager_id']]);
require_once __DIR__ . '/../../includes/geo_data.php';

$pay_year = date('Y');
$payments = json_decode($u['monthly_payments'] ?? '{}', true);
$year_data = $payments[$pay_year] ?? [];

// Calculate prorated remaining days and original price
$today = new DateTime();
$bill_date = new DateTime($u['current_bill_date']);
$remaining_days = ($bill_date > $today) ? $today->diff($bill_date)->days : 0;

$original_pkg = $u['user_package'];
$original_price = 0;
foreach ($services as $s) {
    if ($s['name'] === $original_pkg) {
        $original_price = getSellPrice($pdo, $u['manager_id'], $s['id']);
        break;
    }
}
$original_due = floatval($u['due']);

// Promise calculations
$promise_days_used = 0;
$promise_due_amount = 0.00;
if ($u['promise_enabled'] == 1 && !empty($u['promise_date'])) {
    $today_str = date('Y-m-d');
    $expire_date_str = $u['current_bill_date'];
    if ($today_str > $expire_date_str) {
        $end_use_date_str = ($today_str < $u['promise_date']) ? $today_str : $u['promise_date'];
        $diff = strtotime($end_use_date_str) - strtotime($expire_date_str);
        $promise_days_used = max(0, round($diff / 86400));
        if ($promise_days_used > 0) {
            $net_bill = floatval($u['bill_amount'] ?? 0) - floatval($u['discount'] ?? 0);
            if ($net_bill <= 0) $net_bill = floatval($u['bill_amount'] ?? 0);
            $daily_rate = $net_bill / 30;
            $promise_due_amount = round($promise_days_used * $daily_rate, 2);
        }
    }
}
?>

<div class="card mb-4 shadow">
    <div class="card-header bg-secondary text-white d-flex justify-content-between align-items-center py-3">
        <h5 class="mb-0"><i class="fas fa-user-edit me-2"></i> Edit Full Profile: <?= $u['name'] ?> (<?= $u['user_id'] ?>)</h5>
        <a href="?view_id=<?= $u['id'] ?>" class="btn btn-sm btn-light fw-bold px-3">Back to Profile</a>
    </div>
    <div class="card-body p-4">
        <form method="POST" enctype="multipart/form-data" class="row g-4">
            <input type="hidden" name="uid" value="<?= $u['id'] ?>">
            
            <!-- Identity Section -->
            <div class="col-12"><h6 class="text-muted border-bottom pb-2">Client Identity</h6></div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-primary">Joining Date</label>
                <input type="date" name="joining_date" class="form-control" value="<?= date('Y-m-d', strtotime($u['joining_date'])) ?>">
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-danger">Full Name *</label>
                <input type="text" name="name" class="form-control" value="<?= $u['name'] ?>" required>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-danger">Primary Phone *</label>
                <input type="text" name="phone" class="form-control" value="<?= $u['phone'] ?>" required>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small">Alternate Phone</label>
                <input type="text" name="phone2" class="form-control" value="<?= $u['phone2'] ?>">
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-danger">National ID (NID) *</label>
                <input type="text" name="nid" class="form-control" value="<?= $u['nid'] ?>" required>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-primary">PPPoE ID (Username)</label>
                <input type="text" name="user_id" class="form-control" value="<?= $u['user_id'] ?>" required>
                <small class="text-muted italic">Warning: Changing this will disconnect the client.</small>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-primary">PPPoE Password</label>
                <input type="text" name="password" class="form-control" value="<?= $u['password'] ?>" placeholder="Update Password">
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small">Client Code / Custom ID (Optional)</label>
                <input type="text" name="client_code" class="form-control" value="<?= htmlspecialchars($u['client_code'] ?? '') ?>" placeholder="Custom ID or Client Code">
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small">Profile Picture</label>
                <input type="file" name="profile_pic" class="form-control" accept="image/*">
                <?php if(!empty($u['profile_pic'])): ?>
                    <div class="mt-2 text-success">
                        <i class="fas fa-check-circle me-1"></i> Has profile picture
                        <div class="mt-2">
                            <img src="/<?= htmlspecialchars(ltrim($u['profile_pic'], '/')) ?>" alt="Profile" class="img-thumbnail rounded" style="max-height: 100px;">
                        </div>
                    </div>
                <?php endif; ?>
            </div>

            <!-- Network & Billing Section -->
            <div class="col-12 mt-5"><h6 class="text-muted border-bottom pb-2">Network & Billing Setup</h6></div>
            <div class="col-md-4">
                <label class="form-label fw-bold small">Package</label>
                <select name="pkg" id="pkgSelect" class="form-select">
                    <?php foreach($services as $s): 
                        $sellPrice = getSellPrice($pdo, $u['manager_id'], $s['id']);
                    ?>
                        <option value="<?= $s['name'] ?>" data-price="<?= $sellPrice ?>" data-vat="<?= $s['vat_percent'] ?? 0 ?>" <?= ($u['user_package']==$s['name'])?'selected':'' ?>><?= $s['name'] ?> (<?= number_format($sellPrice,0) ?>৳)</option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small">Discount (৳)</label>
                <input type="number" name="discount" id="discountAmountEdit" class="form-control border-success text-success fw-bold" value="<?= $u['discount'] ?? 0 ?>" min="0" step="0.01">
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small">Bill Amount</label>
                <div class="input-group">
                    <span class="input-group-text bg-light">৳</span>
                    <input type="number" name="bill" id="billAmountEdit" class="form-control fw-bold" value="<?= $u['bill_amount'] ?>" required>
                </div>
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small text-danger">Due Balance</label>
                <div class="input-group">
                    <span class="input-group-text bg-danger text-white">৳</span>
                    <input type="number" name="due" class="form-control fw-bold text-danger border-danger" value="<?= $u['due'] ?>" min="0" step="0.01">
                </div>
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small">Client Status</label>
                <select name="status" class="form-select">
                    <option value="Active" <?= ($u['status']=='Active')?'selected':'' ?>>Active</option>
                    <option value="Promise Active" <?= ($u['status']=='Promise Active')?'selected':'' ?>>Promise Active</option>
                    <option value="Inactive" <?= ($u['status']=='Inactive')?'selected':'' ?>>Inactive</option>
                    <option value="Free" <?= ($u['status']=='Free')?'selected':'' ?>>Free</option>
                    <option value="Expire" <?= ($u['status']=='Expire')?'selected':'' ?>>Expire</option>
                    <option value="Left" <?= ($u['status']=='Left')?'selected':'' ?>>Left</option>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small">Billing Position</label>
                 <select name="bill_position" class="form-select">
                    <option value="Active" <?= ($u['bill_position']=='Active')?'selected':'' ?>>Active (Billable)</option>
                    <option value="Inactive" <?= ($u['bill_position']=='Inactive')?'selected':'' ?>>Inactive (Hold)</option>
                    <option value="Free" <?= ($u['bill_position']=='Free')?'selected':'' ?>>Free (No Bill)</option>
                    <option value="Expire" <?= ($u['bill_position']=='Expire')?'selected':'' ?>>Expire</option>
                    <option value="Left" <?= ($u['bill_position']=='Left')?'selected':'' ?>>Left</option>
                </select>
            </div>

            <!-- Promise Period Setup -->
            <div class="col-md-3">
                <label class="form-label fw-bold small text-warning"><i class="fas fa-handshake me-1"></i> Promise Period</label>
                <select name="promise_enabled" class="form-select border-warning" onchange="togglePromiseDateEdit(this.value)">
                    <option value="0" <?= ($u['promise_enabled'] == 0) ? 'selected' : '' ?>>Disabled</option>
                    <option value="1" <?= ($u['promise_enabled'] == 1) ? 'selected' : '' ?>>Enabled</option>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small text-warning">Promise Date</label>
                <select name="promise_date" id="promise_date_edit" class="form-select border-warning" <?= ($u['promise_enabled'] == 1) ? 'required' : 'disabled' ?>>
                    <?php 
                    $selected_day = !empty($u['promise_date']) ? (int)date('d', strtotime($u['promise_date'])) : (int)date('d', strtotime('+7 days'));
                    for($d = 1; $d <= 31; $d++): 
                    ?>
                        <option value="<?= $d ?>" <?= ($selected_day == $d) ? 'selected' : '' ?>><?= $d . date('S', mktime(0,0,0,1,$d)) ?> of Month</option>
                    <?php endfor; ?>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small text-warning">Promise Due</label>
                <div class="input-group">
                    <span class="input-group-text bg-warning text-dark">৳</span>
                    <input type="text" class="form-control fw-bold text-dark border-warning" value="<?= number_format($promise_due_amount, 2) ?> (<?= $promise_days_used ?> used days)" readonly>
                </div>
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small">Router / POP</label>
                <select name="router_id" class="form-select">
                    <?php foreach($routers as $r): ?>
                        <option value="<?= $r['id'] ?>" <?= ($u['router_id']==$r['id'])?'selected':'' ?>><?= $r['name'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small">Zone</label>
                <select name="zone_id" class="form-select">
                    <option value="0">Default</option>
                    <?php foreach($zones as $z): ?>
                        <option value="<?= $z['id'] ?>" <?= ($u['zone_id']==$z['id'])?'selected':'' ?>><?= $z['name'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label fw-bold small">TJ Box / OLT Port</label>
                <select name="tj_box_name" class="form-select">
                    <option value="">None</option>
                    <?php foreach($tj_boxes as $tj): ?>
                        <option value="<?= $tj['name'] ?>" <?= ($u['tj_box_name']==$tj['name'])?'selected':'' ?>><?= $tj['name'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-3">
                 <label class="form-label fw-bold small">Conn. Type</label>
                 <select name="connection_type" class="form-select">
                     <option value="Fiber" <?= ($u['connection_type']=='Fiber')?'selected':'' ?>>Fiber</option>
                     <option value="Cat6/UTP" <?= ($u['connection_type']=='Cat6/UTP')?'selected':'' ?>>Cat6 / UTP</option>
                     <option value="Wireless" <?= ($u['connection_type']=='Wireless')?'selected':'' ?>>Wireless</option>
                 </select>
            </div>
            <div class="col-md-3">
                 <label class="form-label fw-bold small text-danger">Client Type *</label>
                 <select name="client_type" class="form-select" required>
                     <option value="Home" <?= ($u['client_type']=='Home')?'selected':'' ?>>Home</option>
                     <option value="Office" <?= ($u['client_type']=='Office')?'selected':'' ?>>Office</option>
                 </select>
            </div>
            <div class="col-md-3">
                 <label class="form-label fw-bold small text-success">SMS Notifications</label>
                 <select name="send_sms" class="form-select border-success">
                     <option value="1" <?= ($u['send_sms'] == 1) ? 'selected' : '' ?>>Enabled (Send SMS)</option>
                     <option value="0" <?= ($u['send_sms'] == 0) ? 'selected' : '' ?>>Disabled (Do Not Send SMS)</option>
                 </select>
            </div>
            <div class="col-md-3">
                 <label class="form-label fw-bold small text-success">Voice Call Notifications</label>
                 <select name="send_voice_call" class="form-select border-success">
                     <option value="1" <?= (isset($u['send_voice_call']) && $u['send_voice_call'] == 1) ? 'selected' : '' ?>>Enabled (Send Voice Call)</option>
                     <option value="0" <?= (isset($u['send_voice_call']) && $u['send_voice_call'] == 0) ? 'selected' : '' ?>>Disabled (Do Not Send Voice Call)</option>
                 </select>
            </div>

            <!-- Infrastructure & Location Section -->
            <div class="col-12 mt-5"><h6 class="text-muted border-bottom pb-2">Hardware & Location</h6></div>
            <div class="col-md-4">
                <label class="form-label fw-bold small">ONU MAC Address</label>
                <input type="text" name="onu_mac" class="form-control" value="<?= $u['onu_mac'] ?>">
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-info">Assigned IP</label>
                <input type="text" name="assigned_ip" id="assignedIpField" class="form-control border-info" value="<?= htmlspecialchars($u['assigned_ip'] ?? '') ?>" placeholder="e.g. 10.10.10.50">
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-info">IP Charge / Cost (৳)</label>
                <div class="input-group">
                    <span class="input-group-text bg-info text-white">৳</span>
                    <input type="number" name="ip_cost" id="ipCostInput" class="form-control fw-bold border-info text-info" value="<?= floatval($u['ip_cost'] ?? 0) ?>" min="0" step="0.01" placeholder="0.00">
                </div>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small">GPS Coordinates</label>
                <div class="input-group">
                    <input type="text" name="lat_long" id="latLongField" class="form-control" value="<?= $u['lat_long'] ?>">
                    <button type="button" id="fetchGpsBtn" class="btn btn-outline-primary"><i class="fas fa-crosshairs"></i></button>
                </div>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-danger">District *</label>
                <select name="district" id="districtSelect" class="form-select border-danger shadow-sm" required>
                    <option value="">-- Select District --</option>
                    <?php 
                    foreach($BD_GEO_DATA as $division => $districts) {
                        echo "<optgroup label='{$division} Division'>";
                        foreach($districts as $district => $thanas) {
                            $sel = ($u['district'] == $district) ? 'selected' : '';
                            echo "<option value='{$district}' $sel>{$district}</option>";
                        }
                        echo "</optgroup>";
                    }
                    ?>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small text-danger">Thana / Upazila *</label>
                <select name="thana" id="thanaSelect" class="form-select border-danger shadow-sm" required>
                    <option value="">-- Select Thana --</option>
                    <?php 
                    if($u['district']) {
                        foreach($BD_GEO_DATA as $division => $districts) {
                            if(isset($districts[$u['district']])) {
                                foreach($districts[$u['district']] as $thana) {
                                    $sel = ($u['thana'] == $thana) ? 'selected' : '';
                                    echo "<option value='{$thana}' $sel>{$thana}</option>";
                                }
                                break;
                            }
                        }
                    }
                    ?>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label fw-bold small">Address</label>
                <input type="text" name="addr" class="form-control" value="<?= $u['address'] ?>">
            </div>
            <div class="col-md-12">
                <label class="form-label fw-bold small">Remarks</label>
                <input type="text" name="remarks" class="form-control" value="<?= $u['remarks'] ?>">
            </div>


            <div class="col-12 mt-5">
                <button type="submit" name="edit_user_full" class="btn btn-primary btn-lg w-100 py-3 fw-bold">
                    <i class="fas fa-save me-2"></i> Save Changes & Sync to Mikrotik
                </button>
            </div>
        </form>
    </div>
</div>

<script>
    // Price Update with VAT and Discount on Package Change
    const pkgSelect = document.getElementById('pkgSelect');
    const discountInput = document.getElementById('discountAmountEdit');
    const dueInput = document.querySelector('input[name="due"]');
    
    // Prorate context
    const originalPkg = "<?= htmlspecialchars($original_pkg, ENT_QUOTES) ?>";
    const originalPrice = <?= $original_price ?>;
    const remainingDays = <?= $remaining_days ?>;
    let baseDue = <?= $original_due ?>;
    let lastExtraCharge = 0;

    const prorateHint = document.createElement('small');
    prorateHint.className = 'text-primary d-block mt-1 italic';
    prorateHint.style.fontSize = '0.75rem';
    prorateHint.style.display = 'none';
    if(dueInput) {
        const inputGroup = dueInput.closest('.input-group');
        if (inputGroup) inputGroup.parentNode.insertBefore(prorateHint, inputGroup.nextSibling);
    }

    function calculateEditBill() {
        if(!pkgSelect) return;
        const selected = pkgSelect.options[pkgSelect.selectedIndex];
        if (!selected || selected.value === "") return;

        const price = parseFloat(selected.getAttribute('data-price')) || 0;
        const vat = parseFloat(selected.getAttribute('data-vat')) || 0;
        const discount = parseFloat(discountInput.value) || 0;
        
        const ipCostInput = document.getElementById('ipCostInput');
        const assignedIpField = document.getElementById('assignedIpField');
        let ipCost = 0;
        if (assignedIpField && assignedIpField.value.trim() !== "" && ipCostInput) {
            ipCost = parseFloat(ipCostInput.value) || 0;
        }
        
        if(price > 0) {
            let total = price + (price * vat / 100);
            total = total - discount + ipCost;
            if (total < 0) total = 0;
            document.getElementById('billAmountEdit').value = total.toFixed(2);
        }
        
        // Prorated Due Calculation Logic
        if (remainingDays > 0 && dueInput) {
            let extraCharge = 0;
            if (selected.value !== originalPkg && price > originalPrice) {
                let dailyDiff = (price - originalPrice) / 30;
                extraCharge = dailyDiff * remainingDays;
            }
            
            // Track if user manually typed something
            let currentInputVal = parseFloat(dueInput.value) || 0;
            if (Math.abs(currentInputVal - (baseDue + lastExtraCharge)) > 0.01) {
                baseDue = currentInputVal - lastExtraCharge;
                if (baseDue < 0) baseDue = 0;
            }
            
            let newDue = baseDue + extraCharge;
            dueInput.value = newDue.toFixed(2);
            lastExtraCharge = extraCharge;
            
            if (extraCharge > 0) {
                prorateHint.innerHTML = `<i class="fas fa-info-circle"></i> +৳${extraCharge.toFixed(2)} prorated charge added to Due for remaining ${remainingDays} days.`;
                prorateHint.style.display = 'block';
            } else {
                prorateHint.style.display = 'none';
            }
        }
    }

    if(pkgSelect) pkgSelect.addEventListener('change', calculateEditBill);
    if(discountInput) discountInput.addEventListener('input', calculateEditBill);
    
    const ipCostInput = document.getElementById('ipCostInput');
    const assignedIpField = document.getElementById('assignedIpField');
    if(ipCostInput) ipCostInput.addEventListener('input', calculateEditBill);
    if(assignedIpField) assignedIpField.addEventListener('input', calculateEditBill);
    
    if(dueInput) {
        dueInput.addEventListener('input', function() {
            let currentInputVal = parseFloat(this.value) || 0;
            baseDue = currentInputVal - lastExtraCharge;
            if (baseDue < 0) baseDue = 0;
        });
    }

    // GPS & Geo Logic
    const geoData = <?= json_encode($BD_GEO_DATA) ?>;
    const districtSelect = document.getElementById('districtSelect');
    const thanaSelect = document.getElementById('thanaSelect');

    districtSelect.addEventListener('change', function() {
        const district = this.value;
        thanaSelect.innerHTML = '<option value="">-- Select Thana --</option>';
        if(district) {
            let foundThanas = [];
            for(let div in geoData) {
                if(geoData[div][district]) {
                    foundThanas = geoData[div][district];
                    break;
                }
            }
            foundThanas.forEach(thana => {
                let opt = document.createElement('option');
                opt.value = thana;
                opt.innerText = thana;
                thanaSelect.appendChild(opt);
            });
        }
    });

    document.addEventListener('DOMContentLoaded', function() {
        const fetchBtn = document.getElementById('fetchGpsBtn');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', function(e) {
                e.preventDefault();
                fetchGPS();
            });
        }
    });

    function fetchGPS() {
        const field = document.getElementById('latLongField');
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(function(position) {
                field.value = position.coords.latitude + ", " + position.coords.longitude;
            });
        }
    }

    function togglePromiseDateEdit(val) {
        let dateInput = document.getElementById('promise_date_edit');
        if (val == '1') {
            dateInput.disabled = false;
            dateInput.required = true;
            if(!dateInput.value) {
                let defaultDate = new Date();
                defaultDate.setDate(defaultDate.getDate() + 7);
                dateInput.value = defaultDate.getDate().toString();
            }
        } else {
            dateInput.disabled = true;
            dateInput.required = false;
        }
    }
</script>
