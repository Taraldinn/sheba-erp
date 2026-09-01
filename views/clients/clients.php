<?php
// CLIENTS VIEW
$recharge_discount_enabled = (get_opt($pdo, 'recharge_discount_enabled') === '1');
?>
<style>
    .address-cell {
        font-size: 0.85rem;
        line-height: 1.2;
    }
    @media (min-width: 768px) {
        .address-cell {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
    }
    /* Force responsive horizontal scroll boundaries */
    .table-responsive {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 #f8f9fa;
    }
    /* Ensure table has minimum width to force horizontal scrolling rather than squishing columns */
    .table-responsive table {
        min-width: 1200px !important;
    }
    /* Sleek custom scrollbar style for responsive tables */
    .table-responsive::-webkit-scrollbar,
    .table-responsive-top::-webkit-scrollbar {
        height: 10px;
    }
    .table-responsive::-webkit-scrollbar-track,
    .table-responsive-top::-webkit-scrollbar-track {
        background: #f8f9fa;
        border-radius: 4px;
    }
    .table-responsive::-webkit-scrollbar-thumb,
    .table-responsive-top::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 4px;
        transition: background 0.2s ease;
    }
    .table-responsive::-webkit-scrollbar-thumb:hover,
    .table-responsive-top::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
    }
    /* Sticky Top Scrollbar and Table Header Sync */
    .table-responsive-top {
        position: sticky;
        top: 0;
        z-index: 1020;
        background: #ffffff;
        border-bottom: 1px solid #dee2e6;
        height: 10px;
    }
    .table-responsive table thead th {
        position: sticky;
        top: 0;
        z-index: 1010;
        background-color: #f8f9fa !important;
        box-shadow: inset 0 -1px 0 #dee2e6;
    }
    .card-body.has-top-scroll .table-responsive table thead th {
        top: 10px; /* height of the top scrollbar */
    }
    
    .bulk-actions-buttons-row {
        display: contents;
    }

    .bulk-due-toggle {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        cursor: pointer;
        user-select: none;
    }
    .bulk-due-toggle .form-check-input {
        margin: 0 !important;
        flex: 0 0 auto;
        cursor: pointer;
    }
    .bulk-due-toggle-copy {
        display: flex;
        flex-direction: column;
        line-height: 1.1;
    }
    .bulk-due-toggle-title {
        font-size: .72rem;
        font-weight: 800;
        color: #dc3545;
        white-space: nowrap;
    }
    .bulk-due-toggle-help { display: none; }
    .bulk-due-toggle-state {
        display: none;
        font-size: .68rem;
        font-weight: 800;
        letter-spacing: .03em;
    }
    
    @media (max-width: 767.98px) {
        .bulk-actions-wrapper {
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            margin-top: 10px;
        }
        
        .bulk-actions-wrapper > div.d-flex {
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: space-between !important;
            padding: 10px 14px !important;
            background-color: #f8f9fa !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 12px !important;
            gap: 8px !important;
        }

        .bulk-actions-wrapper > div.d-flex span {
            font-size: 0.75rem !important;
            font-weight: 700 !important;
            color: #475569 !important;
        }
        
        .bulk-actions-wrapper > div.d-flex input, 
        .bulk-actions-wrapper > div.d-flex select {
            border: 1px solid #cbd5e1 !important;
            border-radius: 6px !important;
            background-color: #ffffff !important;
            padding: 4px 8px !important;
            font-size: 0.8rem !important;
            height: 32px !important;
            flex-grow: 1 !important;
            max-width: none !important;
            width: auto !important;
        }

        .bulk-actions-wrapper > div.d-flex select {
            padding-right: 24px !important;
        }
        
        .bulk-actions-wrapper > div.d-flex input[type="number"] {
            max-width: 60px !important;
            flex-grow: 0 !important;
            text-align: center !important;
        }

        #bulk_trx_id {
            border: 1px solid #cbd5e1 !important;
            margin-left: 0 !important;
            min-width: 80px !important;
        }
        
        .bulk-actions-wrapper > div.d-flex .btn {
            padding: 6px 16px !important;
            font-size: 0.8rem !important;
            height: 32px !important;
            border-radius: 6px !important;
            font-weight: bold !important;
            line-height: 20px !important;
        }
        
        .bulk-actions-wrapper > div.d-flex:not(.bulk-move-group):not(.bulk-extend-group) .btn {
            width: 100% !important;
            margin-top: 4px !important;
        }

        .bulk-actions-wrapper > div.bulk-move-group,
        .bulk-actions-wrapper > div.bulk-extend-group {
            flex-wrap: nowrap !important;
        }

        .bulk-actions-wrapper > div.bulk-move-group .btn,
        .bulk-actions-wrapper > div.bulk-extend-group .btn {
            width: auto !important;
            margin-top: 0 !important;
            flex-shrink: 0 !important;
        }

        .bulk-actions-wrapper > div.bulk-extend-group .btn {
            background-color: #0dcaf0 !important;
            color: #ffffff !important;
            border: none !important;
        }
        
        .bulk-actions-buttons-row {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
            width: 100% !important;
        }
        
        .bulk-actions-buttons-row .btn {
            flex: 1 1 45% !important;
            padding: 8px 12px !important;
            font-size: 0.8rem !important;
            font-weight: bold !important;
            border-radius: 8px !important;
            height: 36px !important;
            display: inline-flex !important;
            justify-content: center !important;
            align-items: center !important;
            margin: 0 !important;
        }

        .bulk-actions-wrapper > div.d-flex .bulk-select-wrapper {
            width: auto !important;
            max-width: none !important;
            flex-grow: 1 !important;
        }

        /* Mobile-friendly due deduction control */
        .bulk-actions-wrapper > div.d-flex .bulk-due-toggle {
            order: 90;
            width: 100% !important;
            min-height: 50px;
            margin: 2px 0 0 !important;
            padding: 8px 10px !important;
            display: flex !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 10px !important;
            border: 1px solid #fecaca;
            border-radius: 10px;
            background: #fff7f7;
        }
        .bulk-actions-wrapper > div.d-flex .bulk-due-toggle .form-check-input {
            width: 2.45rem !important;
            min-width: 2.45rem !important;
            height: 1.35rem !important;
            flex: 0 0 2.45rem !important;
            padding: 0 !important;
            border-radius: 999px !important;
        }
        .bulk-due-toggle-copy {
            flex: 1 1 auto;
            min-width: 0;
        }
        .bulk-due-toggle-title {
            font-size: .82rem !important;
            color: #b42318;
            white-space: normal;
        }
        .bulk-due-toggle-help {
            display: block;
            margin-top: 3px;
            font-size: .68rem;
            font-weight: 500;
            color: #667085;
        }
        .bulk-due-toggle-state {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 38px;
            min-height: 24px;
            padding: 3px 7px;
            border-radius: 999px;
            background: #e5e7eb;
            color: #475467;
        }
        .bulk-due-toggle:has(#bulkDeductDue:checked) {
            border-color: #86efac;
            background: #f0fdf4;
        }
        .bulk-due-toggle:has(#bulkDeductDue:checked) .bulk-due-toggle-title { color: #15803d; }
        .bulk-due-toggle:has(#bulkDeductDue:checked) .bulk-due-toggle-state {
            background: #dcfce7;
            color: #15803d;
        }
        .bulk-due-toggle:has(#bulkDeductDue:disabled) {
            opacity: .6;
            cursor: not-allowed;
        }
    }
