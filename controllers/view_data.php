<?php
// VIEW DATA CONTROLLER
if (!isLoggedIn()) return;

$user_id = $_SESSION['admin_id'];
$username = $_SESSION['admin_username'];
$role = $_SESSION['user_role'];

// Fetch latest balance and permissions
$stmt = $pdo->prepare("SELECT role, parent_id, balance, due_balance, advance_balance_limit, permissions, allowed_packages FROM ".TBL_STAFF." WHERE id=?");
$stmt->execute([$user_id]);
$balance_row = $stmt->fetch();
$parent_id = $balance_row['parent_id'] ?? 0;

// Redirection: If office staff, show parent's balance
if (isOfficeRole($balance_row['role'] ?? '')) {
    if ($parent_id > 0) {
        $p_stmt = $pdo->prepare("SELECT role, balance, due_balance, advance_balance_limit FROM ".TBL_STAFF." WHERE id=?");
        $p_stmt->execute([$parent_id]);
        $p_row = $p_stmt->fetch();
        if ($p_row) {
            $balance_row['balance'] = $p_row['balance'];
            $balance_row['due_balance'] = $p_row['due_balance'];
            $balance_row['advance_balance_limit'] = $p_row['advance_balance_limit'];
            $_SESSION['parent_role'] = $p_row['role'] ?? '';
        }
    } else {
        // Admin staff
        $balance_row['balance'] = 999999; // Represents infinity visually
        $_SESSION['parent_role'] = 'Admin';
    }
}

$_SESSION['parent_id'] = $balance_row['parent_id'] ?? 0;
$_SESSION['user_balance'] = $balance_row['balance'] ?? 0;
$_SESSION['user_permissions'] = json_decode($balance_row['permissions'] ?? '[]', true);
$_SESSION['allowed_packages'] = isset($balance_row['allowed_packages']) && !empty($balance_row['allowed_packages']) ? json_decode($balance_row['allowed_packages'], true) : null;
$my_balance = $_SESSION['user_balance'];
$my_due = $balance_row['due_balance'] ?? 0;
$my_advance_limit = $balance_row['advance_balance_limit'] ?? 0;

// Counts for dashboard/sidebar
$active_total_bill = 0;
$active_total_cost = 0;
$expire_total_bill = 0;
$expire_total_cost = 0;
$due_total_amount = 0;
$count_users = 0;
$active_users = 0;
$free_users = 0;
$promise_active_users = 0;
$due_users = 0;
$expire_users = 0;
$left_users = 0;
$inactive_users = 0;
$expire_today = 0;
$expire_in_2days = 0;
$expire_in_3days = 0;
$online_users = 0;
$offline_users = 0;
$revenue_today = 0;
$open_tickets = 0;
$new_users_this_month = 0;

$stats_owner_id = $user_id;
$stats_role = $role;

if (isOfficeRole($role) && $parent_id > 0) {
    $stats_owner_id = $parent_id;
    $p_role = safeFetch($pdo, "SELECT role FROM ".TBL_STAFF." WHERE id=?", [$parent_id]);
    $stats_role = $p_role['role'] ?? 'Reseller';
}

$managed_ids = getManagedStaffIds($pdo, $stats_owner_id, $stats_role);
// Default to showing only own clients (or parent's clients for office staff)
$effective_ids = [$stats_owner_id];

// Allow Admin to see EVERYTHING if ?global=1 is set
$office_roles = ['administrator', 'supervisor', 'office manager', 'system admin', 'tl', 'executive', 'hr manager', 'accounts manager', 'support engineer', 'sales staff', 'staff'];
if ($managed_ids === 'ALL' && (isset($_GET['global']) || in_array(strtolower($role), $office_roles))) {
    $effective_ids = 'ALL';
}
$placeholders = '';
if (is_array($effective_ids)) {
    // If it's a Reseller, they want to see their whole branch stats on dash
    if (strcasecmp($stats_role, 'Reseller') === 0 && is_array($managed_ids)) {
        $effective_ids = $managed_ids;
    }
    $placeholders = implode(',', array_fill(0, count($effective_ids), '?'));
}

