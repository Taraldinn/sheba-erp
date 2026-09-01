<?php
// PAYMENT CALLBACK CONTROLLER
if (!isset($_GET['action']) && !isset($_GET['bkash_callback']) && !isset($_GET['nagad_callback'])) {
    die("Invalid Access");
}

safe_log('callback', 'Callback Hit', $_GET);

$action = $_GET['action'] ?? '';

// bKash Callback Flow
if (isset($_GET['bkash_callback'])) {
    $status = $_GET['status'] ?? '';
    $paymentID = $_GET['paymentID'] ?? '';
    $trxID = $_GET['trxID'] ?? '';

    if ($status === 'cancel') {
        header("Location: index.php");
        exit;
    } elseif ($status === 'failure') {
        header("Location: index.php");
        exit;
    } elseif ($status === 'success' && $paymentID) {
        // Find manager_id from TBL_ONLINE_PAY
        $manager_id = 0;
        if ($trxID) {
            $chk_init = $pdo->prepare("SELECT staff_id FROM ".TBL_ONLINE_PAY." WHERE trx_id=?");
            $chk_init->execute([$trxID]);
            $init_row = $chk_init->fetch();
            if ($init_row && $init_row['staff_id'] > 0) {
                // Try Users Table (Client Recharge)
                $chk_mgr = $pdo->prepare("SELECT manager_id FROM ".TBL_USERS." WHERE id=?");
                $chk_mgr->execute([$init_row['staff_id']]);
                $mgr_row = $chk_mgr->fetch();
                if ($mgr_row) {
                    $manager_id = $mgr_row['manager_id'];
                } else {
                    // Try Staff Table (Wallet Top-up)
                    $chk_staff = $pdo->prepare("SELECT parent_id FROM ".TBL_STAFF." WHERE id=?");
                    $chk_staff->execute([$init_row['staff_id']]);
                    $staff_row = $chk_staff->fetch();
                    if ($staff_row) {
                        $manager_id = $staff_row['parent_id'];
                    }
                }
            }
        }
        $gwConfig = get_gateway_credentials($pdo, $manager_id);
        
        $bk_sandbox = ($gwConfig['bkash_sandbox'] ?? '0') == '1';
        if ($bk_sandbox) {
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
    
        // Init bKash Gateway
        require_once __DIR__ . '/../classes/BKashGateway.php';
        $bkash = new BKashGateway($bk_key, $bk_secret, $bk_user, $bk_pass, $bk_sandbox);

        $tokenResp = $bkash->grantToken();
        if (isset($tokenResp['id_token'])) {
            $token = $tokenResp['id_token'];
            
            // Execute Payment
            $execResp = $bkash->executePayment($token, $paymentID);
            
            if (isset($execResp['statusCode']) && $execResp['statusCode'] == '0000' && isset($execResp['transactionStatus']) && $execResp['transactionStatus'] == 'Completed') {
                $trxID_actual = $execResp['trxID'] ?? ''; // bkash generated trx id
                $amount = floatval($execResp['amount']); // Capture actual amount from response

                if ($trxID_actual) {
                    $chk_dup = $pdo->prepare("SELECT id FROM ".TBL_ONLINE_PAY." WHERE trx_id=? AND (status='COMPLETED' OR status='Success')");
                    $chk_dup->execute([$trxID_actual]);
                    if ($chk_dup->fetch()) {
                        safe_log('payment_security', "Blocked duplicate bKash callback for completed trxID: " . $trxID_actual);
                        header("Location: index.php");
                        exit;
                    }
                }

                // Verify the transaction
                $chk = $pdo->prepare("SELECT id, status, amount, trx_id, staff_id FROM ".TBL_ONLINE_PAY." WHERE payment_id=? OR trx_id=?");
                $chk->execute([$paymentID, $trxID]);
                $existing = $chk->fetch();

                if ($existing && ($existing['status'] == 'COMPLETED' || $existing['status'] == 'Success')) {
                    header("Location: index.php");
                    exit;
                }
                
                if ($existing) {
                    $db_amount = floatval($existing['amount']);
                    $user_id = intval($existing['staff_id']); // UID was saved here in quick_pay.php
                    
                    if ($user_id > 0) {
                        // 1. Log Success in ONLINE_PAY
                        $stmt = $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET status='COMPLETED', trx_id=?, gateway_response=? WHERE id=? AND status != 'COMPLETED'");
                        $stmt->execute([$trxID_actual ?: $trxID, json_encode($execResp), $existing['id']]);
                        if ($stmt->rowCount() === 0) {
                            safe_log('payment_security', "Blocked concurrent bKash callback for ID: " . $existing['id']);
                            header("Location: index.php");
                            exit;
                        }

                        // 2. Process Success (Expiry, Due, MikroTik, Logs)
                        $log_id = processOnlinePaymentSuccess($pdo, $user_id, $amount, 'bKash', $execResp);

                        // 5. Redirect User
                        if (isset($_SESSION['client_logged_in']) && $_SESSION['client_logged_in'] === true && is_numeric($log_id)) {
                            header("Location: index.php?panel=client&tab=recharge_invoice&id=" . $log_id);
                        } else {
                            header("Location: index.php");
                        }
                        exit;
                    } else {
                        safe_log('callback', "User ID not found in online_pay for TrxID: $trxID");
                        header("Location: index.php"); exit;
                    }
                } else {
                    safe_log('callback', "No record found in online_pay for PaymentID: $paymentID or TrxID: $trxID");
                    header("Location: index.php"); exit;
                }
            } else {
                 safe_log('callback', "Execute Failed", $execResp);
                 header("Location: index.php"); exit;
            }
        } else {
             safe_log('callback', "Grant Token Failed", $tokenResp);
             header("Location: index.php"); exit;
        }
    }
}

// Nagad Callback Flow
if (isset($_GET['nagad_callback'])) {
    $payment_ref_id = $_GET['payment_ref_id'] ?? '';
    $trxID = $_GET['trxID'] ?? '';

    if ($payment_ref_id) {
        // Find manager_id from TBL_ONLINE_PAY
        $manager_id = 0;
        $chk_init = $pdo->prepare("SELECT id, status, staff_id FROM ".TBL_ONLINE_PAY." WHERE trx_id=? OR payment_id=?");
        $chk_init->execute([$trxID, $payment_ref_id]);
        $init_row = $chk_init->fetch();
        if ($init_row && (($init_row['status'] ?? '') === 'COMPLETED' || ($init_row['status'] ?? '') === 'Success')) {
            safe_log('payment_security', "Blocked duplicate Nagad callback for transaction: " . ($trxID ?: $payment_ref_id));
            header("Location: index.php");
            exit;
        }
        if ($trxID) {
            $chk_dup = $pdo->prepare("SELECT id FROM ".TBL_ONLINE_PAY." WHERE trx_id=? AND (status='COMPLETED' OR status='Success')");
            $chk_dup->execute([$trxID]);
            if ($chk_dup->fetch()) {
                safe_log('payment_security', "Blocked duplicate Nagad callback for completed trxID: " . $trxID);
                header("Location: index.php");
                exit;
            }
        }
        if ($init_row && $init_row['staff_id'] > 0) {
            // Try Users Table (Client Recharge)
            $chk_mgr = $pdo->prepare("SELECT manager_id FROM ".TBL_USERS." WHERE id=?");
            $chk_mgr->execute([$init_row['staff_id']]);
            $mgr_row = $chk_mgr->fetch();
            if ($mgr_row) {
                $manager_id = $mgr_row['manager_id'];
            } else {
                // Try Staff Table (Wallet Top-up)
                $chk_staff = $pdo->prepare("SELECT parent_id FROM ".TBL_STAFF." WHERE id=?");
                $chk_staff->execute([$init_row['staff_id']]);
                $staff_row = $chk_staff->fetch();
                if ($staff_row) {
                    $manager_id = $staff_row['parent_id'];
                }
            }
        }
        $gwConfig = get_gateway_credentials($pdo, $manager_id);
        
        $config = [
            'NAGAD_APP_ID' => $gwConfig['nagad_merchant_id'],
            'NAGAD_APP_PUBLIC_KEY' => $gwConfig['nagad_public_key'],
            'NAGAD_APP_PRIVATE_KEY' => $gwConfig['nagad_private_key'],
            'NAGAD_MERCHANT_ID' => $gwConfig['nagad_merchant_id'],
            'NAGAD_MERCHANT_NUMBER' => $gwConfig['nagad_merchant_phone'],
            'NAGAD_IS_SANDBOX' => $gwConfig['nagad_sandbox'] == '1'
        ];

        try {
            $nagad = new \Xenon\NagadApi\Base($config);
            $verify = $nagad->verifyPayment($payment_ref_id);
            
            if (isset($verify['status']) && $verify['status'] == 'Success') {
                $amount = floatval($verify['amount']);
                $user_id = intval($init_row['staff_id']);

                if ($user_id > 0) {
                    // 1. Log Success in ONLINE_PAY
                    $stmt = $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET status='COMPLETED', trx_id=?, gateway_response=? WHERE id=? AND status != 'COMPLETED'");
                    $stmt->execute([$trxID, json_encode($verify), $init_row['id'] ?? 0]);
                    if ($stmt->rowCount() === 0) {
                        safe_log('payment_security', "Blocked concurrent Nagad callback for ID: " . ($init_row['id'] ?? 0));
                        header("Location: index.php");
                        exit;
                    }

                    // 2. Process Success (Expiry, Due, MikroTik, Logs)
                    $log_id = processOnlinePaymentSuccess($pdo, $user_id, $amount, 'Nagad', $verify);

                    // 5. Redirect User
                    if (isset($_SESSION['client_logged_in']) && $_SESSION['client_logged_in'] === true && is_numeric($log_id)) {
                        header("Location: index.php?panel=client&tab=recharge_invoice&id=" . $log_id);
                    } else {
                        header("Location: index.php");
                    }
                    exit;
                }
            } else {
                header("Location: index.php");
                exit;
            }
        } catch (Exception $e) {
            header("Location: index.php");
            exit;
        }
    }
}
if ($action == 'success' || $action == 'webhook') {
    // Verify Payment (Assumes gateway sends back some ID or we rely on redirect params - usually POST/GET)
    // Check documentation logic or assumption: Gateway usually redirects with payment_id or similar
    $payment_id = $_REQUEST['payment_id'] ?? $_REQUEST['fw_id'] ?? ''; // Adjust based on actual gateway response
    
    if($payment_id) {
        // Find manager_id
        $manager_id = 0;
        $chk_init = $pdo->prepare("SELECT staff_id FROM ".TBL_ONLINE_PAY." WHERE payment_id=? OR trx_id=?");
        $chk_init->execute([$payment_id, $payment_id]);
        $init_row = $chk_init->fetch();
        if ($init_row && $init_row['staff_id'] > 0) {
            // Try Users Table (Client Recharge)
            $chk_mgr = $pdo->prepare("SELECT manager_id FROM ".TBL_USERS." WHERE id=?");
            $chk_mgr->execute([$init_row['staff_id']]);
            $mgr_row = $chk_mgr->fetch();
            if ($mgr_row) {
                $manager_id = $mgr_row['manager_id'];
            } else {
                // Try Staff Table (Wallet Top-up)
                $chk_staff = $pdo->prepare("SELECT parent_id FROM ".TBL_STAFF." WHERE id=?");
                $chk_staff->execute([$init_row['staff_id']]);
                $staff_row = $chk_staff->fetch();
                if ($staff_row) {
                    $manager_id = $staff_row['parent_id'];
                }
            }
        }
        $gwConfig = get_gateway_credentials($pdo, $manager_id);
        $gateway = new PipraPayGateway($gwConfig['piprapay_api_key'], $gwConfig['piprapay_url']);
        
        $verify = $gateway->verifyPayment($payment_id);
        
        if ($verify && isset($verify['status']) && $verify['status'] == 'success') {
            // Extract actual transaction ID
            $trxID_actual = $verify['trx_id'] ?? $verify['transaction_id'] ?? $payment_id;

            // Check if already processed
            $chk = $pdo->prepare("SELECT id, status FROM ".TBL_ONLINE_PAY." WHERE payment_id=?");
            $chk->execute([$payment_id]);
            $existing = $chk->fetch();

            if ($existing && ($existing['status'] == 'COMPLETED' || $existing['status'] == 'Success')) {
                header("Location: index.php");
                exit;
            }

            if ($trxID_actual) {
                $chk_dup = $pdo->prepare("SELECT id FROM ".TBL_ONLINE_PAY." WHERE trx_id=? AND (status='COMPLETED' OR status='Success')");
                $chk_dup->execute([$trxID_actual]);
                if ($chk_dup->fetch()) {
                    safe_log('payment_security', "Blocked duplicate PipraPay callback for completed trxID: " . $trxID_actual);
                    header("Location: index.php");
                    exit;
                }
            }

            // EXTRACT METADATA
            $meta = $verify['metadata'] ?? [];
            if(is_string($meta)) $meta = json_decode($meta, true);

            $user_id = $meta['user_id'] ?? 0;
            $amount = $verify['amount'] ?? 0;

            if ($user_id > 0) {
                // 1. Log Success in ONLINE_PAY
                if ($existing) {
                    $stmt = $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET status='COMPLETED', trx_id=?, gateway_response=? WHERE id=? AND status != 'COMPLETED'");
                    $stmt->execute([$trxID_actual, json_encode($verify), $existing['id']]);
                    if ($stmt->rowCount() === 0) {
                        safe_log('payment_security', "Blocked concurrent PipraPay callback for ID: " . $existing['id']);
                        header("Location: index.php");
                        exit;
                    }
                } else {
                    $pdo->prepare("INSERT INTO ".TBL_ONLINE_PAY." (staff_id, amount, trx_id, status, payment_id, gateway_response) VALUES (?, ?, ?, ?, ?, ?)")
                        ->execute([0, $amount, $trxID_actual, 'COMPLETED', $payment_id, json_encode($verify)]);
                }

                // 2. Process Success (Expiry, Due, MikroTik, Logs)
                $log_id = processOnlinePaymentSuccess($pdo, $user_id, $amount, 'PipraPay', $verify);
                
                // 5. Redirect User
                if (isset($_SESSION['client_logged_in']) && $_SESSION['client_logged_in'] === true && is_numeric($log_id)) {
                    header("Location: index.php?panel=client&tab=recharge_invoice&id=" . $log_id);
                } else {
                    header("Location: index.php");
                }
                exit;

            }
        }
    }
    header("Location: index.php");
    exit;
}

// SSLCOMMERZ Callback Flow
if (isset($_GET['sslcz_callback'])) {
    $status = $_POST['status'] ?? '';
    $val_id = $_POST['val_id'] ?? '';
    $trxID = $_POST['tran_id'] ?? $_GET['trxID'] ?? '';

    if ($status === 'FAILED' || $status === 'CANCELLED') {
        header("Location: index.php");
        exit;
    } elseif (($status === 'VALID' || $status === 'VALIDATED' || $status === 'SUCCESS') && $val_id) {
        $manager_id = 0;
        if ($trxID) {
            $chk_init = $pdo->prepare("SELECT staff_id FROM ".TBL_ONLINE_PAY." WHERE trx_id=?");
            $chk_init->execute([$trxID]);
            $init_row = $chk_init->fetch();
            if ($init_row && $init_row['staff_id'] > 0) {
                $chk_mgr = $pdo->prepare("SELECT manager_id FROM ".TBL_USERS." WHERE id=?");
                $chk_mgr->execute([$init_row['staff_id']]);
                $mgr_row = $chk_mgr->fetch();
                if ($mgr_row) {
                    $manager_id = $mgr_row['manager_id'];
                } else {
                    $chk_staff = $pdo->prepare("SELECT parent_id FROM ".TBL_STAFF." WHERE id=?");
                    $chk_staff->execute([$init_row['staff_id']]);
                    $staff_row = $chk_staff->fetch();
                    if ($staff_row) {
                        $manager_id = $staff_row['parent_id'];
                    }
                }
            }
        }

        $gwConfig = get_gateway_credentials($pdo, $manager_id);
        $is_sandbox = ($gwConfig['sslcz_sandbox'] ?? '0') == '1';
        $store_id = $gwConfig['sslcz_store_id'] ?? '';
        $store_passwd = $gwConfig['sslcz_store_passwd'] ?? '';

        require_once __DIR__ . '/../classes/SSLCommerzGateway.php';
        $sslcz = new SSLCommerzGateway($store_id, $store_passwd, $is_sandbox);

        $valResp = $sslcz->validatePayment($val_id);
        
        if (isset($valResp['status']) && ($valResp['status'] === 'VALID' || $valResp['status'] === 'VALIDATED')) {
            $amount = floatval($valResp['amount']);
            $trxID_actual = $valResp['tran_id'];

            $chk = $pdo->prepare("SELECT id, status, amount, trx_id, staff_id FROM ".TBL_ONLINE_PAY." WHERE trx_id=?");
            $chk->execute([$trxID_actual]);
            $existing = $chk->fetch();

            if ($existing && ($existing['status'] == 'COMPLETED' || $existing['status'] == 'Success')) {
                header("Location: index.php");
                exit;
            }

            if ($existing) {
                $user_id = intval($existing['staff_id']);
                
                if ($user_id > 0) {
                    $stmt = $pdo->prepare("UPDATE ".TBL_ONLINE_PAY." SET status='COMPLETED', payment_id=?, gateway_response=? WHERE id=? AND status != 'COMPLETED'");
                    $stmt->execute([$val_id, json_encode($valResp), $existing['id']]);
                    if ($stmt->rowCount() === 0) {
                        safe_log('payment_security', "Blocked concurrent SSLCOMMERZ callback for ID: " . $existing['id']);
                        header("Location: index.php");
                        exit;
                    }

                    $log_id = processOnlinePaymentSuccess($pdo, $user_id, $amount, 'SSLCOMMERZ', $valResp);

                    if (isset($_SESSION['client_logged_in']) && $_SESSION['client_logged_in'] === true && is_numeric($log_id)) {
                        header("Location: index.php?panel=client&tab=recharge_invoice&id=" . $log_id);
                    } else {
                        header("Location: index.php");
                    }
                    exit;
                }
            }
        }
    }
    header("Location: index.php");
    exit;
} elseif ($action == 'cancel') {
    header("Location: index.php");
    exit;
}

http_response_code(400); exit("Unknown Status");
