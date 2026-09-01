<?php
// views/layout/web_softphone.php
if (!isLoggedIn()) return;

// Safely load IPPhoneDriver if available
if (file_exists(__DIR__ . '/../../classes/IPPhoneDriver.php')) {
    require_once __DIR__ . '/../../classes/IPPhoneDriver.php';
}

// Fetch active Main Direct SIP number details - safely
$active_sip_line = '';
$sip_pass        = '';
$sip_server      = '';
$sip_wss_uri     = '';

try {
    $tenant_id  = defined('CURRENT_TENANT') ? CURRENT_TENANT : 'main';
    $sip_record = $pdo->query("SELECT * FROM ip_phone_numbers WHERE tenant_id = '$tenant_id' AND is_main = 1 LIMIT 1")->fetch() ?: null;

    if ($sip_record) {
        $active_sip_line = $sip_record['ip_number'] ?? '';
        $sip_server      = $sip_record['sip_server'] ?? '';
        $sip_wss_uri     = $sip_record['wss_uri'] ?? '';
        $sip_pass        = (class_exists('IPPhoneDriver') && !empty($sip_record['password']))
                           ? IPPhoneDriver::decrypt($sip_record['password'])
                           : '';
    }
} catch (Exception $e) {
    // ip_phone_numbers table may not exist yet — softphone will still load in offline/manual mode
}

if (empty($active_sip_line)) {
    try {
        $active_sip_line = $pdo->query("SELECT caller_id FROM ip_phone_configs WHERE enabled = 1 LIMIT 1")->fetchColumn() ?: 'Offline';
    } catch (Exception $e) {
        $active_sip_line = 'Offline';
    }
}
?>

<!-- JsSIP WebRTC Telephony Library -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jssip/3.3.11/jssip.min.js"></script>

<!-- Hidden Audio Element for WebRTC audio playback -->
<audio id="websip-remote-audio" autoplay></audio>

<!-- Floating WebSIP Softphone Widget Launcher -->
<div id="websip-floating-launcher" onclick="toggleWebSIP()" class="shadow-lg d-flex align-items-center justify-content-center transition-base" title="Open WebSIP Softphone">
    <div class="websip-heartbeat-glow"></div>
    <i class="fas fa-phone-alt text-white fs-5"></i>
    <span id="websip-launcher-badge" class="badge bg-danger position-absolute top-0 start-100 translate-middle p-1 border border-light rounded-circle" style="width: 10px; height: 10px;" title="WebSIP Status"></span>
</div>

