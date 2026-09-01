<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forgot Password - <?= $company_name ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f0f2f5; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-card { width: 100%; max-width: 400px; padding: 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); background: white; }
    </style>
</head>
<body>
    <div class="login-card">
        <h3 class="text-center mb-4 text-primary">Password Recovery</h3>
        <p class="text-center text-muted small mb-4">Enter your email address and we'll send you a link to reset your password.</p>
        
        <?php if(isset($error)): ?><div class="alert alert-danger"><?= $error ?></div><?php endif; ?>
        <?php if(isset($msg)): ?><div class="alert alert-success"><?= $msg ?></div><?php endif; ?>
        
        <form method="POST">
            <div class="mb-3">
                <label class="form-label">Email Address</label>
                <input type="email" name="email" class="form-control" required autofocus placeholder="admin@example.com">
            </div>
            <button type="submit" name="request_reset" class="btn btn-primary w-100 py-2">Send Reset Link</button>
        </form>
        <div class="mt-3 text-center">
            <a href="index.php" class="text-decoration-none small">Back to Login</a>
        </div>
    </div>
</body>
</html>
