import test from 'node:test';
import assert from 'node:assert/strict';
import {previewLegacy,halfUpDecimal,semanticDigest,openRootLegacy} from '../js/migration.js';

test('legacy diagnostic preserves stored amount and flags removed participant drift',()=>{
  const source={id:'old',name:'Trip',currency:'USD',members:['Alice'],events:[
    {id:'init',type:'INIT',ts:1,data:{creator:'Alice',currency:'USD'}},
    {id:'member',type:'ADD_MEMBER',ts:1.5,data:{name:'Bob'}},
    {id:'expense',hash:'expense',type:'ADD_EXPENSE',ts:2,data:{payer:'Alice',groupAmount:10,splitMembers:['Alice','Bob']}},
    {id:'remove',type:'REMOVE_MEMBER',ts:3,data:{name:'Bob'}}
  ]};
  const p=previewLegacy(source);assert.equal(p.drift.length,1);assert.deepEqual(p.drift[0].effectiveSplit,['Alice']);
  assert.equal(p.rows[0].stored,'10');assert.equal(p.rows[0].halfUp,'1000');
  assert.equal(p.proposed.Alice,'0');assert.equal(halfUpDecimal('-1.005',2),'-101');
});
test('semantic digest ignores migration markers but detects later edits',async()=>{
  const source={id:'old',name:'Trip',currency:'USD',initialMembers:['Alice'],events:[{id:'one',type:'INIT',data:{creator:'Alice'}}]};
  const a=await semanticDigest(source);
  assert.equal(await semanticDigest({...source,events:[...source.events,{id:'marker',type:'MIGRATED_TO_V4'}]}),a);
  assert.notEqual(await semanticDigest({...source,events:[...source.events,{id:'edit',type:'EDIT_EXPENSE'}]}),a);
});
test('old root link can be reviewed from retained local data',async()=>{
  const id='grp_older',group={id,name:'Old trip',currency:'USD',members:['Alice','Bob'],events:[
    {id:'init',type:'INIT',ts:1,data:{creator:'Alice',currency:'USD'}},
    {id:'member',type:'ADD_MEMBER',ts:1.5,data:{name:'Bob'}},
    {id:'expense',hash:'expense',type:'ADD_EXPENSE',ts:2,data:{payer:'Alice',groupAmount:10,splitMembers:['Alice','Bob']}},
    {id:'rate',type:'RATE_RESOLVED',ts:3,data:{expenseId:'expense',groupAmount:12}}
  ]};
  globalThis.localStorage={getItem:key=>key==='split_groups'?JSON.stringify({[id]:group}):null};
  const session=await openRootLegacy(id);assert.equal(session.kind,'root');assert.equal(session.preview.proposed.Alice,'600');assert.equal(session.preview.proposed.Bob,'-600');
  delete globalThis.localStorage;
});
