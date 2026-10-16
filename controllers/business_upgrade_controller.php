<?php
require_once __DIR__ . '/../includes/business_upgrade.php';

$bu_tab = $_GET['tab'] ?? '';
$bu_user_id = (int)($_SESSION['admin_id'] ?? 0);
$bu_username = $_SESSION['admin_username'] ?? 'System';

function bu_redirect(string $tab, string $message = '', string $type = 'success'): void {
    if ($message !== '') $_SESSION['bu_flash'] = ['type' => $type, 'message' => $message];
    header('Location: ?tab=' . rawurlencode($tab));
    exit;
}

function bu_require_access(string $permission): void {
    if (!hasRole('Admin') && !hasPermission($permission)) {
        http_response_code(403);
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            throw new RuntimeException('Access denied for this module.');
        }
        echo "<div class='container mt-4'><div class='alert alert-danger'>Access denied for this module.</div></div>";
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['bu_action'])) {
    try {
        bu_verify_csrf();
        $a = (string)$_POST['bu_action'];

        // BW CLIENTS
        if ($a === 'bw_save_client') {
            bu_require_access('bw_clients');
            $id = (int)($_POST['id'] ?? 0);
            $code = trim((string)($_POST['client_code'] ?? ''));
            $name = trim((string)($_POST['name'] ?? ''));
            if ($code === '' || $name === '') throw new RuntimeException('Client code and name are required.');
            $bw = max(0, (float)($_POST['bandwidth_mbps'] ?? 0));
            $rate = max(0, (float)($_POST['rate_per_mbps'] ?? 0));
            $monthly = (float)($_POST['monthly_charge'] ?? 0);
            if ($monthly <= 0) $monthly = round($bw * $rate, 2);
            $data = [
                $code, $name, trim((string)($_POST['company_name'] ?? '')), trim((string)($_POST['contact_person'] ?? '')),
                trim((string)($_POST['phone'] ?? '')), trim((string)($_POST['email'] ?? '')), trim((string)($_POST['address'] ?? '')),
                $bw, $rate, $monthly, trim((string)($_POST['connection_type'] ?? 'Dedicated Internet')),
                trim((string)($_POST['upstream_provider'] ?? '')), trim((string)($_POST['circuit_id'] ?? '')),
                trim((string)($_POST['ip_block'] ?? '')), trim((string)($_POST['vlan_id'] ?? '')),
                max(1, min(28, (int)($_POST['billing_day'] ?? 1))),
                in_array($_POST['status'] ?? 'Active', ['Active','Suspended','Inactive','Closed'], true) ? $_POST['status'] : 'Active',
                $bu_user_id, trim((string)($_POST['notes'] ?? ''))
            ];
            if ($id > 0) {
                $sql = "UPDATE ".TBL_BW_CLIENTS." SET client_code=?,name=?,company_name=?,contact_person=?,phone=?,email=?,address=?,bandwidth_mbps=?,rate_per_mbps=?,monthly_charge=?,connection_type=?,upstream_provider=?,circuit_id=?,ip_block=?,vlan_id=?,billing_day=?,status=?,manager_id=?,notes=? WHERE id=?";
                $data[] = $id;
                $pdo->prepare($sql)->execute($data);
                writeLog($pdo, $bu_username, 'BW Client Update', $id, "Updated BW client {$code}");
            } else {
                $sql = "INSERT INTO ".TBL_BW_CLIENTS." (client_code,name,company_name,contact_person,phone,email,address,bandwidth_mbps,rate_per_mbps,monthly_charge,connection_type,upstream_provider,circuit_id,ip_block,vlan_id,billing_day,status,manager_id,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
                $pdo->prepare($sql)->execute($data);
                $id = (int)$pdo->lastInsertId();
                writeLog($pdo, $bu_username, 'BW Client Create', $id, "Created BW client {$code}");
            }
            bu_redirect('bw_clients', 'Bandwidth client saved successfully.');
        }

        if ($a === 'bw_create_invoice') {
            bu_require_access('bw_clients');
            $clientId = (int)($_POST['client_id'] ?? 0);
            $client = safeFetch($pdo, "SELECT * FROM ".TBL_BW_CLIENTS." WHERE id=?", [$clientId]);
            if (!$client) throw new RuntimeException('BW client not found.');
            $month = preg_match('/^\d{4}-\d{2}$/', $_POST['billing_month'] ?? '') ? $_POST['billing_month'] : date('Y-m');
            $existingInvoice = safeFetch($pdo, "SELECT id,invoice_no FROM ".TBL_BW_INVOICES." WHERE client_id=? AND billing_month=? LIMIT 1", [$clientId,$month]);
            if ($existingInvoice) throw new RuntimeException('An invoice already exists for this client/month: ' . $existingInvoice['invoice_no']);
            $date = $_POST['invoice_date'] ?? date('Y-m-d');
            $due = $_POST['due_date'] ?? date('Y-m-d', strtotime('+7 days'));
            $bw = max(0, (float)($_POST['bandwidth_mbps'] ?? $client['bandwidth_mbps']));
            $rate = max(0, (float)($_POST['rate_per_mbps'] ?? $client['rate_per_mbps']));
            $subtotal = max(0, (float)($_POST['subtotal'] ?? 0));
            if ($subtotal <= 0) $subtotal = !empty($client['monthly_charge']) ? (float)$client['monthly_charge'] : round($bw*$rate, 2);
            $vat = max(0, min(100, (float)($_POST['vat_percent'] ?? 0)));
            $vatAmount = round($subtotal*$vat/100,2);
            $total = round($subtotal+$vatAmount,2);
            $invoiceNo = 'BW-' . date('Ym') . '-' . str_pad((string)$clientId, 5, '0', STR_PAD_LEFT) . '-' . substr(md5($month.$clientId),0,4);
            $pdo->prepare("INSERT INTO ".TBL_BW_INVOICES." (invoice_no,client_id,billing_month,invoice_date,due_date,bandwidth_mbps,rate_per_mbps,subtotal,vat_percent,vat_amount,total_amount,due_amount,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'Unpaid',?,?)")
                ->execute([$invoiceNo,$clientId,$month,$date,$due,$bw,$rate,$subtotal,$vat,$vatAmount,$total,$total,trim((string)($_POST['notes'] ?? '')),$bu_user_id]);
            writeLog($pdo, $bu_username, 'BW Invoice Create', $clientId, "Created {$invoiceNo} total {$total}");
            bu_redirect('bw_clients', 'BW invoice created: ' . $invoiceNo);
        }

        if ($a === 'bw_payment') {
            bu_require_access('bw_clients');
            $invoiceId = (int)($_POST['invoice_id'] ?? 0);
            $amount = max(0, (float)($_POST['amount'] ?? 0));
            $pdo->beginTransaction();
            $inv = safeFetch($pdo, "SELECT * FROM ".TBL_BW_INVOICES." WHERE id=? FOR UPDATE", [$invoiceId]);
            if (!$inv) throw new RuntimeException('Invoice not found.');
            if ($amount <= 0 || $amount > (float)$inv['due_amount'] + 0.009) throw new RuntimeException('Payment amount is invalid or exceeds invoice due.');
            $pdo->prepare("INSERT INTO ".TBL_BW_PAYMENTS." (invoice_id,client_id,amount,method,trx_id,payment_date,received_by,notes) VALUES (?,?,?,?,?,?,?,?)")
                ->execute([$invoiceId,$inv['client_id'],$amount,trim((string)($_POST['method'] ?? 'Cash')),trim((string)($_POST['trx_id'] ?? '')),($_POST['payment_date'] ?? date('Y-m-d')),$bu_user_id,trim((string)($_POST['notes'] ?? ''))]);
            $paid = round((float)$inv['paid_amount']+$amount,2);
            $due = max(0, round((float)$inv['total_amount']-$paid,2));
            $status = $due <= 0.009 ? 'Paid' : 'Partial';
            $pdo->prepare("UPDATE ".TBL_BW_INVOICES." SET paid_amount=?,due_amount=?,status=? WHERE id=?")->execute([$paid,$due,$status,$invoiceId]);
            log_finance($pdo, 'Income', $amount, trim((string)($_POST['method'] ?? 'Cash')), 'BW Client Collection', (int)$inv['client_id'], 'Bandwidth client invoice payment: '.$inv['invoice_no']);
            $pdo->commit();
            writeLog($pdo, $bu_username, 'BW Invoice Payment', $invoiceId, "Collected {$amount} for {$inv['invoice_no']}");
            bu_redirect('bw_clients', 'Payment received successfully.');
        }

        // COMMUNICATION HUB
        if ($a === 'comm_save_settings') {
            bu_require_access('communication_hub');
            $waInput = trim((string)($_POST['wa_access_token'] ?? ''));
            $tgInput = trim((string)($_POST['tg_bot_token'] ?? ''));
            $waStored = get_opt($pdo, 'comm_whatsapp_access_token', '');
            $tgStored = get_opt($pdo, 'comm_telegram_bot_token', '');
            $settings = [
                'comm_whatsapp_enabled' => isset($_POST['wa_enabled']) ? '1' : '0',
                'comm_whatsapp_phone_number_id' => trim((string)($_POST['wa_phone_number_id'] ?? '')),
                'comm_whatsapp_access_token' => $waInput !== '' ? encrypt_app_secret($waInput) : $waStored,
                'comm_whatsapp_graph_version' => trim((string)($_POST['wa_graph_version'] ?? 'v26.0')),
                'comm_telegram_enabled' => isset($_POST['tg_enabled']) ? '1' : '0',
                'comm_telegram_bot_token' => $tgInput !== '' ? encrypt_app_secret($tgInput) : $tgStored,
                'comm_telegram_default_chat_id' => trim((string)($_POST['tg_default_chat_id'] ?? '')),
            ];
            foreach ($settings as $k=>$v) set_opt($pdo,$k,$v);
            writeLog($pdo,$bu_username,'Communication Settings',0,'Updated WhatsApp/Telegram settings');
            bu_redirect('communication_hub','Communication settings saved.');
        }

        if ($a === 'comm_template_save') {
            bu_require_access('communication_hub');
            $channel = in_array($_POST['channel'] ?? '', ['WhatsApp','Telegram'], true) ? $_POST['channel'] : 'WhatsApp';
            $name = trim((string)($_POST['name'] ?? ''));
            $message = trim((string)($_POST['message_text'] ?? ''));
            if ($name==='' || $message==='') throw new RuntimeException('Template name and message are required.');
            $pdo->prepare("INSERT INTO ".TBL_COMM_TEMPLATES." (channel,name,message_text,provider_template_name,language_code,status,created_by) VALUES (?,?,?,?,?,'Active',?)")
                ->execute([$channel,$name,$message,trim((string)($_POST['provider_template_name'] ?? '')),trim((string)($_POST['language_code'] ?? 'en_US')),$bu_user_id]);
            bu_redirect('communication_hub','Message template added.');
        }

        if ($a === 'comm_queue_message') {
            bu_require_access('communication_hub');
            $channel = in_array($_POST['channel'] ?? '', ['WhatsApp','Telegram'], true) ? $_POST['channel'] : 'WhatsApp';
            $recipient = trim((string)($_POST['recipient'] ?? ''));
            $templateId = (int)($_POST['template_id'] ?? 0);
            $message = trim((string)($_POST['message_text'] ?? ''));
            if ($recipient === '') throw new RuntimeException('Recipient is required.');
            if ($message === '' && $templateId <= 0) throw new RuntimeException('Message or template is required.');
            $scheduled = trim((string)($_POST['scheduled_at'] ?? ''));
            if ($scheduled === '') $scheduled = date('Y-m-d H:i:s'); else $scheduled = date('Y-m-d H:i:s', strtotime($scheduled));
            $pdo->prepare("INSERT INTO ".TBL_COMM_QUEUE." (channel,recipient,template_id,message_text,status,scheduled_at,created_by) VALUES (?,?,?,?, 'Pending',?,?)")
                ->execute([$channel,$recipient,$templateId ?: null,$message,$scheduled,$bu_user_id]);
            bu_redirect('communication_hub','Message queued successfully.');
        }

        if ($a === 'comm_queue_bulk') {
            if (!hasRole('Admin')) throw new RuntimeException('Bulk customer campaigns require Admin access.');
            $filter = in_array($_POST['client_filter'] ?? 'Active', ['Active','Due','Expired','All'], true) ? $_POST['client_filter'] : 'Active';
            $templateId = (int)($_POST['template_id'] ?? 0);
            $custom = trim((string)($_POST['message_text'] ?? ''));
            $template = $templateId > 0 ? safeFetch($pdo, "SELECT * FROM ".TBL_COMM_TEMPLATES." WHERE id=? AND channel='WhatsApp'", [$templateId]) : null;
            $base = $custom !== '' ? $custom : (string)($template['message_text'] ?? '');
            if ($base === '' && !$template) throw new RuntimeException('Choose a WhatsApp template or enter a message.');
            $where = "phone IS NOT NULL AND TRIM(phone)<>''";
            if ($filter === 'Active') $where .= " AND status IN ('Active','Free','Promise Active')";
            elseif ($filter === 'Due') $where .= " AND due>0";
            elseif ($filter === 'Expired') $where .= " AND (status='Expire' OR current_bill_date<CURDATE())";
            $clients = safeFetchAll($pdo, "SELECT id,name,user_id,phone,current_bill_date,due FROM ".TBL_USERS." WHERE {$where} ORDER BY id LIMIT 5000");
            if (!$clients) throw new RuntimeException('No matching clients with phone numbers found.');
            $scheduled = trim((string)($_POST['scheduled_at'] ?? ''));
            $scheduled = $scheduled !== '' ? date('Y-m-d H:i:s', strtotime($scheduled)) : date('Y-m-d H:i:s');
            $stmt = $pdo->prepare("INSERT INTO ".TBL_COMM_QUEUE." (channel,recipient,customer_id,template_id,message_text,status,scheduled_at,created_by) VALUES ('WhatsApp',?,?,?,?, 'Pending',?,?)");
            $count=0;
            foreach ($clients as $c) {
                $personal = str_replace(['[NAME]','[ID]','[DATE]','[DUE]'], [$c['name'],$c['user_id'],$c['current_bill_date'] ?: 'N/A',number_format((float)$c['due'],2)], $base);
                $stmt->execute([$c['phone'],$c['id'],$templateId ?: null,$personal,$scheduled,$bu_user_id]);
                $count++;
            }
            writeLog($pdo,$bu_username,'WhatsApp Bulk Campaign',0,"Queued {$count} messages for filter {$filter}");
            bu_redirect('communication_hub', "Queued {$count} WhatsApp customer messages.");
        }

        if ($a === 'comm_process_now') {
            bu_require_access('communication_hub');
            $stats = bu_process_communication_queue($pdo, 50);
            bu_redirect('communication_hub', "Queue processed: {$stats['sent']} sent, {$stats['failed']} failed/retry.");
        }

        // EXPENSE APPROVAL
        if ($a === 'expense_request') {
            if (!hasRole('Admin') && !hasPermission('expense_requests') && !hasPermission('wallet_deposit')) throw new RuntimeException('Access denied.');
            $amount = max(0,(float)($_POST['amount'] ?? 0));
            if ($amount<=0) throw new RuntimeException('Amount must be greater than zero.');
            $pdo->prepare("INSERT INTO ".TBL_EXPENSE_REQUESTS." (requester_id,category,amount,expense_date,method,description,status) VALUES (?,?,?,?,?,?,'Pending')")
                ->execute([$bu_user_id,trim((string)($_POST['category'] ?? 'Others')),$amount,($_POST['expense_date'] ?? date('Y-m-d')),trim((string)($_POST['method'] ?? 'Cash')),trim((string)($_POST['description'] ?? ''))]);
            bu_redirect('expense_approvals','Expense request submitted for approval.');
        }

        if (in_array($a, ['expense_approve','expense_reject'], true)) {
            if (!hasRole('Admin') && !hasPermission('expense_approve')) throw new RuntimeException('Only authorized approvers can review expenses.');
            $id=(int)($_POST['id']??0);
            $pdo->beginTransaction();
            $req=safeFetch($pdo,"SELECT * FROM ".TBL_EXPENSE_REQUESTS." WHERE id=? FOR UPDATE",[$id]);
            if(!$req || $req['status']!=='Pending') throw new RuntimeException('Pending request not found.');
            if($a==='expense_reject'){
                $pdo->prepare("UPDATE ".TBL_EXPENSE_REQUESTS." SET status='Rejected',approver_id=?,approval_note=?,approved_at=NOW() WHERE id=?")
                    ->execute([$bu_user_id,trim((string)($_POST['approval_note']??'')),$id]);
                $pdo->commit();
                bu_redirect('expense_approvals','Expense request rejected.');
            }
            $pdo->prepare("INSERT INTO ".TBL_FIN_EXPENSES." (category,amount,method,description,staff_id,date) VALUES (?,?,?,?,?,?)")
                ->execute([$req['category'],$req['amount'],$req['method'],$req['description'],$req['requester_id'],$req['expense_date']]);
            $finId=(int)$pdo->lastInsertId();
            log_finance($pdo,'Expense',-(float)$req['amount'],$req['method'],$req['category'],0,$req['description']);
            $pdo->prepare("UPDATE ".TBL_EXPENSE_REQUESTS." SET status='Approved',approver_id=?,approval_note=?,approved_at=NOW(),finance_expense_id=? WHERE id=?")
                ->execute([$bu_user_id,trim((string)($_POST['approval_note']??'')),$finId,$id]);
            $pdo->commit();
            bu_redirect('expense_approvals','Expense approved and posted to Finance.');
        }

        // BANK / VENDOR
        if ($a === 'bank_add') {
            bu_require_access('bank_vendor');
            $name=trim((string)($_POST['account_name']??''));
            if($name==='') throw new RuntimeException('Account name is required.');
            $open=(float)($_POST['opening_balance']??0);
            $pdo->prepare("INSERT INTO ".TBL_BANK_ACCOUNTS." (account_name,bank_name,branch_name,account_number,account_type,opening_balance,current_balance,status,notes) VALUES (?,?,?,?,?,?,?,'Active',?)")
                ->execute([$name,trim((string)($_POST['bank_name']??'')),trim((string)($_POST['branch_name']??'')),trim((string)($_POST['account_number']??'')),trim((string)($_POST['account_type']??'Bank')),$open,$open,trim((string)($_POST['notes']??''))]);
            bu_redirect('bank_vendor','Bank/MFS account added.');
        }

        if ($a === 'bank_transaction') {
            bu_require_access('bank_vendor');
            $id=(int)($_POST['bank_account_id']??0); $amount=max(0,(float)($_POST['amount']??0));
            $type=in_array($_POST['tx_type']??'', ['Deposit','Withdraw'], true)?$_POST['tx_type']:'Deposit';
            $pdo->beginTransaction();
            $acct=safeFetch($pdo,"SELECT * FROM ".TBL_BANK_ACCOUNTS." WHERE id=? FOR UPDATE",[$id]);
            if(!$acct || $amount<=0) throw new RuntimeException('Invalid account/amount.');
            $new=(float)$acct['current_balance']+($type==='Deposit'?$amount:-$amount);
            if($new<0) throw new RuntimeException('Insufficient account balance.');
            $pdo->prepare("UPDATE ".TBL_BANK_ACCOUNTS." SET current_balance=? WHERE id=?")->execute([$new,$id]);
            $pdo->prepare("INSERT INTO ".TBL_BANK_TRANSACTIONS." (bank_account_id,tx_type,amount,trx_id,description,balance_after,transaction_date,created_by) VALUES (?,?,?,?,?,?,?,?)")
                ->execute([$id,$type,$amount,trim((string)($_POST['trx_id']??'')),trim((string)($_POST['description']??'')),$new,($_POST['transaction_date']??date('Y-m-d H:i:s')),$bu_user_id]);
            $pdo->commit();
            bu_redirect('bank_vendor','Bank transaction posted.');
        }

        if ($a === 'bank_transfer') {
            bu_require_access('bank_vendor');
            $from=(int)($_POST['from_account']??0); $to=(int)($_POST['to_account']??0); $amount=max(0,(float)($_POST['amount']??0));
            if($from===$to || $amount<=0) throw new RuntimeException('Choose different accounts and a valid amount.');
            $pdo->beginTransaction();
            $ids=[$from,$to]; sort($ids, SORT_NUMERIC);
            $locked=safeFetchAll($pdo,"SELECT * FROM ".TBL_BANK_ACCOUNTS." WHERE id IN (?,?) ORDER BY id FOR UPDATE",$ids);
            $byId=[]; foreach($locked as $row) $byId[(int)$row['id']]=$row;
            $fa=$byId[$from]??null; $ta=$byId[$to]??null;
            if(!$fa||!$ta||(float)$fa['current_balance']<$amount) throw new RuntimeException('Invalid accounts or insufficient balance.');
            $fb=(float)$fa['current_balance']-$amount; $tb=(float)$ta['current_balance']+$amount;
            $pdo->prepare("UPDATE ".TBL_BANK_ACCOUNTS." SET current_balance=? WHERE id=?")->execute([$fb,$from]);
            $pdo->prepare("UPDATE ".TBL_BANK_ACCOUNTS." SET current_balance=? WHERE id=?")->execute([$tb,$to]);
            $ref='TRF-'.date('YmdHis').'-'.$from.'-'.$to;
            $st=$pdo->prepare("INSERT INTO ".TBL_BANK_TRANSACTIONS." (bank_account_id,tx_type,amount,reference_type,trx_id,description,balance_after,transaction_date,created_by) VALUES (?,?,?,?,?,?,?,?,?)");
            $st->execute([$from,'Transfer Out',$amount,'Transfer',$ref,'Transfer to '.$ta['account_name'],$fb,date('Y-m-d H:i:s'),$bu_user_id]);
            $st->execute([$to,'Transfer In',$amount,'Transfer',$ref,'Transfer from '.$fa['account_name'],$tb,date('Y-m-d H:i:s'),$bu_user_id]);
            $pdo->commit();
            bu_redirect('bank_vendor','Fund transferred successfully.');
        }

        if ($a === 'vendor_add') {
            bu_require_access('bank_vendor');
            $code=trim((string)($_POST['vendor_code']??'')); $name=trim((string)($_POST['name']??''));
            if($code===''||$name==='') throw new RuntimeException('Vendor code and name are required.');
            $pdo->prepare("INSERT INTO ".TBL_VENDORS." (vendor_code,name,contact_person,phone,email,address,vendor_type,opening_due,status,notes) VALUES (?,?,?,?,?,?,?,?, 'Active',?)")
                ->execute([$code,$name,trim((string)($_POST['contact_person']??'')),trim((string)($_POST['phone']??'')),trim((string)($_POST['email']??'')),trim((string)($_POST['address']??'')),trim((string)($_POST['vendor_type']??'General')),(float)($_POST['opening_due']??0),trim((string)($_POST['notes']??''))]);
            bu_redirect('bank_vendor','Vendor added.');
        }

        if ($a === 'vendor_bill') {
            bu_require_access('bank_vendor');
            $vendorId=(int)($_POST['vendor_id']??0); $amount=max(0,(float)($_POST['amount']??0));
            if($vendorId<=0||$amount<=0) throw new RuntimeException('Vendor and amount are required.');
            $pdo->prepare("INSERT INTO ".TBL_VENDOR_BILLS." (vendor_id,bill_no,bill_date,due_date,category,amount,due_amount,status,description,created_by) VALUES (?,?,?,?,?,?,?,'Due',?,?)")
                ->execute([$vendorId,trim((string)($_POST['bill_no']??('VB-'.date('YmdHis')))),($_POST['bill_date']??date('Y-m-d')),($_POST['due_date']?:null),trim((string)($_POST['category']??'')),$amount,$amount,trim((string)($_POST['description']??'')),$bu_user_id]);
            bu_redirect('bank_vendor','Vendor bill recorded.');
        }

        if ($a === 'vendor_payment') {
            bu_require_access('bank_vendor');
            $billId=(int)($_POST['vendor_bill_id']??0); $bankId=(int)($_POST['bank_account_id']??0); $amount=max(0,(float)($_POST['amount']??0));
            $pdo->beginTransaction();
            $bill=safeFetch($pdo,"SELECT * FROM ".TBL_VENDOR_BILLS." WHERE id=? FOR UPDATE",[$billId]);
            $bank=safeFetch($pdo,"SELECT * FROM ".TBL_BANK_ACCOUNTS." WHERE id=? FOR UPDATE",[$bankId]);
            if(!$bill||!$bank||$amount<=0||$amount>(float)$bill['due_amount']+0.009||(float)$bank['current_balance']<$amount) throw new RuntimeException('Invalid payment, due or bank balance.');
            $vendor=safeFetch($pdo,"SELECT name FROM ".TBL_VENDORS." WHERE id=?",[(int)$bill['vendor_id']]);
            $bill['vendor_name']=$vendor['name']??('Vendor #'.$bill['vendor_id']);
            $newBal=(float)$bank['current_balance']-$amount;
            $newPaid=(float)$bill['paid_amount']+$amount; $newDue=max(0,(float)$bill['amount']-$newPaid); $status=$newDue<=0.009?'Paid':'Partial';
            $pdo->prepare("UPDATE ".TBL_BANK_ACCOUNTS." SET current_balance=? WHERE id=?")->execute([$newBal,$bankId]);
            $pdo->prepare("UPDATE ".TBL_VENDOR_BILLS." SET paid_amount=?,due_amount=?,status=? WHERE id=?")->execute([$newPaid,$newDue,$status,$billId]);
            $pdo->prepare("INSERT INTO ".TBL_VENDOR_PAYMENTS." (vendor_id,vendor_bill_id,bank_account_id,amount,method,trx_id,payment_date,notes,paid_by) VALUES (?,?,?,?,?,?,?,?,?)")
                ->execute([$bill['vendor_id'],$billId,$bankId,$amount,trim((string)($_POST['method']??'Bank')),trim((string)($_POST['trx_id']??'')),($_POST['payment_date']??date('Y-m-d')),trim((string)($_POST['notes']??'')),$bu_user_id]);
            $pdo->prepare("INSERT INTO ".TBL_BANK_TRANSACTIONS." (bank_account_id,tx_type,amount,reference_type,reference_id,trx_id,description,balance_after,transaction_date,created_by) VALUES (?, 'Vendor Payment',?,'Vendor Bill',?,?,?,?,NOW(),?)")
                ->execute([$bankId,$amount,$billId,trim((string)($_POST['trx_id']??'')),'Vendor payment: '.$bill['vendor_name'].' / '.$bill['bill_no'],$newBal,$bu_user_id]);
            log_finance($pdo,'Expense',-$amount,'Bank','Vendor Payment',(int)$bill['vendor_id'],'Vendor payment: '.$bill['vendor_name'].' / '.$bill['bill_no']);
            $pdo->commit();
            bu_redirect('bank_vendor','Vendor payment posted.');
        }

        // SCHEDULED ACTIONS
        if ($a === 'schedule_client_action') {
            bu_require_access('scheduled_actions');
            $clientId=(int)($_POST['client_id']??0); $client=safeFetch($pdo,"SELECT * FROM ".TBL_USERS." WHERE id=?",[$clientId]);
            if(!$client) throw new RuntimeException('Client not found.');
            $type=in_array($_POST['action_type']??'', ['Status Change','Package Change','Line Shift'], true)?$_POST['action_type']:'Status Change';
            $payload=[];
            if($type==='Status Change') {
                $targetStatus=trim((string)($_POST['target_status']??'Inactive'));
                if(!in_array($targetStatus,['Active','Free','Promise Active','Inactive','Expire','Left'],true)) throw new RuntimeException('Invalid target status.');
                $payload=['status'=>$targetStatus];
            } elseif($type==='Package Change') {
                $targetPackage=trim((string)($_POST['target_package']??''));
                if($targetPackage==='' || !safeFetch($pdo, "SELECT id FROM ".TBL_SERVICES." WHERE name=? LIMIT 1", [$targetPackage])) throw new RuntimeException('Choose a valid target package.');
                $payload=['package'=>$targetPackage];
            } else {
                $targetRouter=(int)($_POST['target_router_id']??0); $targetZone=(int)($_POST['target_zone_id']??0);
                if($targetRouter<0 || $targetZone<0) throw new RuntimeException('Invalid router or zone.');
                if($targetRouter>0 && !safeFetch($pdo, "SELECT id FROM ".TBL_ROUTERS." WHERE id=?", [$targetRouter])) throw new RuntimeException('Target router not found.');
                if($targetZone>0 && !safeFetch($pdo, "SELECT id FROM ".TBL_ZONES." WHERE id=?", [$targetZone])) throw new RuntimeException('Target zone not found.');
                $payload=['router_id'=>$targetRouter,'zone_id'=>$targetZone,'tj_box_name'=>trim((string)($_POST['target_tj_box_name']??''))];
            }
            $scheduled=trim((string)($_POST['scheduled_at']??''));
            if($scheduled===''||strtotime($scheduled)===false) throw new RuntimeException('Valid schedule date/time is required.');
            $pdo->prepare("INSERT INTO ".TBL_SCHEDULED_CLIENT_ACTIONS." (client_id,action_type,action_payload,scheduled_at,status,created_by) VALUES (?,?,?,?,'Pending',?)")
                ->execute([$clientId,$type,json_encode($payload,JSON_UNESCAPED_UNICODE),date('Y-m-d H:i:s',strtotime($scheduled)),$bu_user_id]);
            bu_redirect('scheduled_actions','Client action scheduled.');
        }

        if ($a === 'cancel_scheduled_action') {
            bu_require_access('scheduled_actions');
            $id=(int)($_POST['id']??0);
            $pdo->prepare("UPDATE ".TBL_SCHEDULED_CLIENT_ACTIONS." SET status='Cancelled' WHERE id=? AND status='Pending'")->execute([$id]);
            bu_redirect('scheduled_actions','Scheduled action cancelled.');
        }

        if ($a === 'run_scheduled_actions') {
            bu_require_access('scheduled_actions');
            $st=bu_process_scheduled_actions($pdo,100);
            bu_redirect('scheduled_actions',"Processed {$st['processed']}; completed {$st['completed']}; failed {$st['failed']}.");
        }

        // CRON RUN NOW
        if ($a === 'cron_run_now') {
            if (!hasRole('Admin')) throw new RuntimeException('Admin access required.');
            $job=basename((string)($_POST['job']??'')); $registry=bu_cron_registry();
            if(!isset($registry[$job])) throw new RuntimeException('Unknown cron job.');
            $script=realpath(__DIR__.'/../cron/'.$job); if(!$script) throw new RuntimeException('Cron script not found.');
            $tenant=defined('CURRENT_TENANT')?CURRENT_TENANT:'main';
            $cmd=escapeshellarg(PHP_BINARY).' '.escapeshellarg($script).($tenant!=='main'?' --tenant='.escapeshellarg($tenant):'').' 2>&1';
            $start=microtime(true); $output=''; $code=0;
            if(function_exists('exec')){ $lines=[]; exec($cmd,$lines,$code); $output=implode("\n",$lines); }
            elseif(function_exists('shell_exec')){ $output=(string)shell_exec($cmd); $code=0; }
            else throw new RuntimeException('exec/shell_exec is disabled on this server.');
            bu_write_cron_state($tenant,$job,['status'=>$code===0?'success':'failed','started_at'=>date('c',(int)$start),'finished_at'=>date('c'),'duration_ms'=>(int)((microtime(true)-$start)*1000),'exit_code'=>$code,'output'=>substr($output,-4000)]);
            bu_redirect('cron_dashboard',$job.' executed with exit code '.$code, $code===0?'success':'danger');
        }

    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $tab = in_array($bu_tab, ['bw_clients','communication_hub','expense_approvals','bank_vendor','scheduled_actions','cron_dashboard'], true) ? $bu_tab : 'dashboard';
        bu_redirect($tab, $e->getMessage(), 'danger');
    }
}

