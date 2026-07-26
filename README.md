# ⚡ Split v2

[![Automated Test Suite](https://github.com/YanickBu/split/actions/workflows/test.yml/badge.svg)](https://github.com/YanickBu/split/actions/workflows/test.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-4caf50)](https://YanickBu.github.io/split/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A modern, offline-first expense sharing & debt minimization web application with real-time multi-currency support, cryptographic event-ledger immutability, and instant cloud sync.

🌐 **Live App**: [https://YanickBu.github.io/split/](https://YanickBu.github.io/split/)

---

## ✨ Features

- 🌍 **All World Currencies Supported**: Supports **~160+ ISO 4217 currencies** (USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, BRL, MXN, KRW, SEK, NOK, DKK, AED, SAR, PLN, PHP, IDR, THB, etc.) with live exchange rates.
- 🔍 **Interactive Searchable Currency Picker**: Live search across all global currencies by ISO code, full currency name, or symbol (`$`, `€`, `£`, `¥`, `₹`, `₺`, `₱`, `₫`, etc.).
- 🧠 **Smart Expense Currency Memory**: Remembers your last selected expense currency for effortless consecutive entries.
- 📴 **Offline-First & Pending Rate Resolution**: Works 100% offline. Expenses added offline without exchange rates are saved with a `⏳ Rate pending` badge and automatically resolved with accurate live rates when reconnected (no inaccurate 1:1 fallbacks!).
- 🔐 **Immutable Cryptographic Ledger**: Every transaction event receives a deterministic 12-character cryptographic hash (`0x...`) chained with `prevHash`. Expenses can only be voided via append-only `STORNO_EXPENSE` events.
- ⚡ **Live Real-Time Sync**: Instant multi-device updates using Server-Sent Events (SSE) via `ntfy.sh` and cloud storage sync.
- 🤝 **Optimal Debt Minimization**: Greedy settlement algorithm that calculates net balances and minimizes the total number of transactions required to square up.
- 📤 **One-Touch Summary Sharing**: Export and share formatted group summaries via Web Share API or clipboard.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Dark Mode aesthetic), ES6+ JavaScript.
- **APIs & Web Standards**: Open Exchange Rates API (`open.er-api.com`), Server-Sent Events (SSE), Web Storage (`localStorage`), Web Share API.
- **CI / CD**: GitHub Actions automated mathematical & cryptographic test suite.

---

## 🧪 Running Automated Tests

Run the mathematical & immutability test suite locally:

```bash
python test_suite.py
```

### Test Coverage Includes:
1. **Single Currency Equal Splits**: Exact balance calculations.
2. **Multi-Border Currency Conversions**: Cross-currency settlement accuracy.
3. **Storno Immutability**: Append-only log verification.
4. **Cryptographic Chain Validation**: Tamper detection on past events.
5. **Penny Remainder Balancing**: Guarantees net-zero balance sums across members.

---

## 🚀 GitHub Pages Deployment

1. Push code to your GitHub repository:
   ```bash
   git add .
   git commit -m "Deploy Split v2"
   git push -u origin main
   ```
2. Go to **Settings** ➔ **Pages** in your GitHub repository.
3. Set **Source** to `Deploy from a branch` and select **`main`** branch `/ (root)`.
4. Your application will be live at `https://YanickBu.github.io/split/`.

---

## 📄 License

MIT License © 2026 YanickBu
