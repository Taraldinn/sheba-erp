<?php
class SmsParserService {
    /**
     * Parses the SMS text from the gateway and returns structured payment info.
     * 
     * @param string $gateway The MFS gateway name (bKash, Nagad, Rocket, Upay)
     * @param string $smsText The raw SMS body text
     * @return array|null [gateway, amount, trx_id, sender] or null on failure
     */
    public static function parse($gateway, $smsText) {
        $gateway = strtolower(trim($gateway));
        $amount = 0.00;
        $trxId = '';
        $sender = '';

        switch ($gateway) {
            case 'bkash':
                // Match "You have received payment of Tk 500.00 from 01711223344. Ref Invoice12. TrxID 8K90XT51."
                // Match "You have received Tk 500.00 from 01711223344. TrxID 8K90XT51."
                // Match "You have received Tk 500.00 from 01711223344 at 10/06/2026 14:15. TrxID 8K90XT51."
                if (preg_match('/received(?:\s+payment(?:\s+of)?)?\s+Tk\s+([0-9,.]+)\s+from\s+([0-9xX*]{11,}).*?TrxID\s+([A-Z0-9]+)/is', $smsText, $m)) {
                    $amount = floatval(str_replace(',', '', $m[1]));
                    $sender = trim($m[2]);
                    $trxId = trim($m[3]);
                }
                break;

            case 'nagad':
                // Match "Payment Received! Amount: Tk 500.00 Customer: 01711223344 TxnID: 9J87Y6T5R4."
                // Match "Cash In Received! Amount: Tk 500.00 Sender: 01711223344 TxnID: 9J87Y6T5R4."
                if (preg_match('/Amount:\s*Tk\s*([0-9,.]+)\s+(?:Customer|Sender):\s*([0-9xX*]{11,}).*?(?:TxnID|TxID|TrxID):\s*([A-Z0-9]+)/is', $smsText, $m)) {
                    $amount = floatval(str_replace(',', '', $m[1]));
                    $sender = trim($m[2]);
                    $trxId = trim($m[3]);
                }
                break;

            case 'rocket':
                // Match "Rocket Cash In: Tk 500.00 from 01711223344 received. TxID: 7K89T5R4."
                // Match "You have received Tk 500.00 from 01711223344. TxID: 7K89T5R4."
                if (preg_match('/(?:Tk\s+([0-9,.]+)\s+from\s+([0-9xX*]{11,})\s+received|received\s+Tk\s+([0-9,.]+)\s+from\s+([0-9xX*]{11,})).*?(?:TxID|TrxID)\s*[:\-]?\s*([A-Z0-9]+)/is', $smsText, $m)) {
                    if (isset($m[3]) && $m[3] !== '') {
                        $amount = floatval(str_replace(',', '', $m[3]));
                        $sender = trim($m[4]);
                    } else {
                        $amount = floatval(str_replace(',', '', $m[1]));
                        $sender = trim($m[2]);
                    }
                    $trxId = trim(end($m)); // The last match group is the TxID
                }
                break;

            case 'upay':
                // Match "Payment Received Amount: Tk 500.00 from 01711223344. TrxID: 9I87Y6T5."
                // Match "Cash In Received Amount: Tk 500.00 from 01711223344. TrxID: 9I87Y6T5."
                // Match "You have received Tk 500 in your upay account from 01881469088. TrxID: AkfR2351ck."
                if (preg_match('/Tk\s*([0-9,.]+).*?from\s+([0-9xX*]{11,}).*?TrxID:\s*([A-Z0-9]+)/is', $smsText, $m)) {
                    $amount = floatval(str_replace(',', '', $m[1]));
                    $sender = trim($m[2]);
                    $trxId = trim($m[3]);
                }
                break;
        }

        $referenceId = null;
        if (preg_match('/Ref\s*[:\-\s]?\s*([a-zA-Z0-9_\-]+)/i', $smsText, $refMatch)) {
            $referenceId = trim($refMatch[1]);
        }

        if ($amount > 0 && !empty($trxId)) {
            return [
                'gateway' => ucfirst($gateway),
                'amount' => $amount,
                'trx_id' => $trxId,
                'sender' => $sender,
                'reference_id' => $referenceId
            ];
        }

        return null;
    }
}
