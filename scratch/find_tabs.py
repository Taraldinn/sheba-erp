with open('views/profile.php', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if 'nav-tabs' in line or 'tab-content' in line or 'tab-pane' in line:
        print(f"Line {i+1}: {line.strip()}")
