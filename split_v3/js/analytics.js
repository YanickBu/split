import Store from "./store.js?v=3.0.24";
import Components from "./components.js?v=3.0.24";
import Currency from "./currency.js?v=3.0.24";

const AnalyticsApp = {
  currentGroupId: null,
  charts: {},

  async init() {
    // Parse group ID from query string or hash
    const params = new URLSearchParams(window.location.search);
    let groupId = params.get("group");
    if (!groupId && window.location.hash.startsWith("#group=")) {
      groupId = new URLSearchParams(window.location.hash.substring(1)).get("group");
    }

    if (!groupId) {
      alert("No group ID provided.");
      window.location.href = "index.html";
      return;
    }

    this.currentGroupId = groupId;

    document.getElementById("backBtn").addEventListener("click", () => {
      window.location.href = `index.html#group=${this.currentGroupId}`;
    });

    if (typeof Currency !== "undefined") await Currency.fetchRates();

    Store.init(groupId, () => this.render());
    
    // Polling fallback
    this._syncInterval = setInterval(() => {
      const g = Store.getGroup();
      if (g && g.name) {
        clearInterval(this._syncInterval);
        this._syncInterval = null;
        this.render();
      }
    }, 250);
  },

  render() {
    const group = Store.getGroup();
    if (!group || !group.name) return;
    
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
      this._syncInterval = null;
    }

    document.getElementById("groupTitleDisplay").innerText = `${group.name} Analytics`;
    document.getElementById("syncPill").style.display = "none";
    document.getElementById("loadingContent").style.display = "none";
    document.getElementById("analyticsContent").style.display = "block";

    this.renderCharts(group);
  },

  renderCharts(group) {
    const expenses = group.events
      .filter((e) => e.type === "ADD_EXPENSE")
      .filter((e) => {
         // Filter out storno
         const evtId = e.hash || e.id;
         const stornoIds = new Set(
           group.events
             .filter((x) => x.type === "STORNO_EXPENSE")
             .map((x) => x.data && x.data.expenseId)
         );
         return !stornoIds.has(e.id) && !stornoIds.has(e.hash) && !stornoIds.has(evtId);
      });

    Chart.defaults.color = '#fff';
    Chart.defaults.scale.grid.color = '#222';

    this.renderTimeChart(expenses, group.currency);
    this.renderCategoryChart(expenses, group.currency);
    this.renderPayerChart(expenses, group.currency);
    this.renderCurrencyChart(expenses);
  },

  renderTimeChart(expenses, groupCurrency) {
    // Group by date
    const byDate = {};
    expenses.forEach(e => {
      const d = e.data.expenseDate || new Date(e.ts).toISOString().split("T")[0];
      if (!byDate[d]) byDate[d] = 0;
      byDate[d] += parseFloat(e.data.groupAmount) || 0;
    });

    const sortedDates = Object.keys(byDate).sort();
    const data = sortedDates.map(d => byDate[d]);

    if (this.charts.time) this.charts.time.destroy();
    
    const ctx = document.getElementById('timeChart').getContext('2d');
    this.charts.time = new Chart(ctx, {
      type: 'line',
      data: {
        labels: sortedDates,
        datasets: [{
          label: `Daily Spending (${groupCurrency})`,
          data: data,
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.2)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  },

  renderCategoryChart(expenses, groupCurrency) {
    const byCat = {};
    expenses.forEach(e => {
      const emoji = Components.getCategoryEmoji(e.data.title);
      if (!byCat[emoji]) byCat[emoji] = 0;
      byCat[emoji] += parseFloat(e.data.groupAmount) || 0;
    });

    const labels = Object.keys(byCat);
    const data = labels.map(l => byCat[l]);
    
    const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#E7E9ED'];

    if (this.charts.category) this.charts.category.destroy();
    
    const ctx = document.getElementById('categoryChart').getContext('2d');
    this.charts.category = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, labels.length)
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true },
          x: { grid: { display: false }, ticks: { font: { size: 20 } } }
        }
      }
    });
  },

  renderPayerChart(expenses, groupCurrency) {
    const byPayer = {};
    expenses.forEach(e => {
      const payer = e.data.payer;
      if (!byPayer[payer]) byPayer[payer] = 0;
      byPayer[payer] += parseFloat(e.data.groupAmount) || 0;
    });

    const labels = Object.keys(byPayer);
    const data = labels.map(l => byPayer[l]);
    const colors = ['#36A2EB', '#FF6384', '#4BC0C0', '#FFCE56', '#9966FF'];

    if (this.charts.payer) this.charts.payer.destroy();
    
    const ctx = document.getElementById('payerChart').getContext('2d');
    this.charts.payer = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#111'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#fff' } }
        }
      }
    });
  },

  renderCurrencyChart(expenses) {
    const byCur = {};
    expenses.forEach(e => {
      const cur = e.data.originalCurrency || "Unknown";
      if (!byCur[cur]) byCur[cur] = 0;
      byCur[cur] += 1; 
    });

    const labels = Object.keys(byCur);
    const data = labels.map(l => byCur[l]);
    const colors = ['#FFCE56', '#9966FF', '#4BC0C0', '#FF6384'];

    if (this.charts.currency) this.charts.currency.destroy();
    
    const ctx = document.getElementById('currencyChart').getContext('2d');
    this.charts.currency = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#111'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#fff' } },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.label}: ${context.raw} expenses`
            }
          }
        }
      }
    });
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => AnalyticsApp.init());
} else {
  AnalyticsApp.init();
}
