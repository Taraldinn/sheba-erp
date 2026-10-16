<?php
if (!isLoggedIn() || !is_btrc_report_enabled($pdo) || (!hasRole('Admin') && !hasPermission('btrc_report'))) {
    http_response_code(403);
    echo 'BTRC Report is disabled or access is denied.';
    exit;
}

require_once __DIR__ . '/../includes/btrc_report.php';

$filters = btrc_report_filters($_GET);
$rows = btrc_report_rows($pdo, $filters, null, 0);
$operatorName = trim((string)get_opt($pdo, 'btrc_operator_name', ''));
if ($operatorName === '') {
    $operatorName = trim((string)get_opt($pdo, 'company_name', 'ISP Billing'));
}
$headings = btrc_report_headings();
$export = strtolower(trim((string)($_GET['export'] ?? '')));

if ($export === 'csv') {
    $filename = 'btrc-report-' . date('Y-m-d-His') . '.csv';
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');

    $out = fopen('php://output', 'w');
    // UTF-8 BOM helps Excel render Bangla/client names correctly.
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, array_values($headings));
    foreach ($rows as $row) {
        $mapped = btrc_report_mapped_row($row, $operatorName);
        $csvRow = [];
        foreach (array_keys($headings) as $key) {
            $csvRow[] = $mapped[$key] ?? '';
        }
        fputcsv($out, $csvRow);
    }
    fclose($out);
    exit;
}

if ($export === 'pdf') {
    $mappedRows = [];
    foreach ($rows as $row) {
        $mappedRows[] = btrc_report_mapped_row($row, $operatorName);
    }
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>BTRC Report - <?= htmlspecialchars($operatorName, ENT_QUOTES, 'UTF-8') ?></title>
    <style>
        @page { size: A3 landscape; margin: 8mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, "Noto Sans Bengali", sans-serif; margin: 0; color: #111; font-size: 9px; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .toolbar button { padding: 7px 12px; border: 1px solid #1f4e6b; background: #1f4e6b; color: #fff; border-radius: 4px; cursor: pointer; }
        h1 { font-size: 18px; margin: 0 0 4px; color: #1f4e6b; }
        .meta { color: #555; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        thead { display: table-header-group; }
        th { background: #1f4e6b; color: #fff; font-size: 7px; padding: 5px 3px; border: 1px solid #d8e0e5; word-break: break-word; }
        td { padding: 4px 3px; border: 1px solid #d8e0e5; vertical-align: top; word-break: break-word; }
        tbody tr:nth-child(even) { background: #f7f9fb; }
        .num { text-align: right; }
        @media print {
            .toolbar { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div>
            <h1>BTRC Report</h1>
            <div class="meta"><?= htmlspecialchars($operatorName, ENT_QUOTES, 'UTF-8') ?> · <?= count($mappedRows) ?> record(s) · Generated <?= date('d M Y, h:i A') ?></div>
        </div>
        <div>
            <button type="button" onclick="window.print()">Print / Save as PDF</button>
        </div>
    </div>
    <table>
        <thead>
            <tr>
                <?php foreach ($headings as $heading): ?>
                    <th><?= htmlspecialchars($heading, ENT_QUOTES, 'UTF-8') ?></th>
                <?php endforeach; ?>
            </tr>
        </thead>
        <tbody>
        <?php if (empty($mappedRows)): ?>
            <tr><td colspan="<?= count($headings) ?>" style="text-align:center;padding:20px;">No records found.</td></tr>
        <?php else: ?>
            <?php foreach ($mappedRows as $mapped): ?>
                <tr>
                    <?php foreach (array_keys($headings) as $key): ?>
                        <td class="<?= $key === 'selling_bandwidth_bdt_ex_vat' ? 'num' : '' ?>"><?php
                            $val = $mapped[$key] ?? '';
                            if ($key === 'selling_bandwidth_bdt_ex_vat') {
                                echo number_format((float)$val, 2, '.', '');
                            } else {
                                echo htmlspecialchars((string)$val, ENT_QUOTES, 'UTF-8');
                            }
                        ?></td>
                    <?php endforeach; ?>
                </tr>
            <?php endforeach; ?>
        <?php endif; ?>
        </tbody>
    </table>
    <script>
        window.addEventListener('load', function () {
            setTimeout(function () { window.print(); }, 250);
        });
    </script>
</body>
</html>
    <?php
    exit;
}

http_response_code(400);
echo 'Unsupported export format.';
exit;
