<?php
require_once __DIR__ . '/../includes/config.php';

$mobile = '01881469088';
$masked = '0188XXXX088';
$pattern = str_replace(['X', 'x', '*'], '%', $masked);

$stmt = $pdo->prepare("SELECT 1 WHERE RIGHT(?, 11) LIKE ?");
$stmt->execute([$mobile, $pattern]);
$res = $stmt->fetchColumn();

echo "Pattern: $pattern\n";
echo "Match: " . ($res ? 'YES' : 'NO') . "\n";