// Dashboard counts are expensive and are not needed by normal tabs.
// Keep the scope variables above available for pages such as Tickets, but only calculate
// dashboard metrics when the Dashboard is actually being rendered.
$current_view_tab = $_GET['tab'] ?? 'dashboard';
$needs_dashboard_stats = ($current_view_tab === '' || $current_view_tab === 'dashboard');

if ($needs_dashboard_stats) {
    $scope_signature = ($effective_ids === 'ALL')
        ? 'ALL'
        : implode(',', array_map('intval', (array)$effective_ids));
    $stats_cache_key = hash('sha256', $user_id . '|' . $role . '|' . $scope_signature . '|' . (isset($_GET['global']) ? 'global' : 'local'));
    $cache_valid = !empty($_SESSION['cached_counts'])
        && !empty($_SESSION['counts_expiry'])
        && (int)$_SESSION['counts_expiry'] > time()
        && ($_SESSION['counts_cache_key'] ?? '') === $stats_cache_key;

    if ($cache_valid) {
        extract($_SESSION['cached_counts']);
    } else {
        $where = '';
        $stats_params = [];
        if ($effective_ids !== 'ALL') {
            $where = " WHERE manager_id IN ($placeholders)";
            $stats_params = $effective_ids;
        }

        // One conditional-aggregation query replaces 15+ separate COUNT/SUM queries.
        $stats_sql = "SELECT
            COUNT(*) AS count_users,
            SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) AS active_users,
            SUM(CASE WHEN status='Free' THEN 1 ELSE 0 END) AS free_users,
            SUM(CASE WHEN status='Promise Active' THEN 1 ELSE 0 END) AS promise_active_users,
            SUM(CASE WHEN status IN ('Active','Expire','Left','Promise Active') AND due > 0 THEN 1 ELSE 0 END) AS due_users,
            SUM(CASE WHEN status='Expire' THEN 1 ELSE 0 END) AS expire_users,
            SUM(CASE WHEN status='Left' THEN 1 ELSE 0 END) AS left_users,
            SUM(CASE WHEN status='Inactive' THEN 1 ELSE 0 END) AS inactive_users,
            COALESCE(SUM(CASE WHEN status IN ('Active','Free','Promise Active') THEN bill_amount ELSE 0 END),0) AS active_total_bill,
            COALESCE(SUM(CASE WHEN status IN ('Active','Expire','Left','Promise Active') AND due > 0 THEN due ELSE 0 END),0) AS due_total_amount,
            COALESCE(SUM(CASE WHEN status='Expire' THEN bill_amount ELSE 0 END),0) AS expire_total_bill,
            SUM(CASE WHEN current_bill_date = CURDATE() AND status <> 'Left' THEN 1 ELSE 0 END) AS expire_today,
            SUM(CASE WHEN current_bill_date = DATE_ADD(CURDATE(), INTERVAL 2 DAY) AND status <> 'Left' THEN 1 ELSE 0 END) AS expire_in_2days,
            SUM(CASE WHEN current_bill_date = DATE_ADD(CURDATE(), INTERVAL 3 DAY) AND status <> 'Left' THEN 1 ELSE 0 END) AS expire_in_3days,
            SUM(CASE WHEN joining_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND joining_date <= LAST_DAY(CURDATE()) THEN 1 ELSE 0 END) AS new_users_this_month
        FROM " . TBL_USERS . $where;

        $stats_stmt = $pdo->prepare($stats_sql);
        $stats_stmt->execute($stats_params);
        $row = $stats_stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $count_users = (int)($row['count_users'] ?? 0);
        $active_users = (int)($row['active_users'] ?? 0);
        $free_users = (int)($row['free_users'] ?? 0);
        $promise_active_users = (int)($row['promise_active_users'] ?? 0);
        $due_users = (int)($row['due_users'] ?? 0);
        $expire_users = (int)($row['expire_users'] ?? 0);
        $left_users = (int)($row['left_users'] ?? 0);
        $inactive_users = (int)($row['inactive_users'] ?? 0);
        $active_total_bill = (float)($row['active_total_bill'] ?? 0);
        $due_total_amount = (float)($row['due_total_amount'] ?? 0);
        $expire_total_bill = (float)($row['expire_total_bill'] ?? 0);
        $expire_today = (int)($row['expire_today'] ?? 0);
        $expire_in_2days = (int)($row['expire_in_2days'] ?? 0);
        $expire_in_3days = (int)($row['expire_in_3days'] ?? 0);
        $new_users_this_month = (int)($row['new_users_this_month'] ?? 0);

        // Calculate package cost totals in one joined query.
        if (isAdminRole($role)) {
            $cost_sql = "SELECT
                COALESCE(SUM(CASE WHEN u.status IN ('Active','Free','Promise Active') THEN s.buying_price ELSE 0 END),0) AS active_cost,
                COALESCE(SUM(CASE WHEN u.status='Expire' THEN s.buying_price ELSE 0 END),0) AS expire_cost
                FROM " . TBL_USERS . " u
                LEFT JOIN " . TBL_SERVICES . " s ON u.user_package = s.name";
        } else {
            $cost_sql = "SELECT
                COALESCE(SUM(CASE WHEN u.status IN ('Active','Free','Promise Active') THEN IFNULL(p.custom_price, s.buying_price) ELSE 0 END),0) AS active_cost,
                COALESCE(SUM(CASE WHEN u.status='Expire' THEN IFNULL(p.custom_price, s.buying_price) ELSE 0 END),0) AS expire_cost
                FROM " . TBL_USERS . " u
                LEFT JOIN " . TBL_SERVICES . " s ON u.user_package = s.name
                LEFT JOIN " . TBL_PRICING . " p ON p.service_id = s.id AND p.staff_id = u.manager_id";
        }
        $cost_params = [];
        if ($effective_ids !== 'ALL') {
            $cost_sql .= " WHERE u.manager_id IN ($placeholders)";
            $cost_params = $effective_ids;
        }
        $cost_stmt = $pdo->prepare($cost_sql);
        $cost_stmt->execute($cost_params);
        $cost_row = $cost_stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $active_total_cost = (float)($cost_row['active_cost'] ?? 0);
        $expire_total_cost = (float)($cost_row['expire_cost'] ?? 0);

        // Today's collection.
        if ($effective_ids === 'ALL') {
            $rev_stmt = $pdo->query("SELECT COALESCE(SUM(amount),0) FROM " . TBL_TX . " WHERE type='Income' AND created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)");
        } else {
            $rev_stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM " . TBL_TX . " WHERE type='Income' AND staff_id IN ($placeholders) AND created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)");
            $rev_stmt->execute($effective_ids);
        }
        $revenue_today = (float)$rev_stmt->fetchColumn();

        // Open ticket count.
        if ($effective_ids === 'ALL') {
            $open_tickets = (int)$pdo->query("SELECT COUNT(*) FROM tickets WHERE status='Open'")->fetchColumn();
        } else {
            $ticket_stmt = $pdo->prepare("SELECT COUNT(*) FROM tickets t JOIN " . TBL_USERS . " u ON t.client_id=u.id WHERE t.status='Open' AND u.manager_id IN ($placeholders)");
            $ticket_stmt->execute($effective_ids);
            $open_tickets = (int)$ticket_stmt->fetchColumn();
        }

        $_SESSION['cached_counts'] = compact(
            'count_users', 'active_users', 'free_users', 'promise_active_users',
            'expire_users', 'left_users', 'inactive_users', 'expire_today',
            'expire_in_2days', 'expire_in_3days', 'revenue_today', 'due_users',
            'active_total_bill', 'active_total_cost', 'due_total_amount',
            'expire_total_bill', 'expire_total_cost', 'open_tickets',
            'new_users_this_month'
        );
        // Short cache keeps Dashboard fresh while repeated clicks/refreshes are instant.
        $_SESSION['counts_expiry'] = time() + 20;
        $_SESSION['counts_cache_key'] = $stats_cache_key;
    }
}

