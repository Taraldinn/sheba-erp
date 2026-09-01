<?php
// views/auth/quick_pay.php
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/functions.php';
require_once __DIR__ . '/../../classes/PipraPayGateway.php';

file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | Method: " . $_SERVER['REQUEST_METHOD'] . " | POST: " . json_encode($_POST) . " | GET: " . json_encode($_GET) . "\n", FILE_APPEND);

$error = '';
$msg = '';
$client = null;
$search_id = $_POST['search_id'] ?? ($_GET['search_id'] ?? '');

if (($_SERVER['REQUEST_METHOD'] === 'POST' && (isset($_POST['search']) || isset($_POST['search_id']))) || (isset($_GET['search_id']) && !empty($_GET['search_id']))) {
    $search_id = trim($search_id);

    
    // Fetch 3 sample user_ids to see what's in the DB
    try {
        $samples = safeFetchAll($pdo, "SELECT user_id FROM " . TBL_USERS . " LIMIT 3");
        $sample_list = !empty($samples) ? implode(', ', array_column($samples, 'user_id')) : 'EMPTY_TABLE';
    } catch (Exception $e) {
        $sample_list = "ERROR: " . $e->getMessage();
    }
    
    $debug_info = "[DB: " . DB_NAME . " | Search: '$search_id' | Sample IDs: $sample_list]";
    
    if (!empty($search_id)) {
        // Updated query with TRIM to handle whitespace issues in package names
        $sql = "SELECT u.id, u.user_id, u.name, u.user_package, u.bill_amount, u.due, u.current_bill_date, u.manager_id, u.status, s.price as package_price 
                FROM " . TBL_USERS . " u 
                LEFT JOIN " . TBL_SERVICES . " s ON TRIM(u.user_package) = TRIM(s.name) 
                WHERE LOWER(TRIM(u.user_id)) = ? OR TRIM(u.phone) = ? OR LOWER(TRIM(u.client_code)) = ?";
        $client = safeFetch($pdo, $sql, [strtolower($search_id), $search_id, strtolower($search_id)]);
        
        $debug_info .= " | Result: " . ($client ? "FOUND" : "NOT_FOUND");

        // If no exact match, try flexible phone matching
        if (!$client) {
            $norm_search = preg_replace('/[^0-9]/', '', $search_id);
            if (strlen($norm_search) >= 10) {
                // Match the last 10 digits to ignore prefixes like 0, 88, +88
                $phone_suffix = substr($norm_search, -10);
                $sql_phone = "SELECT u.id, u.user_id, u.name, u.user_package, u.bill_amount, u.due, u.current_bill_date, u.manager_id, u.status, s.price as package_price 
                              FROM " . TBL_USERS . " u 
                              LEFT JOIN " . TBL_SERVICES . " s ON TRIM(u.user_package) = TRIM(s.name) 
                              WHERE u.phone LIKE ?";
                $client = safeFetch($pdo, $sql_phone, ["%$phone_suffix"]);
                $debug_info .= " | Phone Suffix Match: " . ($client ? "FOUND" : "NOT_FOUND");
            }
        }
        
        if (!$client) {
            $error = "User not found. Please check your ID or Phone Number. $debug_info";
        }
    } else {
        $error = "Please enter your User ID or Phone Number.";
    }
}

// Payment Initiation Logic
function redirect_to_gateway($url) {
    file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | Redirecting to $url via JS/meta refresh to bypass form-action CSP.\n", FILE_APPEND);
    
    // Clear any existing output buffer to ensure we only send our redirect HTML page
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    // Start buffering with inject_csp_nonce if it exists
    if (function_exists('inject_csp_nonce')) {
        ob_start('inject_csp_nonce');
    } else {
        ob_start();
    }
    
    echo "<!DOCTYPE html>\n<html>\n<head>\n";
    echo "<meta charset=\"UTF-8\">\n";
    echo "<title>Redirecting...</title>\n";
    echo "<script>window.location.href = " . json_encode($url) . ";</script>\n";
    echo "<noscript><meta http-equiv='refresh' content='0;url=" . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . "'></noscript>\n";
    echo "</head>\n<body>\n";
    echo "<p>Redirecting to payment gateway... If you are not redirected, <a href=\"" . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . "\">click here</a>.</p>\n";
    echo "</body>\n</html>";
    exit;
}

