const fs = require('fs');

// Dummy State
const State = {
  data: { groups: {} },
  getGroup: function(id) { return this.data.groups[id]; },
  appendEvent: function(id, type, data) {
    if (!this.data.groups[id]) return;
    this.data.groups[id].events.push({ type, data });
  }
};

// Dummy Currency
const Currency = {
  rates: {},
  fetchRates: async function() { return true; },
  convertWithDate: async function(amount) { return { amount, isPending: false }; }
};

// Dummy App Context
const App = {
  currentGroupId: 'test_group',
  publishAndSync: async function() {},
  syncOnline: function() {},
  render: function() {},
  importCSV: function() {
    let group = State.getGroup(this.currentGroupId);
    
    // Create missing group
    if (!group) {
      State.data.groups[this.currentGroupId] = {
        id: this.currentGroupId,
        name: 'Recovered Group',
        currency: 'USD',
        members: ['Me'],
        events: [],
        pendingDeltas: []
      };
      group = State.getGroup(this.currentGroupId);
    }
    
    // Dummy file read
    const text = `ID,Date,Title,Payer,Split Members,Original Amount,Original Currency,Group Amount,Group Currency,Status
ev_1,2026-08-28,Pizza,Alice,"Alice, Bob",20,USD,20,USD,Active
`;
    
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return console.log("Empty CSV");

    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const hMap = {};
    headers.forEach((h, i) => hMap[h.trim().toLowerCase()] = i);

    const requiredHeaders = ["date", "title", "payer", "original amount", "original currency"];
    const missing = requiredHeaders.filter(h => hMap[h] === undefined);
    if (missing.length > 0) {
      console.log(`Missing columns: ${missing.join(', ')}`);
      return;
    }

    Currency.fetchRates().then(async () => {
      let importedCount = 0;
      let errorsCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const row = parseCSVLine(line);
        const date = row[hMap["date"]];
        const title = row[hMap["title"]];
        const payer = row[hMap["payer"]];
        const origAmtStr = row[hMap["original amount"]];
        const origCurr = row[hMap["original currency"]] || group.currency;
        const splitMembersStr = row[hMap["split members"]] || '';

        const amount = parseFloat(origAmtStr.replace(/,/g, '.'));
        if (!date || !title || !payer || isNaN(amount) || amount <= 0) {
          errorsCount++;
          continue;
        }

        if (!group.members.includes(payer)) {
          State.appendEvent(this.currentGroupId, 'ADD_MEMBER', { name: payer });
        }
        
        let splitMembers = group.members;
        if (splitMembersStr) {
          splitMembers = splitMembersStr.split(',').map(m => m.trim().replace(/^"|"$/g, '')).filter(m => m.length > 0);
          for (const member of splitMembers) {
            if (!group.members.includes(member)) {
              State.appendEvent(this.currentGroupId, 'ADD_MEMBER', { name: member });
            }
          }
        }

        const conv = await Currency.convertWithDate(amount, origCurr, group.currency, date);
        State.appendEvent(this.currentGroupId, 'ADD_EXPENSE', {
          title, originalAmount: amount, originalCurrency: origCurr, groupAmount: conv.amount, payer
        });
        importedCount++;
      }
      console.log(`Imported: ${importedCount}, Errors: ${errorsCount}`);
    });
  }
};

App.importCSV();
