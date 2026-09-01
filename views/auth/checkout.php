<?php
// views/auth/checkout.php
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/functions.php';

if (!isset($_GET['token'])) {
    die("Invalid checkout token.");
}

$token = trim($_GET['token']);
$stmt = $pdo->prepare("SELECT pi.*, g.gateway_name, g.merchant_number, g.account_type, g.instruction_type 
                       FROM payment_intents pi 
                       JOIN tenant_payment_gateways g ON pi.gateway_id = g.id 
                       WHERE pi.public_token = ?");
$stmt->execute([$token]);
$intent = $stmt->fetch();

if (!$intent) {
    die("Checkout session not found or expired.");
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['payer_mobile'])) {
    $payer_mobile = preg_replace('/[^0-9]/', '', $_POST['payer_mobile']);
    if (strlen($payer_mobile) >= 11) {
        $stmt = $pdo->prepare("UPDATE payment_intents SET payer_mobile = ?, status = 'waiting' WHERE id = ? AND status = 'created'");
        $stmt->execute([$payer_mobile, $intent['id']]);
        header("Location: checkout.php?token=" . urlencode($token));
        exit;
    } else {
        $error = "Please enter a valid 11-digit mobile number.";
    }
}

// Ensure Sheba-Fi/tenant branding
$company_name = get_opt($pdo, 'company_name', 'ISP Sheba');
$logo = get_opt($pdo, 'logo_url');

// Determine branding colors for gateways
$gw_colors = [
    'bKash' => '#e2136e',
    'Nagad' => '#f37021',
    'Upay' => '#005baa',
    'Rocket' => '#8c1515'
];
$gw_color = $gw_colors[$intent['gateway_name']] ?? '#0d6efd';

// Handle Expiry
$expires_at = strtotime($intent['expires_at']);
$now = time();
$remaining = max(0, $expires_at - $now);

if ($intent['status'] === 'failed' || $intent['status'] === 'expired' || ($remaining === 0 && $intent['status'] !== 'paid')) {
    $status_msg = "This checkout session has expired or failed.";
    $is_active = false;
    if ($intent['status'] === 'waiting' || $intent['status'] === 'created') {
        $pdo->prepare("UPDATE payment_intents SET status = 'expired' WHERE id = ?")->execute([$intent['id']]);
    }
} else if ($intent['status'] === 'paid') {
    $status_msg = "Payment successful!";
    $is_active = false;
} else {
    $is_active = true;
}

