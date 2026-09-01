/**
 * pop-branch-management.js
 * CSP-safe POP/Branch management module — v20260616v2
 * Searchable checkbox package selector + all modal wiring.
 */

'use strict';

// ── Modal instance cache ──────────────────────────────────────────────────────
let agentModal   = null;
let fundModal    = null;
let collectModal = null;
let ratesModal   = null;

function getModal(id) {
    const el = document.getElementById(id);
    if (!el) { console.error('[pop-branch] Modal not found: #' + id); return null; }
    return new bootstrap.Modal(el);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE CHECKBOX PANEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Return all .pkg-check-item elements (optionally filtered by router).
 * routerFilter: "0" = show all, else show only matching + global (router_id=0)
 */
function getPkgItems(routerFilter) {
    routerFilter = routerFilter || '0';
    return Array.from(document.querySelectorAll('.pkg-check-item')).filter(el => {
        if (routerFilter === '0') return true;
        const r = el.getAttribute('data-router') || '0';
        return r === '0' || r === routerFilter;
    });
}

/** Update the selected-count badge */
function updatePkgCount() {
    const total   = document.querySelectorAll('.pkg-checkbox:checked').length;
    const badge   = document.getElementById('pkgSelectedCount');
    if (!badge) return;
    badge.textContent = total > 0 ? total + ' selected' : '';
    badge.style.display = total > 0 ? '' : 'none';
}

/** Filter visible package rows by search text AND current router */
function filterPkgList() {
    const search      = (document.getElementById('pkgSearchInput')?.value || '').toLowerCase().trim();
    const routerVal   = document.getElementById('s_router')?.value || '0';
    const allItems    = Array.from(document.querySelectorAll('.pkg-check-item'));
    let   visible     = 0;

    allItems.forEach(el => {
        const name    = el.getAttribute('data-name') || '';
        const router  = el.getAttribute('data-router') || '0';
        const matchRouter = routerVal === '0' || router === '0' || router === routerVal;
        const matchSearch = !search || name.includes(search);
        const show    = matchRouter && matchSearch;
        el.style.display = show ? '' : 'none';
        if (show) visible++;
    });

    const noResult = document.getElementById('pkgNoResult');
    if (noResult) noResult.classList.toggle('d-none', visible > 0);
    updatePkgCount();
}

/** Set checkbox states for a given id list; uncheck all others */
function setPkgSelection(allowedIds) {
    document.querySelectorAll('.pkg-checkbox').forEach(cb => {
        cb.checked = allowedIds && allowedIds.includes(cb.value);
    });
    updatePkgCount();
}

/** Return array of currently checked package IDs */
function getCheckedPkgIds() {
    return Array.from(document.querySelectorAll('.pkg-checkbox:checked')).map(cb => cb.value);
}

// ── Commission type toggle ────────────────────────────────────────────────────
function toggleCommType() {
    const isFixed = document.getElementById('type_fixed')?.checked;
    document.getElementById('fixed_comm_div')?.classList.toggle('d-none', !isFixed);
    document.getElementById('package_comm_alert')?.classList.toggle('d-none', !!isFixed);
}

// ── SMS fields toggle ─────────────────────────────────────────────────────────
function toggleSMSFields() {
    const row = document.getElementById('sms_fields_row');
    const isChecked = document.getElementById('s_can_use_global_sms')?.checked;
    if (row) row.style.display = isChecked ? 'flex' : 'none';
}

// ── Lock modal helpers ────────────────────────────────────────────────────────
function updateLockHelp() {
    const val  = document.getElementById('lockTypeSelect')?.value;
    const help = document.getElementById('lockHelpText');
    if (!help) return;
    if (val === 'None')  help.innerHTML = '<span class="text-success"><i class="fas fa-check-circle"></i> Service and Panel access will be fully restored.</span>';
    else if (val === 'Panel') help.innerHTML = '<span class="text-warning"><i class="fas fa-info-circle"></i> POP/Branch cannot login, but existing clients continue service.</span>';
    else if (val === 'Full')  help.innerHTML = '<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle"></i> DANGER: POP/Branch locked AND all active clients will be disconnected immediately!</span>';
}

function openLockModal(id, name, currentStatus, currentNote) {
    const help = document.getElementById('lockHelpText');
    const select = document.getElementById('lockTypeSelect');
    const updateLockHelp = () => {
        if (!help || !select) return;
        if (select.value === 'Full') {
            help.innerHTML = '<strong>Full Lock:</strong> panel access will be blocked and all managed PPPoE secrets (including child staff users) will be disabled in MikroTik. On unlock, only users that were Active before this lock are restored.';
            help.className = 'form-text mt-2 text-danger';
        } else if (select.value === 'Panel') {
            help.textContent = 'Panel login will be blocked. MikroTik client secrets will not be changed.';
            help.className = 'form-text mt-2 text-warning';
        } else {
            help.textContent = 'Unlock panel and restore only Active clients that were disabled by Full Lock.';
            help.className = 'form-text mt-2 text-success';
        }
    };
    if (select && !select.dataset.lockHelpBound) {
        select.addEventListener('change', updateLockHelp);
        select.dataset.lockHelpBound = '1';
    }

    const setVal = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v; };
    setVal('lockTargetId',   id);
    setVal('lockTargetName', name);
    setVal('lockTypeSelect', currentStatus);
    setVal('lockNote',       currentNote);
    const modal = getModal('lockStaffModal');
    if (modal) { modal.show(); updateLockHelp(); }
}

