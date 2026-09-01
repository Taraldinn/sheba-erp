<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Customer Login - <?= $company_name ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary-color: #5a67d8;
            --bg-color: #f4f7fb;
        }
        body { 
            background-color: var(--bg-color); 
            min-height: 100vh; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            padding: 20px; 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .login-card { 
            width: 100%; 
            max-width: 420px; 
            padding: 40px; 
            border-radius: 20px; 
            box-shadow: 0 15px 35px rgba(90, 103, 216, 0.08); 
            background: white; 
            border: 1px solid rgba(231, 234, 243, 0.7);
        }
        .form-control {
            border-radius: 10px;
            padding: 12px 15px;
            border-color: #e2e8f0;
        }
        .form-control:focus {
            box-shadow: 0 0 0 3px rgba(90, 103, 216, 0.15);
            border-color: var(--primary-color);
        }
        .btn-primary {
            background-color: var(--primary-color);
            border: none;
            border-radius: 10px;
            padding: 12px;
            font-weight: 600;
            letter-spacing: 0.5px;
            transition: all 0.3s;
        }
        .btn-primary:hover {
            background-color: #4c51bf;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(90, 103, 216, 0.2);
        }
        @media (max-width: 576px) {
            .login-card { padding: 25px; }
        }
    </style>
</head>
<body>
    <div class="login-card">
        <div class="text-center mb-4">
            <div class="d-inline-flex bg-primary bg-opacity-10 p-3 rounded-circle mb-3">
                <i class="fas fa-satellite-dish fa-2x text-primary"></i>
            </div>
            <h4 class="fw-bold text-dark">Customer Self Care</h4>
            <p class="text-muted small">Access your account details, usage & invoices.</p>
        </div>
        
        <?php if(isset($login_error)): ?>
            <div class="alert alert-danger border-0 bg-danger bg-opacity-10 text-danger small rounded-3 mb-3 d-flex align-items-center">
                <i class="fas fa-exclamation-circle me-2"></i> <?= htmlspecialchars($login_error) ?>
            </div>
        <?php endif; ?>

        <form method="POST">
            <div class="mb-3">
                <label class="form-label fw-semibold text-secondary small">PPPoE ID (Username)</label>
                <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="fas fa-user-circle"></i></span>
                    <input type="text" name="username" class="form-control border-start-0" placeholder="e.g., bo150" required autofocus>
                </div>
            </div>
            <div class="mb-3">
                <label class="form-label fw-semibold text-secondary small">Password (Primary Phone for first login)</label>
                <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="fas fa-phone"></i></span>
                    <input type="password" name="password" id="client_pass_input" class="form-control border-start-0" placeholder="Enter self care password" required>
                    <span class="input-group-text bg-light border-start-0" style="cursor: pointer;" id="togglePasswordBtn">
                        <i id="eye_icon" class="fas fa-eye text-muted"></i>
                    </span>
                </div>
            </div>
            <div class="mb-4 form-check">
                <input type="checkbox" name="remember" class="form-check-input" id="rememberMe">
                <label class="form-check-label small text-muted" for="rememberMe">Keep me logged in</label>
            </div>
            <button type="submit" name="client_login" class="btn btn-primary w-100 mb-3 shadow-sm">Sign In</button>
            <a href="?tab=quick_pay" class="btn btn-light btn-sm w-100 text-secondary border-0"><i class="fas fa-bolt me-1 text-warning"></i> Quick Pay (No Login)</a>
        </form>
    </div>
    
    <div class="mt-4 text-center text-muted small">
        <?= date('Y') ?> &copy; <?= $company_name ?>. All Rights Reserved.
    </div>

    <script>
        function togglePass() {
            let input = document.getElementById('client_pass_input');
            let icon = document.getElementById('eye_icon');
            if (input.type === "password") {
                input.type = "text";
                icon.className = "fas fa-eye-slash text-muted";
            } else {
                input.type = "password";
                icon.className = "fas fa-eye text-muted";
            }
        }
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('togglePasswordBtn')?.addEventListener('click', togglePass);
        });
    </script>
</body>
</html>
