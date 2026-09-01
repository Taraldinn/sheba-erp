# Due-First Recharge Update — 24 Aug 2026

Updated Manual Recharge and Bulk Recharge.

- New checkbox: `Deduct Due Balance First` / `Deduct Due`.
- Checkbox OFF: recharge behavior remains unchanged.
- Checkbox ON: existing due is deducted from the payment first; only the remaining payment is converted into recharge validity.
- If due consumes the full payment, no new validity is added and the client is not force-activated.
- Due/Expire payment method automatically ignores/disables the due-deduction option.
- Due settlement is logged as `Pay Due`; recharge remainder is logged separately as `Recharge`.
- Reseller/package cost is charged only against the new recharge portion, preventing the old due service from being costed twice.
- Bulk chunked AJAX automatically carries the checkbox value to every chunk.
