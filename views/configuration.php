<?php
// CONFIGURATION VIEW (ZONES & TJ BOXES)
if(!hasRole('SubReseller')) { echo "<div class='alert alert-danger'>Access Denied.</div>"; return; }

$zones = safeFetchAll($pdo, "SELECT * FROM ".TBL_ZONES." WHERE staff_id=? ORDER BY id DESC", [$user]);
$tj_boxes = safeFetchAll($pdo, "SELECT t.*, z.name as zone_name FROM ".TBL_TJ_BOXES." t LEFT JOIN ".TBL_ZONES." z ON t.zone_id = z.id WHERE t.staff_id=? ORDER BY t.id DESC", [$user]);

function parse_fiber_codes_structured($fiber_code_str) {
    if (empty($fiber_code_str)) {
        return [];
    }
    $decoded = json_decode($fiber_code_str, true);
    if (is_array($decoded)) {
        $result = [];
        foreach ($decoded as $f) {
            $cat = str_replace('core', ' Core', $f['category'] ?? '2core');
            $io = $f['in_out'] ?? 'In';
            $brand = $f['brand'] ?? '';
            $code = $f['code'] ?? '';
            
            $color_emojis = [
                'blue' => '🔵', 'orange' => '🟠', 'green' => '🟢', 'brown' => '🟤', 
                'slate' => '🔘', 'white' => '⚪', 'red' => '🔴', 'black' => '⚫', 
                'yellow' => '🟡', 'violet' => '🟣', 'rose' => '🌸', 'aqua' => '💧'
            ];
            
            $cores = $f['cores'] ?? [];
            $total_cores = intval($f['category'] ?? 2);
            $used_count = 0;
            $free_count = 0;
            $cores_details = [];
            
            $standard_core_colors = ['blue', 'orange', 'green', 'brown', 'slate', 'white', 'red', 'black', 'yellow', 'violet', 'rose', 'aqua'];
            
            for ($i = 1; $i <= $total_cores; $i++) {
                $core = $cores[$i - 1] ?? ['status' => 'free', 'note' => '', 'color' => ''];
                $status = $core['status'] ?? 'free';
                $note = $core['note'] ?? '';
                
                $core_color = strtolower(trim($core['color'] ?? ''));
                if (empty($core_color)) {
                    $core_color = $standard_core_colors[($i - 1) % 12];
                }
                
                if ($status === 'used') {
                    $used_count++;
                } else {
                    $free_count++;
                }
                
                $status_txt = ucfirst($status);
                $note_txt = $note ? " - " . $note : "";
                $core_emoji = $color_emojis[$core_color] ?? '⚙️';
                $cores_details[] = "{$core_emoji} Core {$i}: {$status_txt}{$note_txt}";
            }
            
            // Get Core 1's color for the main badge emoji prefix
            $first_core = $cores[0] ?? ['color' => 'blue'];
            $first_core_color = strtolower(trim($first_core['color'] ?? 'blue'));
            if (empty($first_core_color)) {
                $first_core_color = 'blue';
            }
            $emoji = $color_emojis[$first_core_color] ?? '⚙️';
            
            $display_brand_code = trim(($brand ? $brand . " " : "") . $code);
            $tooltip_title = implode("<br>", $cores_details);
            $display_text = "{$emoji} {$display_brand_code} ({$cat}, {$io}) [U:{$used_count}, F:{$free_count}]";
            
            $result[] = [
                'display' => $display_text,
                'tooltip' => $tooltip_title
            ];
        }
        return $result;
    }
    
    // Fallback for plain text
    $lines = array_filter(array_map('trim', explode("\n", $fiber_code_str)));
    $result = [];
    foreach ($lines as $line) {
        $result[] = [
            'display' => $line,
            'tooltip' => $line
        ];
    }
    return $result;
}
?>

<?php if(isset($_GET['success'])): ?>
    <div class="alert alert-success alert-dismissible fade show" role="alert">
        <?php 
        if($_GET['success'] == 'tj_added') echo "TJ Box Added Successfully";
        elseif($_GET['success'] == 'tj_updated') echo "TJ Box Updated Successfully";
        ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
<?php endif; ?>

