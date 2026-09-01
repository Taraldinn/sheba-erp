<?php
require_once __DIR__ . '/../classes/SmsParserService.php';

$test_cases = [
    'Upay (Payment Received)' => [
        'sms' => 'Payment Received Amount: Tk 400.00 from 01311223344. TrxID: UPAYPY1.',
        'exp_trx' => 'UPAYPY1', 'exp_amt' => 400.00, 'exp_sender' => '01311223344'
    ],
    'Upay (User new SMS)' => [
        'sms' => 'You have received Tk 500 in your upay account from 01881469088. TrxID: AkfR2351ck. Current Balance: Tk 2000.',
        'exp_trx' => 'AkfR2351ck', 'exp_amt' => 500.00, 'exp_sender' => '01881469088'
    ],
];

echo "Testing CURRENT Upay parsing inside classes/SmsParserService.php:\n";
foreach ($test_cases as $name => $tc) {
    $res = SmsParserService::parse('upay', $tc['sms']);
    if ($res && strtolower($res['trx_id']) === strtolower($tc['exp_trx']) && $res['amount'] === $tc['exp_amt'] && $res['sender'] === $tc['exp_sender']) {
        echo "[PASS] $name parsed correctly: TrxID={$res['trx_id']}, Amt={$res['amount']}, Sender={$res['sender']}\n";
    } else {
        echo "[FAIL] $name failed to parse correctly!\n";
        echo "   Expected: TrxID={$tc['exp_trx']}, Amt={$tc['exp_amt']}, Sender={$tc['exp_sender']}\n";
        echo "   Got: " . print_r($res, true) . "\n";
    }
}