</style>
<script>
    let bulkDiscountConfirmed = false;
    const rechargeDiscountEnabled = <?= $recharge_discount_enabled ? 'true' : 'false' ?>;

    function submitBulkAction(actionName) {
        if (actionName === 'bulk_recharge' && rechargeDiscountEnabled && !bulkDiscountConfirmed) {
            const selected = Array.from(document.querySelectorAll('.client-check:checked'));
            if (selected.length === 0) { alert('Please select at least one client first.'); return; }
            openBulkDiscountModal(selected);
            return;
        }
        let confirmMsg = '';
        if (actionName === 'bulk_recharge') {
            const dueCheck = document.getElementById('bulkDeductDue');
            const dueUsers = Array.from(document.querySelectorAll('.client-check:checked')).filter(cb => (parseFloat(cb.dataset.due) || 0) > 0);
            confirmMsg = dueCheck && dueCheck.checked
                ? `Bulk recharge selected? Due will be deducted first for ${dueUsers.length} selected user(s) who currently have due.`
                : 'Bulk recharge selected without deducting existing due?';
        }
        if (actionName === 'bulk_extend') confirmMsg = 'Bulk extend selected?';
        if (actionName === 'bulk_move') confirmMsg = 'Move selected clients to the selected Reseller?';
        if (actionName === 'bulk_disable') confirmMsg = 'Disable selected clients? They will be moved to Inactive list.';
        if (actionName === 'bulk_enable') confirmMsg = 'Enable selected clients? They will be moved back to Active list.';
        if (actionName === 'bulk_left') confirmMsg = 'Mark selected clients as Left? This will also disable them on Mikrotik.';
        if (actionName === 'bulk_delete') confirmMsg = 'PERMANENTLY DELETE selected clients? This action CANNOT be undone and will remove all their data and billing history!';
        
        if (confirmMsg && !confirm(confirmMsg)) return;

        const checkedNodes = document.querySelectorAll('.client-check:checked');
        const ids = Array.from(checkedNodes).map(cb => cb.value);
        
        if (ids.length === 0) {
            alert("Please select at least one client first.");
            return;
        }

        // Use high-capacity Chunked AJAX Progress Engine for large selections or bulk recharge
        if (ids.length > 50 || actionName === 'bulk_recharge') {
            runChunkedBulkAction(actionName, ids);
        } else {
            // Standard form submit using JSON payload to avoid max_input_vars limit
            const form = document.getElementById('bulkActionForm');
            let jsonInput = document.getElementById('bulk_ids_json');
            if (!jsonInput) {
                jsonInput = document.createElement('input');
                jsonInput.type = 'hidden';
                jsonInput.name = 'bulk_ids_json';
                jsonInput.id = 'bulk_ids_json';
                form.appendChild(jsonInput);
            }
            jsonInput.value = JSON.stringify(ids);
            
            const hiddenAction = document.createElement('input');
            hiddenAction.type = 'hidden';
            hiddenAction.name = actionName;
            hiddenAction.value = '1';
            form.appendChild(hiddenAction);
            form.submit();
        }
    }

    function openBulkDiscountModal(selected) {
        const tbody = document.getElementById('bulkDiscountRows');
        if (!tbody) return;
        const days = Math.max(1, parseFloat(document.getElementById('bulkRechargeDays')?.value || '30'));
        tbody.innerHTML = '';
        selected.forEach(cb => {
            const gross = Math.max(0, (parseFloat(cb.dataset.bill) || 0) / 30 * days);
            const tr = document.createElement('tr');
            tr.dataset.clientId = cb.value;
            tr.dataset.gross = gross.toFixed(2);
            tr.innerHTML = `<td class="ps-3"><div class="fw-bold">${escapeHtml(cb.dataset.name || '')}</div><div class="small text-muted">${escapeHtml(cb.dataset.userId || '')}</div></td><td class="fw-bold">৳${gross.toFixed(2)}</td><td><input type="number" min="0" max="${gross.toFixed(2)}" step="0.01" value="0" class="form-control form-control-sm bulk-user-discount" data-id="${cb.value}" data-gross="${gross.toFixed(2)}"></td><td class="fw-bold text-success bulk-user-net">৳${gross.toFixed(2)}</td>`;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.bulk-user-discount').forEach(input => input.addEventListener('input', updateBulkDiscountTotals));
        updateBulkDiscountTotals();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('bulkDiscountModal')).show();
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value;
        return div.innerHTML;
    }

    function updateBulkDiscountTotals() {
        let discountTotal = 0, netTotal = 0;
        document.querySelectorAll('.bulk-user-discount').forEach(input => {
            const gross = parseFloat(input.dataset.gross) || 0;
            let discount = parseFloat(input.value) || 0;
            discount = Math.max(0, Math.min(gross, discount));
            if (parseFloat(input.value) !== discount) input.value = discount.toFixed(2);
            discountTotal += discount;
            netTotal += gross - discount;
            const row = input.closest('tr');
            if (row) row.querySelector('.bulk-user-net').textContent = '৳' + (gross - discount).toFixed(2);
        });
        const d = document.getElementById('bulkDiscountTotal');
        const n = document.getElementById('bulkDiscountNet');
        if (d) d.textContent = '৳' + discountTotal.toFixed(2);
        if (n) n.textContent = '৳' + netTotal.toFixed(2);
    }

    document.addEventListener('click', function(event) {
        const btn = event.target.closest('#applyBulkDiscountBtn');
        if (!btn) return;
        const form = document.getElementById('bulkActionForm');
        if (!form) return;
        form.querySelectorAll('input[data-bulk-discount-hidden="1"]').forEach(el => el.remove());
        document.querySelectorAll('.bulk-user-discount').forEach(input => {
            const gross = parseFloat(input.dataset.gross) || 0;
            const discount = Math.max(0, Math.min(gross, parseFloat(input.value) || 0));
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = `bulk_discount[${input.dataset.id}]`;
            hidden.value = discount.toFixed(2);
            hidden.dataset.bulkDiscountHidden = '1';
            hidden.dataset.clientId = input.dataset.id;
            form.appendChild(hidden);
        });
        bulkDiscountConfirmed = true;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('bulkDiscountModal')).hide();
        submitBulkAction('bulk_recharge');
        bulkDiscountConfirmed = false;
    });

    async function runChunkedBulkAction(actionName, allIds) {
        const chunkSize = 1000;
        const totalCount = allIds.length;
        let processedTotal = 0;
        let failedTotal = 0;
        let successTotal = 0;

        const modalEl = document.getElementById('bulkProgressModal');
        if (!modalEl) return;
        
        const titleEl = document.getElementById('bulkProgressModalTitle');
        const statusEl = document.getElementById('bulkProgressStatus');
        const percentEl = document.getElementById('bulkProgressPercent');
        const progressBar = document.getElementById('bulkProgressBar');
        const statTotal = document.getElementById('bulkStatTotal');
        const statSuccess = document.getElementById('bulkStatSuccess');
        const statFailed = document.getElementById('bulkStatFailed');
        const speedText = document.getElementById('bulkSpeedText');
        const closeBtn = document.getElementById('bulkProgressCloseBtn');

        if (titleEl) titleEl.innerHTML = '<i class="fas fa-sync fa-spin me-2"></i> Processing Bulk Action...';
        if (statusEl) statusEl.innerText = 'Processing...';
        if (percentEl) percentEl.innerText = '0%';
        if (progressBar) { progressBar.style.width = '0%'; progressBar.innerText = '0%'; }
        if (statTotal) statTotal.innerText = totalCount.toLocaleString();
        if (statSuccess) statSuccess.innerText = '0';
        if (statFailed) statFailed.innerText = '0';
        if (speedText) speedText.innerText = 'Speed: Calculating...';
        if (closeBtn) closeBtn.classList.add('d-none');

        let bsModal = null;
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
            bsModal.show();
        } else if (typeof $ !== 'undefined') {
            $(modalEl).modal('show');
        }

        const startTime = Date.now();
        const form = document.getElementById('bulkActionForm');
        const formDataBase = new FormData(form);
        formDataBase.delete('bulk_ids[]');
        formDataBase.append(actionName, '1');
        formDataBase.append('is_ajax', '1');

        for (let i = 0; i < totalCount; i += chunkSize) {
            const chunk = allIds.slice(i, i + chunkSize);
            const body = new FormData();
            for (let [k, v] of formDataBase.entries()) {
                // User-wise discount is appended only for users in this chunk to avoid max_input_vars on large bulk jobs.
                if (!k.startsWith('bulk_discount[')) body.append(k, v);
            }
            if (actionName === 'bulk_recharge' && rechargeDiscountEnabled) {
                chunk.forEach(id => {
                    const input = form.querySelector(`input[data-bulk-discount-hidden="1"][data-client-id="${id}"]`);
                    if (input) body.append(`bulk_discount[${id}]`, input.value);
                });
            }
            body.append('bulk_ids_json', JSON.stringify(chunk));

            try {
                const resp = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: body
                });
                const res = await resp.json();
                if (res && res.success) {
                    successTotal += (res.processed || 0);
                    failedTotal += (res.failed || 0);
                } else {
                    failedTotal += chunk.length;
                }
            } catch (err) {
                console.error("Chunk execution error:", err);
                failedTotal += chunk.length;
            }

            processedTotal += chunk.length;
            const percent = Math.min(100, Math.round((processedTotal / totalCount) * 100));
            
            if (percentEl) percentEl.innerText = percent + '%';
            if (progressBar) { progressBar.style.width = percent + '%'; progressBar.innerText = percent + '%'; }
            if (statSuccess) statSuccess.innerText = successTotal.toLocaleString();
            if (statFailed) statFailed.innerText = failedTotal.toLocaleString();
            
            const elapsedSec = (Date.now() - startTime) / 1000;
            const speed = Math.round(processedTotal / Math.max(0.1, elapsedSec));
            if (speedText) speedText.innerText = `Speed: ${speed.toLocaleString()} users/sec | Time: ${elapsedSec.toFixed(1)}s`;
        }

        const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        if (titleEl) titleEl.innerHTML = '<i class="fas fa-check-circle text-white me-2"></i> Operation Completed!';
        if (statusEl) statusEl.innerText = `Finished in ${totalElapsedSec} seconds!`;
        if (closeBtn) closeBtn.classList.remove('d-none');

        setTimeout(() => {
            window.location.reload();
        }, 1200);
    }