<div class="row g-4">
    <!-- Zone Management -->
    <div class="col-md-6">
        <div class="card shadow-sm">
            <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                <h6 class="mb-0 fw-bold"><i class="fas fa-map-marker-alt me-2 text-primary"></i> My Zones</h6>
                <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#addZoneModal">Add Zone</button>
            </div>
            <div class="card-body p-0">
                <ul class="list-group list-group-flush">
                    <?php if(empty($zones)): ?>
                        <li class="list-group-item text-center py-4 text-muted small">No zones added yet.</li>
                    <?php else: foreach($zones as $z): ?>
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            <span><?= $z['name'] ?></span>
                            <a href="?tab=configuration&action=delete_zone&id=<?= $z['id'] ?>" class="btn btn-link btn-sm text-danger p-0" onclick="return confirm('Delete this zone?')"><i class="fas fa-trash"></i></a>
                        </li>
                    <?php endforeach; endif; ?>
                </ul>
            </div>
        </div>
    </div>

    <!-- TJ Box Management -->
    <div class="col-md-6">
        <div class="card shadow-sm">
            <div class="card-header bg-white py-3">
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-2">
                    <h5 class="mb-0 text-dark fw-bold"><i class="fas fa-microchip text-success me-2"></i> TJ Boxes / Ports</h5>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-primary btn-sm" id="viewFiberMapBtn"><i class="fas fa-map me-1"></i> View Map</button>
                        <button class="btn btn-success btn-sm" data-bs-toggle="modal" data-bs-target="#addTJModal"><i class="fas fa-plus me-1"></i> Add Box</button>
                    </div>
                </div>
                <input type="text" id="tjSearch" class="form-control" placeholder="Search by Name, Zone, or Fiber Code...">
            </div>
            <div class="card-body p-0">
                <ul class="list-group list-group-flush" id="tjList">
                    <?php if(empty($tj_boxes)): ?>
                        <li class="list-group-item text-center py-4 text-muted small">No TJ Boxes added yet.</li>
                    <?php else: foreach($tj_boxes as $tj): ?>
                        <li class="list-group-item p-3 border-bottom hover-bg-light transition-base">
                            <div class="d-flex flex-wrap align-items-center gap-2">
                                <!-- Icon & Text (Order 1) -->
                                <div class="d-flex align-items-center flex-grow-1" style="min-width: 200px;">
                                    <div class="avatar avatar-md bg-light-primary text-primary rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 40px; height: 40px;">
                                        <i class="fas fa-box"></i>
                                    </div>
                                    <div class="ms-3">
                                        <div class="fw-bold text-dark h6 mb-0">
                                            <?= htmlspecialchars($tj['name'], ENT_QUOTES) ?>
                                            <span class="badge bg-secondary ms-2 text-white" style="font-size: 0.7rem; font-weight: normal;"><?= htmlspecialchars($tj['box_category'] ?? 'Master Box', ENT_QUOTES) ?></span>
                                        </div>
                                        <div class="small text-muted mt-1">
                                            <span class="me-2">
                                                <i class="fas fa-map-pin me-1 text-secondary"></i>
                                                <?= $tj['zone_name'] ? htmlspecialchars($tj['zone_name'], ENT_QUOTES) : '<span class="text-secondary opacity-50">No Zone</span>' ?>
                                            </span>
                                            <?php if(!empty($tj['notes'])): ?>
                                                <span class="d-block mt-1 small text-dark"><i class="far fa-sticky-note me-1 text-warning"></i> <?= htmlspecialchars($tj['notes'], ENT_QUOTES) ?></span>
                                            <?php endif; ?>
                                        </div>
                                    </div>
                                </div>

                                <!-- Actions (Order 2 Mobile / Order 3 Desktop) -->
                                <div class="d-flex gap-2 ms-auto ms-lg-2 order-2 order-md-3">
                                    <?php if($tj['lat_long']): ?>
                                        <a href="https://www.google.com/maps?q=<?= $tj['lat_long'] ?>" target="_blank" class="btn btn-sm btn-light text-info rounded-circle shadow-sm border" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;" title="View on Google Maps">
                                            <i class="fas fa-map-marked-alt"></i>
                                        </a>
                                    <?php endif; ?>
                                    <button class="btn btn-sm btn-light text-primary rounded-circle shadow-sm border edit-tj-btn" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;" data-id="<?= $tj['id'] ?>" data-name="<?= htmlspecialchars($tj['name'], ENT_QUOTES) ?>" data-zone="<?= htmlspecialchars($tj['zone_id'], ENT_QUOTES) ?>" data-fiber="<?= htmlspecialchars($tj['fiber_code'], ENT_QUOTES) ?>" data-latlong="<?= htmlspecialchars($tj['lat_long'], ENT_QUOTES) ?>" data-category="<?= htmlspecialchars($tj['box_category'] ?? 'Master Box', ENT_QUOTES) ?>" data-notes="<?= htmlspecialchars($tj['notes'] ?? '', ENT_QUOTES) ?>" title="Edit">
                                         <i class="fas fa-pen"></i>
                                     </button>
                                     
                                     <a href="?tab=configuration&action=delete_tj&id=<?= $tj['id'] ?>" class="btn btn-sm btn-light text-danger rounded-circle shadow-sm border delete-tj-btn" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;" title="Delete">
                                         <i class="fas fa-trash"></i>
                                     </a>
                                </div>

                                <!-- Fiber Codes (Order 3 Mobile / Order 2 Desktop) -->
                                <div class="d-flex flex-wrap gap-1 w-100 w-md-auto justify-content-start justify-content-md-end mt-2 mt-md-0 order-3 order-md-2 flex-md-grow-1" style="max-width: 100%;">
                                    <?php if($tj['fiber_code']): 
                                        $display_items = parse_fiber_codes_structured($tj['fiber_code']);
                                        foreach($display_items as $item): ?>
                                            <span class="badge rounded-pill bg-light text-dark border fw-normal" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="<?= htmlspecialchars($item['tooltip'], ENT_QUOTES) ?>"><?= htmlspecialchars($item['display'], ENT_QUOTES) ?></span>
                                    <?php endforeach; endif; ?>
                                </div>
                            </div>
                        </li>
                    <?php endforeach; endif; ?>
                </ul>
            </div>
        </div>
    </div>
</div>

<!-- Add Zone Modal -->
<div class="modal fade" id="addZoneModal" tabindex="-1">
    <div class="modal-dialog"><form method="POST" class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Add Area Name / Zone</h5></div>
        <div class="modal-body">
            <input type="text" name="zone_name" class="form-control" placeholder="e.g. West Dhanmondi" required>
        </div>
        <div class="modal-footer">
            <button type="submit" name="add_zone" class="btn btn-primary w-100">Save Zone</button>
        </div>
    </form></div>
