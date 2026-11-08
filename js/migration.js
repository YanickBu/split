import {Y,createClient,LiveblocksYjsProvider} from './vendor.js';
import {canonical,exponent,formatMoney} from './ledger.js';

const PUBLIC_KEY='pk_dev_RapxKA-xWsl0m4as-dVuRlRXjPNnVnwzdr0mCZIVyDQCeZ_-T6rWUbsEx96i1A-_';
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const utf8=new TextEncoder();
export async function memberId(oldId,name){return digest(utf8.encode(`${oldId}\0${name}`));}
export async function semanticDigest(source){const events=source.events.filter(e=>e.type!=='MIGRATED_TO_V4').map(canonical).sort();return digest(utf8.encode(canonical({id:source.id,name:source.name,currency:source.currency,initialMembers:source.initialMembers,events})));}
export function halfUpDecimal(text,exp){
  const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(text);if(!m)throw Error(`Cannot convert ${text} exactly; review manually`);
  const scale=10n**BigInt(exp),digits=m[3]||'',kept=digits.slice(0,exp).padEnd(exp,'0'),next=digits[exp]||'0';
  const n=BigInt(m[2])*scale+BigInt(kept||'0')+(next>='5'?1n:0n);return `${m[1]==='-'&&n?'-':''}${n}`;
}
function v3members(events,fallback){if(!events.some(e=>e.type==='INIT'))return [...fallback];const members=new Set();for(const e of [...events].sort((a,b)=>{const clock=(a.ts||0)-(b.ts||0);if(clock)return clock;const x=String(a.hash||a.id||''),y=String(b.hash||b.id||'');return x<y?-1:x>y?1:0;})){if(e.type==='INIT'&&e.data?.creator)members.add(e.data.creator);if(e.type==='ADD_MEMBER'&&e.data?.name)members.add(e.data.name);if(e.type==='REMOVE_MEMBER'&&e.data?.name)members.delete(e.data.name);}return [...members];}
function v3expenses(events){const voided=new Set(),edits=new Map();for(const e of events){if(e.type==='STORNO_EXPENSE'){if(e.data?.targetHash)voided.add(e.data.targetHash);if(e.data?.expenseId)voided.add(e.data.expenseId);}if(e.type==='EDIT_EXPENSE'&&e.data?.targetHash){const a=edits.get(e.data.targetHash)||[];a.push(e);edits.set(e.data.targetHash,a);}}
  const rates=new Map();for(const e of events)if(e.type==='RATE_RESOLVED'&&e.data?.expenseId){const prior=rates.get(e.data.expenseId);if(!prior||e.ts>prior.ts||e.ts===prior.ts&&String(e.id)>String(prior.id))rates.set(e.data.expenseId,e);}
  return events.filter(e=>e.type==='ADD_EXPENSE'&&!voided.has(e.hash||e.id)).map(e=>{const d={...e.data};for(const edit of (edits.get(e.hash||e.id)||[]).sort((a,b)=>(a.ts||0)-(b.ts||0)))Object.assign(d,edit.data?.changes||{});const rate=rates.get(e.hash||e.id);if(rate)d.groupAmount=rate.data.groupAmount;return {event:e,data:d};});
}
export function previewLegacy(source){
  if(new Set(source.members).size!==source.members.length)throw Error('Duplicate v3 names are ambiguous; rename manually or start a new group');
  const adds=source.events.filter(e=>e.type==='ADD_MEMBER'&&e.data?.name).map(e=>e.data.name);
  if(new Set(adds).size!==adds.length)throw Error('Repeated v3 member names are ambiguous; start a new group or review manually');
  const current=v3members(source.events,source.members),names=new Set(current),initial=source.events.find(e=>e.type==='INIT');
  if(initial?.data?.currency&&initial.data.currency!==source.currency)throw Error('v3 initial currency differs from current currency; review required');
  for(const e of source.events){if(e.data?.payer)names.add(e.data.payer);for(const n of e.data?.splitMembers||[])names.add(n);if(e.type==='ADD_MEMBER'||e.type==='REMOVE_MEMBER')if(e.data?.name)names.add(e.data.name);}
  const balances=Object.fromEntries([...names].map(n=>[n,0])),rows=[],drift=[];
  for(const {event:e,data:d} of v3expenses(source.events)){
    const amount=Number(d.groupAmount),stored=String(d.groupAmount),original=Array.isArray(d.splitMembers)?d.splitMembers:null;
    if(!Number.isFinite(amount)||amount<=0)throw Error(`Expense ${e.id} has missing or nonfinite group amount; manual review required`);
    let effective=original?.length?original.filter(n=>current.includes(n)):current;
    if(!effective.length)effective=current.length?current:[d.payer];
    if(!effective.length||!d.payer)throw Error(`Expense ${e.id} has ambiguous payer or split`);
    const rounded=Math.round((amount+Number.EPSILON)*100)/100;
    const cents=Math.ceil((rounded*100)/effective.length);
    const credited=cents*effective.length/100;
    balances[d.payer]=(balances[d.payer]||0)+credited;
    for(const n of effective)balances[n]=(balances[n]||0)-cents/100;
    const row={id:e.id,stored,numberString:amount.toString(),halfUp:halfUpDecimal(amount.toString(),exponent(source.currency)),originalSplit:original,effectiveSplit:effective,payer:d.payer,credited,share:cents/100};rows.push(row);
    if(!original||original.some(n=>!current.includes(n)))drift.push(row);
  }
  for(const n of Object.keys(balances))balances[n]=Math.round((balances[n]+Number.EPSILON)*100)/100;
  const proposed={};for(const [name,value] of Object.entries(balances))proposed[name]=halfUpDecimal(value.toString(),exponent(source.currency));
  return {current,names:[...names],balances,proposed,rows,drift,currency:source.currency,groupName:source.name,initialMembers:initial?.data?.members||source.members};
}
export async function openLegacy(oldId){
  if(!navigator.onLine)throw Error('Migration requires a network connection');
  const doc=new Y.Doc(),client=createClient({publicApiKey:PUBLIC_KEY}),{room,leave}=client.enterRoom('split-v3-'+oldId),provider=new LiveblocksYjsProvider(room,doc);
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('v3 room did not sync')),20000);provider.on('sync',yes=>{if(yes){clearTimeout(timer);resolve();}});});
    const group=doc.getMap('group'),events=doc.getArray('events').toArray(),bytes=Y.encodeStateAsUpdate(doc);
    if(!group.get('id'))throw Error('v3 group is unavailable');
    if(bytes.length>500000)throw Error('v3 archive exceeds safe pilot room size; export externally and start a new group');
    const source={id:oldId,name:group.get('name'),currency:group.get('currency'),members:group.get('members')||[],events};
    source.initialMembers=source.events.find(e=>e.type==='INIT')?.data?.members||source.members;
    const archiveDigest=await digest(bytes),semantic=await semanticDigest(source);
    return {source,bytes,archiveDigest,semantic,preview:previewLegacy(source),markers:events.filter(e=>e.type==='MIGRATED_TO_V4'),doc,provider,leave};
  }catch(e){provider.destroy();leave();doc.destroy();throw e;}
}
export async function openRootLegacy(oldId){
  let groups;try{groups=JSON.parse(localStorage.getItem('split_groups')||'{}');}catch{throw Error('Old local group data could not be read');}
  const group=groups[oldId];if(!group)throw Error('This device has no local copy of that old group. Use the device that last opened it, or recover a raw backup before switching.');
  if(!Array.isArray(group.events)||!Array.isArray(group.members))throw Error('Old group data is incomplete');
  const bytes=utf8.encode(JSON.stringify(group));
  if(bytes.length>500000)throw Error('Old archive exceeds safe pilot room size; export it separately and start a new group');
  const source={id:oldId,name:group.name,currency:group.currency,members:group.members,events:group.events,initialMembers:group.events.find(e=>e.type==='INIT')?.data?.members||group.members};
  return {kind:'root',source,bytes,archiveDigest:await digest(bytes),semantic:await semanticDigest(source),preview:previewLegacy(source),markers:[]};
}
export function closeLegacy(session){session?.provider?.destroy();session?.leave?.();session?.doc?.destroy();}
export function downloadLegacy(session){const blob=new Blob([session.bytes],{type:session.kind==='root'?'application/json':'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`split-${session.kind==='root'?'legacy':'v3'}-${session.source.id}-${session.archiveDigest}.${session.kind==='root'?'json':'yjs'}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