<div id="websip-softphone-card" class="card shadow-lg border-0 d-none transition-base glassmorphism">
    <!-- Header -->
    <div class="card-header bg-dark text-white py-3 px-4 d-flex justify-content-between align-items-center rounded-top-4 border-0">
        <div class="d-flex align-items-center">
            <div id="websip-status-dot" class="websip-status-dot me-2 bg-danger animate-pulse-glow"></div>
            <div>
                <h6 class="mb-0 fw-bold text-white small" style="letter-spacing: 0.5px;">WebSIP Phone</h6>
                <span id="websip-line-label" class="text-secondary small" style="font-size: 10px;"><i class="fas fa-link me-1"></i>Line: <?= htmlspecialchars($active_sip_line) ?></span>
            </div>
        </div>
        <div class="d-flex gap-2">
            <button onclick="toggleWebSIP()" class="btn btn-link text-white-50 p-0 shadow-none border-0 fs-5 transition-base hover-text-white"><i class="fas fa-times-circle"></i></button>
        </div>
    </div>

    <!-- Phone Display Panel -->
    <div class="websip-display p-4 text-center text-white border-0 position-relative">
        <div class="websip-display-blur"></div>
        <div class="position-relative" style="z-index: 2;">
            <!-- Call Status Message -->
            <div id="websip-status-msg" class="text-danger fw-bold text-uppercase mb-1" style="font-size: 11px; letter-spacing: 1.5px;">Connecting...</div>
            
            <!-- Number Display / Timer -->
            <div id="websip-number-display" class="fs-3 fw-bold text-white mb-2 overflow-hidden text-truncate px-2" style="font-family: 'Courier New', monospace; min-height: 40px; letter-spacing: 1px;">Ready</div>
            <div id="websip-duration-timer" class="d-none text-white-50 small mb-2"><i class="far fa-clock me-1"></i><span id="websip-timer-digits">00:00</span></div>

            <!-- Canvas Audio Visualizer -->
            <canvas id="websip-visualizer" class="w-100 rounded-3 d-none mb-1" style="height: 35px; background: rgba(0,0,0,0.2);"></canvas>
            
            <!-- Target Details -->
            <div id="websip-call-meta" class="text-secondary small d-none">Unknown Contact</div>
        </div>
    </div>

    <!-- Mode Selector Tab (SIP WebRTC vs Web Bridge Emulator) -->
    <div class="d-flex bg-dark-dim border-bottom border-light-dim py-2 px-3 justify-content-between align-items-center">
        <span class="small fw-semibold text-secondary" style="font-size:11px;">CALL MODE:</span>
        <div class="btn-group btn-group-sm" role="group">
            <input type="radio" class="btn-check" name="call_mode" id="mode_real" autocomplete="off" checked>
            <label class="btn btn-outline-info btn-xs px-2 rounded-start-pill py-0 fw-bold" style="font-size: 9px;" for="mode_real">WebRTC WSS</label>
            
            <input type="radio" class="btn-check" name="call_mode" id="mode_websip" autocomplete="off">
            <label class="btn btn-outline-success btn-xs px-2 rounded-end-pill py-0 fw-bold" style="font-size: 9px;" for="mode_websip">Web Bridge</label>
        </div>
    </div>

    <!-- Phone Keypad Page -->
    <div id="websip-keypad-page" class="card-body p-4 bg-dark-dim">
        <!-- WSS URI Configuration Alert banner if missing -->
        <?php if (empty($sip_wss_uri) && !empty($active_sip_line) && $active_sip_line !== 'Offline'): ?>
            <div class="alert alert-warning border-0 p-2 rounded-3 text-start mb-3" style="font-size: 10px; line-height: 1.3;">
                <i class="fas fa-exclamation-triangle me-1"></i><strong>WSS WebSocket URI missing!</strong> To make real WebRTC voice calls directly in the browser, please edit your IP Number settings and configure the WSS URI.
            </div>
        <?php endif; ?>

        <div class="websip-keypad-grid mb-4">
            <button onclick="pressKey('1')" class="websip-key btn btn-outline-dark">1<span class="sub-key">o_o</span></button>
            <button onclick="pressKey('2')" class="websip-key btn btn-outline-dark">2<span class="sub-key">ABC</span></button>
            <button onclick="pressKey('3')" class="websip-key btn btn-outline-dark">3<span class="sub-key">DEF</span></button>
            
            <button onclick="pressKey('4')" class="websip-key btn btn-outline-dark">4<span class="sub-key">GHI</span></button>
            <button onclick="pressKey('5')" class="websip-key btn btn-outline-dark">5<span class="sub-key">JKL</span></button>
            <button onclick="pressKey('6')" class="websip-key btn btn-outline-dark">6<span class="sub-key">MNO</span></button>
            
            <button onclick="pressKey('7')" class="websip-key btn btn-outline-dark">7<span class="sub-key">PQRS</span></button>
            <button onclick="pressKey('8')" class="websip-key btn btn-outline-dark">8<span class="sub-key">TUV</span></button>
            <button onclick="pressKey('9')" class="websip-key btn btn-outline-dark">9<span class="sub-key">WXYZ</span></button>
            
            <button onclick="pressKey('*')" class="websip-key btn btn-outline-dark">*<span class="sub-key"></span></button>
            <button onclick="pressKey('0')" class="websip-key btn btn-outline-dark">0<span class="sub-key">+</span></button>
            <button onclick="pressKey('#')" class="websip-key btn btn-outline-dark">#<span class="sub-key"></span></button>
        </div>

        <!-- Calling Control Panel -->
        <div class="d-flex justify-content-around align-items-center mb-2">
            <!-- Mute mic -->
            <button id="websip-mute-btn" onclick="toggleMute()" class="btn btn-outline-secondary rounded-circle websip-circle-btn shadow-sm" title="Mute Microphone">
                <i id="websip-mute-icon" class="fas fa-microphone"></i>
            </button>

            <!-- Call Trigger -->
            <button id="websip-call-btn" onclick="startManualCall()" class="btn btn-success rounded-circle websip-call-circle shadow" title="Dial Call">
                <i class="fas fa-phone-alt fs-4"></i>
            </button>

            <!-- Hang Up -->
            <button id="websip-hangup-btn" onclick="hangupCall()" class="btn btn-danger rounded-circle websip-call-circle shadow d-none" title="Hangup Call">
                <i class="fas fa-phone-slash fs-4"></i>
            </button>

            <!-- Backspace -->
            <button onclick="deleteLastDigit()" class="btn btn-outline-secondary rounded-circle websip-circle-btn shadow-sm" title="Backspace">
                <i class="fas fa-backspace"></i>
            </button>
        </div>

        <!-- Volume Controller -->
        <div class="d-flex align-items-center px-2 mt-3 gap-2">
            <i class="fas fa-volume-down text-secondary small"></i>
            <input type="range" class="form-range" min="0" max="100" value="70" id="websip-volume-slider" oninput="adjustVolume(this.value)">
            <i class="fas fa-volume-up text-secondary small"></i>
        </div>
    </div>
