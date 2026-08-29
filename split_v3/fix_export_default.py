with open('js/export.js', 'r') as f:
    content = f.read()

if "export default CSVExport;" not in content:
    with open('js/export.js', 'w') as f:
        f.write(content + "\nexport default CSVExport;\n")
