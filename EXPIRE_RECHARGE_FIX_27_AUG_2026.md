# Expire User Recharge Fix — 27 AUG 2026

Fixed:
- Regular Recharge always means 30 days.
- Hidden Manual Days value is disabled unless Manual Days is selected.
- Prevents an old value such as 3 days from being submitted during Regular Recharge.
- Expired client recharge updates current_bill_date.
- Successful validity recharge changes status and bill_position to Active.
- Credit days are still deducted correctly when the client previously used credit.
- Success message now shows actual validity days and the new expiry date.
- Backend verifies that expiry/status update was actually saved.

Main files:
- controllers/logic.php
- views/profile.php
