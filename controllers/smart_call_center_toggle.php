<?php
// Dedicated tenant setting endpoint. A normal HTML form posts here, so it does
// not depend on the main dashboard router returning JSON.
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit('Method not allowed');
}

if (isLoggedIn() && isOffice() && !hasRole('Admin')) {
    $fresh = safeFetch($pdo, 'SELECT permissions FROM ' . TBL_STAFF . " WHERE id=? AND status='Active' LIMIT 1", [(int)($_SESSION['admin_id'] ?? 0)]);
    $_SESSION['user_permissions'] = $fresh ? (json_decode($fresh['permissions'] ?? '[]', true) ?: []) : [];
}

if (!isLoggedIn() || !(hasRole('Admin') || (isOffice() && hasPermission('settings')))) {
    $_SESSION['flash_error'] = 'Permission denied: Smart Call Center setting was not changed.';
} elseif (!hash_equals(get_csrf_token(), (string)($_POST['csrf_token'] ?? ''))) {
    $_SESSION['flash_error'] = 'Session expired. Reload Settings and try again.';
} else {
    $enabled = ($_POST['smart_call_center_enabled'] ?? '') === '1' ? '1' : '0';
    try {
        set_opt($pdo, 'smart_call_center_enabled', $enabled);
        if (smart_call_center_is_enabled($pdo) !== ($enabled === '1')) {
            throw new RuntimeException('Saved value verification failed.');
        }
        $_SESSION['flash_msg'] = 'Smart Call Center ' . ($enabled === '1' ? 'enabled' : 'disabled') . ' successfully.';
    } catch (Throwable $e) {
        error_log('Smart Call Center toggle failed: ' . $e->getMessage());
        $_SESSION['flash_error'] = 'Could not save Smart Call Center. Check the tenant settings table.';
    }
}
header('Location: ../index.php?tab=settings', true, 303);
exit;
