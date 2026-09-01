let routerModalInstance = null;

function getRouterModal() {
    if (!routerModalInstance) {
        routerModalInstance = new bootstrap.Modal(document.getElementById('routerModal'));
    }
    return routerModalInstance;
}

function addRouter() {
    document.getElementById('modalTitle').innerText = "Add New Router";
    document.getElementById('submitBtn').name = "add_router";
    document.getElementById('submitBtn').innerText = "Save Router";
    document.getElementById('r_id').value = "";
    document.getElementById('r_name').value = "";
    document.getElementById('r_ip').value = "";
    document.getElementById('r_user').value = "";
    document.getElementById('r_pass').value = "";
    document.getElementById('r_port').value = "8728";
    getRouterModal().show();
}

function editRouter(data) {
    document.getElementById('modalTitle').innerText = "Edit Router: " + data.name;
    document.getElementById('submitBtn').name = "edit_router";
    document.getElementById('submitBtn').innerText = "Update Router";
    document.getElementById('r_id').value = data.id;
    document.getElementById('r_name').value = data.name;
    document.getElementById('r_ip').value = data.ip_address;
    document.getElementById('r_user').value = data.username;
    document.getElementById('r_pass').value = data.api_password;
    document.getElementById('r_port').value = data.port;
    getRouterModal().show();
}

document.addEventListener('DOMContentLoaded', function() {
    // Add Router
    const btnAddRouter = document.getElementById('btnAddRouter');
    if (btnAddRouter) {
        btnAddRouter.addEventListener('click', addRouter);
    }

    // Event delegation for table actions
    document.addEventListener('click', function(e) {
        // Import PPP Secrets
        const importBtn = e.target.closest('.btn-import-secrets');
        if (importBtn) {
            e.preventDefault();
            if (confirm('Import all PPP secrets from this router? This will create new users with 1 day credit.')) {
                window.location.href = importBtn.getAttribute('data-href');
            }
        }

        // Sync Router Clients
        const syncBtn = e.target.closest('.btn-sync-router');
        if (syncBtn) {
            e.preventDefault();
            const id = syncBtn.getAttribute('data-id');
            if (confirm('Sync all clients of this router to MikroTik? This will enable active clients and disable expired/inactive clients on the router according to their billing dates.')) {
                window.location.href = "?tab=routers&action=sync_clients&router_id=" + id;
            }
        }

        // Edit Router
        const editBtn = e.target.closest('.btn-edit-router');
        if (editBtn) {
            e.preventDefault();
            const data = {
                id: editBtn.getAttribute('data-id'),
                name: editBtn.getAttribute('data-name'),
                ip_address: editBtn.getAttribute('data-ip_address'),
                username: editBtn.getAttribute('data-username'),
                api_password: editBtn.getAttribute('data-api_password'),
                port: editBtn.getAttribute('data-port')
            };
            editRouter(data);
        }

        // Unregistered Users
        const unregisteredBtn = e.target.closest('.btn-unreg-show-list');
        if (unregisteredBtn) {
            e.preventDefault();
            const id = unregisteredBtn.getAttribute('data-id');
            if (id) {
                window.location.href = "?tab=routers&view_unregistered=1&router_id=" + id;
            }
        }

        // Delete Router
        const deleteBtn = e.target.closest('.btn-delete-router');
        if (deleteBtn) {
            e.preventDefault();
            const id = deleteBtn.getAttribute('data-id');
            if (confirm("Are you sure you want to delete this router?")) {
                window.location.href = "?tab=routers&action=delete_router&id=" + id;
            }
        }
    });

    // Check Router Status
    document.querySelectorAll('.router-status').forEach(badge => {
        const id = badge.getAttribute('data-id');
        fetch('?ajax_router_status=1&id=' + id)
        .then(r => r.json())
        .then(data => {
            if (data.online) {
                badge.classList.remove('bg-secondary');
                badge.classList.add('bg-success');
                badge.innerText = "Connected";
            } else {
                badge.classList.remove('bg-secondary');
                badge.classList.add('bg-danger');
                badge.innerText = "Disconnected";
            }
        })
        .catch(() => {
            badge.classList.remove('bg-secondary');
            badge.classList.add('bg-warning');
            badge.innerText = "Error";
        });
    });
});
