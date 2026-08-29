with open('js/currencyPicker.js', 'r') as f:
    content = f.read()

func = """function _escHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
"""

if "function _escHTML" not in content:
    content = content.replace("import Currency from './currency.js';", "import Currency from './currency.js';\n\n" + func)
    with open('js/currencyPicker.js', 'w') as f:
        f.write(content)
