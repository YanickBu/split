with open('js/app.js', 'r') as f:
    content = f.read()

exports = """
window.App = App;
window.Export = Export;
window.CurrencyPicker = CurrencyPicker;
window.Components = Components;
"""
if "window.Export = Export;" not in content:
    content = content.replace("window.App = App;", exports)

with open('js/app.js', 'w') as f:
    f.write(content)
