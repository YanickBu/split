import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadLedger(storage) {
  const context = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    console,
  };
  vm.runInNewContext(
    readFileSync("js/state.js", "utf8") +
      "\n" +
      readFileSync("js/settlement.js", "utf8") +
      "\nglobalThis.testState = State; globalThis.testSettlement = Settlement;",
    context,
  );
  return context;
}

test("rate resolution syncs as a new event without changing the hashed expense", () => {
  const storage = new Map();
  const { testState: state, testSettlement: settlement } = loadLedger(storage);
  const groupId = state.createGroup("Trip", "USD", "Alice");
  state.appendEvent(groupId, "ADD_MEMBER", { name: "Bob" });
  const expense = state.appendEvent(groupId, "ADD_EXPENSE", {
    title: "Dinner",
    payer: "Alice",
    originalAmount: 100,
    originalCurrency: "EUR",
    groupAmount: null,
    isPendingRate: true,
    splitMembers: ["Alice", "Bob"],
  });
  const originalHash = expense.hash;
  state.appendEvent(groupId, "RATE_RESOLVED", {
    expenseId: originalHash,
    groupAmount: 120,
    rateSnapshot: { EUR: 0.83 },
  });

  const group = state.getGroup(groupId);
  assert.equal(expense.data.groupAmount, null);
  assert.equal(expense.data.isPendingRate, true);
  assert.equal(
    state.generateEventHash(groupId, expense.type, expense.ts, expense.data, expense.prevHash, expense.source),
    originalHash,
  );
  assert.equal(state.getExpenses(group)[0].data.groupAmount, 120);
  assert.equal(state.getExpenses(group)[0].data.isPendingRate, false);
  assert.equal(settlement.calculateBalances(group).Alice, 60);
  assert.equal(settlement.calculateBalances(group).Bob, -60);

  const reloaded = loadLedger(storage).testState;
  assert.equal(reloaded.getExpenses(reloaded.getGroup(groupId))[0].data.groupAmount, 120);
});

test("online retry publishes a rate resolution once", async () => {
  const context = loadLedger(new Map());
  const state = context.testState;
  const groupId = state.createGroup("Trip", "USD", "Alice");
  const expense = state.appendEvent(groupId, "ADD_EXPENSE", {
    payer: "Alice",
    originalAmount: 100,
    originalCurrency: "EUR",
    groupAmount: null,
    isPendingRate: true,
  });
  const published = [];
  Object.assign(context, {
    State: state,
    Currency: {
      rates: { EUR: 0.83 },
      fetchRates: async () => true,
      convertWithDate: async () => ({ amount: 120, isPending: false }),
    },
    EventSourcing: { publish: async (_id, event) => { published.push(event.type); return true; } },
    JSONBin: { sync: async () => true },
    document: { addEventListener() {}, getElementById: () => null },
    window: { location: { hash: "" } },
    navigator: { onLine: true },
    setInterval: () => 1,
    clearInterval() {},
  });
  vm.runInNewContext(readFileSync("js/app.js", "utf8") + "\nglobalThis.testApp = App;", context);
  context.testApp.syncGroupFromCloud = async () => {};

  await context.testApp.syncOnline();
  await context.testApp.syncOnline();
  const resolutions = state.getGroup(groupId).events.filter((event) => event.type === "RATE_RESOLVED");
  assert.equal(resolutions.length, 1);
  assert.ok(published.includes("RATE_RESOLVED"));
  assert.equal(expense.data.groupAmount, null);
});
