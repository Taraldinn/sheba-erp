import os
import re

search_dir = r"d:\Ashik\Shebad 21 may"
patterns = [r"global_online\.json", r"global_online\.lock"]

print("Searching for occurrences of:", patterns)

for root, dirs, files in os.walk(search_dir):
    # Skip vendor and .git directories
    if "vendor" in root or ".git" in root or "cache" in root:
        continue
    for file in files:
        if file.endswith((".php", ".html", ".js")):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    for pattern in patterns:
                        if re.search(pattern, content):
                            print(f"Match found in: {file_path}")
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
