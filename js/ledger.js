// Split v4 event schema. All money values are decimal integer strings.
export const exponent = code => new Intl.NumberFormat('en',{style:'currency',currency:code}).resolvedOptions().maximumFractionDigits;
export const canonical = value => JSON.stringify(value, (_key, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const validId = x => typeof x === 'string' && /^[0-9a-f]{32,}$/i.test(x);
export const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const minor = x => typeof x === 'string' && /^(0|[1-9][0-9]*)$/.test(x) ? BigInt(x) : null;
export const signed = x => typeof x === 'string' && /^(0|-?[1-9][0-9]*)$/.test(x) ? BigInt(x) : null;
export function parseMoney(input, exp) {
  if (!Number.isInteger(exp) || exp < 0 || exp > 4 || !/^[0-9]+(?:\.[0-9]+)?$/.test(input)) throw Error('Invalid amount');
  const [whole, fraction = ''] = input.split('.');
  if (fraction.length > exp) throw Error(`Use at most ${exp} decimal places`);
  const n = BigInt(whole) * 10n ** BigInt(exp) + BigInt((fraction.padEnd(exp, '0') || '0'));
  if (n <= 0n) throw Error('Amount must be positive');
  return n.toString();
}
export function formatMoney(value, exp) {
  const n = BigInt(value), unit = 10n ** BigInt(exp), abs = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${abs / unit}${exp ? '.' + String(abs % unit).padStart(exp, '0') : ''}`;
}
export const order = (a,b) => a.clock - b.clock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function validateEvent(e, groupId) {
  if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).sort().join() !== 'clock,data,groupId,id,schemaVersion,type') return 'Bad event fields';
  if (e.schemaVersion !== 1) return 'Unknown schema version';
  if (e.groupId !== groupId || !validId(e.id) || !Number.isSafeInteger(e.clock) || e.clock < 0 || typeof e.data !== 'object' || !e.data || Array.isArray(e.data)) return 'Bad event header';
  if ((e.type === 'CREATE_GROUP') !== (e.clock === 0)) return 'Bad creation clock';
  const d=e.data;
  if (e.type === 'CREATE_GROUP') return typeof d.name === 'string' && d.name.trim() && /^[A-Z]{3}$/.test(d.currency) && Number.isInteger(d.exponent) && d.exponent>=0 && d.exponent<=4 && validId(d.creatorId) && typeof d.creatorName === 'string' && d.creatorName.trim() ? null : 'Bad group';
  if (e.type === 'ADD_MEMBER') return validId(d.memberId) && typeof d.name === 'string' && d.name.trim() ? null : 'Bad member';
  if (e.type === 'REMOVE_MEMBER') return validId(d.memberId) ? null : 'Bad removal';
  if (e.type === 'ADD_EXPENSE' || e.type === 'EDIT_EXPENSE') {
    if (e.type === 'EDIT_EXPENSE' && !validId(d.expenseId)) return 'Bad expense reference';
    return validateExpense(d.expense) ? null : 'Bad expense';
  }
  if (e.type === 'VOID_EXPENSE') return validId(d.expenseId) ? null : 'Bad void';
  if (e.type === 'RESOLVE_RATE') return validId(d.expenseId) && validId(d.revisionId) && minor(d.originalAmountMinor) > 0n && /^[A-Z]{3}$/.test(d.originalCurrency) && minor(d.groupAmountMinor) > 0n && (d.method === 'manual' || d.method === 'provider' && typeof d.provider === 'string' && /^\d{4}-\d\d-\d\d$/.test(d.rateDate) && /^\d+(?:\.\d+)?$/.test(d.rate)) ? null : 'Bad rate resolution';
  if (e.type === 'LEGACY_OPENING') return d.balances && typeof d.balances === 'object' && !Array.isArray(d.balances) && Object.keys(d.balances).length && Object.entries(d.balances).every(([id,v])=>validId(id) && signed(v) !== null) && Object.values(d.balances).reduce((s,v)=>s+BigInt(v),0n)===0n && typeof d.archiveDigest === 'string' ? null : 'Bad opening';
  return 'Unknown event type';
}
export function validateExpense(x) {
  return !!x && typeof x.title === 'string' && !!x.title.trim() && validId(x.payerId) && Array.isArray(x.participants) && x.participants.length > 0 && new Set(x.participants).size === x.participants.length && x.participants.every(validId) && /^[A-Z]{3}$/.test(x.originalCurrency) && Number.isInteger(x.originalExponent) && x.originalExponent>=0 && x.originalExponent<=4 && minor(x.originalAmountMinor) > 0n && (x.groupAmountMinor === null || minor(x.groupAmountMinor) > 0n) && (x.groupAmountMinor === null || x.provenance && typeof x.provenance === 'object');
}
export function event(groupId, clock, type, data, id = randomId()) { return {schemaVersion:1,groupId,id,clock,type,data}; }
export function nextClock(events, groupId) {
  const max=events.filter(e=>!validateEvent(e,groupId)).reduce((n,e)=>Math.max(n,e.clock),0);
  if (max === Number.MAX_SAFE_INTEGER) throw Error('Logical clock exhausted');
  return max+1;
}
export function project(raw, groupId) {
  const errors=[], byId=new Map();
  for (const e of raw) {
    if (!e || typeof e.id !== 'string') { errors.push('Event without ID'); continue; }
    const key=canonical(e), claims=byId.get(e.id) || new Map(); claims.set(key,e); byId.set(e.id,claims);
  }
  const events=[];
  for (const [id,claims] of byId) {
    if (claims.size>1) { errors.push(`ID collision: ${id}`); continue; }
    const e=[...claims.values()][0], bad=validateEvent(e,groupId);
    if (bad) errors.push(`${id}: ${bad}`); else events.push(e);
  }
  events.sort(order);
  const creates=events.filter(e=>e.type==='CREATE_GROUP');
  if (creates.length!==1 || [...byId.values()].some(c=>[...c.values()].some(e=>e.type==='CREATE_GROUP') && c.size>1)) {
    errors.push('Group creation conflict'); return {group:null,members:[],expenses:[],balances:{},transfers:[],errors,provisional:true,pending:[]};
  }
  const group=creates[0].data, names=new Map([[group.creatorId,group.creatorName]]), active=new Set([group.creatorId]);
  const balances=new Map([[group.creatorId,0n]]), expenses=[], pending=[];
  const first=events.find(e=>e.type==='ADD_EXPENSE' || e.type==='LEGACY_OPENING');
  const edits=new Map(), voids=new Set(), rates=new Map();
  for(const e of events) {
    const id=e.data.expenseId;
    if(e.type==='EDIT_EXPENSE') { if(!edits.has(id)) edits.set(id,[]); edits.get(id).push(e); }
    if(e.type==='VOID_EXPENSE') voids.add(id);
    if(e.type==='RESOLVE_RATE') { if(!rates.has(id)) rates.set(id,[]); rates.get(id).push(e); }
  }
  const declaredAt=new Map([[group.creatorId,creates[0]]]);
  for(const e of events) if(e.type==='ADD_MEMBER'&&!declaredAt.has(e.data.memberId)) declaredAt.set(e.data.memberId,e);
  for(const e of events) {
    const d=e.data;
    if(e.type==='ADD_MEMBER') {
      if(names.has(d.memberId) && names.get(d.memberId)!==d.name) {errors.push(`${e.id}: Member name conflict`);continue;}
      names.set(d.memberId,d.name); declaredAt.set(d.memberId,declaredAt.get(d.memberId)||e); active.add(d.memberId); if(!balances.has(d.memberId)) balances.set(d.memberId,0n);
    }
    if(e.type==='REMOVE_MEMBER') {
      if(!names.has(d.memberId) || !active.has(d.memberId) || d.memberId===group.creatorId || first && e.clock>=first.clock) errors.push(`${e.id}: Removal locked or invalid`);
      else active.delete(d.memberId);
    }
    if(e.type==='LEGACY_OPENING') {
      if(Object.keys(d.balances).some(id=>!names.has(id))) {errors.push(`${e.id}: Unknown opening member`);continue;}
      for(const [id,v] of Object.entries(d.balances)) balances.set(id,(balances.get(id)||0n)+BigInt(v));
    }
    if(e.type!=='ADD_EXPENSE') continue;
    const revisions=[e,...(edits.get(e.id)||[])], winner=revisions.at(-1), x=winner.data.expense;
    if(winner!==e && x.originalCurrency!==group.currency && (x.originalCurrency!==e.data.expense.originalCurrency || x.originalAmountMinor!==e.data.expense.originalAmountMinor) && x.groupAmountMinor!==null) {errors.push(`${winner.id}: Changed foreign amount must clear resolution`);continue;}
    const ref=[x.payerId,...x.participants], missing=ref.filter(id=>!names.has(id));
    if(missing.length) {
      const future=missing.some(id=>declaredAt.has(id) && order(declaredAt.get(id),e)>0);
      if(future) errors.push(`${e.id}: Member declared after expense`); else pending.push({expenseId:e.id,reason:'Member event missing'});
      continue;
    }
    if(ref.some(id=>!active.has(id))) {errors.push(`${e.id}: Inactive member at expense`);continue;}
    const item={expenseId:e.id,revisionId:winner.id,...x,voided:voids.has(e.id),editConflict:revisions.length>2};
    if(x.originalCurrency===group.currency) {
      if(x.originalExponent!==group.exponent) {errors.push(`${e.id}: Currency exponent mismatch`);continue;}
      if(x.groupAmountMinor!==x.originalAmountMinor) {errors.push(`${e.id}: Same-currency amount mismatch`);continue;}
    } else {
      const applicable=(rates.get(e.id)||[]).filter(r=>r.data.revisionId===winner.id && r.data.originalAmountMinor===x.originalAmountMinor && r.data.originalCurrency===x.originalCurrency);
      const manual=applicable.filter(r=>r.data.method==='manual');
      const resolution=(manual.length?manual:applicable).at(-1);
      if(resolution) {item.groupAmountMinor=resolution.data.groupAmountMinor;item.provenance=resolution.data;}
    }
    expenses.push(item);
    if(item.voided) continue;
    if(item.groupAmountMinor===null) {pending.push({expenseId:e.id,amount:x.originalAmountMinor,currency:x.originalCurrency,exponent:x.originalExponent,reason:'Rate unresolved'});continue;}
    const amount=BigInt(item.groupAmountMinor), share=(amount+BigInt(x.participants.length)-1n)/BigInt(x.participants.length), billed=share*BigInt(x.participants.length);
    item.shareMinor=share.toString();item.roundingBonusMinor=(billed-amount).toString();
    balances.set(x.payerId,balances.get(x.payerId)+billed);
    for(const id of x.participants) balances.set(id,balances.get(id)-share);
  }
  if([...balances.values()].reduce((a,b)=>a+b,0n)!==0n) errors.push('Balance conservation failed');
  const members=[...names].map(([id,name])=>({id,name,active:active.has(id)}));
  return {group,members,expenses,balances:Object.fromEntries([...balances].map(([id,v])=>[id,v.toString()])),transfers:suggest(balances),errors,provisional:pending.length>0||errors.length>0,pending,removalLocked:!!first};
}
export function suggest(balances) {
  const debt=[...balances].filter(([,v])=>v<0n).map(([id,v])=>[id,-v]), credit=[...balances].filter(([,v])=>v>0n).map(([id,v])=>[id,v]), out=[];
  let i=0,j=0; while(i<debt.length&&j<credit.length) {const n=debt[i][1]<credit[j][1]?debt[i][1]:credit[j][1];out.push({from:debt[i][0],to:credit[j][0],amountMinor:n.toString()});debt[i][1]-=n;credit[j][1]-=n;if(!debt[i][1])i++;if(!credit[j][1])j++;} return out;
}