// DATA LOAD FOR CURRENT VIEW
$bu_flash = $_SESSION['bu_flash'] ?? null;
unset($_SESSION['bu_flash']);

if ($bu_tab === 'bw_clients') {
    bu_require_access('bw_clients');
    $bw_clients = safeFetchAll($pdo, "SELECT * FROM ".TBL_BW_CLIENTS." ORDER BY id DESC");
    $bw_invoices = safeFetchAll($pdo, "SELECT i.*,c.client_code,c.name client_name FROM ".TBL_BW_INVOICES." i JOIN ".TBL_BW_CLIENTS." c ON c.id=i.client_id ORDER BY i.id DESC LIMIT 300");
    $bw_summary = safeFetch($pdo, "SELECT COUNT(*) total, COALESCE(SUM(bandwidth_mbps),0) total_mbps, COALESCE(SUM(monthly_charge),0) mrc FROM ".TBL_BW_CLIENTS." WHERE status='Active'") ?: ['total'=>0,'total_mbps'=>0,'mrc'=>0];
    $bw_due = (float)($pdo->query("SELECT COALESCE(SUM(due_amount),0) FROM ".TBL_BW_INVOICES." WHERE status IN ('Unpaid','Partial')")->fetchColumn() ?: 0);
}

if ($bu_tab === 'communication_hub') {
    bu_require_access('communication_hub');
    $comm_templates=safeFetchAll($pdo,"SELECT * FROM ".TBL_COMM_TEMPLATES." ORDER BY id DESC");
    $comm_queue=safeFetchAll($pdo,"SELECT q.*,t.name template_name FROM ".TBL_COMM_QUEUE." q LEFT JOIN ".TBL_COMM_TEMPLATES." t ON t.id=q.template_id ORDER BY q.id DESC LIMIT 200");
}