</script>
<?php
$status_filter = $_GET['tab'] ?? 'clients';
$managed_ids = getManagedStaffIds($pdo, $user, $role);

$query = "SELECT u.*, r.name as router_name, z.name as zone_name, s.name as owner_name,
          (SELECT IFNULL(p.custom_price, ms.buying_price) 
           FROM ".TBL_SERVICES." ms 
           LEFT JOIN ".TBL_PRICING." p ON p.service_id = ms.id AND p.staff_id = u.manager_id 
           WHERE ms.name = u.user_package 
           LIMIT 1) as cost_amount
          FROM ".TBL_USERS." u 
          LEFT JOIN ".TBL_ROUTERS." r ON u.router_id = r.id 
          LEFT JOIN ".TBL_ZONES." z ON u.zone_id = z.id 
          LEFT JOIN ".TBL_STAFF." s ON u.manager_id = s.id";
$params = [];

$selected_month = isset($_GET['f_month']) ? (int)$_GET['f_month'] : (int)date('m');
$selected_year = isset($_GET['f_year']) ? (int)$_GET['f_year'] : (int)date('Y');

if ($status_filter == 'due') {
    $query .= " WHERE (u.status = 'Expire' OR u.bill_position = 'Expire')";
    $display_title = "Expire";
} elseif ($status_filter == 'expire_today') {
    $query .= " WHERE u.current_bill_date = CURDATE() AND u.status != 'Left'";
    $display_title = "Expire Today";
} elseif ($status_filter == 'expire_in_2days') {
    $query .= " WHERE u.current_bill_date = DATE_ADD(CURDATE(), INTERVAL 2 DAY) AND u.status != 'Left'";
    $display_title = "Expire in 2 Days";
} elseif ($status_filter == 'expire_in_3days') {
    $query .= " WHERE u.current_bill_date = DATE_ADD(CURDATE(), INTERVAL 3 DAY) AND u.status != 'Left'";
    $display_title = "Expire in 3 Days";
} elseif ($status_filter == 'due_clients') {
    $query .= " WHERE u.status IN ('Active', 'Expire', 'Left') AND u.due > 0";
    $display_title = "Due";
} elseif ($status_filter == 'inactive') {
    $query .= " WHERE u.status = 'Inactive'";
    $display_title = "Inactive";
} elseif ($status_filter == 'left_list') {
    $query .= " WHERE u.status = 'Left'";
    $display_title = "Left";
} elseif ($status_filter == 'free_clients') {
    $query .= " WHERE u.status = 'Free'";
    $display_title = "Free";
} elseif ($status_filter == 'total_clients') {
    $query .= " WHERE u.status IN ('Active', 'Inactive', 'Free', 'Expire', 'Promise Active')";
    $display_title = "Total";
} elseif ($status_filter == 'promise_active') {
    $query .= " WHERE u.status = 'Promise Active'";
    $display_title = "Promise Active";
} elseif ($status_filter == 'new_clients') {
    $start_date = sprintf("%04d-%02d-01", $selected_year, $selected_month);
    $end_date = date("Y-m-t", strtotime($start_date));
    $query .= " WHERE u.joining_date >= ? AND u.joining_date <= ?";
    $params[] = $start_date;
    $params[] = $end_date;
    
    $month_name = date("F", strtotime($start_date));
    $display_title = "New (" . $month_name . " " . $selected_year . ")";
} else {
    // Default (including 'clients' tab) only shows Active per user request
    $query .= " WHERE u.status = 'Active'";
    $display_title = "Active";
}
// Note: 'Free' users can be added to the Active filter if required later.

if (hasRole('Admin') || (isOffice() && $managed_ids === 'ALL')) {
    if (isset($_GET['f_manager']) && !empty($_GET['f_manager'])) {
        $query .= " AND u.manager_id = ?";
        $params[] = $_GET['f_manager'];
    } elseif (!isset($_GET['f_manager'])) {
        // Default View for Staff: Show all if they have global access
        // No extra filter needed if they want to see all
    }
} else {
    // Reseller/Sub-Reseller or scoped Office Staff: Strictly only their accessible clients
    if (is_array($managed_ids)) {
        $placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
        $query .= " AND u.manager_id IN ($placeholders)";
        $params = array_merge($params, $managed_ids);
    } else {
        $query .= " AND u.manager_id = ?";
        $params[] = $user;
    }
}

// Search
if (!empty($_GET['search'])) {
    $s = "%".$_GET['search']."%";
    $query .= " AND (u.name LIKE ? OR u.user_id LIKE ? OR u.phone LIKE ? OR u.onu_mac LIKE ? OR u.client_code LIKE ?)";
    $params[] = $s; $params[] = $s; $params[] = $s; $params[] = $s; $params[] = $s;
}

// Apply Filters to Query
if (!empty($_GET['f_pkg'])) {
    $query .= " AND u.user_package = ?";
    $params[] = $_GET['f_pkg'];
}
if (!empty($_GET['f_zone'])) {
    $query .= " AND u.zone_id = ?";
    $params[] = $_GET['f_zone'];
}
if (!empty($_GET['f_manager'])) {
    $query .= " AND u.manager_id = ?";
    $params[] = $_GET['f_manager'];
}

// Special Handling for Online/Offline Filter
if (!empty($_GET['f_status'])) {
    $cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../../cache/global_online.json';
    $cache_raw = file_exists($cache_file) ? json_decode(file_get_contents($cache_file), true) : [];
    $online_data = isset($cache_raw['data']) ? $cache_raw['data'] : $cache_raw;
    $online_user_ids = array_keys($online_data);
    
    if ($_GET['f_status'] == 'online') {
        if (empty($online_user_ids)) {
             $query .= " AND 1=0"; // Force empty result if no one is online
        } else {
             $placeholders = implode(',', array_fill(0, count($online_user_ids), '?'));
             $query .= " AND u.user_id IN ($placeholders)";
             $params = array_merge($params, $online_user_ids);
        }
    } elseif ($_GET['f_status'] == 'offline') {
        if (!empty($online_user_ids)) {
             $placeholders = implode(',', array_fill(0, count($online_user_ids), '?'));
             $query .= " AND u.user_id NOT IN ($placeholders)";
             $params = array_merge($params, $online_user_ids);
        }
    }
}

// Special Handling for Remaining Days Filter
if (!empty($_GET['f_rem'])) {
    if ($_GET['f_rem'] == 'today') {
        $query .= " AND u.current_bill_date = CURDATE()";
    } elseif ($_GET['f_rem'] == 'expired') {
        $query .= " AND u.current_bill_date <= CURDATE()";
    } elseif ($_GET['f_rem'] == '1-3') {
        $query .= " AND u.current_bill_date > CURDATE() AND u.current_bill_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)";
    } elseif ($_GET['f_rem'] == '1-7') {
        $query .= " AND u.current_bill_date > CURDATE() AND u.current_bill_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)";
    } elseif ($_GET['f_rem'] == '1-15') {
        $query .= " AND u.current_bill_date > CURDATE() AND u.current_bill_date <= DATE_ADD(CURDATE(), INTERVAL 15 DAY)";
    } elseif ($_GET['f_rem'] == '1-30') {
        $query .= " AND u.current_bill_date > CURDATE() AND u.current_bill_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)";
    }
}

$query .= " ORDER BY u.id DESC";
$clients = safeFetchAll($pdo, $query, $params);
?>

