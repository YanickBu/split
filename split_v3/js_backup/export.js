const CSVExport = {
  exportCSV(app, e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!app.currentGroupId) return;
    const group = State.getGroup(app.currentGroupId);
    if (!group) return;

    const stornoIds = new Set(
      group.events
        .filter((evt) => evt.type === "STORNO_EXPENSE")
        .map((evt) => evt.data && evt.data.expenseId),
    );

    const expenses = group.events.filter((evt) => evt.type === "ADD_EXPENSE");

    if (expenses.length === 0) {
      alert("No expenses to export.");
      return;
    }

    const headers = [
      "ID",
      "Date",
      "Title",
      "Payer",
      "Split Members",
      "Original Amount",
      "Original Currency",
      "Group Amount",
      "Group Currency",
      "Status",
      "Exchange Rate",
    ];

    const rows = expenses.map((evt) => {
      const evtId = evt.hash || evt.id;
      const isStorno =
        stornoIds.has(evt.id) ||
        stornoIds.has(evt.hash) ||
        stornoIds.has(evtId);
      const isPendingRate = evt.data.isPendingRate;

      const status = isStorno
        ? "Voided"
        : isPendingRate
          ? "Pending Rate"
          : "Active";
      const dateStr =
        evt.data.expenseDate || new Date(evt.ts).toISOString().split("T")[0];
      const titleEsc = `"${(evt.data.title || "").replace(/"/g, '""')}"`;
      const payerEsc = `"${(evt.data.payer || "").replace(/"/g, '""')}"`;
      const splitStr = `"${(evt.data.splitMembers || group.members).join(", ").replace(/"/g, '""')}"`;

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
        status,
        evt.data.exchangeRate || 1.0,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const safeName = (group.name || "group")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${safeName}_expenses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  importCSV(app, e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!app.currentGroupId) return;

    // Setup file input synchronously to prevent browser popup blockers
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";

    input.onchange = async () => {
      let group = State.getGroup(app.currentGroupId);
      // If the group is missing, create a placeholder so we can recover it
      if (!group) {
        State.data.groups[app.currentGroupId] = {
          id: app.currentGroupId,
          name: "Recovered Group",
          currency: "USD",
          members: ["Me"],
          events: [],
          pendingDeltas: [],
        };
        group = State.getGroup(app.currentGroupId);
        await State.appendEvent(app.currentGroupId, "INIT", {
          name: "Recovered Group",
          currency: "USD",
          creator: "RecoveryBot",
        });
      }
      const file = input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const text = reader.result;
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          alert("CSV is empty or invalid.");
          return;
        }

        // Helper to parse CSV line respecting quotes
        const parseCSVLine = (line) => {
          const result = [];
          let current = "";
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
            } else if (char === "," && !inQuotes) {
              result.push(current.trim());
              current = "";
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        const headers = parseCSVLine(lines[0]);
        const hMap = {};
        headers.forEach((h, i) => {
          hMap[h.trim().toLowerCase()] = i;
        });

        const requiredHeaders = [
          "date",
          "title",
          "payer",
          "original amount",
          "original currency",
        ];
        const missing = requiredHeaders.filter((h) => hMap[h] === undefined);
        if (missing.length > 0) {
          alert(
            `Missing columns in CSV: ${missing.join(", ")}.\nRequired columns are: ${requiredHeaders.join(", ")}`,
          );
          return;
        }

        let importedCount = 0;
        let errorsCount = 0;

        await Currency.fetchRates();

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;

          const row = parseCSVLine(line);
          const date = row[hMap["date"]];
          const title = row[hMap["title"]];
          const payer = row[hMap["payer"]];
          const origAmtStr = row[hMap["original amount"]];
          const origCurr = row[hMap["original currency"]] || group.currency;
          const splitMembersStr = row[hMap["split members"]] || "";

          const amount = parseFloat(origAmtStr.replace(/,/g, "."));
          if (!date || !title || !payer || isNaN(amount) || amount <= 0) {
            errorsCount++;
            continue;
          }

          if (!group.members.includes(payer)) {
            await State.appendEvent(App.currentGroupId, "ADD_MEMBER", {
              name: payer,
            });
          }

          let splitMembers = [...group.members];
          if (splitMembersStr) {
            splitMembers = splitMembersStr
              .split(",")
              .map((m) => m.trim().replace(/^"|"$/g, ""))
              .filter((m) => m.length > 0);

            for (const member of splitMembers) {
              if (!group.members.includes(member)) {
                await State.appendEvent(App.currentGroupId, "ADD_MEMBER", {
                  name: member,
                });
              }
            }
          }

          const conv = await Currency.convertWithDate(
            amount,
            origCurr,
            group.currency,
            date,
          );

          await State.appendEvent(App.currentGroupId, "ADD_EXPENSE", {
            title,
            originalAmount: amount,
            originalCurrency: origCurr,
            groupAmount: conv.amount,
            exchangeRate: conv.rate,
            isPendingRate: conv.isPending,
            payer,
            expenseDate: date,
            splitMembers,
          });

          importedCount++;
        }

        // Batch sync to network once at the end
        if (importedCount > 0) {
          await Network.syncOnline();
        }

        App.render();
        alert(
          `Imported ${importedCount} expenses.` +
            (errorsCount ? ` Skipped ${errorsCount} rows with errors.` : ""),
        );
      };

      reader.readAsText(file);
    };

    input.click();
  },
};
