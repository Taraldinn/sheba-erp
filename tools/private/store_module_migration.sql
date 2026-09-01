-- =====================================================================
-- ISP BILLING SYSTEM - STORE & DEVICE TRACKING MODULE MIGRATION SCRIPT
-- =====================================================================
-- WARNING: Always backup your database before running schema updates!
-- To backup using command line:
--     mysqldump -u [db_user] -p [db_name] > backup_before_store_module.sql
-- =====================================================================

-- 1. Create Categories Table
CREATE TABLE IF NOT EXISTS `store_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Create Products Table (Individual items with unique MAC/Serial)
CREATE TABLE IF NOT EXISTS `store_products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT NOT NULL,
  `brand_model` VARCHAR(100) DEFAULT NULL,
  `name` VARCHAR(150) NOT NULL,
  `serial_mac` VARCHAR(100) UNIQUE NOT NULL,
  `purchase_price` DECIMAL(10,2) DEFAULT 0.00,
  `selling_price` DECIMAL(10,2) DEFAULT 0.00,
  `supplier` VARCHAR(150) DEFAULT NULL,
  `warranty` VARCHAR(100) DEFAULT NULL,
  `stock_status` ENUM('Available', 'Sold', 'Support Issued', 'Returned', 'Damaged', 'Missing') DEFAULT 'Available',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`category_id`) REFERENCES `store_categories`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Create Sales Table (Products sold to customers)
CREATE TABLE IF NOT EXISTS `store_sales` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `customer_id` INT NOT NULL,
  `invoice_no` VARCHAR(50) UNIQUE NOT NULL,
  `sold_price` DECIMAL(10,2) NOT NULL,
  `paid_amount` DECIMAL(10,2) DEFAULT 0.00,
  `due_amount` DECIMAL(10,2) DEFAULT 0.00,
  `payment_status` ENUM('Paid', 'Due', 'Partial') DEFAULT 'Paid',
  `sold_by_staff` INT NOT NULL,
  `sale_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `remarks` TEXT DEFAULT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `store_products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`sold_by_staff`) REFERENCES `staff`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Create Support Devices Table (Temporary issue log)
CREATE TABLE IF NOT EXISTS `store_support_devices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `customer_id` INT NOT NULL,
  `ticket_id` INT DEFAULT NULL,
  `given_date` DATE NOT NULL,
  `expected_return_date` DATE NOT NULL,
  `return_date` DATE DEFAULT NULL,
  `given_condition` VARCHAR(255) DEFAULT NULL,
  `return_condition` VARCHAR(255) DEFAULT NULL,
  `given_by_staff` INT NOT NULL,
  `received_by_staff` INT DEFAULT NULL,
  `status` ENUM('Issued', 'Returned', 'Overdue', 'Damaged', 'Missing') DEFAULT 'Issued',
  `remarks` TEXT DEFAULT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `store_products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`given_by_staff`) REFERENCES `staff`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`received_by_staff`) REFERENCES `staff`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