if ($bu_tab === 'expense_approvals') {
    if (!hasRole('Admin') && !hasPermission('expense_requests') && !hasPermission('expense_approve') && !hasPermission('wallet_deposit')) {
        http_response_code(403); echo "<div class='container mt-4'><div class='alert alert-danger'>Access denied for this module.</div></div>"; exit;
    }
    $where = (hasRole('Admin') || hasPermission('expense_approve')) ? '1=1' : 'e.requester_id='.(int)$bu_user_id;
    $expense_requests=safeFetchAll($pdo,"SELECT e.*,s.name requester_name,a.name approver_name FROM ".TBL_EXPENSE_REQUESTS." e LEFT JOIN ".TBL_STAFF." s ON s.id=e.requester_id LEFT JOIN ".TBL_STAFF." a ON a.id=e.approver_id WHERE {$where} ORDER BY e.id DESC LIMIT 300");
}

if ($bu_tab === 'bank_vendor') {
    bu_require_access('bank_vendor');
    $bank_accounts=safeFetchAll($pdo,"SELECT * FROM ".TBL_BANK_ACCOUNTS." ORDER BY status='Active' DESC,id DESC");
    $bank_transactions=safeFetchAll($pdo,"SELECT t.*,b.account_name FROM ".TBL_BANK_TRANSACTIONS." t JOIN ".TBL_BANK_ACCOUNTS." b ON b.id=t.bank_account_id ORDER BY t.id DESC LIMIT 200");
    $vendors=safeFetchAll($pdo,"SELECT * FROM ".TBL_VENDORS." ORDER BY id DESC");
    $vendor_bills=safeFetchAll($pdo,"SELECT b.*,v.name vendor_name FROM ".TBL_VENDOR_BILLS." b JOIN ".TBL_VENDORS." v ON v.id=b.vendor_id ORDER BY b.id DESC LIMIT 250");
}

