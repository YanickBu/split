const Settlement = {
  calculateBalances(group) {
    if (!group || !group.members) return {};

    const balances = {};
    group.members.forEach((m) => (balances[m] = 0));

    // Storno voided expenses map (by id and hash)
    const voidedIds = new Set();
    (group.events || []).forEach((evt) => {
      if (evt.type === "STORNO_EXPENSE" && evt.data && evt.data.expenseId) {
        voidedIds.add(evt.data.expenseId);
      }
    });

    (group.events || []).forEach((evt) => {
      if (evt.type === "ADD_EXPENSE" && evt.data) {
        const evtId = evt.hash || evt.id;
        if (
          voidedIds.has(evt.id) ||
          voidedIds.has(evt.hash) ||
          voidedIds.has(evtId)
        ) {
          return; // Skip voided expense
        }

        const payer = evt.data.payer;
        const amount = roundToTwoDecimals(
          parseFloat(evt.data.groupAmount) || 0,
        );

        if (amount <= 0 || !payer) return;

        // Split among designated subgroup members (or all active members if unspecified)
        let splitMembers =
          evt.data.splitMembers &&
          Array.isArray(evt.data.splitMembers) &&
          evt.data.splitMembers.length > 0
            ? evt.data.splitMembers.filter((m) => group.members.includes(m))
            : group.members.length > 0
              ? group.members
              : [payer];

        if (splitMembers.length === 0) {
          splitMembers = group.members.length > 0 ? group.members : [payer];
        }

        const numMembers = splitMembers.length;
        // Round up each member's share to the nearest cent
        const shareCents = Math.ceil((amount * 100) / numMembers);
        const totalCreditedAmount = (shareCents * numMembers) / 100;

        if (balances[payer] === undefined) balances[payer] = 0;
        balances[payer] += totalCreditedAmount;

        splitMembers.forEach((m) => {
          if (balances[m] === undefined) balances[m] = 0;
          balances[m] -= shareCents / 100;
        });
      }
    });

    // Ensure all final balances are rounded cleanly to 2 decimal places
    Object.keys(balances).forEach((m) => {
      balances[m] = roundToTwoDecimals(balances[m]);
    });

    return balances;
  },

  calculateSettlements(balances) {
    if (!balances) return [];

    const debtors = [];
    const creditors = [];

    for (const [member, balance] of Object.entries(balances)) {
      const bal = roundToTwoDecimals(balance);
      if (bal < -0.005) {
        debtors.push({ member, amount: -bal });
      } else if (bal > 0.005) {
        creditors.push({ member, amount: bal });
      }
    }

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements = [];
    let i = 0,
      j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(debtor.amount, creditor.amount);

      if (amount > 0.005) {
        settlements.push({
          from: debtor.member,
          to: creditor.member,
          amount: roundToTwoDecimals(amount),
        });
      }

      debtor.amount = roundToTwoDecimals(debtor.amount - amount);
      creditor.amount = roundToTwoDecimals(creditor.amount - amount);

      if (debtor.amount < 0.005) i++;
      if (creditor.amount < 0.005) j++;
    }

    return settlements;
  },

  generateSummary(group, balances, settlements) {
    let summary = `*${group.name}* Summary\n\n`;

    summary += `*Balances:*\n`;
    for (const [member, bal] of Object.entries(balances)) {
      if (Math.abs(bal) > 0.005) {
        const sign = bal > 0 ? "+" : "";
        summary += `${member}: ${sign}${Currency.format(bal, group.currency)} ${group.currency}\n`;
      }
    }

    summary += `\n*Settlements:*\n`;
    if (settlements.length === 0) {
      summary += `All squared up! 🍻\n`;
    } else {
      settlements.forEach((s) => {
        summary += `${s.from} ➡️ ${s.to}: ${Currency.format(s.amount, group.currency)} ${group.currency}\n`;
      });
    }

    return summary;
  },
};

function roundToTwoDecimals(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