<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
    <h4 class="mb-0 fw-bold"><i class="fas fa-users-cog me-2 text-primary"></i> <?= $display_title ?> Clients</h4>
    <div class="d-flex flex-column flex-sm-row gap-2">
        <form class="d-flex flex-wrap gap-2 flex-grow-1 flex-sm-grow-0" method="GET">
            <input type="hidden" name="tab" value="<?= $status_filter ?>">
            
            <?php if ($status_filter == 'new_clients'): ?>
                <select name="f_month" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 130px;">
                    <?php
                    for ($m = 1; $m <= 12; $m++) {
                        $sel = ($selected_month == $m) ? 'selected' : '';
                        $month_name = date("F", mktime(0, 0, 0, $m, 10));
                        echo "<option value='$m' $sel>$month_name</option>";
                    }
                    ?>
                </select>
                <select name="f_year" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 100px;">
                    <?php
                    $current_year = (int)date('Y');
                    for ($y = $current_year; $y >= $current_year - 5; $y--) {
                        $sel = ($selected_year == $y) ? 'selected' : '';
                        echo "<option value='$y' $sel>$y</option>";
                    }
                    ?>
                </select>
            <?php endif; ?>
            
            <!-- Filters -->
            <select name="f_pkg" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 130px;">
                <option value="">All Packages</option>
                <?php 
                $pkgs_query = "SELECT * FROM ".TBL_SERVICES;
                if (isset($_SESSION['allowed_packages']) && is_array($_SESSION['allowed_packages']) && !empty($_SESSION['allowed_packages'])) {
                    $allowed_ids = implode(',', array_map('intval', $_SESSION['allowed_packages']));
                    $pkgs_query .= " WHERE id IN ($allowed_ids)";
                }
                $pkgs = safeFetchAll($pdo, $pkgs_query);
                foreach($pkgs as $p) {
                    $sel = (isset($_GET['f_pkg']) && $_GET['f_pkg'] == $p['name']) ? 'selected' : '';
                    echo "<option value='{$p['name']}' $sel>{$p['name']}</option>";
                }
                ?>
            </select>
            
            <select name="f_zone" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 120px;">
                <option value="">All Zones</option>
                <?php 
                $owner_id = (isOffice() && isset($_SESSION['parent_id']) && $_SESSION['parent_id'] > 0) ? $_SESSION['parent_id'] : $user;
                $zns = safeFetchAll($pdo, "SELECT * FROM ".TBL_ZONES." WHERE staff_id=? ORDER BY name ASC", [$owner_id]);
                foreach($zns as $z) {
                    $sel = (isset($_GET['f_zone']) && $_GET['f_zone'] == $z['id']) ? 'selected' : '';
                    echo "<option value='{$z['id']}' $sel>{$z['name']}</option>";
                }
                ?>
            </select>
            
            <!-- Manager Filter (Admin/Office Staff Only) -->
            <?php if(hasRole('Admin') || isOffice()): ?>
            <select name="f_manager" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 130px;">
                <option value="">All Owners</option>
                <option value="<?= $_SESSION['admin_id'] ?>" <?= (isset($_GET['f_manager']) && $_GET['f_manager'] == $_SESSION['admin_id']) ? 'selected' : '' ?>>My Clients Only</option>
                <?php 
                $managers_sql = "SELECT id, name FROM ".TBL_STAFF." WHERE role IN ('Reseller', 'SubReseller', 'Agent')";
                if (is_array($managed_ids)) {
                    $m_placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
                    $managers_sql .= " AND id IN ($m_placeholders)";
                    $managers = safeFetchAll($pdo, $managers_sql, $managed_ids);
                } else {
                    $managers = safeFetchAll($pdo, $managers_sql);
                }
                foreach($managers as $m) {
                    $sel = (isset($_GET['f_manager']) && $_GET['f_manager'] == $m['id']) ? 'selected' : '';
                    echo "<option value='{$m['id']}' $sel>{$m['name']}</option>";
                }
                ?>
            </select>
            <?php endif; ?>

            <select name="f_status" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 110px;">
                <option value="">Any Status</option>
                <option value="online" <?= (isset($_GET['f_status']) && $_GET['f_status'] == 'online') ? 'selected' : '' ?>>Online Now</option>
                <option value="offline" <?= (isset($_GET['f_status']) && $_GET['f_status'] == 'offline') ? 'selected' : '' ?>>Offline Now</option>
            </select>

            <select name="f_rem" class="form-select form-select-sm border-primary submit-on-change" style="max-width: 120px;">
                <option value="">Rem. Days</option>
                <option value="today" <?= (isset($_GET['f_rem']) && $_GET['f_rem'] == 'today') ? 'selected' : '' ?>>Today</option>
                <option value="expired" <?= (isset($_GET['f_rem']) && $_GET['f_rem'] == 'expired') ? 'selected' : '' ?>>Expired</option>
                <option value="1-3" <?= (isset($_GET['f_rem']) && $_GET['f_rem'] == '1-3') ? 'selected' : '' ?>>1-3 Days</option>
                <option value="1-7" <?= (isset($_GET['f_rem']) && $_GET['f_rem'] == '1-7') ? 'selected' : '' ?>>1-7 Days</option>
                <option value="1-15" <?= (isset($_GET['f_rem']) && $_GET['f_rem'] == '1-15') ? 'selected' : '' ?>>1-15 Days</option>
                <option value="1-30" <?= (isset($_GET['f_rem']) && $_GET['f_rem'] == '1-30') ? 'selected' : '' ?>>1-30 Days</option>
            </select>
            
            <a href="?action=export_clients" class="text-decoration-none text-success fw-bold mx-2 small"><i class="fas fa-file-csv fa-lg me-1"></i>Export</a>
            <?php if(hasRole('Reseller') || isOffice()): ?>
            <a href="#" class="text-decoration-none text-primary fw-bold mx-2 small" data-bs-toggle="modal" data-bs-target="#importModal"><i class="fas fa-file-upload fa-lg me-1"></i>Import</a>
            <?php endif; ?>

            <div class="input-group input-group-sm">
                <input type="text" name="search" id="clientSearchInput" class="form-control border-primary" placeholder="Search..." value="<?= $_GET['search'] ?? '' ?>" autocomplete="off">
                <button type="submit" class="btn btn-primary" id="clientSearchBtn"><i class="fas fa-search"></i></button>
            </div>
        </form>
        

    </div>
</div>

<?php
$cache_file = function_exists('get_global_online_cache_path') ? get_global_online_cache_path() : __DIR__ . '/../../cache/global_online.json';
if (file_exists($cache_file)) {
    $cache_raw = json_decode(@file_get_contents($cache_file), true);
    if (is_array($cache_raw) && isset($cache_raw['metadata'])) {
        $updated_at = $cache_raw['metadata']['updated_at'] ?? null;
        if ($updated_at) {
            $age = time() - $updated_at;
            if ($age > 600) { // older than 10 minutes
                echo '<div class="alert alert-warning py-2 px-3 mb-3 small d-flex align-items-center"><i class="fas fa-exclamation-triangle me-2"></i><span>Live status cache is stale (updated ' . round($age / 60) . ' minutes ago). The background synchronization daemon might be stopped.</span></div>';
            }
        }
    }
}
?>