</div>

<!-- Add TJ Modal -->
<div class="modal fade" id="addTJModal" tabindex="-1">
    <div class="modal-dialog"><form method="POST" class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Add TJ Box / OLT Port</h5></div>
        <div class="modal-body">
            <div class="mb-3">
                <label class="form-label">Box Name / ID</label>
                <input type="text" name="tj_name" class="form-control" placeholder="e.g. BOX-A1" required>
            </div>
            
            <div class="mb-3">
                <label class="form-label">Select Zone</label>
                <select name="zone_id" class="form-select">
                    <option value="0">-- Select Zone --</option>
                    <?php foreach($zones as $z): ?>
                        <option value="<?= $z['id'] ?>"><?= $z['name'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="mb-3">
                <label class="form-label">Box Category</label>
                <select name="box_category" class="form-select">
                    <option value="Master Box">Master Box</option>
                    <option value="Splitter Box">Splitter Box</option>
                    <option value="Zone/point Box">Zone/point Box</option>
                </select>
            </div>

            <div class="mb-3">
                <label class="form-label d-flex justify-content-between align-items-center">
                    <span>Fiber Lines</span>
                    <button type="button" class="btn btn-xs btn-outline-success add-fiber-row-btn" data-container="add_fiber_container">
                        <i class="fas fa-plus"></i> Add Line
                    </button>
                </label>
                <input type="hidden" name="fiber_code" id="add_fiber_code_hidden">
                <div id="add_fiber_container" class="border rounded p-2 bg-light" style="max-height: 250px; overflow-y: auto;">
                    <!-- Rows will be dynamically added here -->
                </div>
            </div>

            <div class="mb-3">
                <label class="form-label">Notes (e.g. sub-zone names separated by comma)</label>
                <textarea name="notes" class="form-control" rows="2" placeholder="e.g. SubZone-1, SubZone-2"></textarea>
            </div>

            <div class="mb-3">
                <label class="form-label">Location (Lat, Long)</label>
                <div class="input-group">
                    <input type="text" name="lat_long" id="lat_long_input" class="form-control" placeholder="23.1234, 90.1234">
                    <button type="button" id="add_tj_get_loc" class="btn btn-outline-secondary"><i class="fas fa-map-marker-alt"></i> Get</button>
                </div>
            </div>

            <script>
            document.addEventListener('DOMContentLoaded', function() {
                const btn = document.getElementById('add_tj_get_loc');
                if (btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        getLocation();
                    });
                }
            });
            function getLocation() {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(showPosition);
                } else { 
                    alert("Geolocation is not supported by this browser.");
                }
            }
            function showPosition(position) {
                document.getElementById('lat_long_input').value = position.coords.latitude + ", " + position.coords.longitude;
            }
            </script>
        </div>
        <div class="modal-footer">
            <button type="submit" name="add_tj" class="btn btn-success w-100">Save Box</button>
        </div>
    </form></div>
</div>

