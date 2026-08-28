with open('js/store.js', 'r') as f:
    content = f.read()

replacement = """  createGroup(name, currency, creatorName) {
    const id = 'grp_' + Date.now() + Math.random().toString(36).substring(2, 7);
    
    // Initialize Yjs store so this.groupMap is available
    this.init(id, () => {});
"""

content = content.replace("  createGroup(name, currency, creatorName) {\n    const id = 'grp_' + Date.now() + Math.random().toString(36).substring(2, 7);", replacement)

with open('js/store.js', 'w') as f:
    f.write(content)
