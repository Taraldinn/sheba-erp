
import os

target_files = [
    'controllers/logic.php',
    'views/auth/login.php',
    'index.php'
]

def replace_redirects(path):
    full_path = os.path.join(os.getcwd(), path)
    if not os.path.exists(full_path):
        print(f"Skipping {path} (not found)")
        return

    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace header redirects to index.php with relative path ./
    # This works for both "Location: index.php" and "Location: index.php?foo=bar"
    # Be careful not to replace "index.php" if it's not at the start of the Location value?
    # Actually, replacing "Location: index.php" with "Location: ./" is safe.
    # index.php -> ./
    # index.php?foo=bar -> ./?foo=bar
    
    new_content = content.replace('header("Location: index.php', 'header("Location: ./')
    new_content = new_content.replace("header('Location: index.php", "header('Location: ./")
    
    if content != new_content:
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {path}")
    else:
        print(f"No changes in {path}")

for f in target_files:
    replace_redirects(f)
