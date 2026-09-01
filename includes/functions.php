<?php
// CORE FUNCTIONS
require_once __DIR__ . '/../classes/SimpleSMTP.php';

function safeFetch($pdo, $sql, $params = []) {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetch();
}

function safeFetchAll($pdo, $sql, $params = []) {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function get_opt($pdo, $key, $default = '') {
    $stmt = $pdo->prepare("SELECT key_value FROM ".TBL_SETTINGS." WHERE key_name=?");
    $stmt->execute([$key]);
    $val = $stmt->fetchColumn();
    return $val !== false ? $val : $default;
}

function set_opt($pdo, $key, $value) {
    $pdo->prepare("INSERT INTO ".TBL_SETTINGS." (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value=?")->execute([$key, $value, $value]);
}

/**
 * Calculates the next occurrence of a day of the month.
 * If today's day is less than the target day, the target date is in the current month.
 * Otherwise, it is in the next month.
 */
function calculate_promise_date_from_day($day) {
    $day = intval($day);
    if ($day < 1 || $day > 31) {
        return null;
    }
    $today_day = (int)date('d');
    $today_month = (int)date('m');
    $today_year = (int)date('Y');
    
    if ($today_day < $day) {
        return date('Y-m-d', mktime(0, 0, 0, $today_month, $day, $today_year));
    } else {
        return date('Y-m-d', mktime(0, 0, 0, $today_month + 1, $day, $today_year));
    }
}

/**
 * Wrapper function to parse a promise date input.
 * Supports day of the month (1-31) and calendar date strings.
 */
function get_calculated_promise_date($input) {
    if (empty($input)) {
        return null;
    }
    if (is_numeric($input) && intval($input) >= 1 && intval($input) <= 31) {
        return calculate_promise_date_from_day($input);
    }
    $time = strtotime($input);
    if ($time !== false) {
        return date('Y-m-d', $time);
    }
    return null;
}

/**
 * Checks if a client should be considered expired based on their current_bill_date
 * and the specific expiry time (either reseller-set or admin-global).
 */
function is_client_expired($client, $pdo) {
    // Check if Promise Date is active and valid
    if (isset($client['promise_enabled']) && $client['promise_enabled'] == 1 && !empty($client['promise_date'])) {
        $today = date('Y-m-d');
        if ($client['promise_date'] >= $today) {
            return false; // Not expired yet, promise is active!
        }
    } else {
        // If promise fields are not in the passed $client array, fetch them to be safe
        if (!array_key_exists('promise_enabled', $client) && isset($client['id'])) {
            $p_info = safeFetch($pdo, "SELECT promise_enabled, promise_date FROM " . TBL_USERS . " WHERE id = ?", [$client['id']]);
            if ($p_info && $p_info['promise_enabled'] == 1 && !empty($p_info['promise_date'])) {
                $today = date('Y-m-d');
                if ($p_info['promise_date'] >= $today) {
                    return false;
                }
            }
        }
    }

    $today = date('Y-m-d');
    $current_time = date('H:i:s');
    $expiry_date = $client['current_bill_date'] ?? null;
    
    if (!$expiry_date) return false;
    if ($expiry_date < $today) return true;
    if ($expiry_date > $today) return false;
    
    // If it's today, we check the target time
    $manager_id = (int)($client['manager_id'] ?? 0);
    $target_time = '23:59:59';
    
    if ($manager_id > 0) {
        $mgr = safeFetch($pdo, "SELECT expire_time, role FROM " . TBL_STAFF . " WHERE id = ?", [$manager_id]);
        if ($mgr) {
            if (strcasecmp($mgr['role'] ?? '', 'Admin') === 0 || strcasecmp($mgr['role'] ?? '', 'Super Admin') === 0) {
                $target_time = get_opt($pdo, 'admin_expire_time', '23:59:59');
            } else {
                $target_time = $mgr['expire_time'] ?: '23:59:59';
            }
        }
    }
    
    return $current_time >= $target_time;
}

function isLoggedIn() {
    return isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true;
}

function isOffice() {
    $current = trim($_SESSION['user_role'] ?? '');
    return isOfficeRole($current);
}

function isOfficeRole($role) {
    if (!$role) return false;
    $role = strtolower(trim($role));
    if (in_array($role, ['admin', 'super admin'])) return true;
    $office_roles = ['administrator', 'supervisor', 'office manager', 'system admin', 'tl', 'executive', 'hr manager', 'accounts manager', 'support engineer', 'sales staff', 'staff'];
    return in_array($role, $office_roles);
}

function hasRole($role) {
    if (!isset($_SESSION['user_role'])) return false;
    $current = trim($_SESSION['user_role']);
    
    if (isAdminRole($current)) {
        if (strcasecmp($role, 'Admin') === 0 || strcasecmp($role, 'Super Admin') === 0) {
            return true;
        }
    }
    
    // Office Staff Mapping
    $office_roles = ['administrator', 'supervisor', 'office manager', 'system admin', 'tl', 'executive', 'hr manager', 'accounts manager', 'support engineer', 'sales staff', 'staff'];
    
    if (strcasecmp($role, 'Reseller') === 0) {
        return (strcasecmp($current, 'Reseller') === 0 || isAdminRole($current));
    }
    
    if (strcasecmp($role, 'SubReseller') === 0 || strcasecmp($role, 'Sub-Reseller') === 0) {
        return in_array(strtolower($current), array_merge(['admin', 'reseller', 'subreseller', 'sub-reseller', 'manager', 'agent', 'pop', 'branch'], $office_roles)) || isAdminRole($current);
    }

    if (strcasecmp($role, 'Supervisor') === 0) {
        return in_array(strtolower($current), $office_roles);
    }
    
    return strcasecmp($current, $role) === 0;
}

function isAdminRole($role) {
    if (!$role) return false;
    $role = strtolower(trim($role));
    return ($role === 'admin' || $role === 'super admin' || $role === 'administrator' || $role === 'system admin');
}

function isSystemAuthority() {
    if (!isset($_SESSION['user_role'])) return false;
    $role = $_SESSION['user_role'];
    if (isAdminRole($role)) return true;
    if (isOffice() && isAdminRole($_SESSION['parent_role'] ?? '')) return true;
    return false;
}

function hasPermission($slug) {
    if (hasRole('Admin')) return true;
    if (!isset($_SESSION['user_permissions'])) return false;
    $perms = $_SESSION['user_permissions'];
    if (is_string($perms)) $perms = json_decode($perms, true) ?: [];
    return in_array($slug, $perms);
}

function get_store_owner_id() {
    if (hasRole('Admin')) {
        return $_SESSION['admin_id'] ?? 1;
    }
    if (isOffice() && isSystemAuthority()) {
        return $_SESSION['parent_id'] ?: ($_SESSION['admin_id'] ?? 1);
    }
    $curr_role = $_SESSION['user_role'] ?? '';
    if (strcasecmp($curr_role, 'Reseller') === 0) {
        return $_SESSION['admin_id'];
    }
    return $_SESSION['parent_id'] ?: ($_SESSION['admin_id'] ?? 1);
}

function writeLog($pdo, $admin, $action, $target, $desc, $staff_id = null) {
    if ($staff_id === null && isset($_SESSION['admin_id'])) {
        $staff_id = $_SESSION['admin_id'];
    }
    try {
        $pdo->prepare("INSERT INTO ".TBL_LOGS." (staff_id, admin_user, action_type, target_id, description) VALUES (?, ?, ?, ?, ?)")->execute([(int)$staff_id, $admin, $action, (int)$target, $desc]);
    } catch (Exception $e) {
        // Silently fail logging if it's an encoding or DB error to prevent process crash
        error_log("Logging Error: " . $e->getMessage());
    }
}

function log_tx($pdo, $staff_id, $type, $amount, $desc, $method, $added_by = null, $admin_cost = null) {
    if (!$staff_id) return;
    if ($added_by === null && isset($_SESSION['admin_id'])) {
        $added_by = $_SESSION['admin_id'];
    }

    $st = $pdo->prepare("SELECT balance, due_balance FROM ".TBL_STAFF." WHERE id=?");
    $st->execute([$staff_id]);
    $staff = $st->fetch();
    $rb = $staff['balance'] ?? 0;
    $rd = $staff['due_balance'] ?? 0;

    $admin_cost_val = ($admin_cost !== null) ? floatval($admin_cost) : floatval($amount);

    try {
        $pdo->prepare("INSERT INTO ".TBL_TX." (staff_id, type, amount, description, method, running_balance, running_due, added_by, admin_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([$staff_id, $type, $amount, $desc, $method, $rb, $rd, $added_by, $admin_cost_val]);
    } catch (PDOException $e) {
        if ($e->getCode() == '42S22') { // Column not found
            // Auto-migrate: Add added_by and admin_cost columns if needed
            try {
                @$pdo->exec("ALTER TABLE ".TBL_TX." ADD COLUMN added_by INT NULL AFTER running_due");
                @$pdo->exec("ALTER TABLE ".TBL_TX." ADD COLUMN admin_cost DECIMAL(10,2) DEFAULT 0.00");
                // Retry insert
                $pdo->prepare("INSERT INTO ".TBL_TX." (staff_id, type, amount, description, method, running_balance, running_due, added_by, admin_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    ->execute([$staff_id, $type, $amount, $desc, $method, $rb, $rd, $added_by, $admin_cost_val]);
            } catch (Exception $ex) {
                // Fallback: Insert without added_by / admin_cost if migration fails
                $pdo->prepare("INSERT INTO ".TBL_TX." (staff_id, type, amount, description, method, running_balance, running_due) VALUES (?, ?, ?, ?, ?, ?, ?)")
                    ->execute([$staff_id, $type, $amount, $desc, $method, $rb, $rd]);
            }
        } else {
            throw $e;
        }
    }
}

function log_finance($pdo, $type, $amount, $method, $source, $ref_id, $desc = '', $staff_id = null) {
    if (!$staff_id && isset($_SESSION['admin_id'])) {
        $staff_id = $_SESSION['admin_id'];
    }
    
    // Calculate running balance
    $last_balance = $pdo->query("SELECT running_balance FROM ".TBL_FIN_CASHBOOK." ORDER BY id DESC LIMIT 1")->fetchColumn() ?: 0;
    
    $new_balance = $last_balance;
    if ($type === 'Income' || $type === 'Transfer' && $amount > 0) {
        $new_balance += $amount;
    } elseif ($type === 'Expense' || $type === 'Transfer' && $amount < 0) {
        $new_balance -= abs($amount);
    }

    $pdo->prepare("INSERT INTO ".TBL_FIN_CASHBOOK." (entry_type, amount, method, source, ref_id, description, running_balance, staff_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        ->execute([$type, $amount, $method, $source, $ref_id, $desc, $new_balance, $staff_id]);
}

function log_profit($pdo, $staff_id, $client_id, $client_user_id, $bill_amount, $package_cost, $source) {
    if ($staff_id <= 0) return;
    $profit = floatval($bill_amount) - floatval($package_cost);
    
    // Calculate admin_cost and admin_profit automatically
    $admin_cost = 0;
    $admin_profit = 0;
    
    // 1. Fetch user's package and manager ID
    $u_stmt = $pdo->prepare("SELECT user_package, manager_id FROM ".TBL_USERS." WHERE id=?");
    $u_stmt->execute([$client_id]);
    $user_row = $u_stmt->fetch();
    
    if ($user_row) {
        $package_name = $user_row['user_package'];
        $mgr_id = $user_row['manager_id'];
        
        // 2. Fetch service details
        $s_stmt = $pdo->prepare("SELECT id, buying_price FROM ".TBL_SERVICES." WHERE name=?");
        $s_stmt->execute([$package_name]);
        $svc = $s_stmt->fetch();
        
        if ($svc) {
            $service_id = $svc['id'];
            $buying_price_monthly = floatval($svc['buying_price']);
            
            // Get reseller's monthly cost (custom price or default buying price)
            $reseller_monthly = getBuyPrice($pdo, $mgr_id, $service_id);
            
            // Check if manager is Admin
            $mgr_role_stmt = $pdo->prepare("SELECT role FROM ".TBL_STAFF." WHERE id=?");
            $mgr_role_stmt->execute([$mgr_id]);
            $mgr_role = $mgr_role_stmt->fetchColumn();
            
            if ($mgr_role && isAdminRole($mgr_role)) {
                // Direct Admin sale: Admin Cost is the same as package_cost (reseller cost), admin profit from reseller is 0
                $admin_cost = floatval($package_cost);
                $admin_profit = 0;
            } else {
                if ($reseller_monthly > 0) {
                    $ratio = floatval($package_cost) / $reseller_monthly;
                    $admin_cost = round($buying_price_monthly * $ratio, 2);
                } else {
                    $admin_cost = floatval($package_cost);
                }
                $admin_profit = max(0.00, floatval($package_cost) - $admin_cost);
            }
        } else {
            // Fallback if service not found
            $admin_cost = floatval($package_cost);
            $admin_profit = 0;
        }
    } else {
        // Fallback if user not found
        $admin_cost = floatval($package_cost);
        $admin_profit = 0;
    }
    
    $pdo->prepare("INSERT INTO ".TBL_STAFF_PROFIT." (staff_id, client_id, client_user_id, bill_amount, package_cost, profit, source, admin_cost, admin_profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        ->execute([$staff_id, $client_id, $client_user_id, $bill_amount, $package_cost, $profit, $source, $admin_cost, $admin_profit]);
}

function getBuyPrice($pdo, $staff_id, $service_id) {
    // 1. Check custom pricing
    $stmt = $pdo->prepare("SELECT custom_price FROM ".TBL_PRICING." WHERE staff_id=? AND service_id=?");
    $stmt->execute([$staff_id, $service_id]);
    $custom = $stmt->fetchColumn();
    if ($custom !== false) return floatval($custom);
    
    // 2. Default service buying price
    $stmt = $pdo->prepare("SELECT buying_price FROM ".TBL_SERVICES." WHERE id=?");
    $stmt->execute([$service_id]);
    return floatval($stmt->fetchColumn());
}

function getSellPrice($pdo, $staff_id, $service_id) {
    // 1. Check custom reseller selling price
    $stmt = $pdo->prepare("SELECT price FROM ".TBL_SELL_PRICING." WHERE staff_id=? AND service_id=?");
    $stmt->execute([$staff_id, $service_id]);
    $custom = $stmt->fetchColumn();
    if ($custom !== false) return floatval($custom);
    
    // 2. Default service retail price
    $stmt = $pdo->prepare("SELECT price FROM ".TBL_SERVICES." WHERE id=?");
    $stmt->execute([$service_id]);
    return floatval($stmt->fetchColumn());
}

function deductWallet($pdo, $staff_id, $amount) {
    $stmt = $pdo->prepare("SELECT role, parent_id, balance, advance_balance_limit FROM ".TBL_STAFF." WHERE id=?");
    $stmt->execute([$staff_id]);
    $user = $stmt->fetch();
    
    if ($user) {
        $role = trim($user['role']);
        if (strcasecmp($role, 'Admin') === 0 || strcasecmp($role, 'Super Admin') === 0) return $staff_id;
        
        // If it's an office staff role, charge the parent
        $is_partner = (strcasecmp($role, 'Reseller') === 0 || strcasecmp($role, 'SubReseller') === 0);
        if (!$is_partner) {
            if ($user['parent_id'] > 0) {
                return deductWallet($pdo, (int)$user['parent_id'], $amount); // Redirect to parent wallet
            } else {
                return $staff_id; // Global Office Staff - Use System Authority
            }
        }

        $current_balance = floatval($user['balance']);
        $advance_limit = isset($user['advance_balance_limit']) ? floatval($user['advance_balance_limit']) : 0;
        
        if (($current_balance + $advance_limit) >= $amount) {
            $pdo->prepare("UPDATE ".TBL_STAFF." SET balance = balance - ? WHERE id=?")->execute([$amount, $staff_id]);
            return $staff_id;
        }
    }
    return false;
}

function getManagedStaffIds($pdo, $owner_id, $role) {
    if (isAdminRole($role)) return 'ALL';
    
    // If this node is NOT a Reseller and has a parent, inherit the parent's scope
    $self = safeFetch($pdo, "SELECT parent_id, role FROM ".TBL_STAFF." WHERE id=?", [$owner_id]);
    if ($self && ($self['parent_id'] > 0) && strcasecmp($role, 'Reseller') !== 0) {
        $parent = safeFetch($pdo, "SELECT role FROM ".TBL_STAFF." WHERE id=?", [$self['parent_id']]);
        if ($parent && !isAdminRole($parent['role'])) {
            return getManagedStaffIds($pdo, $self['parent_id'], $parent['role']);
        }
    }

    // Top-level office roles created by Admin get ALL access
    if (isOfficeRole($role)) {
        if (!$self || (int)$self['parent_id'] === 0) {
            return 'ALL';
        }
    }

    // For Resellers and their staff, fetch the entire descendant tree
    $ids = [$owner_id];
    $to_scan = [$owner_id];
    
    while (!empty($to_scan)) {
        $placeholders = implode(',', array_fill(0, count($to_scan), '?'));
        // Any staff member owned by or assigned to someone in the scan list
        $sql = "SELECT id FROM ".TBL_STAFF." WHERE parent_id IN ($placeholders) OR supervisor_id IN ($placeholders)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($to_scan, $to_scan));
        $new_ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        $to_scan = [];
        foreach ($new_ids as $nid) {
            $nid = (int)$nid;
            if (!in_array($nid, $ids)) {
                $ids[] = $nid;
                $to_scan[] = $nid;
            }
        }
    }
    return $ids;
}

function L($key) {
    // Simple localization - default to english keys if full lang file is missing
    return $key;
}

function creditAgentCommission($pdo, $reseller_id, $service_id, $description) {
    // 1. Get reseller's agent info
    $stmt = $pdo->prepare("SELECT agent_id, agent_commission FROM ".TBL_STAFF." WHERE id=?");
    $stmt->execute([$reseller_id]);
    $reseller = $stmt->fetch();
    if (!$reseller || $reseller['agent_id'] == 0) return;

    $agent_id = $reseller['agent_id'];
    $fixed_comm = floatval($reseller['agent_commission']);

    // 2. Check for package-wise commission
    $stmt = $pdo->prepare("SELECT commission FROM ".TBL_AGENT_COMM." WHERE staff_id=? AND service_id=?");
    $stmt->execute([$reseller_id, $service_id]);
    $pkg_comm = $stmt->fetchColumn();

    $final_comm = ($pkg_comm !== false && floatval($pkg_comm) > 0) ? floatval($pkg_comm) : $fixed_comm;

    if ($final_comm > 0) {
        // 3. Update agent balance
        $pdo->prepare("UPDATE ".TBL_AGENTS." SET balance = balance + ? WHERE id=?")->execute([$final_comm, $agent_id]);
        
        // 4. Log transaction for agent
        // Since TBL_TX uses staff_id, we might need to handle agents differently or use a specific identifier
        // For now, let's use a generic log or update log_tx to handle agents if needed.
        // Actually, TBL_TX.staff_id is an INT, we could potentially use it but it might conflict with staff IDs.
        // Better to log it in audit_log for now or create a specific agent_transactions table if requested.
        // The user said "commission amount will show agent profile".
        
        writeLog($pdo, 'System', 'Agent Commission', $agent_id, "Credited ৳$final_comm to agent for reseller #$reseller_id: $description");
    }
}

function formatBytes($bytes, $precision = 2) {
    $bytes = (float)$bytes;
    if ($bytes <= 0) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $pow = floor(log($bytes) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

function get_sms_setting($pdo, $staff_id, $key, $fallback = true) {
    if ($staff_id > 0) {
        try {
            $stmt = $pdo->prepare("SELECT role, sms_config FROM ".TBL_STAFF." WHERE id=?");
            $stmt->execute([$staff_id]);
            $row = $stmt->fetch();
            
            if ($row) {
                $role = strtolower(trim($row['role'] ?? ''));
                $is_admin = ($role === 'admin' || $role === 'super admin' || $role === 'administrator' || $role === 'system admin');
                
                if ($is_admin) {
                    return get_opt($pdo, $key, '');
                }
                
                $config = $row['sms_config'];
                if ($config) {
                    $data = json_decode($config, true);
                    if (isset($data[$key]) && $data[$key] !== '') {
                        return $data[$key];
                    }
                }
            }
        } catch (PDOException $e) {
            if ($e->getCode() == '42S22' || strpos($e->getMessage(), '1054') !== false) {
                try {
                    $pdo->exec("ALTER TABLE " . TBL_STAFF . " ADD COLUMN sms_config TEXT NULL");
                    $stmt = $pdo->prepare("SELECT role, sms_config FROM ".TBL_STAFF." WHERE id=?");
                    $stmt->execute([$staff_id]);
                    $row = $stmt->fetch();
                    if ($row) {
                        $role = strtolower(trim($row['role'] ?? ''));
                        $is_admin = ($role === 'admin' || $role === 'super admin' || $role === 'administrator' || $role === 'system admin');
                        
                        if ($is_admin) {
                            return get_opt($pdo, $key, '');
                        }
                        
                        $config = $row['sms_config'];
                        if ($config) {
                            $data = json_decode($config, true);
                            if (isset($data[$key]) && $data[$key] !== '') {
                                return $data[$key];
                            }
                        }
                    }
                } catch (Exception $ex) {
                    error_log("Failed to auto-migrate/query sms_config for staff: " . $ex->getMessage());
                }
            } else {
                error_log("Database error in get_sms_setting: " . $e->getMessage());
            }
        }
    }
    // Fallback to global settings only if requested
    if ($fallback) {
        return get_opt($pdo, $key, '');
    }
    return '';
}

function normalize_bd_phone($phone) {
    if (empty($phone)) return '';
    $phone = preg_replace('/[^0-9]/', '', $phone);
    if (strlen($phone) == 11 && substr($phone, 0, 1) == '0') {
        $phone = '88' . $phone;
    }
    return $phone;
}

function sendSMS($pdo, $phone, $message, $staff_id = 0, $sms_log_id = 0, &$inserted_log_id = null) {
    // Suppress SMS if explicitly disabled for this client (phone number match)
    if (!empty($phone)) {
        try {
            $stmt_check = $pdo->prepare("SELECT send_sms FROM " . TBL_USERS . " WHERE (phone = ? OR phone2 = ?) AND send_sms = 0 LIMIT 1");
            $stmt_check->execute([$phone, $phone]);
            if ($stmt_check->fetch()) {
                return false; 
            }
        } catch (Exception $e) {
            // Ignore database/migration discrepancies
        }
    }

    if ($staff_id == 0 && isset($_SESSION['admin_id'])) {
        $staff_id = $_SESSION['admin_id'];
    }

    $staff = null;
    if ($staff_id > 0) {
        try {
            $stmt = $pdo->prepare("SELECT role, sms_config, sms_balance, sms_rate, can_use_global_sms FROM ".TBL_STAFF." WHERE id=?");
            $stmt->execute([$staff_id]);
            $staff = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            if ($e->getCode() == '42S22' || strpos($e->getMessage(), '1054') !== false) {
                try {
                    $pdo->exec("ALTER TABLE " . TBL_STAFF . " ADD COLUMN sms_config TEXT NULL");
                    $stmt = $pdo->prepare("SELECT role, sms_config, sms_balance, sms_rate, can_use_global_sms FROM ".TBL_STAFF." WHERE id=?");
                    $stmt->execute([$staff_id]);
                    $staff = $stmt->fetch(PDO::FETCH_ASSOC);
                } catch (Exception $ex) {
                    error_log("Failed to auto-migrate/query sms_config in sendSMS: " . $ex->getMessage());
                }
            } else {
                error_log("Database error in sendSMS: " . $e->getMessage());
            }
        }
    }

    $is_admin = $staff && in_array(strtolower(trim($staff['role'] ?? '')), ['admin', 'super admin']);
    
    $local_config = [];
    if ($staff && !empty($staff['sms_config'])) {
        $local_config = json_decode($staff['sms_config'], true) ?: [];
    }

    $has_local_api = !empty($local_config['sms_api_url']) || !empty($local_config['sms_gateway_type']);

    if ($has_local_api) {
        $gateway_type = $local_config['sms_gateway_type'] ?? 'custom';
        $api_url = $local_config['sms_api_url'] ?? '';
        $api_key = $local_config['sms_api_key'] ?? '';
        $sender_id = $local_config['sms_sender_id'] ?? '';
        $is_enabled = $local_config['sms_enabled'] ?? '';
        $is_using_global = false;
    } else {
        $gateway_type = get_opt($pdo, 'sms_gateway_type', 'custom');
        $api_url = get_opt($pdo, 'sms_api_url');
        $api_key = get_opt($pdo, 'sms_api_key');
        $sender_id = get_opt($pdo, 'sms_sender_id');
        $is_enabled = get_opt($pdo, 'sms_enabled');
        $is_using_global = true;
    }

    if (!$is_enabled || $is_enabled === '0' || ($gateway_type === 'custom' && !$api_url) || !$phone || !$message) return false;

    // Balance check for resellers using Global API
    if ($is_using_global && !$is_admin && $staff) {
        if (($staff['can_use_global_sms'] ?? 0) == 0) return false; // Permission denied
        $balance = floatval($staff['sms_balance']);
        $rate = floatval($staff['sms_rate']);
        if ($balance < $rate) {
            writeLog($pdo, 'System', 'SMS Error', $staff_id, "Insufficient SMS balance (Bal: $balance, Rate: $rate) for $phone");
            return false;
        }
    }

    // Clean phone number
    $phone = normalize_bd_phone($phone);

    $isUnicode = preg_match('/[^\x00-\x7F]/', $message);
    $charCount = mb_strlen($message, 'UTF-8');
    $isLong = false;
    if ($isUnicode) {
        if ($charCount > 70) {
            $isLong = true;
        }
    } else {
        if ($charCount > 160) {
            $isLong = true;
        }
    }

    $url = '';
    $post_data = null;
    $headers = [];

    if ($gateway_type === 'custom') {
        // Replace placeholders in URL if any
        $url = str_replace(
            ['{KEY}', '{SENDER}', '{MSG}', '{NUMBER}'],
            [$api_key, $sender_id, urlencode($message), $phone],
            $api_url
        );

        // If no placeholders, treat as a generic GET request with standard parameters
        if (strpos($api_url, '{') === false) {
            $params = [
                'api_key' => $api_key,
                'senderid' => $sender_id,
                'number' => $phone,
                'message' => $message
            ];
            $url = $api_url . (strpos($api_url, '?') === false ? '?' : '&') . http_build_query($params);
        }
    } elseif ($gateway_type === 'sheba_http') {
        $params = [
            'apikey' => $api_key,
            'sender' => $sender_id,
            'msisdn' => $phone,
            'smstext' => $message
        ];
        if ($isLong) {
            $params['type'] = 'long';
        }
        if ($isUnicode) {
            $params['smsformat'] = '8';
        }
        $url = "https://api.automas.com.bd/smsapiv3?" . http_build_query($params);
    } elseif ($gateway_type === 'sheba_json') {
        $url = "https://api.automas.com.bd/smsapiv4";
        $payload = [
            'api_key' => $api_key,
            'senderid' => $sender_id,
            'type' => $isLong ? 'long' : 'text',
            'scheduledDateTime' => '',
            'msg' => $message,
            'contacts' => $phone
        ];
        if ($isUnicode) {
            $payload['smsformat'] = 8;
        }
        $post_data = json_encode($payload);
        $headers[] = 'Content-Type: application/json';
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    if ($gateway_type === 'sheba_json') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $post_data);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }
    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        if ($sms_log_id > 0) {
            $pdo->prepare("UPDATE ".TBL_SMS_LOGS." SET response=?, status=? WHERE id=?")
                ->execute(["Error: $err", 'Error', $sms_log_id]);
            $inserted_log_id = $sms_log_id;
        } else {
            $pdo->prepare("INSERT INTO ".TBL_SMS_LOGS." (staff_id, phone, message, response, status) VALUES (?,?,?,?,?)")
                ->execute([$staff_id, $phone, $message, "Error: $err", 'Error']);
            $inserted_log_id = $pdo->lastInsertId();
        }
        writeLog($pdo, 'System', 'SMS Error', $staff_id, "SMS to $phone Error: $err | Msg: " . substr($message, 0, 150));
        return false;
    }

    // Check status code for Sheba SMS gateways
    $api_failed = false;
    $api_err_msg = '';
    if ($gateway_type === 'sheba_http' || $gateway_type === 'sheba_json') {
        $status_meanings = [
            0 => 'Success',
            101 => 'Invalid Message Length',
            102 => 'Sender Not Valid',
            103 => 'Authentication Failed',
            104 => 'Invalid User',
            105 => 'Invalid MSISDN',
            106 => 'Incorrect API Key',
            107 => 'User Account Suspended',
            108 => 'IP Address Not Allowed',
            109 => 'API Access Not Allowed',
            110 => 'Do Not Disturb (DND)',
            111 => 'Spam Word Detected in Message',
            1000 => 'Insufficient Balance',
            2300 => 'Destination Route Issue',
            2400 => 'Destination Route Not Permitted',
            3300 => 'System Error',
            2000 => 'Destination Provider Unavailable',
            3000 => 'Destination Provider Unavailable',
            4000 => 'Destination Provider Unavailable'
        ];

        $res_arr = json_decode($response, true);
        $sms_reports = [];
        if (is_array($res_arr)) {
            if (isset($res_arr['response']) && is_array($res_arr['response'])) {
                $sms_reports = $res_arr['response'];
            } else {
                $sms_reports = $res_arr;
            }
        }
        
        $status_code = null;
        if (is_array($sms_reports) && isset($sms_reports[0]) && is_array($sms_reports[0])) {
            $status_code = isset($sms_reports[0]['status']) ? intval($sms_reports[0]['status']) : null;
        } elseif (is_array($res_arr) && isset($res_arr['status'])) {
            $status_code = intval($res_arr['status']);
        }

        if ($status_code !== null && $status_code !== 0) {
            $api_failed = true;
            $meaning = $status_meanings[$status_code] ?? 'Unknown Error';
            $api_err_msg = "Error $status_code: $meaning";
        }
    }

    if ($api_failed) {
        $log_response = $api_err_msg . " | Raw: " . substr($response, 0, 200);
        if ($sms_log_id > 0) {
            $pdo->prepare("UPDATE ".TBL_SMS_LOGS." SET response=?, status=? WHERE id=?")
                ->execute([$log_response, 'Error', $sms_log_id]);
            $inserted_log_id = $sms_log_id;
        } else {
            $pdo->prepare("INSERT INTO ".TBL_SMS_LOGS." (staff_id, phone, message, response, status) VALUES (?,?,?,?,?)")
                ->execute([$staff_id, $phone, $message, $log_response, 'Error']);
            $inserted_log_id = $pdo->lastInsertId();
        }
        writeLog($pdo, 'System', 'SMS Error', $staff_id, "SMS to $phone API Failure: $api_err_msg | Msg: " . substr($message, 0, 150));
        return false;
    }

    // Success - Deduct balance if applicable
    if ($is_using_global && !$is_admin && $staff) {
        $rate = floatval($staff['sms_rate']);
        $pdo->prepare("UPDATE ".TBL_STAFF." SET sms_balance = sms_balance - ? WHERE id=?")->execute([$rate, $staff_id]);
    }

    if ($sms_log_id > 0) {
        $pdo->prepare("UPDATE ".TBL_SMS_LOGS." SET response=?, status=? WHERE id=?")
            ->execute([substr($response, 0, 500), 'Sent', $sms_log_id]);
        $inserted_log_id = $sms_log_id;
    } else {
        $pdo->prepare("INSERT INTO ".TBL_SMS_LOGS." (staff_id, phone, message, response, status) VALUES (?,?,?,?,?)")
            ->execute([$staff_id, $phone, $message, substr($response, 0, 500), 'Sent']);
        $inserted_log_id = $pdo->lastInsertId();
    }
    writeLog($pdo, 'System', 'SMS Sent', $staff_id, "SMS to $phone: " . substr($message, 0, 200) . " | Response: " . substr($response, 0, 50));
    return true;
}

function queueSMS($pdo, $phone, $message, $staff_id = 0) {
    if ($staff_id == 0 && isset($_SESSION['admin_id'])) {
        $staff_id = $_SESSION['admin_id'];
    }
    
    // Clean phone number
    $phone = normalize_bd_phone($phone);
    
    $stmt = $pdo->prepare("INSERT INTO " . TBL_SMS_LOGS . " (staff_id, phone, message, status, response) VALUES (?, ?, ?, 'Pending', '')");
    return $stmt->execute([$staff_id, $phone, $message]);
}

function sendEmail($pdo, $to, $subject, $body) {
    if (!$to) return false;

    // Get SMTP Configuration
    $host = get_opt($pdo, 'smtp_host');
    $port = get_opt($pdo, 'smtp_port');
    $user = get_opt($pdo, 'smtp_user');
    $pass = get_opt($pdo, 'smtp_pass');
    $secure = get_opt($pdo, 'smtp_secure');
    $fromName = get_opt($pdo, 'smtp_from_name', 'System');
    $fromEmail = get_opt($pdo, 'smtp_from_email'); // Get custom from email
    
    // If SMTP is not configured, fallback to PHP mail()
    if (!$host || !$user) {
        $headers = "MIME-Version: 1.0" . "\r\n";
        $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
        $sender = $fromEmail ? $fromEmail : "noreply@" . $_SERVER['HTTP_HOST'];
        $headers .= "From: $fromName <$sender>" . "\r\n";
        if(mail($to, $subject, $body, $headers)) return true;
        
        // Failed and no SMTP
        return false;
    }

    // Auto-fix for common misconfiguration (Port 465 requires SSL, not TLS)
    if ($port == 465 && $secure == 'tls') {
        $secure = 'ssl';
    }

    $smtp = new SimpleSMTP($host, $port, $user, $pass, $secure);
    $result = $smtp->send($to, $subject, $body, $fromName, $fromEmail);
    
    if (!$result) {
        // Log error
        $log = $smtp->getLog();
        writeLog($pdo, 'System', 'Email Error', 0, "Failed to send email to $to: " . substr($log, 0, 200));
    }
    
    return $result;
}

// --- GATEWAY HELPER FOR RESELLERS ---
// --- ONLINE PAYMENT SUCCESS HANDLER ---
function processOnlinePaymentSuccess($pdo, $user_id, $amount, $gateway, $response) {
    // 1. Fetch User Details
    $stmt = $pdo->prepare("SELECT id, user_id, name, phone, manager_id, user_package, bill_amount, discount, due, current_bill_date, credit_taken, credit_days, router_id, password, promise_enabled, promise_date FROM " . TBL_USERS . " WHERE id=?");
    $stmt->execute([$user_id]);
    $u = $stmt->fetch();
    
    if (!$u) {
        // Check if it's a staff member (Wallet Top-up)
        $stmt_staff = $pdo->prepare("SELECT * FROM " . TBL_STAFF . " WHERE id=?");
        $stmt_staff->execute([$user_id]);
        $s = $stmt_staff->fetch();
        if ($s) {
             // 1. Update Staff Balance
             $pdo->prepare("UPDATE " . TBL_STAFF . " SET balance = balance + ? WHERE id=?")->execute([$amount, $user_id]);
             
             // 2. Log Transaction for Staff
             log_tx($pdo, $user_id, 'Income', $amount, "Online Wallet Recharge via $gateway", 'OnlineGateway');
             
             // 3. Log Finance (Master Ledger)
             log_finance($pdo, 'Income', $amount, $gateway, 'Wallet Recharge', $user_id, "Staff Wallet Recharge: {$s['username']} via $gateway");
             
             // 4. Audit Log
             writeLog($pdo, 'OnlineGateway', 'Wallet Topup', $user_id, "Staff {$s['username']} topped up wallet via $gateway. Amount: ৳$amount");
             
             return true;
        }
        return false;
    }

    $user_id_int = $u['id'];
    $billAmount = floatval($u['bill_amount'] ?? 0);
    $discount = floatval($u['discount'] ?? 0);
    $netMonthlyBill = $billAmount - $discount;
    if ($netMonthlyBill <= 0) $netMonthlyBill = $billAmount;
    
    $paidAmount = floatval($amount);
    $currentDue = floatval($u['due']);
    
    // Calculate Promise Due
    $extra_used_days = 0;
    $promise_due = 0;
    $promise_adjustment_log = "";
    if (isset($u['promise_enabled']) && $u['promise_enabled'] == 1 && !empty($u['promise_date'])) {
        $today = date('Y-m-d');
        $expire_date = $u['current_bill_date'];
        if ($today > $expire_date) {
            $end_use_date = ($today < $u['promise_date']) ? $today : $u['promise_date'];
            $diff = strtotime($end_use_date) - strtotime($expire_date);
            $extra_used_days = max(0, round($diff / 86400));
            if ($extra_used_days > 0) {
                $daily_rate = $netMonthlyBill / 30;
                $promise_due = round($extra_used_days * $daily_rate, 2);
            }
        }
    }

    // First, deduct any existing due from the paid amount
    $new_due = $currentDue;
    if ($currentDue > 0) {
        if ($paidAmount >= $currentDue) {
            $paidAmount -= $currentDue;
            $new_due = 0;
        } else {
            $new_due = $currentDue - $paidAmount;
            $paidAmount = 0;
        }
    }

    // Deduct Promise Due
    if ($promise_due > 0) {
        if ($paidAmount >= $promise_due) {
            $paidAmount -= $promise_due;
            $promise_adjustment_log = " | Promise Adjustment: Deducted ৳{$promise_due} for {$extra_used_days} days";
        } else {
            $leftover_promise_due = $promise_due - $paidAmount;
            $new_due += $leftover_promise_due;
            $promise_adjustment_log = " | Promise Adjustment: Deducted ৳{$paidAmount} (Partial of ৳{$promise_due}) for {$extra_used_days} days, remaining ৳{$leftover_promise_due} added to due";
            $paidAmount = 0;
        }
    }
    
    // Remaining paidAmount is used for recharge days
    $daysToAdd = 0;
    if ($netMonthlyBill > 0 && $paidAmount > 0) {
        $perDay = $netMonthlyBill / 30;
        $daysToAdd = round($paidAmount / $perDay);
    }
    
    // 3. Calculate New Expiry
    $deductDays = ($u['credit_taken'] == 1) ? (int)$u['credit_days'] : 0;
    $actualDaysToAdd = $daysToAdd - $deductDays;
    
    // User wants current date + days
    $baseDate = date('Y-m-d');
    // If user is already active and expiry is in future, we might want to STACK or overwrite.
    // User said "current date er sate 30din jok kora hok", which implies starting from today.
    // However, if they have time left, usually ISPs stack it. 
    // If u['current_bill_date'] is in future, we use it as base.
    if (!empty($u['current_bill_date']) && $u['current_bill_date'] > $baseDate) {
        $baseDate = $u['current_bill_date'];
    }

    $newExpiry = $baseDate;
    if ($actualDaysToAdd != 0) {
        $sign = $actualDaysToAdd > 0 ? '+' : '-';
        $absDays = abs($actualDaysToAdd);
        $newExpiry = date('Y-m-d', strtotime($baseDate . " {$sign} {$absDays} days"));
    }

    // 4. Update User Account
    $pdo->prepare("UPDATE " . TBL_USERS . " SET current_bill_date = ?, due = ?, credit_taken = 0, credit_days = 0, status = 'Active', bill_position = 'Active', promise_enabled = 0, promise_date = NULL WHERE id=?")
        ->execute([$newExpiry, $new_due, $user_id_int]);

    // 5. MikroTik Sync
    if ($u['router_id'] > 0) {
        $r = safeFetch($pdo, "SELECT * FROM " . TBL_ROUTERS . " WHERE id=?", [$u['router_id']]);
        if ($r) {
            require_once __DIR__ . '/../classes/MikrotikApp.php';
            $svc = safeFetch($pdo, "SELECT * FROM " . TBL_SERVICES . " WHERE name=?", [$u['user_package']]);
            $profile = $svc ? $svc['mikrotik_profile_name'] : '';
            $mk = new MikrotikApp($r);
            $mk->toggle($u['user_id'], true, $profile, $u['password'] ?? '');
        }
    }

    // 6. Calculate Package Cost & Log Profit/Finance
    $serviceCost = 0;
    $managerID = (int)($u['manager_id'] ?? 0);
    $mgrRole = 'Admin';
    if ($managerID > 0) {
        $stmt = $pdo->prepare("SELECT role FROM " . TBL_STAFF . " WHERE id=?");
        $stmt->execute([$managerID]);
        $mgrRole = $stmt->fetchColumn() ?: 'Admin';
    } else {
        $managerID = 1; // Fallback to root admin
    }

    if ($daysToAdd > 0) {
        $svc = safeFetch($pdo, "SELECT id FROM " . TBL_SERVICES . " WHERE name=?", [$u['user_package'] ?? '']);
        if ($svc) {
            $monthlyCost = getBuyPrice($pdo, $u['manager_id'], $svc['id']);
            // If buying price is 0 but sell price is > 0, we might want to check that.
            $serviceCost = round(($monthlyCost / 30) * $daysToAdd, 2);
        }
    }

    // A. LOG INCOME (Master Ledger)
    log_finance($pdo, 'Income', $amount, $gateway, 'Online Payment', $user_id_int, "Bill Collection: Online payment from {$u['user_id']} via $gateway");
    
    // B. LOG INCOME (Staff/Manager Ledger)
    log_tx($pdo, $managerID, 'Income', $amount, "Online payment from client {$u['user_id']} via $gateway", 'OnlineGateway');

    // C. LOG EXPENSE / PROFIT (If there is a cost)
    if ($serviceCost > 0) {
        // Master Ledger Expense
        log_finance($pdo, 'Expense', -$serviceCost, 'System', 'Package Cost', $user_id_int, "Recharge Cost for client {$u['user_id']} (Online)");
        
        // Profit Log
        log_profit($pdo, $managerID, $user_id_int, $u['user_id'], $amount, $serviceCost, "Online $gateway");

        // If it's a Reseller, deduct from their balance
        if ($managerID > 0 && !isAdminRole($mgrRole)) {
            $pdo->prepare("UPDATE " . TBL_STAFF . " SET balance = balance - ? WHERE id=?")->execute([$serviceCost, $managerID]);
            log_tx($pdo, $managerID, 'Expense', $serviceCost, "Recharge Cost (Online): {$u['user_id']}", 'System');
        }
    }

    // 7. Record Recharge History & Log
    $admin_name = 'OnlineGateway';
    
    // Resolve transaction ID from response
    $trx_id = '';
    $temp_resp = $response;
    if (is_string($temp_resp)) {
        $decoded = json_decode($temp_resp, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $temp_resp = $decoded;
        }
    }
    if (is_array($temp_resp)) {
        $trx_id = $temp_resp['trx_id'] ?? $temp_resp['trxID'] ?? $temp_resp['transaction_id'] ?? $temp_resp['paymentID'] ?? $temp_resp['payment_ref_id'] ?? '';
    } elseif (is_object($temp_resp)) {
        $trx_id = $temp_resp->trx_id ?? $temp_resp->trxID ?? $temp_resp->transaction_id ?? $temp_resp->paymentID ?? $temp_resp->payment_ref_id ?? '';
    }
    
    $trx_suffix = '';
    if (!empty($trx_id)) {
        $trx_suffix = " | Trx: " . $trx_id;
    }

    writeLog($pdo, $admin_name, 'Recharge', $user_id_int, "Online Recharged client: {$u['user_id']} for $daysToAdd days - Amount: ৳$amount via $gateway. New Expiry: $newExpiry" . $trx_suffix . $promise_adjustment_log, $managerID);

    $log_id = $pdo->lastInsertId();

    // 8. Send SMS Confirmation
    $pay_tpl = get_sms_setting($pdo, $u['manager_id'], 'sms_tpl_payment');
    if (!$pay_tpl) $pay_tpl = "Dear [NAME], we have received [AMOUNT]৳ for ID [ID]. New Expiry: [DATE]";
    $msg_to_send = str_replace(['[NAME]', '[ID]', '[AMOUNT]', '[DATE]'], [$u['name'], $u['user_id'], $amount, date('d-m-Y', strtotime($newExpiry))], $pay_tpl);
    if (get_sms_setting($pdo, $u['manager_id'], 'sms_enabled_payment') == '1') {
        sendSMS($pdo, $u['phone'], $msg_to_send, $u['manager_id']);
    }

    return $log_id ?: true;
}

function get_gateway_credentials($pdo, $staff_id) {
    $keys = [
        'piprapay_url', 'piprapay_api_key', 
        'bkash_sandbox', 'bkash_app_key', 'bkash_app_secret', 'bkash_username', 'bkash_password',
        'bkash_sandbox_app_key', 'bkash_sandbox_app_secret', 'bkash_sandbox_username', 'bkash_sandbox_password',
        'bkash_shop_enabled', 'bkash_shop_base_url',
        'nagad_sandbox', 'nagad_merchant_id', 'nagad_merchant_phone', 'nagad_public_key', 'nagad_private_key',
        'sslcz_sandbox', 'sslcz_store_id', 'sslcz_store_passwd', 'sslcz_enabled'
    ];
    
    $config = [];
    $staff_config = [];
    if ($staff_id > 0) {
        $stmt = $pdo->prepare("SELECT gateway_config FROM " . TBL_STAFF . " WHERE id = ?");
        $stmt->execute([$staff_id]);
        $json = $stmt->fetchColumn();
        if ($json) $staff_config = json_decode($json, true) ?: [];
    }

    foreach ($keys as $key) {
        // 1. Staff Specific (Priority 1)
        if (isset($staff_config[$key]) && $staff_config[$key] !== '') {
            $config[$key] = $staff_config[$key];
        } else {
            // 2. Tenant Local Setting (Priority 2)
            $local = get_opt($pdo, $key, null);
            if ($local !== null && $local !== '') {
                $config[$key] = $local;
            } else {
                // 3. Global Setting (Priority 3)
                $config[$key] = get_global_opt($key);
            }
        }
    }
    return $config;
}

/**
 * Get PDO connection to the Master (Main) database.
 * Used when a tenant needs to access global settings (like Super Admin's Payment Gateway).
 */
function get_master_pdo() {
    static $master_pdo = null;
    if ($master_pdo !== null) return $master_pdo;

    // If we are already on the main domain, just return the global $pdo
    if (!defined('CURRENT_TENANT')) {
        global $pdo;
        $master_pdo = $pdo;
        return $master_pdo;
    }

    $config_file = __DIR__ . '/db_config.php';
    if (file_exists($config_file)) {
        $content = file_get_contents($config_file);
        
        // Use a more robust regex to handle various spacing and quote styles
        $pattern = "/define\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]*)['\"]\s*\)/i";
        preg_match_all($pattern, $content, $matches, PREG_SET_ORDER);
        
        $conf = [];
        foreach ($matches as $m) {
            $conf[$m[1]] = $m[2];
        }

        if (isset($conf['DB_HOST'], $conf['DB_NAME'], $conf['DB_USER'], $conf['DB_PASS'])) {
            try {
                $host = $conf['DB_HOST'];
                $db   = $conf['DB_NAME'];
                $user = $conf['DB_USER'];
                $pass = $conf['DB_PASS'];

                $dsn = "mysql:host=$host;dbname=$db;charset=utf8";
                $master_pdo = new PDO($dsn, $user, $pass);
                $master_pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $master_pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                return $master_pdo;
            } catch (Exception $e) {
                // If localhost fails, try 127.0.0.1
                if ($conf['DB_HOST'] === 'localhost') {
                    try {
                        $dsn = "mysql:host=127.0.0.1;dbname=" . $conf['DB_NAME'] . ";charset=utf8";
                        $master_pdo = new PDO($dsn, $conf['DB_USER'], $conf['DB_PASS']);
                        $master_pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                        return $master_pdo;
                    } catch (Exception $e2) {
                        return null;
                    }
                }
                return null;
            }
        }
    }
    return null;
}

/**
 * Fetch a setting from the Master database regardless of current tenant.
 */
function get_global_opt($key, $default = '') {
    $mpdo = get_master_pdo();
    if (!$mpdo) return get_opt($GLOBALS['pdo'], $key, $default); // Fallback to local if master fails
    
    try {
        $stmt = $mpdo->prepare("SELECT key_value FROM settings WHERE key_name=?");
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        return $val !== false ? $val : $default;
    } catch (Exception $e) {
        return $default;
    }
}

/**
 * Execute command safely, returning null if shell_exec is undefined or disabled.
 */
function safe_shell_exec($cmd) {
    if (function_exists('shell_exec')) {
        return @shell_exec($cmd);
    }
    return null;
}

/**
 * Update /etc/ppp/chap-secrets with the given username and password.
 * Removes any existing entry for the username and appends a new one.
 * Format: "username pptp password *"
 * Requires sudo privileges (NOPASSWD) for the web user.
 */
function update_ppp_secrets($username, $password) {
    $escaped_user = escapeshellarg($username);
    $escaped_pass = escapeshellarg($password);
    $secrets_file = '/etc/ppp/chap-secrets';
    // Remove existing lines for this user
    safe_shell_exec("sudo sed -i '/^{$username} /d' {$secrets_file}");
    // Append new secret
    $line = "{$username} pptp {$password} *";
    $escaped_line = escapeshellarg($line);
    safe_shell_exec("echo {$escaped_line} | sudo tee -a {$secrets_file} > /dev/null");
    // Ensure correct permissions
    safe_shell_exec("sudo chmod 600 {$secrets_file}");
}

function ensure_database_indexes($pdo) {
    $queries = [
        "ALTER TABLE " . TBL_USERS . " ADD INDEX idx_users_status (status)",
        "ALTER TABLE " . TBL_USERS . " ADD INDEX idx_users_manager (manager_id)",
        "ALTER TABLE " . TBL_USERS . " ADD INDEX idx_users_due (due)",
        "ALTER TABLE " . TBL_USERS . " ADD INDEX idx_users_bill_date (current_bill_date)",
        "ALTER TABLE " . TBL_USERS . " ADD INDEX idx_users_joining (joining_date)",
        "ALTER TABLE " . TBL_USERS . " ADD INDEX idx_users_package (user_package)",
        "ALTER TABLE " . TBL_USERS . " ADD INDEX idx_users_zone (zone_id)",
        "ALTER TABLE " . TBL_USERS . " ADD INDEX idx_users_router (router_id)",

        "ALTER TABLE " . TBL_TX . " ADD INDEX idx_tx_type (type)",
        "ALTER TABLE " . TBL_TX . " ADD INDEX idx_tx_created (created_at)",
        "ALTER TABLE " . TBL_TX . " ADD INDEX idx_tx_staff (staff_id)",

        "ALTER TABLE tickets ADD INDEX idx_tickets_status (status)",
        "ALTER TABLE tickets ADD INDEX idx_tickets_client (client_id)",

        "ALTER TABLE " . TBL_LOGS . " ADD INDEX idx_audit_target (target_id)",
        "ALTER TABLE " . TBL_LOGS . " ADD INDEX idx_audit_action (action_type)",
        "ALTER TABLE " . TBL_LOGS . " ADD INDEX idx_audit_time (timestamp)"
    ];

    foreach ($queries as $query) {
        try {
            $pdo->exec($query);
        } catch (\Exception $e) {
            // Fails silently if index already exists
        }
    }
}
require_once __DIR__ . '/tenant_helpers.php';

if (!function_exists('get_global_online_cache_path')) {
    function get_global_online_cache_path() {
        $suffix = '';
        if (defined('TENANT_OVERRIDE')) {
            $suffix = '_' . TENANT_OVERRIDE;
        } elseif (defined('CURRENT_TENANT')) {
            $suffix = '_' . CURRENT_TENANT;
        }
        return __DIR__ . '/../cache/global_online' . $suffix . '.json';
    }
}

if (!function_exists('get_global_online_lock_path')) {
    function get_global_online_lock_path() {
        $suffix = '';
        if (defined('TENANT_OVERRIDE')) {
            $suffix = '_' . TENANT_OVERRIDE;
        } elseif (defined('CURRENT_TENANT')) {
            $suffix = '_' . CURRENT_TENANT;
        }
        return __DIR__ . '/../cache/global_online' . $suffix . '.lock';
    }
}

if (!function_exists('pause_client_days')) {
    function pause_client_days($pdo, $user_id) {
        try {
            $pdo->exec("ALTER TABLE " . TBL_USERS . " ADD COLUMN paused_remaining_days INT DEFAULT 0");
        } catch (Exception $e) { }

        $u = safeFetch($pdo, "SELECT current_bill_date FROM " . TBL_USERS . " WHERE id=?", [$user_id]);
        if ($u && !empty($u['current_bill_date'])) {
            $today = new DateTime();
            $expire = new DateTime($u['current_bill_date']);
            $remaining = 0;
            if ($expire > $today) {
                $remaining = $today->diff($expire)->days;
            }
            $pdo->prepare("UPDATE " . TBL_USERS . " SET paused_remaining_days=? WHERE id=?")->execute([$remaining, $user_id]);
        }
    }
}

if (!function_exists('resume_client_days')) {
    function resume_client_days($pdo, $user_id) {
        try {
            $pdo->exec("ALTER TABLE " . TBL_USERS . " ADD COLUMN paused_remaining_days INT DEFAULT 0");
        } catch (Exception $e) { }

        $u = safeFetch($pdo, "SELECT paused_remaining_days FROM " . TBL_USERS . " WHERE id=?", [$user_id]);
        if ($u && isset($u['paused_remaining_days']) && $u['paused_remaining_days'] > 0) {
            $days = (int)$u['paused_remaining_days'];
            $new_expire = (new DateTime())->modify("+{$days} days")->format('Y-m-d');
            $pdo->prepare("UPDATE " . TBL_USERS . " SET current_bill_date=?, paused_remaining_days=0 WHERE id=?")->execute([$new_expire, $user_id]);
        }
    }
}

if (!function_exists('get_app_encryption_key')) {
    function get_app_encryption_key() {
        $key_file = __DIR__ . '/.app_key';
        if (!file_exists($key_file)) {
            $key = bin2hex(random_bytes(32));
            @file_put_contents($key_file, $key);
        } else {
            $key = trim(@file_get_contents($key_file));
        }
        if (empty($key)) {
            $key = md5(DB_NAME . DB_USER . 'voice_secret_salt');
        }
        return hash('sha256', $key, true);
    }
}

if (!function_exists('encrypt_voice_token')) {
    function encrypt_voice_token($token) {
        if (empty($token)) return '';
        $key = get_app_encryption_key();
        $iv = random_bytes(16);
        $ciphertext = openssl_encrypt($token, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
        return base64_encode($iv . $ciphertext);
    }
}

if (!function_exists('decrypt_voice_token')) {
    function decrypt_voice_token($encrypted) {
        if (empty($encrypted)) return '';
        $data = base64_decode($encrypted);
        if (strlen($data) <= 16) return '';
        $key = get_app_encryption_key();
        $iv = substr($data, 0, 16);
        $ciphertext = substr($data, 16);
        return openssl_decrypt($ciphertext, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
    }
}

if (!function_exists('get_voice_setting')) {
    function get_voice_setting($pdo, $staff_id, $key, $fallback = true) {
        if ($staff_id > 0) {
            try {
                $stmt = $pdo->prepare("SELECT role, voice_config FROM ".TBL_STAFF." WHERE id=?");
                $stmt->execute([$staff_id]);
                $row = $stmt->fetch();
                
                if ($row) {
                    $role = strtolower(trim($row['role'] ?? ''));
                    $is_admin = ($role === 'admin' || $role === 'super admin' || $role === 'administrator' || $role === 'system admin');
                    
                    if ($is_admin) {
                        $val = get_opt($pdo, $key, '');
                        if ($key === 'voice_api_token' && !empty($val)) {
                            return decrypt_voice_token($val);
                        }
                        return $val;
                    }
                    
                    $config = $row['voice_config'];
                    if ($config) {
                        $data = json_decode($config, true);
                        if (isset($data[$key]) && $data[$key] !== '') {
                            $val = $data[$key];
                            if ($key === 'voice_api_token' && !empty($val)) {
                                return decrypt_voice_token($val);
                            }
                            return $val;
                        }
                    }
                }
            } catch (PDOException $e) {
                if ($e->getCode() == '42S22' || strpos($e->getMessage(), '1054') !== false) {
                    try {
                        $pdo->exec("ALTER TABLE " . TBL_STAFF . " ADD COLUMN voice_config TEXT NULL");
                    } catch (Exception $ex) {
                        error_log("Failed to auto-migrate/query voice_config for staff: " . $ex->getMessage());
                    }
                } else {
                    error_log("Database error in get_voice_setting: " . $e->getMessage());
                }
            }
        }
        if ($fallback) {
            $val = get_opt($pdo, $key, '');
            if ($key === 'voice_api_token' && !empty($val)) {
                return decrypt_voice_token($val);
            }
            return $val;
        }
        return '';
    }
}

if (!function_exists('normalize_bd_phone_11')) {
    function normalize_bd_phone_11($phone) {
        if (empty($phone)) return '';
        $phone = preg_replace('/[^0-9]/', '', $phone);
        
        // Remove leading 880 or 88 or 00880
        if (substr($phone, 0, 5) === '00880') {
            $phone = substr($phone, 4);
        } elseif (substr($phone, 0, 3) === '880') {
            $phone = substr($phone, 2);
        } elseif (substr($phone, 0, 2) === '88' && strlen($phone) > 11) {
            $phone = substr($phone, 2);
        }
        
        // Ensure it is 11 digits and starts with 01
        if (strlen($phone) === 11 && substr($phone, 0, 2) === '01') {
            return $phone;
        }
        return '';
    }
}
?>
