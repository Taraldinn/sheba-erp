-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Sep 01, 2026 at 10:40 PM
-- Server version: 8.0.34
-- PHP Version: 8.3.31

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `shebawork_test`
--

-- --------------------------------------------------------

--
-- Table structure for table `agents`
--

CREATE TABLE `agents` (
  `id` int NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` text,
  `bank_name` varchar(100) DEFAULT NULL,
  `account_name` varchar(100) DEFAULT NULL,
  `account_no` varchar(50) DEFAULT NULL,
  `branch_name` varchar(100) DEFAULT NULL,
  `routing_no` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agent_commissions`
--

CREATE TABLE `agent_commissions` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `service_id` int DEFAULT NULL,
  `commission` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `api_tokens`
--

CREATE TABLE `api_tokens` (
  `id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `rate_limit` int DEFAULT '100',
  `ip_whitelist` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `audit_log`
--

CREATE TABLE `audit_log` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT '0',
  `admin_user` varchar(50) DEFAULT NULL,
  `action_type` varchar(50) DEFAULT NULL,
  `target_id` int DEFAULT NULL,
  `description` text,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `audit_log`
--

INSERT INTO `audit_log` (`id`, `staff_id`, `admin_user`, `action_type`, `target_id`, `description`, `timestamp`) VALUES
(1, 1, 'admin', 'Login', 0, 'User logged in', '2026-09-01 15:13:54'),
(2, 1, 'admin', 'Login', 0, 'User logged in', '2026-09-01 15:13:58');

-- --------------------------------------------------------

--
-- Table structure for table `call_logs`
--

CREATE TABLE `call_logs` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT NULL,
  `customer_id` int DEFAULT NULL,
  `customer_name` varchar(100) DEFAULT NULL,
  `customer_mobile` varchar(20) NOT NULL,
  `staff_id` int NOT NULL,
  `staff_name` varchar(100) DEFAULT NULL,
  `ip_phone_extension` varchar(50) DEFAULT NULL,
  `call_type` enum('Manual','Auto Reminder','Voice Broadcast') DEFAULT 'Manual',
  `call_start_time` datetime NOT NULL,
  `call_end_time` datetime DEFAULT NULL,
  `duration` int DEFAULT '0',
  `call_status` varchar(50) DEFAULT 'Failed',
  `api_response` text,
  `recording_url` varchar(255) DEFAULT NULL,
  `remarks` text,
  `next_followup_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_followups`
--

CREATE TABLE `customer_followups` (
  `id` int NOT NULL,
  `customer_id` int NOT NULL,
  `staff_id` int NOT NULL,
  `note` text NOT NULL,
  `followup_date` datetime NOT NULL,
  `type` enum('Billing','Expired','Complaint','Sales','Package Upgrade','New Connection') NOT NULL,
  `status` enum('Pending','Done','Call Back Later','Interested','Not Interested') DEFAULT 'Pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `daily_traffic`
--

CREATE TABLE `daily_traffic` (
  `id` int NOT NULL,
  `client_id` int NOT NULL,
  `traffic_date` date NOT NULL,
  `rx_bytes` bigint DEFAULT '0',
  `tx_bytes` bigint DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `fin_cashbook`
--

CREATE TABLE `fin_cashbook` (
  `id` int NOT NULL,
  `entry_type` enum('Income','Expense','Transfer') NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `method` varchar(20) DEFAULT NULL,
  `source` varchar(100) DEFAULT NULL,
  `ref_id` int DEFAULT NULL,
  `description` text,
  `running_balance` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `staff_id` int DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `fin_expenses`
--

CREATE TABLE `fin_expenses` (
  `id` int NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `method` varchar(20) DEFAULT NULL,
  `description` text,
  `staff_id` int DEFAULT NULL,
  `date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_advance_salaries`
--

CREATE TABLE `hr_advance_salaries` (
  `id` int NOT NULL,
  `employee_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `request_date` date NOT NULL,
  `purpose` text,
  `status` enum('Pending','Approved','Rejected') DEFAULT 'Pending',
  `return_type` enum('Instant','Installment') DEFAULT 'Instant',
  `installment_count` int DEFAULT '1',
  `monthly_deduction` decimal(10,2) DEFAULT '0.00',
  `remaining_balance` decimal(10,2) DEFAULT '0.00',
  `deduction_start_month` varchar(7) DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_attendance`
--

CREATE TABLE `hr_attendance` (
  `id` int NOT NULL,
  `employee_id` int NOT NULL,
  `date` date NOT NULL,
  `check_in` time DEFAULT NULL,
  `check_out` time DEFAULT NULL,
  `working_hours` decimal(5,2) DEFAULT '0.00',
  `status` enum('Present','Absent','Late','Half-day','Leave','Holiday') DEFAULT 'Present',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_employees`
--

CREATE TABLE `hr_employees` (
  `id` int NOT NULL,
  `staff_id` varchar(30) NOT NULL,
  `staff_user_id` int DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `full_name` varchar(100) NOT NULL,
  `father_name` varchar(100) DEFAULT NULL,
  `mother_name` varchar(100) DEFAULT NULL,
  `present_address` text,
  `permanent_address` text,
  `nid_number` varchar(30) DEFAULT NULL,
  `phone1` varchar(20) NOT NULL,
  `phone2` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `blood_group` varchar(5) DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `joining_date` date NOT NULL,
  `designation` varchar(100) NOT NULL,
  `department` varchar(100) NOT NULL,
  `employment_status` enum('Active','Resigned','Suspended','Terminated') DEFAULT 'Active',
  `family_phone` varchar(20) DEFAULT NULL,
  `emergency_phone` varchar(20) DEFAULT NULL,
  `emergency_contact_person` varchar(100) DEFAULT NULL,
  `emergency_relationship` varchar(50) DEFAULT NULL,
  `ref_name` varchar(100) DEFAULT NULL,
  `ref_address` text,
  `ref_phone` varchar(20) DEFAULT NULL,
  `ref_nid` varchar(30) DEFAULT NULL,
  `ref_relationship` varchar(50) DEFAULT NULL,
  `prev_company` varchar(150) DEFAULT NULL,
  `prev_designation` varchar(100) DEFAULT NULL,
  `prev_working_period` varchar(50) DEFAULT NULL,
  `prev_experience_note` text,
  `monthly_salary` decimal(10,2) DEFAULT '0.00',
  `salary_type` varchar(30) DEFAULT 'Monthly',
  `nid_copy` varchar(255) DEFAULT NULL,
  `cv_resume` varchar(255) DEFAULT NULL,
  `appointment_letter` varchar(255) DEFAULT NULL,
  `certificates` varchar(255) DEFAULT NULL,
  `other_docs` varchar(255) DEFAULT NULL,
  `shift_start_time` time DEFAULT NULL,
  `shift_end_time` time DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_holidays`
--

CREATE TABLE `hr_holidays` (
  `id` int NOT NULL,
  `holiday_date` date NOT NULL,
  `holiday_name` varchar(150) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_leaves`
--

CREATE TABLE `hr_leaves` (
  `id` int NOT NULL,
  `employee_id` int NOT NULL,
  `leave_type` enum('Casual leave','Sick leave','Emergency leave','Paid leave','Unpaid leave','Alternative Leave') NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `total_days` int NOT NULL,
  `reason` text,
  `status` enum('Pending','Approved','Rejected') DEFAULT 'Pending',
  `approved_by` int DEFAULT NULL,
  `action_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_leave_balances`
--

CREATE TABLE `hr_leave_balances` (
  `id` int NOT NULL,
  `employee_id` int NOT NULL,
  `year` int NOT NULL,
  `casual_leave_limit` int DEFAULT '10',
  `casual_leave_used` int DEFAULT '0',
  `sick_leave_limit` int DEFAULT '10',
  `sick_leave_used` int DEFAULT '0',
  `emergency_leave_limit` int DEFAULT '5',
  `emergency_leave_used` int DEFAULT '0',
  `paid_leave_limit` int DEFAULT '10',
  `paid_leave_used` int DEFAULT '0',
  `alternative_leave_limit` int DEFAULT '0',
  `alternative_leave_used` int DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_payroll`
--

CREATE TABLE `hr_payroll` (
  `id` int NOT NULL,
  `employee_id` int NOT NULL,
  `salary_month` varchar(7) NOT NULL,
  `basic_salary` decimal(10,2) NOT NULL,
  `late_deduction` decimal(10,2) DEFAULT '0.00',
  `absent_deduction` decimal(10,2) DEFAULT '0.00',
  `advance_deduction` decimal(10,2) DEFAULT '0.00',
  `pf_deduction` decimal(10,2) DEFAULT '0.00',
  `bonus` decimal(10,2) DEFAULT '0.00',
  `incentive` decimal(10,2) DEFAULT '0.00',
  `other_deduction` decimal(10,2) DEFAULT '0.00',
  `net_salary` decimal(10,2) NOT NULL,
  `payment_status` enum('Paid','Partial','Due') DEFAULT 'Due',
  `paid_amount` decimal(10,2) DEFAULT '0.00',
  `due_amount` decimal(10,2) DEFAULT '0.00',
  `payment_date` date DEFAULT NULL,
  `payment_method` varchar(20) DEFAULT 'Cash',
  `remarks` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_policies`
--

CREATE TABLE `hr_policies` (
  `id` int NOT NULL,
  `key_name` varchar(50) NOT NULL,
  `key_value` text NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `hr_policies`
--

INSERT INTO `hr_policies` (`id`, `key_name`, `key_value`, `updated_at`) VALUES
(1, 'grace_time', '10', '2026-09-01 15:13:36'),
(2, 'late_allowed', '3', '2026-09-01 15:13:36'),
(3, 'late_deduction_amount', '50', '2026-09-01 15:13:36'),
(4, 'late_count_salary_deduct', '6', '2026-09-01 15:13:36'),
(5, 'absent_deduction_percentage', '100', '2026-09-01 15:13:37'),
(6, 'half_day_deduction_percentage', '50', '2026-09-01 15:13:37');

-- --------------------------------------------------------

--
-- Table structure for table `ip_phone_configs`
--

CREATE TABLE `ip_phone_configs` (
  `id` int NOT NULL,
  `staff_id` int NOT NULL DEFAULT '1',
  `driver` varchar(50) NOT NULL DEFAULT 'generic_rest',
  `base_url` varchar(255) NOT NULL,
  `username` varchar(100) NOT NULL,
  `password_token` varchar(255) NOT NULL,
  `caller_id` varchar(50) NOT NULL,
  `extension` varchar(50) DEFAULT NULL,
  `enabled` tinyint(1) DEFAULT '1',
  `test_mode` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ip_phone_numbers`
--

CREATE TABLE `ip_phone_numbers` (
  `id` int NOT NULL,
  `staff_id` int NOT NULL DEFAULT '1',
  `tenant_id` varchar(50) DEFAULT 'main',
  `ip_number` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `sip_server` varchar(150) NOT NULL,
  `port` int NOT NULL DEFAULT '5060',
  `is_main` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mikrotik_services`
--

CREATE TABLE `mikrotik_services` (
  `id` int NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `buying_price` decimal(10,2) DEFAULT '0.00',
  `mikrotik_profile_name` varchar(100) DEFAULT NULL,
  `rate_limit_profile` varchar(100) DEFAULT NULL,
  `router_id` int DEFAULT '0',
  `vat_percent` decimal(5,2) DEFAULT '0.00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `offers`
--

CREATE TABLE `offers` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `buy_days` int DEFAULT NULL,
  `free_days` int DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `description` text,
  `valid_until` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `olts`
--

CREATE TABLE `olts` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT '0',
  `name` varchar(100) DEFAULT NULL,
  `location` varchar(150) DEFAULT NULL,
  `ip` varchar(50) DEFAULT NULL,
  `port` varchar(10) DEFAULT NULL,
  `protocol` varchar(10) DEFAULT 'http',
  `telnet_port` int DEFAULT '23',
  `user` varchar(50) DEFAULT NULL,
  `pass` varchar(100) DEFAULT NULL,
  `brand` varchar(50) DEFAULT 'bdcom',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `snmp_community` varchar(50) DEFAULT 'public',
  `timeout` int DEFAULT '10',
  `enabled` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_gateway_logs`
--

CREATE TABLE `payment_gateway_logs` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `trx_id` varchar(50) DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `payment_id` varchar(100) DEFAULT NULL,
  `gateway_response` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_intents`
--

CREATE TABLE `payment_intents` (
  `id` int NOT NULL,
  `public_token` varchar(64) NOT NULL,
  `tenant_id` varchar(50) DEFAULT NULL,
  `manager_id` int DEFAULT '0',
  `customer_id` int DEFAULT '0',
  `entity_type` enum('customer','staff') DEFAULT 'customer',
  `invoice_id` varchar(50) DEFAULT NULL,
  `gateway_id` int NOT NULL,
  `gateway_name` varchar(20) NOT NULL,
  `payer_mobile` varchar(20) DEFAULT NULL,
  `receiver_mobile` varchar(20) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) DEFAULT 'BDT',
  `status` enum('created','waiting','processing','paid','expired','cancelled','failed','review') DEFAULT 'created',
  `provider_trx_id` varchar(50) DEFAULT NULL,
  `matched_sms_log_id` int DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `detected_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `client_ip` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_requests`
--

CREATE TABLE `payment_requests` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT NULL,
  `customer_id` int NOT NULL,
  `invoice_id` varchar(50) NOT NULL,
  `gateway_name` varchar(20) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `trx_id` varchar(50) NOT NULL,
  `status` enum('pending','verified','rejected','failed') DEFAULT 'pending',
  `verified_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_sms_logs`
--

CREATE TABLE `payment_sms_logs` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT NULL,
  `staff_id` int DEFAULT '0',
  `gateway_name` varchar(20) NOT NULL,
  `sender_mobile` varchar(20) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `trx_id` varchar(50) NOT NULL,
  `reference_id` varchar(50) DEFAULT NULL,
  `raw_sms` text NOT NULL,
  `sms_received_at` datetime NOT NULL,
  `status` enum('matched','unmatched','duplicate','failed_parse') DEFAULT 'unmatched',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rate_limits`
--

CREATE TABLE `rate_limits` (
  `id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `request_replay`
--

CREATE TABLE `request_replay` (
  `id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `replay_hash` varchar(64) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `routers`
--

CREATE TABLE `routers` (
  `id` int NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `ip_address` varchar(50) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `api_password` varchar(50) DEFAULT NULL,
  `port` int DEFAULT '8728',
  `use_ssl` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `service_pricing`
--

CREATE TABLE `service_pricing` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `service_id` int DEFAULT NULL,
  `custom_price` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `id` int NOT NULL,
  `key_name` varchar(50) DEFAULT NULL,
  `key_value` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `settings`
--

INSERT INTO `settings` (`id`, `key_name`, `key_value`) VALUES
(1, 'saas_license_key', '6d290d0bde08df2ac7959f4bfb3937a7'),
(2, 'saas_api_url', 'https://netbills.work.gd/saas_admin/api.php'),
(3, 'client_name', 'fardin'),
(4, 'client_date_of_birth', '2003-01-01'),
(9, 'last_auto_expire_check', '1788280062');

-- --------------------------------------------------------

--
-- Table structure for table `sms_logs`
--

CREATE TABLE `sms_logs` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT '0',
  `phone` varchar(20) DEFAULT NULL,
  `message` text,
  `response` text,
  `status` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `staff`
--

CREATE TABLE `staff` (
  `id` int NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` varchar(20) DEFAULT 'Reseller',
  `parent_id` int DEFAULT '0',
  `balance` decimal(10,2) DEFAULT '0.00',
  `status` varchar(20) DEFAULT 'Active',
  `router_id` int DEFAULT '0',
  `due_balance` decimal(10,2) DEFAULT '0.00',
  `agent_id` int DEFAULT '0',
  `agent_commission` decimal(5,2) DEFAULT '0.00',
  `phone` varchar(20) DEFAULT NULL,
  `nid` varchar(50) DEFAULT NULL,
  `address` text,
  `commission_type` enum('Fixed','Package') DEFAULT 'Fixed',
  `sms_config` text,
  `email` varchar(100) DEFAULT NULL,
  `reset_token` varchar(100) DEFAULT NULL,
  `reset_expiry` datetime DEFAULT NULL,
  `lock_status` enum('None','Panel','Full') DEFAULT 'None',
  `lock_note` text,
  `gateway_config` text,
  `sms_balance` decimal(10,2) DEFAULT '0.00',
  `sms_rate` decimal(10,2) DEFAULT '0.00',
  `advance_balance_limit` decimal(10,2) DEFAULT '0.00',
  `supervisor_id` int DEFAULT '0',
  `allowed_packages` text,
  `can_undo_recharge` tinyint(1) DEFAULT '0',
  `expire_time` time DEFAULT NULL,
  `permissions` text,
  `can_use_global_sms` tinyint(1) DEFAULT '0',
  `invoice_config` text,
  `voice_config` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `staff`
--

INSERT INTO `staff` (`id`, `name`, `username`, `password`, `role`, `parent_id`, `balance`, `status`, `router_id`, `due_balance`, `agent_id`, `agent_commission`, `phone`, `nid`, `address`, `commission_type`, `sms_config`, `email`, `reset_token`, `reset_expiry`, `lock_status`, `lock_note`, `gateway_config`, `sms_balance`, `sms_rate`, `advance_balance_limit`, `supervisor_id`, `allowed_packages`, `can_undo_recharge`, `expire_time`, `permissions`, `can_use_global_sms`, `invoice_config`, `voice_config`) VALUES
(1, 'Super Admin', 'admin', '$2y$10$VOxzYxHnzPaJVk/gPJk0H.uSMziBREr7L5GZSz5lHN97aE203c8Fa', 'Admin', 0, 0.00, 'Active', 0, 0.00, 0, 0.00, NULL, NULL, NULL, 'Fixed', NULL, NULL, NULL, NULL, 'None', NULL, NULL, 0.00, 0.00, 0.00, 0, NULL, 0, NULL, NULL, 0, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `staff_profit_logs`
--

CREATE TABLE `staff_profit_logs` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `client_id` int DEFAULT NULL,
  `client_user_id` varchar(50) DEFAULT NULL,
  `bill_amount` decimal(10,2) DEFAULT '0.00',
  `package_cost` decimal(10,2) DEFAULT '0.00',
  `profit` decimal(10,2) DEFAULT '0.00',
  `source` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `admin_cost` decimal(10,2) DEFAULT '0.00',
  `admin_profit` decimal(10,2) DEFAULT '0.00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `staff_sell_pricing`
--

CREATE TABLE `staff_sell_pricing` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `service_id` int DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `store_categories`
--

CREATE TABLE `store_categories` (
  `id` int NOT NULL,
  `staff_id` int NOT NULL DEFAULT '1',
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `store_products`
--

CREATE TABLE `store_products` (
  `id` int NOT NULL,
  `staff_id` int NOT NULL DEFAULT '1',
  `category_id` int NOT NULL,
  `brand_model` varchar(100) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `serial_mac` varchar(100) NOT NULL,
  `purchase_price` decimal(10,2) DEFAULT '0.00',
  `selling_price` decimal(10,2) DEFAULT '0.00',
  `supplier` varchar(150) DEFAULT NULL,
  `warranty` varchar(100) DEFAULT NULL,
  `stock_status` enum('Available','Sold','Support Issued','Returned','Damaged','Missing') DEFAULT 'Available',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `quantity` int DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `store_sales`
--

CREATE TABLE `store_sales` (
  `id` int NOT NULL,
  `product_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `invoice_no` varchar(50) NOT NULL,
  `sold_price` decimal(10,2) NOT NULL,
  `paid_amount` decimal(10,2) DEFAULT '0.00',
  `due_amount` decimal(10,2) DEFAULT '0.00',
  `payment_status` enum('Paid','Due','Partial') DEFAULT 'Paid',
  `sold_by_staff` int NOT NULL,
  `sale_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `remarks` text,
  `item_serial_mac` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `store_support_devices`
--

CREATE TABLE `store_support_devices` (
  `id` int NOT NULL,
  `product_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `ticket_id` int DEFAULT NULL,
  `given_date` date NOT NULL,
  `expected_return_date` date DEFAULT NULL,
  `return_date` date DEFAULT NULL,
  `given_condition` varchar(255) DEFAULT NULL,
  `return_condition` varchar(255) DEFAULT NULL,
  `given_by_staff` int NOT NULL,
  `received_by_staff` int DEFAULT NULL,
  `status` enum('Issued','Returned','Overdue','Damaged','Missing') DEFAULT 'Issued',
  `remarks` text,
  `item_serial_mac` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tasks`
--

CREATE TABLE `tasks` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT 'main',
  `title` varchar(255) NOT NULL,
  `description` text,
  `category_id` int DEFAULT NULL,
  `priority` enum('Low','Medium','High','Urgent') DEFAULT 'Medium',
  `schedule_type` enum('One-Time','Daily','Weekly','Monthly','Specific Date') DEFAULT 'One-Time',
  `start_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `due_time` time DEFAULT NULL,
  `status` enum('Pending','In Progress','Completed','Cancelled','Overdue') DEFAULT 'Pending',
  `created_by` int NOT NULL,
  `parent_recurring_task_id` int DEFAULT '0',
  `recurring_rule_id` int DEFAULT '0',
  `reminder_type` varchar(50) DEFAULT 'No Reminder',
  `completed_at` datetime DEFAULT NULL,
  `completed_by` int DEFAULT NULL,
  `completion_note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `task_activity_logs`
--

CREATE TABLE `task_activity_logs` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT 'main',
  `task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `action` varchar(100) NOT NULL,
  `old_value` text,
  `new_value` text,
  `note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `task_assignees`
--

CREATE TABLE `task_assignees` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT 'main',
  `task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `assigned_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `task_attachments`
--

CREATE TABLE `task_attachments` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT 'main',
  `task_id` int NOT NULL,
  `uploaded_by` int NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `file_type` varchar(10) NOT NULL,
  `file_size` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `task_categories`
--

CREATE TABLE `task_categories` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT 'main',
  `name` varchar(100) NOT NULL,
  `status` varchar(20) DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `task_categories`
--

INSERT INTO `task_categories` (`id`, `tenant_id`, `name`, `status`, `created_at`) VALUES
(1, 'fardin', 'Billing', 'Active', '2026-09-01 15:13:45'),
(2, 'fardin', 'Customer Collection', 'Active', '2026-09-01 15:13:45'),
(3, 'fardin', 'Customer Support', 'Active', '2026-09-01 15:13:45'),
(4, 'fardin', 'Network / NOC', 'Active', '2026-09-01 15:13:45'),
(5, 'fardin', 'MikroTik', 'Active', '2026-09-01 15:13:45'),
(6, 'fardin', 'OLT / Fiber', 'Active', '2026-09-01 15:13:45'),
(7, 'fardin', 'Accounts', 'Active', '2026-09-01 15:13:45'),
(8, 'fardin', 'Bandwidth Purchase', 'Active', '2026-09-01 15:13:45'),
(9, 'fardin', 'Upstream Payment', 'Active', '2026-09-01 15:13:45'),
(10, 'fardin', 'HR', 'Active', '2026-09-01 15:13:45'),
(11, 'fardin', 'Payroll', 'Active', '2026-09-01 15:13:45'),
(12, 'fardin', 'Office Management', 'Active', '2026-09-01 15:13:45'),
(13, 'fardin', 'Inventory', 'Active', '2026-09-01 15:13:45'),
(14, 'fardin', 'Marketing', 'Active', '2026-09-01 15:13:45'),
(15, 'fardin', 'Sales', 'Active', '2026-09-01 15:13:45'),
(16, 'fardin', 'Maintenance', 'Active', '2026-09-01 15:13:45'),
(17, 'fardin', 'Management', 'Active', '2026-09-01 15:13:45'),
(18, 'fardin', 'Other', 'Active', '2026-09-01 15:13:45');

-- --------------------------------------------------------

--
-- Table structure for table `task_recurring_rules`
--

CREATE TABLE `task_recurring_rules` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT 'main',
  `task_id` int NOT NULL,
  `recurrence_type` enum('Daily','Weekly','Monthly','Yearly') NOT NULL,
  `recurrence_interval` int DEFAULT '1',
  `day_of_week` varchar(50) DEFAULT NULL,
  `day_of_month` int DEFAULT NULL,
  `month_of_year` int DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `next_run_at` datetime DEFAULT NULL,
  `last_run_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `task_templates`
--

CREATE TABLE `task_templates` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT 'main',
  `name` varchar(150) NOT NULL,
  `description` text,
  `created_by` int NOT NULL,
  `status` varchar(20) DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `task_template_items`
--

CREATE TABLE `task_template_items` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT 'main',
  `template_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `category_id` int DEFAULT NULL,
  `priority` enum('Low','Medium','High','Urgent') DEFAULT 'Medium',
  `relative_day` int DEFAULT '0',
  `due_time` time DEFAULT NULL,
  `assigned_role` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tenants`
--

CREATE TABLE `tenants` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `subdomain` varchar(50) NOT NULL,
  `db_name` varchar(50) NOT NULL,
  `db_user` varchar(50) NOT NULL,
  `db_pass` varchar(100) NOT NULL,
  `hmac_secret` varchar(100) NOT NULL,
  `status` enum('active','suspended') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tenant_payment_gateways`
--

CREATE TABLE `tenant_payment_gateways` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT NULL,
  `staff_id` int DEFAULT '0',
  `gateway_name` enum('bKash','Nagad','Rocket','Upay') NOT NULL,
  `merchant_number` varchar(20) NOT NULL,
  `device_id` varchar(100) NOT NULL,
  `api_token` varchar(100) NOT NULL,
  `account_type` enum('Merchant','Personal Retail','Personal') DEFAULT 'Personal',
  `instruction_type` enum('Payment','Send Money') DEFAULT 'Send Money',
  `display_name` varchar(100) DEFAULT '',
  `qr_image_url` varchar(255) DEFAULT NULL,
  `checkout_enabled` tinyint(1) DEFAULT '0',
  `checkout_expiry_mins` int DEFAULT '10',
  `min_amount` decimal(10,2) DEFAULT '10.00',
  `max_amount` decimal(10,2) DEFAULT '25000.00',
  `auto_activate` tinyint(1) DEFAULT '1',
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tenant_vpn`
--

CREATE TABLE `tenant_vpn` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT NULL,
  `pptp_server` varchar(150) NOT NULL,
  `pptp_username` varchar(100) NOT NULL,
  `pptp_password` varchar(100) NOT NULL,
  `olt_lan` varchar(50) NOT NULL,
  `vpn_status` varchar(20) DEFAULT 'disconnected',
  `ppp_interface` varchar(20) DEFAULT NULL,
  `error_message` text,
  `last_connected_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `require_encryption` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tenant_wg`
--

CREATE TABLE `tenant_wg` (
  `id` int NOT NULL,
  `staff_id` int NOT NULL,
  `wg_ip` varchar(50) DEFAULT NULL,
  `vps_public_key` varchar(100) DEFAULT NULL,
  `endpoint_ip` varchar(50) DEFAULT NULL,
  `endpoint_port` int DEFAULT '51820',
  `allowed_ips` varchar(100) DEFAULT NULL,
  `router_name` varchar(100) DEFAULT 'MikroTik',
  `mik_private_key_enc` text,
  `mik_private_key_set` tinyint(1) DEFAULT '0',
  `vpn_status` varchar(20) DEFAULT 'unknown',
  `last_handshake` datetime DEFAULT NULL,
  `last_test_result` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tenant_wg_subnets`
--

CREATE TABLE `tenant_wg_subnets` (
  `id` int NOT NULL,
  `staff_id` int NOT NULL,
  `olt_id` int DEFAULT NULL,
  `subnet` varchar(50) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tickets`
--

CREATE TABLE `tickets` (
  `id` int NOT NULL,
  `client_id` int DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `message` text,
  `status` varchar(20) DEFAULT 'Open',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ticket_replies`
--

CREATE TABLE `ticket_replies` (
  `id` int NOT NULL,
  `ticket_id` int DEFAULT NULL,
  `sender_type` varchar(20) NOT NULL,
  `sender_id` int NOT NULL,
  `message` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tj_boxes`
--

CREATE TABLE `tj_boxes` (
  `id` int NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `staff_id` int DEFAULT '0',
  `zone_id` int DEFAULT '0',
  `lat_long` varchar(150) DEFAULT NULL,
  `fiber_code` text,
  `box_category` varchar(50) DEFAULT 'Master Box',
  `notes` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions`
--

CREATE TABLE `transactions` (
  `id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `type` varchar(20) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `description` text,
  `method` varchar(20) DEFAULT 'Cash',
  `running_balance` decimal(10,2) DEFAULT '0.00',
  `running_due` decimal(10,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `admin_cost` decimal(10,2) DEFAULT '0.00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text,
  `user_id` varchar(50) DEFAULT NULL,
  `client_code` varchar(50) DEFAULT NULL,
  `password` varchar(50) DEFAULT NULL,
  `user_package` varchar(50) DEFAULT NULL,
  `bill_amount` decimal(10,2) DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Active',
  `router_id` int DEFAULT NULL,
  `manager_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `current_bill_date` date DEFAULT NULL,
  `bill_position` varchar(20) DEFAULT 'Active',
  `credit_taken` tinyint(1) DEFAULT '0',
  `credit_days` int DEFAULT '0',
  `phone2` varchar(20) DEFAULT NULL,
  `nid` varchar(50) DEFAULT NULL,
  `onu_mac` varchar(50) DEFAULT NULL,
  `connection_type` varchar(20) DEFAULT NULL,
  `remarks` text,
  `monthly_payments` longtext,
  `assigned_ip` varchar(50) DEFAULT NULL,
  `ip_cost` decimal(10,2) DEFAULT '0.00',
  `zone_id` int DEFAULT '0',
  `tj_box_name` varchar(100) DEFAULT NULL,
  `due` decimal(10,2) DEFAULT '0.00',
  `discount` decimal(10,2) DEFAULT '0.00',
  `lat_long` varchar(100) DEFAULT NULL,
  `client_type` enum('Home','Office') DEFAULT 'Home',
  `district` varchar(100) DEFAULT NULL,
  `thana` varchar(100) DEFAULT NULL,
  `intended_router_name` varchar(100) DEFAULT NULL,
  `profile_pic` varchar(255) DEFAULT NULL,
  `last_seen` datetime DEFAULT NULL,
  `promise_enabled` tinyint(1) DEFAULT '0',
  `promise_date` date DEFAULT NULL,
  `needs_sync` tinyint(1) DEFAULT '0',
  `send_voice_call` tinyint(1) DEFAULT '1',
  `send_sms` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_sessions`
--

CREATE TABLE `user_sessions` (
  `id` int NOT NULL,
  `client_id` int NOT NULL,
  `mikrotik_username` varchar(50) NOT NULL,
  `router_id` int NOT NULL,
  `session_key` varchar(64) NOT NULL,
  `start_rx_bytes` bigint DEFAULT '0',
  `start_tx_bytes` bigint DEFAULT '0',
  `last_rx_bytes` bigint DEFAULT '0',
  `last_tx_bytes` bigint DEFAULT '0',
  `started_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `status` enum('active','closed') DEFAULT 'active',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `total_rx_bytes` bigint DEFAULT '0',
  `total_tx_bytes` bigint DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_usage_last`
--

CREATE TABLE `user_usage_last` (
  `id` int NOT NULL,
  `customer_id` int NOT NULL,
  `username` varchar(50) NOT NULL,
  `router_id` int NOT NULL,
  `last_bytes_in` bigint DEFAULT '0',
  `last_bytes_out` bigint DEFAULT '0',
  `last_uptime` int DEFAULT '0',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_usage_logs`
--

CREATE TABLE `user_usage_logs` (
  `id` int NOT NULL,
  `tenant_id` varchar(50) DEFAULT NULL,
  `customer_id` int NOT NULL,
  `username` varchar(50) NOT NULL,
  `router_id` int NOT NULL,
  `usage_date` date NOT NULL,
  `download_bytes` bigint DEFAULT '0',
  `upload_bytes` bigint DEFAULT '0',
  `uptime_seconds` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `voice_broadcasts`
--

CREATE TABLE `voice_broadcasts` (
  `id` int NOT NULL,
  `manager_id` int NOT NULL DEFAULT '0',
  `request_id` varchar(64) NOT NULL,
  `awaj_broadcast_id` int DEFAULT NULL,
  `reminder_type` varchar(20) NOT NULL,
  `billing_cycle_date` date NOT NULL,
  `voice` varchar(100) NOT NULL,
  `sender` varchar(50) NOT NULL,
  `total_numbers` int NOT NULL DEFAULT '0',
  `status` enum('pending','processing','completed','failed') DEFAULT 'pending',
  `api_response` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `voice_call_logs`
--

CREATE TABLE `voice_call_logs` (
  `id` int NOT NULL,
  `manager_id` int NOT NULL DEFAULT '0',
  `user_id` varchar(50) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `broadcast_id` int DEFAULT NULL,
  `request_id` varchar(64) DEFAULT NULL,
  `reminder_type` varchar(20) NOT NULL,
  `billing_cycle_date` date NOT NULL,
  `status` enum('answered','not_answered','rejected','busy','failed','pending','unknown') DEFAULT 'pending',
  `duration` int DEFAULT '0',
  `attempt` int DEFAULT '1',
  `error_message` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `voice_reminder_tracking`
--

CREATE TABLE `voice_reminder_tracking` (
  `id` int NOT NULL,
  `manager_id` int NOT NULL DEFAULT '0',
  `user_id` varchar(50) NOT NULL,
  `reminder_type` enum('expiry','1_day_before','2_days_before','3_days_before') NOT NULL,
  `billing_cycle_date` date NOT NULL,
  `normalized_phone` varchar(20) NOT NULL,
  `request_id` varchar(64) DEFAULT NULL,
  `broadcast_id` int DEFAULT NULL,
  `status` enum('processing','sent','failed','permanently_failed') NOT NULL DEFAULT 'processing',
  `call_status` enum('answered','not_answered','rejected','busy','failed','pending','unknown') NOT NULL DEFAULT 'pending',
  `retry_count` int DEFAULT '0',
  `next_retry_at` datetime DEFAULT NULL,
  `reserved_by` varchar(64) DEFAULT NULL,
  `processing_started_at` datetime DEFAULT NULL,
  `error_message` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `voice_sms_queue`
--

CREATE TABLE `voice_sms_queue` (
  `id` int NOT NULL,
  `staff_id` int NOT NULL DEFAULT '1',
  `tenant_id` varchar(50) DEFAULT NULL,
  `customer_id` int NOT NULL,
  `phone` varchar(20) NOT NULL,
  `template_id` int DEFAULT NULL,
  `campaign_name` varchar(100) DEFAULT 'System Broadcast',
  `audio_file` varchar(255) DEFAULT NULL,
  `text_message` text,
  `status` enum('Pending','Sending','Sent','Failed','Cancelled') DEFAULT 'Pending',
  `attempts` int DEFAULT '0',
  `max_attempts` int DEFAULT '3',
  `error_message` text,
  `scheduled_at` datetime NOT NULL,
  `sent_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `voice_templates`
--

CREATE TABLE `voice_templates` (
  `id` int NOT NULL,
  `staff_id` int NOT NULL DEFAULT '1',
  `name` varchar(100) NOT NULL,
  `type` enum('Expired package reminder','Due bill reminder','New offer campaign','Service notice','Complaint follow-up','Maintenance notice') NOT NULL,
  `message_text` text NOT NULL,
  `audio_file_path` varchar(255) DEFAULT NULL,
  `language` enum('English','Bangla') DEFAULT 'Bangla',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `zones`
--

CREATE TABLE `zones` (
  `id` int NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `staff_id` int DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `agents`
--
ALTER TABLE `agents`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `agent_commissions`
--
ALTER TABLE `agent_commissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `staff_id` (`staff_id`,`service_id`);

--
-- Indexes for table `api_tokens`
--
ALTER TABLE `api_tokens`
  ADD PRIMARY KEY (`id`),
  ADD KEY `tenant_id` (`tenant_id`);

--
-- Indexes for table `audit_log`
--
ALTER TABLE `audit_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `staff_id` (`staff_id`),
  ADD KEY `idx_audit_target` (`target_id`),
  ADD KEY `idx_audit_action` (`action_type`),
  ADD KEY `idx_audit_time` (`timestamp`);

--
-- Indexes for table `call_logs`
--
ALTER TABLE `call_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `staff_id` (`staff_id`),
  ADD KEY `call_status` (`call_status`);

--
-- Indexes for table `customer_followups`
--
ALTER TABLE `customer_followups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `staff_id` (`staff_id`);

--
-- Indexes for table `daily_traffic`
--
ALTER TABLE `daily_traffic`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `client_id` (`client_id`,`traffic_date`);

--
-- Indexes for table `fin_cashbook`
--
ALTER TABLE `fin_cashbook`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `fin_expenses`
--
ALTER TABLE `fin_expenses`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `hr_advance_salaries`
--
ALTER TABLE `hr_advance_salaries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `employee_id` (`employee_id`);

--
-- Indexes for table `hr_attendance`
--
ALTER TABLE `hr_attendance`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `employee_id` (`employee_id`,`date`);

--
-- Indexes for table `hr_employees`
--
ALTER TABLE `hr_employees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `staff_id` (`staff_id`),
  ADD KEY `staff_user_id` (`staff_user_id`);

--
-- Indexes for table `hr_holidays`
--
ALTER TABLE `hr_holidays`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `holiday_date` (`holiday_date`);

--
-- Indexes for table `hr_leaves`
--
ALTER TABLE `hr_leaves`
  ADD PRIMARY KEY (`id`),
  ADD KEY `employee_id` (`employee_id`);

--
-- Indexes for table `hr_leave_balances`
--
ALTER TABLE `hr_leave_balances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `employee_id` (`employee_id`,`year`);

--
-- Indexes for table `hr_payroll`
--
ALTER TABLE `hr_payroll`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `employee_id` (`employee_id`,`salary_month`);

--
-- Indexes for table `hr_policies`
--
ALTER TABLE `hr_policies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `key_name` (`key_name`);

--
-- Indexes for table `ip_phone_configs`
--
ALTER TABLE `ip_phone_configs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `ip_phone_numbers`
--
ALTER TABLE `ip_phone_numbers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `mikrotik_services`
--
ALTER TABLE `mikrotik_services`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `offers`
--
ALTER TABLE `offers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `olts`
--
ALTER TABLE `olts`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `payment_gateway_logs`
--
ALTER TABLE `payment_gateway_logs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_gateway_trx` (`trx_id`);

--
-- Indexes for table `payment_intents`
--
ALTER TABLE `payment_intents`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_token` (`public_token`),
  ADD KEY `public_token_2` (`public_token`),
  ADD KEY `gateway_id` (`gateway_id`),
  ADD KEY `status` (`status`),
  ADD KEY `expires_at` (`expires_at`);

--
-- Indexes for table `payment_requests`
--
ALTER TABLE `payment_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_request_trx` (`trx_id`);

--
-- Indexes for table `payment_sms_logs`
--
ALTER TABLE `payment_sms_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_trx_id` (`trx_id`);

--
-- Indexes for table `rate_limits`
--
ALTER TABLE `rate_limits`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant_ip` (`tenant_id`,`ip_address`),
  ADD KEY `idx_created_at` (`created_at`);

--
-- Indexes for table `request_replay`
--
ALTER TABLE `request_replay`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `replay_hash` (`replay_hash`),
  ADD KEY `tenant_id` (`tenant_id`);

--
-- Indexes for table `routers`
--
ALTER TABLE `routers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `service_pricing`
--
ALTER TABLE `service_pricing`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `staff_id` (`staff_id`,`service_id`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `key_name` (`key_name`);

--
-- Indexes for table `sms_logs`
--
ALTER TABLE `sms_logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `staff`
--
ALTER TABLE `staff`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indexes for table `staff_profit_logs`
--
ALTER TABLE `staff_profit_logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `staff_sell_pricing`
--
ALTER TABLE `staff_sell_pricing`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `staff_id` (`staff_id`,`service_id`);

--
-- Indexes for table `store_categories`
--
ALTER TABLE `store_categories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `staff_id` (`staff_id`);

--
-- Indexes for table `store_products`
--
ALTER TABLE `store_products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `serial_mac` (`serial_mac`),
  ADD KEY `staff_id` (`staff_id`),
  ADD KEY `category_id` (`category_id`);

--
-- Indexes for table `store_sales`
--
ALTER TABLE `store_sales`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `invoice_no` (`invoice_no`),
  ADD KEY `product_id` (`product_id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `sold_by_staff` (`sold_by_staff`);

--
-- Indexes for table `store_support_devices`
--
ALTER TABLE `store_support_devices`
  ADD PRIMARY KEY (`id`),
  ADD KEY `product_id` (`product_id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `given_by_staff` (`given_by_staff`),
  ADD KEY `received_by_staff` (`received_by_staff`);

--
-- Indexes for table `tasks`
--
ALTER TABLE `tasks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant` (`tenant_id`),
  ADD KEY `idx_due_date` (`due_date`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_category` (`category_id`),
  ADD KEY `idx_recurring` (`recurring_rule_id`);

--
-- Indexes for table `task_activity_logs`
--
ALTER TABLE `task_activity_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant` (`tenant_id`),
  ADD KEY `idx_task` (`task_id`);

--
-- Indexes for table `task_assignees`
--
ALTER TABLE `task_assignees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_task_user` (`task_id`,`user_id`),
  ADD KEY `idx_tenant` (`tenant_id`),
  ADD KEY `idx_user` (`user_id`);

--
-- Indexes for table `task_attachments`
--
ALTER TABLE `task_attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant` (`tenant_id`),
  ADD KEY `idx_task` (`task_id`);

--
-- Indexes for table `task_categories`
--
ALTER TABLE `task_categories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant` (`tenant_id`);

--
-- Indexes for table `task_recurring_rules`
--
ALTER TABLE `task_recurring_rules`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant` (`tenant_id`),
  ADD KEY `idx_task` (`task_id`);

--
-- Indexes for table `task_templates`
--
ALTER TABLE `task_templates`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant` (`tenant_id`);

--
-- Indexes for table `task_template_items`
--
ALTER TABLE `task_template_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant` (`tenant_id`),
  ADD KEY `idx_template` (`template_id`);

--
-- Indexes for table `tenants`
--
ALTER TABLE `tenants`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `subdomain` (`subdomain`);

--
-- Indexes for table `tenant_payment_gateways`
--
ALTER TABLE `tenant_payment_gateways`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_merchant_gw` (`merchant_number`,`gateway_name`),
  ADD KEY `idx_device_token` (`device_id`,`api_token`);

--
-- Indexes for table `tenant_vpn`
--
ALTER TABLE `tenant_vpn`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tenant_wg`
--
ALTER TABLE `tenant_wg`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_wg_staff` (`staff_id`);

--
-- Indexes for table `tenant_wg_subnets`
--
ALTER TABLE `tenant_wg_subnets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_wg_subnets_staff` (`staff_id`);

--
-- Indexes for table `tickets`
--
ALTER TABLE `tickets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tickets_status` (`status`),
  ADD KEY `idx_tickets_client` (`client_id`);

--
-- Indexes for table `ticket_replies`
--
ALTER TABLE `ticket_replies`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tj_boxes`
--
ALTER TABLE `tj_boxes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transactions`
--
ALTER TABLE `transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tx_type` (`type`),
  ADD KEY `idx_tx_created` (`created_at`),
  ADD KEY `idx_tx_staff` (`staff_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`),
  ADD KEY `idx_users_status` (`status`),
  ADD KEY `idx_users_manager` (`manager_id`),
  ADD KEY `idx_users_due` (`due`),
  ADD KEY `idx_users_bill_date` (`current_bill_date`),
  ADD KEY `idx_users_joining` (`joining_date`),
  ADD KEY `idx_users_package` (`user_package`),
  ADD KEY `idx_users_zone` (`zone_id`),
  ADD KEY `idx_users_router` (`router_id`);

--
-- Indexes for table `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `session_key` (`session_key`),
  ADD KEY `client_id` (`client_id`),
  ADD KEY `mikrotik_username` (`mikrotik_username`),
  ADD KEY `status` (`status`),
  ADD KEY `idx_client_status` (`client_id`,`status`);

--
-- Indexes for table `user_usage_last`
--
ALTER TABLE `user_usage_last`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_customer_router` (`customer_id`,`router_id`),
  ADD KEY `idx_customer_last` (`customer_id`);

--
-- Indexes for table `user_usage_logs`
--
ALTER TABLE `user_usage_logs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_customer_date_router` (`customer_id`,`usage_date`,`router_id`),
  ADD KEY `idx_date` (`usage_date`),
  ADD KEY `idx_tenant` (`tenant_id`),
  ADD KEY `idx_customer` (`customer_id`),
  ADD KEY `idx_router` (`router_id`),
  ADD KEY `idx_usage_date` (`usage_date`),
  ADD KEY `idx_router_id` (`router_id`),
  ADD KEY `idx_customer_id` (`customer_id`);

--
-- Indexes for table `voice_broadcasts`
--
ALTER TABLE `voice_broadcasts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_request_id` (`request_id`);

--
-- Indexes for table `voice_call_logs`
--
ALTER TABLE `voice_call_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_manager` (`manager_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_phone` (`phone`),
  ADD KEY `idx_broadcast` (`broadcast_id`);

--
-- Indexes for table `voice_reminder_tracking`
--
ALTER TABLE `voice_reminder_tracking`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_voice_reminder` (`user_id`,`manager_id`,`reminder_type`,`billing_cycle_date`);

--
-- Indexes for table `voice_sms_queue`
--
ALTER TABLE `voice_sms_queue`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `template_id` (`template_id`),
  ADD KEY `status` (`status`),
  ADD KEY `scheduled_at` (`scheduled_at`);

--
-- Indexes for table `voice_templates`
--
ALTER TABLE `voice_templates`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `zones`
--
ALTER TABLE `zones`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `agents`
--
ALTER TABLE `agents`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agent_commissions`
--
ALTER TABLE `agent_commissions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `api_tokens`
--
ALTER TABLE `api_tokens`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `audit_log`
--
ALTER TABLE `audit_log`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `call_logs`
--
ALTER TABLE `call_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_followups`
--
ALTER TABLE `customer_followups`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `daily_traffic`
--
ALTER TABLE `daily_traffic`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `fin_cashbook`
--
ALTER TABLE `fin_cashbook`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `fin_expenses`
--
ALTER TABLE `fin_expenses`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hr_advance_salaries`
--
ALTER TABLE `hr_advance_salaries`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hr_attendance`
--
ALTER TABLE `hr_attendance`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hr_employees`
--
ALTER TABLE `hr_employees`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hr_holidays`
--
ALTER TABLE `hr_holidays`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hr_leaves`
--
ALTER TABLE `hr_leaves`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hr_leave_balances`
--
ALTER TABLE `hr_leave_balances`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hr_payroll`
--
ALTER TABLE `hr_payroll`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hr_policies`
--
ALTER TABLE `hr_policies`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `ip_phone_configs`
--
ALTER TABLE `ip_phone_configs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ip_phone_numbers`
--
ALTER TABLE `ip_phone_numbers`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mikrotik_services`
--
ALTER TABLE `mikrotik_services`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `offers`
--
ALTER TABLE `offers`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `olts`
--
ALTER TABLE `olts`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_gateway_logs`
--
ALTER TABLE `payment_gateway_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_intents`
--
ALTER TABLE `payment_intents`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_requests`
--
ALTER TABLE `payment_requests`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_sms_logs`
--
ALTER TABLE `payment_sms_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rate_limits`
--
ALTER TABLE `rate_limits`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `request_replay`
--
ALTER TABLE `request_replay`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `routers`
--
ALTER TABLE `routers`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `service_pricing`
--
ALTER TABLE `service_pricing`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `sms_logs`
--
ALTER TABLE `sms_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `staff`
--
ALTER TABLE `staff`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `staff_profit_logs`
--
ALTER TABLE `staff_profit_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `staff_sell_pricing`
--
ALTER TABLE `staff_sell_pricing`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `store_categories`
--
ALTER TABLE `store_categories`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `store_products`
--
ALTER TABLE `store_products`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `store_sales`
--
ALTER TABLE `store_sales`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `store_support_devices`
--
ALTER TABLE `store_support_devices`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tasks`
--
ALTER TABLE `tasks`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `task_activity_logs`
--
ALTER TABLE `task_activity_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `task_assignees`
--
ALTER TABLE `task_assignees`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `task_attachments`
--
ALTER TABLE `task_attachments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `task_categories`
--
ALTER TABLE `task_categories`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `task_recurring_rules`
--
ALTER TABLE `task_recurring_rules`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `task_templates`
--
ALTER TABLE `task_templates`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `task_template_items`
--
ALTER TABLE `task_template_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tenants`
--
ALTER TABLE `tenants`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tenant_payment_gateways`
--
ALTER TABLE `tenant_payment_gateways`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tenant_vpn`
--
ALTER TABLE `tenant_vpn`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tenant_wg`
--
ALTER TABLE `tenant_wg`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tenant_wg_subnets`
--
ALTER TABLE `tenant_wg_subnets`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tickets`
--
ALTER TABLE `tickets`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ticket_replies`
--
ALTER TABLE `ticket_replies`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tj_boxes`
--
ALTER TABLE `tj_boxes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions`
--
ALTER TABLE `transactions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_sessions`
--
ALTER TABLE `user_sessions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_usage_last`
--
ALTER TABLE `user_usage_last`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_usage_logs`
--
ALTER TABLE `user_usage_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `voice_broadcasts`
--
ALTER TABLE `voice_broadcasts`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `voice_call_logs`
--
ALTER TABLE `voice_call_logs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `voice_reminder_tracking`
--
ALTER TABLE `voice_reminder_tracking`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `voice_sms_queue`
--
ALTER TABLE `voice_sms_queue`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `voice_templates`
--
ALTER TABLE `voice_templates`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `zones`
--
ALTER TABLE `zones`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `api_tokens`
--
ALTER TABLE `api_tokens`
  ADD CONSTRAINT `api_tokens_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customer_followups`
--
ALTER TABLE `customer_followups`
  ADD CONSTRAINT `customer_followups_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `customer_followups_ibfk_2` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `hr_advance_salaries`
--
ALTER TABLE `hr_advance_salaries`
  ADD CONSTRAINT `hr_advance_salaries_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `hr_attendance`
--
ALTER TABLE `hr_attendance`
  ADD CONSTRAINT `hr_attendance_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `hr_leaves`
--
ALTER TABLE `hr_leaves`
  ADD CONSTRAINT `hr_leaves_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `hr_leave_balances`
--
ALTER TABLE `hr_leave_balances`
  ADD CONSTRAINT `hr_leave_balances_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `hr_payroll`
--
ALTER TABLE `hr_payroll`
  ADD CONSTRAINT `hr_payroll_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `request_replay`
--
ALTER TABLE `request_replay`
  ADD CONSTRAINT `request_replay_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `store_products`
--
ALTER TABLE `store_products`
  ADD CONSTRAINT `store_products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `store_categories` (`id`) ON DELETE RESTRICT;

--
-- Constraints for table `store_sales`
--
ALTER TABLE `store_sales`
  ADD CONSTRAINT `store_sales_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `store_products` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `store_sales_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `store_sales_ibfk_3` FOREIGN KEY (`sold_by_staff`) REFERENCES `staff` (`id`) ON DELETE RESTRICT;

--
-- Constraints for table `store_support_devices`
--
ALTER TABLE `store_support_devices`
  ADD CONSTRAINT `store_support_devices_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `store_products` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `store_support_devices_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `store_support_devices_ibfk_3` FOREIGN KEY (`given_by_staff`) REFERENCES `staff` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `store_support_devices_ibfk_4` FOREIGN KEY (`received_by_staff`) REFERENCES `staff` (`id`) ON DELETE RESTRICT;

--
-- Constraints for table `voice_sms_queue`
--
ALTER TABLE `voice_sms_queue`
  ADD CONSTRAINT `voice_sms_queue_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `voice_sms_queue_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `voice_templates` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
