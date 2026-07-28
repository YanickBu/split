const Currency = {
  rates: {},
  base: 'USD',
  lastFetch: 0,
  
  // Comprehensive list of world currencies with codes, names, and symbols
  currencies: [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: 'CN¥' },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
    { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
    { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
    { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
    { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
    { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
    { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
    { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
    { code: 'THB', name: 'Thai Baht', symbol: '฿' },
    { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
    { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR' },
    { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
    { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
    { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
    { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
    { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
    { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
    { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
    { code: 'ILS', name: 'Israeli New Shekel', symbol: '₪' },
    { code: 'CLP', name: 'Chilean Peso', symbol: 'CLP$' },
    { code: 'ARS', name: 'Argentine Peso', symbol: 'AR$' },
    { code: 'COP', name: 'Colombian Peso', symbol: 'COL$' },
    { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/' },
    { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs' },
    { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
    { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
    { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
    { code: 'AFN', name: 'Afghan Afghani', symbol: '؋' },
    { code: 'ALL', name: 'Albanian Lek', symbol: 'L' },
    { code: 'AMD', name: 'Armenian Dram', symbol: '֏' },
    { code: 'ANG', name: 'Netherlands Antillean Guilder', symbol: 'ƒ' },
    { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz' },
    { code: 'AWG', name: 'Aruban Florin', symbol: 'ƒ' },
    { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼' },
    { code: 'BAM', name: 'Bosnia-Herzegovina Convertible Mark', symbol: 'KM' },
    { code: 'BBD', name: 'Bajan Dollar', symbol: 'Bds$' },
    { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' },
    { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب' },
    { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu' },
    { code: 'BMD', name: 'Bermudan Dollar', symbol: '$' },
    { code: 'BND', name: 'Brunei Dollar', symbol: 'B$' },
    { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs.' },
    { code: 'BSD', name: 'Bahamian Dollar', symbol: 'B$' },
    { code: 'BTN', name: 'Bhutanese Ngultrum', symbol: 'Nu.' },
    { code: 'BWP', name: 'Botswanan Pula', symbol: 'P' },
    { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br' },
    { code: 'BZD', name: 'Belize Dollar', symbol: 'BZ$' },
    { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' },
    { code: 'CRC', name: 'Costa Rican Colón', symbol: '₡' },
    { code: 'CUP', name: 'Cuban Peso', symbol: '$MN' },
    { code: 'CVE', name: 'Cape Verdean Escudo', symbol: 'Esc' },
    { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj' },
    { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$' },
    { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج' },
    { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk' },
    { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br' },
    { code: 'FJD', name: 'Fijian Dollar', symbol: 'FJ$' },
    { code: 'FKP', name: 'Falkland Islands Pound', symbol: 'FK£' },
    { code: 'GEL', name: 'Georgian Lari', symbol: '₾' },
    { code: 'GGP', name: 'Guernsey Pound', symbol: '£' },
    { code: 'GIP', name: 'Gibraltar Pound', symbol: '£' },
    { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D' },
    { code: 'GNF', name: 'Guinean Franc', symbol: 'FG' },
    { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q' },
    { code: 'GYD', name: 'Guyanaese Dollar', symbol: 'G$' },
    { code: 'HNL', name: 'Honduran Lempira', symbol: 'L' },
    { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn' },
    { code: 'HTG', name: 'Haitian Gourde', symbol: 'G' },
    { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د' },
    { code: 'IRR', name: 'Iranian Rial', symbol: '﷼' },
    { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr' },
    { code: 'JMD', name: 'Jamaican Dollar', symbol: 'J$' },
    { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا' },
    { code: 'KGS', name: 'Kyrgystani Som', symbol: 'с' },
    { code: 'KHR', name: 'Cambodian Riel', symbol: '៛' },
    { code: 'KMF', name: 'Comorian Franc', symbol: 'CF' },
    { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك' },
    { code: 'KYD', name: 'Cayman Islands Dollar', symbol: 'CI$' },
    { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸' },
    { code: 'LAK', name: 'Laotian Kip', symbol: '₭' },
    { code: 'LBP', name: 'Lebanese Pound', symbol: 'L£' },
    { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
    { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$' },
    { code: 'LSL', name: 'Lesotho Loti', symbol: 'L' },
    { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د' },
    { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.' },
    { code: 'MDL', name: 'Moldovan Leu', symbol: 'L' },
    { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar' },
    { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден' },
    { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' },
    { code: 'MNT', name: 'Mongolian Tugrik', symbol: '₮' },
    { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$' },
    { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM' },
    { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨' },
    { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'Rf' },
    { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK' },
    { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT' },
    { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$' },
    { code: 'NIO', name: 'Nicaraguan Córdoba', symbol: 'C$' },
    { code: 'NPR', name: 'Nepalese Rupee', symbol: 'Rs' },
    { code: 'OMR', name: 'Omani Rial', symbol: 'ر.ع.' },
    { code: 'PAB', name: 'Panamanian Balboa', symbol: 'B/.' },
    { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K' },
    { code: 'PYG', name: 'Paraguayan Guarani', symbol: '₲' },
    { code: 'QAR', name: 'Qatari Rial', symbol: 'ر.ق' },
    { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
    { code: 'RSD', name: 'Serbian Dinar', symbol: 'din.' },
    { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw' },
    { code: 'SBD', name: 'Solomon Islands Dollar', symbol: 'SI$' },
    { code: 'SCR', name: 'Seychellois Rupee', symbol: 'SR' },
    { code: 'SDG', name: 'Sudanese Pound', symbol: 'SDG' },
    { code: 'SHP', name: 'St. Helena Pound', symbol: '£' },
    { code: 'SLE', name: 'Sierra Leonean Leone', symbol: 'Le' },
    { code: 'SOS', name: 'Somali Shilling', symbol: 'Sh' },
    { code: 'SRD', name: 'Surinamese Dollar', symbol: 'Sr$' },
    { code: 'SSP', name: 'South Sudanese Pound', symbol: 'SS£' },
    { code: 'STN', name: 'São Tomé & Príncipe Dobra', symbol: 'Db' },
    { code: 'SYP', name: 'Syrian Pound', symbol: 'LS' },
    { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'L' },
    { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'SM' },
    { code: 'TMT', name: 'Turkmenistani Manat', symbol: 'T' },
    { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت' },
    { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$' },
    { code: 'TTD', name: 'Trinidad & Tobago Dollar', symbol: 'TT$' },
    { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' },
    { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
    { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
    { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
    { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U' },
    { code: 'UZS', name: 'Uzbekistani Som', symbol: 'soʻm' },
    { code: 'VES', name: 'Venezuelan Bolívar', symbol: 'Bs.S' },
    { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'VT' },
    { code: 'WST', name: 'Samoan Tala', symbol: 'WS$' },
    { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA' },
    { code: 'XCD', name: 'East Caribbean Dollar', symbol: 'EC$' },
    { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA' },
    { code: 'XPF', name: 'CFP Franc', symbol: '₣' },
    { code: 'YER', name: 'Yemeni Rial', symbol: '﷼' },
    { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK' },
    { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$' }
  ],

  get commonCurrencies() {
    return this.currencies.slice(0, 11);
  },

  async fetchRates() {
    const now = Date.now();
    if (now - this.lastFetch < 3600000 && Object.keys(this.rates).length > 0) return true;
    
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.rates) {
        this.rates = data.rates;
        this.lastFetch = now;
        localStorage.setItem('split_rates', JSON.stringify({rates: this.rates, ts: this.lastFetch}));
        return true;
      }
    } catch (e) {
      console.warn("Failed to fetch rates, falling back to cache");
      const cached = localStorage.getItem('split_rates');
      if (cached) {
        try {
          const p = JSON.parse(cached);
          this.rates = p.rates;
          this.lastFetch = p.ts;
          return true;
        } catch(err) {}
      }
    }
    return false;
  },

  async fetchHistoricalRates(dateStr) {
    if (!dateStr) return this.rates;

    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) {
      await this.fetchRates();
      return this.rates;
    }

    const cacheKey = 'split_hist_rates_' + dateStr;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {}
    }

    try {
      const res = await fetch(`https://api.frankfurter.app/${dateStr}?from=USD`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.rates) {
        data.rates['USD'] = 1.0;
        localStorage.setItem(cacheKey, JSON.stringify(data.rates));
        return data.rates;
      }
    } catch (e) {
      console.warn(`Failed to fetch historical rates for ${dateStr} from Frankfurter, trying fallback...`, e);
    }

    try {
      const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/usd.json`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.usd) {
        const rates = {};
        Object.keys(data.usd).forEach(k => {
          rates[k.toUpperCase()] = data.usd[k];
        });
        rates['USD'] = 1.0;
        localStorage.setItem(cacheKey, JSON.stringify(rates));
        return rates;
      }
    } catch (e) {
      console.warn(`Historical rate fallback failed for ${dateStr}, using current rates`);
    }

    return this.rates;
  },

  async convertWithDate(amount, fromCode, toCode, dateStr) {
    const num = parseFloat(amount) || 0;
    if (fromCode === toCode) {
      return { amount: num, isPending: false };
    }

    const targetRates = await this.fetchHistoricalRates(dateStr);
    if (!targetRates || !targetRates[fromCode] || !targetRates[toCode]) {
      return this.convertWithStatus(amount, fromCode, toCode);
    }

    const rateFrom = targetRates[fromCode];
    const rateTo = targetRates[toCode];
    const converted = (num / rateFrom) * rateTo;
    return { amount: converted, isPending: false };
  },

  getAllCurrencies() {
    const map = new Map();
    this.currencies.forEach(c => map.set(c.code, { ...c }));

    if (this.rates) {
      Object.keys(this.rates).forEach(code => {
        if (!map.has(code)) {
          map.set(code, {
            code,
            name: code,
            symbol: code
          });
        }
      });
    }

    return Array.from(map.values());
  },

  getCurrency(code) {
    if (!code) return null;
    const upper = code.toUpperCase();
    const found = this.currencies.find(c => c.code === upper);
    if (found) return found;
    return { code: upper, name: upper, symbol: upper };
  },

  search(query) {
    const all = this.getAllCurrencies();
    if (!query || !query.trim()) return all;
    
    const q = query.trim().toLowerCase();
    return all.filter(c => 
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q)
    );
  },

  // Returns conversion result with status so offline rates aren't assumed 1:1
  convertWithStatus(amount, fromCode, toCode) {
    const num = parseFloat(amount) || 0;
    if (fromCode === toCode) {
      return { amount: num, isPending: false };
    }
    
    if (!this.rates || !this.rates[fromCode] || !this.rates[toCode]) {
      return { amount: num, isPending: true };
    }
    
    const rateFrom = this.rates[fromCode];
    const rateTo = this.rates[toCode];
    const converted = (num / rateFrom) * rateTo;
    return { amount: converted, isPending: false };
  },

  convert(amount, fromCode, toCode) {
    const res = this.convertWithStatus(amount, fromCode, toCode);
    return res.amount;
  },

  format(amount, code) {
    const c = this.getCurrency(code);
    const sym = c ? c.symbol : code;
    const num = parseFloat(amount);
    if (isNaN(num)) return `${sym}0.00`;
    return `${sym}${num.toFixed(2)}`;
  },

  getSymbol(code) {
    const c = this.getCurrency(code);
    return c ? c.symbol : code;
  }
};
