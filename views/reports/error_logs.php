<?php
// ERROR LOGS VIEW
if (!isLoggedIn()) return;

$user_id = $_SESSION['admin_id'];
$role = $_SESSION['user_role'];
$isAdmin = hasRole('Admin') || isOffice();

if (!$isAdmin) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}

// Auto-delete Password Mismatch logs that have been solved and are older than 24 hours
$pdo->exec("DELETE FROM ".TBL_LOGS." WHERE action_type = 'Password Mismatch' AND description LIKE '%(Solved)%' AND timestamp < DATE_SUB(NOW(), INTERVAL 24 HOUR)");

// 1. Handle "Fix Mismatches" action
$success_msg = '';
$error_msg = '';

if (isset($_POST['fix_mismatches']) && isset($_POST['router_id'])) {
    $router_id = intval($_POST['router_id']);
    $router = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$router_id]);
    if ($router) {
        try {
            $mk = new MikrotikApp($router);
            $secrets = $mk->getSecrets();
            $secrets_map = [];
            foreach ($secrets as $s) {
                if (isset($s['name'])) {
                    $secrets_map[$s['name']] = $s;
                }
            }
            
            // Fetch users belonging to this router
            $users = safeFetchAll($pdo, "SELECT id, user_id, password, status, user_package FROM ".TBL_USERS." WHERE router_id=?", [$router_id]);
            $fixed_count = 0;
            
            foreach ($users as $u) {
                $user_id_str = $u['user_id'];
                $db_pass = $u['password'] ?? '';
                if (isset($secrets_map[$user_id_str])) {
                    $mt_pass = $secrets_map[$user_id_str]['password'] ?? '';
                    if ($db_pass !== $mt_pass) {
                        // Get package profile
                        $svc = safeFetch($pdo, "SELECT mikrotik_profile_name FROM ".TBL_SERVICES." WHERE name=?", [$u['user_package']]);
                        $profile = $svc['mikrotik_profile_name'] ?? '';
                        $enable = ($u['status'] === 'Active');
                        
                        // Set the password
                        $mk->toggle($user_id_str, $enable, $profile, $db_pass);
                        $fixed_count++;
                        
                        // Mark logs as solved for this user
                        $pdo->prepare("UPDATE ".TBL_LOGS." SET description = CONCAT(description, ' (Solved)') WHERE target_id=? AND action_type='Password Mismatch' AND description NOT LIKE '%(Solved)%'")->execute([$u['id']]);
                    }
                }
            }
            
            writeLog($pdo, $_SESSION['admin_username'], 'Fix Password Mismatches', $router_id, "Fixed $fixed_count password mismatches on router {$router['name']}.");
            $success_msg = "Successfully updated $fixed_count users on MikroTik to match the database passwords.";
        } catch (Exception $e) {
            $error_msg = "Error fixing mismatches: " . $e->getMessage();
        }
    } else {
        $error_msg = "Router not found.";
    }
}

// 2. Handle "Audit Scan" action
$audit_results = null;
$scan_router_id = 0;
if (isset($_GET['action']) && $_GET['action'] === 'audit' && isset($_GET['router_id'])) {
    $scan_router_id = intval($_GET['router_id']);
    $router = safeFetch($pdo, "SELECT * FROM ".TBL_ROUTERS." WHERE id=?", [$scan_router_id]);
    if ($router) {
        try {
            $mk = new MikrotikApp($router);
            $secrets = $mk->getSecrets();
            $secrets_map = [];
            foreach ($secrets as $s) {
                if (isset($s['name'])) {
                    $secrets_map[$s['name']] = $s['password'] ?? '';
                }
            }
            
            $users = safeFetchAll($pdo, "SELECT id, name, user_id, password, status FROM ".TBL_USERS." WHERE router_id=?", [$scan_router_id]);
            $audit_results = [];
            foreach ($users as $u) {
                $user_id_str = $u['user_id'];
                $db_pass = $u['password'] ?? '';
                if (isset($secrets_map[$user_id_str])) {
                    $mt_pass = $secrets_map[$user_id_str];
                    if ($db_pass !== $mt_pass) {
                        $audit_results[] = [
                            'id' => $u['id'],
                            'name' => $u['name'],
                            'user_id' => $user_id_str,
                            'db_pass' => $db_pass,
                            'mt_pass' => $mt_pass,
                            'status' => $u['status']
                        ];
                    } else {
                        // Passwords MATCH! If there are any pending mismatch logs for this user, mark them as Solved
                        $pdo->prepare("UPDATE ".TBL_LOGS." SET description = CONCAT(description, ' (Solved)') WHERE target_id=? AND action_type='Password Mismatch' AND description NOT LIKE '%(Solved)%'")->execute([$u['id']]);
                    }
                }
            }
        } catch (Exception $e) {
            $error_msg = "Error connecting to router for audit: " . $e->getMessage();
        }
    }
}

// 3. Fetch log entries for Password Mismatch
$query = "SELECT * FROM ".TBL_LOGS." WHERE action_type = 'Password Mismatch' ORDER BY id DESC LIMIT 100";
$logs = safeFetchAll($pdo, $query);

$routers = safeFetchAll($pdo, "SELECT * FROM ".TBL_ROUTERS." ORDER BY id DESC");
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-exclamation-triangle me-2 text-danger"></i> Password Mismatch & Error Logs</h4>
</div>

<?php if (!empty($success_msg)): ?>
    <div class="alert alert-success alert-dismissible fade show" role="alert">
        <i class="fas fa-check-circle me-2"></i> <?= htmlspecialchars($success_msg) ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
