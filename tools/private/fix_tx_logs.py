
import os
import re

target_file = r'c:\Users\MD.Hasan\Downloads\IBD\controllers\logic.php'
with open(target_file, 'r') as f:
    content = f.read()

# 1. Update transfer_fund logic
old_transfer_if = """            if ($method == 'Due') {
                 $pdo->prepare("UPDATE ".TBL_STAFF." SET due_balance=due_balance+? WHERE id=?")->execute([$amount, $target_id]);
                 log_tx($pdo, $user, 'Transfer', (hasRole('Admin') ? $amount : 0), "Sold Credit (Due) to: $r_name", 'Due');
                 log_finance($pdo, 'Transfer', $amount, 'Due', 'Fund Sold (Due)', $target_id, "Reseller credit sold to $r_name (Due)");
            } else {
                 log_tx($pdo, $user, 'Income', $amount, "Sold Credit to: $r_name", $method);
                 log_finance($pdo, 'Income', $amount, $method, 'Fund Sold', $target_id, "Reseller credit sold to $r_name");
            }"""

new_transfer_if = """            if ($method == 'Due') {
                 $pdo->prepare("UPDATE ".TBL_STAFF." SET due_balance=due_balance+? WHERE id=?")->execute([$amount, $target_id]);
                 log_tx($pdo, $user, 'Transfer', (hasRole('Admin') ? $amount : 0), "Sold Credit (Due) to: $r_name", 'Due');
                 log_finance($pdo, 'Transfer', $amount, 'Due', 'Fund Sold (Due)', $target_id, "Reseller credit sold to $r_name (Due)");
                 
                 // Log for Reseller (Credit Given)
                 log_tx($pdo, $target_id, 'Credit', $amount, "Credit Given by: {$_SESSION['admin_username']}", 'Due');
            } else {
                 log_tx($pdo, $user, 'Income', $amount, "Sold Credit to: $r_name", $method);
                 log_finance($pdo, 'Income', $amount, $method, 'Fund Sold', $target_id, "Reseller credit sold to $r_name");
                 
                 // Log for Reseller (Fund Received)
                 log_tx($pdo, $target_id, 'Income', $amount, "Fund Received from: {$_SESSION['admin_username']}", $method);
            }"""

# Use escaped regex or direct replacement if exact match possible
# To handle whitespace variations, let's use a more flexible regex for one of the targets

content = content.replace(old_transfer_if, new_transfer_if)

# 2. Remove redundant log_tx
target_log_tx = 'log_tx($pdo, $target_id, \'Income\', $amount, "Fund Received from: {$_SESSION[\'admin_username\']}", \'System\');'
content = content.replace(target_log_tx, "")

# 3. Update collect_due logic
# Find: log_tx($pdo, $user, 'Income', $amount, "Collected Due from Staff #$target_id", $method);
#        if ($discount > 0) {
#            log_tx($pdo, $user, 'Discount', $discount, "Discount given to Staff #$target_id during due collection", 'System');
#        }

old_collect_logs = """        log_tx($pdo, $user, 'Income', $amount, "Collected Due from Staff #$target_id", $method);
        if ($discount > 0) {
            log_tx($pdo, $user, 'Discount', $discount, "Discount given to Staff #$target_id during due collection", 'System');
        }"""

new_collect_logs = """        log_tx($pdo, $user, 'Income', $amount, "Collected Due from Staff #$target_id", $method);
        if ($discount > 0) {
            log_tx($pdo, $user, 'Discount', $discount, "Discount given to Staff #$target_id during due collection", 'System');
        }
        
        // Log for Reseller (Payment)
        log_tx($pdo, $target_id, 'Payment', $amount, "Paid Due to: {$_SESSION['admin_username']}", $method);
        if ($discount > 0) {
            log_tx($pdo, $target_id, 'Discount', $discount, "Discount received from: {$_SESSION['admin_username']}", 'System');
        }"""

content = content.replace(old_collect_logs, new_collect_logs)

with open(target_file, 'w') as f:
    f.write(content)

print("Updated logic.php successfully")
