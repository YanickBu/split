with open('js/app.js', 'r') as f:
    content = f.read()

methods = """
  async settleUp() {
    if (confirm("Are you sure you want to settle up? This will void all current expenses and bring everyone's balance to zero.")) {
      const group = Store.getGroup();
      if (!group || !group.events) return;
      group.events.forEach(evt => {
        if (evt.type === 'ADD_EXPENSE') {
          Store.appendEvent(this.currentGroupId, 'STORNO_EXPENSE', { targetHash: evt.hash, expenseId: evt.id });
        }
      });
    }
  },

  exportCSV(e) {
    if (typeof Export !== 'undefined') {
      Export.downloadCSV(this.currentGroupId);
    }
  },
  
  showAddMember() {
    this.showAddMemberModal();
  },
"""

# Insert right before importCSV
content = content.replace("  importCSV(e) {", methods + "\n  importCSV(e) {")

with open('js/app.js', 'w') as f:
    f.write(content)