<!-- Edit TJ Modal -->
<div class="modal fade" id="editTJModal" tabindex="-1">
    <div class="modal-dialog"><form method="POST" class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Edit TJ Box</h5></div>
        <div class="modal-body">
            <input type="hidden" name="tj_id" id="edit_tj_id">
            <div class="mb-3">
                <label class="form-label">Box Name / ID</label>
                <input type="text" name="tj_name" id="edit_tj_name" class="form-control" required>
            </div>
            
            <div class="mb-3">
                <label class="form-label">Select Zone</label>
                <select name="zone_id" id="edit_zone_id" class="form-select">
                    <option value="0">-- Select Zone --</option>
                    <?php foreach($zones as $z): ?>
                        <option value="<?= $z['id'] ?>"><?= $z['name'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="mb-3">
                <label class="form-label">Box Category</label>
                <select name="box_category" id="edit_box_category" class="form-select">
                    <option value="Master Box">Master Box</option>
                    <option value="Splitter Box">Splitter Box</option>
                    <option value="Zone/point Box">Zone/point Box</option>
                </select>
            </div>

            <div class="mb-3">
                <label class="form-label d-flex justify-content-between align-items-center">
                    <span>Fiber Lines</span>
                    <button type="button" class="btn btn-xs btn-outline-success add-fiber-row-btn" data-container="edit_fiber_container">
                        <i class="fas fa-plus"></i> Add Line
                    </button>
                </label>
                <input type="hidden" name="fiber_code" id="edit_fiber_code_hidden">
                <div id="edit_fiber_container" class="border rounded p-2 bg-light" style="max-height: 250px; overflow-y: auto;">
                    <!-- Rows will be dynamically added here -->
                </div>
            </div>

            <div class="mb-3">
                <label class="form-label">Notes (e.g. sub-zone names separated by comma)</label>
                <textarea name="notes" id="edit_notes" class="form-control" rows="2"></textarea>
            </div>

            <div class="mb-3">
                <label class="form-label">Location (Lat, Long)</label>
                <div class="input-group">
                    <input type="text" name="lat_long" id="edit_lat_long" class="form-control">
                    <button type="button" id="edit_tj_get_loc" class="btn btn-outline-secondary"><i class="fas fa-map-marker-alt"></i> Get</button>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="submit" name="edit_tj" class="btn btn-primary w-100">Update Box</button>
        </div>
    </form></div>
</div>
        <script>
const colorMap = {
    'blue': '#1E90FF',
    'orange': '#FFA500',
    'green': '#32CD32',
    'brown': '#8B4513',
    'slate': '#708090',
    'white': '#D3D3D3',
    'red': '#FF0000',
    'black': '#000000',
    'yellow': '#D4AF37',
    'violet': '#8A2BE2',
    'rose': '#FF69B4',
    'aqua': '#00CED1'
};

function initTooltips() {
    var tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltips.forEach(function(el) {
        var t = bootstrap.Tooltip.getInstance(el);
        if (t) t.dispose();
    });
    
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

function parseFiberCodes(fiberCodeStr) {
    if (!fiberCodeStr) return [];
    let list = [];
    const standardCoreColors = ['blue', 'orange', 'green', 'brown', 'slate', 'white', 'red', 'black', 'yellow', 'violet', 'rose', 'aqua'];
    try {
        let parsed = JSON.parse(fiberCodeStr);
        if (Array.isArray(parsed)) {
            list = parsed;
        }
    } catch (e) {
        list = fiberCodeStr.split('\n').map(line => line.trim()).filter(line => line).map(line => {
            let code = line;
            let brand = '';
            let parts = line.split('-');
            if (parts.length > 1) {
                brand = parts[0].trim();
                code = parts.slice(1).join('-');
            }
            return {
                category: '2core',
                in_out: 'In',
                brand: brand,
                code: code
            };
        });
    }

    list.forEach(item => {
        let count = parseInt(item.category) || 2;
        if (!item.cores || !Array.isArray(item.cores)) {
            item.cores = [];
        }
        while (item.cores.length < count) {
            item.cores.push({ status: 'free', note: '', color: '' });
        }
        if (item.cores.length > count) {
            item.cores = item.cores.slice(0, count);
        }
        
        item.cores.forEach((c, idx) => {
            if (!c.color) {
                c.color = standardCoreColors[idx % 12];
            }
        });
    });

    return list;
}

function createFiberRowHtml(category = '2core', inOut = 'In', brand = '', code = '', cores = []) {
    const categories = ['2core', '4core', '6core', '12core', '24core'];
    const standardCoreColors = ['blue', 'orange', 'green', 'brown', 'slate', 'white', 'red', 'black', 'yellow', 'violet', 'rose', 'aqua'];
    const emojiMap = {
        blue: '🔵', orange: '🟠', green: '🟢', brown: '🟤', 
        slate: '🔘', white: '⚪', red: '🔴', black: '⚫', 
        yellow: '🟡', violet: '🟣', rose: '🌸', aqua: '💧'
    };

    let categoryOptions = categories.map(c => `<option value="${c}" ${c === category ? 'selected' : ''}>${c.replace('core', ' Core')}</option>`).join('');
    let inOutOptions = ['In', 'Out'].map(io => `<option value="${io}" ${io === inOut ? 'selected' : ''}>${io}</option>`).join('');

    let count = parseInt(category) || 2;
    let coresHtml = '';
    for (let i = 1; i <= count; i++) {
        let existing = cores[i - 1] || { status: 'free', note: '', color: '' };
        let status = existing.status || 'free';
        let note = existing.note || '';
        let coreColor = existing.color || standardCoreColors[(i - 1) % 12];
        
        let selectClass = status === 'used' ? 'text-danger fw-bold' : 'text-success';
        let bgClass = status === 'used' ? 'bg-light-danger border-danger-subtle' : 'bg-light-success border-success-subtle';
        
        let colorOptionsHtml = standardCoreColors.map(cName => {
            return `<option value="${cName}" ${cName === coreColor ? 'selected' : ''}>${emojiMap[cName] || '⚙️'}</option>`;
        }).join('');

        coresHtml += `
        <div class="d-flex align-items-center gap-1 p-1 border rounded ${bgClass} core-item" style="font-size: 0.8rem; min-width: 195px;" data-core-num="${i}">
            <span class="fw-bold text-secondary ps-1">${i}:</span>
            <select class="form-select form-select-sm py-0 px-1 core-status-select ${selectClass}" style="width: 65px; font-size: 0.75rem; border: none; background-color: transparent;">
                <option value="free" ${status === 'free' ? 'selected' : ''} class="text-success">Free</option>
                <option value="used" ${status === 'used' ? 'selected' : ''} class="text-danger fw-bold">Used</option>
            </select>
            <select class="form-select form-select-sm py-0 px-1 core-color-select" style="width: 48px; font-size: 0.75rem; border: none; border-left: 1px solid #dee2e6; border-radius: 0; background-color: transparent;">
                ${colorOptionsHtml}
            </select>
            <input type="text" class="form-control form-control-sm py-0 px-1 core-note-input" placeholder="Note" value="${escapeHtml(note)}" style="width: 65px; font-size: 0.75rem; border: none; border-left: 1px solid #dee2e6; border-radius: 0; background-color: transparent;">
        </div>`;
    }

    return `
    <div class="card p-2 mb-3 bg-light border fiber-row-item">
        <div class="row g-2 align-items-center mb-2">
            <div class="col-2 col-md-2">
                <select class="form-select form-select-sm fiber-cat-select" required>${categoryOptions}</select>
            </div>
            <div class="col-2 col-md-2">
                <select class="form-select form-select-sm fiber-io-select" required>${inOutOptions}</select>
            </div>
            <div class="col-3 col-md-3">
                <input type="text" class="form-control form-control-sm fiber-brand-input" placeholder="Brand" value="${escapeHtml(brand)}">
            </div>
            <div class="col-3 col-md-3">
                <input type="text" class="form-control form-control-sm fiber-code-input" placeholder="Code" value="${escapeHtml(code)}" required>
            </div>
            <div class="col-2 col-md-2 text-end d-flex gap-1 justify-content-end align-items-center">
                <button type="button" class="btn btn-sm btn-outline-secondary border-0 p-1 toggle-cores-btn" title="Toggle Cores"><i class="fas fa-chevron-up"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1 remove-fiber-row-btn" title="Remove"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <!-- Cores Sub-container -->
        <div class="cores-container-wrapper mt-1">
            <div class="text-muted small mb-1 fw-bold">Cores Configuration:</div>
            <div class="d-flex flex-wrap gap-2 cores-list-container">
                ${coresHtml}
            </div>
        </div>
    </div>`;
}

function renderCores(container, count, existingCores = []) {
    container.innerHTML = '';
    const standardCoreColors = ['blue', 'orange', 'green', 'brown', 'slate', 'white', 'red', 'black', 'yellow', 'violet', 'rose', 'aqua'];
    const emojiMap = {
        blue: '🔵', orange: '🟠', green: '🟢', brown: '🟤', 
        slate: '🔘', white: '⚪', red: '🔴', black: '⚫', 
        yellow: '🟡', violet: '🟣', rose: '🌸', aqua: '💧'
    };
    
    for (let i = 1; i <= count; i++) {
        let existing = existingCores[i - 1] || { status: 'free', note: '', color: '' };
        let status = existing.status || 'free';
        let note = existing.note || '';
        let coreColor = existing.color || standardCoreColors[(i - 1) % 12];
        
        let selectClass = status === 'used' ? 'text-danger fw-bold' : 'text-success';
        let bgClass = status === 'used' ? 'bg-light-danger border-danger-subtle' : 'bg-light-success border-success-subtle';
        
        let colorOptionsHtml = standardCoreColors.map(cName => {
            return `<option value="${cName}" ${cName === coreColor ? 'selected' : ''}>${emojiMap[cName] || '⚙️'}</option>`;
        }).join('');
        
        let coreHtml = `
        <div class="d-flex align-items-center gap-1 p-1 border rounded ${bgClass} core-item" style="font-size: 0.8rem; min-width: 195px;" data-core-num="${i}">
            <span class="fw-bold text-secondary ps-1">${i}:</span>
            <select class="form-select form-select-sm py-0 px-1 core-status-select ${selectClass}" style="width: 65px; font-size: 0.75rem; border: none; background-color: transparent;">
                <option value="free" ${status === 'free' ? 'selected' : ''} class="text-success">Free</option>
                <option value="used" ${status === 'used' ? 'selected' : ''} class="text-danger fw-bold">Used</option>
            </select>
            <select class="form-select form-select-sm py-0 px-1 core-color-select" style="width: 48px; font-size: 0.75rem; border: none; border-left: 1px solid #dee2e6; border-radius: 0; background-color: transparent;">
                ${colorOptionsHtml}
            </select>
            <input type="text" class="form-control form-control-sm py-0 px-1 core-note-input" placeholder="Note" value="${escapeHtml(note)}" style="width: 65px; font-size: 0.75rem; border: none; border-left: 1px solid #dee2e6; border-radius: 0; background-color: transparent;">
        </div>`;
        
        container.insertAdjacentHTML('beforeend', coreHtml);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', function() {
    initTooltips();

    const editBtn = document.getElementById('edit_tj_get_loc');
    if (editBtn) {
        editBtn.addEventListener('click', function(e) {
            e.preventDefault();
            getEditLocation();
        });
    }

    const addContainer = document.getElementById('add_fiber_container');
    if (addContainer && addContainer.children.length === 0) {
        addContainer.innerHTML = createFiberRowHtml();
    }

    // Dynamic core rendering on category selection change
    document.addEventListener('change', function(e) {
        if (e.target && e.target.classList.contains('fiber-cat-select')) {
            let select = e.target;
            let card = select.closest('.fiber-row-item');
            if (card) {
                let container = card.querySelector('.cores-list-container');
                if (container) {
                    let catVal = select.value;
                    let count = parseInt(catVal) || 2;
                    
                    let currentCores = [];
                    card.querySelectorAll('.core-item').forEach(item => {
                        let num = parseInt(item.getAttribute('data-core-num'));
                        let status = item.querySelector('.core-status-select').value;
                        let color = item.querySelector('.core-color-select').value;
                        let note = item.querySelector('.core-note-input').value.trim();
                        currentCores[num - 1] = { status, color, note };
                    });
                    
                    renderCores(container, count, currentCores);
                }
            }
        }

        // Color updates on status change
        if (e.target && e.target.classList.contains('core-status-select')) {
            let select = e.target;
            let val = select.value;
            let coreItem = select.closest('.core-item');
            if (coreItem) {
                if (val === 'used') {
                    coreItem.classList.remove('bg-light-success', 'border-success-subtle');
                    coreItem.classList.add('bg-light-danger', 'border-danger-subtle');
                    select.classList.remove('text-success');
                    select.classList.add('text-danger', 'fw-bold');
                } else {
                    coreItem.classList.remove('bg-light-danger', 'border-danger-subtle');
                    coreItem.classList.add('bg-light-success', 'border-success-subtle');
                    select.classList.remove('text-danger', 'fw-bold');
                    select.classList.add('text-success');
                }
            }
        }
    });

    document.addEventListener('click', function(e) {
        if (e.target && e.target.closest('.add-fiber-row-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.add-fiber-row-btn');
            const containerId = btn.getAttribute('data-container');
            const container = document.getElementById(containerId);
            if (container) {
                const emptyMsg = container.querySelector('.empty-placeholder');
                if (emptyMsg) emptyMsg.remove();
                
                const div = document.createElement('div');
                div.innerHTML = createFiberRowHtml();
                container.appendChild(div.firstElementChild);
            }
        }
        
        if (e.target && e.target.closest('.remove-fiber-row-btn')) {
            e.preventDefault();
            const row = e.target.closest('.fiber-row-item');
            const container = row.parentNode;
            row.remove();
            
            if (container.children.length === 0) {
                container.innerHTML = `<div class="text-muted text-center py-2 empty-placeholder" style="font-size: 0.8rem;">No fiber lines added. Click "Add Line" to add one.</div>`;
            }
        }
        
        if (e.target && e.target.closest('.toggle-cores-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.toggle-cores-btn');
            const row = btn.closest('.fiber-row-item');
            const coresWrapper = row.querySelector('.cores-container-wrapper');
            const icon = btn.querySelector('i');
            if (coresWrapper && icon) {
                if (coresWrapper.classList.contains('d-none')) {
                    coresWrapper.classList.remove('d-none');
                    icon.className = 'fas fa-chevron-up';
                } else {
                    coresWrapper.classList.add('d-none');
                    icon.className = 'fas fa-chevron-down';
                }
            }
        }
    });

    const addForm = document.querySelector('#addTJModal form');
    if (addForm) {
        addForm.addEventListener('submit', function(e) {
            const rows = this.querySelectorAll('#add_fiber_container .fiber-row-item');
            let data = [];
            rows.forEach(row => {
                const category = row.querySelector('.fiber-cat-select').value;
                const in_out = row.querySelector('.fiber-io-select').value;
                const brand = row.querySelector('.fiber-brand-input').value.trim();
                const code = row.querySelector('.fiber-code-input').value.trim();
                
                let cores = [];
                row.querySelectorAll('.core-item').forEach(item => {
                    const status = item.querySelector('.core-status-select').value;
                    const color = item.querySelector('.core-color-select').value;
                    const note = item.querySelector('.core-note-input').value.trim();
                    cores.push({ status, color, note });
                });

                if (code) {
                    data.push({ category, in_out, brand, code, cores });
                }
            });
            document.getElementById('add_fiber_code_hidden').value = JSON.stringify(data);
        });
    }

    const editForm = document.querySelector('#editTJModal form');
    if (editForm) {
        editForm.addEventListener('submit', function(e) {
            const rows = this.querySelectorAll('#edit_fiber_container .fiber-row-item');
            let data = [];
            rows.forEach(row => {
                const category = row.querySelector('.fiber-cat-select').value;
                const in_out = row.querySelector('.fiber-io-select').value;
                const brand = row.querySelector('.fiber-brand-input').value.trim();
                const code = row.querySelector('.fiber-code-input').value.trim();
                
                let cores = [];
                row.querySelectorAll('.core-item').forEach(item => {
                    const status = item.querySelector('.core-status-select').value;
                    const color = item.querySelector('.core-color-select').value;
                    const note = item.querySelector('.core-note-input').value.trim();
                    cores.push({ status, color, note });
                });

                if (code) {
                    data.push({ category, in_out, brand, code, cores });
                }
            });
            document.getElementById('edit_fiber_code_hidden').value = JSON.stringify(data);
        });
    }

    // Edit TJ Modal Trigger
    const editTjButtons = document.querySelectorAll('.edit-tj-btn');
    editTjButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const id = this.getAttribute('data-id');
            const name = this.getAttribute('data-name');
            const zoneId = this.getAttribute('data-zone');
            const fiberCode = this.getAttribute('data-fiber');
            const latLong = this.getAttribute('data-latlong');
            const boxCategory = this.getAttribute('data-category');
            const notes = this.getAttribute('data-notes');
            editTJ(id, name, zoneId, fiberCode, latLong, boxCategory, notes);
        });
    });

    // Delete TJ Confirmation
    const deleteTjButtons = document.querySelectorAll('.delete-tj-btn');
    deleteTjButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (!confirm('Delete this TJ box?')) {
                e.preventDefault();
            }
        });
    });

    const viewMapBtn = document.getElementById('viewFiberMapBtn');
    if (viewMapBtn) {
        viewMapBtn.addEventListener('click', showFiberMap);
    }

    const tjSearchInput = document.getElementById('tjSearch');
    if (tjSearchInput) {
        tjSearchInput.addEventListener('keyup', filterTJBoxes);
    }
});

