
import os

target_file = r'c:\Users\MD.Hasan\Downloads\IBD\controllers\logic.php'
with open(target_file, 'r') as f:
    content = f.read()

# Variable fixes
replacements = {
    "$_POST['s_name']": "$_POST['name']",
    "$_POST['s_username']": "$_POST['username']",
    "$_POST['s_router']": "$_POST['staff_router_id']",
    "$_POST['s_agent_id']": "$_POST['agent_id']",
    "$_POST['s_agent_commission']": "$_POST['agent_commission']",
    "$_POST['s_phone']": "$_POST['phone']",
    "$_POST['s_nid']": "$_POST['nid']",
    "$_POST['s_address']": "$_POST['address']",
    "$_POST['s_password']": "$_POST['password']",
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Add $role retrieval
content = content.replace("$name = $_POST['name']; $username = $_POST['username'];", "$name = $_POST['name']; $username = $_POST['username']; $role = $_POST['role'];")

# Update queries to include role
update_with_pass = 'SET name=?, username=?, password=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=? WHERE id=?'
new_update_with_pass = 'SET name=?, username=?, password=?, role=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=? WHERE id=?'

update_without_pass = 'SET name=?, username=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=? WHERE id=?'
new_update_without_pass = 'SET name=?, username=?, role=?, router_id=?, agent_id=?, agent_commission=?, commission_type=?, phone=?, nid=?, address=? WHERE id=?'

content = content.replace(update_with_pass, new_update_with_pass)
content = content.replace(update_without_pass, new_update_without_pass)

# Update the execute arrays to include $role
content = content.replace('execute([$name, $username, $pass, $router', 'execute([$name, $username, $pass, $role, $router')
content = content.replace('execute([$name, $username, $router', 'execute([$name, $username, $role, $router')

with open(target_file, 'w') as f:
    f.write(content)
print("Updated successfully")
