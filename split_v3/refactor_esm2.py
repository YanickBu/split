def refactor_file(filepath, obj_name):
    with open(filepath, 'r') as f:
        content = f.read()
    if f"export default {obj_name};" not in content:
        content += f"\nexport default {obj_name};\n"
    with open(filepath, 'w') as f:
        f.write(content)

refactor_file('js/components.js', 'Components')
refactor_file('js/currencyPicker.js', 'CurrencyPicker')
