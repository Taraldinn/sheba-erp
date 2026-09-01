<?php
// LEFT RESELLERS VIEW
if (!hasRole('Admin')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$left_agents = safeFetchAll($pdo, "SELECT * FROM ".TBL_STAFF." WHERE role IN ('Reseller', 'SubReseller', 'Agent') AND status = 'Left' ORDER BY id DESC");
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="mb-0 fw-bold text-danger"><i class="fas fa-user-times me-2"></i> Left Resellers</h4>
    <a href="?tab=agents" class="btn btn-outline-primary btn-sm rounded-pill px-3">
        <i class="fas fa-arrow-left me-1"></i> Back to Resellers
    </a>
</div>

<div class="card shadow-sm border-0">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3">Reseller Info</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Final Balance</th>
                        <th>Outstanding Due</th>
                        <th class="text-end pe-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($left_agents)): ?>
                        <tr><td colspan="6" class="text-center py-5 text-muted">No left resellers found</td></tr>
                    <?php else: foreach($left_agents as $a): ?>
                        <tr>
                            <td class="ps-3">
                                <div class="fw-bold text-dark"><?= $a['name'] ?></div>
                                <div class="small text-muted"><?= $a['phone'] ?></div>
                            </td>
                            <td><span class="badge bg-light text-dark border"><?= $a['username'] ?></span></td>
                            <td><span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle"><?= $a['role'] ?></span></td>
                            <td class="text-muted">৳<?= number_format($a['balance'], 2) ?></td>
                            <td class="fw-bold text-danger">৳<?= number_format($a['due_balance'], 2) ?></td>
                            <td class="text-end pe-3">
                                <div class="btn-group">
                                    <a href="?tab=agents&action=restore_staff&id=<?= $a['id'] ?>" class="btn btn-outline-success btn-sm" title="Restore Reseller" onclick="return confirm('Restore this reseller to Active?')">
                                        <i class="fas fa-trash-restore"></i>
                                    </a>
                                    <a href="?tab=agents&action=perm_delete_staff&id=<?= $a['id'] ?>" class="btn btn-outline-danger btn-sm" title="Delete Permanently" onclick="return confirm('PERMANENTLY DELETE this reseller record? This cannot be undone.')">
                                        <i class="fas fa-trash"></i>
                                    </a>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