// ── Profit calculator ─────────────────────────────────────────────────────────
function updateProfit(input) {
    const tr   = input.closest('tr');
    const cost = parseFloat(input.getAttribute('data-cost'));
    const price = parseFloat(input.value) || 0;
    const agentCommInput = tr.querySelector('.agent-rate-input');
    const agentComm = parseFloat(agentCommInput?.value) || 0;
    const profit = price - (cost + agentComm);
    const cell = tr.querySelector('.profit-cell');
    if (cell) {
        cell.innerText = '৳' + profit.toFixed(2);
        cell.className = 'profit-cell fw-bold ' + (profit >= 0 ? 'text-success' : 'text-danger');
    }
}

// ── Add POP modal ─────────────────────────────────────────────────────────────
function addAgent() {
    console.log('[pop-branch] Create New POP/Branch clicked');
    document.getElementById('agentModalTitle').innerText = 'Create New POP/Branch';
    document.getElementById('s_submit').name = 'create_staff';

    const clearFields = ['s_id','s_name','s_username','s_phone','s_nid','s_address','s_sms_balance'];
    clearFields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('s_agent_id', '0');
    setVal('s_advance_balance_limit', '0');
    setVal('s_supervisor', '0');
    setVal('s_sms_rate', '0.50');

    const undoEl = document.getElementById('s_can_undo_recharge');
    if (undoEl) undoEl.checked = false;
    const smsEl = document.getElementById('s_can_use_global_sms');
    if (smsEl) smsEl.checked = false;

    const typeFixed = document.getElementById('type_fixed');
    if (typeFixed) typeFixed.checked = true;
    toggleCommType();
    toggleSMSFields();

    const supervisorRow = document.getElementById('supervisor_row');
    if (supervisorRow) supervisorRow.style.display = 'flex';

    // Clear all package checkboxes
    setPkgSelection([]);
    if (document.getElementById('pkgSearchInput')) {
        document.getElementById('pkgSearchInput').value = '';
    }
    filterPkgList();

    if (!agentModal) agentModal = getModal('agentModal');
    if (agentModal) agentModal.show();
}

// ── Edit POP modal ────────────────────────────────────────────────────────────
function editAgent(data) {
    console.log('[pop-branch] Edit POP/Branch clicked:', data.name);
    document.getElementById('agentModalTitle').innerText = 'Edit POP/Branch: ' + data.name;
    document.getElementById('s_submit').name = 'edit_staff';

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    setVal('s_id',                  data.id);
    setVal('s_name',                data.name);
    setVal('s_username',            data.username);
    setVal('s_role',                data.role);
    setVal('s_router',              data.router_id);
    setVal('s_agent_id',            data.agent_id || 0);
    setVal('s_agent_commission',    data.agent_commission);
    setVal('s_phone',               data.phone || '');
    setVal('s_nid',                 data.nid || '');
    setVal('s_advance_balance_limit', data.advance_balance_limit || 0);
    setVal('s_supervisor',          data.supervisor_id || 0);
    setVal('s_expire_time',         data.expire_time || '23:59');
    setVal('s_address',             data.address || '');
    setVal('s_sms_balance',         data.sms_balance || 0);
    setVal('s_sms_rate',            data.sms_rate || 0);

    const commType = data.commission_type || 'Fixed';
    const typeFixed = document.getElementById('type_fixed');
    const typePkg   = document.getElementById('type_package');
    if (typeFixed && typePkg) {
        typeFixed.checked = (commType === 'Fixed');
        typePkg.checked   = (commType !== 'Fixed');
    }
    toggleCommType();

    const undoEl = document.getElementById('s_can_undo_recharge');
    if (undoEl) undoEl.checked = (data.can_undo_recharge == 1);
    const smsEl = document.getElementById('s_can_use_global_sms');
    if (smsEl) smsEl.checked = (data.can_use_global_sms == 1);
    toggleSMSFields();

    // Restore package checkboxes
    let allowedIds = [];
    if (data.allowed_packages) {
        try { allowedIds = JSON.parse(data.allowed_packages).map(String); } catch(e) {}
    }
    if (document.getElementById('pkgSearchInput')) {
        document.getElementById('pkgSearchInput').value = '';
    }
    filterPkgList();
    setPkgSelection(allowedIds);

    const supervisorRow = document.getElementById('supervisor_row');
    if (supervisorRow) supervisorRow.style.display = (data.role === 'Agent') ? 'none' : 'flex';

    const pwdInput = document.getElementById('s_password');
    if (pwdInput) pwdInput.placeholder = 'Leave blank to keep current';

    if (!agentModal) agentModal = getModal('agentModal');
    if (agentModal) agentModal.show();
}

