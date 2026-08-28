with open('js/export.js', 'r') as f:
    content = f.read()

content = content.replace("import Currency from './currency.js';", "import Currency from './currency.js';\nimport Store from './store.js';")

# Fix exportCSV
content = content.replace("State.getGroup(app.currentGroupId)", "Store.getGroup()")

# Remove importCSV entirely to avoid confusion since app.js has its own implementation
import_csv_start = content.find("importCSV(app, e) {")
if import_csv_start != -1:
    content = content[:import_csv_start] + "}\n" # close CSVExport object

# Clean up any trailing braces from the removal
content = content.replace("}\n\n\nexport default CSVExport;", "\nexport default CSVExport;")

with open('js/export.js', 'w') as f:
    f.write(content)
