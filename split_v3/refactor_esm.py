import os
import re

def refactor_file(filepath, obj_name):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Change `const Obj = {` to `const Obj = {` (leave as is)
    # Add `export default Obj;` at the bottom if not exists
    if f"export default {obj_name};" not in content:
        content += f"\nexport default {obj_name};\n"
        
    with open(filepath, 'w') as f:
        f.write(content)

refactor_file('js/currency.js', 'Currency')
refactor_file('js/settlement.js', 'Settlement')
refactor_file('js/qrcode.js', 'QRCode')
refactor_file('js/export.js', 'Export')