</div>

<style>
/* Embedded WebSIP Premium Glassmorphic Stylesheet */
#websip-floating-launcher {
    position: fixed;
    bottom: 25px;
    right: 25px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(135deg, #198754 0%, #157347 100%);
    cursor: pointer;
    z-index: 9998;
    box-shadow: 0 8px 30px rgba(25, 135, 84, 0.4);
    border: 2px solid rgba(255, 255, 255, 0.2);
}
#websip-floating-launcher:hover {
    transform: scale(1.1) rotate(15deg);
    box-shadow: 0 12px 35px rgba(25, 135, 84, 0.6);
}
.websip-heartbeat-glow {
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border-radius: 50%;
    background: rgba(25, 135, 84, 0.4);
    z-index: -1;
    animation: websipGlow 2s infinite;
}
@keyframes websipGlow {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(1.5); opacity: 0; }
}

#websip-softphone-card {
    position: fixed;
    bottom: 95px;
    right: 25px;
    width: 320px;
    z-index: 9999;
    border-radius: 20px;
    overflow: hidden;
    background: rgba(30, 41, 59, 0.95);
    backdrop-filter: blur(15px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
}
.bg-dark-dim {
    background-color: rgba(15, 23, 42, 0.65) !important;
}
.border-light-dim {
    border-color: rgba(255, 255, 255, 0.05) !important;
}
.text-success-light {
    color: #4ade80 !important;
}
.animate-pulse-glow {
    animation: pulseGlow 1.5s infinite;
}
@keyframes pulseGlow {
    0% { box-shadow: 0 0 0 0 rgba(25, 135, 84, 0.7); }
    70% { box-shadow: 0 0 0 8px rgba(25, 135, 84, 0); }
    100% { box-shadow: 0 0 0 0 rgba(25, 135, 84, 0); }
}

/* Glassmorphism Phone Display */
.websip-display {
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.95) 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.websip-display-blur {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at top right, rgba(13, 202, 240, 0.15), transparent 60%);
    pointer-events: none;
    z-index: 1;
}

/* Dialer Keypad Grid */
.websip-keypad-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
}
.websip-key {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.07) !important;
    color: #e2e8f0 !important;
    border-radius: 12px !important;
    padding: 10px 0 !important;
    font-size: 1.35rem !important;
    font-weight: 600 !important;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.1;
    transition: all 0.15s ease-in-out !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
}
.websip-key:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
    color: #fff !important;
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0,0,0,0.2) !important;
}
.websip-key:active {
    background: rgba(255, 255, 255, 0.15) !important;
    transform: translateY(0);
}
.websip-key .sub-key {
    font-size: 0.55rem;
    font-weight: 500;
    color: #64748b;
    margin-top: 2px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}

/* Floating Action Circle Controls */
.websip-circle-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    color: #94a3b8 !important;
    transition: all 0.2s ease;
}
.websip-circle-btn:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    color: #fff !important;
}
.websip-call-circle {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50% !important;
    border: none !important;
    transition: all 0.2s ease;
}
.websip-call-circle:hover {
    transform: scale(1.1);
}

