const CSVExport = {
  exportCSV(app, e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!app.currentGroupId) return;
    const group = window.Store.getGroup();
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
};

export default CSVExport;
