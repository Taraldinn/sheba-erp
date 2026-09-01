<?php
// scratch/check_duplicates.php
require_once __DIR__ . '/../includes/config.php';

function check_table_duplicates($pdo, $table) {
    echo "=== Duplicates in $table ===\n";
    try {
        // Count total records
        $total = $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
        echo "Total records: $total\n";

        // Count null/empty trx_id
        $null_count = $pdo->query("SELECT COUNT(*) FROM `$table` WHERE trx_id IS NULL")->fetchColumn();
        $empty_count = $pdo->query("SELECT COUNT(*) FROM `$table` WHERE trx_id = ''")->fetchColumn();
        echo "Null trx_id: $null_count, Empty trx_id: $empty_count\n";

        // Find duplicates
        $stmt = $pdo->query("SELECT trx_id, COUNT(*) as count FROM `$table` WHERE trx_id IS NOT NULL AND trx_id != '' GROUP BY trx_id HAVING count > 1");
        $dupes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "Duplicate trx_id values: " . count($dupes) . "\n";
        foreach ($dupes as $d) {
            echo "  TrxID: " . $d['trx_id'] . " (Count: " . $d['count'] . ")\n";
        }
    } catch (Exception $e) {
        echo "Error: " . $e->getMessage() . "\n";
    }
    echo "\n";
}

check_table_duplicates($pdo, 'payment_gateway_logs');
check_table_duplicates($pdo, 'payment_sms_logs');
