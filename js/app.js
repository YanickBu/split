const App = {
  currentGroupId: null,
  lastExpenseCurrency: null,
  lastExpensePayer: null,
  
  async init() {
    this.registerServiceWorker();
    await Currency.fetchRates();
    this.setupRoutes();
    this.setupListeners();
    this.setupOnlineSync();
    await this.render();
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration skipped:', err));
    }
  },

  setupRoutes() {
    window.addEventListener('hashchange', () => this.render());
  },

  setupOnlineSync() {
    window.addEventListener('online', () => {
      console.log("[App] Device back online! Replaying queued local deltas and resolving exchange rates...");
      this.syncOnline();
    });
  },

  async syncOnline() {
    await Currency.fetchRates();
    let updatedPending = false;

    // Resolve any offline pending exchange rates across all groups
    Object.values(State.data.groups).forEach(group => {
      group.events.forEach(async evt => {
        if (evt.type === 'ADD_EXPENSE' && evt.data && evt.data.isPendingRate) {
          const dateStr = evt.data.expenseDate || new Date(evt.ts).toISOString().split('T')[0];
          const conv = await Currency.convertWithDate(evt.data.originalAmount, evt.data.originalCurrency, group.currency, dateStr);
          if (!conv.isPending) {
            evt.data.groupAmount = conv.amount;
            evt.data.isPendingRate = false;
            evt.data.rateSnapshot = Currency.rates;
            updatedPending = true;
          }
        }
      });
    });

    // Upload & replay unsynced local deltas across all groups
    for (const group of Object.values(State.data.groups)) {
      const pendingDeltas = group.pendingDeltas || [];
      if (pendingDeltas.length > 0) {
        for (const evtHash of [...pendingDeltas]) {
          const evt = group.events.find(e => (e.hash === evtHash || e.id === evtHash));
          if (evt) {
            const pubOk = await EventSourcing.publish(group.id, evt);
            if (pubOk) {
              State.resolvePendingDelta(group.id, evtHash);
              State.resolvePendingDelta(group.id, evt.id);
              State.resolvePendingDelta(group.id, evt.hash);
              updatedPending = true;
            }
          }
        }
        await JSONBin.sync(group);
      }
    }

    if (updatedPending) {
      State.save();
    }

    this.render();
  },

  async publishAndSync(groupId, evt) {
    if (!groupId || !evt) return;
    const group = State.getGroup(groupId);
    
    // Attempt publish to real-time pubsub stream
    const pubOk = await EventSourcing.publish(groupId, evt);
    
    // Attempt sync to cloud storage
    const binOk = await JSONBin.sync(group);

    // If successfully delivered to cloud, mark event as synced immediately
    if (pubOk || binOk) {
      State.resolvePendingDelta(groupId, evt.hash);
      State.resolvePendingDelta(groupId, evt.id);
      if (this.currentGroupId === groupId) {
        this.render();
      }
    }

    // Also trigger cloud reconciliation in background
    this.syncGroupFromCloud(groupId);
  },

  async syncGroupFromCloud(groupId) {
    if (!groupId) return;
    try {
      const history = await JSONBin.fetchGroupHistory(groupId);
      if (history && history.length > 0) {
        let group = State.getGroup(groupId);
        let updated = false;

        if (!group) {
          const initEvt = history.find(e => e.type === 'INIT');
          if (initEvt && initEvt.data) {
            State.data.groups[groupId] = {
              id: groupId,
              name: initEvt.data.name || 'Shared Group',
              currency: initEvt.data.currency || 'USD',
              members: [initEvt.data.creator || 'Member'],
              events: [],
              pendingDeltas: []
            };
            group = State.getGroup(groupId);
          }
        }

        if (group) {
          history.forEach(remoteEvt => {
            const hashKey = remoteEvt.hash || remoteEvt.id;
            
            // 1. If cloud history contains a hash from our local pendingDeltas, resolve it!
            if (group.pendingDeltas && (group.pendingDeltas.includes(hashKey) || group.pendingDeltas.includes(remoteEvt.id) || group.pendingDeltas.includes(remoteEvt.hash))) {
              State.resolvePendingDelta(groupId, hashKey);
              State.resolvePendingDelta(groupId, remoteEvt.id);
              State.resolvePendingDelta(groupId, remoteEvt.hash);
              updated = true;
            }

            // 2. If cloud history contains a new event not in local events, merge it!
            const exists = group.events.some(e => (e.hash === hashKey || e.id === hashKey));
            if (!exists && remoteEvt.type) {
              remoteEvt.synced = true;
              group.events.push(remoteEvt);
              updated = true;
            }
          });

          if (updated) {
            State.rehydrate(groupId);
            State.save();
            if (this.currentGroupId === groupId) {
              this.render();
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[App] Could not invalidate/sync cloud history for ${groupId}:`, err);
    }
  },

  handleLiveEvent(evt) {
    if (!this.currentGroupId || !evt) return;
    const group = State.getGroup(this.currentGroupId);
    if (!group) return;

    // Handle snapshot sync wrapper
    if (evt.type === 'SNAPSHOT_SYNC' && evt.groupState && evt.groupState.events) {
      let addedAny = false;
      evt.groupState.events.forEach(remoteEvt => {
        const hashKey = remoteEvt.hash || remoteEvt.id;
        if (group.pendingDeltas && group.pendingDeltas.includes(hashKey)) {
          State.resolvePendingDelta(this.currentGroupId, hashKey);
          addedAny = true;
        }
        const exists = group.events.some(e => (e.hash === hashKey || e.id === hashKey));
        if (!exists && remoteEvt.type) {
          remoteEvt.synced = true;
          group.events.push(remoteEvt);
          addedAny = true;
        }
      });
      if (addedAny) {
        State.rehydrate(this.currentGroupId);
        State.save();
        this.render();
      }
      return;
    }

    // Handle regular transaction event
    const evtHash = evt.hash || evt.id;
    if (group.pendingDeltas && (group.pendingDeltas.includes(evtHash) || group.pendingDeltas.includes(evt.id) || group.pendingDeltas.includes(evt.hash))) {
      State.resolvePendingDelta(this.currentGroupId, evtHash);
      State.resolvePendingDelta(this.currentGroupId, evt.id);
      State.resolvePendingDelta(this.currentGroupId, evt.hash);
    }

    const existing = group.events.find(e => (e.hash === evtHash || e.id === evtHash));
    if (!existing && evt.type) {
      evt.synced = true;
      group.events.push(evt);
      State.processEvent(group, evt);
      State.save();
      this.render();
    }
  },
  
  setupListeners() {
    // New Group Form
    document.getElementById('newGroupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('groupName').value;
      const currency = document.getElementById('groupCurrency').value;
      const creator = document.getElementById('creatorName').value;
      
      const id = State.createGroup(name, currency, creator);
      const group = State.getGroup(id);

      document.getElementById('newGroupModal').close();
      e.target.reset();
      window.location.hash = `group=${id}`;
      
      await this.publishAndSync(id, group.events[0]);
    });
    
    // Add Member Form
    document.getElementById('addMemberForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('memberName').value;
      if (this.currentGroupId && name) {
        const evt = State.appendEvent(this.currentGroupId, 'ADD_MEMBER', { name });
        document.getElementById('addMemberModal').close();
        e.target.reset();
        this.render();

        await this.publishAndSync(this.currentGroupId, evt);
      } else {
        document.getElementById('addMemberModal').close();
        e.target.reset();
      }
    });
    
    // Add Expense Form
    document.getElementById('addExpenseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.currentGroupId) return;
      
      const title = document.getElementById('expenseTitle').value;
      const amountStr = document.getElementById('expenseAmount').value;
      const amount = parseFloat(amountStr.replace(/,/g, '.'));
      const currency = document.getElementById('expenseCurrency').value;
      const payer = document.getElementById('expensePayer').value;
      const expenseDate = document.getElementById('expenseDate').value || new Date().toISOString().split('T')[0];

      // Subgroup member selection
      const activeMemberChips = document.querySelectorAll('#expenseSplitMembers .member-split-chip.active');
      let splitMembers = Array.from(activeMemberChips).map(c => c.getAttribute('data-member'));
      
      const group = State.getGroup(this.currentGroupId);
      if (splitMembers.length === 0) {
        splitMembers = group.members;
      }
      
      if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid positive amount");
        return;
      }
      
      // Save last selected currency and payer for future expenses
      if (currency) {
        this.lastExpenseCurrency = currency;
        try {
          localStorage.setItem('split_last_expense_currency_' + this.currentGroupId, currency);
          localStorage.setItem('split_last_expense_currency', currency);
        } catch (err) {}
      }

      if (payer) {
        this.lastExpensePayer = payer;
        try {
          localStorage.setItem('split_last_expense_payer_' + this.currentGroupId, payer);
        } catch (err) {}
      }
      
      // Convert currency using historical rate for selected expense date
      const conv = await Currency.convertWithDate(amount, currency, group.currency, expenseDate);
      
      const evt = State.appendEvent(this.currentGroupId, 'ADD_EXPENSE', {
        title,
        originalAmount: amount,
        originalCurrency: currency,
        groupAmount: conv.amount,
        isPendingRate: conv.isPending,
        payer,
        expenseDate,
        splitMembers,
        rateSnapshot: Currency.rates
      });

      document.getElementById('addExpenseModal').close();
      e.target.reset();
      this.render();
      
      await this.publishAndSync(this.currentGroupId, evt);
    });
    
    // Quick Chips
    document.querySelectorAll('#quickCategoryChips .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('expenseTitle').value = chip.innerText;
      });
    });
    
    document.querySelectorAll('#quickAmountChips .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('expenseAmount').value = chip.innerText;
      });
    });
  },
  
  openGroup(id) {
    window.location.hash = `group=${id}`;
  },
  
  goHome() {
    EventSourcing.unsubscribe();
    window.location.hash = '';
  },
  
  showNewGroup() {
    CurrencyPicker.setButtonValue('groupCurrency', 'groupCurrencyBtn', 'USD');
    document.getElementById('newGroupModal').showModal();
  },
  
  showAddMember() {
    document.getElementById('addMemberModal').showModal();
  },
  
  async removeMember(name) {
    const group = State.getGroup(this.currentGroupId);
    if (group && group.members.length <= 1) {
      alert("Groups must have at least 1 member.");
      return;
    }

    if (confirm(`Remove ${name}?`)) {
      const evt = State.appendEvent(this.currentGroupId, 'REMOVE_MEMBER', { name });
      this.render();
      await this.publishAndSync(this.currentGroupId, evt);
    }
  },
  
  showAddExpense() {
    const group = State.getGroup(this.currentGroupId);

    // Default expense date to today's date YYYY-MM-DD
    const dateInput = document.getElementById('expenseDate');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Preselect last currency used
    let defaultCurr = group.currency || 'USD';
    try {
      const savedGroupCurr = localStorage.getItem('split_last_expense_currency_' + this.currentGroupId);
      const savedGlobalCurr = localStorage.getItem('split_last_expense_currency');
      defaultCurr = savedGroupCurr || this.lastExpenseCurrency || savedGlobalCurr || group.currency || 'USD';
    } catch (err) {}
    
    CurrencyPicker.setButtonValue('expenseCurrency', 'expenseCurrencyBtn', defaultCurr);

    // Preselect last payer used
    let defaultPayer = null;
    try {
      defaultPayer = localStorage.getItem('split_last_expense_payer_' + this.currentGroupId) || this.lastExpensePayer;
    } catch (err) {}

    if (!defaultPayer || !group.members.includes(defaultPayer)) {
      defaultPayer = group.members[0];
    }
    
    const selPayer = document.getElementById('expensePayer');
    selPayer.innerHTML = group.members.map(m => 
      `<option value="${m}" ${m === defaultPayer ? 'selected' : ''}>${m}</option>`
    ).join('');

    // Render Subgroup member split toggle chips
    const splitContainer = document.getElementById('expenseSplitMembers');
    if (splitContainer) {
      splitContainer.innerHTML = group.members.map(m => 
        `<button type="button" class="chip member-split-chip active" data-member="${m}">✓ ${m}</button>`
      ).join('');

      splitContainer.querySelectorAll('.member-split-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const isActive = chip.classList.contains('active');
          const activeChips = splitContainer.querySelectorAll('.member-split-chip.active');
          // Keep at least 1 member selected
          if (isActive && activeChips.length <= 1) return;
          
          if (isActive) {
            chip.classList.remove('active');
            chip.innerText = `${chip.getAttribute('data-member')}`;
          } else {
            chip.classList.add('active');
            chip.innerText = `✓ ${chip.getAttribute('data-member')}`;
          }
        });
      });
    }
    
    document.getElementById('addExpenseModal').showModal();
  },
  
  async stornoExpense(expenseId) {
    if (confirm("Void this expense?")) {
      const evt = State.appendEvent(this.currentGroupId, 'STORNO_EXPENSE', { expenseId });
      this.render();
      await this.publishAndSync(this.currentGroupId, evt);
    }
  },
  
  async settleUp() {
    if (confirm("Mark all debts as settled?")) {
      const evt = State.appendEvent(this.currentGroupId, 'SETTLE_UP', { ts: Date.now() });
      await this.publishAndSync(this.currentGroupId, evt);

      const group = State.getGroup(this.currentGroupId);
      for (const e of group.events) {
        if (e.type === 'ADD_EXPENSE') {
          const stornoEvt = State.appendEvent(this.currentGroupId, 'STORNO_EXPENSE', { expenseId: e.id });
          await this.publishAndSync(this.currentGroupId, stornoEvt);
        }
      }
      this.render();
      alert("All squared up!");
    }
  },
  
  deleteGroup() {
    if (confirm("Permanently delete this group?")) {
      EventSourcing.unsubscribe();
      State.deleteGroup(this.currentGroupId);
      this.goHome();
    }
  },

  showQRCode() {
    if (!this.currentGroupId) return;
    const url = window.location.href;
    const svg = QRCode.generateSVG(url, 220);
    const container = document.getElementById('qrCodeContainer');
    if (container) {
      container.innerHTML = svg;
    }
    const modal = document.getElementById('qrModal');
    if (modal) {
      modal.showModal();
    }
  },
  
  async shareSummary() {
    const group = State.getGroup(this.currentGroupId);
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
      } catch (e) {
        this.copyToClipboard(summary);
      }
    } else {
      this.copyToClipboard(summary);
    }
  },
  
  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => alert("Summary copied to clipboard!"));
  },

  exportCSV(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!this.currentGroupId) return;
    const group = State.getGroup(this.currentGroupId);
    if (!group) return;

    const stornoIds = new Set(
      group.events.filter(evt => evt.type === 'STORNO_EXPENSE').map(evt => evt.data && evt.data.expenseId)
    );

    const expenses = group.events.filter(evt => evt.type === 'ADD_EXPENSE');
    
    if (expenses.length === 0) {
      alert("No expenses to export.");
      return;
    }

    const headers = ["ID", "Date", "Title", "Payer", "Split Members", "Original Amount", "Original Currency", "Group Amount", "Group Currency", "Status"];
    
    const rows = expenses.map(evt => {
      const evtId = evt.hash || evt.id;
      const isStorno = stornoIds.has(evt.id) || stornoIds.has(evt.hash) || stornoIds.has(evtId);
      const isPendingRate = evt.data.isPendingRate;
      
      const status = isStorno ? 'Voided' : (isPendingRate ? 'Pending Rate' : 'Active');
      const dateStr = evt.data.expenseDate || new Date(evt.ts).toISOString().split('T')[0];
      const titleEsc = `"${(evt.data.title || '').replace(/"/g, '""')}"`;
      const payerEsc = `"${(evt.data.payer || '').replace(/"/g, '""')}"`;
      const splitStr = `"${(evt.data.splitMembers || group.members).join(', ').replace(/"/g, '""')}"`;
      
      return [
        evtId,
        dateStr,
        titleEsc,
        payerEsc,
        splitStr,
        evt.data.originalAmount || 0,
        evt.data.originalCurrency || group.currency,
        evt.data.groupAmount || 0,
        group.currency,
        status
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const safeName = (group.name || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeName}_expenses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
  
  async render() {
    const appEl = document.getElementById('app');
    const hash = window.location.hash;
    
    if (hash.startsWith('#group=')) {
      this.currentGroupId = hash.split('=')[1];
      let group = State.getGroup(this.currentGroupId);

      // Always trigger asynchronous cloud history sync to invalidate/update localStorage with new cloud entries
      this.syncGroupFromCloud(this.currentGroupId);

      if (!group) {
        // Render loading placeholder while initial cloud fetch occurs
        appEl.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-dim);">Connecting to group cloud ledger...</div>`;
        return;
      }

      // Subscribe to real-time live SSE stream for this group
      EventSourcing.subscribe(this.currentGroupId, (evt) => this.handleLiveEvent(evt));
      
      appEl.innerHTML = `
        <header>
          <div style="display:flex; align-items:center; gap:12px;">
            <button onclick="App.goHome()" class="btn-icon">←</button>
            <h1>${group.name}</h1>
          </div>
          <div class="header-actions">
            <button onclick="App.showQRCode()" class="btn-icon" title="Show QR Code">📱 QR</button>
            <button onclick="App.shareSummary()" class="btn-icon">📤 Share</button>
            <button onclick="App.deleteGroup()" class="btn-icon" style="color:var(--danger)">🗑️</button>
          </div>
        </header>
        <main>
          ${Components.renderGroupDashboard(group)}
        </main>
        <button class="fab btn-primary" onclick="App.showAddExpense()">💰</button>
      `;
    } else {
      EventSourcing.unsubscribe();
      this.currentGroupId = null;
      appEl.innerHTML = `
        <header>
          <h1>Split</h1>
          <button onclick="App.showNewGroup()" class="btn-primary">+ New Group</button>
        </header>
        <main>
          ${Components.renderGroupsList(State.data.groups)}
        </main>
      `;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