// ── Fund modal ────────────────────────────────────────────────────────────────
function openFundModal(id, name) {
    console.log('[pop-branch] Give Funds clicked:', name);
    document.getElementById('fundTargetId').value  = id;
    document.getElementById('fundTargetName').value = name;
    if (!fundModal) fundModal = getModal('fundModal');
    if (fundModal) fundModal.show();
}

// ── Withdraw modal ────────────────────────────────────────────────────────────
function openWithdrawModal(id, name, balance) {
    console.log('[pop-branch] Refund Balance clicked:', name);
    document.getElementById('withdrawTargetId').value   = id;
    document.getElementById('withdrawTargetName').value  = name;
    const balEl = document.getElementById('withdrawCurrentBalance');
    if (balEl) balEl.innerText = '৳' + parseFloat(balance).toLocaleString(undefined, {minimumFractionDigits: 2});
    const modal = getModal('withdrawModal');
    if (modal) modal.show();
}

// ── Collect Due modal ─────────────────────────────────────────────────────────
function openCollectModal(id, name, due) {
    console.log('[pop-branch] Collect Due clicked:', name);
    document.getElementById('collectTargetId').value   = id;
    document.getElementById('collectTargetName').value  = name;
    const dueEl = document.getElementById('collectDueDisplay');
    if (dueEl) dueEl.innerText = '৳' + parseFloat(due).toLocaleString(undefined, {minimumFractionDigits: 2});
    if (!collectModal) collectModal = getModal('collectModal');
    if (collectModal) collectModal.show();
}

