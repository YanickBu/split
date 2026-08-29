with open('js/components.js', 'r') as f:
    content = f.read()

render_home = """
  renderHome(state) {
    return `
      <header>
        <h1><span class="logo"></span>Split <span>v3</span></h1>
      </header>
      <main>
        <div class="card" style="text-align:center; padding: 40px 20px;">
          <h2 style="margin-bottom: 20px;">Welcome to Split P2P</h2>
          <p style="color: var(--text-dim); margin-bottom: 30px;">Create a new group to start tracking expenses with your friends. Data is synced peer-to-peer!</p>
          <button class="btn-primary" onclick="document.getElementById('newGroupModal').showModal()" style="width: 100%; max-width: 300px; padding: 15px;">
            + Create New Group
          </button>
        </div>
      </main>
    `;
  },
"""

content = content.replace("const Components = {", "const Components = {\n" + render_home)

with open('js/components.js', 'w') as f:
    f.write(content)