function editTJ(id, name, zoneId, fiberCode, latLong, boxCategory, notes) {
    document.getElementById('edit_tj_id').value = id;
    document.getElementById('edit_tj_name').value = name;
    document.getElementById('edit_zone_id').value = zoneId;
    document.getElementById('edit_lat_long').value = latLong;
    document.getElementById('edit_box_category').value = boxCategory || 'Master Box';
    document.getElementById('edit_notes').value = notes || '';
    
    const editContainer = document.getElementById('edit_fiber_container');
    if (editContainer) {
        editContainer.innerHTML = '';
        let list = parseFiberCodes(fiberCode);
        if (list.length > 0) {
            list.forEach(item => {
                const div = document.createElement('div');
                div.innerHTML = createFiberRowHtml(item.category, item.in_out, item.brand || '', item.code, item.cores);
                editContainer.appendChild(div.firstElementChild);
            });
        } else {
            editContainer.innerHTML = `<div class="text-muted text-center py-2 empty-placeholder" style="font-size: 0.8rem;">No fiber lines added. Click "Add Line" to add one.</div>`;
        }
    }
    
    var myModal = new bootstrap.Modal(document.getElementById('editTJModal'));
    myModal.show();
}

function getEditLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            document.getElementById('edit_lat_long').value = position.coords.latitude + ", " + position.coords.longitude;
        });
    } else { 
        alert("Geolocation is not supported by this browser.");
    }
}
</script>