if ($bu_tab === 'scheduled_actions') {
    bu_require_access('scheduled_actions');
    $schedule_clients=safeFetchAll($pdo,"SELECT id,user_id,name,user_package,status,router_id,zone_id,tj_box_name FROM ".TBL_USERS." ORDER BY id DESC LIMIT 5000");
    $schedule_services=safeFetchAll($pdo,"SELECT name,price,mikrotik_profile_name FROM ".TBL_SERVICES." ORDER BY name");
    $schedule_routers=safeFetchAll($pdo,"SELECT id,name FROM ".TBL_ROUTERS." ORDER BY name");
    $schedule_zones=safeFetchAll($pdo,"SELECT id,name FROM ".TBL_ZONES." ORDER BY name");
    $scheduled_actions=safeFetchAll($pdo,"SELECT a.*,u.user_id,u.name client_name FROM ".TBL_SCHEDULED_CLIENT_ACTIONS." a JOIN ".TBL_USERS." u ON u.id=a.client_id ORDER BY a.id DESC LIMIT 300");
}

if ($bu_tab === 'cron_dashboard') {
    if (!hasRole('Admin')) { http_response_code(403); echo "<div class='container mt-4'><div class='alert alert-danger'>Admin access required.</div></div>"; exit; }
    $cron_registry=bu_cron_registry(); $cron_tenant=defined('CURRENT_TENANT')?CURRENT_TENANT:'main'; $cron_states=[];
    foreach($cron_registry as $job=>$desc) $cron_states[$job]=bu_read_cron_state($cron_tenant,$job);
}
