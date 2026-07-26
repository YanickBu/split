const App = {
  currentGroupId: null,
  lastExpenseCurrency: null,
  
  async init() {
    await Currency.fetchRates();
    this.setupRoutes();
    this.setupListeners();
    this.setupOnlineSync();
    await this.render();
  },

  setupRoutes() {
    window.addEventListener('hashchange', () => this.render());
  },

  setupOnlineSync() {
    window.addEventListener('online', () => {
      console.log("[App] Device back online! Replaying queued messages and resolving exchange rates...");
      this.syncOnline();
    });
  },

  async syncOnline() {
    await Currency.fetchRates();
    let updatedPending = false;

    // Resolve any offline pending exchange rates across all groups
    Object.values(State.data.groups).forEach(group => {
      group.events.forEach(evt => {
        if (evt.type === 'ADD_EXPENSE' && evt.data && evt.data.isPendingRate) {
          const conv = Currency.convertWithStatus(evt.data.originalAmount, evt.data.originalCurrency, group.currency);
          if (!conv.isPending) {
            evt.data.groupAmount = conv.amount;
            evt.data.isPendingRate = false;
            evt.data.rateSnapshot = Currency.rates;
            updatedPending = true;
          }
        }
      });
    });

    // Upload & replay unsynced events across all groups
    for (const group of Object.values(State.data.groups)) {
      const unsynced = State.getUnsyncedEvents(group.id);
      if (unsynced.length > 0) {
        for (const evt of unsynced) {
          const pubOk = await EventSourcing.publish(group.id, evt);
          if (pubOk) {
            State.markEventSynced(group.id, evt.hash || evt.id);
            updatedPending = true;
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

    // If successfully delivered to cloud, mark event as synced
    if (pubOk || binOk) {
      State.markEventSynced(groupId, evt.hash || evt.id);
    }
  },

  async syncGroupFromCloud(groupId) {
    if (!groupId) return;
    try {
      const history = await JSONBin.fetchGroupHistory(groupId);
      if (history && history.length > 0) {
        let group = State.getGroup(groupId);
        let addedNew = false;

        if (!group) {
          const initEvt = history.find(e => e.type === 'INIT');
          if (initEvt && initEvt.data) {
            State.data.groups[groupId] = {
              id: groupId,
              name: initEvt.data.name || 'Shared Group',
              currency: initEvt.data.currency || 'USD',
              members: [initEvt.data.creator || 'Member'],
              events: []
            };
            group = State.getGroup(groupId);
          }
        }

        if (group) {
          history.forEach(remoteEvt => {
            const hashKey = remoteEvt.hash || remoteEvt.id;
            const exists = group.events.some(e => (e.hash === hashKey || e.id === hashKey));
            if (!exists && remoteEvt.type) {
              remoteEvt.synced = true;
              group.events.push(remoteEvt);
              addedNew = true;
            }
          });

          if (addedNew) {
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
      
      await this.publishAndSync(id, group.events[0]);

      document.getElementById('newGroupModal').close();
      e.target.reset();
      window.location.hash = `group=${id}`;
    });
    
    // Add Member Form
    document.getElementById('addMemberForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('memberName').value;
      if (this.currentGroupId && name) {
        const evt = State.appendEvent(this.currentGroupId, 'ADD_MEMBER', { name });
        await this.publishAndSync(this.currentGroupId, evt);
      }
      document.getElementById('addMemberModal').close();
      e.target.reset();
      this.render();
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
      
      if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid positive amount");
        return;
      }
      
      // Save last selected currency for future expenses
      if (currency) {
        this.lastExpenseCurrency = currency;
        try {
          localStorage.setItem('split_last_expense_currency_' + this.currentGroupId, currency);
          localStorage.setItem('split_last_expense_currency', currency);
        } catch (err) {}
      }
      
      const group = State.getGroup(this.currentGroupId);
      const conv = Currency.convertWithStatus(amount, currency, group.currency);
      
      const evt = State.appendEvent(this.currentGroupId, 'ADD_EXPENSE', {
        title,
        originalAmount: amount,
        originalCurrency: currency,
        groupAmount: conv.amount,
        isPendingRate: conv.isPending,
        payer,
        rateSnapshot: Currency.rates
      });
      
      await this.publishAndSync(this.currentGroupId, evt);
      
      document.getElementById('addExpenseModal').close();
      e.target.reset();
      this.render();
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
      await this.publishAndSync(this.currentGroupId, evt);
      this.render();
    }
  },
  
  showAddExpense() {
    const group = State.getGroup(this.currentGroupId);
    
    let defaultCurr = group.currency || 'USD';
    try {
      const savedGroupCurr = localStorage.getItem('split_last_expense_currency_' + this.currentGroupId);
      const savedGlobalCurr = localStorage.getItem('split_last_expense_currency');
      defaultCurr = savedGroupCurr || this.lastExpenseCurrency || savedGlobalCurr || group.currency || 'USD';
    } catch (err) {}
    
    CurrencyPicker.setButtonValue('expenseCurrency', 'expenseCurrencyBtn', defaultCurr);
    
    const selPayer = document.getElementById('expensePayer');
    selPayer.innerHTML = group.members.map(m => `<option value="${m}">${m}</option>`).join('');
    
    document.getElementById('addExpenseModal').showModal();
  },
  
  async stornoExpense(expenseId) {
    if (confirm("Void this expense?")) {
      const evt = State.appendEvent(this.currentGroupId, 'STORNO_EXPENSE', { expenseId });
      await this.publishAndSync(this.currentGroupId, evt);
      this.render();
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
