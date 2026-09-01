<?php
// scratch/test_cc_system.php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../classes/IPPhoneDriver.php';

echo "=== STARTING SMART CALL CENTER & AUTO VOICE SMS MODULE VERIFICATION ===\n\n";

// 1. IP PHONE CONFIGURATION MIGRATION AND DEMO DRIVER PREPARATION
echo "Step 1: Preparing IP Phone Config in Demo Mode...\n";
try {
    $exists = $pdo->query("SELECT COUNT(*) FROM ip_phone_configs")->fetchColumn();
    if ($exists == 0) {
        $encrypted_token = IPPhoneDriver::encrypt('demo_token_123');
        $stmt = $pdo->prepare("INSERT INTO ip_phone_configs (driver, base_url, username, password_token, caller_id, extension, enabled, test_mode) VALUES ('generic_rest', 'http://localhost/api/v1/call?phone={PHONE}&ext={EXTENSION}', 'demo_user', ?, '09612345678', '101', 1, 1)");
        $stmt->execute([$encrypted_token]);
        echo "  Config created successfully with driver='generic_rest' and test_mode=1 (Demo Mode).\n";
    } else {
        // Force update config to enabled and test_mode for verification
        $pdo->exec("UPDATE ip_phone_configs SET enabled = 1, test_mode = 1");
        echo "  Existing config updated to enabled and test_mode = 1 (Demo Mode).\n";
    }
} catch (Exception $e) {
    echo "  Error preparing config: " . $e->getMessage() . "\n";
}

// 2. VERIFY CLICK-TO-CALL ENGINE
echo "\nStep 2: Testing Click-to-Call Engine via DemoDriver...\n";
try {
    $driver = IPPhoneDriver::getDriver($pdo);
    if ($driver) {
        echo "  Successfully loaded driver: " . get_class($driver) . "\n";
        
        // Mock a call to a customer
        $test_phone = '01712345678';
        $test_ext = '101';
        echo "  Initiating click-to-call from extension $test_ext to customer $test_phone...\n";
        
        $result = $driver->clickToCall($test_phone, $test_ext);
        echo "  Click-to-Call Result:\n";
        echo "    Success: " . ($result['success'] ? 'YES' : 'NO') . "\n";
        echo "    Message: " . $result['message'] . "\n";
        echo "    Raw Response: \n" . $result['raw_response'] . "\n";
    } else {
        echo "  Failed to load active driver.\n";
    }
} catch (Exception $e) {
    echo "  Error testing Click-to-Call: " . $e->getMessage() . "\n";
}

// 3. CREATE TEST CUSTOMER AND TEST AUTOMATED REMINDER QUEUE
echo "\nStep 3: Creating Test Customer and testing campaign queue + suppression logic...\n";
try {
    // Check if test customer exists or create one
    $test_user_id = 'minhaj_test_001';
    $chk_user = $pdo->prepare("SELECT id, due, status, current_bill_date FROM users WHERE user_id = ?");
    $chk_user->execute([$test_user_id]);
    $user = $chk_user->fetch();
    
    if (!$user) {
        $stmt = $pdo->prepare("INSERT INTO users (name, phone, user_id, password, user_package, bill_amount, due, status, current_bill_date) VALUES ('Test Customer Minhaj', '01912345678', ?, 'pass123', '5 Mbps Home', 500.00, 500.00, 'Active', '2026-05-15')");
        $stmt->execute([$test_user_id]);
        $customer_id = $pdo->lastInsertId();
        echo "  Created new test customer with ID $customer_id. Package: 5 Mbps Home. Due: 500.00. Expiration Date: 2026-05-15 (EXPIRED).\n";
    } else {
        $customer_id = $user['id'];
        // Reset customer to due and expired state
        $pdo->prepare("UPDATE users SET due = 500.00, status = 'Active', current_bill_date = '2026-05-15' WHERE id = ?")->execute([$customer_id]);
        echo "  Reset existing test customer ID $customer_id to EXPIRED status (Due: 500.00, Expiration: 2026-05-15).\n";
    }
    
    // Create Voice Templates if none exist
    $tpl_exists = $pdo->query("SELECT COUNT(*) FROM voice_templates WHERE type = 'Expired package reminder'")->fetchColumn();
    if ($tpl_exists == 0) {
        $pdo->exec("INSERT INTO voice_templates (name, type, message_text, audio_file_path, language) VALUES ('Expiry Alert Template', 'Expired package reminder', 'Dear [NAME], your packages expired on [DATE]. Please pay [AMOUNT] BDT to keep using [PACKAGE] internet service.', NULL, 'Bangla')");
        echo "  Expired Package Voice Template seeded.\n";
    }
    
    $tpl_due_exists = $pdo->query("SELECT COUNT(*) FROM voice_templates WHERE type = 'Due bill reminder'")->fetchColumn();
    if ($tpl_due_exists == 0) {
        $pdo->exec("INSERT INTO voice_templates (name, type, message_text, audio_file_path, language) VALUES ('Due Bill Alert Template', 'Due bill reminder', 'Dear [NAME], you have an outstanding bill of [AMOUNT] BDT. Please clear your dues as soon as possible.', NULL, 'Bangla')");
        echo "  Due Bill Package Voice Template seeded.\n";
    }
    
} catch (Exception $e) {
    echo "  Error setting up test customer or templates: " . $e->getMessage() . "\n";
}

