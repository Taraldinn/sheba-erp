/**
 * service-management.js
 * CSP-safe package/service management module.
 * No inline event handlers — all logic is bound in DOMContentLoaded.
 */

'use strict';

let svcModalInstance = null;
let syncModalInstance = null;

function getSvcModal() {
    if (!svcModalInstance) {
        const el = document.getElementById('serviceModal');
        if (!el) { console.error('[service-management] #serviceModal not found'); return null; }
        svcModalInstance = new bootstrap.Modal(el);
    }
    return svcModalInstance;
}

function getSyncModal() {
    if (!syncModalInstance) {
        const el = document.getElementById('syncModal');
        if (!el) { return null; }
        syncModalInstance = new bootstrap.Modal(el);
    }
    return syncModalInstance;
}

function calcTotal() {
    const price = parseFloat(document.getElementById('svc_price')?.value) || 0;
    const vat   = parseFloat(document.getElementById('svc_vat')?.value)   || 0;
    const total = price + (price * vat / 100);
    const totalEl = document.getElementById('svc_total');
    if (totalEl) totalEl.value = total.toFixed(2);
}

function addService() {
    console.log('[service-management] Add New Package clicked');

    const title    = document.getElementById('modalTitle');
    const submitBtn = document.getElementById('submitBtn');

    if (title)     title.innerText    = 'Create New Package';
    if (submitBtn) { submitBtn.name   = 'add_service'; submitBtn.innerText = 'Create Package'; }

    const fields = ['svc_id','svc_name','svc_profile','svc_rate','svc_buying_price','svc_price'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    const router = document.getElementById('svc_router');
    if (router) router.value = '0';

    const vat = document.getElementById('svc_vat');
    if (vat) vat.value = '0';

    calcTotal();

    const modal = getSvcModal();
    if (modal) modal.show();
}

function editService(data) {
    console.log('[service-management] Edit Package clicked:', data.name);

    const title    = document.getElementById('modalTitle');
    const submitBtn = document.getElementById('submitBtn');

    if (title)     title.innerText    = 'Edit Package: ' + data.name;
    if (submitBtn) { submitBtn.name   = 'edit_service'; submitBtn.innerText = 'Update Package'; }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    setVal('svc_id',           data.id);
    setVal('svc_name',         data.name);
    setVal('svc_router',       data.router_id || '0');
    setVal('svc_buying_price', data.buying_price);
    setVal('svc_price',        data.price);
    setVal('svc_vat',          data.vat_percent || 0);
    setVal('svc_profile',      data.mikrotik_profile_name);
    setVal('svc_rate',         data.rate_limit_profile);

    calcTotal();

    const modal = getSvcModal();
    if (modal) modal.show();
}

function syncFromMikrotik(data) {
    console.log('[service-management] Sync Clients clicked:', data.name);

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    setVal('sync_pkg_id',       data.id);
    setVal('sync_pkg_name',     data.name);
    setVal('sync_profile_name', data.mikrotik_profile_name);

    const display = document.getElementById('sync_pkg_display');
    if (display) display.innerText = data.name + ' (' + (data.mikrotik_profile_name || '') + ')';

    const modal = getSyncModal();
    if (modal) modal.show();
}

document.addEventListener('DOMContentLoaded', function () {
    console.log('[service-management] service-management.js loaded');

    if (typeof bootstrap === 'undefined') {
        console.error('[service-management] Bootstrap JS not loaded');
        return;
    }

    // ── Add New Package button ──────────────────────────────────────────────
    const addBtn = document.getElementById('btnAddService');
    if (addBtn) {
        addBtn.addEventListener('click', addService);
    } else {
        console.warn('[service-management] #btnAddService not found');
    }

    // ── Edit / Sync buttons (event delegation from the card grid) ──────────
    document.addEventListener('click', function (e) {

        // Edit Package (dropdown item or Manage Package button)
        const editBtn = e.target.closest('.btn-edit-service');
        if (editBtn) {
            e.preventDefault();
            const data = JSON.parse(editBtn.getAttribute('data-service') || '{}');
            editService(data);
            return;
        }

        // Sync Clients from MikroTik
        const syncBtn = e.target.closest('.btn-sync-service');
        if (syncBtn) {
            e.preventDefault();
            const data = JSON.parse(syncBtn.getAttribute('data-service') || '{}');
            syncFromMikrotik(data);
            return;
        }

        // Delete confirmation
        const deleteBtn = e.target.closest('.btn-delete-service');
        if (deleteBtn) {
            if (!confirm('Delete this package? This cannot be undone.')) {
                e.preventDefault();
            }
            return;
        }
    });

    // ── VAT / price live calc ───────────────────────────────────────────────
    const priceInput = document.getElementById('svc_price');
    const vatInput   = document.getElementById('svc_vat');
    if (priceInput) priceInput.addEventListener('input', calcTotal);
    if (vatInput)   vatInput.addEventListener('input', calcTotal);

    // ── Select2 reseller inside Sync Modal ─────────────────────────────────
    if (typeof jQuery !== 'undefined' && typeof jQuery.fn.select2 !== 'undefined') {
        const syncModalEl = document.getElementById('syncModal');
        if (syncModalEl) {
            jQuery('.select2-reseller').select2({
                theme: 'bootstrap-5',
                placeholder: '-- Choose Reseller --',
                allowClear: true,
                dropdownParent: jQuery('#syncModal')
            });
        }
    }
});
