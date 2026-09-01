<?php
require_once __DIR__ . '/../classes/SmsParserService.php';

$test_cases = [
    'Rocket (Cash In)' => [
        'sms' => 'Rocket Cash In: Tk 600.00 from 01611223344 received. TxID: ROCKETCI1.',
        'exp_trx' => 'ROCKETCI1', 'exp_amt' => 600.00, 'exp_sender' => '01611223344'
    ],
    'Rocket (Received)' => [
        'sms' => 'You have received Tk 800.00 from 01777222333. TxID: ROCKETRC2.',
        'exp_trx' => 'ROCKETRC2', 'exp_amt' => 800.00, 'exp_sender' => '01777222333'
    ],
    'Rocket (User new SMS)' => [
        'sms' => 'You have received Tk 500 from 01881469088. Fee Tk 10. Balance Tk 1950. TrxID Vsfe32531c at 14/06/2026 05:26 PM.',
        'exp_trx' => 'Vsfe32531c', 'exp_amt' => 500.00, 'exp_sender' => '01881469088'
    ],
];

echo "Testing CURRENT Rocket parsing inside classes/SmsParserService.php:\n";
foreach ($test_cases as $name => $tc) {
    $res = SmsParserService::parse('rocket', $tc['sms']);
    if ($res && strtolower($res['trx_id']) === strtolower($tc['exp_trx']) && $res['amount'] === $tc['exp_amt'] && $res['sender'] === $tc['exp_sender']) {
        echo "[PASS] $name parsed correctly: TrxID={$res['trx_id']}, Amt={$res['amount']}, Sender={$res['sender']}\n";
    } else {
        echo "[FAIL] $name failed to parse correctly!\n";
        echo "   Expected: TrxID={$tc['exp_trx']}, Amt={$tc['exp_amt']}, Sender={$tc['exp_sender']}\n";
        echo "   Got: " . print_r($res, true) . "\n";
    }
}
