import assert from 'assert';
import Settlement from './js/settlement.js';

global.Currency = {
  format: (amount, code) => `${code} ${amount.toFixed(2)}`
};

function test(name, fn) {
  try {
    fn();
    console.log(`[TEST] ${name} -> ✓ PASS`);
  } catch (e) {
    console.log(`[TEST] ${name} -> ✗ FAIL: ${e.message}`);
  }
}

test("Single Currency Equal Split", () => {
  const group1 = {
    currency: 'USD',
    members: ['Alice', 'Bob', 'Charlie'],
    events: [
      { type: 'ADD_EXPENSE', data: { payer: 'Alice', groupAmount: 90, splitMembers: ['Alice', 'Bob', 'Charlie'] } }
    ]
  };
  const balances = Settlement.calculateBalances(group1);
  assert.strictEqual(Math.round(balances['Alice']), 60);
  assert.strictEqual(Math.round(balances['Bob']), -30);
  assert.strictEqual(Math.round(balances['Charlie']), -30);
});

test("Multi-Border Currency Conversion", () => {
  const group2 = {
    currency: 'USD',
    members: ['Sarah', 'Alex'],
    events: [
      { type: 'ADD_EXPENSE', data: { payer: 'Sarah', groupAmount: 50, splitMembers: ['Sarah', 'Alex'] } }
    ]
  };
  const balances = Settlement.calculateBalances(group2);
  assert.strictEqual(Math.round(balances['Sarah']), 25);
  assert.strictEqual(Math.round(balances['Alex']), -25);
});
