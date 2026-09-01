# Bulk Statement Scope Update — 24 Aug 2026

## New behavior
- Admin: by default sees only clients whose `manager_id` is the logged-in Admin ID.
- Admin: can enable **Show All Users** to include all clients in the current tenant, including Admin + Reseller/SubReseller/POP/Branch owned clients.
- Reseller/SubReseller/POP/Branch: sees only clients whose `manager_id` is that logged-in staff ID.
- The Show All Users switch is visible only to Admin/Super Admin.
- CSV export and Print inherit the same selected scope.
- Printed statement shows the active scope in the header.

## Security / isolation
This report intentionally does not use `getManagedStaffIds()` for client ownership filtering because that helper grants ALL to Admin and can inherit a parent's scope for some child roles. Financial statements now use direct `manager_id` ownership unless an Admin explicitly enables tenant-wide view.

## Changed file
- `views/reports/bulk_statement.php`