// Function to render gateway icons
function renderGatewayIcons($gateway_name, $instruction_type) {
    $gw = strtolower($gateway_name);
    $icons = [];
    
    if ($gw == 'nagad') {
        $icons = [
            ['name' => 'Send Money', 'icon' => 'fas fa-paper-plane'],
            ['name' => 'Cash Out', 'icon' => 'fas fa-money-bill-wave'],
            ['name' => 'Mobile Recharge', 'icon' => 'fas fa-mobile-alt'],
            ['name' => 'Add Money', 'icon' => 'fas fa-plus-circle']
        ];
    } elseif ($gw == 'bkash') {
        $icons = [
            ['name' => 'Send Money', 'icon' => 'fas fa-paper-plane'],
            ['name' => 'Mobile Recharge', 'icon' => 'fas fa-mobile-alt'],
            ['name' => 'Cash Out', 'icon' => 'fas fa-money-bill-wave'],
            ['name' => 'Make Payment', 'icon' => 'fas fa-shopping-bag']
        ];
    } elseif ($gw == 'upay') {
        $icons = [
            ['name' => 'Send Money', 'icon' => 'fas fa-paper-plane'],
            ['name' => 'Mobile Recharge', 'icon' => 'fas fa-mobile-alt'],
            ['name' => 'Cash Out', 'icon' => 'fas fa-money-bill-wave'],
            ['name' => 'Make Payment', 'icon' => 'fas fa-qrcode']
        ];
    } else {
        $icons = [
            ['name' => 'Send Money', 'icon' => 'fas fa-paper-plane'],
            ['name' => 'Make Payment', 'icon' => 'fas fa-shopping-bag'],
            ['name' => 'Cash Out', 'icon' => 'fas fa-money-bill-wave'],
            ['name' => 'Payment', 'icon' => 'fas fa-credit-card']
        ];
    }

    $html = '<div class="d-flex justify-content-center flex-wrap mt-3 mb-4 gateway-icons-container ' . $gw . '">';
    foreach ($icons as $item) {
        // Handle "Marchant Pay" variation
        $is_match = (strtolower($item['name']) == strtolower($instruction_type)) || 
                    (strtolower($item['name']) == 'make payment' && strtolower($instruction_type) == 'merchant pay') ||
                    (strtolower($item['name']) == 'make payment' && strtolower($instruction_type) == 'marchant pay') ||
                    (strtolower($item['name']) == 'make payment' && strtolower($instruction_type) == 'payment');
        
        $activeClass = $is_match ? 'active-icon' : '';
        $checkMark = $is_match ? '<div class="checkmark-circle"><i class="fas fa-check"></i></div>' : '';
        
        $html .= '<div class="icon-item text-center mx-2 position-relative">';
        $html .= $checkMark;
        $html .= '<div class="icon-box ' . $activeClass . '">';
        $html .= '<i class="' . $item['icon'] . '"></i>';
        $html .= '</div>';
        $html .= '<div class="icon-text mt-1 text-muted" style="font-size: 0.7rem;">' . htmlspecialchars($item['name']) . '</div>';
        $html .= '</div>';
    }
    $html .= '</div>';
    
    return $html;
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Automated Payment - <?= htmlspecialchars($company_name) ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
        body { background-color: #f4f6f9; font-family: 'Poppins', sans-serif; color: #444; }
        .checkout-card { max-width: 500px; margin: 0 auto; background: #fff; overflow: hidden; min-height: 100vh; position: relative; padding-bottom: 80px; display: flex; flex-direction: column;}
        @media (min-width: 576px) {
            .checkout-card { margin: 2rem auto; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); min-height: auto; }
        }
        
        .gw-header { 
            background-color: <?= $gw_color ?>; 
            color: white; 
            padding: clamp(1.5rem, 5vw, 2.5rem) 1rem clamp(1rem, 4vw, 1.5rem); 
            text-align: center; 
            border-bottom-left-radius: 20px;
            border-bottom-right-radius: 20px;
        }
        .company-pill {
            display: inline-block;
            border: 2px solid white;
            border-radius: 50px;
            padding: 5px 25px;
            font-size: clamp(1.3rem, 6vw, 2.2rem);
            font-weight: 500;
            margin-bottom: 1rem;
        }
        .gw-header h4 { font-weight: 500; font-size: clamp(1rem, 4vw, 1.4rem); letter-spacing: 0.5px; }
        .gw-header p { font-size: clamp(0.7rem, 3vw, 0.85rem); font-weight: 400; opacity: 0.9; margin-bottom: 0; }
        
        .step-title {
            text-align: center;
            font-weight: 500;
            color: #555;
            font-size: clamp(0.85rem, 3.5vw, 1.1rem);
            margin-top: clamp(1rem, 4vw, 1.5rem);
            margin-bottom: 0.5rem;
        }
        
        .instruction-pill {
            background-color: <?= $gw_color ?>;
            color: white;
            display: inline-block;
            padding: 5px 18px;
            border-radius: 50px;
            font-weight: 600;
            font-size: clamp(0.85rem, 3.5vw, 1.1rem);
        }
        
        .num-highlight { 
            font-size: clamp(1.4rem, 6.5vw, 2.5rem); 
            font-weight: 500; 
            color: #444; 
            background: #eef0f2; 
            padding: 8px 10px; 
            border-radius: 10px; 
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto;
            max-width: 95%;
            width: fit-content;
            letter-spacing: 1px;
            gap: 10px;
            cursor: pointer;
            word-break: break-all;
        }
        
        .amt-highlight { 
            font-size: clamp(1.6rem, 7.5vw, 2.8rem); 
            font-weight: 500; 
            color: <?= $gw_color ?>; 
            border: 2px solid <?= $gw_color ?>;
            padding: 8px 10px; 
            border-radius: 10px; 
            text-align: center;
            display: block;
            margin: 0 auto;
            max-width: 95%;
            width: fit-content;
            min-width: 150px;
        }
        
        /* Gateway Icons Styling */
        .gateway-icons-container {
            gap: 8px;
            justify-content: center;
            padding: 0 10px;
        }
        .icon-item { width: clamp(55px, 15vw, 75px); }
        .icon-box {
            width: clamp(45px, 13vw, 65px); 
            height: clamp(45px, 13vw, 65px);
            border-radius: 15px;
            display: flex; align-items: center; justify-content: center;
            font-size: clamp(1.1rem, 4.5vw, 2rem);
            margin: 0 auto;
            transition: all 0.2s ease;
        }
        .icon-text {
            font-size: clamp(0.55rem, 2.2vw, 0.75rem);
            line-height: 1.2;
            word-wrap: break-word;
        }
        .checkmark-circle {
            position: absolute;
            top: -6px; left: -2px;
            width: clamp(18px, 5vw, 24px); 
            height: clamp(18px, 5vw, 24px);
            background: white; border: 2px solid <?= $gw_color ?>;
            color: <?= $gw_color ?>;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: clamp(0.45rem, 1.8vw, 0.7rem); z-index: 2;
        }
        
        /* Nagad Theme */
        .gateway-icons-container.nagad .icon-box { background: #ed1c24; color: white; opacity: 0.8; }
        .gateway-icons-container.nagad .active-icon { opacity: 1; transform: scale(1.05); }
        
        /* bKash Theme */
        .gateway-icons-container.bkash .icon-box { background: white; color: #e2136e; border: 1px solid #f0f0f0; opacity: 0.7; }
        .gateway-icons-container.bkash .active-icon { opacity: 1; border: 1px solid #e2136e; transform: scale(1.05); box-shadow: 0 4px 10px rgba(226,19,110,0.15); }
        
        /* Upay Theme */
        .gateway-icons-container.upay .icon-box { background: white; color: #007bff; border: 1px solid #f0f0f0; opacity: 0.7; }
        .gateway-icons-container.upay .active-icon { opacity: 1; border: 1px solid #007bff; transform: scale(1.05); box-shadow: 0 4px 10px rgba(0,123,255,0.15); }
        
        .footer-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px clamp(10px, 4vw, 30px);
            font-size: clamp(0.7rem, 2.8vw, 0.85rem);
            position: absolute;
            bottom: 0; width: 100%;
        }
        @media (max-width: 380px) {
            .footer-row { flex-direction: column; gap: 8px; text-align: center; justify-content: center; }
            .footer-row .text-end { text-align: center !important; }
            .checkout-card { padding-bottom: 90px; }
        }
        .timer-text { font-weight: 500; color: #444; }
        .timer-value { color: <?= $gw_color ?>; font-weight: 600; }
        .waiting-text { color: #666; }
    </style>
</head>
<body>
    <div class="checkout-card">
        <div class="gw-header">
            <div class="company-pill"><?= htmlspecialchars($company_name) ?></div>
            <h4>Payment Instructions</h4>
            <p>Complete Payment from your <?= htmlspecialchars($intent['gateway_name']) ?> app</p>
        </div>
        
        <div class="px-4 pb-4">
            <?php if (!$is_active): ?>
                <div class="text-center py-5">
                    <?php if ($intent['status'] === 'paid'): ?>
                        <i class="fas fa-check-circle text-success" style="font-size: 5rem;"></i>
                        <h4 class="mt-4 fw-bold">Payment Successful!</h4>
                        <p class="text-muted">Your payment has been received and processed.</p>
                    <?php elseif ($intent['status'] === 'review'): ?>
                        <i class="fas fa-exclamation-circle text-warning" style="font-size: 5rem;"></i>
                        <h4 class="mt-4 fw-bold">Manual Review Needed</h4>
                        <p class="text-muted">Your payment was detected but needs manual verification. Please contact support.</p>
                    <?php elseif ($intent['status'] === 'failed'): ?>
                        <i class="fas fa-times-circle text-danger" style="font-size: 5rem;"></i>
                        <h4 class="mt-4 fw-bold">Payment Failed</h4>
                        <p class="text-muted">There was a problem settling your payment. Please contact support.</p>
                    <?php else: ?>
                        <i class="fas fa-times-circle text-danger" style="font-size: 5rem;"></i>
                        <h4 class="mt-4 fw-bold">Session Expired</h4>
                        <p class="text-muted"><?= htmlspecialchars($status_msg) ?></p>
                    <?php endif; ?>
                    <a href="quick_pay.php" class="btn btn-outline-secondary mt-3 rounded-pill px-4">Return to Portal</a>
                </div>
            <?php elseif (empty($intent['payer_mobile'])): ?>
                <div class="text-center py-5">
                    <i class="fas fa-mobile-alt text-muted mb-3" style="font-size: 3.5rem;"></i>
                    <h5 class="fw-bold">Enter Your <?= htmlspecialchars($intent['gateway_name']) ?> Number</h5>
                    <p class="text-muted small mb-4">We need this to automatically verify your payment. No PIN or OTP will be asked.</p>
                    <?php if(!empty($error)): ?>
                        <div class="alert alert-danger small py-2"><?= htmlspecialchars($error) ?></div>
                    <?php endif; ?>
                    <form method="POST">
                        <div class="mb-3">
                            <input type="text" name="payer_mobile" class="form-control form-control-lg text-center fw-bold" placeholder="e.g. 017XXXXXXXX" required autofocus style="background: #f0f0f0; border: none; border-radius: 10px;">
                        </div>
                        <button type="submit" class="btn btn-lg w-100 text-white fw-bold" style="background-color: <?= $gw_color ?>; border-radius: 10px;">Proceed to Instructions</button>
                    </form>
                </div>
            <?php else: ?>
                <div class="step-title">Step 1: Go to <?= htmlspecialchars($intent['gateway_name']) ?> app and select</div>
                <div class="text-center">
                    <div class="instruction-pill"><?= htmlspecialchars($intent['instruction_type']) ?></div>
                </div>
                
                <?= renderGatewayIcons($intent['gateway_name'], $intent['instruction_type']) ?>
                
                <div class="step-title">Step 2: Enter Account Number</div>
                <div class="num-highlight user-select-all d-flex align-items-center justify-content-center" style="gap: 15px; cursor: pointer;" onclick="copyToClipboard('<?= htmlspecialchars($intent['merchant_number']) ?>')">
                    <span id="merchantNumber"><?= htmlspecialchars($intent['merchant_number']) ?></span>
                    <i class="far fa-copy text-danger" style="font-size: 1.2rem; opacity: 0.8;" id="copyIcon"></i>
                </div>
                
                <div class="step-title mt-4">Step 3: Enter Exact Amount</div>
                <div class="amt-highlight">৳<?= number_format($intent['amount'], 2) ?></div>
            <?php endif; ?>
        </div>
        
        <?php if ($is_active && !empty($intent['payer_mobile'])): ?>
        <div class="footer-row align-items-center">
            <div class="timer-text">
                Time Remaining : <span class="timer-value" id="timer">-- : --</span>
            </div>
            <div class="waiting-text text-end" style="line-height: 1.2;">
                <span id="waiting-text">Waiting for payment...<br><span style="font-size: 0.75rem; opacity: 0.8;">Do not close this page.</span></span>
            </div>
        </div>
        <?php endif; ?>
    </div>
            
    <?php if ($is_active && !empty($intent['payer_mobile'])): ?>
    <script>
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                const icon = document.getElementById('copyIcon');
                icon.className = 'fas fa-check text-success';
                setTimeout(() => {
                    icon.className = 'far fa-copy text-danger';
                }, 2000);
            });
        }

        // Timer Logic
        let remaining = <?= $remaining ?>;
        const timerEl = document.getElementById('timer');
        
        const updateTimer = () => {
            if (remaining <= 0) {
                location.reload();
                return;
            }
            const m = Math.floor(remaining / 60).toString().padStart(2, '0');
            const s = (remaining % 60).toString().padStart(2, '0');
            timerEl.innerText = `${m}:${s}`;
            remaining--;
        };
        updateTimer();
        setInterval(updateTimer, 1000);

        // Polling Logic
        let isPolling = false;
        let terminalStates = ['paid', 'failed', 'review', 'expired'];
        
        const pollStatus = () => {
            if (isPolling) return;
            isPolling = true;
            
            fetch('../../ajax/checkout_status.php?token=<?= urlencode($token) ?>')
                .then(res => res.json())
                .then(data => {
                    isPolling = false;
                    if (!data.success) return;
                    
                    if (data.status === 'processing') {
                        document.getElementById('waiting-text').innerText = "Payment detected, processing...";
                        document.querySelector('#waiting-spinner .spinner-border').classList.replace('text-muted', 'text-primary');
                    } else if (terminalStates.includes(data.status)) {
                        location.reload();
                    }
                })
                .catch(err => {
                    isPolling = false;
                    document.getElementById('waiting-text').innerText = "Network error, retrying...";
                });
        };
        let pollInterval = setInterval(pollStatus, 3000);
    </script>
    <?php endif; ?>
</body>
</html>
