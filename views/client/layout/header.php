<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Customer Dashboard - <?= $company_name ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary-color: #5a67d8;
            --bg-color: #f7fafc;
            --sidebar-width: 260px;
        }
        body { background-color: var(--bg-color); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; overflow-x: hidden; }
        
        /* Sidebar Styles */
        .sidebar {
            width: var(--sidebar-width);
            height: 100vh;
            position: fixed;
            top: 0; left: 0;
            background: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            padding: 20px;
            transition: all 0.3s;
            overflow-y: auto;
        }
        .sidebar .nav-link {
            color: #4a5568;
            font-weight: 500;
            padding: 12px 15px;
            border-radius: 12px;
            margin-bottom: 5px;
            display: flex;
            align-items: center;
            transition: all 0.2s;
        }
        .sidebar .nav-link:hover {
            color: var(--primary-color);
            background: rgba(90, 103, 216, 0.05);
        }
        .sidebar .nav-link.active {
            color: var(--primary-color);
            background: rgba(90, 103, 216, 0.08);
            border-left: 4px solid var(--primary-color);
            border-radius: 0 12px 12px 0;
            margin-left: -20px;
            padding-left: 31px;
        }
        .sidebar .nav-link i { margin-right: 12px; width: 20px; text-align: center; }
        
        /* Main Content */
        .main-content {
            margin-left: var(--sidebar-width);
            padding: 30px;
            transition: all 0.3s;
        }
        
        .card { border: none; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
        .bg-gradient-purple { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        
        .overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); z-index: 999; }
        @media (max-width: 991px) {
            .sidebar { left: -260px; }
            .sidebar.active { left: 0; }
            .main-content { margin-left: 0; padding: 15px; }
            .overlay.show { display: block; }
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar) sidebar.classList.toggle('active');
            if (overlay) overlay.classList.toggle('show');
        }
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('sidebarToggleMobile')?.addEventListener('click', toggleSidebar);
            document.getElementById('sidebarOverlay')?.addEventListener('click', toggleSidebar);
        });
    </script>
</head>
<body>
    <div class="overlay" id="sidebarOverlay"></div>
    <!-- Sidebar -->
    <div class="sidebar" id="sidebar">
        <div class="text-center mb-4">
            <h5 class="fw-bold text-primary mb-0"><?= $company_name ?></h5>
            <small class="text-muted">Self Care</small>
        </div>

        <div class="mb-4 text-center">
            <div class="bg-light rounded p-2 d-inline-block shadow-sm">
                <span class="fw-bold small">
                    <?= htmlspecialchars($c['user_id']) ?>
                    <?php if (!empty($c['client_code'])): ?>
                        <span class="text-primary">(<?= htmlspecialchars($c['client_code']) ?>)</span>
                    <?php endif; ?>
                </span>
            </div>
            <div class="small text-muted mt-1"><?= htmlspecialchars($c['name']) ?></div>
        </div>

        <nav class="nav flex-column flex-grow-1">
            <?php if (isset($_SESSION['must_change_password']) && $_SESSION['must_change_password'] === true): ?>
            <a class="nav-link <?= $tab === 'change_password' ? 'active' : '' ?>" href="?panel=client&tab=change_password">
                <i class="fas fa-key"></i> Change Password
            </a>
            <?php else: ?>
            <a class="nav-link <?= $tab === 'dashboard' ? 'active' : '' ?>" href="?panel=client&tab=dashboard">
                <i class="fas fa-chart-pie"></i> Dashboard
            </a>
            <a class="nav-link <?= $tab === 'pay_bill' ? 'active' : '' ?>" href="?panel=client&tab=pay_bill">
                <i class="fas fa-credit-card"></i> Pay Bill
            </a>
            <a class="nav-link <?= $tab === 'payment_history' ? 'active' : '' ?>" href="?panel=client&tab=payment_history">
                <i class="fas fa-receipt"></i> History
            </a>
            <a class="nav-link <?= $tab === 'funbox' ? 'active' : '' ?>" href="?panel=client&tab=funbox">
                <i class="fas fa-gamepad"></i> Fun Box
            </a>
            <a class="nav-link <?= $tab === 'ticket' ? 'active' : '' ?>" href="?panel=client&tab=ticket">
                <i class="fas fa-ticket-alt"></i> Ticket
            </a>
            <a class="nav-link <?= $tab === 'report' ? 'active' : '' ?>" href="?panel=client&tab=report">
                <i class="fas fa-chart-bar"></i> Usage Report
            </a>
            <a class="nav-link <?= $tab === 'payment_verification' ? 'active' : '' ?>" href="?panel=client&tab=payment_verification">
                <i class="fas fa-shield-alt"></i> Verify SMS Payment
            </a>
            <a class="nav-link <?= $tab === 'change_password' ? 'active' : '' ?>" href="?panel=client&tab=change_password">
                <i class="fas fa-key"></i> Change Password
            </a>
            <?php endif; ?>
        </nav>


        <div class="mt-auto">
            <a class="nav-link text-danger" href="?panel=client&tab=logout">
                <i class="fas fa-sign-out-alt"></i> Logout
            </a>
        </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
        <div class="d-flex justify-content-between align-items-center mb-4 d-lg-none">
            <button class="btn btn-light border" id="sidebarToggleMobile">
                <i class="fas fa-bars"></i> Menu
            </button>
            <h6 class="mb-0 fw-bold"><?= $company_name ?></h6>
        </div>
