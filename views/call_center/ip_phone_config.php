<?php
// views/call_center/ip_phone_config.php
if (!isLoggedIn()) exit;

require_once __DIR__ . '/../../classes/IPPhoneDriver.php';

if (!hasRole('Admin') && strcasecmp($_SESSION['user_role'] ?? '', 'Reseller') !== 0) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. Only Tenant Owners or Administrators can access this page.</div></div>";
    exit;
}

// Load current configuration
$owner_id = get_store_owner_id();
$config = safeFetch($pdo, "SELECT * FROM ip_phone_configs WHERE staff_id = ? LIMIT 1", [$owner_id]) ?: [
    'driver' => 'generic_rest',
    'base_url' => '',
    'username' => '',
    'password_token' => '',
    'caller_id' => '',
    'extension' => '',
    'enabled' => 1,
    'test_mode' => 0
];

if (!empty($config['password_token'])) {
    $config['password_token'] = IPPhoneDriver::decrypt($config['password_token']);
}
?>

<style>
.transition-base {
    transition: all 0.2s ease-in-out;
}
.form-switch .form-check-input:checked {
    background-color: #198754;
    border-color: #198754;
}
.btn-outline-primary {
    color: #4b3df5;
    border-color: #4b3df5;
}
.btn-outline-primary:hover {
    background-color: #4b3df5;
    color: #fff;
    border-color: #4b3df5;
}
</style>

