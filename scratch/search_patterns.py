import os
import re

root_dir = r"g:\22 june sheba"

patterns = {
    'display_errors': re.compile(r"display_errors"),
    'error_reporting': re.compile(r"error_reporting"),
    'md5': re.compile(r"\bmd5\("),
    'debug_logging': re.compile(r"file_put_contents\([^,]+debug"),
    'var_dump': re.compile(r"\bvar_dump\b|\bprint_r\b"),
}

results = {k: [] for k in patterns}

exclude_dirs = {'.git', 'vendor', 'laravel', 'node_modules', 'scratch'}

for root, dirs, files in os.walk(root_dir):
    # filter out excluded directories
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    for file in files:
        if not file.endswith('.php'):
            continue
        filepath = os.path.join(root, file)
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.split('\n')
                for idx, line in enumerate(lines):
                    for name, pat in patterns.items():
                        if pat.search(line):
                            results[name].append((filepath, idx + 1, line.strip()))
        except Exception as e:
            print(f"Error reading {filepath}: {e}")

print("--- RESULTS ---")
for name, matches in results.items():
    print(f"\n[{name.upper()}] Matches count: {len(matches)}")
    for filepath, line_num, line_content in matches[:100]: # limit to 100 for readability
        rel_path = os.path.relpath(filepath, root_dir)
        print(f"  {rel_path}:{line_num} -> {line_content}")