/* Active buttons states */
.websip-circle-btn.btn-active {
    background: rgba(13, 202, 240, 0.25) !important;
    border-color: rgba(13, 202, 240, 0.4) !important;
    color: #0dcaf0 !important;
}
.transition-base {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.hover-text-white:hover {
    color: #fff !important;
}
.btn-xs {
    padding: 1px 5px;
    font-size: 0.75rem;
    line-height: 1.5;
    border-radius: 3px;
}
</style>

<!-- Audio Feedback & WebRTC Visualizer Script Engine -->
<script>
let websipAudioCtx = null;
let websipVolumeNode = null;
let websipActiveTones = [];
let websipRingOscillators = [];
let websipRingInterval = null;

// Visualizer Globals
let websipAudioStream = null;
let websipAnalyser = null;
let websipVisualizerAnimFrame = null;
let websipTimerInterval = null;
let websipCallDuration = 0;

// Mic Mute / Volume Status
let websipIsMuted = false;
let websipVolume = 0.7; // default 70%

// Call Information
let websipActiveCid = 0;
let websipActiveName = "Unknown Contact";

// JsSIP Real WebRTC Engine
let websipJsSIPUA = null;
let websipJsSIPSession = null;

// Initialize Web Audio Context
function initWebsipAudio() {
    if (!websipAudioCtx) {
        websipAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        websipVolumeNode = websipAudioCtx.createGain();
        websipVolumeNode.gain.setValueAtTime(websipVolume, websipAudioCtx.currentTime);
        websipVolumeNode.connect(websipAudioCtx.destination);
    }
}

// Generate DTMF Dual Tones Natively
function playDTMFTone(digit) {
    initWebsipAudio();
    if (websipAudioCtx.state === 'suspended') {
        websipAudioCtx.resume();
    }
    
    // Stop any existing keys tone
    stopDTMFTone();

    // Standard DTMF Frequencies (Row & Col)
    const dtmfFreqs = {
        '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
        '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
        '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
    };

    if (!dtmfFreqs[digit]) return;

    const [f1, f2] = dtmfFreqs[digit];

    // Create Row Osc
    const osc1 = websipAudioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(f1, websipAudioCtx.currentTime);

    // Create Col Osc
    const osc2 = websipAudioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(f2, websipAudioCtx.currentTime);

    // Create dedicated tone gain for clean fade
    const toneGain = websipAudioCtx.createGain();
    toneGain.gain.setValueAtTime(0.12, websipAudioCtx.currentTime); // keep it soft

    osc1.connect(toneGain);
    osc2.connect(toneGain);
    toneGain.connect(websipVolumeNode);

    osc1.start();
    osc2.start();

    websipActiveTones = [osc1, osc2, toneGain];
}

function stopDTMFTone() {
    if (websipActiveTones.length > 0) {
        const [osc1, osc2, gain] = websipActiveTones;
        // Fade out tone gently
        gain.gain.exponentialRampToValueAtTime(0.001, websipAudioCtx.currentTime + 0.1);
        setTimeout(() => {
            try {
                osc1.stop();
                osc2.stop();
            } catch(e) {}
        }, 100);
        websipActiveTones = [];
    }
}

// Dial Pad Key Press
function pressKey(digit) {
    const display = document.getElementById('websip-number-display');
    if (display.innerText === 'Ready' || display.innerText === 'Calling...' || display.innerText === 'Ringing...' || display.innerText === 'SIP Call Hooked') {
        display.innerText = '';
    }
    
    // Play DTMF feedback
    playDTMFTone(digit);
    setTimeout(stopDTMFTone, 150);

    display.innerText += digit;
}

function deleteLastDigit() {
    const display = document.getElementById('websip-number-display');
    if (display.innerText !== 'Ready' && display.innerText.length > 0) {
        display.innerText = display.innerText.slice(0, -1);
        if (display.innerText === '') {
            display.innerText = 'Ready';
        }
    }
}

// Toggle Mute mic
function toggleMute() {
    websipIsMuted = !websipIsMuted;
    const btn = document.getElementById('websip-mute-btn');
    const icon = document.getElementById('websip-mute-icon');
    
    if (websipIsMuted) {
        btn.classList.add('btn-active');
        icon.className = 'fas fa-microphone-slash text-danger';
        // Mute mic track if streaming
        if (websipAudioStream) {
            websipAudioStream.getAudioTracks().forEach(track => track.enabled = false);
        }
        if (websipJsSIPSession) {
            websipJsSIPSession.mute();
        }
    } else {
        btn.classList.remove('btn-active');
        icon.className = 'fas fa-microphone';
        if (websipAudioStream) {
            websipAudioStream.getAudioTracks().forEach(track => track.enabled = true);
        }
        if (websipJsSIPSession) {
            websipJsSIPSession.unmute();
        }
    }
}

// Adjust Volume slider
function adjustVolume(val) {
    websipVolume = parseFloat(val) / 100;
    if (websipVolumeNode) {
        websipVolumeNode.gain.setValueAtTime(websipVolume, websipAudioCtx.currentTime);
    }
}

// Floating widget launcher toggle
function toggleWebSIP() {
    const card = document.getElementById('websip-softphone-card');
    card.classList.toggle('d-none');
}

// Native Tones Synthesizer for "Calling" progress (beep beep)
function startCallingTone() {
    try { initWebsipAudio(); } catch(e) {}
    stopCallingTone();
    if (!websipAudioCtx || !websipVolumeNode) return; // skip if audio not available

    const playBeep = () => {
        if (!websipRingOscillators || !websipAudioCtx) return;
        try {
            const osc = websipAudioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(425, websipAudioCtx.currentTime);

            const gain = websipAudioCtx.createGain();
            gain.gain.setValueAtTime(0.08, websipAudioCtx.currentTime);
            
            osc.connect(gain);
            gain.connect(websipVolumeNode);
            
            osc.start();
            gain.gain.setValueAtTime(0.08, websipAudioCtx.currentTime + 0.6);
            gain.gain.exponentialRampToValueAtTime(0.0001, websipAudioCtx.currentTime + 0.8);
            
            setTimeout(() => { try { osc.stop(); } catch(e) {} }, 900);
            websipRingOscillators.push(osc);
        } catch(e) { console.warn('Tone error:', e); }
    };

    playBeep();
    websipRingInterval = setInterval(playBeep, 2000);
}

function stopCallingTone() {
    if (websipRingInterval) {
        clearInterval(websipRingInterval);
        websipRingInterval = null;
    }
    if (websipRingOscillators.length > 0) {
        websipRingOscillators.forEach(osc => {
            try { osc.stop(); } catch(e) {}
        });
        websipRingOscillators = [];
    }
}

// Synthesize soft dismiss hangup chime
function playHangupChime() {
    try {
        initWebsipAudio();
        if (!websipAudioCtx || !websipVolumeNode) return;
        const osc = websipAudioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, websipAudioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, websipAudioCtx.currentTime + 0.35);

        const gain = websipAudioCtx.createGain();
        gain.gain.setValueAtTime(0.12, websipAudioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, websipAudioCtx.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(websipVolumeNode);
        osc.start();
        setTimeout(() => { try { osc.stop(); } catch(e) {} }, 500);
    } catch(e) { console.warn('Hangup chime error:', e); }
}

// Initialize Web Audio Context
function initWebsipAudio() {
    try {
        if (!websipAudioCtx) {
            websipAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            websipVolumeNode = websipAudioCtx.createGain();
            websipVolumeNode.gain.setValueAtTime(websipVolume, websipAudioCtx.currentTime);
            websipVolumeNode.connect(websipAudioCtx.destination);
        }
        if (websipAudioCtx.state === 'suspended') {
            websipAudioCtx.resume().catch(function() {});
        }
    } catch(e) {
        console.warn('WebSIP AudioContext init warning (non-critical):', e);
    }
}

// Start manual call from softphone keypad
function startManualCall() {
    const number = document.getElementById('websip-number-display');
    if (!number || number.innerText.trim() === 'Ready' || number.innerText.trim() === '') {
        alert("Please enter a phone number to dial.");
        return;
    }
    triggerWebSIPCall(number.innerText.trim(), 0, "Manual Dialer Call");
}

// Trigger embedded calling (Auto-invoked by clicking click-to-call links)
function triggerWebSIPCall(phone, customer_id, customer_name) {
    if (!phone || phone === 'Ready' || phone === '') {
        console.warn('WebSIP: No phone number to call');
        return;
    }

    try { initWebsipAudio(); } catch(e) {}
    
    // Ensure WebSIP is open and expanded
    document.getElementById('websip-softphone-card').classList.remove('d-none');

    // Update screen display elements
    const numDisplay = document.getElementById('websip-number-display');
    const statusMsg = document.getElementById('websip-status-msg');
    const metaDisplay = document.getElementById('websip-call-meta');
    const durationTimer = document.getElementById('websip-duration-timer');
    const timerDigits = document.getElementById('websip-timer-digits');
    
    const callBtn = document.getElementById('websip-call-btn');
    const hangBtn = document.getElementById('websip-hangup-btn');

    websipActiveCid = customer_id;
    websipActiveName = customer_name;

    numDisplay.innerText = phone;
    statusMsg.innerText = "CALLING...";
    statusMsg.className = "text-warning fw-bold text-uppercase mb-1";
    metaDisplay.innerText = customer_name;
    metaDisplay.classList.remove('d-none');
    
    // UI Action Button swap
    callBtn.classList.add('d-none');
    hangBtn.classList.remove('d-none');

    // Play ringing feedback audio
    startCallingTone();

    // Check calling mode
    const callModeReal = document.getElementById('mode_real').checked;

    if (callModeReal && websipJsSIPUA && websipJsSIPUA.isRegistered()) {
        // Real WebRTC VoIP Voice call directly via WSS Server in Browser!
        const eventHandlers = {
            'progress': function(e) {
                console.log('WebRTC Call Progress/Ringing...');
                statusMsg.innerText = "RINGING...";
                statusMsg.className = "text-warning fw-bold text-uppercase mb-1";
            },
            'failed': function(e) {
                console.warn('WebRTC Call Failed: ', e.cause);
                stopCallingTone();
                playHangupChime();
                statusMsg.innerText = "CALL FAILED: " + e.cause;
                statusMsg.className = "text-danger fw-bold text-uppercase mb-1";
                setTimeout(resetWebsipUI, 3000);
            },
            'ended': function(e) {
                console.log('WebRTC Call Ended');
                hangupCall();
            },
            'confirmed': function(e) {
                console.log('WebRTC Call Connected/Confirmed!');
                stopCallingTone();

                // Shift status to Active call
                statusMsg.innerText = "ACTIVE CALL";
                statusMsg.className = "text-success-light fw-bold text-uppercase mb-1";
                
                // Start call duration timer
                websipCallDuration = 0;
                durationTimer.classList.remove('d-none');
                if (websipTimerInterval) clearInterval(websipTimerInterval);
                
                websipTimerInterval = setInterval(() => {
                    websipCallDuration++;
                    let min = Math.floor(websipCallDuration / 60).toString().padStart(2, '0');
                    let sec = (websipCallDuration % 60).toString().padStart(2, '0');
                    timerDigits.innerText = min + ":" + sec;
                }, 1000);

                // Activate real-time WebRTC audio microphone visualizer!
                startWebRTCVisualizer();
            }
        };

        const options = {
            'eventHandlers': eventHandlers,
            'mediaConstraints': { 'audio': true, 'video': false }
        };

        try {
            const dest = 'sip:' + phone + '@' + "<?= htmlspecialchars($sip_server) ?>";
            websipJsSIPSession = websipJsSIPUA.call(dest, options);
        } catch (e) {
            console.error("WebRTC call creation error: ", e);
            stopCallingTone();
            playHangupChime();
            statusMsg.innerText = "CALL INVITE ERROR";
            setTimeout(resetWebsipUI, 3000);
        }

        // Parallel trigger database logging so records are generated instantly in DB
        let formData = new FormData();
        formData.append('action', 'click_to_call');
        formData.append('phone', phone);
        formData.append('customer_id', customer_id);
        formData.append('name', customer_name);
        fetch('controllers/call_center_controller.php', { method: 'POST', body: formData });

    } else {
        // === Web Bridge / WebSIP Mode ===
        // Immediately activate the call UI (optimistic UX — don't wait for server)
        stopCallingTone();

        // Shift status to Active call right away
        statusMsg.innerText = "ACTIVE CALL";
        statusMsg.className = "text-success-light fw-bold text-uppercase mb-1";
        
        // Start call duration timer immediately
        websipCallDuration = 0;
        durationTimer.classList.remove('d-none');
        if (websipTimerInterval) clearInterval(websipTimerInterval);
        
        websipTimerInterval = setInterval(() => {
            websipCallDuration++;
            let min = Math.floor(websipCallDuration / 60).toString().padStart(2, '0');
            let sec = (websipCallDuration % 60).toString().padStart(2, '0');
            timerDigits.innerText = min + ":" + sec;
        }, 1000);

        // Activate real-time microphone visualizer!
        startWebRTCVisualizer();

        // Fire & forget: Log call to DB in the background
        let logData = new FormData();
        logData.append('action', 'click_to_call');
        logData.append('phone', phone);
        logData.append('customer_id', customer_id);
        logData.append('name', customer_name);
        fetch('controllers/call_center_controller.php', { method: 'POST', body: logData })
            .then(r => r.json())
            .then(data => {
                console.log('WebSIP DB Log:', data.success ? 'Logged successfully' : data.message);
            })
            .catch(err => console.warn('WebSIP DB log warning (non-critical):', err));
    }
}

// Clean up state and hangup WebSIP softphone
function hangupCall() {
    stopCallingTone();
    playHangupChime();
    
    // Stop WebRTC stream
    stopWebRTCVisualizer();

    // Terminate real WebRTC session
    if (websipJsSIPSession) {
        try {
            websipJsSIPSession.terminate();
        } catch(e) {}
        websipJsSIPSession = null;
    }

    const statusMsg = document.getElementById('websip-status-msg');
    statusMsg.innerText = "CALL HUNG UP";
    statusMsg.className = "text-danger fw-bold text-uppercase mb-1";

    if (websipTimerInterval) {
        clearInterval(websipTimerInterval);
        websipTimerInterval = null;
    }

    setTimeout(resetWebsipUI, 1200);
}

function resetWebsipUI() {
    const numDisplay = document.getElementById('websip-number-display');
    const statusMsg = document.getElementById('websip-status-msg');
    const metaDisplay = document.getElementById('websip-call-meta');
    const durationTimer = document.getElementById('websip-duration-timer');
    const visualizer = document.getElementById('websip-visualizer');
    
    const callBtn = document.getElementById('websip-call-btn');
    const hangBtn = document.getElementById('websip-hangup-btn');

    numDisplay.innerText = "Ready";
    
    // Reset to showing current JsSIP Registration status
    if (websipJsSIPUA && websipJsSIPUA.isRegistered()) {
        statusMsg.innerText = "Online / Registered";
        statusMsg.className = "text-success fw-bold text-uppercase mb-1";
    } else {
        statusMsg.innerText = "Ready to Dial";
        statusMsg.className = "text-success-light fw-bold text-uppercase mb-1";
    }
    
    metaDisplay.classList.add('d-none');
    durationTimer.classList.add('d-none');
    visualizer.classList.add('d-none');

    callBtn.classList.remove('d-none');
    hangBtn.classList.add('d-none');
}

// WebRTC browser microphone visualization engine
function startWebRTCVisualizer() {
    const canvas = document.getElementById('websip-visualizer');
    canvas.classList.remove('d-none');

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
        websipAudioStream = stream;
        
        // Setup analyser
        const source = websipAudioCtx.createMediaStreamSource(stream);
        websipAnalyser = websipAudioCtx.createAnalyser();
        websipAnalyser.fftSize = 256;
        source.connect(websipAnalyser);

        // Keep muted if mute was clicked before call connected
        if (websipIsMuted) {
            websipAudioStream.getAudioTracks().forEach(track => track.enabled = false);
        }

        // Draw Canvas Waves
        const canvasCtx = canvas.getContext('2d');
        const bufferLength = websipAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function drawWaves() {
            if (!websipAudioStream) return;
            websipVisualizerAnimFrame = requestAnimationFrame(drawWaves);

            websipAnalyser.getByteTimeDomainData(dataArray);

            canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.4)';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = '#4ade80'; // dynamic fluorescent light green wave
            canvasCtx.beginPath();

            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * canvas.height / 2;

                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();
        }

        drawWaves();
    })
    .catch(err => {
        console.warn("Microphone not approved or unsupported: ", err);
        // Draw simulated heartbeat pulse instead of raw microphone input
        const canvasCtx = canvas.getContext('2d');
        let t = 0;
        
        function drawSimulatedWave() {
            if (websipTimerInterval === null) return; // call stopped
            websipVisualizerAnimFrame = requestAnimationFrame(drawSimulatedWave);

            canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.4)';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            canvasCtx.lineWidth = 1.5;
            canvasCtx.strokeStyle = '#0dcaf0'; // cyan for virtual simulated stream
            canvasCtx.beginPath();

            for (let x = 0; x < canvas.width; x++) {
                const y = (canvas.height / 2) + Math.sin((x / 10) + t) * 6 * Math.sin(t * 0.5);
                if (x === 0) canvasCtx.moveTo(x, y);
                else canvasCtx.lineTo(x, y);
            }
            t += 0.15;
            canvasCtx.stroke();
        }
        drawSimulatedWave();
    });
}

