import * as Y from 'https://esm.sh/yjs@13.6.14';
import { WebrtcProvider } from 'https://esm.sh/y-webrtc@13.2.1';
import { IndexeddbPersistence } from 'https://esm.sh/y-indexeddb@9.0.12';

// State
let expensesList = null;

async function init() {
  console.log("Initializing Yjs...");

  // 1. Create a Yjs Document
  const ydoc = new Y.Doc();
  
  // 2. Persist locally to IndexedDB so it works completely offline
  // 'split-v3-local' is the name of the database
  const persistence = new IndexeddbPersistence('split-v3-local', ydoc);
  
  persistence.on('synced', () => {
    console.log("Loaded local data from IndexedDB.");
    renderExpenses();
  });

  // 3. Connect to WebRTC for True P2P Sync
  // 'split-v3-room-xyz' is the "room name" peers will use to find each other
  const provider = new WebrtcProvider('split-v3-room-xyz', ydoc, {
    // We can use standard public signaling servers or host our own later
    signaling: [
      'wss://y-webrtc-signaling-eu.herokuapp.com',
      'wss://y-webrtc-signaling-us.herokuapp.com',
      'wss://signaling.yjs.dev'
    ]
  });
  
  provider.on('status', event => {
    const statusEl = document.getElementById('connectionStatus');
    if (event.status === 'connected') {
      statusEl.className = 'status online';
      statusEl.innerText = '🟢 Connected (P2P)';
    } else {
      statusEl.className = 'status offline';
      statusEl.innerText = '🔴 Offline';
    }
  });

  provider.on('peers', event => {
    const peers = event.webrtcPeers.length;
    const statusEl = document.getElementById('connectionStatus');
    if (provider.connected) {
      statusEl.innerText = `🟢 ${peers} Peer${peers !== 1 ? 's' : ''} Connected`;
    }
  });

  // 4. Define our Shared Data Structure
  expensesList = ydoc.getArray('expenses');
  
  // Re-render the UI whenever the data changes (even from another peer!)
  expensesList.observe(() => {
    renderExpenses();
  });

  // 5. Setup Form Listener
  document.getElementById('expenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const payer = document.getElementById('expensePayer').value;
    
    // Add to Yjs Array (this automatically syncs to peers & saves to IndexedDB)
    expensesList.push([{
      id: Date.now().toString(),
      title,
      amount,
      payer,
      timestamp: Date.now()
    }]);
    
    e.target.reset();
  });
}

function renderExpenses() {
  if (!expensesList) return;
  
  const container = document.getElementById('expensesList');
  const countEl = document.getElementById('expenseCount');
  
  // Y.Array gives us standard array methods
  const expenses = expensesList.toArray();
  
  // Sort newest first
  expenses.sort((a, b) => b.timestamp - a.timestamp);
  
  countEl.innerText = `${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`;
  
  if (expenses.length === 0) {
    container.innerHTML = `<div class="empty-state">No expenses yet. Add one above!</div>`;
    return;
  }
  
  container.innerHTML = expenses.map(exp => `
    <div class="expense-item">
      <div class="expense-info">
        <span class="expense-title">${escapeHTML(exp.title)}</span>
        <span class="expense-meta">Paid by ${escapeHTML(exp.payer)}</span>
      </div>
      <span class="expense-amount">$${exp.amount.toFixed(2)}</span>
    </div>
  `).join('');
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, function(match) {
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
    return map[match];
  });
}

// Start
init();
