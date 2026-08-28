with open('js/components.js', 'r') as f:
    content = f.read()

imports = "import Settlement from './settlement.js';\nimport Currency from './currency.js';\n\n"
if "import Settlement" not in content:
    content = imports + content

with open('js/components.js', 'w') as f:
    f.write(content)