function stopWebRTCVisualizer() {
    if (websipAudioStream) {
        websipAudioStream.getTracks().forEach(track => track.stop());
        websipAudioStream = null;
    }
    if (websipVisualizerAnimFrame) {
        cancelAnimationFrame(websipVisualizerAnimFrame);
        websipVisualizerAnimFrame = null;
    }
    websipAnalyser = null;
}

// Update header UI with JsSIP status
function updateWebsipRegStatus(registered, msg) {
    const statusDot = document.getElementById('websip-status-dot');
    const statusMsg = document.getElementById('websip-status-msg');
    const launcherBadge = document.getElementById('websip-launcher-badge');
    const lineLabel = document.getElementById('websip-line-label');

    if (registered) {
        statusDot.className = "websip-status-dot me-2 bg-success animate-pulse-glow";
        statusMsg.innerText = "Online / Registered";
        statusMsg.className = "text-success fw-bold text-uppercase mb-1";
        launcherBadge.className = "badge bg-success position-absolute top-0 start-100 translate-middle p-1 border border-light rounded-circle";
        lineLabel.innerHTML = '<i class="fas fa-link me-1"></i>Line: <?= htmlspecialchars($active_sip_line) ?> (' + msg + ')';
    } else {
        statusDot.className = "websip-status-dot me-2 bg-danger animate-pulse-glow";
        statusMsg.innerText = msg;
        statusMsg.className = "text-danger fw-bold text-uppercase mb-1";
        launcherBadge.className = "badge bg-danger position-absolute top-0 start-100 translate-middle p-1 border border-light rounded-circle";
        lineLabel.innerHTML = '<i class="fas fa-unlink me-1"></i>Line: <?= htmlspecialchars($active_sip_line) ?> (' + msg + ')';
    }
}

// JsSIP Autoregistration trigger on load
document.addEventListener("DOMContentLoaded", function() {
    const wssUri = "<?= htmlspecialchars($sip_wss_uri) ?>";
    const ipNum = "<?= htmlspecialchars($active_sip_line) ?>";
    const password = "<?= htmlspecialchars($sip_pass) ?>";
    const sipServer = "<?= htmlspecialchars($sip_server) ?>";

    if (wssUri && ipNum && password && sipServer) {
        document.getElementById('websip-status-msg').innerText = "REGISTERING...";
        document.getElementById('websip-status-msg').className = "text-warning fw-bold text-uppercase mb-1";
        
        // Wait 1.5s to allow other libraries and audio elements to settle
        setTimeout(initJsSIP, 1500);
    } else {
        document.getElementById('websip-status-msg').innerText = "Ready to Dial";
        document.getElementById('websip-status-msg').className = "text-success-light fw-bold text-uppercase mb-1";
    }
});
</script>
