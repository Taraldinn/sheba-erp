<?php
// views/call_center/voice_templates.php
if (!isLoggedIn()) exit;

$staff_id = $_SESSION['admin_id'] ?? 0;
$current_role = $_SESSION['user_role'] ?? 'Staff';

// Strict permission: Only Admin or Reseller can manage templates
if (!hasRole('Admin') && strcasecmp($current_role, 'Reseller') !== 0) {
    echo "<div class='container mt-4'><div class='alert alert-danger shadow-sm border-start border-4 border-danger'><i class='fas fa-exclamation-triangle me-2'></i>Access Denied. Only Tenant Owners or Administrators can manage templates.</div></div>";
    exit;
}

// Fetch all templates
$owner_id = get_store_owner_id();
if (hasRole('Admin')) {
    $templates = safeFetchAll($pdo, "SELECT * FROM voice_templates ORDER BY id DESC");
} else {
    $templates = safeFetchAll($pdo, "SELECT * FROM voice_templates WHERE staff_id = ? ORDER BY id DESC", [$owner_id]);
}
?>

<div class="row">
    <!-- Templates list -->
    <div class="col-lg-7 mb-4">
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white border-bottom py-3">
                <h5 class="mb-0 fw-bold text-dark"><i class="fas fa-file-audio text-info me-2"></i> Voice Message Templates</h5>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0" style="font-size:0.88rem;">
                        <thead class="bg-light text-nowrap">
                            <tr>
                                <th class="ps-3">Name</th>
                                <th>Type</th>
                                <th>Language</th>
                                <th>Transcript / Message</th>
                                <th>Audio Preview</th>
                                <th class="pe-3 text-end">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($templates)): ?>
                                <tr><td colspan="6" class="text-center py-5 text-muted"><i class="fas fa-folder-open fa-2x mb-2 opacity-50"></i><br>No voice message templates created yet.</td></tr>
                            <?php else: foreach($templates as $t): ?>
                                <tr>
                                    <td class="ps-3 fw-bold text-dark"><?= htmlspecialchars($t['name']) ?></td>
                                    <td><span class="badge bg-light text-dark border"><?= htmlspecialchars($t['type']) ?></span></td>
                                    <td><span class="badge bg-secondary"><?= htmlspecialchars($t['language']) ?></span></td>
                                    <td class="text-wrap small text-muted" style="max-width:200px;">
                                        <?= nl2br(htmlspecialchars($t['message_text'])) ?>
                                    </td>
                                    <td>
                                        <?php if (!empty($t['audio_file_path'])): ?>
                                            <audio src="<?= htmlspecialchars($t['audio_file_path']) ?>" controls style="height:25px; width:130px;"></audio>
                                        <?php else: ?>
                                            <span class="text-muted italic small"><i class="fas fa-keyboard me-1 opacity-50"></i>TTS Only</span>
                                        <?php endif; ?>
                                    </td>
                                    <td class="pe-3 text-end text-nowrap">
                                        <button class="btn btn-xs btn-light border text-primary" onclick='populateEditForm(<?= json_encode($t, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)' title="Edit"><i class="fas fa-edit"></i></button>
                                        <a href="controllers/call_center_controller.php?action=delete_voice_template&id=<?= $t['id'] ?>" class="btn btn-xs btn-light border text-danger ms-1" onclick="return confirm('Are you sure you want to permanently delete this voice template?');" title="Delete"><i class="fas fa-trash"></i></a>
                                    </td>
                                </tr>
                            <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Add/Edit form -->
    <div class="col-lg-5">
        <div class="card shadow-sm border-0 sticky-top" style="top:20px;">
            <div class="card-header bg-dark text-white py-3">
                <h5 class="mb-0 fw-bold" id="form_title_txt"><i class="fas fa-plus me-2 text-warning"></i> Create New Voice Template</h5>
            </div>
            <div class="card-body p-4">
                <form method="POST" action="controllers/call_center_controller.php" enctype="multipart/form-data">
                    <input type="hidden" name="action" value="save_voice_template">
                    <input type="hidden" name="id" id="template_edit_id" value="0">
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Template Name <span class="text-danger">*</span></label>
                        <input type="text" name="name" id="tpl_name" class="form-control rounded-3" placeholder="e.g. Expired Package Bangla Reminder" required>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Template Type <span class="text-danger">*</span></label>
                        <select name="type" id="tpl_type" class="form-select rounded-3" required>
                            <option value="Expired package reminder">Expired package reminder</option>
                            <option value="Due bill reminder">Due bill reminder</option>
                            <option value="New offer campaign">New offer campaign</option>
                            <option value="Service notice">Service notice</option>
                            <option value="Complaint follow-up">Complaint follow-up</option>
                            <option value="Maintenance notice">Maintenance notice</option>
                        </select>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Audio Recording File (Optional)</label>
                        <input type="file" name="audio_file" class="form-control rounded-3" accept=".mp3,.wav,.ogg">
                        <small class="text-muted d-block mt-1" style="font-size:11px;">Supported formats: **MP3, WAV, OGG**. Leave empty to use text-to-speech fallback only.</small>
                        <div id="edit_audio_current" class="mt-2 small text-success d-none"><i class="fas fa-check-circle me-1"></i>An audio file is currently attached to this template.</div>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">Language</label>
                        <select name="language" id="tpl_lang" class="form-select rounded-3">
                            <option value="Bangla">Bangla</option>
                            <option value="English">English</option>
                        </select>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-muted">TTS Text / Transcript Text <span class="text-danger">*</span></label>
                        <textarea name="message_text" id="tpl_text" class="form-control rounded-3" rows="4" placeholder="e.g. প্রিয় [NAME], আপনার ইন্টারনেট বিল [AMOUNT] টাকা বকেয়া রয়েছে। অনুগ্রহ করে [DATE] তারিখের মধ্যে পরিশোধ করুন।" required></textarea>
                        
                        <!-- Catalog of placeholders -->
                        <div class="mt-2 p-2 bg-light rounded border small">
                            <span class="fw-bold d-block text-secondary text-uppercase mb-1" style="font-size:10px;">Available Placeholders:</span>
                            <div class="d-flex flex-wrap gap-1">
                                <button type="button" class="btn btn-xs btn-light border py-0 px-1 rounded shadow-none small" onclick="insertPlaceholder('[NAME]')"><code>[NAME]</code> (Customer Name)</button>
                                <button type="button" class="btn btn-xs btn-light border py-0 px-1 rounded shadow-none small" onclick="insertPlaceholder('[ID]')"><code>[ID]</code> (Customer Phone)</button>
                                <button type="button" class="btn btn-xs btn-light border py-0 px-1 rounded shadow-none small" onclick="insertPlaceholder('[AMOUNT]')"><code>[AMOUNT]</code> (Due/Bill Amount)</button>
                                <button type="button" class="btn btn-xs btn-light border py-0 px-1 rounded shadow-none small" onclick="insertPlaceholder('[DATE]')"><code>[DATE]</code> (Expiry Date)</button>
                                <button type="button" class="btn btn-xs btn-light border py-0 px-1 rounded shadow-none small" onclick="insertPlaceholder('[PACKAGE]')"><code>[PACKAGE]</code> (Package Name)</button>
                            </div>
                        </div>
                    </div>
                    
                    <hr class="bg-light">
                    
                    <div class="d-flex justify-content-between">
                        <button type="button" id="form_cancel_btn" class="btn btn-light rounded-pill px-4 d-none" onclick="resetTplForm()"><i class="fas fa-times me-1"></i> Cancel</button>
                        <button type="submit" class="btn btn-dark rounded-pill px-5 shadow-sm fw-bold ms-auto"><i class="fas fa-save me-1"></i> Save Template</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script>