<!-- Fiber Network Map Modal -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-polylineoffset@1.1.1/leaflet.polylineoffset.js"></script>

<div class="modal fade" id="mapModal" tabindex="-1">
    <style>
        .fiber-dist-label {
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #666;
            border-radius: 4px;
            padding: 2px 5px;
            font-size: 11px;
            font-weight: bold;
            color: #333;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        #fiberMap {
            width: 100%;
            height: 100%;
        }
        .fiber-map-modal-content {
            height: 90vh;
        }
    </style>
    <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content fiber-map-modal-content">
            <div class="modal-header">
                <h5 class="modal-title"><i class="fas fa-project-diagram me-2"></i> Fiber Network Map</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div id="fiberMap"></div>
            </div>
        </div>
    </div>
</div>

<script>
let map;
let tjBoxes = <?= json_encode($tj_boxes) ?>;

function showFiberMap() {
    var myModal = new bootstrap.Modal(document.getElementById('mapModal'));
    myModal.show();
    
    setTimeout(() => {
        if (!map) {
            initMap();
        }
    }, 500); // Wait for modal animation
}

function initMap() {
    // Fix Leaflet marker icon issue
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
    });

    map = L.map('fiberMap').setView([23.8103, 90.4125], 13); // Default Dhaka

    // Base Layers - GOOGLE MAPS (Same as Online Monitoring)
    var streetLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0','mt1','mt2','mt3'],
        attribution: '&copy; Google Maps'
    }).addTo(map);

    var satelliteLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0','mt1','mt2','mt3'],
        attribution: '&copy; Google Maps'
    });

    var terrainLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0','mt1','mt2','mt3'],
        attribution: '&copy; Google Maps'
    });

    // Layer Control
    var baseMaps = {
        "Google Streets": streetLayer,
        "Google Satellite": satelliteLayer,
        "Google Terrain": terrainLayer
    };
    L.control.layers(baseMaps).addTo(map);
    
    plotMapData();
}

