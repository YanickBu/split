const Components = {
  renderGroupsList(groups) {
    const list = Object.values(groups);
    if (list.length === 0) {
      return `<div class="empty-state">No groups yet. Create one to get started!</div>`;
    }
    
    return `<div class="group-list">
      ${list.map(g => `
        <div class="card clickable group-item" onclick="App.openGroup('${g.id}')">
          <div class="group-info">
            <h3>${g.name}</h3>
            <p>${g.members.length} members • ${g.currency}</p>
          </div>
          <div class="group-arrow">→</div>
        </div>
      `).join('')}
    </div>`;
  },

  renderGroupDashboard(group) {
    const balances = Settlement.calculateBalances(group);
    const settlements = Settlement.calculateSettlements(balances);
    
    // Sort expenses newest first
    const expenses = group.events
      .filter(e => e.type === 'ADD_EXPENSE')
      .sort((a, b) => b.ts - a.ts);
      
    // Find stornoed
    const stornoIds = new Set(
      group.events.filter(e => e.type === 'STORNO_EXPENSE').map(e => e.data && e.data.expenseId)
    );
    
    let html = `
      <div class="card">
        <div class="section-title">Members</div>
        <div class="members-list">
          ${group.members.map(m => `
            <div class="member-chip">
              👤 ${m}
              <span class="member-remove" onclick="App.removeMember('${m}')">×</span>
            </div>
          `).join('')}
          <button class="btn-icon" onclick="App.showAddMember()">+ Add</button>
        </div>
      </div>
      
      <div class="card">
        <div class="section-title">Settlements</div>
        ${settlements.length === 0 ? '<div class="empty-state" style="padding:10px">All settled up! 🍻</div>' : `
          <div class="balances-list">
            ${settlements.map(s => `
              <div class="balance-item">
                <span>${s.from} ➡️ ${s.to}</span>
                <span class="balance-positive">${Currency.format(s.amount, group.currency)}</span>
              </div>
            `).join('')}
            <button class="btn-primary" style="margin-top: 12px; width: 100%" onclick="App.settleUp()">🤝 Settle Up</button>
          </div>
        `}
      </div>
      
      <div class="card">
        <div class="section-title">Expenses</div>
        ${expenses.length === 0 ? '<div class="empty-state" style="padding:10px">No expenses yet.</div>' : `
          <div class="expenses-list">
            ${expenses.map(e => {
              const evtId = e.hash || e.id;
              const isStorno = stornoIds.has(e.id) || stornoIds.has(e.hash) || stornoIds.has(evtId);
              const origAmount = Currency.format(e.data.originalAmount, e.data.originalCurrency);
              const isDiffCurrency = e.data.originalCurrency !== group.currency;
              const isPendingRate = e.data.isPendingRate;
              const isUnsynced = e.synced === false;
              
              return `
              <div class="expense-item ${isStorno ? 'storno' : ''}">
                <div class="expense-info">
                  <h4 class="${isStorno ? 'strikethrough' : ''}">
                    ${e.data.title}
                    ${isUnsynced ? `<span class="pending-sync-badge">☁️ Unsynced</span>` : ''}
                  </h4>
                  <div class="expense-meta">${e.data.payer} • ${new Date(e.ts).toLocaleDateString()}</div>
                </div>
                <div class="expense-right">
                  <div class="expense-amounts ${isStorno ? 'strikethrough' : ''}">
                    ${isDiffCurrency ? `
                      <div class="expense-amount-primary">${isPendingRate ? '⏳ Rate pending' : `≈ ${Currency.format(e.data.groupAmount, group.currency)}`}</div>
                      <div class="expense-amount-secondary">${origAmount} ${e.data.originalCurrency}</div>
                    ` : `
                      <div class="expense-amount-primary">${origAmount}</div>
                    `}
                  </div>
                  ${!isStorno ? `
                    <button class="expense-void-btn" title="Void expense" onclick="App.stornoExpense('${evtId}')">✕</button>
                  ` : ''}
                </div>
              </div>
            `}).join('')}
          </div>
        `}
      </div>
    `;
    
    return html;
  }
};
