import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createApp(groups = {}) {
  const appElement = { innerHTML: "", style: {} };
  const state = { data: { groups }, getGroup: (id) => groups[id] };
  const context = {
    document: { addEventListener() {}, getElementById: () => appElement },
    window: { location: { hash: "" } },
    navigator: { onLine: true },
    State: state,
    EventSourcing: { subscribe() {}, unsubscribe() {} },
    UIComponents: { renderGroupDashboard: () => "", renderGroupsList: () => "" },
    JSONBin: {},
    Currency: {},
    console,
    setInterval: () => 1,
    clearInterval() {},
  };
  vm.runInNewContext(readFileSync("js/app.js", "utf8") + "\nglobalThis.testApp = App;", context);
  return context;
}

test("rerendering an open group starts cloud reconciliation once", async () => {
  const group = { id: "group-1", name: "Trip", pendingDeltas: [], events: [] };
  const context = createApp({ "group-1": group });
  const app = context.testApp;
  let reads = 0;
  app.syncGroupFromCloud = async () => { reads++; };
  context.window.location.hash = "#group=group-1";

  await app.render();
  await app.render();
  assert.equal(reads, 1);

  context.window.location.hash = "";
  await app.render();
  context.window.location.hash = "#group=group-1";
  await app.render();
  assert.equal(reads, 2);
});

test("simultaneous retry requests share one sync operation", async () => {
  const context = createApp();
  const app = context.testApp;
  let calls = 0;
  let finish;
  context.Currency.fetchRates = () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  };

  const first = app.syncOnline();
  const second = app.syncOnline();
  assert.equal(calls, 1);
  finish();
  await Promise.all([first, second]);
});

test("equal timestamp ledger events replay in the same order on every device", () => {
  const context = {
    localStorage: { getItem: () => null },
    console,
  };
  vm.runInNewContext(readFileSync("js/state.js", "utf8") + "\nglobalThis.testState = State;", context);
  const state = context.testState;
  const init = { type: "INIT", ts: 1, hash: "init", data: { creator: "Alice" } };
  const add = { type: "ADD_MEMBER", ts: 2, hash: "a", data: { name: "Bob" } };
  const remove = { type: "REMOVE_MEMBER", ts: 2, hash: "b", data: { name: "Bob" } };

  for (const events of [[init, add, remove], [remove, init, add]]) {
    state.data.groups.trip = { events: [...events], members: [] };
    state.rehydrate("trip");
    assert.deepEqual(Array.from(state.data.groups.trip.members), ["Alice"]);
  }
});

test("live delivery alone keeps an event pending for durable retry", async () => {
  const event = { id: "expense-1", hash: "expense-1", type: "ADD_EXPENSE" };
  const group = { id: "group-1", events: [event], pendingDeltas: ["expense-1"] };
  const context = createApp({ "group-1": group });
  const app = context.testApp;
  context.EventSourcing.publish = async () => true;
  context.JSONBin.sync = async () => false;
  app.syncGroupFromCloud = async () => {};

  await app.publishAndSync("group-1", event);
  assert.deepEqual(group.pendingDeltas, ["expense-1"]);
  assert.equal(app._retryTimerId, 1);
});
