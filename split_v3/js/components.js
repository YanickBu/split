import Settlement from "./settlement.js";
import Currency from "./currency.js";

const Components = {
  renderHome({ recentGroups = [] }) {
    return `
      <header>
        <h1><span class="logo"></span>Split <span>v3</span></h1>
        <div class="header-actions">
          <button class="btn-icon" onclick="document.getElementById('helpModal').showModal()" title="Help / How it Works">
            ❓
          </button>
        </div>
      </header>
      <main>
        <div class="card" style="text-align:center; padding: 40px 20px;">
          <h2 style="margin-bottom: 20px;">Welcome to Split P2P</h2>
          <p style="color: var(--text-dim); margin-bottom: 30px;">Create a new group to start tracking expenses with your friends. Data is synced peer-to-peer!</p>
          <button class="btn-primary" onclick="document.getElementById('newGroupModal').showModal()" style="width: 100%; max-width: 300px; padding: 15px;">
            + Create New Group
          </button>
        </div>

        ${recentGroups.length > 0 ? `
          <div class="section-title" style="margin-top: 10px;">Recent Groups</div>
          <div class="group-list">
            ${recentGroups.map(g => `
              <div class="card clickable group-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1;" onclick="App.openGroup('${this._esc(g.id)}')">
                  <div class="group-info">
                    <h3>${this._esc(g.name)}</h3>
                    <p>${(g.members || []).length} members • ${this._esc(g.currency)}</p>
                  </div>
                </div>
                <div style="display:flex; gap:10px; align-items:center;">
                  <button class="btn-icon" onclick="event.stopPropagation(); App.removeRecentGroup('${this._esc(g.id)}')">
                    <span style="color:var(--text-dim); font-size:18px;">×</span>
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}
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
    
    // Food & Dining
    if (t.includes("pizza") || t.includes("burger") || t.includes("sushi") || t.includes("kebab") || t.includes("gyros")) return "🍕";
    if (t.includes("essen") || t.includes("food") || t.includes("dinner") || t.includes("lunch") || t.includes("meal") || t.includes("restaurant") || t.includes("resti") || t.includes("eat") || t.includes("käse") || t.includes("bürek") || t.includes("wrap")) return "🍽️";
    
    // Breakfast & Bakery
    if (t.includes("frühstück") || t.includes("zmorge") || t.includes("breakfast") || t.includes("bäcker") || t.includes("bakery") || t.includes("baklawa")) return "🥐";
    
    // Dessert
    if (t.includes("glace") || t.includes("ice cream") || t.includes("gelato")) return "🍦";

    // Coffee & Tea
    if (t.includes("coffee") || t.includes("coffe") || t.includes("kaffe") || t.includes("cafe") || t.includes("tea") || t.includes("espresso") || t.includes("starbucks")) return "☕";

    // Drinks & Alcohol
    if (t.includes("wine") || t.includes("wein")) return "🍷";
    if (t.includes("cocktail")) return "🍸";
    if (t.includes("water") || t.includes("wasser")) return "💧";
    if (t.includes("bier") || t.includes("beer") || t.includes("drink") || t.includes("getränk") || t.includes("trinken") || t.includes("bar") || t.includes("pub") || t.includes("saufi") || t.includes("alcohol")) return "🍻";

    // Transport & Gas
    if (t.includes("flight") || t.includes("plane") || t.includes("fly")) return "✈️";
    if (t.includes("train") || t.includes("bus") || t.includes("metro") || t.includes("transit") || t.includes("ticket")) return "🚆";
    if (t.includes("uber") || t.includes("taxi") || t.includes("cab") || t.includes("ride")) return "🚖";
    if (t.includes("fuel") || t.includes("gas") || t.includes("tanken") || t.includes("tanki") || t.includes("tankstelle") || t.includes("benzin") || t.includes("petrol")) return "⛽";
    if (t.includes("parking") || t.includes("parken") || t.includes("parkplatz")) return "🅿️";

    // Accommodation
    if (t.includes("hotel") || t.includes("airbnb") || t.includes("stay") || t.includes("hostel") || t.includes("rent")) return "🏠";

    // Activities & Sightseeing
    if (t.includes("boat") || t.includes("boot")) return "⛵";
    if (t.includes("kayak")) return "🛶";
    if (t.includes("burg") || t.includes("palace") || t.includes("castle")) return "🏰";
    if (t.includes("kirche") || t.includes("church")) return "⛪";
    if (t.includes("waterfall") || t.includes("wasserfall") || t.includes("nature")) return "🌊";
    if (t.includes("movie") || t.includes("cinema") || t.includes("concert") || t.includes("museum") || t.includes("tour")) return "🎟️";
    if (t.includes("hookah") || t.includes("shisha")) return "💨";

    // Shopping & Misc
    if (t.includes("shopping") || t.includes("cloth") || t.includes("shoes") || t.includes("tshirt") || t.includes("shirt")) return "🛍️";
    if (t.includes("sim") || t.includes("esim") || t.includes("phone")) return "📱";
    if (t.includes("abo") || t.includes("premium") || t.includes("subscription")) return "💎";

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
          <button class="btn-icon" onclick="window.location.href='analytics.html#group=' + window.App.currentGroupId" title="Analytics">📊</button>
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

      <button class="fab btn-primary" onclick="App.showAddExpenseModal()" title="Add Expense">
        +
      </button>

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
