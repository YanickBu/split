import test from 'node:test';
import assert from 'node:assert/strict';
import {event,project,parseMoney,formatMoney,nextClock,exponent} from '../js/ledger.js';

const ids=Array.from({length:30},(_,i)=>i.toString(16).padStart(32,'0'));
const groupId=ids[0], alice=ids[1], bob=ids[2], cara=ids[3];
const make=(clock,type,data,i)=>event(groupId,clock,type,data,ids[i]);
const create=make(0,'CREATE_GROUP',{name:'Trip',currency:'USD',exponent:2,creatorId:alice,creatorName:'Alice'},4);
const addBob=make(1,'ADD_MEMBER',{memberId:bob,name:'Bob'},5);
const addCara=make(2,'ADD_MEMBER',{memberId:cara,name:'Cara'},6);
const expense=(amount='1000',currency='USD',group=amount)=>({title:'Lunch',payerId:alice,participants:[alice,bob,cara],originalAmountMinor:amount,originalCurrency:currency,originalExponent:2,groupAmountMinor:group,provenance:group===null?null:{method:'same'}});
const add=make(3,'ADD_EXPENSE',{expense:expense()},7);
test('exact money and payer-friendly rounding',()=>{
  assert.equal(parseMoney('10.00',2),'1000');assert.equal(formatMoney('-334',2),'-3.34');
  assert.throws(()=>parseMoney('1.001',2));assert.equal(parseMoney('42',0),'42');
  assert.equal(exponent('JPY'),0);assert.equal(exponent('KWD'),3);
  const p=project([add,addCara,create,addBob,add],groupId);
  assert.deepEqual(p.balances,{[alice]:'668',[bob]:'-334',[cara]:'-334'});
  assert.equal(p.expenses[0].roundingBonusMinor,'2');assert.equal(p.transfers.length,2);
});
test('integer conservation and bounded bonus across many amounts and splits',()=>{
  for(let amount=1;amount<=301;amount++)for(let count=1;count<=3;count++){
    const x={...expense(String(amount)),participants:[alice,bob,cara].slice(0,count)};
    const e=make(3,'ADD_EXPENSE',{expense:x},8);
    const p=project([create,addBob,addCara,e],groupId),bonus=BigInt(p.expenses[0].roundingBonusMinor);
    assert.equal(Object.values(p.balances).reduce((sum,n)=>sum+BigInt(n),0n),0n);
    assert.ok(bonus>=0n&&bonus<BigInt(count));
  }
});
test('replay independent of arrival order, duplicate delivery, and collision quarantine',()=>{
  const source=[create,addBob,addCara,add];
  assert.deepEqual(project(source,groupId).balances,project([...source].reverse(),groupId).balances);
  const collision={...add,data:{expense:expense('999')}};
  const p=project([...source,collision],groupId);assert.equal(p.expenses.length,0);assert.match(p.errors.join(),/collision/);
});
test('void is terminal and last edit wins',()=>{
  const edit=make(4,'EDIT_EXPENSE',{expenseId:add.id,expense:expense('2000')},8);
  const voided=make(5,'VOID_EXPENSE',{expenseId:add.id},9);
  assert.equal(project([create,addBob,addCara,add,edit],groupId).expenses[0].groupAmountMinor,'2000');
  assert.equal(project([create,addBob,addCara,add,edit,voided],groupId).balances[alice],'0');
});
test('unresolved FX is provisional; manual resolution wins and stale revisions do not apply',()=>{
  const foreign=make(3,'ADD_EXPENSE',{expense:expense('1000','EUR',null)},10);
  const manual=make(4,'RESOLVE_RATE',{expenseId:foreign.id,revisionId:foreign.id,originalAmountMinor:'1000',originalCurrency:'EUR',groupAmountMinor:'1200',method:'manual'},11);
  const provider=make(5,'RESOLVE_RATE',{expenseId:foreign.id,revisionId:foreign.id,originalAmountMinor:'1000',originalCurrency:'EUR',groupAmountMinor:'1100',method:'provider',provider:'Example',rateDate:'2026-01-01',rate:'1.1'},12);
  const base=[create,addBob,addCara,foreign];
  assert.equal(project(base,groupId).pending.length,1);
  assert.equal(project([...base,manual,provider],groupId).expenses[0].groupAmountMinor,'1200');
  const edit=make(5,'EDIT_EXPENSE',{expenseId:foreign.id,expense:expense('2000','EUR',null)},13);
  assert.equal(project([...base,manual,provider,edit],groupId).pending.length,1);
  const earlierIdEdit=make(5,'EDIT_EXPENSE',{expenseId:foreign.id,expense:expense('2000','EUR',null)},'0'.repeat(31)+'a');
  const laterIdEdit=make(5,'EDIT_EXPENSE',{expenseId:foreign.id,expense:expense('2000','EUR',null)},'f'.repeat(32));
  assert.equal(project([...base,provider,earlierIdEdit],groupId).pending.length,1);
  assert.equal(project([...base,provider,laterIdEdit],groupId).pending.length,1);
});
test('member changes, pending references, locked removal and clock overflow',()=>{
  const late=make(1,'ADD_EXPENSE',{expense:{...expense(),participants:[alice,bob]}},14);
  assert.equal(project([create,late],groupId).pending.length,1);
  const laterBob=make(2,'ADD_MEMBER',{memberId:bob,name:'Bob'},18);
  assert.match(project([create,late,laterBob],groupId).errors.join(),/declared after expense/);
  const removed=make(3,'REMOVE_MEMBER',{memberId:bob},15);
  assert.match(project([create,addBob,addCara,add,removed],groupId).errors.join(),/Removal locked/);
  const huge=make(Number.MAX_SAFE_INTEGER,'ADD_MEMBER',{memberId:ids[16],name:'Max'},17);
  assert.throws(()=>nextClock([create,huge],groupId),/exhausted/);
});
