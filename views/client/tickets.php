<?php 
require_once __DIR__ . '/layout/header.php'; 
if (isset($_SESSION['flash_msg'])) {
    $ticket_success = $_SESSION['flash_msg'];
    unset($_SESSION['flash_msg']);
}
?>

<?php if (isset($ticket_success)): ?>
    <div class="alert alert-success alert-dismissible fade show" role="alert">
        <i class="fas fa-check-circle me-1"></i> <?= $ticket_success ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
<?php endif; ?>

<?php if (isset($ticket_error)): ?>
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
        <i class="fas fa-exclamation-circle me-1"></i> <?= $ticket_error ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
<?php endif; ?>

<?php if (isset($view_ticket) && $view_ticket): ?>
    <!-- Single Ticket View -->
    <div class="card mb-4 shadow-sm border-0">
        <div class="card-header bg-transparent border-bottom py-3 d-flex justify-content-between align-items-center">
            <h6 class="mb-0 fw-bold text-dark">Ticket Details 🎫</h6>
            <a href="?panel=client&tab=ticket" class="btn btn-sm btn-light border"><i class="fas fa-angle-left me-1"></i> Back</a>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-5 mb-3">
                    <div class="p-3 bg-light rounded">
                        <p class="mb-1"><strong>Category:</strong> <?= htmlspecialchars($view_ticket['category']) ?></p>
                        <p class="mb-1"><strong>Created:</strong> <?= date('d M Y, h:i A', strtotime($view_ticket['created_at'])) ?></p>
                        <p class="mb-1"><strong>Status:</strong> 
                            <?php if ($view_ticket['status'] === 'Open'): ?>
                                <span class="badge bg-warning text-dark">Open</span>
                            <?php elseif ($view_ticket['status'] === 'Answered'): ?>
                                <span class="badge bg-info">Answered</span>
                            <?php elseif ($view_ticket['status'] === 'Solved'): ?>
                                <span class="badge bg-success">Solved</span>
                            <?php else: ?>
                                <span class="badge bg-secondary">Closed</span>
                            <?php endif; ?>
                        </p>
                        <hr>
                        <strong>Message:</strong>
                        <p class="mb-0 mt-1"><?= nl2br(htmlspecialchars($view_ticket['message'])) ?></p>
                    </div>
                </div>
                <div class="col-md-7">
                    <h6 class="fw-bold mb-3">Conversation</h6>
                    <div class="conversation-box bg-white p-2 border rounded mb-3" style="max-height: 250px; overflow-y: auto;">
                        <?php if (empty($replies)): ?>
                            <div class="text-center text-muted py-4">No replies yet.</div>
                        <?php else: ?>
                            <?php foreach ($replies as $r): ?>
                                <div class="mb-2 <?= !$r['staff_name'] ? 'text-end' : '' ?>">
                                    <div class="d-inline-block p-2 rounded <?= !$r['staff_name'] ? 'bg-primary text-white' : 'bg-light text-dark' ?>" style="max-width: 85%;">
                                        <div class="small fw-bold">
                                            <?= $r['staff_name'] ? 'Support ('.htmlspecialchars($r['staff_name']).')' : 'You' ?>
                                        </div>
                                        <div><?= nl2br(htmlspecialchars($r['message'])) ?></div>
                                        <div class="small opacity-75" style="font-size: 0.72rem;">
                                            <?= date('d M, h:i A', strtotime($r['created_at'])) ?>
                                        </div>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                    
                    <?php if ($view_ticket['status'] !== 'Closed' && $view_ticket['status'] !== 'Solved'): ?>
                        <form method="POST" action="">
                            <input type="hidden" name="ticket_id" value="<?= $view_ticket['id'] ?>">
                            <input type="hidden" name="client_reply" value="1">
                            <div class="input-group input-group-sm">
                                <textarea name="message" class="form-control" placeholder="Reply here..." required></textarea>
                                <button type="submit" name="client_reply" class="btn btn-primary">Send</button>
                            </div>
                        </form>
                    <?php else: ?>
                        <div class="alert alert-light mt-3 py-2 text-center small">This ticket is closed and cannot be replied to.</div>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

