const CurrencyPicker = {
  targetInputId: null,
  targetBtnId: null,
  selectedCode: 'USD',

  init() {
    const searchInput = document.getElementById('currencySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.style.display = e.target.value ? 'block' : 'none';
        this.renderList(e.target.value);
      });
    }
  },

  open(targetInputId, targetBtnId) {
    this.targetInputId = targetInputId;
    this.targetBtnId = targetBtnId;
    const inputEl = document.getElementById(targetInputId);
    this.selectedCode = inputEl ? inputEl.value : 'USD';

    const modal = document.getElementById('currencyPickerModal');
    const searchInput = document.getElementById('currencySearchInput');
    if (searchInput) {
      searchInput.value = '';
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) clearBtn.style.display = 'none';
    }

    this.renderList('');
    if (modal) {
      modal.showModal();
      setTimeout(() => {
        if (searchInput) searchInput.focus();
      }, 100);
    }
  },

  clearSearch() {
    const searchInput = document.getElementById('currencySearchInput');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    this.renderList('');
  },

  setButtonValue(targetInputId, targetBtnId, code) {
    const inputEl = document.getElementById(targetInputId);
    const btnEl = document.getElementById(targetBtnId);
    const c = Currency.getCurrency(code);

    if (inputEl) inputEl.value = c.code;
    if (btnEl) {
      btnEl.innerHTML = `
        <span class="curr-badge">${c.symbol}</span>
        <span class="curr-text"><strong>${c.code}</strong> — ${c.name}</span>
        <span class="curr-search-icon">🔍</span>
      `;
    }
  },

  select(code) {
    this.selectedCode = code;
    this.setButtonValue(this.targetInputId, this.targetBtnId, code);

    if (this.targetInputId === 'expenseCurrency') {
      try {
        if (typeof App !== 'undefined') {
          App.lastExpenseCurrency = code;
          if (App.currentGroupId) {
            localStorage.setItem('split_last_expense_currency_' + App.currentGroupId, code);
          }
        }
        localStorage.setItem('split_last_expense_currency', code);
      } catch (err) {}
    }

    const modal = document.getElementById('currencyPickerModal');
    if (modal) modal.close();
  },

  renderList(query) {
    const listEl = document.getElementById('currencyPickerList');
    if (!listEl) return;

    const filtered = Currency.search(query);

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty-search">No currencies found matching "${query}"</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(c => {
      const isSelected = c.code === this.selectedCode;
      let rateInfo = '';
      if (Currency.rates && Currency.rates[c.code]) {
        const rate = Currency.rates[c.code];
        rateInfo = `<span class="rate-badge">1 USD = ${rate < 0.01 ? rate.toFixed(4) : rate.toFixed(2)} ${c.code}</span>`;
      }

      return `
        <div class="currency-item ${isSelected ? 'selected' : ''}" onclick="CurrencyPicker.select('${c.code}')">
          <div class="currency-item-symbol">${c.symbol}</div>
          <div class="currency-item-details">
            <div class="currency-item-code">${c.code} ${isSelected ? '✓' : ''}</div>
            <div class="currency-item-name">${c.name}</div>
          </div>
          ${rateInfo}
        </div>
      `;
    }).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => CurrencyPicker.init());
