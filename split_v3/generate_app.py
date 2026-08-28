import re

with open('../js/app.js', 'r') as f:
    content = f.read()

# Replace State calls with Store
content = content.replace('State.getGroup', 'Store.getGroup')
content = content.replace('State.data.groups', '{}') # Not used in V3 since Store handles one group at a time
content = content.replace('State.deleteGroup', 'console.warn("Delete not implemented")')

# Remove sync logic
sync_methods = ['syncOnline', 'publishAndSync', 'syncGroupFromCloud', '_startRetryLoop', '_stopRetryLoop']
for method in sync_methods:
    content = re.sub(rf'  {method}\(.*?\) {{.*?^  }},?\n?', '', content, flags=re.MULTILINE | re.DOTALL)

# Add export statement
content = "import Store from './store.js';\n\n" + content
content += "\nwindow.App = App;\n"

with open('js/app.js', 'w') as f:
    f.write(content)
