import difflib

file1 = r'D:\Ashik\Sheba June\classes\OLTManager.php'
file2 = r'D:\Ashik\Sheba June\shebafiolt\olt_monitor.php'

with open(file1, 'r', encoding='utf-8') as f:
    code1 = f.read()

with open(file2, 'r', encoding='utf-8') as f:
    code2 = f.read()

def get_class_content(code):
    start = code.find('class OLTMonitor {')
    if start == -1:
        start = code.find('class OLTMonitor')
    if start == -1:
        return ''
    end = code.find('class OLTManager {')
    if end == -1:
        end = code.find('class OLTManager')
    if end == -1:
        return code[start:]
    return code[start:end]

monitor1 = get_class_content(code1).strip()
monitor2 = get_class_content(code2).strip()

if monitor1 == monitor2:
    print("OLTMonitor classes are identical.")
else:
    print("OLTMonitor classes DIFFER. Diff:")
    diff = difflib.unified_diff(
        monitor1.splitlines(),
        monitor2.splitlines(),
        fromfile='classes/OLTManager.php',
        tofile='shebafiolt/olt_monitor.php',
        lineterm=''
    )
    for line in list(diff)[:100]:  # limit to first 100 lines of diff
        print(line)
