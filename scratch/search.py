import os
import re

files = [
    r"d:\Ashik\Sheba June\controllers\logic.php",
    r"d:\Ashik\Sheba June\controllers\payment_callback.php"
]

for file_path in files:
    if os.path.exists(file_path):
        print(f"Searching in {file_path}...")
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f, 1):
                if "Recharge" in line or "audit_log" in line or "action_type" in line:
                    if len(line.strip()) < 150:
                        print(f"  Line {i}: {line.strip()}")
                    else:
                        print(f"  Line {i}: {line.strip()[:150]}...")
