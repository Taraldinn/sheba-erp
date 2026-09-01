<?php
// views/tickets.php
if (!isLoggedIn()) exit;

$is_admin = hasRole('Admin');
$staff_id = $_SESSION['admin_id'] ?? 0;

// 1. Handle actions
if (isset($_GET['close_id'])) {
    $id = intval($_GET['close_id']);
    $pdo->prepare("UPDATE tickets SET status='Closed' WHERE id=?")->execute([$id]);
    $msg = "Ticket #$id has been closed.";
}

if (isset($_GET['solve_id'])) {
    $id = intval($_GET['solve_id']);
    $pdo->prepare("UPDATE tickets SET status='Solved' WHERE id=?")->execute([$id]);
    $msg = "Ticket #$id has been marked as Solved.";
}

if (isset($_GET['do_reply_msg'])) {
    $ticket_id = intval($_GET['ticket_id'] ?? 0);
    $message = trim($_GET['message'] ?? '');
    
    if ($ticket_id > 0 && $message !== '') {
        try {
            // Insert Reply conforming to Live Schema (sender_type, sender_id)
            $stmt = $pdo->prepare("INSERT INTO ticket_replies (ticket_id, sender_type, sender_id, message) VALUES (?, 'Staff', ?, ?)");
            $stmt->execute([$ticket_id, $staff_id, $message]);
            
            // Update Status to Answered
            $pdo->prepare("UPDATE tickets SET status='Answered' WHERE id=?")->execute([$ticket_id]);
            
            $_SESSION['flash_msg'] = "Reply added successfully! Status updated to Answered.";
            header("Location: ?tab=tickets&ticket_id=" . $ticket_id);
            exit;
        } catch (Exception $e) {
            $error = "Execution Error: " . $e->getMessage();
        }
    }
}

