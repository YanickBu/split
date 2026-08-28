with open('js/app.js', 'r') as f:
    content = f.read()

methods = """
  async shareSummary() {
    const group = Store.getGroup();
    if (!group) return;
    const balances = Settlement.calculateBalances(group);
    const settlements = Settlement.calculateSettlements(balances);
    const summary = Settlement.generateSummary(group, balances, settlements);
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: group.name,
          text: summary,
          url: window.location.href
        });
        return;
      } catch (e) {}
    }
    this.copyToClipboard(summary, "Summary copied to clipboard!");
  },
  
  copyToClipboard(text, msg = "Copied to clipboard!") {
    navigator.clipboard.writeText(text).then(() => alert(msg)).catch(() => alert("Failed to copy."));
  },
"""

content = content.replace("  importCSV(e) {", methods + "\n  importCSV(e) {")

with open('js/app.js', 'w') as f:
    f.write(content)