$total_clients = (int)($active_users ?? 0) + (int)($free_users ?? 0) + (int)($promise_active_users ?? 0) + (int)($expire_users ?? 0) + (int)($inactive_users ?? 0);

// --- CHART DATA (Only for Dashboard) ---
$monthly_revenue = array_fill(1, 12, 0);
$monthly_expenses = array_fill(1, 12, 0);
$monthly_new_users = array_fill(1, 12, 0);
$pkg_distribution = [];

if (isset($_GET['tab']) && $_GET['tab'] == 'dashboard' || !isset($_GET['tab'])) {
    $year_start = date('Y') . '-01-01 00:00:00';
    $year_end = date('Y') . '-12-31 23:59:59';

    // Monthly Revenue
    $rev_sql = "SELECT MONTH(created_at) as m, SUM(amount) as total FROM ".TBL_TX." WHERE type='Income' AND created_at >= '$year_start' AND created_at <= '$year_end'";
    $rev_params = [];
    if ($effective_ids !== 'ALL') {
        $rev_sql .= " AND staff_id IN ($placeholders)";
        $rev_params = $effective_ids;
    }
    $rev_sql .= " GROUP BY m";
    $rev_stmt = $pdo->prepare($rev_sql);
    $rev_stmt->execute($rev_params);
    while($row = $rev_stmt->fetch()) {
        $monthly_revenue[$row['m']] = (float)$row['total'];
    }

    // Monthly Expenses
    $sum_expr = isAdminRole($role) ? "admin_cost" : "amount";
    $exp_sql = "SELECT MONTH(created_at) as m, SUM($sum_expr) as total FROM ".TBL_TX." WHERE type='Expense' AND created_at >= '$year_start' AND created_at <= '$year_end'";
    if ($effective_ids !== 'ALL') {
        $exp_sql .= " AND staff_id IN ($placeholders)";
    }
    $exp_sql .= " GROUP BY m";
    $exp_stmt = $pdo->prepare($exp_sql);
    $exp_stmt->execute($rev_params);
    while($row = $exp_stmt->fetch()) {
        $monthly_expenses[$row['m']] = (float)$row['total'];
    }

    // Package Distribution (Active Users)
    $pkg_sql = "SELECT user_package, COUNT(*) as c FROM ".TBL_USERS." WHERE status IN ('Active', 'Free', 'Promise Active')";
    $pkg_params = [];
    if ($effective_ids !== 'ALL') {
        $pkg_sql .= " AND manager_id IN ($placeholders)";
        $pkg_params = $effective_ids;
    }
    $pkg_sql .= " GROUP BY user_package";
    $pkg_stmt = $pdo->prepare($pkg_sql);
    $pkg_stmt->execute($pkg_params);
    while($row = $pkg_stmt->fetch()) {
        $pkg_distribution[$row['user_package']] = (int)$row['c'];
    }

    // Monthly New Users
    $nu_sql = "SELECT MONTH(joining_date) as m, COUNT(*) as c FROM ".TBL_USERS." WHERE joining_date >= '$year_start' AND joining_date <= '$year_end'";
    $nu_params = [];
    if ($effective_ids !== 'ALL') {
        $nu_sql .= " AND manager_id IN ($placeholders)";
        $nu_params = $effective_ids;
    }
    $nu_sql .= " GROUP BY m";
    $nu_stmt = $pdo->prepare($nu_sql);
    $nu_stmt->execute($nu_params);
    while($row = $nu_stmt->fetch()) {
        if ($row['m'] >= 1 && $row['m'] <= 12) {
            $monthly_new_users[$row['m']] = (int)$row['c'];
        }
    }

    // Reseller Summary Calculations
    $show_reseller_summary = false;
    $reseller_staff_ids = [];
    $is_admin = hasRole('Admin') || hasRole('Super Admin');
    $is_reseller = hasRole('Reseller');

    if ($is_admin) {
        $stmt = $pdo->query("SELECT id FROM " . TBL_STAFF . " WHERE role IN ('Reseller', 'SubReseller', 'Sub-Reseller', 'Pop', 'Branch', 'Agent') AND status = 'Active'");
        $reseller_staff_ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if (!empty($reseller_staff_ids)) {
            $show_reseller_summary = true;
        }
    } elseif ($is_reseller) {
        $stmt = $pdo->prepare("SELECT id FROM " . TBL_STAFF . " WHERE parent_id = ? AND role IN ('SubReseller', 'Sub-Reseller', 'Agent') AND status = 'Active'");
        $stmt->execute([$user_id]);
        $reseller_staff_ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if (!empty($reseller_staff_ids)) {
            $show_reseller_summary = true;
        }
    }

    $res_total = 0;
    $res_active = 0;
    $res_joined = 0;
    $res_inactive = 0;
    $res_expired = 0;
    $res_online = 0;
    $res_offline = 0;

    if ($show_reseller_summary && !empty($reseller_staff_ids)) {
        $res_placeholders = implode(',', array_fill(0, count($reseller_staff_ids), '?'));
        
        // Fetch clients grouped by status
        $res_status_counts = safeFetchAll($pdo, "SELECT status, COUNT(*) as cnt FROM " . TBL_USERS . " WHERE manager_id IN ($res_placeholders) GROUP BY status", $reseller_staff_ids);
        
        foreach ($res_status_counts as $row) {
            $st = $row['status'];
            $cnt = (int)$row['cnt'];
            
            if (in_array($st, ['Active', 'Free', 'Promise Active'])) {
                $res_active += $cnt;
            } elseif ($st === 'Inactive') {
                $res_inactive += $cnt;
            } elseif ($st === 'Expire') {
                $res_expired += $cnt;
            }
        }
        
        $res_total = $res_active + $res_inactive + $res_expired;
        
        // Joined This Month
        $res_joined = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_USERS . " WHERE manager_id IN ($res_placeholders) AND joining_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND joining_date <= LAST_DAY(CURDATE())", $reseller_staff_ids)['cnt'] ?? 0;
        
        // Online / Offline count calculation
        $online_data = get_global_online_users($pdo);
        $online_users_list = array_keys($online_data);
        $online_cnt_total = count($online_users_list);
        
        if ($online_cnt_total > 0) {
            $online_placeholders = implode(',', array_fill(0, count($online_users_list), '?'));
            $sql = "SELECT COUNT(*) as cnt FROM " . TBL_USERS . " WHERE user_id IN ($online_placeholders) AND manager_id IN ($res_placeholders)";
            $params = array_merge($online_users_list, $reseller_staff_ids);
            $res_online = safeFetch($pdo, $sql, $params)['cnt'] ?? 0;
        }
        
        // Total monitored (Active, Expire, Promise Active, Free)
        $res_monitored = safeFetch($pdo, "SELECT COUNT(*) as cnt FROM " . TBL_USERS . " WHERE manager_id IN ($res_placeholders) AND status IN ('Active','Expire','Promise Active','Free')", $reseller_staff_ids)['cnt'] ?? 0;
        $res_offline = max(0, $res_monitored - $res_online);
    }
}

// Initial placeholder for online/offline (fetched via AJAX now)
$online_users = 0; // Will be updated by JS
$offline_users = 0; // Will be updated by JS

$GLOBAL_ONLINE_USERS = [];
?>