<?php endif; ?>

<?php if (!empty($error_msg)): ?>
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
        <i class="fas fa-exclamation-circle me-2"></i> <?= htmlspecialchars($error_msg) ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
<?php endif; ?>

<div class="row g-4 mb-4">
    <!-- Manual Scanner Card -->
    <div class="col-md-5">
        <div class="card shadow-sm border-0 h-100">
            <div class="card-header bg-white py-3 border-0">
                <h5 class="card-title mb-0 fw-bold"><i class="fas fa-search me-2 text-primary"></i> Router Password Audit</h5>
            </div>
            <div class="card-body">
                <p class="text-muted small">Compare database passwords with actual MikroTik secrets for all users on a specific router.</p>
                <form method="GET" class="row g-2 align-items-end">
                    <input type="hidden" name="tab" value="error_logs">
                    <input type="hidden" name="action" value="audit">
                    <div class="col-sm-8">
                        <label class="form-label small fw-bold">Select Router</label>
                        <select name="router_id" class="form-select form-select-sm" required>
                            <option value="">-- Choose Router --</option>
                            <?php foreach ($routers as $r): ?>
                                <option value="<?= $r['id'] ?>" <?= ($scan_router_id == $r['id']) ? 'selected' : '' ?>><?= htmlspecialchars($r['name']) ?> (<?= htmlspecialchars($r['ip_address']) ?>)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="col-sm-4">
                        <button type="submit" class="btn btn-primary btn-sm w-100"><i class="fas fa-play me-1"></i> Audit Scan</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    
    <!-- Audit Results Card (if run) -->
    <?php if ($audit_results !== null): ?>
    <div class="col-md-7">
        <div class="card shadow-sm border-0 h-100">
            <div class="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
                <h5 class="card-title mb-0 fw-bold"><i class="fas fa-list-check me-2 text-warning"></i> Audit Scan Results</h5>
                <span class="badge bg-<?= count($audit_results) > 0 ? 'danger' : 'success' ?>"><?= count($audit_results) ?> Mismatches</span>
            </div>
            <div class="card-body p-0">
                <?php if (empty($audit_results)): ?>
                    <div class="text-center py-5 text-success">
                        <i class="fas fa-check-circle fa-3x mb-3"></i>
                        <p class="mb-0 fw-bold">All passwords are perfectly synchronized on this router!</p>
                    </div>
                <?php else: ?>
                    <div class="table-responsive" style="max-height: 250px;">
                        <table class="table table-hover align-middle mb-0 small">
                            <thead class="bg-light sticky-top">
                                <tr>
                                    <th class="ps-3">User ID</th>
                                    <th>DB Pass</th>
                                    <th>MikroTik Pass</th>
                                    <th class="text-end pe-3">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($audit_results as $u): ?>
                                    <tr>
                                        <td class="ps-3 fw-bold"><a href="?view_id=<?= $u['id'] ?>" target="_blank"><?= htmlspecialchars($u['user_id']) ?></a></td>
                                        <td><code class="text-success"><?= htmlspecialchars($u['db_pass']) ?></code></td>
                                        <td><code class="text-danger"><?= htmlspecialchars($u['mt_pass']) ?></code></td>
                                        <td class="text-end pe-3">
                                            <span class="badge bg-<?= $u['status'] === 'Active' ? 'success' : 'secondary' ?>"><?= $u['status'] ?></span>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                    <div class="p-3 bg-light border-top d-flex justify-content-end">
                        <form method="POST">
                            <input type="hidden" name="router_id" value="<?= $scan_router_id ?>">
                            <button type="submit" name="fix_mismatches" class="btn btn-warning btn-sm fw-bold text-dark"><i class="fas fa-wrench me-1"></i> Sync & Fix All Mismatches</button>
                        </form>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <?php endif; ?>
</div>

<div class="card shadow-sm border-0">
    <div class="card-header bg-white py-3 border-0">
        <h5 class="card-title mb-0 fw-bold"><i class="fas fa-history me-2 text-danger"></i> Password Mismatch Log History</h5>
    </div>
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="bg-light">
                    <tr>
                        <th class="ps-3" width="180">Date/Time</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Ref ID</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if(empty($logs)): ?>
                        <tr><td colspan="5" class="text-center py-5 text-muted">No password mismatch events logged yet.</td></tr>
                    <?php else: foreach($logs as $l): ?>
                        <tr>
                            <td class="ps-3 text-muted small"><i class="far fa-clock me-1"></i> <?= date('d M Y, h:i A', strtotime($l['timestamp'])) ?></td>
                            <td class="fw-bold text-primary"><?= htmlspecialchars($l['admin_user']) ?></td>
                            <td><span class="badge bg-danger"><?= htmlspecialchars($l['action_type']) ?></span></td>
                            <td class="small text-muted">
                                <?php if ($l['target_id'] > 0): ?>
                                    <a href="?view_id=<?= $l['target_id'] ?>" target="_blank">#<?= $l['target_id'] ?></a>
                                <?php else: ?>
                                    #<?= $l['target_id'] ?>
                                <?php endif; ?>
                            <td>
                                <?php 
                                    $desc = htmlspecialchars($l['description']);
                                    if (strpos($desc, '(Solved)') !== false) {
                                        $clean_desc = str_replace('(Solved)', '', $desc);
                                        echo $clean_desc . ' <span class="badge bg-success ms-2"><i class="fas fa-check-circle me-1"></i> Solved</span>';
                                    } else {
                                        echo $desc;
                                    }
                                ?>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
