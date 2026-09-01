<?php require_once __DIR__ . '/layout/header.php'; ?>

<div class="row justify-content-center">
    <div class="col-md-8 col-lg-6">
        <div class="card shadow-sm border-0">
            <div class="card-header bg-transparent border-bottom py-3">
                <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-key me-2 text-primary"></i> Change Self Care Password</h5>
            </div>
            <div class="card-body p-4">
                <?php if (isset($_SESSION['must_change_password']) && $_SESSION['must_change_password'] === true): ?>
                    <div class="alert alert-warning border-0 bg-warning bg-opacity-10 text-dark small rounded-3 mb-4">
                        <div class="d-flex">
                            <i class="fas fa-exclamation-triangle me-2 mt-1 text-warning"></i>
                            <div>
                                <strong>Security Notice:</strong> As this is your first time logging into the self-care portal, please choose a new secure password. Your primary phone number will no longer be valid as a password.
                            </div>
                        </div>
                    </div>
                <?php endif; ?>

                <?php if (isset($pass_error)): ?>
                    <div class="alert alert-danger border-0 bg-danger bg-opacity-10 text-danger small rounded-3 mb-3 d-flex align-items-center">
                        <i class="fas fa-times-circle me-2"></i> <?= htmlspecialchars($pass_error) ?>
                    </div>
                <?php endif; ?>

                <form method="POST">
                    <?php if (!isset($_SESSION['must_change_password']) || $_SESSION['must_change_password'] !== true): ?>
                        <div class="mb-3">
                            <label class="form-label fw-semibold text-secondary small">Current Password</label>
                            <input type="password" name="current_pass" class="form-control" placeholder="Enter current password" required>
                        </div>
                    <?php endif; ?>

                    <div class="mb-3">
                        <label class="form-label fw-semibold text-secondary small">New Password</label>
                        <input type="password" name="new_pass" class="form-control" placeholder="Minimum 4 characters" required minlength="4">
                    </div>

                    <div class="mb-4">
                        <label class="form-label fw-semibold text-secondary small">Confirm New Password</label>
                        <input type="password" name="confirm_pass" class="form-control" placeholder="Re-type new password" required minlength="4">
                    </div>

                    <button type="submit" name="change_pass" class="btn btn-primary w-100 py-2 fw-bold shadow-sm">
                        <i class="fas fa-save me-1"></i> Save Password
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>

<?php require_once __DIR__ . '/layout/footer.php'; ?>
