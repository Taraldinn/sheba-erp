<?php
// ADD CLIENT VIEW
$routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS);
$services_query = "SELECT * FROM ".TBL_SERVICES;
if (isset($_SESSION['allowed_packages']) && is_array($_SESSION['allowed_packages']) && !empty($_SESSION['allowed_packages'])) {
    $allowed_ids = implode(',', array_map('intval', $_SESSION['allowed_packages']));
    $services_query .= " WHERE id IN ($allowed_ids)";
}
$services = safeFetchAll($pdo, $services_query);
$zones = safeFetchAll($pdo, "SELECT * FROM ".TBL_ZONES." WHERE staff_id=?", [$user]);
$zones = safeFetchAll($pdo, "SELECT * FROM ".TBL_ZONES." WHERE staff_id=?", [$user]);
$tj_boxes = safeFetchAll($pdo, "SELECT * FROM ".TBL_TJ_BOXES." WHERE staff_id=?", [$user]);
require_once __DIR__ . '/../includes/geo_data.php';
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
                        <input type="text" name="name" class="form-control" placeholder="Enter Client Name" required>
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
                        <input type="text" name="user_id" class="form-control border-primary" placeholder="Set Mikrotik Username" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold text-primary">PPPoE Password</label>
                        <input type="password" name="password" class="form-control border-primary" placeholder="Set Mikrotik Password" required>
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
                            <?php foreach($services as $s): ?>
                                <option value="<?= $s['id'] ?>" data-price="<?= $s['price'] ?>"><?= $s['name'] ?> (<?= number_format($s['price'],0) ?>৳)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-md-3">
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
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Client Status</label>
                        <select name="status" class="form-select">
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                            <option value="Free">Free</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Joining Date</label>
                        <input type="date" name="date" class="form-control" value="<?= date('Y-m-d') ?>" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold text-success">SMS Notifications</label>
                        <select name="send_sms" class="form-select border-success">
                            <option value="1">Enabled (Send SMS)</option>
                            <option value="0">Disabled (Do Not Send SMS)</option>
                        </select>
                    </div>

                    <!-- Infrastructure & Location Section -->
                    <div class="col-12 mt-5"><h6 class="text-muted border-bottom pb-2">Network & Location</h6></div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Router / POP</label>
                        <select name="router" class="form-select" required>
                            <?php foreach($routers as $r): ?>
                                <option value="<?= $r['id'] ?>"><?= $r['name'] ?></option>
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
    // Auto-fill Bill Amount on Package Change
    document.getElementById('serviceSelect').addEventListener('change', function() {
        const selected = this.options[this.selectedIndex];
        const price = selected.getAttribute('data-price');
        if(price) document.getElementById('billAmount').value = price;
    });

    // GPS Fetching Logic
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
</script>
