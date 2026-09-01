<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Installation</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background: #f8f9fa; display: flex; align-items: center; min-height: 100vh; }
        .install-card { max-width: 500px; margin: auto; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.05); background: white; }
        .step-indicator { font-size: 0.9rem; color: #6c757d; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="install-card">
            <div class="text-center mb-4">
                <h2>ISP System Installer</h2>
                <?php
                $tenant = isset($_GET['tenant']) ? preg_replace('/[^a-zA-Z0-9-]/', '', $_GET['tenant']) : '';
                if ($tenant): ?>
                    <div class="alert alert-info">Installing for Tenant: <strong><?= htmlspecialchars($tenant) ?></strong></div>
                <?php else: ?>
                    <div class="step-indicator">Initial Setup</div>
                <?php endif; ?>
            </div>

            <?php if(isset($_GET['error'])): ?>
                <div class="alert alert-danger"><?= htmlspecialchars($_GET['error']) ?></div>
            <?php endif; ?>

            <form action="install.php" method="POST">
                <?php if ($tenant): ?>
                    <input type="hidden" name="tenant" value="<?= htmlspecialchars($tenant) ?>">
                <?php endif; ?>
                <h5 class="mb-3 text-primary">Database Setup</h5>
                <div class="mb-3">
                    <label class="form-label">Database Host</label>
                    <input type="text" name="db_host" class="form-control" value="localhost" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Database Name</label>
                    <input type="text" name="db_name" class="form-control" placeholder="radius_db" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Database User</label>
                    <input type="text" name="db_user" class="form-control" placeholder="root" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Database Password</label>
                    <input type="password" name="db_pass" class="form-control" placeholder="">
                </div>

                <hr class="my-4">

                <h5 class="mb-3 text-primary">Admin Account Setup</h5>
                <div class="mb-3">
                    <label class="form-label">Admin Username</label>
                    <input type="text" name="admin_username" class="form-control" placeholder="admin" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Admin Password</label>
                    <input type="password" name="admin_password" class="form-control" placeholder="Enter secure password" required>
                </div>

                <hr class="my-4">

                <h5 class="mb-3 text-primary">Client Information</h5>
                <div class="mb-3">
                    <label class="form-label">Client Name</label>
                    <input type="text" name="client_name" class="form-control" placeholder="Enter client/owner name" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Date of Birth</label>
                    <input type="date" name="client_date_of_birth" class="form-control" required>
                </div>

                <hr class="my-4">

                <h5 class="mb-3 text-primary">License Activation</h5>
                <div class="mb-3">
                    <label class="form-label">SaaS License Key</label>
                    <input type="text" name="license_key" class="form-control" placeholder="Enter key from Admin Panel" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">SaaS Server URL</label>
                    <input type="text" name="saas_url" class="form-control" value="https://netbills.work.gd/saas_admin/api.php" required>
                    <div class="form-text">URL to the SaaS Admin API.</div>
                </div>

                <div class="d-grid gap-2 mt-4">
                    <button type="submit" class="btn btn-primary btn-lg">Install System</button>
                </div>
            </form>
        </div>
    </div>
</body>
</html>
