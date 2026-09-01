<?php
require_once __DIR__ . '/../includes/config.php';
$tables = ['ip_phone_configs', 'customer_followups', 'call_logs', 'voice_templates', 'voice_sms_queue'];

echo "Checking Call Center tables:\n";
foreach ($tables as $t) {
    try {
        $res = $pdo->query("DESCRIBE `$t`")->fetchAll(PDO::FETCH_ASSOC);
        echo "Table: $t exists with " . count($res) . " columns.\n";
    } catch (Exception $e) {
        echo "Table: $t ERROR: " . $e->getMessage() . "\n";
    }
}
