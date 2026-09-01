# Recharge Discount Mode Update — 24 Aug 2026

## Tenant-level setting
Admin -> Settings -> General -> Recharge Discount Mode.
Each tenant stores its own `recharge_discount_enabled` option in that tenant database.

## Manual recharge
When enabled, client Quick Actions shows a Discount amount field.
- Gross recharge/validity remains unchanged.
- Discount reduces the customer amount collected.
- Discount is server-side clamped between 0 and gross recharge value.
- Disabled tenants cannot submit discount by manually crafting POST values.

## Bulk recharge
When enabled, clicking Bulk Recharge opens a user-wise discount modal for selected clients.
- Each selected client has an independent discount amount.
- Gross and Net Payable are previewed.
- Discount values are sent per client and per AJAX chunk for large bulk operations.

## Due-first interaction
If Deduct Due is enabled, existing due is settled from actual cash received after discount. Discount itself does not reduce purchased validity. Old due settlement may reduce the new recharge validity according to the existing due-first rule.

## Accounting / logs
Recharge logs record Gross, Discount and Paid metadata. Actual Income uses the net collected amount. Bandwidth/wallet cost is not reduced merely because a discount was granted; only due-first service allocation can reduce cost proportionally under the existing logic.

## Statement / invoice
Bulk Monthly Statement recognizes recharge discount metadata when deciding Paid vs Partial, while Collected remains actual cash received. Recharge invoice parser recognizes Gross, Discount and Paid fields.