// 4. MOCK DAILY CRON RUN FOR EXPIRY QUEUE COMPILING
echo "\nStep 4: Compiling daily queues (Cron Dry-run for Tenant 'main')...\n";
try {
    // Clear existing voice queue to avoid duplicate noise during test
    $pdo->exec("DELETE FROM voice_sms_queue");
    
    require_once __DIR__ . '/../cron/call_center_cron.php';
    
    // Explicitly call the daily queue builder
    build_daily_voice_queues($pdo, 'main');
    
    // Verify items queued
    $queue_items = $pdo->query("SELECT q.*, t.name as template_name FROM voice_sms_queue q JOIN voice_templates t ON q.template_id = t.id")->fetchAll();
    echo "  Voice SMS Queue Items Compiles:\n";
    foreach ($queue_items as $item) {
        echo "    ID: {$item['id']} | Campaign: {$item['campaign_name']} | Phone: {$item['phone']} | Status: {$item['status']} | Message: \"{$item['text_message']}\"\n";
    }
} catch (Exception $e) {
    echo "  Error during Daily Queue Compilation: " . $e->getMessage() . "\n";
}

// 5. TEST PAID CUSTOMER REMINDER SUPPRESSION FILTER
echo "\nStep 5: Simulating Paid Customer Reminder Suppression Filter...\n";
try {
    // Simulate customer making a payment (Setting due balance to 0.00 and expiry to future)
    echo "  Customer pays outstanding bill! Updating customer due to 0.00 and current_bill_date to 2026-06-23...\n";
    $pdo->prepare("UPDATE users SET due = 0.00, current_bill_date = '2026-06-23' WHERE id = ?")->execute([$customer_id]);
    
    echo "  Dispatching queue via cron worker to see if reminders get suppressed...\n";
    dispatch_voice_queue($pdo, 'main');
    
    // Check status of items in the queue
    $checked_queue = $pdo->query("SELECT id, campaign_name, status, error_message FROM voice_sms_queue")->fetchAll();
    echo "  Post-dispatch Queue Status:\n";
    foreach ($checked_queue as $q_status) {
        echo "    ID: {$q_status['id']} | Campaign: {$q_status['campaign_name']} | Status: {$q_status['status']} | Note: \"{$q_status['error_message']}\"\n";
    }
    
    // Assert if successfully suppressed
    $suppressed_count = $pdo->query("SELECT COUNT(*) FROM voice_sms_queue WHERE status = 'Cancelled'")->fetchColumn();
    if ($suppressed_count > 0) {
        echo "  >>> SUCCESS: Payment Reminder Suppression Filter worked perfectly! Reminders cancelled automatically since customer paid prior to queue dispatch.\n";
    } else {
        echo "  >>> FAILURE: Reminders were not correctly suppressed!\n";
    }
} catch (Exception $e) {
    echo "  Error during suppression testing: " . $e->getMessage() . "\n";
}

// 6. LOG CONSOLE CLEANUP
echo "\nStep 6: Cleaning up test artifacts...\n";
try {
    $pdo->exec("DELETE FROM voice_sms_queue");
    $pdo->prepare("DELETE FROM users WHERE user_id = ?")->execute([$test_user_id]);
    echo "  Test data purged cleanly.\n";
} catch (Exception $e) {
    echo "  Error during cleanup: " . $e->getMessage() . "\n";
}

echo "\n=== VERIFICATION RUN COMPLETE ===\n";