<?php elseif (isset($_GET['action']) && $_GET['action'] === 'new'): ?>
    <!-- Create Ticket Form -->
    <div class="card mb-4 shadow-sm border-0">
        <div class="card-header bg-transparent border-bottom py-3 d-flex justify-content-between align-items-center">
            <h6 class="mb-0 fw-bold text-dark">Create New Ticket 🎫</h6>
            <a href="?panel=client&tab=ticket" class="btn btn-sm btn-light border"><i class="fas fa-angle-left me-1"></i> Back</a>
        </div>
        <div class="card-body">
            <form method="POST" action="/?panel=client&tab=ticket">
                <div class="mb-3">
                    <label class="form-label small text-muted">Please select complain type</label>
                    <select name="category" class="form-select" required>
                        <option value="" disabled selected>Please select complain type</option>
                        <option value="Line Problem/Internet Down">Line Problem/Internet Down</option>
                        <option value="Onu Red Light/PatchCot Repair">Onu Red Light/PatchCot Repair</option>
                        <option value="Router Re-Configuration">Router Re-Configuration</option>
                        <option value="Connection & Data-Loss">Connection & Data-Loss</option>
                        <option value="Speed-Problem">Speed-Problem</option>
                        <option value="Fibber Down">Fibber Down</option>
                        <option value="Wi-Fi Connection Issue Check">Wi-Fi Connection Issue Check</option>
                        <option value="DB High Solve">DB High Solve</option>
                        <option value="Ethernet Cable & Connector Check">Ethernet Cable & Connector Check</option>
                        <option value="Electricity Problem">Electricity Problem</option>
                        <option value="WiFi Password Change">WiFi Password Change</option>
                        <option value="Lan Line Setup">Lan Line Setup</option>
                    </select>
                </div>
                <div class="mb-3 position-relative">
                    <textarea name="message" class="form-control" rows="4" placeholder="Write here..." required></textarea>
                </div>
                <div class="text-center">
                    <button type="submit" name="create_ticket" class="btn btn-primary px-4">Send <i class="fas fa-paper-plane ms-1"></i></button>
                </div>
            </form>
        </div>
    </div>

<?php else: ?>
    <!-- Tickets List -->
    <div class="card mb-4 shadow-sm border-0">
        <div class="card-header bg-transparent border-bottom py-3 d-flex justify-content-between align-items-center">
            <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-ticket-alt me-2 text-warning"></i> Support Tickets</h6>
            <a href="?panel=client&tab=ticket&action=new" class="btn btn-sm btn-primary px-3 shadow-sm"><i class="fas fa-plus me-1"></i> New Ticket</a>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0 align-middle" style="font-size: 0.88rem;">
                    <thead class="table-light">
                        <tr>
                            <th>Date</th>
                            <th>Category</th>
                            <th>Message</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($tickets)): ?>
                            <tr>
                                <td colspan="5" class="text-center py-5 text-muted">
                                    <i class="fas fa-folder-open fa-2x mb-2 opacity-50"></i><br>
                                    You don't have any support tickets yet.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($tickets as $t): ?>
                                <tr>
                                    <td class="small text-muted"><?= date('d M Y, h:i A', strtotime($t['created_at'])) ?></td>
                                    <td class="fw-bold"><?= htmlspecialchars($t['category']) ?></td>
                                    <td class="text-truncate" style="max-width: 250px;"><?= htmlspecialchars($t['message']) ?></td>
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
                                        <a href="?panel=client&tab=ticket&ticket_id=<?= $t['id'] ?>" class="btn btn-xs btn-outline-primary">
                                            <i class="fas fa-eye"></i> View
                                        </a>
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

<?php require_once __DIR__ . '/layout/footer.php'; ?>