if (isset($_POST['pay_now']) && isset($_POST['client_id'])) {
    $cid = intval($_POST['client_id']);
    $method = $_POST['gateway'];
    
    file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | Pay Now Triggered for Client ID: $cid | Method: $method\n", FILE_APPEND);
    
    $u = safeFetch($pdo, "SELECT * FROM " . TBL_USERS . " WHERE id = ?", [$cid]);
    
    if ($u) {
        file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | User Found: {$u['user_id']} | Manager ID: {$u['manager_id']}\n", FILE_APPEND);
        $u_package = safeFetch($pdo, "SELECT price FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
        $monthly_bill = ($u['bill_amount'] > 0) ? $u['bill_amount'] : ($u_package ? $u_package['price'] : 0);
        $is_expired = (strtotime($u['current_bill_date']) < strtotime(date('Y-m-d')));

        $arrears = floatval($u['due']);
        $default_amount = ($is_expired) ? floatval($monthly_bill) : 0;
        if ($arrears > 0) {
            $default_amount += $arrears;
        }

        $amount = isset($_POST['pay_amount']) ? floatval($_POST['pay_amount']) : $default_amount;

        if ($amount <= 0) {
            $error = "Payment amount must be greater than zero.";
            file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | Error: Amount <= 0 ($amount)\n", FILE_APPEND);
        } else {
            $trx_id = ($method === 'bKashShop') ? "QP-" . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6)) : "QP" . strtoupper(uniqid());
            $pdo->prepare("INSERT INTO " . TBL_ONLINE_PAY . " (staff_id, amount, trx_id, status) VALUES (?, ?, ?, 'Pending')")
                ->execute([$u['id'], $amount, $trx_id]); // Reuse staff_id field to store client ID for public pay

            $gwConfig = get_gateway_credentials($pdo, $u['manager_id']);
            
            $has_bkash_creds = !empty($gwConfig['bkash_app_key']) || !empty($gwConfig['bkash_sandbox_app_key']);
            file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | Amount: $amount | Trx: $trx_id | Has bKash Creds: " . ($has_bkash_creds ? 'YES' : 'NO') . " | Raw Config Keys: " . implode(', ', array_keys($gwConfig)) . "\n", FILE_APPEND);

            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
            $baseUrl = $protocol . $_SERVER['HTTP_HOST'] . $_SERVER['PHP_SELF'];
            $separator = (strpos($baseUrl, '?') === false) ? '?' : '&';

            if (strpos($method, 'AUTO_') === 0) {
                try {
                    $gw_id = intval(substr($method, 5));
                    $public_token = bin2hex(random_bytes(16));
                    $gw_data = safeFetch($pdo, "SELECT gateway_name, merchant_number, checkout_expiry_mins FROM tenant_payment_gateways WHERE id = ?", [$gw_id]);
                    $expiry_mins = ($gw_data && isset($gw_data['checkout_expiry_mins'])) ? $gw_data['checkout_expiry_mins'] : 10;
                    $gateway_name = $gw_data['gateway_name'] ?? 'Unknown';
                    $merchant_number = $gw_data['merchant_number'] ?? '';
                    $expires_at = date('Y-m-d H:i:s', strtotime("+$expiry_mins minutes"));
                    
                    $pdo->prepare("INSERT INTO payment_intents (public_token, gateway_id, gateway_name, receiver_mobile, manager_id, customer_id, entity_type, invoice_id, amount, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'customer', ?, ?, 'created', ?)")
                        ->execute([$public_token, $gw_id, $gateway_name, $merchant_number, $u['manager_id'], $u['id'], $trx_id, $amount, $expires_at]);
                    
                    // Use root-relative path to ensure it works both in index.php and direct access
                    redirect_to_gateway('/views/auth/checkout.php?token=' . $public_token);
                } catch (Throwable $e) {
                    $error = "Auto Checkout System Error: " . $e->getMessage() . " on line " . $e->getLine();
                    file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | AUTO Checkout Error: " . $e->getMessage() . " on line " . $e->getLine() . "\n", FILE_APPEND);
                }
            } else if ($method === 'bKashShop') {
                $shopUrl = $gwConfig['bkash_shop_base_url'] ?? '';
                if (empty($shopUrl) || strpos($shopUrl, 'https://shop.bkash.com/') !== 0) {
                    $error = "Invalid bKash Shop URL configured for this tenant.";
                } else {
                    $paymentUrl = rtrim($shopUrl, '/') . '/paymentlink/default-payment';
                    echo '
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>bKash Payment Instructions</title>
                        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                    </head>
                    <body class="bg-light">
                        <div class="container mt-5" style="max-width: 500px;">
                            <div class="card shadow border-0 rounded-4">
                                <div class="card-body p-4 text-center">
                                    <img src="https://www.logo.wine/a/logo/BKash/BKash-Logo.wine.svg" height="50" class="mb-3" alt="bKash">
                                    <h4 class="fw-bold mb-4">Pay with bKash Shop</h4>
                                    
                                    <div class="alert alert-info border-0 text-start">
                                        <p class="mb-1 text-muted small">Amount to Pay</p>
                                        <h3 class="fw-bold text-dark mb-3">৳' . number_format($amount, 2) . '</h3>
                                        
                                        <p class="mb-1 text-muted small">Payment Reference (Optional) <span class="text-danger">*</span></p>
                                        <div class="input-group mb-3">
                                            <input type="text" class="form-control fw-bold fs-5 text-center bg-white" value="' . htmlspecialchars($u['user_id'], ENT_QUOTES, 'UTF-8') . '" id="refCode" readonly>
                                            <button class="btn btn-outline-primary" type="button" onclick="copyRef()"><i class="fas fa-copy"></i> Copy</button>
                                        </div>
                                    </div>
                                    
                                    <p class="text-danger small fw-bold mb-4">You MUST use exactly this Reference Code during payment so we can automatically verify it.</p>
                                    
                                    <a href="' . htmlspecialchars($paymentUrl, ENT_QUOTES, 'UTF-8') . '" class="btn btn-success w-100 py-3 fw-bold fs-5 rounded-3 mb-3" target="_blank" onclick="document.getElementById(\'waiting\').style.display=\'block\';">CONTINUE TO bKASH</a>
                                    
                                    <div id="waiting" style="display:none;" class="mt-3 text-muted small">
                                        <i class="fas fa-spinner fa-spin me-2"></i> Waiting for payment confirmation... you can close this window after paying.
                                    </div>
                                    <a href="quick_pay.php" class="text-decoration-none small text-muted mt-3 d-inline-block"><i class="fas fa-arrow-left me-1"></i> Go Back</a>
                                </div>
                            </div>
                        </div>
                        <script>
                            function copyRef() {
                                var copyText = document.getElementById("refCode");
                                copyText.select();
                                document.execCommand("copy");
                                alert("Reference copied: " + copyText.value);
                            }
                        </script>
                    </body>
                    </html>';
                    exit;
                }
            } elseif ($method === 'bKash') {
                try {
                    require_once __DIR__ . '/../../classes/BKashGateway.php';
                    $is_sandbox = ($gwConfig['bkash_sandbox'] ?? '0') == '1';
                    if ($is_sandbox) {
                        $bk_key = $gwConfig['bkash_sandbox_app_key'] ?? '';
                        $bk_secret = $gwConfig['bkash_sandbox_app_secret'] ?? '';
                        $bk_user = $gwConfig['bkash_sandbox_username'] ?? '';
                        $bk_pass = $gwConfig['bkash_sandbox_password'] ?? '';
                    } else {
                        $bk_key = $gwConfig['bkash_app_key'] ?? '';
                        $bk_secret = $gwConfig['bkash_app_secret'] ?? '';
                        $bk_user = $gwConfig['bkash_username'] ?? '';
                        $bk_pass = $gwConfig['bkash_password'] ?? '';
                    }

                    if (empty($bk_key) || empty($bk_secret) || empty($bk_user) || empty($bk_pass)) {
                        $error = "bKash Payment Gateway is not fully configured for this client's reseller/manager.";
                        file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | Error: bKash Credentials Empty (Key: " . (empty($bk_key)?'empty':'set') . ", Secret: " . (empty($bk_secret)?'empty':'set') . ", User: " . (empty($bk_user)?'empty':'set') . ", Pass: " . (empty($bk_pass)?'empty':'set') . ")\n", FILE_APPEND);
                    } else {
                        $bkash = new BKashGateway($bk_key, $bk_secret, $bk_user, $bk_pass, $is_sandbox);
                        $tokenResp = $bkash->grantToken();
                        file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | grantToken Response: " . json_encode($tokenResp) . "\n", FILE_APPEND);
                        
                        if (isset($tokenResp['id_token']) && !empty($tokenResp['id_token'])) {
                            $callbackUrl = $baseUrl . $separator . "bkash_callback=1&trxID=$trx_id";
                            $createResp = $bkash->createPayment($tokenResp['id_token'], $amount, $trx_id, $callbackUrl);
                            file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | createPayment Response: " . json_encode($createResp) . "\n", FILE_APPEND);
                            
                            if (isset($createResp['bkashURL'])) {
                                // Save paymentID for later verification
                                if (isset($createResp['paymentID'])) {
                                    $pdo->prepare("UPDATE " . TBL_ONLINE_PAY . " SET payment_id=? WHERE trx_id=?")
                                        ->execute([$createResp['paymentID'], $trx_id]);
                                }
                                redirect_to_gateway($createResp['bkashURL']);
                            } else {
                                if (isset($createResp['statusCode']) && $createResp['statusCode'] == '4116') {
                                    $error = "bKash checkout is currently blocked by bKash gateway or merchant account. Token is working, but payment creation is rejected. Please contact bKash Merchant Support and ask them to check API checkout activation/restriction.";
                                    if (isset($_SESSION['admin_id'])) {
                                        $error .= " <br><strong>Admin Notice:</strong> Check Sandbox/Production credentials and endpoint. If correct, contact bKash support with statusCode 4116.";
                                    }
                                } else {
                                    $error = "bKash Error: " . ($createResp['errorMessage'] ?? ($createResp['statusMessage'] ?? ($createResp['msg'] ?? 'Failed to initiate')));
                                    if (isset($createResp['statusCode']) && $createResp['statusCode'] !== '0000') {
                                        $error .= " (Status Code: " . $createResp['statusCode'] . ")";
                                    }
                                }
                                file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | Create Payment Error: $error\n", FILE_APPEND);
                            }
                        } else {
                            $error = "bKash Token Error: " . ($tokenResp['errorMessage'] ?? ($tokenResp['statusMessage'] ?? ($tokenResp['msg'] ?? 'Check debug_bkash.log')));
                            if (isset($tokenResp['statusCode']) && $tokenResp['statusCode'] !== '0000') {
                                    $error .= " (Status Code: " . $tokenResp['statusCode'] . ")";
                            }
                            file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | Token Error: $error\n", FILE_APPEND);
                        }
                    }
                } catch (Exception $ex_bk) {
                    $error = "bKash Exception: " . $ex_bk->getMessage();
                    file_put_contents(__DIR__ . '/debug_quick_pay_local.log', date('Y-m-d H:i:s') . " | bKash Exception: " . $ex_bk->getMessage() . "\n", FILE_APPEND);
                }
            } elseif ($method === 'SSLCOMMERZ') {
                try {
                    require_once __DIR__ . '/../../classes/SSLCommerzGateway.php';
                    $is_sandbox = ($gwConfig['sslcz_sandbox'] ?? '0') == '1';
                    $store_id = $gwConfig['sslcz_store_id'] ?? '';
                    $store_passwd = $gwConfig['sslcz_store_passwd'] ?? '';

                    if (empty($store_id) || empty($store_passwd)) {
                        $error = "SSLCOMMERZ Gateway is not fully configured for this client's reseller/manager.";
                    } else {
                        $sslcz = new SSLCommerzGateway($store_id, $store_passwd, $is_sandbox);
                        
                        $callbackUrl = $baseUrl . $separator . "sslcz_callback=1&trxID=$trx_id";
                        $urls = [
                            'success_url' => $callbackUrl,
                            'fail_url' => $callbackUrl,
                            'cancel_url' => $callbackUrl,
                            'ipn_url' => $callbackUrl
                        ];
                        
                        $customerInfo = [
                            'name' => $u['name'],
                            'email' => $u['email'] ?? '',
                            'address' => $u['address'] ?? '',
                            'phone' => $u['phone'] ?? ''
                        ];

                        $createResp = $sslcz->createPayment($amount, $trx_id, $customerInfo, $urls);
                        
                        if (isset($createResp['status']) && $createResp['status'] === 'SUCCESS' && isset($createResp['GatewayPageURL'])) {
                            redirect_to_gateway($createResp['GatewayPageURL']);
                        } else {
                            $error = "SSLCOMMERZ Error: " . ($createResp['failedreason'] ?? 'Failed to initiate checkout.');
                        }
                    }
                } catch (Exception $ex_ssl) {
                    $error = "SSLCOMMERZ Exception: " . $ex_ssl->getMessage();
                }
            } elseif ($method === 'Nagad') {
                // Nagad logic usually involves a redirect to a central processor or similar
                $error = "Nagad payment is temporarily unavailable. Please use bKash or PipraPay.";
            } else {
                // PipraPay Default
                if (!empty($gwConfig['piprapay_api_key'])) {
                    $pp = new PipraPayGateway($gwConfig['piprapay_api_key'], $gwConfig['piprapay_url']);
                    $redirectUrl = $baseUrl . $separator . "payment_callback=1&my_trx=$trx_id";
                    $cancelUrl = $baseUrl . $separator . "payment_callback=1&my_trx=$trx_id&status=cancel";
                    $webhookUrl = $baseUrl . $separator . "action=piprapay_webhook";
                    
                    $payerInfo = [
                        'name' => $u['name'], 'email_mobile' => $u['phone'],
                        'redirect_url' => $redirectUrl, 'cancel_url' => $cancelUrl, 'webhook_url' => $webhookUrl,
                        'metadata' => ['user_id' => $u['id'], 'trx_id' => $trx_id]
                    ];
                    $res = $pp->createPayment($amount, $payerInfo);
                    $gatewayUrl = $res['payment_url'] ?? ($res['pp_url'] ?? null);
                    if ($gatewayUrl) {
                        if (isset($res['pp_id'])) $pdo->prepare("UPDATE " . TBL_ONLINE_PAY . " SET payment_id=? WHERE trx_id=?")->execute([$res['pp_id'], $trx_id]);
                        redirect_to_gateway($gatewayUrl);
                    } else {
                        $error = "Gateway Error: " . ($res['message'] ?? 'Unknown error');
                    }
                } else {
                    $error = "Payment Gateway not configured for this reseller.";
                }
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quick Pay - <?= get_opt($pdo, 'company_name', 'ISP Sheba') ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        body { background: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; min-height: 100vh; margin: 0; display: flex; flex-direction: column; padding: 20px 10px; }
        .payment-card { background: #fff; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 500px; padding: 2rem; margin: auto; }
        .logo { max-width: 150px; margin-bottom: 1.5rem; }
        .client-info { background: #f8f9fa; border-left: 4px solid #0d6efd; padding: 1rem; border-radius: 5px; margin-top: 1.5rem; }
        .gateway-option { border: 2px solid #eee; border-radius: 10px; padding: 10px; cursor: pointer; transition: 0.3s; margin-bottom: 10px; }
        .gateway-option:hover { border-color: #0d6efd; background: #f0f7ff; }
        .gateway-option input { display: none; }
        .gateway-option input:checked + label { color: #0d6efd; font-weight: bold; }
        .gateway-option.selected { border-color: #0d6efd; background: #f0f7ff; }
    </style>
</head>
<body>
    <div class="payment-card">
        <div class="text-center">
            <?php $logo = get_opt($pdo, 'logo_url'); if($logo): ?>
                <img src="<?= $logo ?>" alt="Logo" class="logo">
            <?php else: ?>
                <h2 class="mb-4 text-primary"><?= get_opt($pdo, 'company_name', 'ISP Sheba') ?></h2>
            <?php endif; ?>
            <h5 class="mb-4">Quick Bill Payment</h5>
        </div>

        <?php if($error): ?>
            <div class="alert alert-danger"><?= $error ?></div>
        <?php endif; ?>

        <form method="POST">
            <div class="mb-3">
                <label class="form-label">Client ID or Phone Number</label>
                <div class="input-group">
                    <input type="text" name="search_id" class="form-control" placeholder="Enter ID or Phone" value="<?= htmlspecialchars($search_id) ?>" required>
                    <button class="btn btn-primary" type="submit" name="search">Search</button>
                </div>
            </div>
        </form>

        <?php if ($client): ?>
            <div class="client-info">
                <h6><i class="fas fa-user me-2"></i> <?= htmlspecialchars($client['name']) ?></h6>
                <p class="mb-1"><strong>ID:</strong> <?= htmlspecialchars($client['user_id']) ?></p>
                <p class="mb-1"><strong>Package:</strong> <?= htmlspecialchars($client['user_package']) ?></p>
                <p class="mb-1"><strong>Expiry:</strong> <span class="badge bg-warning text-dark"><?= ($client['status'] == 'Free') ? 'Infinity' : htmlspecialchars($client['current_bill_date']) ?></span></p>
                <hr>
                <?php
                    $monthly_bill = ($client['bill_amount'] > 0) ? $client['bill_amount'] : ($client['package_price'] ?? 0);
                    $today = date('Y-m-d');
                    $is_expired = (strtotime($client['current_bill_date']) < strtotime($today));
                    
                    // If expired, we show at least the monthly bill. We ignore negative "due" (credit) for this display.
                    $arrears = floatval($client['due']);
                    $total_due = ($is_expired) ? floatval($monthly_bill) : 0;
                    if ($arrears > 0) {
                        $total_due += $arrears;
                    }
                    if ($client['status'] == 'Free') {
                        $total_due = 0;
                    }
                ?>
                <h5 class="text-danger mb-0">Total Due: ৳<?= number_format($total_due, 2) ?></h5>
            </div>

            <form method="POST" class="mt-4">
                <input type="hidden" name="client_id" value="<?= $client['id'] ?>">
                <input type="hidden" name="search_id" value="<?= htmlspecialchars($search_id) ?>">
                
                <div class="mb-3">
                    <label class="form-label fw-bold">Payment Amount (৳)</label>
                    <input type="number" step="0.01" name="pay_amount" class="form-control" value="<?= ($total_due > 0) ? $total_due : $monthly_bill ?>" required min="10">
                    <?php if ($total_due == 0): ?>
                        <small class="text-muted">Advance payment (Monthly Bill: ৳<?= number_format($monthly_bill, 2) ?>)</small>
                    <?php endif; ?>
                </div>

                <?php
                    $client_gw = get_gateway_credentials($pdo, $client['manager_id']);
                    $has_bkash_shop = !empty(trim($client_gw['bkash_shop_enabled'] ?? '')) && !empty(trim($client_gw['bkash_shop_base_url'] ?? ''));
                    $has_bkash = !empty(trim($client_gw['bkash_app_key'] ?? '')) || !empty(trim($client_gw['bkash_sandbox_app_key'] ?? ''));
                    $has_sslcz = (!empty(trim($client_gw['sslcz_store_id'] ?? '')) && ($client_gw['sslcz_enabled'] ?? '0') === '1');
                    // Nagad is temporarily disabled in logic but we can add it if needed
                    $has_nagad = !empty(trim($client_gw['nagad_merchant_id'] ?? ''));
                    $first_gw = '';
                ?>
                <div class="mb-3">
                    <label class="form-label fw-bold mb-2">Select Payment Method</label>
                    <div class="d-flex flex-column gap-2">
                        <?php if ($has_bkash_shop): $first_gw = $first_gw ?: 'bKashShop'; ?>
                        <div class="gateway-option gateway-select-btn <?= $first_gw === 'bKashShop' ? 'selected' : '' ?> p-3 border rounded bg-light" data-target="gw_bkash_shop">
                            <input type="radio" name="gateway" id="gw_bkash_shop" value="bKashShop" <?= $first_gw === 'bKashShop' ? 'checked' : '' ?> class="d-none">
                            <label for="gw_bkash_shop" class="w-100 mb-0 fw-bold" style="cursor:pointer;">
                                <img src="https://www.logo.wine/a/logo/BKash/BKash-Logo.wine.svg" height="30" class="me-2" alt="bKash"> bKash Shop Payment
                            </label>
                        </div>
                        <?php endif; ?>

                        <?php if ($has_bkash): $first_gw = $first_gw ?: 'bKash'; ?>
                        <div class="gateway-option gateway-select-btn <?= $first_gw === 'bKash' ? 'selected' : '' ?> p-3 border rounded bg-light" data-target="gw_bkash">
                            <input type="radio" name="gateway" id="gw_bkash" value="bKash" <?= $first_gw === 'bKash' ? 'checked' : '' ?> class="d-none">
                            <label for="gw_bkash" class="w-100 mb-0 fw-bold" style="cursor:pointer;">
                                <img src="https://www.logo.wine/a/logo/BKash/BKash-Logo.wine.svg" height="30" class="me-2" alt="bKash"> bKash Payment Gateway
                            </label>
                        </div>
                        <?php endif; ?>

                        <?php if ($has_sslcz): $first_gw = $first_gw ?: 'SSLCOMMERZ'; ?>
                        <div class="gateway-option gateway-select-btn <?= $first_gw === 'SSLCOMMERZ' ? 'selected' : '' ?> p-3 border rounded bg-light" data-target="gw_sslcz">
                            <input type="radio" name="gateway" id="gw_sslcz" value="SSLCOMMERZ" <?= $first_gw === 'SSLCOMMERZ' ? 'checked' : '' ?> class="d-none">
                            <label for="gw_sslcz" class="w-100 mb-0 fw-bold" style="cursor:pointer;">
                                <i class="fas fa-credit-card me-2 text-primary"></i> SSLCOMMERZ (Cards/Mobile/Net Banking)
                            </label>
                        </div>
                        <?php endif; ?>

                        <?php 
                        $manager_id = intval($client['manager_id']);
                        $auto_gws = safeFetchAll($pdo, "SELECT id, gateway_name FROM tenant_payment_gateways WHERE staff_id = ? AND status = 'active' AND checkout_enabled = 1", [$manager_id]);
                        
                        if (empty($auto_gws)) {
                            // Fallback to Admin's auto checkout gateways if reseller hasn't configured any
                            $auto_gws = safeFetchAll($pdo, "SELECT g.id, g.gateway_name FROM tenant_payment_gateways g JOIN " . TBL_STAFF . " s ON g.staff_id = s.id WHERE s.role IN ('Admin', 'Super Admin', 'system admin') AND g.status = 'active' AND g.checkout_enabled = 1");
                            
                            if (empty($auto_gws)) {
                                // Final fallback for root admin IDs
                                $auto_gws = safeFetchAll($pdo, "SELECT id, gateway_name FROM tenant_payment_gateways WHERE staff_id IN (0, 1) AND status = 'active' AND checkout_enabled = 1");
                            }
                        }
                        foreach($auto_gws as $agw):
                            $gw_val = 'AUTO_' . $agw['id'];
                            $first_gw = $first_gw ?: $gw_val;
                            $icon = 'mobile-alt';
                            if ($agw['gateway_name'] == 'bKash') $img = 'https://www.logo.wine/a/logo/BKash/BKash-Logo.wine.svg';
                            elseif ($agw['gateway_name'] == 'Nagad') $img = 'https://download.logo.wine/logo/Nagad/Nagad-Logo.wine.png';
                            else $img = '';
                        ?>
                        <div class="gateway-option gateway-select-btn <?= $first_gw === $gw_val ? 'selected' : '' ?> p-3 border rounded bg-light" data-target="gw_<?= $gw_val ?>">
                            <input type="radio" name="gateway" id="gw_<?= $gw_val ?>" value="<?= $gw_val ?>" <?= $first_gw === $gw_val ? 'checked' : '' ?> class="d-none">
                            <label for="gw_<?= $gw_val ?>" class="w-100 mb-0 fw-bold" style="cursor:pointer;">
                                <?php if($img): ?><img src="<?= $img ?>" height="30" class="me-2" alt="<?= htmlspecialchars($agw['gateway_name']) ?>"><?php else: ?><i class="fas fa-<?= $icon ?> me-2 text-primary"></i><?php endif; ?> <?= htmlspecialchars($agw['gateway_name']) ?> Auto Checkout
                            </label>
                        </div>
                        <?php endforeach; ?>

                        <?php if (empty($has_bkash_shop) && empty($has_bkash) && empty($has_sslcz) && empty($auto_gws)): ?>
                            <div class="alert alert-warning mb-0">No payment gateways configured. Please contact support.</div>
                        <?php endif; ?>
                    </div>
                </div>

                <button type="submit" name="pay_now" class="btn btn-success w-100 py-2 mt-3 fw-bold">PROCEED TO PAY</button>
                
                <?php 
                    $video_url = get_opt($pdo, 'payment_tutorial_video', '');
                    if (!empty($video_url)): 
                ?>
                <a href="<?= htmlspecialchars($video_url) ?>" target="_blank" class="btn btn-outline-danger w-100 py-2 mt-2 fw-bold">
                    <i class="fab fa-youtube me-1"></i> Watch How to Pay
                </a>
                <?php endif; ?>
            </form>
        <?php endif; ?>

        <div class="mt-4 text-center">
            <a href="index.php" class="text-decoration-none small text-muted"><i class="fas fa-arrow-left me-1"></i> Back to Login</a>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.gateway-select-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.gateway-option').forEach(opt => opt.classList.remove('selected'));
                    this.classList.add('selected');
                    const radioId = this.getAttribute('data-target');
                    const radioInput = document.getElementById(radioId);
                    if (radioInput) {
                        radioInput.checked = true;
                    }
                });
            });

            // Initialize selection
            const checkedInput = document.querySelector('.gateway-option input:checked');
            if (checkedInput) {
                const parent = checkedInput.closest('.gateway-option');
                if (parent) parent.classList.add('selected');
            }
        });
    </script>
</body>
</html>
