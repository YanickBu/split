import {Y, IndexeddbPersistence, createClient, LiveblocksYjsProvider} from './vendor.js';
import {canonical, project, validateEvent} from './ledger.js';

const PUBLIC_KEY='pk_dev_RapxKA-xWsl0m4as-dVuRlRXjPNnVnwzdr0mCZIVyDQCeZ_-T6rWUbsEx96i1A-_';
const dbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open('split-v4-archive',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('events',{keyPath:'key'});
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
});
async function entries(groupId) {
  const db=await dbPromise;
  return new Promise((resolve,reject)=>{const req=db.transaction('events').objectStore('events').getAll();req.onsuccess=()=>resolve(req.result.filter(x=>x.groupId===groupId).map(x=>x.event));req.onerror=()=>reject(req.error);});
}
async function save(groupId,event) {
  const db=await dbPromise, key=groupId+':'+event.id+':'+canonical(event);
  return new Promise((resolve,reject)=>{const tx=db.transaction('events','readwrite');tx.objectStore('events').put({key,groupId,event});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export class GroupStore {
  constructor() {this.groupId=null;this.raw=[];this.listeners=new Set();this.status='offline';this.remoteVerified=new Set();this.shrunk=false;}
  async open(groupId) {
    this.close();this.groupId=groupId;this.raw=await entries(groupId);this.emit();
    this.ydoc=new Y.Doc();this.events=this.ydoc.getArray('events');
    this.persistence=new IndexeddbPersistence('split-v4-'+groupId,this.ydoc);
    this.events.observe(()=>this.reconcile());
    this.persistence.on('synced',()=>this.reconcile());
    // Remote connection starts only after local events have been delivered.
    this.client=createClient({publicApiKey:PUBLIC_KEY});
    const {room,leave}=this.client.enterRoom('split-v4-'+groupId);this.room=room;this.leave=leave;
    this.provider=new LiveblocksYjsProvider(room,this.ydoc);
    room.subscribe('status',status=>{this.status=status;this.emit();if(status==='connected')this.reconcile();});
    await this.reconcile();
    navigator.storage?.persist?.().catch(()=>{});
    return this.raw;
  }
  close() {this.provider?.destroy();this.leave?.();this.persistence?.destroy();this.ydoc?.destroy();this.provider=null;this.listeners.clear();}
  subscribe(groupId,onChange) {if(groupId!==this.groupId) throw Error('Group is not open');this.listeners.add(onChange);onChange(this.raw);return ()=>this.listeners.delete(onChange);}
  emit() {for(const fn of this.listeners) fn(this.raw);}
  async append(e) {
    if(e.groupId!==this.groupId) throw Error('Wrong group');
    const bad=validateEvent(e,this.groupId);if(bad) throw Error(bad);
    await save(this.groupId,e); // local commit must finish before Yjs write
    await this.reconcile();return e;
  }
  async reconcile(groupId=this.groupId) {
    if(groupId!==this.groupId) throw Error('Wrong group');
    if(this.reconciling) {this.again=true;return;}
    this.reconciling=true;
    try {
      do {
        this.again=false;
        const local=await entries(groupId),remote=this.events?.toArray()||[];
        const union=new Map();for(const e of [...local,...remote]) union.set(canonical(e),e);
        for(const e of remote) if(!local.some(x=>canonical(x)===canonical(e))) await save(groupId,e);
        const remoteKeys=new Set(remote.map(canonical));
        const absent=local.filter(e=>!remoteKeys.has(canonical(e)));
        if(absent.length) {this.shrunk=true;this.events.push(absent);}
        this.raw=[...union.values()];this.emit();
      } while(this.again);
    } finally {this.reconciling=false;}
  }
  async verifyRemote() {
    if(this.status!=='connected') return false;
    const doc=new Y.Doc(),client=createClient({publicApiKey:PUBLIC_KEY}),{room,leave}=client.enterRoom('split-v4-'+this.groupId),provider=new LiveblocksYjsProvider(room,doc);
    try {
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Read-back timed out')),15000);provider.on('sync',yes=>{if(yes){clearTimeout(timer);resolve();}});});
      const remote=new Set(doc.getArray('events').toArray().map(canonical));
      const verified=this.raw.every(e=>remote.has(canonical(e)));
      if(verified)for(const e of this.raw)this.remoteVerified.add(canonical(e));
      return verified;
    } finally {provider.destroy();leave();doc.destroy();}
  }
  export(groupId=this.groupId) {if(groupId!==this.groupId) throw Error('Wrong group');return {format:'split-v4',schemaVersion:1,groupId,events:this.raw,legacyArchive:this.ydoc?.getMap('legacy').get('archive')||null};}
  async import(groupId,archive) {
    if(groupId!==this.groupId||archive?.format!=='split-v4'||archive.groupId!==groupId||!Array.isArray(archive.events)) throw Error('Invalid archive');
    for(const e of archive.events) {if(e?.groupId!==groupId) throw Error('Wrong group event');await save(groupId,e);}
    if(archive.legacyArchive&&!this.ydoc.getMap('legacy').get('archive')) this.ydoc.getMap('legacy').set('archive',archive.legacyArchive);
    await this.reconcile();
  }
  projection() {return project(this.raw,this.groupId);}
}
