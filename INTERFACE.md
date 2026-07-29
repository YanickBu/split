# Split v2 Ledger Protocol & API Integration Specification

This document details the data schemas, networking layer, cryptographic validation, and mathematical rules required to build alternative client frontends (e.g., Telegram/Discord bots, desktop WPF apps, native Android Java apps) that interoperate with the Split PWA ledger.

---

## 1. Network Infrastructure & Real-Time Sync

All group data is shared peer-to-peer using **`ntfy.sh`** as a serverless pub/sub queue. 

* **Topic Namespace:** `split_v2_app_<groupId>` (where `<groupId>` is the unique group identifier).
* **Sync Mode:** Append-only transaction event log.

### A. Publishing Events
To record an event to the shared ledger, clients perform an `HTTP POST` request containing the event payload JSON.

```http
POST https://ntfy.sh/split_v2_app_<groupId>
Content-Type: application/json

{
  "id": "0x4b7f8e3290ab",
  "hash": "0x4b7f8e3290ab",
  "prevHash": "0x12a9b3c4f7e8",
  "type": "ADD_EXPENSE",
  "ts": 1700001200000,
  "source": "client_device_uuid",
  "data": { ... },
  "synced": false
}
```

### B. Subscribing to Live Events
To receive events in real-time, open a Server-Sent Events (SSE) stream.

```http
GET https://ntfy.sh/split_v2_app_<groupId>/sse
Accept: text/event-stream
```
*Note: ntfy wraps payloads in a metadata envelope. The client must parse the connection JSON and extract the underlying event payload from the `message` parameter if present.*

### C. Retrieving Group History
To recover history on launch, query the topic log.

```http
GET https://ntfy.sh/split_v2_app_<groupId>/json?poll=1&since=all
```
Clients must parse the returned JSON-lines payload, discard system message lines, and deduplicate events by `hash` or `id`.

---

## 2. Cryptographic Event Hashing (Ledger Integrity)

To prevent spoofing or unauthorized ledger manipulation, every transaction event is chained to the preceding event using a deterministic hashing algorithm. If any client receives a payload that breaks this hash sequence, it must discard it.

### The Payload String
The hash is calculated on a colon-separated string concatenation of the event fields:
`payload = groupId : type : ts : source : json_data : prevHash`

* **`json_data` rules:** Standardized JSON formatting. All keys inside `data` must be sorted alphabetically, and formatting must not contain spaces (deterministic serialization, similar to Python's `json.dumps(..., sort_keys=True)`).

### Javascript Hashing Implementation
```javascript
generateEventHash(groupId, type, ts, data, prevHash = '', source = '') {
  const payload = `${groupId}:${type}:${ts}:${source}:${JSON.stringify(data || {})}:${prevHash}`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, '0');
  return `0x${hex}`;
}
```

---

## 3. Event Ledger Schema

Every ledger event is structured using the following base properties:

| Key | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Equivalent to `hash`. Unique identifier of the event. |
| `hash` | String | The cryptographic hash chain signature of this event. |
| `prevHash` | String | The `hash` value of the immediate preceding event in the group history. |
| `type` | String | Event type token. |
| `ts` | Integer | Epoch millisecond timestamp when the event was appended. |
| `source` | String | The unique client device identifier (e.g. `dev_3f8a92`). |
| `data` | Object | Event-specific data properties. |

### Event Types

#### `INIT`
Emitted once on group creation. Must be the first event (`prevHash = ''`).
```json
"data": {
  "name": "Ski Trip 2026",
  "currency": "EUR",
  "creator": "Alice"
}
```

#### `ADD_MEMBER`
Appends a member to the group active roster.
```json
"data": {
  "name": "Bob"
}
```

#### `REMOVE_MEMBER`
Removes a member from the active roster. Does not alter historical balances.
```json
"data": {
  "name": "Bob"
}
```

#### `ADD_EXPENSE`
Records a transaction. 
```json
"data": {
  "title": "Pizza",
  "originalAmount": 45.0,
  "originalCurrency": "EUR",
  "groupAmount": 45.0,
  "isPendingRate": false,
  "payer": "Alice",
  "expenseDate": "2026-07-29",
  "splitMembers": ["Alice", "Bob", "Charlie"],
  "rateSnapshot": { "USD": 1.08, "EUR": 1.0 }
}
```
*Note: If `originalCurrency` matches the group settlement currency, `groupAmount` equals `originalAmount` and `isPendingRate` is `false`. Otherwise, `groupAmount` is calculated using current rates. If the device was offline, `isPendingRate` is set to `true` and resolved later.*

#### `STORNO_EXPENSE`
Voids an expense. 
```json
"data": {
  "expenseId": "0x4b7f8e3290ab"
}
```
*Note: Ledger entries are immutable. To cancel an expense, clients must not delete the `ADD_EXPENSE` event; they append a `STORNO_EXPENSE` referencing its ID instead.*

#### `SETTLE_UP`
Flags ledger settlements. Followed by bulk appending `STORNO_EXPENSE` logs for all active historical expenses to reset balances to zero.
```json
"data": {
  "ts": 1700001800000
}
```

---

## 4. Balance & Settlement Calculation Rules

To ensure every client displays identical debt net-outs, they must implement the following math rules.

### Balance Derivation Flow
1. Fetch all events and sort them chronologically (`ts` ascending).
2. Collect all voided IDs by checking `STORNO_EXPENSE` elements.
3. Traverse the list:
   - Skip `ADD_EXPENSE` events whose `id` or `hash` resides in the voided IDs set.
   - Read the expense `groupAmount`.
   - Credit the `payer` with `amount`.
   - Resolve split participants: Use `splitMembers` if present. If empty or invalid, fallback to the group's active `members` roster at the moment the event occurred.
   - Divide the cents: Convert `amount` to integer cents: `cents = amount * 100`.
   - Derive base share: `base = Math.floor(cents / numMembers)`.
   - Derive remainder: `remainder = cents - (base * numMembers)`.
   - Distribute values: Allocate base share to all participants. Distribute remainder cents (`1 cent` each) to the first members in the `splitMembers` array until `remainder` is zero.
   - Debit each member's balance by their allocated share.
4. Round final balances to 2 decimal places.

### Debt Minimization (Greedy Settlement Algorithm)
To calculate who owes whom:
1. Split members into **Debtors** (balance < 0) and **Creditors** (balance > 0).
2. Sort both lists descending by absolute value.
3. Greedily net-out amounts:
   - Match the top debtor and top creditor.
   - Create a settlement transaction for the minimum of their absolute balances: `amount = min(debt, credit)`.
   - Subtract `amount` from both balances.
   - If a member's absolute balance falls below `0.005`, remove them from the list.
   - Repeat matching until both lists are empty.