<?php if ($recharge_discount_enabled): ?>
<div class="modal fade" id="bulkDiscountModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content border-0 shadow">
            <div class="modal-header">
                <div>
                    <h5 class="modal-title fw-bold"><i class="fas fa-tags text-warning me-2"></i>User-wise Recharge Discount</h5>
                    <div class="small text-muted">Set discount separately for each selected user. Leave 0 for no discount.</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-0">
                <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0">
                        <thead class="table-light"><tr><th class="ps-3">User</th><th>Gross Recharge</th><th style="width:180px">Discount (৳)</th><th>Net Payable</th></tr></thead>
                        <tbody id="bulkDiscountRows"></tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer d-flex justify-content-between">
                <div class="small"><span class="text-muted">Total Discount:</span> <strong class="text-danger" id="bulkDiscountTotal">৳0.00</strong> &nbsp; <span class="text-muted">Net:</span> <strong class="text-success" id="bulkDiscountNet">৳0.00</strong></div>
                <div>
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="applyBulkDiscountBtn"><i class="fas fa-check me-1"></i>Apply & Recharge</button>
                </div>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<form method="POST" id="bulkActionForm">
    <div class="card shadow-sm">
        <div class="card-header bg-white py-3 border-bottom-0">
            <div class="d-flex flex-wrap align-items-center gap-2">
                <div class="form-check mb-0 me-3">
                    <input class="form-check-input border-secondary" type="checkbox" id="selectAll">
                    <label class="form-check-label fw-semibold small" for="selectAll">Select All</label>
                </div>

                <div class="col-12 col-md-auto text-danger fw-bold d-none align-items-center" id="selectedCountContainer" style="font-size: 0.8rem;">
                    <i class="fas fa-check-double me-1"></i> <span id="selectedCountText">0 selected</span>
                </div>

                <div class="bulk-actions-wrapper d-flex flex-wrap align-items-center gap-2 ms-md-auto">
                    <?php if(hasRole('Admin') || isOffice() || hasRole('Reseller')): ?>
                    <div class="d-flex align-items-center bg-light rounded-pill px-2 py-1 border shadow-sm border-warning bulk-move-group" style="font-size: 0.8rem;">
                        <span class="fw-bold text-muted me-1 ms-1 d-none d-sm-inline" style="font-size: 0.75rem;">Move:</span>
                        <div class="bulk-select-wrapper" style="width: 120px; max-width: 35vw;">
                            <select name="bulk_reseller_id" class="form-select select2-reseller border-0 bg-transparent fw-bold text-dark p-0" style="width: 100%; font-size: 0.8rem;">
                                <option value="">Select Reseller</option>
                                <?php 
                                $bulk_mgr_sql = "SELECT id, name FROM ".TBL_STAFF." WHERE role IN ('Admin', 'Reseller', 'SubReseller', 'Agent')";
                                if (is_array($managed_ids)) {
                                    $m_placeholders = implode(',', array_fill(0, count($managed_ids), '?'));
                                    $bulk_mgr_sql .= " AND id IN ($m_placeholders)";
                                    $all_resellers_bulk = safeFetchAll($pdo, $bulk_mgr_sql, $managed_ids);
                                } else {
                                    $all_resellers_bulk = safeFetchAll($pdo, $bulk_mgr_sql);
                                }
                                foreach($all_resellers_bulk as $m) {
                                    $label = $m['name'];
                                    if ($m['id'] == $_SESSION['admin_id']) {
                                        $label .= " (Me)";
                                    }
                                    echo "<option value='{$m['id']}'>{$label}</option>";
                                }
                                ?>
                            </select>
                        </div>
                        <div class="vr mx-2" style="height: 15px;"></div>
                        <button type="button" class="btn btn-warning rounded-pill px-2 py-0 fw-bold border-0 btn-sm bulk-action-btn" data-action="bulk_move" style="font-size: 0.75rem;">Move</button>
                    </div>
                    <?php endif; ?>

                    <?php if(hasRole('SubReseller')): ?>
                    <div class="d-flex align-items-center bg-light rounded-pill px-2 py-1 border shadow-sm" style="font-size: 0.8rem;">
                        <span class="fw-bold text-muted me-1 ms-1 d-none d-sm-inline" style="font-size: 0.75rem;">Bulk:</span>
                        <input type="number" id="bulkRechargeDays" name="bulk_recharge_days" class="form-control border-0 bg-transparent fw-bold text-primary p-0 m-0" style="width: 45px; font-size: 0.9rem; text-align: center;" value="30">
                        <div class="vr mx-2" style="height: 15px;"></div>
                        <select id="bulk_pay_method" name="pay_method" class="form-select border-0 bg-transparent fw-bold text-success p-0" style="width: 65px; font-size: 0.8rem;">
                            <option value="Cash">Cash</option>
                            <option value="Bank">Bank</option>
                            <option value="bKash">bKash</option>
                            <option value="Nagad">Nagad</option>
                            <option value="Rocket">Rocket</option>
                            <option value="Expire">Due</option>
                        </select>
                        <input type="text" name="trx_id" id="bulk_trx_id" class="form-control form-control-sm border-primary ms-2" placeholder="Trx" style="display:none; width: 60px; font-size: 0.75rem;">
                        <div id="bulkTotalArea" class="ms-1 d-none d-flex align-items-center">
                            <span id="bulkTotal" class="fw-bold text-danger me-1" style="font-size: 0.8rem;">৳0</span>
                        </div>
                        <label class="bulk-due-toggle ms-1 mb-0" for="bulkDeductDue" title="Deduct each selected user's existing due first, then use the remaining amount for recharge validity.">
                            <input class="form-check-input" type="checkbox" name="deduct_due_balance" value="1" id="bulkDeductDue">
                            <span class="bulk-due-toggle-copy">
                                <span class="bulk-due-toggle-title"><i class="fas fa-hand-holding-dollar me-1"></i>Deduct Due Balance</span>
                                <span class="bulk-due-toggle-help">Clear existing due first</span>
                            </span>
                            <span class="bulk-due-toggle-state" id="bulkDeductDueState">OFF</span>
                        </label>
                        <button type="button" class="btn btn-danger rounded-pill px-2 py-0 ms-1 btn-sm fw-bold bulk-action-btn" data-action="bulk_recharge" style="font-size: 0.75rem;">Recharge</button>
                    </div>

                    <div class="d-flex align-items-center bg-light rounded-pill px-2 py-1 border shadow-sm bulk-extend-group" style="font-size: 0.8rem;">
                        <span class="fw-bold text-muted me-1 ms-1 d-none d-sm-inline" style="font-size: 0.75rem;">Ext:</span>
                        <input type="number" name="bulk_days" class="form-control border-0 bg-transparent fw-bold text-info p-0 m-0" style="width: 35px; font-size: 0.9rem; text-align: center;" value="3" min="1" max="10">
                        <div class="vr mx-2" style="height: 15px;"></div>
                        <button type="button" class="btn btn-info text-white rounded-pill px-2 py-0 fw-bold border-0 btn-sm bulk-action-btn" data-action="bulk_extend" style="font-size: 0.75rem;">Extend</button>
                    </div>

                    <div class="bulk-actions-buttons-row">
                        <?php if ($status_filter === 'inactive'): ?>
                        <button type="button" class="btn btn-success rounded-pill px-3 py-1 fw-bold btn-sm shadow-sm bulk-action-btn" data-action="bulk_enable" style="font-size: 0.75rem;">
                            <i class="fas fa-user-check me-1"></i> Enable
                        </button>
                        <?php else: ?>
                        <button type="button" class="btn btn-secondary rounded-pill px-3 py-1 fw-bold btn-sm shadow-sm bulk-action-btn" data-action="bulk_disable" style="font-size: 0.75rem;">
                            <i class="fas fa-user-slash me-1"></i> Disable
                        </button>
                        <?php endif; ?>
                        
                        <?php if ($status_filter === 'left_list'): ?>
                            <?php if (hasRole('Admin') || isOffice() || hasRole('Reseller')): ?>
                            <button type="button" class="btn btn-danger rounded-pill px-3 py-1 fw-bold btn-sm shadow-sm bulk-action-btn" data-action="bulk_delete" style="font-size: 0.75rem;">
                                <i class="fas fa-trash-alt me-1"></i> Permanent Delete
                            </button>
                            <?php endif; ?>
                        <?php else: ?>
                            <button type="button" class="btn btn-outline-danger rounded-pill px-3 py-1 fw-bold btn-sm shadow-sm bg-white bulk-action-btn" data-action="bulk_left" style="font-size: 0.75rem;">
                                <i class="fas fa-user-times me-1"></i> Left
                            </button>
                        <?php endif; ?>

                        <button type="button" id="bulkSMSBtn" class="btn btn-dark rounded-pill px-3 py-1 fw-bold btn-sm shadow-sm" style="font-size: 0.75rem;">
                            <i class="fas fa-sms me-1"></i> SMS
                        </button>
                    </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <div class="card-body p-0">
            <!-- Top scrollbar mirror for premium UX -->
            <div class="table-responsive-top" style="display: none; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #cbd5e1 #f8f9fa;">
                <div class="table-responsive-top-force" style="height: 1px;"></div>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
                    <thead class="bg-light">
                        <tr>
                            <th width="30"></th>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Phone</th>
                            <th style="max-width: 150px;">Address</th>
                            <th>Zone</th>
                            <th>Package</th>
                            <th>Owner</th>
                            <th>Status</th>
                            <th>Online</th>
                            <th>Rem. Days</th>
                            <th class="text-end pe-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if(empty($clients)): ?>
                        <tr><td colspan="11" class="text-center py-5 text-muted">No clients found</td></tr>
                        <?php else: foreach($clients as $c): 
                            // Calculate Remaining Days
                            $today = new DateTime();
                            $expiry = new DateTime($c['current_bill_date'] . ' 23:59:59');
                            $diff = $today->diff($expiry);
                            $rem_days = $diff->invert ? -$diff->days : $diff->days;

                            if ($c['status'] == 'Free') {
                                $display_rem = 'Infinity';
                            } else {
                                if ($diff->invert) {
                                    $display_rem = $rem_days . " Days";
                                } else {
                                    if ($rem_days == 0) {
                                        $display_rem = $diff->h . "h " . $diff->i . "m";
                                    } else {
                                        $display_rem = $rem_days . " Days";
                                    }
                                }
                            }
                            
                            // Online Status
                            $is_online = in_array($c['user_id'], $GLOBAL_ONLINE_USERS);
                        ?>
                        <tr class="client-row" 
                            data-search-user="<?= htmlspecialchars(strtolower(trim($c['user_id'] ?? ''))) ?>"
                            data-search-code="<?= htmlspecialchars(strtolower(trim($c['client_code'] ?? ''))) ?>"
                            data-search-name="<?= htmlspecialchars(strtolower(trim($c['name'] ?? ''))) ?>"
                            data-search-phone="<?= htmlspecialchars(strtolower(trim($c['phone'] ?? ''))) ?>"
                            data-search-address="<?= htmlspecialchars(strtolower(trim($c['address'] ?? ''))) ?>">
                            <td class="ps-3"><input type="checkbox" name="bulk_ids[]" value="<?= $c['id'] ?>" class="client-check" data-cost="<?= $c['cost_amount'] ?? 0 ?>" data-due="<?= floatval($c['due'] ?? 0) ?>" data-user-id="<?= htmlspecialchars($c['user_id'], ENT_QUOTES) ?>" data-name="<?= htmlspecialchars($c['name'], ENT_QUOTES) ?>" data-bill="<?= floatval($c['bill_amount'] ?? 0) ?>"></td>
                            <td class="small text-muted">
                                <?= htmlspecialchars($c['user_id']) ?>
                                <?php if (!empty($c['client_code'])): ?>
                                    <div class="text-primary fw-bold" style="font-size: 0.75rem;">(<?= htmlspecialchars($c['client_code']) ?>)</div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <div class="d-flex align-items-center">
                                    <?php if (!empty($c['profile_pic'])): ?>
                                        <img src="/<?= htmlspecialchars(ltrim($c['profile_pic'], '/')) ?>" alt="User" class="rounded-circle me-3 object-fit-cover shadow-sm" style="width: 0.5in; height: 0.5in; min-width: 0.5in; min-height: 0.5in; border: 2px solid #e0e0e0; flex-shrink: 0;">
                                    <?php else: ?>
                                        <div class="rounded-circle me-3 bg-secondary d-flex align-items-center justify-content-center text-white shadow-sm" style="width: 0.5in; height: 0.5in; min-width: 0.5in; min-height: 0.5in; border: 2px solid #e0e0e0; font-size: 18px; flex-shrink: 0;">
                                            <i class="fas fa-user"></i>
                                        </div>
                                    <?php endif; ?>
                                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
                                        <div class="fw-bold"><a href="?view_id=<?= $c['id'] ?>" class="text-decoration-none"><?= $c['name'] ?></a></div>
                                        <?php if (!empty($c['due']) && $c['due'] > 0): ?>
                                            <span class="badge bg-danger rounded-pill px-2 py-1 mt-1" style="font-size: 0.65rem;">Due: ৳<?= number_format($c['due'], 0) ?></span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <?php $clean_phone = str_replace(["\r", "\n"], '', trim($c['phone'] ?? '')); ?>
                                <span class="font-monospace"><?= htmlspecialchars($clean_phone) ?></span>
                            </td>
                            <td>
                                <div class="address-cell">
                                    <?= htmlspecialchars($c['address'] ?? 'N/A') ?>
                                </div>
                            </td>
                            <td><span class="badge bg-light text-dark border"><?= $c['zone_name'] ?? 'Default' ?></span></td>
                            <td><?= $c['user_package'] ?></td>
                            <td class="small"><?= $c['owner_name'] ?? 'N/A' ?></td>
                            <td>
                                <span class="badge <?= ($c['status']=='Active')?'bg-success':(($c['status']=='Promise Active')?'text-white':(($c['status']=='Expire')?'bg-danger':'bg-secondary')) ?>" style="<?= ($c['status'] == 'Promise Active') ? 'background: linear-gradient(135deg, #fd7e14, #6f42c1); border: none;' : '' ?>">
                                    <?= $c['status'] ?>
                                </span>
                            </td>
                            <td>
                                <span class="badge bg-light text-muted border online-status-indicator" data-uid="<?= $c['user_id'] ?>">
                                    <i class="fas fa-spinner fa-spin me-1"></i> Check
                                </span>
                            </td>
                             <td class="fw-bold <?= ($c['status'] == 'Free') ? 'text-success' : (($rem_days <= 3) ? 'text-danger' : 'text-primary') ?>">
                                <?= $display_rem ?>
                            </td>
                            <td class="text-end pe-3">
                                <div class="dropdown">
                                    <button class="btn btn-light btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown"><i class="fas fa-cog"></i></button>
                                    <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                                        <li><a class="dropdown-item" href="?view_id=<?= $c['id'] ?>"><i class="fas fa-eye me-2"></i> View Profile</a></li>
                                        <li><a class="dropdown-item" href="?tab=edit_client&uid=<?= $c['id'] ?>"><i class="fas fa-edit me-2"></i> Edit Client</a></li>
                                        <li><a class="dropdown-item btn-ping-test" href="#" data-id="<?= $c['id'] ?>" data-name="<?= htmlspecialchars($c['name']) ?>"><i class="fas fa-terminal me-2 text-primary"></i> Ping Test</a></li>
                                        
                                        <?php if ($c['bill_position'] == 'Expire'): ?>
                                            <li><hr class="dropdown-divider"></li>
                                             <?php if ($c['status'] == 'Expire'): ?>
                                                <li><a class="dropdown-item text-success" href="?action=toggle_status&id=<?= $c['id'] ?>&status=Active"><i class="fas fa-play-circle me-2"></i> Enable Service (Make Active)</a></li>
                                             <?php else: ?>
                                                <li><a class="dropdown-item text-danger" href="?action=toggle_status&id=<?= $c['id'] ?>&status=Expire"><i class="fas fa-pause-circle me-2"></i> Disable Service (Make Expire)</a></li>
                                             <?php endif; ?>
                                        <?php elseif ($c['status'] == 'Inactive'): ?>
                                            <li><hr class="dropdown-divider"></li>
                                            <li><a class="dropdown-item text-success" href="?action=toggle_status&id=<?= $c['id'] ?>&status=Active"><i class="fas fa-play-circle me-2"></i> Enable Client</a></li>
                                        <?php endif; ?>

                                        <li><hr class="dropdown-divider"></li>
                                        <?php if ($c['status'] == 'Left'): ?>
                                            <li><a class="dropdown-item text-danger fw-bold btn-delete-client" href="?action=delete_client&id=<?= $c['id'] ?>"><i class="fas fa-trash-alt me-2 text-danger"></i> Permanent Delete</a></li>
                                        <?php else: ?>
                                            <li><a class="dropdown-item text-danger btn-make-left" href="#" data-id="<?= $c['id'] ?>" data-name="<?= htmlspecialchars($c['name']) ?>"><i class="fas fa-user-slash me-2 text-danger"></i> Make Left</a></li>
                                        <?php endif; ?>
                                        <?php if(hasRole('Admin') || isOffice() || hasRole('Reseller')): ?>
                                        <li><hr class="dropdown-divider"></li>
                                        <li><a class="dropdown-item text-warning btn-move-client" href="#" data-id="<?= $c['id'] ?>" data-name="<?= htmlspecialchars($c['name']) ?>" data-manager-id="<?= intval($c['manager_id']) ?>"><i class="fas fa-exchange-alt me-2 text-warning"></i> Move Client</a></li>
                                        <?php endif; ?>
                                    </ul>
                                </div>
                            </td>
                        </tr>
                        <?php endforeach; endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</form>

