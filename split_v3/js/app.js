import Store from "./store.js?v=3.0.19";
import Currency from "./currency.js?v=3.0.19";
import CurrencyPicker from "./currencyPicker.js?v=3.0.19";
import Components from "./components.js?v=3.0.19";
import QRCode from "./qrcode.js?v=3.0.19";
import Export from "./export.js?v=3.0.19";
import Settlement from "./settlement.js?v=3.0.19";
//  './export.js?v=3.0.4';

function _escHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const App = {
  currentGroupId: null,
  lastExpenseCurrency: null,
  lastExpensePayer: null,

  async init() {
    this.registerServiceWorker();
    if (typeof Currency !== "undefined") await Currency.fetchRates();
    this.setupRoutes();
    this.setupListeners();
    this.handleHashChange();
  },

  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("./sw.js?v=3.0.4")
        .catch((err) => console.warn("SW registration skipped:", err));
    }
  },

  setupRoutes() {
    window.addEventListener("hashchange", () => this.handleHashChange());
  },

  handleHashChange() {
    const hash = window.location.hash.substring(1);

    if (hash.startsWith("group=")) {
      const params = new URLSearchParams(hash);
      const groupId = params.get("group");
      this.currentGroupId = groupId;

      // Initialize Yjs store for this specific group room
      Store.init(groupId, () => this.render());

      // The render will happen automatically once Store syncs
      this.render();
    } else {
      this.currentGroupId = null;
      this.render();
    }
  },

  setupListeners() {
    document
      .getElementById("newGroupForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("groupName").value;
        const currency = document.getElementById("groupCurrency").value;
        const creator = document.getElementById("creatorName").value;

        const groupId = Store.createGroup(name, currency, creator);
        window.location.hash = `group=${groupId}`;

        document.getElementById("newGroupModal").close();
        e.target.reset();
      });

    document
      .getElementById("addMemberForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("memberName").value;
        Store.appendEvent(this.currentGroupId, "ADD_MEMBER", { name });
        document.getElementById("addMemberModal").close();
        e.target.reset();
      });

    document
      .getElementById("addExpenseForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("expenseTitle").value;
        const amount = parseFloat(
          document.getElementById("expenseAmount").value,
        );
        const currency = document.getElementById("expenseCurrency").value;
        const payer = document.getElementById("expensePayer").value;
        const expenseDate = document.getElementById("expenseDate").value;

        const group = Store.getGroup();
        if (!group) return;

        const splitMembers = Array.from(
          document.querySelectorAll(".split-member-checkbox:checked"),
        ).map((cb) => cb.value);
        if (splitMembers.length === 0) {
          alert("Select at least one person to split with.");
          return;
        }

        this.lastExpenseCurrency = currency;
        this.lastExpensePayer = payer;

        try {
          localStorage.setItem(
            "split_last_expense_currency_" + this.currentGroupId,
            currency,
          );
          localStorage.setItem(
            "split_last_expense_payer_" + this.currentGroupId,
            payer,
          );
        } catch (err) {}

        let convAmount = amount;
        let isPending = false;
        let rateSnap = {};

        if (typeof Currency !== "undefined") {
          const conv = await Currency.convertWithDate(
            amount,
            currency,
            group.currency,
            expenseDate,
          );
          convAmount = conv.amount;
          isPending = conv.isPending;
          rateSnap = Currency.rates;
        }

        Store.appendEvent(this.currentGroupId, "ADD_EXPENSE", {
          title,
          originalAmount: amount,
          originalCurrency: currency,
          groupAmount: convAmount,
          isPendingRate: isPending,
          payer,
          expenseDate,
          splitMembers,
          rateSnapshot: rateSnap,
        });

        document.getElementById("addExpenseModal").close();
        e.target.reset();
      });
  },

  openGroup(id) {
    window.location.hash = `group=${id}`;
  },

  goHome() {
    window.location.hash = "";
  },

  async render() {
    const appEl = document.getElementById("app");

    if (this.currentGroupId) {
      const group = Store.getGroup();

      if (!group || !group.name) {
        // Still loading from Yjs
        appEl.innerHTML = `
          <header>
            <div style="display:flex; align-items:center; gap:12px;">
              <button onclick="App.goHome()" class="btn-icon">←</button>
              <h1>Connecting...</h1>
            </div>
          </header>
          <main>
            <div style="text-align:center; padding: 40px; color: var(--text-dim)">
              Connecting to P2P Swarm...
            </div>
          </main>`;
          
        if (!this._syncInterval) {
          this._syncInterval = setInterval(() => {
            const g = Store.getGroup();
            if (g && g.name) {
              clearInterval(this._syncInterval);
              this._syncInterval = null;
              this.render();
            }
          }, 250);
        }
        return;
      }
      
      if (this._syncInterval) {
        clearInterval(this._syncInterval);
        this._syncInterval = null;
      }

      appEl.innerHTML = Components.renderGroupDashboard(group);

      // Update header
      document.getElementById("groupTitleDisplay").innerText = group.name;

      // Setup expense form defaults
      const lastCur =
        localStorage.getItem("split_last_expense_currency_" + group.id) ||
        group.currency;
      const curSelect = document.getElementById("expenseCurrency");
      if (curSelect) curSelect.value = lastCur;

      const lastPayer = localStorage.getItem(
        "split_last_expense_payer_" + group.id,
      );
      const payerSelect = document.getElementById("expensePayer");
      if (payerSelect && lastPayer) payerSelect.value = lastPayer;

      if (typeof CurrencyPicker !== "undefined") {
        CurrencyPicker.init("expenseCurrency");
      }
    } else {
      appEl.innerHTML = Components.renderHome({});
      if (typeof CurrencyPicker !== "undefined") {
        CurrencyPicker.init("groupCurrency");
      }
    }
  },

  showAddMemberModal() {
    document.getElementById("addMemberModal").showModal();
  },

  showAddExpenseModal() {
    const group = Store.getGroup();
    const container = document.getElementById("expenseSplitMembers");
    if (container && group) {
      container.innerHTML = group.members
        .map(
          (m) => `
        <label class="member-checkbox">
          <input type="checkbox" class="split-member-checkbox" value="${_escHTML(m)}" checked>
          <span>${_escHTML(m)}</span>
        </label>
      `,
        )
        .join("");
    }

    const dateInput = document.getElementById("expenseDate");
    if (dateInput) {
      dateInput.value = new Date().toISOString().split("T")[0];
    }

    document.getElementById("addExpenseModal").showModal();
  },

  voidExpense(hash) {
    if (
      confirm(
        "Are you sure you want to void this expense? This action will be recorded in the ledger.",
      )
    ) {
      Store.appendEvent(this.currentGroupId, "VOID_EXPENSE", {
        targetHash: hash,
      });
    }
  },

  showShareModal() {
    const url = window.location.href;
    const svg =
      typeof QRCode !== "undefined" ? QRCode.generateSVG(url, 220) : "";
    const container = document.getElementById("qrCodeContainer");
    if (container) container.innerHTML = svg;
    const modal = document.getElementById("shareModal");
    if (modal) modal.showModal();
  },

  async shareUrl() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Split V3", url: url });
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  },

  async settleUp() {
    if (
      confirm(
        "Are you sure you want to settle up? This will void all current expenses and bring everyone's balance to zero.",
      )
    ) {
      const group = Store.getGroup();
      if (!group || !group.events) return;
      group.events.forEach((evt) => {
        if (evt.type === "ADD_EXPENSE") {
          Store.appendEvent(this.currentGroupId, "STORNO_EXPENSE", {
            targetHash: evt.hash,
            expenseId: evt.id,
          });
        }
      });
    }
  },

  exportCSV(e) {
    if (typeof Export !== "undefined") {
      Export.exportCSV(this, e);
    }
  },

  showAddMember() {
    this.showAddMemberModal();
  },

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
          url: window.location.href,
        });
        return;
      } catch (e) {}
    }
    this.copyToClipboard(summary, "Summary copied to clipboard!");
  },

  copyToClipboard(text, msg = "Copied to clipboard!") {
    navigator.clipboard
      .writeText(text)
      .then(() => alert(msg))
      .catch(() => alert("Failed to copy."));
  },

  importCSV(_e) {
    document.getElementById("csvInput").click();
  },

  handleCSVUpload(e) {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      const rows = text.split("\n");
      let importedCount = 0;

      const group = Store.getGroup();
      if (!group) return;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i].trim();
        if (!row) continue;

        const cols = [];
        let inQuotes = false;
        let curr = "";
        for (let j = 0; j < row.length; j++) {
          if (row[j] === '"') inQuotes = !inQuotes;
          else if (row[j] === "," && !inQuotes) {
            cols.push(curr.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
            curr = "";
          } else curr += row[j];
        }
        cols.push(curr.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));

        if (cols.length >= 7) {
          const date = cols[1];
          const title = cols[2];
          const payer = cols[3];
          const members = cols[4]
            .split(",")
            .map((m) => m.trim())
            .filter((m) => m);
          const amount = parseFloat(cols[5]);
          const cur = cols[6] || group.currency;

          if (!payer || !amount || members.length === 0) continue;

          if (!group.members.includes(payer))
            Store.appendEvent(group.id, "ADD_MEMBER", { name: payer });
          members.forEach((m) => {
            if (!group.members.includes(m))
              Store.appendEvent(group.id, "ADD_MEMBER", { name: m });
          });

          let convAmount = amount;
          if (typeof Currency !== "undefined") {
            const conv = await Currency.convertWithDate(
              amount,
              cur,
              group.currency,
              date,
            );
            convAmount = conv.amount;
          }

          Store.appendEvent(group.id, "ADD_EXPENSE", {
            title,
            originalAmount: amount,
            originalCurrency: cur,
            groupAmount: convAmount,
            isPendingRate: false,
            payer,
            expenseDate: date,
            splitMembers: members,
            rateSnapshot: {},
          });
          importedCount++;
        }
      }
      alert(`Successfully imported ${importedCount} expenses!`);
    };
    reader.readAsText(file);
    e.target.value = "";
  },
};

window.App = App;
window.Export = Export;
window.CurrencyPicker = CurrencyPicker;
window.Components = Components;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.init());
} else {
  App.init();
}

export default App;
