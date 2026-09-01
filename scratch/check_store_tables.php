<?php
require_once __DIR__ . '/../includes/config.php';

echo "--- TBL_STORE_CATEGORIES ---\n";
try {
    $stmt = $pdo->query("DESCRIBE " . TBL_STORE_CATEGORIES);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "Field: {$row['Field']} | Type: {$row['Type']} | Null: {$row['Null']} | Key: {$row['Key']}\n";
    }
    
    $count = $pdo->query("SELECT COUNT(*) FROM " . TBL_STORE_CATEGORIES)->fetchColumn();
    echo "Total categories: $count\n";
    $cats = $pdo->query("SELECT * FROM " . TBL_STORE_CATEGORIES . " LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    print_r($cats);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

echo "\n--- TBL_STORE_PRODUCTS ---\n";
try {
    $stmt = $pdo->query("DESCRIBE " . TBL_STORE_PRODUCTS);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "Field: {$row['Field']} | Type: {$row['Type']} | Null: {$row['Null']} | Key: {$row['Key']}\n";
    }
    
    $count = $pdo->query("SELECT COUNT(*) FROM " . TBL_STORE_PRODUCTS)->fetchColumn();
    echo "Total products: $count\n";
    $prods = $pdo->query("SELECT * FROM " . TBL_STORE_PRODUCTS . " LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    print_r($prods);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