<script>


    function toggleBulkTrx(sel) {
        const input = document.getElementById('bulk_trx_id');
        const methodsRequiringTrx = ['Bank', 'bKash', 'Nagad', 'Rocket'];
        if (methodsRequiringTrx.includes(sel.value)) {
            input.style.display = 'inline-block';
            input.setAttribute('required', 'required');
            input.placeholder = "Trx";
        } else if (sel.value === 'Cash') {
            input.style.display = 'inline-block';
            input.removeAttribute('required');
            input.placeholder = "Memo";
        } else {
            input.style.display = 'none';
            input.removeAttribute('required');
        }
    }

    function openLeftModal(id, name) {
        document.getElementById('leftClientId').value = id;
        document.getElementById('leftClientName').innerText = name;
        const el = document.getElementById('leftModal');
        bootstrap.Modal.getOrCreateInstance(el).show();
    }
    
    function openMoveModal(id, name, currentOwnerId) {
        document.getElementById('moveClientId').value = id;
        document.getElementById('moveClientName').innerText = name;
        const el = document.getElementById('moveModal');
        bootstrap.Modal.getOrCreateInstance(el).show();
    }

    function openBulkSMSModal() {
        const checked = document.querySelectorAll('.client-check:checked');
        if (checked.length === 0) {
            alert("Please select at least one client first.");
            return;
        }
        document.getElementById('smsUserCount').innerText = checked.length;
        const modalEl = document.getElementById('bulkSMSModal');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    }

    function updateSelectedCount() {
        const count = document.querySelectorAll('.client-check:checked').length;
        const container = document.getElementById('selectedCountContainer');
        const text = document.getElementById('selectedCountText');
        if (container && text) {
            if (count > 0) {
                text.textContent = count + ' user' + (count > 1 ? 's' : '') + ' selected';
                container.classList.remove('d-none');
                container.classList.add('d-flex');
            } else {
                container.classList.add('d-none');
                container.classList.remove('d-flex');
            }
        }
    }

    function calculateBulkTotal() {
        var daysInput = document.getElementById('bulkRechargeDays');
        var totalArea = document.getElementById('bulkTotalArea');
        var totalText = document.getElementById('bulkTotal');
        var checkboxes = document.querySelectorAll('.client-check');
        if (!daysInput || !totalArea || !totalText) return;
        var total = 0, count = 0, days = parseFloat(daysInput.value) || 0;
        checkboxes.forEach(function(cb) {
            if (cb.checked) {
                total += (parseFloat(cb.getAttribute('data-cost')) || 0) / 30 * days;
                count++;
            }
        });
        if (count > 0) {
            totalArea.style.display = 'flex';
            totalArea.classList.remove('d-none');
            totalText.innerText = '৳' + Math.round(total).toLocaleString();
        } else {
            totalArea.style.display = 'none';
            totalArea.classList.add('d-none');
        }
    }

    let currentPingId = null;
    function runPing(id, name) {
        currentPingId = id;
        const titleEl = document.getElementById('pingTitle');
        const ipEl = document.getElementById('pingIp');
        const resultEl = document.getElementById('pingResult');
        if (titleEl) titleEl.innerText = name;
        if (ipEl) ipEl.innerText = 'Target: ...';
        if (resultEl) resultEl.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Pinging MikroTik...</div></div>';
        const pingEl = document.getElementById('pingModal');
        if (pingEl) bootstrap.Modal.getOrCreateInstance(pingEl).show();
        executePing();
    }

    function executePing() {
        if(!currentPingId) return;
        fetch(window.location.pathname + '?ajax_ping=1&id=' + currentPingId)
            .then(r => r.json())
            .then(data => {
                if(data.success) {
                    document.getElementById('pingIp').innerText = "Target IP: " + data.ip;
                    document.getElementById('pingResult').innerHTML = data.html;
                } else {
                    document.getElementById('pingResult').innerHTML = '<div class="alert alert-danger small m-2">' + (data.error || 'Unknown error') + '</div>';
                }
            })
            .catch(err => {
                document.getElementById('pingResult').innerHTML = '<div class="alert alert-danger small m-2">Request Failed: ' + err + '</div>';
            });
    }

    document.addEventListener('DOMContentLoaded', function() {
        // Submit form on filter change (for CSP compatibility)
        document.querySelectorAll('.submit-on-change').forEach(el => {
            el.addEventListener('change', function() {
                this.form.submit();
            });
        });



        // Ping Test listener
        document.querySelectorAll('.btn-ping-test').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const id = this.getAttribute('data-id');
                const name = this.getAttribute('data-name');
                runPing(id, name);
            });
        });

        // Delete Client listener (Permanent Delete)
        document.querySelectorAll('.btn-delete-client').forEach(btn => {
            btn.addEventListener('click', function(e) {
                if (!confirm('Are you sure you want to permanently delete this client? This cannot be undone.')) {
                    e.preventDefault();
                }
            });
        });

        // Make Left listener
        document.querySelectorAll('.btn-make-left').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const id = this.getAttribute('data-id');
                const name = this.getAttribute('data-name');
                openLeftModal(id, name);
            });
        });

        // Move Client listener
        document.querySelectorAll('.btn-move-client').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const id = this.getAttribute('data-id');
                const name = this.getAttribute('data-name');
                const managerId = this.getAttribute('data-manager-id');
                openMoveModal(id, name, managerId);
            });
        });

        const indicators = document.querySelectorAll('.online-status-indicator');
        const uids = Array.from(indicators).map(el => el.getAttribute('data-uid')).filter(v => v);
        if (uids.length > 0) {
            // Split UIDs into chunks of 300 to avoid sending huge URLs and causing timeouts
            const chunkSize = 300;
            for (let i = 0; i < uids.length; i += chunkSize) {
                const chunk = uids.slice(i, i + chunkSize);
                fetch('?ajax_status=1&uids=' + encodeURIComponent(chunk.join(',')))
                    .then(r => r.json())
                    .then(data => {
                        indicators.forEach(el => {
                            const uid = el.getAttribute('data-uid');
                            if (chunk.includes(uid)) {
                                const isOnline = Array.isArray(data) ? data.includes(uid) : !!data[uid];
                                if (isOnline) {
                                    el.classList.remove('bg-danger', 'bg-light', 'text-muted');
                                    el.classList.add('bg-success', 'text-white');
                                    el.textContent = 'Online';
                                } else {
                                    el.classList.remove('bg-success', 'bg-light', 'text-muted');
                                    el.classList.add('bg-danger', 'text-white');
                                    el.textContent = 'Offline';
                                }
                            }
                        });
                    })
                    .catch(err => console.error("Chunk Status Check Error:", err));
            }
        }
        document.getElementById('selectAll')?.addEventListener('change', function() {
            document.querySelectorAll('.client-check').forEach(cb => cb.checked = this.checked);
            updateSelectedCount();
            calculateBulkTotal();
        });
        document.querySelectorAll('.client-check').forEach(cb => cb.addEventListener('change', () => { updateSelectedCount(); calculateBulkTotal(); }));
        document.getElementById('bulkRechargeDays')?.addEventListener('input', calculateBulkTotal);
        const bulkPayMethod = document.getElementById('bulk_pay_method');
        const bulkDeductDue = document.getElementById('bulkDeductDue');
        if (bulkPayMethod && bulkDeductDue) {
            const bulkDeductDueState = document.getElementById('bulkDeductDueState');
            const refreshBulkDueState = function() {
                if (!bulkDeductDueState) return;
                if (bulkDeductDue.disabled) {
                    bulkDeductDueState.textContent = 'N/A';
                } else {
                    bulkDeductDueState.textContent = bulkDeductDue.checked ? 'ON' : 'OFF';
                }
            };
            const syncBulkDueOption = function() {
                const isDueMethod = bulkPayMethod.value === 'Expire';
                bulkDeductDue.disabled = isDueMethod;
                if (isDueMethod) bulkDeductDue.checked = false;
                refreshBulkDueState();
            };
            bulkPayMethod.addEventListener('change', syncBulkDueOption);
            bulkDeductDue.addEventListener('change', refreshBulkDueState);
            syncBulkDueOption();
        }
        document.getElementById('rePingBtn')?.addEventListener('click', executePing);
        calculateBulkTotal();

        // Register bulk payment method and actions listeners for CSP compatibility
        const bulkPayMethodSelect = document.getElementById('bulk_pay_method');
        if (bulkPayMethodSelect) {
            bulkPayMethodSelect.addEventListener('change', function() {
                toggleBulkTrx(this);
            });
            // Set initial state on load
            toggleBulkTrx(bulkPayMethodSelect);
        }

        document.querySelectorAll('.bulk-action-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const action = this.getAttribute('data-action');
                submitBulkAction(action);
            });
        });

        const bulkSMSBtn = document.getElementById('bulkSMSBtn');
        if (bulkSMSBtn) {
            bulkSMSBtn.addEventListener('click', openBulkSMSModal);
        }

        // Top Horizontal Scrollbar Sync
        const table = document.querySelector('.table-responsive table');
        const topScrollForce = document.querySelector('.table-responsive-top-force');
        const topScroll = document.querySelector('.table-responsive-top');
        const bottomScroll = document.querySelector('.table-responsive');

        if (table && topScrollForce && topScroll && bottomScroll) {
            const updateWidth = () => {
                const tableWidth = table.offsetWidth;
                const containerWidth = bottomScroll.offsetWidth;
                if (tableWidth > containerWidth) {
                    topScroll.style.display = 'block';
                    topScrollForce.style.width = tableWidth + 'px';
                    bottomScroll.closest('.card-body')?.classList.add('has-top-scroll');
                } else {
                    topScroll.style.display = 'none';
                    bottomScroll.closest('.card-body')?.classList.remove('has-top-scroll');
                }
            };
            
            let isSyncingTop = false;
            let isSyncingBottom = false;
            
            topScroll.addEventListener('scroll', () => {
                if (!isSyncingTop) {
                    isSyncingBottom = true;
                    bottomScroll.scrollLeft = topScroll.scrollLeft;
                }
                isSyncingTop = false;
            });
            
            bottomScroll.addEventListener('scroll', () => {
                if (!isSyncingBottom) {
                    isSyncingTop = true;
                    topScroll.scrollLeft = bottomScroll.scrollLeft;
                }
                isSyncingBottom = false;
            });
            
            updateWidth();
            window.addEventListener('resize', updateWidth);
            
            if (typeof ResizeObserver !== 'undefined') {
                const observer = new ResizeObserver(updateWidth);
                observer.observe(table);
            }
        }

        // Search Box Auto-Filtering
        const searchInput = document.getElementById('clientSearchInput');
        if (searchInput) {
            // Prevent search form reload on enter
            const searchForm = searchInput.closest('form');
            if (searchForm) {
                searchForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                });
            }

            searchInput.addEventListener('input', function() {
                const query = this.value.trim().toLowerCase();
                const rows = document.querySelectorAll('.client-row');
                
                rows.forEach(row => {
                    const user = row.getAttribute('data-search-user') || '';
                    const code = row.getAttribute('data-search-code') || '';
                    const name = row.getAttribute('data-search-name') || '';
                    const phone = row.getAttribute('data-search-phone') || '';
                    const address = row.getAttribute('data-search-address') || '';
                    
                    if (user.includes(query) || code.includes(query) || name.includes(query) || phone.includes(query) || address.includes(query)) {
                        row.style.setProperty('display', '', 'important');
                    } else {
                        row.style.setProperty('display', 'none', 'important');
                    }
                });
            });
        }
    });
