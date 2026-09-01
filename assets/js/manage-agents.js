/**
 * manage-agents.js
 * CSP-safe JS for views/manage_agents.php
 */
'use strict';

document.addEventListener('DOMContentLoaded', function () {
    console.log('[manage-agents] manage-agents.js loaded');

    if (typeof bootstrap === 'undefined') {
        console.error('[manage-agents] Bootstrap not loaded');
        return;
    }

    let realAgentModal = null;

    function getModal(id) {
        const el = document.getElementById(id);
        if (!el) { console.error('[manage-agents] Modal not found: #' + id); return null; }
        return new bootstrap.Modal(el);
    }

    const fieldIds = ['ra_name','ra_phone','ra_email','ra_address','ra_bank_name','ra_account_name','ra_account_no','ra_branch_name','ra_routing_no'];

    function openAddModal() {
        console.log('[manage-agents] Add New Agent clicked');
        document.getElementById('realAgentModalTitle').innerText = 'Add New Agent';
        document.getElementById('ra_submit').innerText  = 'Save Agent';
        document.getElementById('ra_submit').name       = 'add_agent';
        document.getElementById('ra_id').value          = '';
        fieldIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (!realAgentModal) realAgentModal = getModal('realAgentModal');
        if (realAgentModal) realAgentModal.show();
    }

    function openEditModal(data) {
        console.log('[manage-agents] Edit Agent clicked:', data.name);
        document.getElementById('realAgentModalTitle').innerText = 'Edit Agent: ' + data.name;
        document.getElementById('ra_submit').innerText  = 'Update Agent';
        document.getElementById('ra_submit').name       = 'edit_agent';
        document.getElementById('ra_id').value          = data.id;

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
        setVal('ra_name',         data.name);
        setVal('ra_phone',        data.phone);
        setVal('ra_email',        data.email);
        setVal('ra_address',      data.address);
        setVal('ra_bank_name',    data.bank_name);
        setVal('ra_account_name', data.account_name);
        setVal('ra_account_no',   data.account_no);
        setVal('ra_branch_name',  data.branch_name);
        setVal('ra_routing_no',   data.routing_no);

        if (!realAgentModal) realAgentModal = getModal('realAgentModal');
        if (realAgentModal) realAgentModal.show();
    }

    // Create button
    const addBtn = document.getElementById('btnAddRealAgent');
    if (addBtn) addBtn.addEventListener('click', openAddModal);

    // Edit buttons via delegation
    document.addEventListener('click', function (e) {
        const editBtn = e.target.closest('.btn-edit-real-agent');
        if (editBtn) {
            e.preventDefault();
            const data = JSON.parse(editBtn.getAttribute('data-agent') || '{}');
            openEditModal(data);
        }
    });
});
