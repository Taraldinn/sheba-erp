<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Password - <?= $company_name ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f0f2f5; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-card { width: 100%; max-width: 400px; padding: 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); background: white; }
    </style>
</head>
<body>
    <div class="login-card">
        <h3 class="text-center mb-4 text-primary">Set New Password</h3>
        
        <?php 
        $token = $_GET['token'] ?? '';
        $valid = false;
        if ($token) {
            $check = safeFetch($pdo, "SELECT id FROM ".TBL_STAFF." WHERE reset_token=? AND reset_expiry > NOW()", [$token]);
            if ($check) $valid = true;
        }
        ?>

        <?php if(isset($error)): ?><div class="alert alert-danger"><?= $error ?></div><?php endif; ?>
        <?php if(isset($msg)): ?><div class="alert alert-success"><?= $msg ?></div><?php endif; ?>

        <?php if($valid && !isset($msg)): ?>
            <form method="POST">
                <input type="hidden" name="token" value="<?= $token ?>">
                <div class="mb-3">
                    <label class="form-label">New Password</label>
                    <input type="password" name="new_password" class="form-control" required autofocus placeholder="Enter new password">
                </div>
                <button type="submit" name="reset_password_action" class="btn btn-primary w-100 py-2">Change Password</button>
            </form>
        <?php elseif(!isset($msg)): ?>
            <div class="alert alert-danger text-center">
                Invalid or expired reset link.<br>
                <a href="?tab=forgot_password" class="alert-link">Request a new one</a>
            </div>
        <?php endif; ?>
        
        <div class="mt-3 text-center">
            <a href="index.php" class="text-decoration-none small">Back to Login</a>
        </div>
    </div>
</body>
</html>
