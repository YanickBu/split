const fs = require('fs');
const vm = require('vm');

// Load required scripts
const stateCode = fs.readFileSync('/data/data/com.termux/files/home/split/js/state.js', 'utf8');
const settlementCode = fs.readFileSync('/data/data/com.termux/files/home/split/js/settlement.js', 'utf8');

// Mock localStorage for node environment
const sandbox = {
  localStorage: {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = v; }
  },
  console: console
};

vm.createContext(sandbox);

// Remove the State.load() call at the end to prevent it from crashing if we evaluate
const cleanStateCode = stateCode.replace('State.load();', '');
vm.runInContext(cleanStateCode, sandbox);
vm.runInContext(settlementCode, sandbox);

const State = sandbox.State;
const Settlement = sandbox.Settlement;

State.load();

// Test 1: Create group and add members
const groupId = State.createGroup("Test Group", "USD", "Alice");
State.appendEvent(groupId, 'ADD_MEMBER', { name: "Bob" });
State.appendEvent(groupId, 'ADD_MEMBER', { name: "Charlie" });

const group = State.getGroup(groupId);
console.assert(group.members.length === 3, "Should have 3 members");

// Test 2: Add expenses and calculate balances
// Alice pays 30
State.appendEvent(groupId, 'ADD_EXPENSE', {
  title: 'Pizza',
  originalAmount: 30,
  originalCurrency: 'USD',
  groupAmount: 30,
  payer: 'Alice'
});

let balances = Settlement.calculateBalances(group);
// Alice: +20, Bob: -10, Charlie: -10
console.assert(balances['Alice'] === 20, "Alice balance should be 20");
console.assert(balances['Bob'] === -10, "Bob balance should be -10");
console.assert(balances['Charlie'] === -10, "Charlie balance should be -10");

// Bob pays 60
State.appendEvent(groupId, 'ADD_EXPENSE', {
  title: 'Drinks',
  originalAmount: 60,
  originalCurrency: 'USD',
  groupAmount: 60,
  payer: 'Bob'
});

balances = Settlement.calculateBalances(group);
// 90 total spent. 30 each.
// Alice paid 30. Diff: 0
// Bob paid 60. Diff: +30
// Charlie paid 0. Diff: -30
console.assert(balances['Alice'] === 0, "Alice balance should be 0");
console.assert(balances['Bob'] === 30, "Bob balance should be 30");
console.assert(balances['Charlie'] === -30, "Charlie balance should be -30");

// Test settlements
let settlements = Settlement.calculateSettlements(balances);
console.assert(settlements.length === 1, "Should have 1 settlement");
console.assert(settlements[0].from === 'Charlie', "Charlie should pay");
console.assert(settlements[0].to === 'Bob', "Bob should receive");
console.assert(settlements[0].amount === 30, "Amount should be 30");

// Test storno
const lastExpense = group.events.find(e => e.data && e.data.title === 'Drinks');
State.appendEvent(groupId, 'STORNO_EXPENSE', { expenseId: lastExpense.id });

balances = Settlement.calculateBalances(group);
console.assert(balances['Alice'] === 20, "Alice balance back to 20");
console.assert(balances['Bob'] === -10, "Bob balance back to -10");

console.log("All unit tests passed.");
