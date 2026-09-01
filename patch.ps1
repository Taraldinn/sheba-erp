$content = Get-Content -Path "controllers/logic.php" -Raw
$search = "    if (isset(`$_GET['action']) && `$_GET['action'] == 'restore_client' && hasRole('SubReseller')) {"
$replace = @"
    if (isset(`$_POST['permanent_delete_client']) && hasRole('SubReseller')) {
        `$cid = intval(`$_POST['delete_client_id']);
        `$u = safeFetch(`$pdo, "SELECT * FROM ".TBL_USERS." WHERE id=?", [`$cid]);
        
        if (`$u && `$u['status'] == 'Left') {
            `$scope = getManagedStaffIds(`$pdo, `$user, `$role);
            if (`$scope !== 'ALL' && !in_array(`$u['manager_id'], `$scope)) {
                `$error = L('DENIED');
            } else {
                `$pdo->prepare("DELETE FROM ".TBL_USERS." WHERE id=?")->execute([`$cid]);
                writeLog(`$pdo, `$_SESSION['admin_username'], 'Perm Delete Client', `$cid, "Permanently deleted left client {`$u['user_id']}");
                `$msg = "Client permanently deleted.";
            }
        } else {
            `$error = "Client must be marked as Left before permanent deletion.";
        }
    }

    if (isset(`$_GET['action']) && `$_GET['action'] == 'restore_client' && hasRole('SubReseller')) {
"@
$content = $content.Replace($search, $replace)
Set-Content -Path "controllers/logic.php" -Value $content -NoNewline
