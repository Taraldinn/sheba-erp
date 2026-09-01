<?php
// ADD CLIENT VIEW
$routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS);
$services_query = "SELECT * FROM ".TBL_SERVICES;
if (isset($_SESSION['allowed_packages']) && is_array($_SESSION['allowed_packages']) && !empty($_SESSION['allowed_packages'])) {
    $allowed_ids = implode(',', array_map('intval', $_SESSION['allowed_packages']));
    $services_query .= " WHERE id IN ($allowed_ids)";
}
$services = safeFetchAll($pdo, $services_query);
$owner_id = (isOffice() && isset($_SESSION['parent_id']) && $_SESSION['parent_id'] > 0) ? $_SESSION['parent_id'] : $user;
$zones = safeFetchAll($pdo, "SELECT * FROM ".TBL_ZONES." WHERE staff_id=? ORDER BY id DESC", [$owner_id]);
$tj_boxes = safeFetchAll($pdo, "SELECT * FROM ".TBL_TJ_BOXES." WHERE staff_id=? ORDER BY id DESC", [$owner_id]);
require_once __DIR__ . '/../../includes/geo_data.php';
?>

<div class="row justify-content-center">
    <div class="col-md-11">
        <div class="card shadow">
            <div class="card-header bg-success text-white py-3">
                <h5 class="mb-0"><i class="fas fa-user-plus me-2"></i> Add New Client / Broadband User</h5>
            </div>
            <div class="card-body p-4">
                <form method="POST" enctype="multipart/form-data" class="row g-4">
                    <!-- Identity Section -->
                    <div class="col-12"><h6 class="text-muted border-bottom pb-2">Client Identity</h6></div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold text-danger">Full Name *</label>
                        <input type="text" name="name" class="form-control" placeholder="Enter Client Name" value="<?= htmlspecialchars($_GET['prefill_name'] ?? $_GET['prefill_user'] ?? '') ?>" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold text-danger">Primary Phone No *</label>
                        <input type="text" name="phone" class="form-control" placeholder="e.g. 01711000000" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Alternate Phone</label>
                        <input type="text" name="phone2" class="form-control" placeholder="Optional Number">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold text-danger">National ID (NID) *</label>
                        <input type="text" name="nid" class="form-control" placeholder="NID Number" required>
                    </div>
                    <div class="col-md-8">
                        <label class="form-label fw-bold text-primary">PPPoE ID / Username</label>
                        <div class="input-group">
                            <input type="text" name="user_id" id="usernameInput" class="form-control border-primary" placeholder="Set Mikrotik Username" value="<?= htmlspecialchars($_GET['prefill_user'] ?? '') ?>" required autocomplete="off">
                            <span class="input-group-text d-none" id="usernameWarning" style="cursor:help;" title="Username already exists!">
                                <i class="fas fa-exclamation-triangle text-danger"></i>
                            </span>
                        </div>
                        <div id="usernameStatus" class="form-text text-danger d-none">This username is already taken.</div>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold text-primary">PPPoE Password</label>
                        <input type="password" name="password" class="form-control border-primary" placeholder="Set Mikrotik Password" value="<?= htmlspecialchars($_GET['prefill_pass'] ?? '') ?>" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Client Code / Custom ID (Optional)</label>
                        <input type="text" name="client_code" class="form-control" placeholder="Custom ID or Code">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Profile Picture</label>
                        <input type="file" name="profile_pic" class="form-control" accept="image/*">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Address</label>
                        <input type="text" name="address" class="form-control" placeholder="House, Street, Area info">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold text-danger">District *</label>
                        <select name="district" id="districtSelect" class="form-select border-danger shadow-sm" required>
                            <option value="">-- Select District --</option>
                            <?php 
                            foreach($BD_GEO_DATA as $division => $districts) {
                                echo "<optgroup label='{$division} Division'>";
                                foreach($districts as $district => $thanas) {
                                    echo "<option value='{$district}'>{$district}</option>";
                                }
                                echo "</optgroup>";
                            }
                            ?>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold text-danger">Thana / Upazila *</label>
                        <select name="thana" id="thanaSelect" class="form-select border-danger shadow-sm" required disabled>
                            <option value="">-- Select Thana --</option>
                        </select>
                    </div>

                    <!-- Package & Billing Section -->
                    <div class="col-12 mt-5"><h6 class="text-muted border-bottom pb-2">Package & Billing Setup</h6></div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold text-success">Select Package</label>
                        <select name="service_id" class="form-select border-success" id="serviceSelect" required>
                            <option value="">-- Choose Package --</option>
                            <?php foreach($services as $s): 
                                $sellPrice = getSellPrice($pdo, $user, $s['id']);
                                $selected = '';
                                if (isset($_GET['prefill_profile'])) {
                                    $p_prof = strtolower(trim($_GET['prefill_profile']));
                                    if (strtolower(trim($s['name'])) === $p_prof || strtolower(trim($s['mikrotik_profile_name'] ?? '')) === $p_prof) {
                                        $selected = 'selected';
                                    }
                                }
                            ?>
                                <option value="<?= $s['id'] ?>" data-price="<?= $sellPrice ?>" data-vat="<?= $s['vat_percent'] ?? 0 ?>" <?= $selected ?>><?= $s['name'] ?> (<?= number_format($sellPrice,0) ?>৳)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold text-success">Discount (৳)</label>
                        <input type="number" name="discount" id="discountAmount" class="form-control border-success" placeholder="0" value="0" min="0" step="0.01">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold text-success">Bill Amount</label>
                        <div class="input-group">
                            <span class="input-group-text bg-success text-white">৳</span>
                            <input type="number" name="bill" id="billAmount" class="form-control border-success" placeholder="0.00" required>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Billing Position / Status</label>
                        <select name="bill_position" class="form-select">
                            <option value="Active">Active (Billable)</option>
                            <option value="Inactive">Inactive (Hold)</option>
                            <option value="Free">Free (No Billing)</option>
                            <option value="Expire">Expire</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Client Status</label>
                        <select name="status" class="form-select">
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                            <option value="Free">Free</option>
                            <option value="Expire">Expire</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Joining Date</label>
                        <input type="date" name="date" class="form-control" value="<?= date('Y-m-d') ?>" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold text-primary">Billing Cycle Day</label>
                        <select name="billing_cycle" class="form-select border-primary shadow-sm">
                            <option value="standard">Standard 30 Days</option>
                            <?php for($d = 1; $d <= 31; $d++): ?>
                                <option value="<?= $d ?>"><?= $d . date('S', mktime(0,0,0,1,$d)) ?> of Month</option>
                            <?php endfor; ?>
                        </select>
                        <small class="text-muted">Calculates pro-rata credit till this day.</small>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold text-success">SMS Notifications</label>
                        <select name="send_sms" class="form-select border-success">
                            <option value="1">Enabled (Send SMS)</option>
                            <option value="0">Disabled (Do Not Send SMS)</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold text-success">Voice Call Notifications</label>
                        <select name="send_voice_call" class="form-select border-success">
                            <option value="1">Enabled (Send Voice Call)</option>
                            <option value="0">Disabled (Do Not Send Voice Call)</option>
                        </select>
                    </div>

                    <!-- Infrastructure & Location Section -->
                    <div class="col-12 mt-5"><h6 class="text-muted border-bottom pb-2">Network & Location</h6></div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Router / POP</label>
                        <select name="router" class="form-select" required>
                            <?php foreach($routers as $r): ?>
                                <option value="<?= $r['id'] ?>" <?= (isset($_GET['router_id']) && (int)$_GET['router_id'] === (int)$r['id']) ? 'selected' : '' ?>><?= $r['name'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Zone Configuration</label>
                        <select name="zone_id" class="form-select">
                            <option value="0">Default / No Zone</option>
                            <?php foreach($zones as $z): ?>
                                <option value="<?= $z['id'] ?>"><?= $z['name'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">TJ Box / Port</label>
                        <select name="tj_box_name" class="form-select">
                            <option value="">None</option>
                            <?php foreach($tj_boxes as $tj): ?>
                                <option value="<?= $tj['name'] ?>"><?= $tj['name'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-md-3">
                         <label class="form-label fw-bold">Connection Type</label>
                         <select name="connection_type" class="form-select">
                             <option value="Fiber">Fiber (FTTH)</option>
                             <option value="Cat6/UTP">Cat6 / UTP</option>
                             <option value="Wireless">Wireless</option>
                         </select>
                    </div>
                    <div class="col-md-3">
                         <label class="form-label fw-bold text-danger">Client Type *</label>
                         <select name="client_type" class="form-select" required>
                             <option value="Home">Home</option>
                             <option value="Office">Office</option>
                         </select>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">ONU MAC Address</label>
                        <input type="text" name="onu_mac" class="form-control" placeholder="e.g. AA:BB:CC:11:22:33">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">GPS Coordinates (Lat, Long)</label>
                        <div class="input-group">
                            <input type="text" name="lat_long" id="latLongField" class="form-control" placeholder="Fetching...">
                            <button type="button" id="fetchGpsBtn" class="btn btn-outline-primary" title="Get Current Location">
                                <i class="fas fa-map-marker-alt"></i>
                            </button>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Remarks</label>
                        <input type="text" name="remarks" class="form-control" placeholder="Any notes...">
                    </div>

                    <div class="col-12 mt-5">
                        <button type="submit" name="add_client" class="btn btn-success btn-lg w-100 py-3 fw-bold">
                            <i class="fas fa-save me-2"></i> Register New Client & Save Profile
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script>
    // Auto-fill Bill Amount on Package Change or Discount Change (With VAT)
    function calculateBill() {
        const selected = document.getElementById('serviceSelect').options[document.getElementById('serviceSelect').selectedIndex];
        if (!selected || selected.value === "") return;

        const price = parseFloat(selected.getAttribute('data-price')) || 0;
        const vat = parseFloat(selected.getAttribute('data-vat')) || 0;
        const discount = parseFloat(document.getElementById('discountAmount').value) || 0;
        
        if(price > 0) {
            let total = price + (price * vat / 100);
            total = total - discount;
            if (total < 0) total = 0;
            document.getElementById('billAmount').value = total.toFixed(2);
        }
    }

    document.getElementById('serviceSelect').addEventListener('change', calculateBill);
    document.getElementById('discountAmount').addEventListener('input', calculateBill);

    // GPS Fetching Logic
    document.addEventListener('DOMContentLoaded', function() {
        calculateBill();
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
        field.placeholder = "Locating...";
        
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(function(position) {
                field.value = position.coords.latitude + ", " + position.coords.longitude;
            }, function(error) {
                alert("GPS Error: " + error.message);
                field.placeholder = "Error fetching";
            });
        } else {
            alert("Geolocation is not supported by your browser.");
        }
    }

    // District & Thana Logic
    const geoData = <?= json_encode($BD_GEO_DATA) ?>;
    const districtSelect = document.getElementById('districtSelect');
    const thanaSelect = document.getElementById('thanaSelect');

    districtSelect.addEventListener('change', function() {
        const district = this.value;
        thanaSelect.innerHTML = '<option value="">-- Select Thana --</option>';
        
        if(district) {
            thanaSelect.disabled = false;
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
        } else {
            thanaSelect.disabled = true;
        }
    });

    // PPPoE Username Availability Check
    const usernameInput = document.getElementById('usernameInput');
    const usernameWarning = document.getElementById('usernameWarning');
    const usernameStatus = document.getElementById('usernameStatus');
    let debounceTimer;

    usernameInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        const val = this.value.trim();
        
        if (val.length < 3) {
            usernameWarning.classList.add('d-none');
            usernameStatus.classList.add('d-none');
            return;
        }

        debounceTimer = setTimeout(() => {
            fetch(`?ajax_check_user=1&user_id=${encodeURIComponent(val)}`)
                .then(response => response.json())
                .then(data => {
                    if (data.exists) {
                        usernameWarning.classList.remove('d-none');
                        usernameStatus.classList.remove('d-none');
                    } else {
                        usernameWarning.classList.add('d-none');
                        usernameStatus.classList.add('d-none');
                    }
                });
        }, 500);
    });
</script>
