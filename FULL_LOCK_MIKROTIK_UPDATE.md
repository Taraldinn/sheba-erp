# Full Lock + MikroTik Client Disable Update

## Behaviour
- None: unlock selected POP/Branch/Reseller panel and restore only Active clients previously disabled by Full Lock.
- Panel: lock selected panel only; MikroTik clients remain unchanged.
- Full: lock selected panel and disable all PPPoE secrets in the selected staff member's complete managed tree.

## Safety
- Active users are tagged with `is_parent_locked=1` before disable.
- Due/Inactive/Expired/Left users are also forced disabled in MikroTik, but are NOT tagged for re-enable.
- Unlock does not reactivate users that were already non-Active.
- Router API connection is reused per router during each batch.
- Result counts are written to the Activity Log and shown in success feedback.
- CSRF token added to lock forms.

## Main changed files
- controllers/logic.php
- views/agents.php
- views/staff/agents.php
- views/staff.php
- views/staff/staff.php
- assets/js/pop-branch-management.js