</script>

<div class="modal fade" id="importModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Import Clients</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form method="POST" enctype="multipart/form-data">
                <div class="modal-body">
                    <div class="alert alert-info py-2 small">
                        <i class="fas fa-info-circle me-2"></i> 
                        <strong>Instructions:</strong> Please download the CSV template, fill in your client data, and then upload it here.
                        <br>
                        <a href="?action=download_csv_template" class="btn btn-sm btn-outline-primary mt-2">
                            <i class="fas fa-file-download me-1"></i> Download CSV Template
                        </a>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Select File (CSV)</label>
                        <input type="file" name="csv_file" class="form-control" accept=".csv" required>
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" name="sync_mikrotik" class="form-check-input" id="syncMkCheck">
                        <label class="form-check-label small" for="syncMkCheck">Sync with MikroTik?</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="submit" name="import_clients" class="btn btn-primary">Import Data</button>
                </div>
            </form>
        </div>
    </div>
</div>

<div class="modal fade" id="leftModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" action="<?= htmlspecialchars('?tab=' . ($_GET['tab'] ?? 'clients')) ?>" class="modal-content">
            <div class="modal-header bg-danger text-white"><h5 class="modal-title">Confirm Termination</h5></div>
            <div class="modal-body">
                <input type="hidden" name="id" id="leftClientId">
                <input type="hidden" name="make_left_confirm" value="1">
                <p>Mark <strong id="leftClientName"></strong> as Left?</p>
                <div class="mb-3">
                    <label class="form-label">Refund Method:</label>
                    <select name="refund_method" class="form-select" required>
                        <option value="Wallet">Wallet (Reseller Wallet)</option>
                        <option value="Cash">Cash (Physical Refund)</option>
                        <option value="None">No Refund</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-danger"><i class="fas fa-user-slash me-1"></i> Confirm Left</button>
            </div>
        </form>
    </div>