// 2. Load View Data (after actions)
$view_ticket = null;
$replies = [];
if (isset($_GET['ticket_id'])) {
    $tid = intval($_GET['ticket_id']);
    $view_ticket = safeFetch($pdo, "SELECT t.*, u.name as client_name, u.user_id as client_user_id, u.phone FROM tickets t JOIN " . TBL_USERS . " u ON t.client_id = u.id WHERE t.id=?", [$tid]);
    if ($view_ticket) {
        // Updated Query using (sender_type, sender_id)
        $replies = safeFetchAll($pdo, "SELECT r.*, 
                                        CASE WHEN r.sender_type = 'Staff' THEN s.name ELSE u.name END as sender_name 
                                        FROM ticket_replies r 
                                        LEFT JOIN ".TBL_STAFF." s ON r.sender_id = s.id AND r.sender_type = 'Staff' 
                                        LEFT JOIN ".TBL_USERS." u ON r.sender_id = u.id AND r.sender_type = 'Client' 
                                        WHERE r.ticket_id=? 
                                        ORDER BY r.created_at ASC", [$tid]);
    }
}

if (!$view_ticket) {
    if ($effective_ids === 'ALL') {
        $sql = "SELECT t.*, u.name as client_name, u.user_id as client_user_id 
                FROM tickets t 
                JOIN " . TBL_USERS . " u ON t.client_id = u.id 
                ORDER BY t.created_at DESC";
        $current_tickets = safeFetchAll($pdo, $sql);
    } else {
        $sql = "SELECT t.*, u.name as client_name, u.user_id as client_user_id 
                FROM tickets t 
                JOIN " . TBL_USERS . " u ON t.client_id = u.id 
                WHERE u.manager_id IN ($placeholders) 
                ORDER BY t.created_at DESC";
        $current_tickets = safeFetchAll($pdo, $sql, $effective_ids);
    }
}
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-ticket-alt me-2 text-warning"></i> Client Support Tickets</h4>
    <?php if ($view_ticket): ?>
        <a href="index.php?tab=tickets" class="btn btn-sm btn-light border"><i class="fas fa-angle-left me-1"></i> Back to List</a>
    <?php endif; ?>
</div>

<?php if (isset($msg)): ?>
    <div class="alert alert-success alert-dismissible fade show" role="alert">
        <i class="fas fa-check-circle me-1"></i> <?= $msg ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
<?php endif; ?>

<?php if (isset($error)): ?>
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
        <i class="fas fa-times-circle me-1"></i> <?= $error ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
<?php endif; ?>

<?php if ($view_ticket): ?>
    <!-- Ticket Details & Conversation -->
    <div class="row">
        <div class="col-md-4 mb-4">
            <div class="card shadow-sm border-0 h-100">
                <div class="card-header bg-transparent border-bottom">
                    <h6 class="mb-0 fw-bold">Ticket Info</h6>
                </div>
                <div class="card-body">
                    <ul class="list-unstyled mb-0">
                        <li class="mb-2"><strong>Ticket ID:</strong> #<?= $view_ticket['id'] ?></li>
                        <li class="mb-2"><strong>Client:</strong> <?= htmlspecialchars($view_ticket['client_name']) ?> (<?= htmlspecialchars($view_ticket['client_user_id']) ?>)</li>
                        <li class="mb-2"><strong>Phone:</strong> <?= htmlspecialchars($view_ticket['phone']) ?></li>
                        <li class="mb-2"><strong>Category:</strong> <span class="badge bg-light text-dark"><?= htmlspecialchars($view_ticket['category']) ?></span></li>
                        <li class="mb-2"><strong>Created At:</strong> <?= date('d M Y, h:i A', strtotime($view_ticket['created_at'])) ?></li>
                        <li class="mb-2"><strong>Status:</strong> 
                            <?php if ($view_ticket['status'] === 'Open'): ?>
                                <span class="badge bg-warning text-dark">Open</span>
                            <?php elseif ($view_ticket['status'] === 'Answered'): ?>
                                <span class="badge bg-info">Answered</span>
                            <?php elseif ($view_ticket['status'] === 'Solved'): ?>
                                <span class="badge bg-success">Solved</span>
                            <?php else: ?>
                                <span class="badge bg-secondary">Closed</span>
                            <?php endif; ?>
                        </li>
                    </ul>
                    <hr>
                    <strong>Original Message:</strong>
                    <div class="p-2 bg-light rounded mt-1">
                        <?= nl2br(htmlspecialchars($view_ticket['message'])) ?>
                    </div>
                </div>
                <div class="card-footer bg-transparent border-top">
                    <?php if ($view_ticket['status'] !== 'Closed' && $view_ticket['status'] !== 'Solved'): ?>
                        <a href="index.php?tab=tickets&solve_id=<?= $view_ticket['id'] ?>&ticket_id=<?= $view_ticket['id'] ?>" class="btn btn-sm btn-outline-success w-100 mb-2">
                            <i class="fas fa-check-circle me-1"></i> Mark as Solved
                        </a>
                        <a href="index.php?tab=tickets&close_id=<?= $view_ticket['id'] ?>&ticket_id=<?= $view_ticket['id'] ?>" class="btn btn-sm btn-outline-danger w-100">
                            <i class="fas fa-times-circle me-1"></i> Close Ticket
                        </a>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <div class="col-md-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-transparent border-bottom">
                    <h6 class="mb-0 fw-bold">Conversation</h6>
                </div>
                <div class="card-body" style="max-height: 400px; overflow-y: auto;">
                    <?php if (empty($replies)): ?>
                        <div class="text-center text-muted py-4">No replies yet.</div>
                    <?php else: ?>
                        <?php foreach ($replies as $r): ?>
                            <div class="mb-3 <?= $r['sender_type'] === 'Staff' ? 'text-end' : '' ?>">
                                <div class="d-inline-block p-2 rounded <?= $r['sender_type'] === 'Staff' ? 'bg-primary text-white' : 'bg-light text-dark' ?>" style="max-width: 80%;">
                                    <div class="small fw-bold mb-1">
                                        <?= $r['sender_type'] === 'Staff' ? 'Support ('.htmlspecialchars($r['sender_name']).')' : htmlspecialchars($r['sender_name']) ?>
                                    </div>
                                    <div class="text-wrap"><?= nl2br(htmlspecialchars($r['message'])) ?></div>
                                    <div class="small opacity-75 mt-1" style="font-size: 0.75rem;">
                                        <?= date('d M, h:i A', strtotime($r['created_at'])) ?>
                                    </div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
                <?php if ($view_ticket['status'] !== 'Closed' && $view_ticket['status'] !== 'Solved'): ?>
                    <div class="card-footer bg-transparent border-top">
                        <form method="GET" action="">
                            <input type="hidden" name="tab" value="tickets">
                            <input type="hidden" name="ticket_id" value="<?= $view_ticket['id'] ?>">
                            <input type="hidden" name="do_reply_msg" value="1">
                            <div class="input-group">
                                <textarea name="message" class="form-control" rows="1" placeholder="Type your reply here..." required></textarea>
                                <button type="submit" name="reply_btn" class="btn btn-primary">
                                    <i class="fas fa-paper-plane"></i>
                                </button>
                            </div>
                        </form>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>

<?php else: ?>
    <!-- Tickets List -->
    <div class="card shadow-sm border-0">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0 align-middle" style="font-size: 0.9rem;">
                    <thead class="table-light">
                        <tr>
                            <th>Date</th>
                            <th>Client</th>
                            <th>Complain Type</th>
                            <th>Message</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($current_tickets)): ?>
                            <tr>
                                <td colspan="6" class="text-center py-5 text-muted">
                                    <i class="fas fa-folder-open fa-2x mb-2 opacity-50"></i><br>
                                    No support tickets found.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($current_tickets as $t): ?>
                                <tr>
                                    <td class="small text-muted"><?= date('d M Y, h:i A', strtotime($t['created_at'])) ?></td>
                                    <td>
                                        <span class="fw-bold"><?= htmlspecialchars($t['client_name']) ?></span><br>
                                        <small class="text-muted"><?= htmlspecialchars($t['client_user_id']) ?></small>
                                    </td>
                                    <td class="fw-bold text-dark"><?= htmlspecialchars($t['category']) ?></td>
                                    <td class="text-wrap" style="max-width: 250px;"><?= htmlspecialchars($t['message']) ?></td>
                                    <td>
                                        <?php if ($t['status'] === 'Open'): ?>
                                            <span class="badge bg-warning text-dark">Open</span>
                                        <?php elseif ($t['status'] === 'Answered'): ?>
                                            <span class="badge bg-info">Answered</span>
                                        <?php elseif ($t['status'] === 'Solved'): ?>
                                            <span class="badge bg-success">Solved</span>
                                        <?php else: ?>
                                            <span class="badge bg-secondary">Closed</span>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <a href="index.php?tab=tickets&ticket_id=<?= $t['id'] ?>" class="btn btn-xs btn-outline-primary">
                                            <i class="fas fa-eye me-1"></i> View
                                        </a>
                                        <?php if ($t['status'] !== 'Closed' && $t['status'] !== 'Solved'): ?>
                                            <a href="index.php?tab=tickets&solve_id=<?= $t['id'] ?>" class="btn btn-xs btn-outline-success" onclick="return confirm('Mark this ticket as solved?');">
                                                <i class="fas fa-check me-1"></i> Solve
                                            </a>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
<?php endif; ?>