function insertPlaceholder(placeholder) {
    const txtArea = document.getElementById('tpl_text');
    const start = txtArea.selectionStart;
    const end = txtArea.selectionEnd;
    const text = txtArea.value;
    txtArea.value = text.substring(0, start) + placeholder + text.substring(end);
    txtArea.focus();
    txtArea.selectionStart = txtArea.selectionEnd = start + placeholder.length;
}

function populateEditForm(data) {
    document.getElementById('form_title_txt').innerHTML = '<i class="fas fa-edit me-2 text-warning"></i> Edit Voice Template';
    document.getElementById('template_edit_id').value = data.id;
    document.getElementById('tpl_name').value = data.name;
    document.getElementById('tpl_type').value = data.type;
    document.getElementById('tpl_text').value = data.message_text;
    document.getElementById('tpl_lang').value = data.language;
    document.getElementById('form_cancel_btn').classList.remove('d-none');
    
    let audioAttachedDiv = document.getElementById('edit_audio_current');
    if (data.audio_file_path && data.audio_file_path !== '') {
        audioAttachedDiv.classList.remove('d-none');
    } else {
        audioAttachedDiv.classList.add('d-none');
    }
}

function resetTplForm() {
    document.getElementById('form_title_txt').innerHTML = '<i class="fas fa-plus me-2 text-warning"></i> Create New Voice Template';
    document.getElementById('template_edit_id').value = '0';
    document.getElementById('tpl_name').value = '';
    document.getElementById('tpl_type').value = 'Expired package reminder';
    document.getElementById('tpl_text').value = '';
    document.getElementById('tpl_lang').value = 'Bangla';
    document.getElementById('form_cancel_btn').classList.add('d-none');
    document.getElementById('edit_audio_current').classList.add('d-none');
}
</script>
