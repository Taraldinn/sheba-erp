<?php
// controllers/store_controller.php
if (session_status() == PHP_SESSION_NONE) {
    ini_set('session.cookie_secure', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

// Only logged in staff can access these actions
if (!isLoggedIn()) {
    header("Location: index.php");
    exit;
}

$action = $_POST['action'] ?? '';
$user_id = $_SESSION['admin_id'];
$username = $_SESSION['admin_username'] ?? 'Staff';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($action)) {
    // Explicitly set PDO error mode to Exception inside the controller to guarantee SQL errors are thrown
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Log the POST request details for troubleshooting
    @file_put_contents(__DIR__ . '/../debug_post.log', date('Y-m-d H:i:s') . " | STORE ACTION: $action | User: $username ($user_id) | POST Data: " . json_encode($_POST) . "\n", FILE_APPEND);

    try {
        switch ($action) {
            case 'add_category':
                $name = trim($_POST['name'] ?? '');
                if (empty($name)) {
                    $_SESSION['flash_error'] = "Category name cannot be empty.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }
                $owner_id = get_store_owner_id();
                $stmt = $pdo->prepare("INSERT INTO " . TBL_STORE_CATEGORIES . " (staff_id, name) VALUES (?, ?)");
                $stmt->execute([$owner_id, $name]);
                writeLog($pdo, $username, 'Store Category', $pdo->lastInsertId(), "Added category: $name");
                $_SESSION['flash_msg'] = "Category added successfully.";
                header("Location: index.php?tab=store_inventory");
                exit;

            case 'edit_category':
                $id = intval($_POST['id'] ?? 0);
                $name = trim($_POST['name'] ?? '');
                if (empty($name) || $id <= 0) {
                    $_SESSION['flash_error'] = "Invalid category data.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }
                $owner_id = get_store_owner_id();
                if (hasRole('Admin')) {
                    $stmt = $pdo->prepare("UPDATE " . TBL_STORE_CATEGORIES . " SET name = ? WHERE id = ?");
                    $stmt->execute([$name, $id]);
                } else {
                    $stmt = $pdo->prepare("UPDATE " . TBL_STORE_CATEGORIES . " SET name = ? WHERE id = ? AND staff_id = ?");
                    $stmt->execute([$name, $id, $owner_id]);
                }
                writeLog($pdo, $username, 'Store Category', $id, "Updated category to: $name");
                $_SESSION['flash_msg'] = "Category updated successfully.";
                header("Location: index.php?tab=store_inventory");
                exit;

            case 'delete_category':
                $id = intval($_POST['id'] ?? 0);
                if ($id <= 0) {
                    $_SESSION['flash_error'] = "Invalid category ID.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }
                $owner_id = get_store_owner_id();
                // Verify ownership if not Admin
                if (!hasRole('Admin')) {
                    $verify = safeFetch($pdo, "SELECT id FROM " . TBL_STORE_CATEGORIES . " WHERE id = ? AND staff_id = ?", [$id, $owner_id]);
                    if (!$verify) {
                        $_SESSION['flash_error'] = "Access Denied: Category not found or unauthorized.";
                        header("Location: index.php?tab=store_inventory");
                        exit;
                    }
                }
                // Check if category is used
                $check = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_PRODUCTS . " WHERE category_id = ?", [$id]);
                if ($check['count'] > 0) {
                    $_SESSION['flash_error'] = "Cannot delete category containing products.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }
                $stmt = $pdo->prepare("DELETE FROM " . TBL_STORE_CATEGORIES . " WHERE id = ?");
                $stmt->execute([$id]);
                writeLog($pdo, $username, 'Store Category', $id, "Deleted category ID: $id");
                $_SESSION['flash_msg'] = "Category deleted successfully.";
                header("Location: index.php?tab=store_inventory");
                exit;

            case 'add_product':
                $category_id = intval($_POST['category_id'] ?? 0);
                $brand_model = trim($_POST['brand_model'] ?? '');
                $name = trim($_POST['name'] ?? '');
                $serial_mac = trim($_POST['serial_mac'] ?? '');
                $purchase_price = floatval($_POST['purchase_price'] ?? 0);
                $selling_price = floatval($_POST['selling_price'] ?? 0);
                $supplier = trim($_POST['supplier'] ?? '');
                $warranty = trim($_POST['warranty'] ?? '');
                $stock_status = $_POST['stock_status'] ?? 'Available';
                $quantity = max(1, intval($_POST['quantity'] ?? 1));

                if (empty($name) || empty($serial_mac) || $category_id <= 0) {
                    $_SESSION['flash_error'] = "Product Name, SQ ID, and Category are required.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }

                $pdo->beginTransaction();
                try {
                    // Check duplicate SQ ID
                    $dup = safeFetch($pdo, "SELECT id FROM " . TBL_STORE_PRODUCTS . " WHERE serial_mac = ?", [$serial_mac]);
                    if ($dup) {
                        throw new Exception("SQ ID '$serial_mac' already exists in inventory.");
                    }

                    $owner_id = get_store_owner_id();
                    $stmt = $pdo->prepare("INSERT INTO " . TBL_STORE_PRODUCTS . " (staff_id, category_id, brand_model, name, serial_mac, purchase_price, selling_price, supplier, warranty, stock_status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$owner_id, $category_id, $brand_model, $name, $serial_mac, $purchase_price, $selling_price, $supplier, $warranty, $stock_status, $quantity]);
                    writeLog($pdo, $username, 'Store Product', $pdo->lastInsertId(), "Added product: $name ($serial_mac), Quantity: $quantity");
                    
                    $pdo->commit();
                    $_SESSION['flash_msg'] = "Product added successfully with quantity $quantity.";
                } catch (Exception $e) {
                    $pdo->rollBack();
                    $_SESSION['flash_error'] = "Error: " . $e->getMessage();
                }
                header("Location: index.php?tab=store_inventory");
                exit;

            case 'edit_product':
                $id = intval($_POST['id'] ?? 0);
                $category_id = intval($_POST['category_id'] ?? 0);
                $brand_model = trim($_POST['brand_model'] ?? '');
                $name = trim($_POST['name'] ?? '');
                $serial_mac = trim($_POST['serial_mac'] ?? '');
                $purchase_price = floatval($_POST['purchase_price'] ?? 0);
                $selling_price = floatval($_POST['selling_price'] ?? 0);
                $supplier = trim($_POST['supplier'] ?? '');
                $warranty = trim($_POST['warranty'] ?? '');
                $stock_status = $_POST['stock_status'] ?? 'Available';
                $quantity = max(1, intval($_POST['quantity'] ?? 1));

                if ($id <= 0 || empty($name) || empty($serial_mac) || $category_id <= 0) {
                    $_SESSION['flash_error'] = "Product Name, SQ ID, and Category are required.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }

                $owner_id = get_store_owner_id();
                // Verify ownership if not Admin
                if (!hasRole('Admin')) {
                    $verify = safeFetch($pdo, "SELECT id FROM " . TBL_STORE_PRODUCTS . " WHERE id = ? AND staff_id = ?", [$id, $owner_id]);
                    if (!$verify) {
                        $_SESSION['flash_error'] = "Access Denied: Product not found or unauthorized.";
                        header("Location: index.php?tab=store_inventory");
                        exit;
                    }
                }

                // Check duplicate SQ ID excluding current
                $dup = safeFetch($pdo, "SELECT id FROM " . TBL_STORE_PRODUCTS . " WHERE serial_mac = ? AND id != ?", [$serial_mac, $id]);
                if ($dup) {
                    $_SESSION['flash_error'] = "SQ ID '$serial_mac' already exists on another product.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }

                $stmt = $pdo->prepare("UPDATE " . TBL_STORE_PRODUCTS . " SET category_id = ?, brand_model = ?, name = ?, serial_mac = ?, purchase_price = ?, selling_price = ?, supplier = ?, warranty = ?, stock_status = ?, quantity = ? WHERE id = ?");
                $stmt->execute([$category_id, $brand_model, $name, $serial_mac, $purchase_price, $selling_price, $supplier, $warranty, $stock_status, $quantity, $id]);
                writeLog($pdo, $username, 'Store Product', $id, "Updated product: $name ($serial_mac)");
                $_SESSION['flash_msg'] = "Product updated successfully.";
                header("Location: index.php?tab=store_inventory");
                exit;

            case 'delete_product':
                $id = intval($_POST['id'] ?? 0);
                if ($id <= 0) {
                    $_SESSION['flash_error'] = "Invalid product ID.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }
                $owner_id = get_store_owner_id();
                // Verify ownership if not Admin
                if (!hasRole('Admin')) {
                    $verify = safeFetch($pdo, "SELECT id FROM " . TBL_STORE_PRODUCTS . " WHERE id = ? AND staff_id = ?", [$id, $owner_id]);
                    if (!$verify) {
                        $_SESSION['flash_error'] = "Access Denied: Product not found or unauthorized.";
                        header("Location: index.php?tab=store_inventory");
                        exit;
                    }
                }
                // Check if product is sold or issued
                $check_sale = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SALES . " WHERE product_id = ?", [$id]);
                $check_support = safeFetch($pdo, "SELECT COUNT(*) as count FROM " . TBL_STORE_SUPPORT . " WHERE product_id = ?", [$id]);
                if ($check_sale['count'] > 0 || $check_support['count'] > 0) {
                    $_SESSION['flash_error'] = "Cannot delete product with sales or support tracking history.";
                    header("Location: index.php?tab=store_inventory");
                    exit;
                }
                $stmt = $pdo->prepare("DELETE FROM " . TBL_STORE_PRODUCTS . " WHERE id = ?");
                $stmt->execute([$id]);
                writeLog($pdo, $username, 'Store Product', $id, "Deleted product ID: $id");
                $_SESSION['flash_msg'] = "Product deleted successfully.";
                header("Location: index.php?tab=store_inventory");
                exit;

            case 'sell_product':
                $product_id = intval($_POST['product_id'] ?? 0);
                $customer_id = intval($_POST['customer_id'] ?? 0);
                $sold_price = floatval($_POST['sold_price'] ?? 0);
                $paid_amount = floatval($_POST['paid_amount'] ?? 0);
                $item_serial_mac = trim($_POST['item_serial_mac'] ?? '');
                $remarks = trim($_POST['remarks'] ?? '');

                if ($product_id <= 0 || $customer_id <= 0 || $sold_price <= 0 || empty($item_serial_mac)) {
                    $_SESSION['flash_error'] = "Product, Customer, Item SQ ID and Sold Price are required.";
                    header("Location: index.php?tab=store_sales");
                    exit;
                }

                // Verify product is available in quantity
                $prod = safeFetch($pdo, "SELECT * FROM " . TBL_STORE_PRODUCTS . " WHERE id = ?", [$product_id]);
                if (!$prod || $prod['quantity'] <= 0) {
                    $_SESSION['flash_error'] = "Selected product is out of stock.";
                    header("Location: index.php?tab=store_sales");
                    exit;
                }

                $due_amount = max(0, $sold_price - $paid_amount);
                $payment_status = 'Paid';
                if ($due_amount > 0) {
                    $payment_status = ($paid_amount > 0) ? 'Partial' : 'Due';
                }

                // Generate unique Invoice Number
                $invoice_no = "INV-" . date("Ymd") . "-" . str_pad(mt_rand(1000, 9999), 4, "0", STR_PAD_LEFT);

                $pdo->beginTransaction();

                // 1. Insert Sales Record with the specific item's serial_mac
                $stmt = $pdo->prepare("INSERT INTO " . TBL_STORE_SALES . " (product_id, customer_id, invoice_no, sold_price, paid_amount, due_amount, payment_status, sold_by_staff, remarks, item_serial_mac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$product_id, $customer_id, $invoice_no, $sold_price, $paid_amount, $due_amount, $payment_status, $user_id, $remarks, $item_serial_mac]);
                $sale_id = $pdo->lastInsertId();

                // 2. Reduce product quantity
                $stmt = $pdo->prepare("UPDATE " . TBL_STORE_PRODUCTS . " SET quantity = quantity - 1 WHERE id = ?");
                $stmt->execute([$product_id]);

                // 3. Log Financials if paid amount > 0
                if ($paid_amount > 0) {
                    log_finance($pdo, 'Income', $paid_amount, 'Cash', 'Product Sale', $sale_id, "Product Sale: {$prod['name']} (SQ ID: {$item_serial_mac}) to Client ID #{$customer_id}, Invoice: $invoice_no", $user_id);
                }

                $pdo->commit();

                writeLog($pdo, $username, 'Product Sale', $sale_id, "Sold product {$prod['name']} to customer ID $customer_id. Invoice: $invoice_no");
                $_SESSION['flash_msg'] = "Product sold successfully. Invoice: $invoice_no";
                header("Location: index.php?tab=store_sales");
                exit;

            case 'issue_support_device':
                $return_type = $_POST['return_type'] ?? 'date';
                $product_id = intval($_POST['product_id'] ?? 0);
                $customer_id = intval($_POST['customer_id'] ?? 0);
                $ticket_id = !empty($_POST['ticket_id']) ? intval($_POST['ticket_id']) : null;
                $given_date = $_POST['given_date'] ?? date('Y-m-d');
                $item_serial_mac = trim($_POST['item_serial_mac'] ?? '');
                
                if ($return_type === 'left_client') {
                    $expected_return_date = null;
                } else {
                    $expected_return_date = !empty($_POST['expected_return_date']) ? $_POST['expected_return_date'] : null;
                }
                
                $given_condition = trim($_POST['given_condition'] ?? 'Good');
                $remarks = trim($_POST['remarks'] ?? '');

                if ($product_id <= 0 || $customer_id <= 0 || empty($given_date) || empty($item_serial_mac) || ($return_type === 'date' && empty($expected_return_date))) {
                    $_SESSION['flash_error'] = "Product, Customer, Item SQ ID, and Given/Expected dates are required.";
                    header("Location: index.php?tab=store_support");
                    exit;
                }

                // Verify product is available
                $prod = safeFetch($pdo, "SELECT * FROM " . TBL_STORE_PRODUCTS . " WHERE id = ?", [$product_id]);
                if (!$prod || $prod['quantity'] <= 0) {
                    $_SESSION['flash_error'] = "Selected product is out of stock.";
                    header("Location: index.php?tab=store_support");
                    exit;
                }

                $pdo->beginTransaction();

                // 1. Insert support tracking record with specific SQ ID
                $stmt = $pdo->prepare("INSERT INTO " . TBL_STORE_SUPPORT . " (product_id, customer_id, ticket_id, given_date, expected_return_date, given_condition, given_by_staff, status, remarks, item_serial_mac) VALUES (?, ?, ?, ?, ?, ?, ?, 'Issued', ?, ?)");
                $stmt->execute([$product_id, $customer_id, $ticket_id, $given_date, $expected_return_date, $given_condition, $user_id, $remarks, $item_serial_mac]);
                $support_id = $pdo->lastInsertId();

                // 2. Reduce product quantity
                $stmt = $pdo->prepare("UPDATE " . TBL_STORE_PRODUCTS . " SET quantity = quantity - 1 WHERE id = ?");
                $stmt->execute([$product_id]);

                $pdo->commit();

                writeLog($pdo, $username, 'Support Issue', $support_id, "Issued support device {$prod['name']} (SQ ID: {$item_serial_mac}) to customer ID $customer_id");
                $_SESSION['flash_msg'] = "Support device issued successfully.";
                header("Location: index.php?tab=store_support");
                exit;

            case 'return_support_device':
                $support_id = intval($_POST['support_id'] ?? 0);
                $return_condition = trim($_POST['return_condition'] ?? 'Good');
                $stock_status = $_POST['stock_status'] ?? 'Available'; // Available / Damaged / Missing
                $remarks = trim($_POST['remarks'] ?? '');
                $redirect_url = trim($_POST['redirect_url'] ?? '');
                $default_redirect = !empty($redirect_url) ? $redirect_url : "index.php?tab=store_support";

                if ($support_id <= 0) {
                    $_SESSION['flash_error'] = "Invalid support device assignment ID.";
                    header("Location: " . $default_redirect);
                    exit;
                }

                $support = safeFetch($pdo, "SELECT * FROM " . TBL_STORE_SUPPORT . " WHERE id = ?", [$support_id]);
                if (!$support || $support['status'] === 'Returned') {
                    $_SESSION['flash_error'] = "Support device record not found or already returned.";
                    header("Location: " . $default_redirect);
                    exit;
                }

                $pdo->beginTransaction();

                // 1. Update support tracking record
                $stmt = $pdo->prepare("UPDATE " . TBL_STORE_SUPPORT . " SET return_date = ?, return_condition = ?, received_by_staff = ?, status = ?, remarks = CONCAT(IFNULL(remarks,''), '\n', ?) WHERE id = ?");
                $status = ($stock_status === 'Available') ? 'Returned' : $stock_status; // Returned / Damaged / Missing
                $stmt->execute([date('Y-m-d'), $return_condition, $user_id, $status, $remarks, $support_id]);

                // 2. Restore product quantity if returned as Available
                if ($stock_status === 'Available') {
                    $stmt = $pdo->prepare("UPDATE " . TBL_STORE_PRODUCTS . " SET quantity = quantity + 1 WHERE id = ?");
                    $stmt->execute([$support['product_id']]);
                }

                $pdo->commit();

                writeLog($pdo, $username, 'Support Return', $support_id, "Support device ID {$support['product_id']} returned as status: $stock_status");
                $_SESSION['flash_msg'] = "Support device return processed successfully.";
                header("Location: " . $default_redirect);
                exit;
        }
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $_SESSION['flash_error'] = "Error: " . $e->getMessage();
        header("Location: index.php?tab=store_inventory");
        exit;
    }
}
?>
