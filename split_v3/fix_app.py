with open('js/app.js', 'r') as f:
    content = f.read()

imports = """import Store from './store.js';
import Currency from './currency.js';
import CurrencyPicker from './currencyPicker.js';
import Components from './components.js';
import QRCode from './qrcode.js';

"""
# Remove existing import Store
content = content.replace("import Store from './store.js';\n", "")
content = imports + content

with open('js/app.js', 'w') as f:
    f.write(content)
