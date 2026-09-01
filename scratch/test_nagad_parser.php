<?php
require_once __DIR__ . '/../classes/SmsParserService.php';

$test_cases = [
    'User Nagad SMS (Failed)' => [
        'gw' => 'Nagad',
        'sms' => 'Money Received. Amount: Tk 10.00 Sender: 01837804443 Ref: N/A TxnID: 75ILKMDX Balance: Tk 936.45 14/06/2026 23:10',
        'exp_trx' => '75ILKMDX', 'exp_amt' => 10.00, 'exp_sender' => '01837804443', 'exp_ref' => 'N'
    ],
    'Nagad (Payment Received)' => [
        'gw' => 'Nagad',
        'sms' => 'Payment Received! Amount: Tk 350.00 Customer: 01811223344 TxnID: NAGADPY1.',
        'exp_trx' => 'NAGADPY1', 'exp_amt' => 350.00, 'exp_sender' => '01811223344', 'exp_ref' => null
    ],
    'Nagad (Cash In)' => [
        'gw' => 'Nagad',
        'sms' => 'Cash In Received! Amount: Tk 750.00 Sender: 01511223344 TxnID: NAGADCI2.',
        'exp_trx' => 'NAGADCI2', 'exp_amt' => 750.00, 'exp_sender' => '01511223344', 'exp_ref' => null
    ],
];

echo "Testing CURRENT parsing logic in classes/SmsParserService.php:\n";
foreach ($test_cases as $name => $tc) {
    $res = SmsParserService::parse($tc['gw'], $tc['sms']);
    if ($res) {
        echo "[PASS] $name parsed successfully:\n";
        echo "   TrxID: {$res['trx_id']} (Expected: {$tc['exp_trx']})\n";
        echo "   Amount: {$res['amount']} (Expected: {$tc['exp_amt']})\n";
        echo "   Sender: {$res['sender']} (Expected: {$tc['exp_sender']})\n";
        echo "   Ref: " . ($res['reference_id'] ?? 'NULL') . " (Expected: " . ($tc['exp_ref'] ?? 'NULL') . ")\n";
    } else {
        echo "[FAIL] $name failed to parse!\n";
    }
    echo "\n";
}
