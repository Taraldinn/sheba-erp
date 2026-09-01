import os
import re

workspace = r"g:\Shebafi\sheba 22 2nd round"
logic_path = os.path.join(workspace, "controllers", "logic.php")

with open(logic_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

print(f"Total lines in logic.php: {len(lines)}")

# Let's search for "recharge" case insensitive
recharge_matches = []
for idx, line in enumerate(lines):
    if "recharge" in line.lower() or "left" in line.lower() or "active" in line.lower():
        # Filter matching lines
        if "recharge" in line.lower() or "status" in line.lower():
            recharge_matches.append((idx + 1, line.strip()))

print(f"Found {len(recharge_matches)} matches for 'recharge' or 'status'. Let's show first 100:")
for num, content in recharge_matches[:100]:
    print(f"L{num}: {content[:120]}")
