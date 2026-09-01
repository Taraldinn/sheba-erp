<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $company_name ?></title>
    <!-- Favicon -->
    <?php $fav_path = get_opt($pdo, 'favicon_path', ''); ?>
    <?php if($fav_path && file_exists(__DIR__ . '/../../' . $fav_path)): ?>
    <link rel="icon" type="image/png" href="<?= $fav_path ?>">
    <?php endif; ?>
    <!-- CSS Libraries -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link href="https://cdn.jsdelivr.net/npm/select2-bootstrap-5-theme@1.3.0/dist/select2-bootstrap-5-theme.min.css" rel="stylesheet" />
    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --sidebar-width: 260px;
            --primary-color: #339af0;
            --bg-body: #f8f9fa;
        }
        body { font-family: 'Inter', sans-serif; background-color: var(--bg-body); color: #2c3e50; margin: 0; }
        /* Fix Dropdown Z-Index */
        .dropdown-menu { z-index: 2050 !important; }
        .sidebar { 
            width: var(--sidebar-width); 
            height: 100vh; 
            background: #1A3955; 
            color: #c1c2c5; 
            position: fixed; 
            left: 0; 
            top: 0; 
            z-index: 1050;
            border-right: 1px solid #373a40;
            transition: transform 0.3s ease;
            overflow-y: auto;
        }
        /* Custom Scrollbar for Sidebar */
        .sidebar::-webkit-scrollbar { width: 6px; }
        .sidebar::-webkit-scrollbar-track { background: #1A3955; }
        .sidebar::-webkit-scrollbar-thumb { background: #373a40; border-radius: 3px; }
        .sidebar::-webkit-scrollbar-thumb:hover { background: #555; }
        .sidebar .nav-link { 
            color: rgba(255, 255, 255, 0.9) !important; padding: 10px 15px; border-radius: 6px; margin: 2px 8px; font-size: 0.9rem;
        }
        .sidebar .nav-link i { color: rgba(255, 255, 255, 0.9) !important; }
        .sidebar .nav-link:hover { background: #2c2e33; color: white !important; }
        .sidebar .nav-link.active { background: #25262b; color: var(--primary-color) !important; font-weight: 600; }
        .sidebar .nav-link.active i { color: var(--primary-color) !important; }
        .sidebar .nav-link[aria-expanded="true"] .fa-chevron-down { transform: rotate(180deg); }
        .sidebar .collapse .nav-link { padding-left: 20px; font-size: 0.85rem; padding-top: 8px; padding-bottom: 8px; }
        .main-wrapper { margin-left: var(--sidebar-width); min-height: 100vh; display: flex; flex-direction: column; transition: 0.3s; }
        /* Fix Dropdown Z-Index - ensure navbar is above content */
        .navbar { 
            background: rgba(255,255,255,0.95) !important; 
            backdrop-filter: blur(8px); 
            border-bottom: 1px solid #dee2e6;
            position: relative;
            z-index: 1030; /* Bootstrap Fixed Navbar Standard */
        }
        /* Ensure Modals are always on top */
        .modal { z-index: 2060 !important; }
        .modal-backdrop { z-index: 2055 !important; }
        .dropdown-menu { 
            z-index: 2000 !important; 
            box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(0,0,0,0.1);
        }
        /* REMOVED z-index: 1 to prevent stacking context trap for modals */
        .main-content { padding: 24px; flex-grow: 1; position: relative; }
        .overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1040; }
        @media (max-width: 768px) {
            .sidebar { transform: translateX(-100%); }
            .sidebar.mobile-show { transform: translateX(0); }
            .main-wrapper { margin-left: 0; }
            .overlay.show { display: block; }
        }
    </style>
</head>
<body>
    <div class="overlay" id="sidebarOverlay"></div>
    <div class="sidebar p-3" id="mainSidebar">
        <?php
        // Pure Employee Logic
        $is_pure_employee = false;
        $my_employee_id = null;
        if (isset($_SESSION['admin_id'])) {
            $emp_check = safeFetch($pdo, "SELECT id FROM " . TBL_HR_EMPLOYEES . " WHERE staff_user_id = ? AND employment_status='Active'", [$_SESSION['admin_id']]);
            if ($emp_check) {
                $perms = $_SESSION['user_permissions'] ?? '[]';
                $perms_arr = is_string($perms) ? json_decode($perms, true) : $perms;
                $current_role = strtolower(trim($_SESSION['user_role'] ?? ''));
                if (empty($perms_arr) && !in_array($current_role, ['admin', 'super admin', 'reseller', 'subreseller', 'sub-reseller', 'supervisor'])) {
                    $is_pure_employee = true;
                    $my_employee_id = $emp_check['id'];
                }
            }
        }
        ?>
        <a href="?tab=dashboard" class="d-flex align-items-center mb-4 px-2 text-decoration-none">
            <?php $logo_path = get_opt($pdo, 'logo_path', ''); ?>
            <?php if($logo_path && file_exists(__DIR__ . '/../../' . $logo_path)): ?>
                <img src="<?= $logo_path ?>" alt="Logo" class="img-fluid" style="max-height: 80px; max-width: 200px; width: auto;">
            <?php else: ?>
                <div class="bg-primary rounded-3 p-2 me-2 shadow-sm"><i class="fas fa-network-wired text-white"></i></div>
                <h5 class="mb-0 fw-bold text-white"><?= $company_name ?></h5>
            <?php endif; ?>
        </a>
            <ul class="nav flex-column">
                <?php if ($is_pure_employee): ?>
                    <!-- Pure Employee Menu -->
                    <li class="nav-item mb-2 text-muted small text-uppercase fw-bold px-2">My Portal</li>
                    <li class="nav-item"><a href="?tab=dashboard" class="nav-link <?= ($tab=='dashboard')?'active':'' ?>"><i class="fas fa-fingerprint me-2 text-success"></i> Attendance Check-in</a></li>
                    <li class="nav-item"><a href="?tab=tasks_my" class="nav-link <?= ($tab=='tasks_my')?'active':'' ?>"><i class="fas fa-tasks me-2 text-warning"></i> My Tasks</a></li>
                    <li class="nav-item"><a href="?tab=self_profile" class="nav-link <?= ($tab=='self_profile')?'active':'' ?>"><i class="fas fa-user-circle me-2 text-primary"></i> My Profile & Log</a></li>
                    <li class="nav-item"><a href="?tab=self_leave" class="nav-link <?= ($tab=='self_leave')?'active':'' ?>"><i class="fas fa-umbrella-beach me-2 text-info"></i> Leave Requests</a></li>
                    <li class="nav-item"><a href="?tab=self_salary" class="nav-link <?= ($tab=='self_salary')?'active':'' ?>"><i class="fas fa-file-invoice-dollar me-2 text-warning"></i> Salary Slips</a></li>
                    <li class="nav-item mt-2"><a href="?tab=settings" class="nav-link <?= ($tab=='settings')?'active':'' ?>"><i class="fas fa-cog me-2"></i> Account Settings</a></li>
                <?php else: ?>
                <!-- Standard Admin / Office Menus -->
                <?php if($_SESSION['user_role'] === 'Admin' || hasRole('Reseller') || hasRole('SubReseller') || hasPermission('dashboard')): ?>
                <li class="nav-item"><a href="?tab=dashboard" class="nav-link <?= ($tab=='dashboard')?'active':'' ?>"><i class="fas fa-tachometer-alt me-2"></i> Dashboard</a></li>
                <?php endif; ?>
                
                <?php if(((hasRole('Reseller') || hasRole('SubReseller')) && !isOffice()) || hasPermission('config')): ?>
                <li class="nav-item"><a href="?tab=configuration" class="nav-link <?= ($tab=='configuration')?'active':'' ?>"><i class="fas fa-cogs me-2"></i> Configuration</a></li>
                <?php endif; ?>

                <?php if(hasPermission('offers')): ?>
                <li class="nav-item"><a href="?tab=offers" class="nav-link <?= ($tab=='offers')?'active':'' ?>"><i class="fas fa-gift me-2"></i> Offer & Promotion</a></li>
                <?php endif; ?>

                <?php 
                $client_tabs = ['add_client', 'clients', 'free_clients', 'due_clients', 'inactive', 'due', 'left_list', 'online_clients', 'tickets'];
                $client_active = in_array($tab, $client_tabs);
                ?>
                <?php if(((hasRole('SubReseller') || hasRole('Reseller')) && !isOffice()) || hasPermission('add_client') || hasPermission('clients_active') || hasPermission('clients_inactive') || hasPermission('clients_due') || hasPermission('clients_left') || hasPermission('monitoring')): ?>
                <li class="nav-item">
                    <a class="nav-link <?= $client_active ? '' : 'collapsed' ?> d-flex align-items-center" data-bs-toggle="collapse" href="#collapseClients" role="button" aria-expanded="<?= $client_active ? 'true' : 'false' ?>">
                        <span><i class="fas fa-users-cog me-2"></i> Client Management</span> <i class="fas fa-chevron-down ms-auto" style="font-size: 0.8rem; transition: 0.3s;"></i>
                    </a>
                    <div class="collapse <?= $client_active ? 'show' : '' ?>" id="collapseClients">
                        <ul class="nav flex-column ms-3 mb-2 mt-1" style="border-left: 2px solid #373a40;">
                            <?php if(((hasRole('SubReseller') || hasRole('Reseller')) && !isOffice()) || hasPermission('add_client')): ?>
                            <li class="nav-item"><a href="?tab=add_client" class="nav-link <?= ($tab=='add_client')?'active':'' ?> text-success"><i class="fas fa-user-plus me-2"></i> Add New Client</a></li>
                            <?php endif; ?>

                            <?php if(hasPermission('clients_active') || hasRole('Reseller')): ?>
                            <li class="nav-item"><a href="?tab=clients" class="nav-link <?= ($tab=='clients')?'active':'' ?>"><i class="fas fa-users me-2"></i> Active Clients</a></li>
                            <li class="nav-item"><a href="?tab=free_clients" class="nav-link <?= ($tab=='free_clients')?'active':'' ?> text-info"><i class="fas fa-user-check me-2"></i> Free Clients</a></li>
                            <li class="nav-item"><a href="?tab=promise_active" class="nav-link <?= ($tab=='promise_active')?'active':'' ?>" style="color: #ff922b !important;"><i class="fas fa-handshake me-2"></i> Promise Active Clients</a></li>
                            <li class="nav-item"><a href="?tab=due_clients" class="nav-link <?= ($tab=='due_clients')?'active':'' ?> text-warning"><i class="fas fa-file-invoice-dollar me-2"></i> Due Clients</a></li>
                            <?php endif; ?>
                            
                            <?php if(hasPermission('clients_inactive') || hasRole('Reseller')): ?>
                            <li class="nav-item"><a href="?tab=inactive" class="nav-link <?= ($tab=='inactive')?'active':'' ?>"><i class="fas fa-user-clock me-2"></i> Inactive Clients</a></li>
                            <?php endif; ?>

                            <?php if(hasPermission('clients_due') || hasRole('Reseller')): ?>
                            <li class="nav-item"><a href="?tab=due" class="nav-link <?= ($tab=='due')?'active':'' ?> text-danger"><i class="fas fa-exclamation-circle me-2"></i> Expire</a></li>
                            <?php endif; ?>

                            <?php if(hasPermission('clients_left') || hasRole('Reseller')): ?>
                            <li class="nav-item"><a href="?tab=left_list" class="nav-link <?= ($tab=='left_list')?'active':'' ?>"><i class="fas fa-user-slash me-2"></i> Left Clients</a></li>
                            <?php endif; ?>

                            <?php if(hasPermission('monitoring') || hasRole('Reseller')): ?>
                            <li class="nav-item"><a href="?tab=online_clients" class="nav-link <?= ($tab=='online_clients')?'active':'' ?>"><i class="fas fa-signal me-2 text-success"></i> Online Monitoring</a></li>
                            <?php endif; ?>
                            <li class="nav-item"><a href="?tab=tickets" class="nav-link <?= ($tab=='tickets')?'active':'' ?>"><i class="fas fa-ticket-alt me-2 text-warning"></i> Tickets</a></li>
                        </ul>
                    </div>
                </li>
                <?php endif; ?>

                <?php 
                $usage_tabs = ['usage_dashboard', 'usage_reports'];
                $usage_active = in_array($tab, $usage_tabs);
                ?>
                <?php 
                $curr_role_bu = $_SESSION['user_role'] ?? '';
                $is_partner_bu = (strcasecmp($curr_role_bu, 'Reseller') === 0 || strcasecmp($curr_role_bu, 'SubReseller') === 0 || strcasecmp($curr_role_bu, 'Sub-Reseller') === 0);
                $is_reseller_branch_bu = ($is_partner_bu || (isOffice() && !isSystemAuthority()));
                ?>
                <?php if((hasRole('Admin') || hasPermission('monitoring')) && !$is_reseller_branch_bu): ?>
                <li class="nav-item mt-2">
                    <a class="nav-link <?= $usage_active ? '' : 'collapsed' ?> d-flex align-items-center" data-bs-toggle="collapse" href="#collapseUsage" role="button" aria-expanded="<?= $usage_active ? 'true' : 'false' ?>">
                        <span><i class="fas fa-chart-area me-2 text-info"></i> Bandwidth Usage</span> <i class="fas fa-chevron-down ms-auto" style="font-size: 0.8rem; transition: 0.3s;"></i>
                    </a>
                    <div class="collapse <?= $usage_active ? 'show' : '' ?>" id="collapseUsage">
                        <ul class="nav flex-column ms-3 mb-2 mt-1" style="border-left: 2px solid #373a40;">
                            <?php if($_SESSION['user_role'] === 'Admin' || hasRole('Reseller') || hasRole('SubReseller') || hasPermission('dashboard')): ?>
                            <li class="nav-item"><a href="?tab=usage_dashboard" class="nav-link <?= ($tab=='usage_dashboard')?'active':'' ?> text-info"><i class="fas fa-tachometer-alt me-2"></i> Live Usage</a></li>
                            <?php endif; ?>
                            <li class="nav-item"><a href="?tab=usage_reports" class="nav-link <?= ($tab=='usage_reports')?'active':'' ?> text-success"><i class="fas fa-file-invoice me-2"></i> Usage Reports</a></li>
                        </ul>
                    </div>
                </li>
                <?php endif; ?>



                <?php if(hasRole('Admin') || hasRole('Reseller') || isOffice()): ?>
                <?php 
                $store_tabs = ['store_inventory', 'store_sales', 'store_support', 'store_reports'];
                $store_active = in_array($tab, $store_tabs);
                ?>
                <li class="nav-item mt-2">
                    <a class="nav-link <?= $store_active ? '' : 'collapsed' ?> d-flex align-items-center" data-bs-toggle="collapse" href="#collapseStore" role="button" aria-expanded="<?= $store_active ? 'true' : 'false' ?>">
                        <span><i class="fas fa-store me-2"></i> Store & Devices</span> <i class="fas fa-chevron-down ms-auto" style="font-size: 0.8rem; transition: 0.3s;"></i>
                    </a>
                    <div class="collapse <?= $store_active ? 'show' : '' ?>" id="collapseStore">
                        <ul class="nav flex-column ms-3 mb-2 mt-1" style="border-left: 2px solid #373a40;">
                            <li class="nav-item">
                                <a href="?tab=store_inventory" class="nav-link <?= ($tab=='store_inventory')?'active':'' ?>">
                                    <i class="fas fa-boxes me-2 text-info"></i> Inventory
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="?tab=store_sales" class="nav-link <?= ($tab=='store_sales')?'active':'' ?>">
                                    <i class="fas fa-shopping-cart me-2 text-success"></i> Product Sales
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="?tab=store_support" class="nav-link <?= ($tab=='store_support')?'active':'' ?>">
                                    <i class="fas fa-tools me-2 text-warning"></i> Support Devices
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="?tab=store_reports" class="nav-link <?= ($tab=='store_reports')?'active':'' ?>">
                                    <i class="fas fa-file-alt me-2 text-primary"></i> Store Reports
                                </a>
                            </li>
                        </ul>
                    </div>
                </li>
                <?php endif; ?>

                <?php if(hasRole('Admin') || hasPermission('hr_view_employees') || hasPermission('hr_attendance') || hasPermission('hr_payroll') || hasPermission('hr_policy')): ?>
                <?php 
                $hr_tabs = ['hr_dashboard', 'hr_employees', 'hr_attendance', 'hr_leaves', 'hr_advance', 'hr_payroll', 'hr_policy', 'hr_reports'];
                $hr_active = in_array($tab, $hr_tabs);
                ?>
                <li class="nav-item mt-2">
                    <a class="nav-link <?= $hr_active ? '' : 'collapsed' ?> d-flex align-items-center" data-bs-toggle="collapse" href="#collapseHR" role="button" aria-expanded="<?= $hr_active ? 'true' : 'false' ?>">
                        <span><i class="fas fa-briefcase me-2"></i> HR Management</span> <i class="fas fa-chevron-down ms-auto" style="font-size: 0.8rem; transition: 0.3s;"></i>
                    </a>
                    <div class="collapse <?= $hr_active ? 'show' : '' ?>" id="collapseHR">
                        <ul class="nav flex-column ms-3 mb-2 mt-1" style="border-left: 2px solid #373a40;">
                            <?php if($_SESSION['user_role'] === 'Admin' || hasRole('Reseller') || hasRole('SubReseller') || hasPermission('dashboard')): ?>
                            <li class="nav-item">
                                <a href="?tab=hr_dashboard" class="nav-link <?= ($tab=='hr_dashboard')?'active':'' ?>">
                                    <i class="fas fa-chart-line me-2 text-info"></i> HR Dashboard
                                </a>
                            </li>
                            <?php endif; ?>
                            <?php if(hasRole('Admin') || hasPermission('hr_view_employees')): ?>
                            <li class="nav-item">
                                <a href="?tab=hr_employees" class="nav-link <?= ($tab=='hr_employees')?'active':'' ?>">
                                    <i class="fas fa-user-friends me-2 text-success"></i> Employees
                                </a>
                            </li>
                            <?php endif; ?>
                            <?php if(hasRole('Admin') || hasPermission('hr_attendance')): ?>
                            <li class="nav-item">
                                <a href="?tab=hr_attendance" class="nav-link <?= ($tab=='hr_attendance')?'active':'' ?>">
                                    <i class="fas fa-calendar-check me-2 text-warning"></i> Attendance
                                </a>
                            </li>
                            <?php endif; ?>
                            <?php if(hasRole('Admin') || hasPermission('hr_attendance')): ?>
                            <li class="nav-item">
                                <a href="?tab=hr_leaves" class="nav-link <?= ($tab=='hr_leaves')?'active':'' ?>">
                                    <i class="fas fa-umbrella-beach me-2 text-info"></i> Leave Management
                                </a>
                            </li>
                            <?php endif; ?>
                            <?php if(hasRole('Admin') || hasPermission('hr_payroll')): ?>
                            <li class="nav-item">

                                <a href="?tab=hr_advance" class="nav-link <?= ($tab=='hr_advance')?'active':'' ?>">
                                    <i class="fas fa-hand-holding-usd me-2 text-success"></i> Advance Salary
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="?tab=hr_payroll" class="nav-link <?= ($tab=='hr_payroll')?'active':'' ?>">
                                    <i class="fas fa-calculator me-2 text-warning"></i> Payroll Generation
                                </a>
                            </li>
                            <?php endif; ?>
                            <?php if(hasRole('Admin') || hasPermission('hr_policy')): ?>
                            <li class="nav-item">
                                <a href="?tab=hr_policy" class="nav-link <?= ($tab=='hr_policy')?'active':'' ?>">
                                    <i class="fas fa-balance-scale me-2 text-danger"></i> Salary Policies
                                </a>
                            </li>
                            <?php endif; ?>
                            <li class="nav-item">
                                <a href="?tab=hr_reports" class="nav-link <?= ($tab=='hr_reports')?'active':'' ?>">
                                    <i class="fas fa-chart-pie me-2 text-primary"></i> HR Reports
                                </a>
                            </li>
                        </ul>
                    </div>
                </li>
                <?php endif; ?>

                
                <?php if(hasPermission('manage_agents')): ?>
                <hr class="text-white-50 my-2">
                <li class="nav-item"><a href="?tab=manage_agents" class="nav-link <?= ($tab=='manage_agents')?'active':'' ?>"><i class="fas fa-user-tie me-2 text-warning"></i> Manage Agents</a></li>
                <?php endif; ?>

                <?php if(hasPermission('resellers')): ?>
                <li class="nav-item"><a href="?tab=agents" class="nav-link <?= ($tab=='agents')?'active':'' ?>"><i class="fas fa-user-shield me-2 text-info"></i> POP/Branch List</a></li>
                <li class="nav-item"><a href="?tab=left_resellers" class="nav-link <?= ($tab=='left_resellers')?'active':'' ?>"><i class="fas fa-user-slash me-2 text-danger"></i> Left POP/Branch List</a></li>
                <?php endif; ?>

                <?php 
                $current_role_lower = strtolower($role);
                $is_office_staff = in_array($current_role_lower, ['administrator', 'supervisor', 'office manager', 'system admin', 'tl', 'executive']);
                
                if(hasRole('Admin') || hasRole('Reseller') || hasPermission('office_staff')): ?>
                <li class="nav-item"><a href="?tab=office_staff" class="nav-link <?= ($tab=='office_staff')?'active':'' ?>"><i class="fas fa-users-cog me-2 text-primary"></i> Office Staff</a></li>
                <?php endif; ?>

                <?php if(hasPermission('routers_olt') || hasRole('Admin') || hasRole('Reseller')): ?>
                <?php if(hasPermission('routers_olt') || hasRole('Admin')): ?>
                <li class="nav-item"><a href="?tab=routers" class="nav-link <?= ($tab=='routers')?'active':'' ?>"><i class="fas fa-server me-2"></i> Routers</a></li>
                <?php endif; ?>
                <li class="nav-item"><a href="?tab=olt" class="nav-link <?= ($tab=='olt')?'active':'' ?>"><i class="fas fa-network-wired me-2"></i> OLT</a></li>
                <!-- TOPOLOGY_VISIBLE_FIX -->
                <li class="nav-item"><a href="?tab=network_topology" class="nav-link <?= ($tab=='network_topology')?'active':'' ?>"><i class="fas fa-project-diagram me-2 text-info"></i> Live Topology</a></li>
                <?php endif; ?>

                <?php if(hasPermission('packages')): ?>
                <li class="nav-item"><a href="?tab=services" class="nav-link <?= ($tab=='services')?'active':'' ?>"><i class="fas fa-box me-2"></i> Packages</a></li>
                <?php endif; ?>
                
                <?php if(hasRole('Admin') || hasPermission('wallet_deposit') || hasPermission('settings') || hasPermission('activity_log') || hasRole('Reseller') || hasRole('SubReseller') || (isset($_SESSION['user_role']) && in_array(strtolower(trim($_SESSION['user_role'])), ['pop', 'branch']))): ?>
                <hr class="text-white-50 my-2">
                <li class="nav-item fw-bold small text-white-50 ms-3 mb-1">REPORTS & SETTINGS</li>
                <?php if(hasPermission('settings') || hasRole('Admin') || hasRole('Reseller')): ?>
                <li class="nav-item"><a href="?tab=payment_verification_dashboard" class="nav-link <?= ($tab=='payment_verification_dashboard')?'active':'' ?> text-warning"><i class="fas fa-sms me-2"></i> Payment Verification</a></li>
                <?php endif; ?>
                <?php if(hasPermission('wallet_deposit') || hasRole('Admin') || hasRole('Reseller')): ?>
                <li class="nav-item"><a href="?tab=monthly_sales" class="nav-link <?= ($tab=='monthly_sales')?'active':'' ?>"><i class="fas fa-chart-bar me-2 text-success"></i> Monthly Sales</a></li>
                <li class="nav-item"><a href="?tab=bulk_statement" class="nav-link <?= ($tab=='bulk_statement')?'active':'' ?>"><i class="fas fa-file-invoice-dollar me-2 text-info"></i> Bulk Statement</a></li>
                <?php endif; ?>
                <?php if(hasPermission('activity_log') || ((hasRole('Reseller') || hasRole('SubReseller')) && !isOffice()) || (isset($_SESSION['user_role']) && in_array(strtolower(trim($_SESSION['user_role'])), ['pop', 'branch']))): ?>
                <li class="nav-item"><a href="?tab=activity" class="nav-link <?= ($tab=='activity')?'active':'' ?>"><i class="fas fa-history me-2"></i> Activity Log</a></li>
                <?php endif; ?>
                <?php if(hasPermission('activity_log')): ?>
                <li class="nav-item"><a href="?tab=error_logs" class="nav-link <?= ($tab=='error_logs')?'active':'' ?>"><i class="fas fa-exclamation-triangle me-2 text-danger"></i> Error Logs</a></li>
                <li class="nav-item"><a href="?tab=sms_logs" class="nav-link <?= ($tab=='sms_logs')?'active':'' ?>"><i class="fas fa-envelope-open-text me-2"></i> SMS Logs</a></li>
                <?php endif; ?>
                <?php if(hasPermission('voice_logs') || hasRole('Admin') || (hasRole('Reseller') && !isOffice())): ?>
                <li class="nav-item"><a href="?tab=voice_logs" class="nav-link <?= ($tab=='voice_logs')?'active':'' ?>"><i class="fas fa-phone-alt me-2 text-info"></i> Voice Logs</a></li>
                <?php endif; ?>
                <?php if(hasPermission('settings')): ?>
                <li class="nav-item"><a href="?tab=settings" class="nav-link <?= ($tab=='settings')?'active':'' ?>"><i class="fas fa-user-circle me-2"></i> Profile Settings</a></li>
                <?php endif; ?>
                <?php endif; ?>
                
                <?php if(hasRole('Reseller') || hasRole('SubReseller')): ?>
                <hr class="text-white-50 my-2">
                <?php if(hasRole('Reseller') && !hasRole('Admin')): ?>
                <li class="nav-item"><a href="?tab=staff" class="nav-link <?= ($tab=='staff')?'active':'' ?>"><i class="fas fa-users-cog me-2 text-info"></i> Sub-Resellers</a></li>
                <li class="nav-item"><a href="?tab=left_staff" class="nav-link <?= ($tab=='left_staff')?'active':'' ?>"><i class="fas fa-user-slash me-2 text-warning"></i> Former Sub-Resellers</a></li>
                <li class="nav-item"><a href="?tab=office_staff" class="nav-link <?= ($tab=='office_staff')?'active':'' ?>"><i class="fas fa-user-tie me-2 text-primary"></i> Office Staff</a></li>
                <?php endif; ?>
                <?php endif; ?>
                
                <?php 
                $has_finance_perm = hasPermission('wallet_deposit');
                $curr_role = $_SESSION['user_role'] ?? '';
                $is_partner = (strcasecmp($curr_role, 'Reseller') === 0 || strcasecmp($curr_role, 'SubReseller') === 0 || strcasecmp($curr_role, 'Sub-Reseller') === 0);
                $is_reseller_branch = ($is_partner || (isOffice() && !isSystemAuthority()));
                
                if(hasRole('Admin') || ($has_finance_perm && !$is_reseller_branch)): ?>
                <li class="nav-item"><a href="?tab=finance" class="nav-link <?= ($tab=='finance')?'active':'' ?> text-warning fw-bold"><i class="fas fa-wallet me-2"></i> Wallet & Deposit</a></li>
                <?php elseif($is_reseller_branch && ($has_finance_perm || (hasRole('Reseller') && !isOffice()))): ?>
                <li class="nav-item"><a href="?tab=accounts" class="nav-link <?= ($tab=='accounts')?'active':'' ?> text-warning fw-bold"><i class="fas fa-wallet me-2"></i> My Wallet</a></li>
                <?php endif; ?>
                
                <?php if($is_reseller_branch): ?>
                <li class="nav-item"><a href="?tab=my_rates" class="nav-link <?= ($tab=='my_rates')?'active':'' ?>"><i class="fas fa-tags me-2 text-info"></i> My Rates</a></li>
                <?php endif; ?>

                <?php 
                $task_tabs = ['task_dashboard', 'tasks_all', 'tasks_my', 'tasks_create', 'tasks_calendar', 'tasks_recurring', 'tasks_templates', 'tasks_completed', 'tasks_reports', 'tasks_settings', 'tasks_details'];
                $task_active = in_array($tab, $task_tabs);
                ?>
                <li class="nav-item mt-2">
                    <a class="nav-link <?= $task_active ? '' : 'collapsed' ?> d-flex align-items-center" data-bs-toggle="collapse" href="#collapseTasks" role="button" aria-expanded="<?= $task_active ? 'true' : 'false' ?>">
                        <span><i class="fas fa-tasks me-2 text-warning"></i> Task Management</span> <i class="fas fa-chevron-down ms-auto" style="font-size: 0.8rem; transition: 0.3s;"></i>
                    </a>
                    <div class="collapse <?= $task_active ? 'show' : '' ?>" id="collapseTasks">
                        <ul class="nav flex-column ms-3 mb-2 mt-1" style="border-left: 2px solid #373a40;">
                            <li class="nav-item"><a href="?tab=task_dashboard" class="nav-link <?= ($tab=='task_dashboard')?'active':'' ?>"><i class="fas fa-chart-pie me-2 text-info"></i> Task Dashboard</a></li>
                            <li class="nav-item"><a href="?tab=tasks_all" class="nav-link <?= ($tab=='tasks_all')?'active':'' ?>"><i class="fas fa-list me-2"></i> All Tasks</a></li>
                            <li class="nav-item"><a href="?tab=tasks_my" class="nav-link <?= ($tab=='tasks_my')?'active':'' ?>"><i class="fas fa-user-tag me-2 text-success"></i> My Tasks</a></li>
                            <li class="nav-item"><a href="?tab=tasks_create" class="nav-link <?= ($tab=='tasks_create')?'active':'' ?> text-success"><i class="fas fa-plus-circle me-2"></i> Create Task</a></li>
                            <li class="nav-item"><a href="?tab=tasks_calendar" class="nav-link <?= ($tab=='tasks_calendar')?'active':'' ?>"><i class="far fa-calendar-alt me-2 text-primary"></i> Calendar</a></li>
                            <li class="nav-item"><a href="?tab=tasks_recurring" class="nav-link <?= ($tab=='tasks_recurring')?'active':'' ?>"><i class="fas fa-history me-2 text-info"></i> Recurring Tasks</a></li>
                            <li class="nav-item"><a href="?tab=tasks_templates" class="nav-link <?= ($tab=='tasks_templates')?'active':'' ?>"><i class="fas fa-cubes me-2 text-warning"></i> Task Templates</a></li>
                            <li class="nav-item"><a href="?tab=tasks_completed" class="nav-link <?= ($tab=='tasks_completed')?'active':'' ?>"><i class="fas fa-check-double me-2 text-success"></i> Completed Tasks</a></li>
                            <li class="nav-item"><a href="?tab=tasks_reports" class="nav-link <?= ($tab=='tasks_reports')?'active':'' ?>"><i class="fas fa-chart-line me-2 text-primary"></i> Task Reports</a></li>
                            <li class="nav-item"><a href="?tab=tasks_settings" class="nav-link <?= ($tab=='tasks_settings')?'active':'' ?>"><i class="fas fa-cog me-2"></i> Settings</a></li>
                        </ul>
                    </div>
                </li>
                
                <?php endif; // End is_pure_employee ?>
                <li class="nav-item mt-4"><a href="?logout=1" class="nav-link text-danger"><i class="fas fa-sign-out-alt me-2"></i> Logout</a></li>
            </ul>
        </div>
        
        <!-- Main Wrapper -->
        <div class="main-wrapper">
            <nav class="navbar navbar-expand-lg navbar-light bg-white p-3">
                <div class="container-fluid">
                    <button class="btn btn-light d-md-none me-2" id="sidebarToggle">
                        <i class="fas fa-bars"></i>
                    </button>
                    <span class="navbar-brand d-md-none"><?= $company_name ?></span>
                    <div class="ms-auto d-flex align-items-center">
                        <span class="d-none d-md-block me-4 text-muted small bg-light px-3 py-1 rounded-pill border"><i class="far fa-calendar-alt me-2 text-primary"></i><?= date('l, d F Y') ?></span>
                        <span class="me-3 text-muted">
                            Balance: <strong>
                                <?php if(hasRole('Admin') || (isOffice() && ($_SESSION['parent_id'] ?? 0) <= 0)): ?>
                                    <span class="text-primary">∞ Infinity</span>
                                <?php else: ?>
                                    <span class="<?= $my_balance < 0 ? 'text-danger' : 'text-success' ?>">৳<?= number_format($my_balance, 2) ?></span>
                                    <?php if(isset($my_advance_limit) && $my_advance_limit > 0): ?>
                                        <small class="text-muted ms-1">(Credit Limit: ৳<?= number_format($my_advance_limit, 2) ?>)</small>
                                    <?php endif; ?>
                                <?php endif; ?>
                            </strong>
                        </span>
                        <?php if(isset($_SESSION['impersonator_id'])): ?>
                            <a href="?stop_impersonate=1" class="btn btn-danger btn-sm ms-2 me-2">
                                <i class="fas fa-sign-out-alt me-1"></i> Return to Admin
                            </a>
                        <?php endif; ?>
                        <div class="dropdown">
                            <a class="btn btn-outline-secondary btn-sm dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                                <i class="fas fa-user-circle me-1"></i> <?= $username ?>
                            </a>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <?php if($role !== 'Client'): ?>
                                <li><a class="dropdown-item" href="?tab=settings">Settings</a></li>
                                <?php endif; ?>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item" href="?logout=1">Logout</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </nav>
            <?php
            global $g_license_status;
            $show_license_marquee = false;
            $expire_date_raw = '';
            if (isLoggedIn() && isset($g_license_status)):
                $expire_date_raw = $g_license_status['expiry_date'] ?? '';
                $days_remaining = null;
                if (!empty($expire_date_raw) && $expire_date_raw !== '1970-01-01') {
                    try {
                        $today = new DateTime('now', new DateTimeZone('Asia/Dhaka'));
                        $today->setTime(0, 0, 0);
                        $expiry = new DateTime($expire_date_raw, new DateTimeZone('Asia/Dhaka'));
                        $expiry->setTime(0, 0, 0);
                        $interval = $today->diff($expiry);
                        $days_remaining = (int)$interval->format('%r%a');
                    } catch (Exception $e) {
                        $days_remaining = (int)($g_license_status['days_remaining'] ?? 999);
                    }
                } else {
                    $days_remaining = (int)($g_license_status['days_remaining'] ?? 999);
                }

                if ($days_remaining <= 5 && $expire_date_raw !== '1970-01-01') {
                    $show_license_marquee = true;
                }
            endif;
            ?>
            <div class="main-content">
                <?php if ($show_license_marquee): 
                    $scrolling_text = "সম্মানিত গ্রাহক, আপনার ISP Billing System-এর বর্তমান সাবস্ক্রিপশনের মেয়াদ " . htmlspecialchars($expire_date_raw) . " তারিখে শেষ হবে। নিরবচ্ছিন্নভাবে সেবা ব্যবহার চালু রাখতে অনুগ্রহ করে মেয়াদ শেষ হওয়ার আগেই আপনার সাবস্ক্রিপশনটি নবায়ন করে নেওয়ার জন্য অনুরোধ করা হলো।";
                ?>
                <div class="alert alert-warning py-2 mb-3 border-0 shadow-sm overflow-hidden" style="background-color: #fff3cd; color: #856404;">
                    <marquee behavior="scroll" direction="left" scrollamount="5" class="fw-bold" style="font-family: 'Hind Siliguri', 'SolaimanLipi', Arial, sans-serif; margin: 0;">
                        <i class="fas fa-exclamation-triangle me-2"></i> <?= $scrolling_text ?>
                    </marquee>
                </div>
                <?php endif; ?>
                <?php 
                $display_msg = $msg ?? $_SESSION['flash_msg'] ?? null;
                if (isset($_SESSION['flash_msg'])) unset($_SESSION['flash_msg']);
                if ($display_msg): 
                ?>
                    <div class="alert alert-success alert-dismissible fade show" role="alert">
                        <?= $display_msg ?>
                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                <?php endif; ?>
                <?php 
                $display_error = $error ?? $_SESSION['flash_error'] ?? null;
                if (isset($_SESSION['flash_error'])) unset($_SESSION['flash_error']);
                if ($display_error): 
                ?>
                    <div class="alert alert-danger alert-dismissible fade show" role="alert">
                        <?= $display_error ?>
                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                <?php endif; ?>

                <!-- Registration Success Modal -->
                <?php if(isset($_SESSION['registration_success'])): 
                    $rs = $_SESSION['registration_success'];
                    unset($_SESSION['registration_success']);
                ?>
                <div class="modal fade" id="regSuccessModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content border-0 shadow-lg">
                            <div class="modal-body text-center p-5">
                                <div class="mb-4">
                                    <i class="fas fa-check-circle text-success fa-5x"></i>
                                </div>
                                <h3 class="fw-bold mb-3">Registration Successful!</h3>
                                <p class="text-muted mb-4">
                                    Client <strong><?= htmlspecialchars($rs['name']) ?></strong> (<?= htmlspecialchars($rs['user_id']) ?>) has been added to the system.
                                </p>
                                <div class="bg-light p-3 rounded mb-4">
                                    <span class="text-muted small d-block">Wallet Deducted</span>
                                    <span class="fs-4 fw-bold text-danger">৳<?= number_format($rs['cost'], 2) ?></span>
                                </div>
                                <button type="button" class="btn btn-success btn-lg w-100 py-3" data-bs-dismiss="modal">
                                    Great, thank you!
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    var myModal = new bootstrap.Modal(document.getElementById('regSuccessModal'));
                    myModal.show();
                });
                </script>
                <?php endif; ?>
