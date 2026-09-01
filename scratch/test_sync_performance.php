<?php
/**
 * scratch/test_sync_performance.php
 * Script to test performance of queue-based Router Sync background worker.
 * Measures execution time, database queries, and memory footprints with 1000+ users.
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

// Boot application as tenant 'billing'
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

echo "=== ROUTER SYNC STRESS TEST SIMULATION ===\n\n";

$router_id = 1; // RipaOnline2 in test database shebafi_ripa1

// 1. Clean up any old jobs
$pdo->prepare("DELETE FROM router_sync_jobs WHERE router_id = ?")->execute([$router_id]);
echo "Cleared old jobs.\n";

// 2. Count clients on this router
$stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE router_id = ?");
$stmt->execute([$router_id]);
$total_clients = (int)$stmt->fetchColumn();
echo "Current total clients: {$total_clients}\n";

echo "Seeding 1000 additional mock clients for stress test...\n";
$pdo->beginTransaction();
for ($i = 1; $i <= 1000; $i++) {
    $username = "mock_client_" . uniqid() . "_" . $i;
    $pdo->prepare("
        INSERT INTO users (joining_date, name, phone, user_id, password, user_package, bill_amount, router_id, manager_id, current_bill_date, status, bill_position)
        VALUES (NOW(), ?, '01712345678', ?, 'password123', 'Default Package', 500.00, ?, 1, DATE_ADD(NOW(), INTERVAL 15 DAY), 'Active', 'Active')
    ")->execute([$username, $username, $router_id]);
}
$pdo->commit();

$stmt->execute([$router_id]);
$total_clients = (int)$stmt->fetchColumn();
echo "New total clients on router: {$total_clients}\n";

// 3. Create a queue job
$stmt = $pdo->prepare("
    INSERT INTO router_sync_jobs (router_id, status, progress, total_clients, processed_clients, failed_clients, started_at, updated_at)
    VALUES (?, 'queued', 0, ?, 0, 0, NOW(), NOW())
");
$stmt->execute([$router_id, $total_clients]);
$job_id = $pdo->lastInsertId();
echo "Inserted queued job ID: {$job_id}\n";

// 4. Measure CPU & memory and run process_router_sync.php
$time_start = microtime(true);
$mem_start = memory_get_peak_usage(true);

echo "Running background worker CLI command...\n";

// Since it's a test script, we will run the worker directly using PHP CLI
$cmd = "C:\\xampp\\php\\php.exe " . escapeshellarg(__DIR__ . '/../cron/process_router_sync.php') . " --tenant=billing --job_id=" . $job_id;
$output = shell_exec($cmd);

$time_end = microtime(true);
$mem_end = memory_get_peak_usage(true);

$elapsed = $time_end - $time_start;
$mem_diff = $mem_end - $mem_start;

echo "\nWorker Output:\n";
echo "--------------------------------------------------\n";
echo $output ? $output : "(No CLI Output - expected for background running)\n";
echo "--------------------------------------------------\n";

// 5. Inspect final job status from database
$job = safeFetch($pdo, "SELECT * FROM router_sync_jobs WHERE id = ?", [$job_id]);

echo "\n=== Performance Metrics ===\n";
echo "Execution Time: " . round($elapsed, 4) . " seconds\n";
echo "Peak Memory Consumption: " . round($mem_diff / 1024 / 1024, 4) . " MB\n";
echo "Final Job Status: " . ($job['status'] ?? 'N/A') . "\n";
echo "Processed Clients: " . ($job['processed_clients'] ?? 0) . "\n";
echo "Failed Clients: " . ($job['failed_clients'] ?? 0) . "\n";
echo "Progress: " . ($job['progress'] ?? 0) . "%\n";
if (!empty($job['error_message'])) {
    echo "Error Message: " . $job['error_message'] . "\n";
}

// 6. Clean up the seeded mock users to leave the DB clean
$pdo->prepare("DELETE FROM users WHERE user_id LIKE 'mock_client_%'")->execute();
echo "\nCleaned up mock users from database.\n";
echo "Test Completed.\n";
