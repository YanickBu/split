with open('js/export.js', 'r') as f:
    content = f.read()

imports = "import Currency from './currency.js';\n\n"
if "import Currency" not in content:
    content = imports + content

with open('js/export.js', 'w') as f:
    f.write(content)
