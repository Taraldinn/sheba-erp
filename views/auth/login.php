<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - <?= $company_name ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f0f2f5; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
        .login-card { width: 100%; max-width: 400px; padding: 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); background: white; }
        @media (max-width: 576px) {
            .login-card { padding: 20px; max-width: 340px; }
        }
    </style>
</head>
<body>
    <div class="login-card">
        <div class="text-center mb-4">
            <?php 
            $logo_path = get_opt($pdo, 'logo_path', '');
            if($logo_path && file_exists(__DIR__ . '/../../' . $logo_path)): 
            ?>
                <img src="<?= $logo_path ?>" alt="Logo" class="img-fluid" style="max-height: 80px;">
            <?php else: ?>
                <h3 class="text-primary fw-bold"><?= $company_name ?></h3>
            <?php endif; ?>
        </div>
        
        <?php if(isset($error)): ?><div class="alert alert-danger"><?= $error ?></div><?php endif; ?>
        <?php
            $saved_username = isset($_COOKIE['login_username']) ? htmlspecialchars($_COOKIE['login_username']) : '';
            $saved_password = isset($_COOKIE['login_password']) ? htmlspecialchars(base64_decode($_COOKIE['login_password'])) : '';
            $is_remembered = ($saved_username !== '' && $saved_password !== '') ? 'checked' : '';
        ?>
        <form method="POST">
            <div class="mb-3">
                <label class="form-label">Username</label>
                <input type="text" name="username" class="form-control" required autofocus value="<?= $saved_username ?>">
            </div>
            <div class="mb-3">
                <label class="form-label">Password</label>
                <input type="password" name="password" class="form-control" required value="<?= $saved_password ?>">
            </div>
            <div class="mb-3 form-check">
                <input type="checkbox" name="remember" class="form-check-input" id="rememberMe" <?= $is_remembered ?>>
                <label class="form-check-label" for="rememberMe">Remember Me</label>
            </div>
            <button type="submit" name="login" class="btn btn-primary w-100 py-2 mb-3">Login</button>
            <a href="?tab=quick_pay" class="btn btn-outline-success w-100 py-2">Quick Pay (No Login)</a>
        </form>
        <div class="mt-3 text-center small">
            <a href="?tab=forgot_password" class="text-decoration-none">Forgot Password?</a>
        </div>
    </div>
    
    <div class="mt-4 text-center text-muted small">
        Sheba-fi &copy; 2026 Swim Domain. All Rights Reserved.
    </div>
</body>
</html>