// ── Set Rates modal ───────────────────────────────────────────────────────────
function openRatesModal(data) {
    console.log('[pop-branch] Set Rates clicked:', data.name);
    const id   = data.id;
    const name = data.name;
    const allowedPackages = data.allowed_packages ? JSON.parse(data.allowed_packages) : null;

    document.getElementById('rateTargetId').value      = id;
    document.getElementById('rateResellerName').innerText = name;

    document.querySelectorAll('.service-row').forEach(row => {
        const sid = row.getAttribute('data-sid');
        row.style.display = (!allowedPackages || allowedPackages.includes(sid)) ? 'table-row' : 'none';
    });

    if (!ratesModal) ratesModal = getModal('ratesModal');
    if (ratesModal) ratesModal.show();

    fetch('?ajax_get_rates=1&staff_id=' + id)
        .then(r => r.json())
        .then(resp => {
            document.querySelectorAll('.rate-input').forEach(input => {
                const sid = input.name.match(/\[(\d+)\]/)[1];
                input.value = (resp.sell_rates && resp.sell_rates[sid]) ? resp.sell_rates[sid] : '';
                updateProfit(input);
            });
            document.querySelectorAll('.agent-rate-input').forEach(input => {
                const sid = input.name.match(/\[(\d+)\]/)[1];
                input.value = (resp.agent_rates && resp.agent_rates[sid]) ? resp.agent_rates[sid] : '';
            });
        })
        .catch(err => console.error('[pop-branch] Rates fetch error:', err));
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOMContentLoaded — wire everything
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
    console.log('[pop-branch] pop-branch-management.js v20260616v2 loaded');

    if (typeof bootstrap === 'undefined') {
        console.error('[pop-branch] Bootstrap JS not loaded');
        return;
    }

    // Init commission + SMS states
    toggleCommType();

    // ── Package panel wiring ──────────────────────────────────────────────────

    // Search input → live filter
    document.getElementById('pkgSearchInput')?.addEventListener('input', filterPkgList);

    // Router change → re-filter packages
    document.getElementById('s_router')?.addEventListener('change', filterPkgList);

    // Select All visible
    document.getElementById('btnSelectAllPkg')?.addEventListener('click', function () {
        const visible = Array.from(document.querySelectorAll('.pkg-check-item'))
            .filter(el => el.style.display !== 'none');
        visible.forEach(el => {
            const cb = el.querySelector('.pkg-checkbox');
            if (cb) cb.checked = true;
        });
        updatePkgCount();
    });

    // Clear All
    document.getElementById('btnClearAllPkg')?.addEventListener('click', function () {
        document.querySelectorAll('.pkg-checkbox').forEach(cb => cb.checked = false);
        updatePkgCount();
    });

    // Any checkbox change → update count
    document.getElementById('pkgCheckboxList')?.addEventListener('change', updatePkgCount);

    // Initial count render
    updatePkgCount();

    // ── Create New POP button ─────────────────────────────────────────────────
    document.getElementById('btnAddAgent')?.addEventListener('click', addAgent);

    // ── Role change → supervisor row ──────────────────────────────────────────
    document.getElementById('s_role')?.addEventListener('change', function () {
        const row = document.getElementById('supervisor_row');
        if (row) row.style.display = (this.value === 'Agent') ? 'none' : 'flex';
    });

    // ── Commission type radios ────────────────────────────────────────────────
    document.getElementById('type_fixed')?.addEventListener('change', toggleCommType);
    document.getElementById('type_package')?.addEventListener('change', toggleCommType);

    // ── SMS toggle ────────────────────────────────────────────────────────────
    document.getElementById('s_can_use_global_sms')?.addEventListener('change', toggleSMSFields);

    // ── Lock type change → help text ──────────────────────────────────────────
    document.getElementById('lockTypeSelect')?.addEventListener('change', updateLockHelp);

    // ── Rate inputs → profit calculation ─────────────────────────────────────
    document.querySelectorAll('.rate-input').forEach(input => {
        input.addEventListener('input', () => updateProfit(input));
    });
    document.querySelectorAll('.agent-rate-input').forEach(input => {
        input.addEventListener('input', () => {
            const tr = input.closest('tr');
            const rateInput = tr?.querySelector('.rate-input');
            if (rateInput) updateProfit(rateInput);
        });
    });

    // ── Delegated click handler for table action buttons ──────────────────────
    document.addEventListener('click', function (e) {

        // Give Funds (green +)
        const fundBtn = e.target.closest('.btn-pop-fund');
        if (fundBtn) {
            e.preventDefault();
            openFundModal(fundBtn.dataset.id, fundBtn.dataset.name);
            return;
        }

        // Refund/Withdraw (yellow -)
        const withdrawBtn = e.target.closest('.btn-pop-withdraw');
        if (withdrawBtn) {
            e.preventDefault();
            openWithdrawModal(withdrawBtn.dataset.id, withdrawBtn.dataset.name, withdrawBtn.dataset.balance);
            return;
        }

        // Lock/Unlock (red lock icon)
        const lockBtn = e.target.closest('.btn-pop-lock');
        if (lockBtn) {
            e.preventDefault();
            openLockModal(lockBtn.dataset.id, lockBtn.dataset.name, lockBtn.dataset.lockStatus, lockBtn.dataset.lockNote);
            return;
        }

        // Collect Due
        const collectBtn = e.target.closest('.btn-pop-collect');
        if (collectBtn) {
            e.preventDefault();
            openCollectModal(collectBtn.dataset.id, collectBtn.dataset.name, collectBtn.dataset.due);
            return;
        }

        // Set Rates (tags icon)
        const ratesBtn = e.target.closest('.btn-pop-rates');
        if (ratesBtn) {
            e.preventDefault();
            const data = JSON.parse(ratesBtn.getAttribute('data-agent') || '{}');
            openRatesModal(data);
            return;
        }

        // Edit POP/Branch
        const editBtn = e.target.closest('.btn-edit-agent');
        if (editBtn) {
            e.preventDefault();
            const data = JSON.parse(editBtn.getAttribute('data-agent') || '{}');
            editAgent(data);
            return;
        }

        // Delete / Make Left confirmation
        const deleteBtn = e.target.closest('.btn-delete-agent');
        if (deleteBtn) {
            if (!confirm('Mark this POP/Branch as left?')) {
                e.preventDefault();
            }
            return;
        }
    });

    // ── Bootstrap Popovers ────────────────────────────────────────────────────
    document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
        new bootstrap.Popover(el);
    });
});
