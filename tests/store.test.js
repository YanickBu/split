import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Y} from '../js/vendor.js';
import {event} from '../js/ledger.js';

const {GroupStore}=await import('../js/store.js');
const id='0'.repeat(32), creator='1'.repeat(32);
const create=event(id,0,'CREATE_GROUP',{name:'Trip',currency:'USD',exponent:2,creatorId:creator,creatorName:'Alice'},'2'.repeat(32));
test('local archive survives Yjs deletion and retains ID collisions',async()=>{
  const store=new GroupStore();store.groupId=id;store.ydoc=new Y.Doc();store.events=store.ydoc.getArray('events');
  await store.append(create);assert.equal(store.events.length,1);assert.equal(store.raw.length,1);
  store.events.delete(0,1);await store.reconcile();assert.equal(store.events.length,1);
  const conflicting={...create,data:{...create.data,name:'Other'}};
  await store.append(conflicting);assert.equal(store.raw.length,2);
  assert.match(store.projection().errors.join(),/ID collision/);
  const archive=store.export();assert.equal(archive.events.length,2);
  await store.import(id,archive);assert.equal(store.raw.length,2);
  store.ydoc.destroy();
});