<div class="row">
    <div class="col-lg-8">
        <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-dark text-white py-3">
                <h5 class="mb-0 fw-bold"><i class="fas fa-phone-square-alt me-2 text-success"></i> IP Phone API Gateway Setup</h5>
            </div>
            <div class="card-body p-4">
                
                <div class="alert alert-info border-start border-4 border-info shadow-sm mb-4 small">
                    <h6 class="fw-bold"><i class="fas fa-info-circle me-1"></i> Dynamic API Placeholder Routing</h6>
                    <p class="mb-1">You can include dynamic placeholders in the **API Base URL** for automatic parameter replacement during triggers:</p>
                    <ul class="mb-2">
                        <li><code>{USERNAME}</code> &rarr; API Username</li>
                        <li><code>{TOKEN}</code> &rarr; Secret Token/Password</li>
                        <li><code>{CALLER_ID}</code> &rarr; Active Caller ID Number</li>
                        <li><code>{EXTENSION}</code> &rarr; Staff Extension (e.g. 101)</li>
                        <li><code>{PHONE}</code> &rarr; Customer Mobile Number (e.g. 8801700000000)</li>
                    </ul>
                    <span class="text-secondary italic">If no placeholders are used, parameters will automatically be dispatched via standard HTTP POST fields instead.</span>
                </div>

                <form method="POST" action="controllers/call_center_controller.php">
                    <input type="hidden" name="action" value="save_api_settings">
                    
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label fw-semibold text-muted small">Driver Provider <span class="text-danger">*</span></label>
                            <select name="driver" id="driver_select" class="form-select rounded-3" required>
                                <option value="generic_rest" <?= $config['driver'] === 'generic_rest' ? 'selected' : '' ?>>Generic REST HTTP API</option>
                                <option value="flemsoft" <?= $config['driver'] === 'flemsoft' ? 'selected' : '' ?>>Flemsoft Voice API</option>
                                <option value="asterisk" <?= $config['driver'] === 'asterisk' ? 'selected' : '' ?>>Asterisk / FreePBX Manager (Future)</option>
                                <option value="goip" <?= $config['driver'] === 'goip' ? 'selected' : '' ?>>GoIP SMS/Voice Gateway (Future)</option>
                                <option value="sip" <?= $config['driver'] === 'sip' ? 'selected' : '' ?>>SIP Provider (Future)</option>
                            </select>
                        </div>
                        
                        <div class="col-md-6">
                            <label class="form-label fw-semibold text-muted small">Caller ID / Caller Number <span class="text-danger">*</span></label>
                            <input type="text" name="caller_id" class="form-control rounded-3" value="<?= htmlspecialchars($config['caller_id']) ?>" placeholder="e.g. +8809612000000" required>
                        </div>
                        
                        <div class="col-12">
                            <label class="form-label fw-semibold text-muted small">API Base URL / Endpoint URL <span class="text-danger">*</span></label>
                            <input type="url" name="base_url" class="form-control rounded-3" value="<?= htmlspecialchars($config['base_url']) ?>" placeholder="e.g. https://api.ipphone.com/dial?user={USERNAME}&pass={TOKEN}&from={CALLER_ID}&to={PHONE}&ext={EXTENSION}" required>
                        </div>
                        
                        <div class="col-md-6">
                            <label class="form-label fw-semibold text-muted small">API Username / Client ID <span class="text-danger">*</span></label>
                            <input type="text" name="username" class="form-control rounded-3" value="<?= htmlspecialchars($config['username']) ?>" placeholder="e.g. my_api_username" required>
                        </div>
                        
                        <div class="col-md-6">
                            <label class="form-label fw-semibold text-muted small">API Password / Secret Token <span class="text-danger">*</span></label>
                            <div class="input-group">
                                <input type="password" name="password_token" id="api_pass_field" class="form-control rounded-start-3" value="<?= htmlspecialchars($config['password_token']) ?>" placeholder="e.g. sk_live_secrettoken" required>
                                <button class="btn btn-outline-secondary rounded-end-3" type="button" id="toggle_pass_btn"><i id="pass_toggle_icon" class="fas fa-eye"></i></button>
                            </div>
                        </div>
                        
                        <div class="col-md-6">
                            <label class="form-label fw-semibold text-muted small">Default Staff Extension</label>
                            <input type="text" name="extension" class="form-control rounded-3" value="<?= htmlspecialchars($config['extension']) ?>" placeholder="e.g. 100">
                        </div>
                        
                        <div class="col-md-6 d-flex align-items-end">
                            <div class="w-100 p-2 bg-light border rounded-3 d-flex justify-content-around">
                                <div class="form-check form-switch mb-0">
                                    <input class="form-check-input" type="checkbox" name="enabled" id="enabledSwitch" <?= $config['enabled'] ? 'checked' : '' ?>>
                                    <label class="form-check-label fw-semibold small text-dark" for="enabledSwitch">API Enabled</label>
                                </div>
                                <div class="form-check form-switch mb-0">
                                    <input class="form-check-input" type="checkbox" name="test_mode" id="demoSwitch" <?= $config['test_mode'] ? 'checked' : '' ?>>
                                    <label class="form-check-label fw-semibold small text-danger" for="demoSwitch">Demo / Test Mode</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <hr class="bg-light my-4">
                    
                    <div class="d-flex justify-content-end">
                        <button type="submit" class="btn btn-dark rounded-pill px-5 shadow-sm fw-bold"><i class="fas fa-save me-1"></i> Save Configuration</button>
                    </div>
                </form>
                
            </div>
        </div>
    </div>
    
    <div class="col-lg-4">
        <div class="card shadow-sm border-0 mb-4 bg-light">
            <div class="card-header bg-secondary text-white py-3 border-0">
                <h6 class="mb-0 fw-bold"><i class="fas fa-vial me-2"></i> API Connection Test Console</h6>
            </div>
            <div class="card-body p-4 text-center">
                <p class="text-muted small">Type in a mobile number and extension below to perform a live dialing test bridge using your current configuration settings.</p>
                
                <div class="mb-3 text-start">
                    <label class="form-label fw-semibold text-muted small">Target Mobile Phone <span class="text-danger">*</span></label>
                    <input type="text" id="test_dial_phone" class="form-control form-control-sm rounded-3" placeholder="e.g. 01700000000" value="01712345678">
                </div>
                
                <div class="mb-3 text-start">
                    <label class="form-label fw-semibold text-muted small">Bridge Extension</label>
                    <input type="text" id="test_dial_ext" class="form-control form-control-sm rounded-3" placeholder="e.g. 101" value="101">
                </div>
                
                <button type="button" class="btn btn-outline-success w-100 rounded-pill py-2 shadow-sm fw-bold" id="execute_test_dial_btn">
                    <i class="fas fa-phone-alt me-1"></i> Trigger Test Dial Bridge
                </button>
                
                <div id="test_dial_loading" class="text-center py-4 d-none">
                    <div class="spinner-border text-success spinner-border-sm" role="status"></div>
                    <div class="text-muted mt-2 small">Triggering API test...</div>
                </div>
                
                <div id="test_dial_result" class="text-start mt-4 d-none">
                    <div class="alert p-3 rounded border small shadow-sm" id="test_alert_box">
                        <strong id="test_alert_title">Success!</strong>
                        <p id="test_alert_desc" class="mb-2 mt-1"></p>
                        <hr class="my-2">
                        <span class="text-muted d-block fw-bold text-uppercase" style="font-size:10px;">Raw Driver JSON Output:</span>
                        <pre id="test_alert_raw" class="p-2 bg-dark text-white rounded mt-1 overflow-auto" style="max-height: 150px; font-size:11px;"></pre>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function togglePassVisibility() {
    const field = document.getElementById('api_pass_field');
    const icon = document.getElementById('pass_toggle_icon');
    if (field.type === 'password') {
        field.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        field.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function executeTestDial() {
    let phone = document.getElementById('test_dial_phone').value.trim();
    let ext = document.getElementById('test_dial_ext').value.trim();
    let loading = document.getElementById('test_dial_loading');
    let result = document.getElementById('test_dial_result');
    let abox = document.getElementById('test_alert_box');
    let atitle = document.getElementById('test_alert_title');
    let adesc = document.getElementById('test_alert_desc');
    let araw = document.getElementById('test_alert_raw');
    
    if (phone === '') {
        alert("Mobile phone number is required.");
        return;
    }
    
    result.classList.add('d-none');
    loading.classList.remove('d-none');
    
    let formData = new FormData();
    formData.append('action', 'click_to_call');
    formData.append('phone', phone);
    formData.append('customer_id', '0');
    formData.append('name', 'API Test Loop');
    
    fetch('controllers/call_center_controller.php', {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(data => {
        loading.classList.add('d-none');
        result.classList.remove('d-none');
        
        araw.innerText = JSON.stringify(data, null, 2);
        
        if (data.success) {
            abox.className = "alert alert-success border-start border-4 border-success p-3 rounded small shadow-sm";
            atitle.innerText = "Connection Succeeded!";
            adesc.innerHTML = "Dial initiated to <strong>" + phone + "</strong>. Status: <strong>" + data.status + "</strong>. Bridge duration: <strong>" + data.duration + " sec</strong>.";
            
            // If it is a Direct SIP setup, dial natively via our embedded WebSIP softphone client
            if (data.is_sip_client) {
                atitle.innerText = "WebSIP Call Active!";
                adesc.innerHTML = "Dial initiated to <strong>" + phone + "</strong>. Status: <strong>" + data.status + "</strong>. Registered log ID: <strong>#" + data.log_id + "</strong>.<br><i class='fas fa-phone-volume me-1 text-success'></i> Embedded WebSIP softphone is active in browser.";
                triggerWebSIPCall(phone, 0, "API Test Loop");
            }
        } else {
            abox.className = "alert alert-danger border-start border-4 border-danger p-3 rounded small shadow-sm";
            atitle.innerText = "Bridge Failed";
            adesc.innerText = data.message;
        }
    })
    .catch(err => {
        loading.classList.add('d-none');
        result.classList.remove('d-none');
        abox.className = "alert alert-danger border-start border-4 border-danger p-3 rounded small shadow-sm";
        atitle.innerText = "Fatal Failure";
        adesc.innerText = "Network execution error contacting controller: " + err;
        araw.innerText = "CURL/Fetch aborted or parsed bad JSON response.";
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // 1. Toggle Password button
    const togglePassBtn = document.getElementById('toggle_pass_btn');
    if (togglePassBtn) {
        togglePassBtn.addEventListener('click', togglePassVisibility);
    }
    
    // 2. Execute Test Dial button
    const executeTestBtn = document.getElementById('execute_test_dial_btn');
    if (executeTestBtn) {
        executeTestBtn.addEventListener('click', executeTestDial);
    }
    
    // 3. Flemsoft UI toggles
    const driverSelect = document.getElementById('driver_select');
    const baseUrlInput = document.querySelector('input[name="base_url"]');
    const callerIdInput = document.querySelector('input[name="caller_id"]');
    const usernameInput = document.querySelector('input[name="username"]');
    const tokenInput = document.querySelector('input[name="password_token"]');
    
    if (driverSelect && baseUrlInput && callerIdInput && usernameInput && tokenInput) {
        const callerIdLabel = callerIdInput.closest('.col-md-6').querySelector('label');
        const tokenLabel = tokenInput.closest('.col-md-6').querySelector('label');
        const usernameContainer = usernameInput.closest('.col-md-6');
        const baseUrlContainer = baseUrlInput.closest('.col-12');
        
        function updateDriverUI() {
            const driver = driverSelect.value;
            if (driver === 'flemsoft') {
                callerIdLabel.innerHTML = 'Campaign Name <span class="text-danger">*</span>';
                callerIdInput.placeholder = 'e.g. v14_046b60633';
                
                tokenLabel.innerHTML = 'Flemsoft API Key <span class="text-danger">*</span>';
                tokenInput.placeholder = 'e.g. 66eecbb6bdbdaec1...';
                
                usernameContainer.classList.add('d-none');
                usernameInput.removeAttribute('required');
                
                baseUrlContainer.classList.add('d-none');
                baseUrlInput.removeAttribute('required');
                if (!baseUrlInput.value || baseUrlInput.value.indexOf('api.ipphone.com') !== -1) {
                    baseUrlInput.value = 'https://flemsoft.com/voiceapi/newrequest/';
                }
                if (!usernameInput.value || usernameInput.value === 'my_api_username') {
                    usernameInput.value = 'flemsoft';
                }
            } else {
                callerIdLabel.innerHTML = 'Caller ID / Caller Number <span class="text-danger">*</span>';
                callerIdInput.placeholder = 'e.g. +8809612000000';
                
                tokenLabel.innerHTML = 'API Password / Secret Token <span class="text-danger">*</span>';
                tokenInput.placeholder = 'e.g. sk_live_secrettoken';
                
                usernameContainer.classList.remove('d-none');
                usernameInput.setAttribute('required', 'required');
                if (usernameInput.value === 'flemsoft') {
                    usernameInput.value = '';
                }
                
                baseUrlContainer.classList.remove('d-none');
                baseUrlInput.setAttribute('required', 'required');
                if (baseUrlInput.value === 'https://flemsoft.com/voiceapi/newrequest/') {
                    baseUrlInput.value = '';
                }
            }
        }
        
        driverSelect.addEventListener('change', updateDriverUI);
        updateDriverUI();
    }
});
</script>
