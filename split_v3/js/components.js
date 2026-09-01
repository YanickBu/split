import Settlement from "./settlement.js";
import Currency from "./currency.js";

const Components = {
  renderHome(_state) {
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

  _esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  getCategoryEmoji(title) {
    if (!title) return "💸";
    const t = title.toLowerCase();
    if (
      t.includes("pizza") ||
      t.includes("food") ||
      t.includes("dinner") ||
      t.includes("lunch") ||
      t.includes("eat") ||
      t.includes("restaurant") ||
      t.includes("burger") ||
      t.includes("sushi")
    )
      return "🍕";
    if (
      t.includes("coffee") ||
      t.includes("cafe") ||
      t.includes("starbucks") ||
      t.includes("tea") ||
      t.includes("snack") ||
      t.includes("espresso")
    )
      return "☕";
    if (
      t.includes("beer") ||
      t.includes("drink") ||
      t.includes("bar") ||
      t.includes("cocktail") ||
      t.includes("wine") ||
      t.includes("pub") ||
      t.includes("alcohol")
    )
      return "🍺";
    if (
      t.includes("uber") ||
      t.includes("taxi") ||
      t.includes("cab") ||
      t.includes("ride") ||
      t.includes("bus") ||
      t.includes("train") ||
      t.includes("metro") ||
      t.includes("transit")
    )
      return "🚖";
    if (
      t.includes("grocery") ||
      t.includes("supermarket") ||
      t.includes("market") ||
      t.includes("groceries") ||
      t.includes("food shopping")
    )
      return "🛒";
    if (
      t.includes("rent") ||
      t.includes("airbnb") ||
      t.includes("hotel") ||
      t.includes("stay") ||
      t.includes("hostel") ||
      t.includes("booking")
    )
      return "🏠";
    if (
      t.includes("ticket") ||
      t.includes("movie") ||
      t.includes("cinema") ||
      t.includes("concert") ||
      t.includes("show") ||
      t.includes("game") ||
      t.includes("event")
    )
      return "🎟️";
    if (
      t.includes("flight") ||
      t.includes("plane") ||
      t.includes("airline") ||
      t.includes("fly")
    )
      return "✈️";
    if (
      t.includes("fuel") ||
      t.includes("gas") ||
      t.includes("petrol") ||
      t.includes("charging")
    )
      return "⛽";
    if (
      t.includes("shopping") ||
      t.includes("cloth") ||
      t.includes("shoes") ||
      t.includes("apparel")
    )
      return "🛍️";
    return "💸";
  },

  renderGroupsList(groups) {
    const list = Object.values(groups);
    if (list.length === 0) {
      return `<div class="empty-state">No groups yet. Create one to get started!</div>`;
    }

    return `<div class="group-list">
      ${list
        .map((g) => {
          const pendingCount = (g.pendingDeltas || []).length;
          return `
        <div class="card clickable group-item" data-action="openGroup" data-id="${this._esc(g.id)}">
          <div class="group-info">
            <h3>
              ${this._esc(g.name)}
              ${pendingCount > 0 ? `<span class="sync-badge pending">⏳ Pending</span>` : ""}
            </h3>
            <p>${g.members.length} members • ${this._esc(g.currency)}</p>
          </div>
          <div class="group-arrow">→</div>
        </div>
      `;
        })
        .join("")}
    </div>`;
  },

  renderGroupDashboard(group) {
    const balances = Settlement.calculateBalances(group);
    const settlements = Settlement.calculateSettlements(balances);

    // Sort expenses newest first
    const expenses = group.events
      .filter((e) => e.type === "ADD_EXPENSE")
      .sort((a, b) => b.ts - a.ts);

    // Find stornoed
    const stornoIds = new Set(
      group.events
        .filter((e) => e.type === "STORNO_EXPENSE")
        .map((e) => e.data && e.data.expenseId),
    );

    const pendingDeltas = group.pendingDeltas || [];

    let html = `
      <header>
        <div style="display:flex; align-items:center; gap:12px;">
          <button onclick="App.goHome()" class="btn-icon">←</button>
          <h1 id="groupTitleDisplay"></h1>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <span id="syncPill" class="sync-badge">Connecting...</span>
          <button class="btn-icon" onclick="document.getElementById('shareModal').showModal()">🔗</button>
        </div>
      </header>
      <main>
        <div class="card">
        <div class="section-title">Members</div>
        <div class="members-list">
          ${group.members
            .map(
              (m) => `
            <div class="member-chip">
              👤 ${this._esc(m)}
              <span class="member-remove" data-action="removeMember" data-member="${this._esc(m)}">×</span>
            </div>
          `,
            )
            .join("")}
          <button class="btn-icon" onclick="App.showAddMember()">+ Add</button>
        </div>
      </div>
      
      <div class="card">
        <div class="section-title">Settlements</div>
        ${
          settlements.length === 0
            ? '<div class="empty-state" style="padding:10px">All settled up! 🍻</div>'
            : `
          <div class="balances-list">
            ${settlements
              .map(
                (s) => `
              <div class="balance-item">
                <span>${this._esc(s.from)} ➡️ ${this._esc(s.to)}</span>
                <span class="balance-positive">${Currency.format(s.amount, group.currency)}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        `
        }
      </div>
      
      <div class="card">
        <div class="section-title">Expenses</div>
        ${
          expenses.length === 0
            ? '<div class="empty-state" style="padding:10px">No expenses yet. Tap 💰 to add one!</div>'
            : `
          <div class="expenses-list">
            ${expenses
              .map((e) => {
                const evtId = e.hash || e.id;
                const isStorno =
                  stornoIds.has(e.id) ||
                  stornoIds.has(e.hash) ||
                  stornoIds.has(evtId);
                const origAmount = Currency.format(
                  e.data.originalAmount,
                  e.data.originalCurrency,
                );
                const isDiffCurrency =
                  e.data.originalCurrency !== group.currency;
                const isPendingRate = e.data.isPendingRate;
                const isPendingDelta =
                  pendingDeltas.includes(evtId) ||
                  pendingDeltas.includes(e.hash) ||
                  pendingDeltas.includes(e.id);
                const strikethroughClass = isStorno ? "strikethrough" : "";
                const emoji = this.getCategoryEmoji(e.data.title);

                // Subgroup split details
                const splitMembers =
                  e.data.splitMembers && Array.isArray(e.data.splitMembers)
                    ? e.data.splitMembers
                    : group.members;
                const isSubgroup = splitMembers.length < group.members.length;
                const subgroupText = isSubgroup
                  ? ` • For ${splitMembers.map((m) => this._esc(m)).join(", ")}`
                  : "";
                const displayDate = e.data.expenseDate
                  ? new Date(
                      e.data.expenseDate + "T00:00:00",
                    ).toLocaleDateString()
                  : new Date(e.ts).toLocaleDateString();

                return `
              <div class="expense-item ${isStorno ? "storno" : ""}">
                <div class="expense-info">
                  <h4 class="${strikethroughClass}">
                    <span>${emoji} ${this._esc(e.data.title)}</span>
                    ${isPendingDelta ? `<span class="sync-badge pending">⏳ Pending</span>` : ""}
                  </h4>
                  <div class="expense-meta ${strikethroughClass}">${this._esc(e.data.payer)}${subgroupText} • ${displayDate}</div>
                </div>
                <div class="expense-right">
                  <div class="expense-amounts ${strikethroughClass}">
                    ${
                      isDiffCurrency
                        ? `
                      <div class="expense-amount-primary ${strikethroughClass}">${isPendingRate ? "⏳ Rate pending" : `≈ ${Currency.format(e.data.groupAmount, group.currency)}`}</div>
                      <div class="expense-amount-secondary ${strikethroughClass}">${origAmount} ${this._esc(e.data.originalCurrency)}</div>
                    `
                        : `
                      <div class="expense-amount-primary ${strikethroughClass}">${origAmount}</div>
                    `
                    }
                  </div>
                  ${
                    !isStorno
                      ? `
                    <button class="expense-void-btn" title="Void expense" data-action="stornoExpense" data-expense-id="${this._esc(evtId)}">✕</button>
                  `
                      : ""
                  }
                </div>
              </div>
            `;
              })
              .join("")}
          </div>
        `
        }
      </div>

      </main>
      <footer class="app-footer" style="display:flex; justify-content:center; gap:8px;">
        <a href="#" class="subtle-link" onclick="event.preventDefault(); window.print(); return false;">export pdf</a>
        <span style="color:var(--text-dim); opacity:0.3; font-size:11px;">•</span>
        <a href="#" class="subtle-link" onclick="event.preventDefault(); Export.exportCSV(window.App, event); return false;">export csv</a>
        <span style="color:var(--text-dim); opacity:0.3; font-size:11px;">•</span>
        <a href="#" class="subtle-link" onclick="event.preventDefault(); window.App.importCSV(event); return false;">import csv</a>
      </footer>
    `;

    return html;
  },
};

export default Components;