</div>

<div class="modal fade" id="moveModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="POST" action="<?= htmlspecialchars('?tab=' . ($_GET['tab'] ?? 'clients')) ?>" class="modal-content">
            <div class="modal-header bg-warning text-dark"><h5 class="modal-title"><i class="fas fa-exchange-alt me-2"></i>Move Client</h5></div>
            <div class="modal-body">
                <input type="hidden" name="id" id="moveClientId">
                <input type="hidden" name="move_client_confirm" value="1">
                <p>Move <strong id="moveClientName"></strong> to:</p>
                <div class="mb-3">
                    <select name="new_reseller_id" class="form-select" required>
                        <option value="">-- Select Reseller --</option>
                         <?php 
                        $move_mgr_sql = "SELECT id, name FROM ".TBL_STAFF." WHERE role IN ('Admin', 'Reseller', 'SubReseller', 'Agent')";
                        $all_resellers = (isset($managed_ids) && is_array($managed_ids)) ? safeFetchAll($pdo, $move_mgr_sql . " AND id IN (" . implode(',', array_fill(0, count($managed_ids), '?')) . ")", $managed_ids) : safeFetchAll($pdo, $move_mgr_sql);
                        foreach($all_resellers as $m) {
                            $label = $m['name'];
                            if ($m['id'] == $_SESSION['admin_id']) $label .= " (Me)";
                            echo "<option value='{$m['id']}'>{$label}</option>";
                        }
                         ?>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-warning"><i class="fas fa-exchange-alt me-1"></i> Confirm Move</button>
            </div>
        </form>
    </div>
</div>

<div class="modal fade" id="pingModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content border-0 shadow-lg">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title">Ping: <span id="pingTitle"></span></h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div class="p-3 border-bottom bg-light d-flex justify-content-between align-items-center">
                    <div id="pingIp" class="badge bg-white text-dark border px-3 py-2"></div>
                </div>
                <div id="pingResult" class="p-3" style="min-height: 200px; background: #fdfdfd;"></div>
            </div>
            <div class="modal-footer bg-light border-0">
                <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary btn-sm px-3" id="rePingBtn">Retest</button>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="bulkSMSModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content text-start shadow-lg">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title"><i class="fas fa-sms me-2"></i> Bulk SMS</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="alert alert-info py-2 small">Sending to <span id="smsUserCount" class="fw-bold">0</span> users.</div>
                <div class="mb-3">
                    <label class="form-label fw-bold small">Template</label>
                    <select class="form-select form-select-sm mb-2" onchange="document.getElementById('bulkSMSMessage').value = this.value">
                        <option value="">Select Template...</option>
                        <option value="Dear [NAME], your internet account [ID] will expire on [DATE]. Please recharge.">Expiry Reminder</option>
                        <option value="Dear [NAME], we are facing a backbone fiber issue in your area. Team is working on it.">Maintenance</option>
                    </select>
                </div>
                <div class="mb-3">
                    <textarea name="bulk_sms_message" form="bulkActionForm" id="bulkSMSMessage" class="form-control" rows="5" placeholder="Message..." required></textarea>
                    <div class="form-text small">Use [NAME], [ID], [DATE]</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" name="bulk_send_sms" form="bulkActionForm" class="btn btn-dark shadow-sm">Send SMS Now</button>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="bulkProgressModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content shadow-lg border-0">
            <div class="modal-header bg-primary text-white py-3">
                <h5 class="modal-title fw-bold fs-6 mb-0" id="bulkProgressModalTitle">
                    <i class="fas fa-sync fa-spin me-2"></i> Processing Bulk Action...
                </h5>
            </div>
            <div class="modal-body p-4">
                <div class="mb-3 d-flex justify-content-between align-items-center">
                    <span id="bulkProgressStatus" class="fw-bold text-dark small">Starting operation...</span>
                    <span id="bulkProgressPercent" class="badge bg-primary fs-6">0%</span>
                </div>
                <div class="progress mb-3" style="height: 22px; border-radius: 11px; background-color: #e9ecef;">
                    <div id="bulkProgressBar" class="progress-bar progress-bar-striped progress-bar-animated bg-success" role="progressbar" style="width: 0%; font-weight: bold;">0%</div>
                </div>
                <div class="row text-center mt-3 g-2">
                    <div class="col-4">
                        <div class="p-2 border rounded bg-light">
                            <div class="text-muted small">Total</div>
                            <div id="bulkStatTotal" class="fw-bold text-dark fs-6">0</div>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="p-2 border rounded bg-light">
                            <div class="text-success small">Success</div>
                            <div id="bulkStatSuccess" class="fw-bold text-success fs-6">0</div>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="p-2 border rounded bg-light">
                            <div class="text-danger small">Failed</div>
                            <div id="bulkStatFailed" class="fw-bold text-danger fs-6">0</div>
                        </div>
                    </div>
                </div>
                <div id="bulkSpeedText" class="text-center text-muted small mt-3">
                    <i class="fas fa-tachometer-alt me-1"></i> Speed: Calculating...
                </div>
            </div>
            <div class="modal-footer bg-light border-0 py-2">
                <button type="button" id="bulkProgressCloseBtn" class="btn btn-secondary btn-sm px-4 d-none" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>
<?php require_once __DIR__ . '/../layout/footer.php'; ?>




