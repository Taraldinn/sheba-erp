
import re

file_path = r'c:\Users\MD.Hasan\Downloads\IBD\controllers\logic.php'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Fix variables assignments
# Old: $name = $_POST['s_name']; $username = $_POST['s_username'];
# New: $name = $_POST['name']; $username = $_POST['username']; $role = $_POST['role'];
content = re.sub(
    r"\$name\s*=\s*\$_POST\['s_name'\];\s*\$username\s*=\s*\$_POST\['s_username'\];",
    r"$name = $_POST['name']; $username = $_POST['username']; $role = $_POST['role'];",
    content
)

# 2. Fix other variables
content = re.sub(r"\$_POST\['s_router'\]", r"$_POST['staff_router_id']", content)
content = re.sub(r"\$_POST\['s_agent_id'\]", r"$_POST['agent_id']", content)
content = re.sub(r"\$_POST\['s_agent_commission'\]", r"$_POST['agent_commission']", content)
content = re.sub(r"\$_POST\['s_phone'\]", r"$_POST['phone']", content)
content = re.sub(r"\$_POST\['s_nid'\]", r"$_POST['nid']", content)
content = re.sub(r"\$_POST\['s_address'\]", r"$_POST['address']", content)
content = re.sub(r"\$_POST\['s_password'\]", r"$_POST['password']", content)

# 3. Update the SQL and execute calls
# This part is tricky because of the multiple lines. 
# We'll use a more surgical approach for the update string and parameters.

# Update strings
content = content.replace(
    "name=?, username=?, password=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=? WHERE id=?",
    "name=?, username=?, password=?, role=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=? WHERE id=?"
)
content = content.replace(
    "name=?, username=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=? WHERE id=?",
    "name=?, username=?, role=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=? WHERE id=?"
)

# Parameter arrays
content = content.replace(
    'execute([$name, $username, $pass, $router',
    'execute([$name, $username, $pass, $role, $router'
)
content = content.replace(
    'execute([$name, $username, $router',
    'execute([$name, $username, $role, $router'
)

with open(file_path, 'w') as f:
    f.write(content)

print("Done")
