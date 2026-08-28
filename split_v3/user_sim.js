const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  resources: "usable",
  beforeParse(window) {
    window.console = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    window.onerror = function(msg, source, lineno, colno, error) {
      console.error(`Browser error: ${msg} at ${source}:${lineno}:${colno}`);
    };
    // Mock URLSearchParams because JSDOM sometimes struggles with hash params in some setups
    window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
    window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
    window.alert = console.log;
  }
});

setTimeout(() => {
  try {
    const window = dom.window;
    const document = window.document;

    console.log("--- SIMULATING USER: CREATING GROUP ---");
    document.getElementById('groupName').value = "Test Trip";
    document.getElementById('creatorName').value = "Alice";
    document.getElementById('newGroupForm').dispatchEvent(new window.Event('submit', { cancelable: true }));
    
    setTimeout(() => {
      console.log("URL Hash after creation:", window.location.hash);
      
      console.log("--- SIMULATING USER: ADDING MEMBER ---");
      // Open add member modal
      if (window.App && window.App.showAddMemberModal) window.App.showAddMemberModal();
      document.getElementById('memberName').value = "Bob";
      document.getElementById('addMemberForm').dispatchEvent(new window.Event('submit', { cancelable: true }));

      setTimeout(() => {
        console.log("--- SIMULATING USER: ADDING EXPENSE ---");
        // Open add expense modal
        if (window.App && window.App.showAddExpenseModal) window.App.showAddExpenseModal();
        document.getElementById('expenseTitle').value = "Dinner";
        document.getElementById('expenseAmount').value = "100";
        document.getElementById('expensePayer').value = "Alice";
        
        // Ensure checkboxes exist in modal
        const checkboxes = document.querySelectorAll('.split-member-checkbox');
        console.log(`Found ${checkboxes.length} member checkboxes in expense modal.`);
        checkboxes.forEach(cb => cb.checked = true);
        
        document.getElementById('addExpenseForm').dispatchEvent(new window.Event('submit', { cancelable: true }));

        setTimeout(() => {
          console.log("--- FINAL DOM CHECK ---");
          const balances = document.querySelectorAll('.balance-positive, .balance-negative');
          console.log(`Rendered ${balances.length} balance entries.`);
          if (balances.length > 0) {
             console.log("SUCCESS: Balances rendered on screen.");
          } else {
             console.log("FAIL: No balances rendered.");
          }
        }, 1000);
      }, 1000);
    }, 1000);
  } catch(e) {
    console.error("Simulation crashed:", e);
  }
}, 3000);
