function _escHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const App = {
  currentGroupId: null,
  lastExpenseCurrency: null,
  lastExpensePayer: null,
  _retryTimerId: null,
  
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
      console.log("[App] Device back online!");
      this._updateOfflinePill();
      this.syncOnline();
    });
    window.addEventListener('offline', () => {
      console.log("[App] Device went offline.");
      this._updateOfflinePill();
    });
  },

  _updateOfflinePill() {
    const pill = document.getElementById('offlinePill');
    if (pill) {
      pill.style.display = navigator.onLine ? 'none' : 'inline-flex';
    }
  },

  _startRetryLoop() {
    this._stopRetryLoop();
    this._retryTimerId = setInterval(() => {
      const group = this.currentGroupId ? State.getGroup(this.currentGroupId) : null;
      if (group && group.pendingDeltas && group.pendingDeltas.length > 0 && navigator.onLine) {
        console.log(`[App] Retry loop: ${group.pendingDeltas.length} pending, retrying...`);
        this.syncOnline();
      } else if (!group || !group.pendingDeltas || group.pendingDeltas.length === 0) {
        this._stopRetryLoop();
      }
    }, 20000);
  },

  _stopRetryLoop() {
    if (this._retryTimerId) {
      clearInterval(this._retryTimerId);
      this._retryTimerId = null;
    }
  },

  async syncOnline() {
    await Currency.fetchRates();
    let updatedPending = false;

    // Resolve any offline pending exchange rates across all groups (fixed: for..of instead of forEach)
    for (const group of Object.values(State.data.groups)) {
      for (const evt of group.events) {
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
      }
    }

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
        
        // If ntfy rate limited us, but jsonbin successfully saved the full snapshot, we can clear pending deltas
        const binSynced = await JSONBin.sync(group);
        if (binSynced && State.getGroup(group.id).pendingDeltas.length > 0) {
          State.clearAllPendingDeltas(group.id);
          updatedPending = true;
        }
      }
    }

    if (updatedPending) {
      State.save();
    }

    this._updateOfflinePill();
    if (this.currentGroupId) {
      this.render();
    }
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
    } else {
      // Failed to sync — start retry loop
      this._startRetryLoop();
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

        // If group doesn't exist locally, try to reconstruct it
        if (!group) {
          // Prefer snapshot data if available (contains full group state)
          if (history._snapshotGroup) {
            const snap = history._snapshotGroup;
            State.data.groups[groupId] = {
              id: groupId,
              name: snap.name || 'Shared Group',
              currency: snap.currency || 'USD',
              members: snap.members || ['Member'],
              events: [],
              pendingDeltas: []
            };
            group = State.getGroup(groupId);
            updated = true;
          } else {
            // Fall back to reconstructing from INIT event
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
        }

        if (group) {
          history.forEach(remoteEvt => {
            const hashKey = remoteEvt.hash || remoteEvt.id;
            
            if (group.pendingDeltas && (group.pendingDeltas.includes(hashKey) || group.pendingDeltas.includes(remoteEvt.id) || group.pendingDeltas.includes(remoteEvt.hash))) {
              State.resolvePendingDelta(groupId, hashKey);
              State.resolvePendingDelta(groupId, remoteEvt.id);
              State.resolvePendingDelta(groupId, remoteEvt.hash);
              updated = true;
            }

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
        } else {
          // We found events but couldn't reconstruct the group (missing INIT/snapshot)
          if (this.currentGroupId === groupId) {
            const appEl = document.getElementById('app');
            if (appEl) {
              appEl.innerHTML = `
                <header>
                  <div style="display:flex; align-items:center; gap:12px;">
                    <button onclick="App.goHome()" class="btn-icon">←</button>
                    <h1>Group Error</h1>
                  </div>
                </header>
                <main>
                  <div class="empty-state" style="padding: 40px 20px;">
                    <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
                    <div style="font-size: 15px; color: var(--text); margin-bottom: 6px;">Corrupted Cloud Ledger</div>
                    <div style="font-size: 13px; margin-bottom: 20px;">We found cloud data for this group, but the initial creation event is missing. This usually happens if the group was created by an older version of the app that failed to sync correctly.</div>
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                      <button onclick="event.preventDefault(); App.importCSV(event);" class="btn-secondary">📥 Recover from CSV</button>
                      <button onclick="event.preventDefault(); if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(reg=>reg.unregister()))}; caches.keys().then(k=>Promise.all(k.map(key=>caches.delete(key)))).then(()=>window.location.reload());" class="btn-primary" style="background:var(--danger)">🔄 Force Update App</button>
                    </div>
                  </div>
                </main>`;
            }
          }
        } else {
          // We found events but couldn't reconstruct the group (missing INIT/snapshot)
          if (this.currentGroupId === groupId) {
            const appEl = document.getElementById('app');
            if (appEl) {
              appEl.innerHTML = `
                <header>
                  <div style="display:flex; align-items:center; gap:12px;">
                    <button onclick="App.goHome()" class="btn-icon">←</button>
                    <h1>Group Error</h1>
                  </div>
                </header>
                <main>
                  <div class="empty-state" style="padding: 40px 20px;">
                    <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
                    <div style="font-size: 15px; color: var(--text); margin-bottom: 6px;">Corrupted Cloud Ledger</div>
                    <div style="font-size: 13px; margin-bottom: 20px;">We found cloud data for this group, but the initial creation event is missing. This usually happens if the group was created by an older version of the app that failed to sync correctly.</div>
                    <button onclick="event.preventDefault(); App.importCSV(event);" class="btn-secondary">📥 Recover from CSV</button>
                  </div>
                </main>`;
            }
          }
        }
      } else {
        // No cloud data found — update UI if group still doesn't exist locally
        if (!State.getGroup(groupId) && this.currentGroupId === groupId) {
          const appEl = document.getElementById('app');
          if (appEl) {
            appEl.innerHTML = `
              <header>
                <div style="display:flex; align-items:center; gap:12px;">
                  <button onclick="App.goHome()" class="btn-icon">←</button>
                  <h1>Group</h1>
                </div>
              </header>
              <main>
                <div class="empty-state" style="padding: 40px 20px;">
                  <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
                  <div style="font-size: 15px; color: var(--text); margin-bottom: 6px;">Group not found in cloud</div>
                  <div style="font-size: 13px; margin-bottom: 20px;">The cloud ledger for this group has expired or was never created. Ask the group owner to open the app so their data gets re-uploaded.</div>
                  <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="event.preventDefault(); App.syncGroupFromCloud('${groupId}');" class="btn-secondary">🔄 Retry</button>
                    <button onclick="event.preventDefault(); App.importCSV(event);" class="btn-secondary">📥 Recover from CSV</button>
                  </div>
                </div>
              </main>`;
          }
        }
      }
    } catch (err) {
      console.warn(`[App] Could not sync cloud history for ${groupId}:`, err);
    }
  },

  handleLiveEvent(evt) {
    if (!this.currentGroupId || !evt) return;
    const group = State.getGroup(this.currentGroupId);
    if (!group) return;

    // Handle ping sync (used when snapshot was too large for ntfy)
    if (evt.type === 'PING_SYNC') {
      this.syncGroupFromCloud(this.currentGroupId);
      return;
    }

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
    // Centralized event delegation for data-action attributes (XSS-safe: no user data in inline JS)
    document.getElementById('app').addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'openGroup') this.openGroup(target.dataset.id);
      else if (action === 'removeMember') this.removeMember(target.dataset.member);
      else if (action === 'stornoExpense') this.stornoExpense(target.dataset.expenseId);
    });

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
    this._stopRetryLoop();
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
      `<option value="${_escHTML(m)}" ${m === defaultPayer ? 'selected' : ''}>${_escHTML(m)}</option>`
    ).join('');

    // Render Subgroup member split toggle chips
    const splitContainer = document.getElementById('expenseSplitMembers');
    if (splitContainer) {
      splitContainer.innerHTML = group.members.map(m => 
        `<button type="button" class="chip member-split-chip active" data-member="${_escHTML(m)}">✓ ${_escHTML(m)}</button>`
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
      // Snapshot current expense IDs before looping to avoid mutating while iterating
      const expenseIds = group.events
        .filter(e => e.type === 'ADD_EXPENSE')
        .map(e => e.id || e.hash);
      for (const eid of expenseIds) {
        const stornoEvt = State.appendEvent(this.currentGroupId, 'STORNO_EXPENSE', { expenseId: eid });
        await this.publishAndSync(this.currentGroupId, stornoEvt);
      }
      this.render();
      alert("All squared up!");
    }
  },
  
  deleteGroup() {
    if (confirm("Permanently delete this group?")) {
      EventSourcing.unsubscribe();
      this._stopRetryLoop();
      State.deleteGroup(this.currentGroupId);
      this.goHome();
    }
  },

  showShareModal() {
    if (!this.currentGroupId) return;
    const url = window.location.href;
    const svg = QRCode.generateSVG(url, 220);
    const container = document.getElementById('qrCodeContainer');
    if (container) {
      container.innerHTML = svg;
    }
    const modal = document.getElementById('shareModal');
    if (modal) {
      modal.showModal();
    }
  },

  async shareUrl() {
    const url = window.location.href;
    const group = State.getGroup(this.currentGroupId);
    const title = group ? group.name : 'Split';
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: `Join ${title} on Split!`,
          url: url
        });
        return;
      } catch (e) {}
    }
    this.copyToClipboard(url, "Group link copied to clipboard!");
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
        return;
      } catch (e) {}
    }
    this.copyToClipboard(summary, "Summary copied to clipboard!");
  },
  
  copyToClipboard(text, msg = "Copied to clipboard!") {
    navigator.clipboard.writeText(text).then(() => alert(msg));
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

  importCSV(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!this.currentGroupId) return;
    let group = State.getGroup(this.currentGroupId);
    
    // Setup file input synchronously to prevent browser popup blockers
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async () => {
      // If the group is missing, create a placeholder so we can recover it
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
        State.appendEvent(this.currentGroupId, 'INIT', {
          name: 'Recovered Group',
          currency: 'USD',
          creator: 'RecoveryBot'
        });
      }
      const file = input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const text = reader.result;
        const lines = text.split(/\r\n|\n|\r/);
        if (lines.length < 2) {
          alert("CSV is empty or invalid.");
          return;
        }

        // Helper to parse CSV line respecting quotes
        const parseCSVLine = (line, delimiter = ',') => {
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
                } else if (char === delimiter && !inQuotes) {
                  result.push(current.trim());
                  current = '';
                } else {
                  current += char;
                }
              }
              result.push(current.trim());
              return result;
            };

            // Detect delimiter from first line
            const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
            const headers = parseCSVLine(lines[0], delimiter);
        // Map headers to indices
        const hMap = {};
        headers.forEach((h, i) => {
          hMap[h.trim().toLowerCase()] = i;
        });

        // Verify required columns exist
        const requiredHeaders = ["date", "title", "payer"];
        const missing = requiredHeaders.filter(h => hMap[h] === undefined);
        if (missing.length > 0) {
          alert(`Missing columns in CSV: ${missing.join(', ')}.\nRequired columns are: ${requiredHeaders.join(', ')}`);
          return;
        }

        let importedCount = 0;
        let errorsCount = 0;

        // Ensure we load current exchange rates first
        await Currency.fetchRates();

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;

          const row = parseCSVLine(line, delimiter);
          const date = row[hMap["date"]] || '';
          const title = row[hMap["title"]] || '';
          const payer = row[hMap["payer"]] || '';
          const origAmtStr = row[hMap["original amount"]] || row[hMap["amount"]] || "0";
          const origCurr = row[hMap["original currency"]] || row[hMap["currency"]] || group.currency;
          const splitMembersStr = row[hMap["split members"]] || '';

          const amount = parseFloat((origAmtStr || '').replace(/,/g, '.'));
          if (!date || !title || !payer || isNaN(amount) || amount <= 0) {
            errorsCount++;
            continue;
          }

          // 1. Auto-create payer if they don't exist
          if (!group.members.includes(payer)) {
            const evt = State.appendEvent(this.currentGroupId, 'ADD_MEMBER', { name: payer });
          }

          // 2. Parse split members
          let splitMembers = group.members;
          if (splitMembersStr) {
            splitMembers = splitMembersStr.split(',')
              .map(m => m.trim().replace(/^"|"$/g, ''))
              .filter(m => m.length > 0);
            
            // Auto-create any split members that don't exist
            for (const member of splitMembers) {
              if (!group.members.includes(member)) {
                const evt = State.appendEvent(this.currentGroupId, 'ADD_MEMBER', { name: member });
              }
            }
          }

          // 3. Convert Currency using historical rate
          const conv = await Currency.convertWithDate(amount, origCurr, group.currency, date);

          // 4. Create and publish the expense event
          const evt = State.appendEvent(this.currentGroupId, 'ADD_EXPENSE', {
            title,
            originalAmount: amount,
            originalCurrency: origCurr,
            groupAmount: conv.amount,
            isPendingRate: conv.isPending,
            payer,
            expenseDate: date,
            splitMembers,
            rateSnapshot: Currency.rates
          });

          importedCount++;
        }

        this.render();
        this.syncOnline();
        document.body.removeChild(input);
        alert(`Import completed!\nSuccessfully imported: ${importedCount} expenses.\nSkipped/failed: ${errorsCount} rows.`);
      };

      reader.readAsText(file);
    };

    input.click();
  },
  
  async render() {
    const appEl = document.getElementById('app');
    const hash = window.location.hash;
    
    if (hash.startsWith('#group=')) {
      this.currentGroupId = hash.split('=')[1];
      let group = State.getGroup(this.currentGroupId);

      // Always trigger asynchronous cloud history sync
      this.syncGroupFromCloud(this.currentGroupId);

      if (!group) {
        // Friendly offline message for new group links
        if (!navigator.onLine) {
          appEl.innerHTML = `
            <header>
              <div style="display:flex; align-items:center; gap:12px;">
                <button onclick="App.goHome()" class="btn-icon">←</button>
                <h1>Group</h1>
              </div>
            </header>
            <main>
              <div class="empty-state" style="padding: 40px 20px;">
                <div style="font-size: 32px; margin-bottom: 12px;">📴</div>
                <div style="font-size: 15px; color: var(--text); margin-bottom: 6px;">You're offline</div>
                <div style="font-size: 13px;">Reconnect to the internet to load this group for the first time.</div>
              </div>
            </main>`;
        } else {
          appEl.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-dim);">
              <p style="margin-bottom: 20px;">Connecting to group cloud ledger...</p>
              <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px;">
                <button onclick="event.preventDefault(); App.importCSV(event);" class="btn-secondary">Recover from CSV</button>
              </div>
            </div>
          `;
        }
        return;
      }

      // Automatically retry syncing any un-uploaded local pendingDeltas for this group
      if (group.pendingDeltas && group.pendingDeltas.length > 0) {
        this.syncOnline();
        this._startRetryLoop();
      } else {
        this._stopRetryLoop();
      }

      // Proactively re-upload snapshot so other browsers can find this group
      // (ntfy.sh messages expire after ~12h, so we refresh on every page load)
      JSONBin.sync(group);

      // Subscribe to real-time live SSE stream for this group
      EventSourcing.subscribe(this.currentGroupId, (evt) => this.handleLiveEvent(evt));

      const offlinePillHtml = !navigator.onLine
        ? '<span id="offlinePill" class="offline-pill">📡 Offline</span>'
        : '<span id="offlinePill" class="offline-pill" style="display:none">📡 Offline</span>';
      
      appEl.innerHTML = `
        <header>
          <div style="display:flex; align-items:center; gap:12px;">
            <button onclick="App.goHome()" class="btn-icon">←</button>
            <h1>${_escHTML(group.name)}</h1>
            ${offlinePillHtml}
          </div>
          <div class="header-actions">
            <button onclick="App.showShareModal()" class="btn-icon">📤 Share</button>
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
      this._stopRetryLoop();
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