function plotMapData() {
    let bounds = [];
    let fiberGroups = {};

    // Clear existing layers (except tile layers)
    map.eachLayer(function (layer) {
        if (!layer._url) map.removeLayer(layer);
    });

    tjBoxes.forEach(box => {
        if (box.lat_long && box.lat_long.includes(',')) {
            let parts = box.lat_long.split(',').map(p => parseFloat(p.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                let lat = parts[0];
                let lng = parts[1];
                let latLng = [lat, lng];
                bounds.push(latLng);

                let popupContent = `<b>${escapeHtml(box.name)}</b>`;
                if (box.box_category) {
                    popupContent += ` <span class="badge bg-secondary small" style="font-size:0.7rem;">${escapeHtml(box.box_category)}</span>`;
                }
                if (box.zone_name) {
                    popupContent += `<br><small class="text-muted"><i class="fas fa-map-pin me-1"></i>${escapeHtml(box.zone_name)}</small>`;
                }
                if (box.notes) {
                    popupContent += `<br><small class="text-dark"><i class="far fa-sticky-note me-1 text-warning"></i>${escapeHtml(box.notes)}</small>`;
                }
                
                let list = parseFiberCodes(box.fiber_code);
                if (list.length > 0) {
                    popupContent += `<br><small style="display:block;margin-top:5px;border-top:1px solid #ddd;padding-top:3px;">`;
                    list.forEach(f => {
                        let colorEmojis = {
                            blue: '🔵', orange: '🟠', green: '🟢', brown: '🟤',
                            slate: '🔘', white: '⚪', red: '🔴', black: '⚫',
                            yellow: '🟡', violet: '🟣', rose: '🌸', aqua: '💧'
                        };
                        
                        let firstCoreColor = (f.cores && f.cores.length > 0 && f.cores[0].color) ? f.cores[0].color : 'blue';
                        let emoji = colorEmojis[firstCoreColor] || '⚙️';
                        let catPretty = f.category.replace('core', ' Core');
                        
                        let coresSummary = '';
                        let coresDetail = '';
                        if (f.cores && Array.isArray(f.cores)) {
                            let used = f.cores.filter(c => c.status === 'used').length;
                            let total = parseInt(f.category) || 2;
                            coresSummary = ` [U:${used}, F:${total - used}]`;
                            
                            coresDetail += `<div class="ps-3 text-muted" style="font-size: 0.7rem; line-height: 1.1; margin-bottom: 2px;">`;
                            f.cores.forEach((c, idx) => {
                                let dot = colorEmojis[c.color] || '⚪';
                                let noteStr = c.note ? ` (${escapeHtml(c.note)})` : '';
                                coresDetail += `${dot} C${idx+1}: ${c.status}${noteStr}<br>`;
                            });
                            coresDetail += `</div>`;
                        }
                        
                        let displayBrandCode = escapeHtml(((f.brand ? f.brand + " " : "") + f.code).trim());
                        popupContent += `${emoji} <b>${displayBrandCode}</b> (${catPretty}, ${f.in_out})${coresSummary}<br>${coresDetail}`;
                    });
                    popupContent += `</small>`;
                }

                L.marker(latLng).addTo(map)
                    .bindPopup(popupContent);

                list.forEach(f => {
                    let rawCode = (f.code || '').toString().trim();
                    if (rawCode) {
                        let brand = (f.brand || '').toString().trim();
                        let code = brand ? (brand + ' ' + rawCode) : rawCode;
                        let firstCoreColor = (f.cores && f.cores.length > 0 && f.cores[0].color) ? f.cores[0].color : 'blue';
                        if (!fiberGroups[code]) {
                            fiberGroups[code] = {
                                points: [],
                                color: firstCoreColor
                            };
                        }
                        fiberGroups[code].points.push(latLng);
                    }
                });
            }
        }
    });

    if (bounds.length > 0) {
        map.fitBounds(bounds, {padding: [50, 50]});
    }

    let connectionGroups = {};

    Object.keys(fiberGroups).forEach(code => {
        let points = fiberGroups[code].points;
        let fiberColor = fiberGroups[code].color;
        if (points.length > 1) {
            for (let i = 0; i < points.length - 1; i++) {
                let p1 = points[i];
                let p2 = points[i+1];
                
                let k1 = p1.join(',');
                let k2 = p2.join(',');
                let key = (k1 < k2) ? `${k1}|${k2}` : `${k2}|${k1}`;
                
                if (!connectionGroups[key]) connectionGroups[key] = [];
                connectionGroups[key].push({
                    start: p1,
                    end: p2,
                    code: code,
                    color: colorMap[fiberColor] || getRandomColor()
                });
            }
        }
    });

    // Draw lines with offsets
    Object.keys(connectionGroups).forEach(key => {
        let lines = connectionGroups[key];
        let total = lines.length;
        
        lines.forEach((line, index) => {
            // Offset calculation for leaflet-polylineoffset
            let offsetIndex = index - (total - 1) / 2;
            let offsetAmount = offsetIndex * 6; // 6 pixels offset
            
            // Show label only on the middle line (or close to middle)
            let showLabel = (index === Math.floor((total - 1) / 2));
            
            fetchRoute(line.start, line.end, line.color, line.code, offsetAmount, showLabel);
        });
    });
}

function fetchRoute(start, end, color, code, offset, showLabel) {
    // OSRM expects lng,lat
    let url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
    
    fetch(url)
    .then(response => response.json())
    .then(data => {
        if (data.routes && data.routes.length > 0) {
            let route = data.routes[0];
            let coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // Flip to lat,lng
            
            // Calculate Distance
            let distance = route.distance; // Meters
            let distDisplay = distance > 1000 ? (distance / 1000).toFixed(2) + ' km' : Math.round(distance) + ' m';

            let line = L.polyline(coords, {
                color: color, 
                weight: 4, 
                opacity: 0.8,
                offset: offset 
            }).addTo(map);

            // Hover Tooltip
            line.bindTooltip(`<b>Fiber: ${code}</b><br>Distance: ${distDisplay}`, {sticky: true});

            // Permanent Label (if strictly needed)
            if (showLabel) {
                line.bindTooltip(distDisplay, {
                    permanent: true, 
                    direction: 'center', 
                    className: 'fiber-dist-label',
                    offset: [0, 0] // Centered on line
                });
            }

        } else {
            // Fallback to straight line
            let line = L.polyline([start, end], {
                color: color, 
                weight: 4, 
                opacity: 0.8, 
                dashArray: '5, 10',
                offset: offset
            }).addTo(map);

            line.bindTooltip(`<b>Fiber: ${code}</b><br>Distance: Direct (Est.)`, {sticky: true});
             
            if (showLabel) {
                 // Est distance using Haversine or simple map distance could be added here
                 // For now, just show "Direct"
                 line.bindTooltip("Direct", {
                    permanent: true, 
                    direction: 'center', 
                    className: 'fiber-dist-label'
                });
            }
        }
    })
    .catch(err => {
        console.error("OSRM Error:", err);
        L.polyline([start, end], {
            color: color, 
            weight: 4, 
            opacity: 0.8, 
            dashArray: '5, 10',
            offset: offset
        })
        .bindTooltip(`Fiber: ${code} (Direct)`, {sticky: true})
        .addTo(map);
    });
}

function getRandomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Search Filter Logic
function filterTJBoxes() {
    let input = document.getElementById('tjSearch');
    let filter = input.value.toLowerCase();
    let ul = document.getElementById('tjList');
    let li = ul.getElementsByTagName('li');
    let hasResults = false;

    // Remove existing "No results" message if any
    let noResultMsg = document.getElementById('no-tj-results');
    if (noResultMsg) noResultMsg.remove();

    for (let i = 0; i < li.length; i++) {
        // Skip the "No items" message if exists
        if (li[i].classList.contains('text-center') && !li[i].classList.contains('tj-item')) continue;

        let text = li[i].textContent || li[i].innerText;
        if (text.toLowerCase().indexOf(filter) > -1) {
            li[i].style.display = "";
            hasResults = true;
        } else {
            li[i].style.display = "none";
        }
    }

    if (!hasResults && filter !== '') {
        let msg = document.createElement('li');
        msg.id = 'no-tj-results';
        msg.className = 'list-group-item text-center py-3 text-muted';
        msg.textContent = 'No matching boxes found.';
        ul.appendChild(msg);
    }
    initTooltips();
}
</script>
