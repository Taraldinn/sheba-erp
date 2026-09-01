let staffModal = null;

function addStaff() {
    document.getElementById('staffModalTitle').innerText = "Create New Office Staff";
    document.getElementById('s_submit').name = "create_office_staff";
    document.getElementById('s_id').value = "";
    document.getElementById('s_name').value = "";
    document.getElementById('s_username').value = "";
    document.getElementById('s_username').readOnly = false;
    document.getElementById('s_password').value = "";
    document.getElementById('s_password').required = true;
    document.getElementById('s_phone').value = "";
    document.getElementById('pw-hint').innerText = "";
    
    document.querySelectorAll('.perm-check').forEach(cb => cb.checked = false);
    
    if(!staffModal) staffModal = new bootstrap.Modal(document.getElementById('staffModal'));
    staffModal.show();
}

function editStaff(data) {
    document.getElementById('staffModalTitle').innerText = "Edit " + data.role + ": " + data.name;
    document.getElementById('s_submit').name = "edit_office_staff";
    document.getElementById('s_id').value = data.id;
    document.getElementById('s_name').value = data.name;
    document.getElementById('s_username').value = data.username;
    document.getElementById('s_username').readOnly = true;
    document.getElementById('s_role').value = data.role;
    document.getElementById('s_password').required = false;
    document.getElementById('pw-hint').innerText = "Leave blank to keep current";
    
    document.getElementById('s_phone').value = data.phone || '';
    
    let perms = [];
    try { perms = JSON.parse(data.permissions || '[]'); } catch(e) {}
    document.querySelectorAll('.perm-check').forEach(cb => {
        cb.checked = perms.includes(cb.value);
    });
    
    if(!staffModal) staffModal = new bootstrap.Modal(document.getElementById('staffModal'));
    staffModal.show();
}

document.addEventListener('DOMContentLoaded', function() {
    const btnCreateStaff = document.getElementById('btnCreateStaff');
    if (btnCreateStaff) {
        btnCreateStaff.addEventListener('click', addStaff);
    }

    document.addEventListener('click', function(e) {
        const editBtn = e.target.closest('.btn-edit-staff');
        if (editBtn) {
            e.preventDefault();
            const data = {
                id: editBtn.getAttribute('data-id'),
                name: editBtn.getAttribute('data-name'),
                username: editBtn.getAttribute('data-username'),
                role: editBtn.getAttribute('data-role'),
                phone: editBtn.getAttribute('data-phone'),
                permissions: editBtn.getAttribute('data-permissions')
            };
            editStaff(data);
        }

        const deleteBtn = e.target.closest('.btn-delete-staff');
        if (deleteBtn) {
            if (!confirm('Delete this staff member?')) {
                e.preventDefault();
            }
        }
    });
});
