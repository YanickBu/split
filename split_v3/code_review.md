# Code Review: Split V3 (P2P CRDT Architecture)

## 🏗️ Software Architect Review

**Overall Assessment:** 
The transition from an Event Sourcing model over a centralized pub/sub (ntfy.sh) to a Conflict-free Replicated Data Type (CRDT) model using Yjs and WebRTC is a massive architectural upgrade. It fundamentally solves the payload size limits and rate-limiting bottlenecks that bottlenecked V2.

**Strengths:**
* **Mathematical Eventual Consistency:** By leveraging Yjs (CRDTs), we mathematically guarantee that all peers will converge on the exact same state regardless of network order, offline edits, or simultaneous modifications.
* **True Local-First / Offline Support:** Using `y-indexeddb` means the app is fully functional offline. The CSV import process is no longer constrained by network I/O; it writes to local disk instantly and syncs in the background.
* **Network Efficiency:** WebRTC establishes direct peer-to-peer data channels. The server is only used for initial signaling (handshake), meaning our bandwidth costs are effectively zero and data privacy is significantly increased.

**Areas for Improvement / Risks:**
1. **Public Signaling Servers:** Currently relying on `wss://y-webrtc-signaling-eu.herokuapp.com` and `wss://signaling.yjs.dev`. These are great for MVPs but can be congested. *Recommendation: Deploy a lightweight self-hosted WebSockets signaling server (e.g., using `y-webrtc` backend) for production reliability.*
2. **Data Persistence / Cold Starts:** In true P2P, if User A's phone dies and they buy a new phone, they cannot recover their data unless User B (who has the group data) comes online at the same time. *Recommendation: Introduce a "Headless Peer" (a small script running on a server that simply joins all rooms and backs up the Yjs state to a database or S3 bucket periodically).*

---

## 💻 Developer Review

**Overall Assessment:** 
The code is clean, pragmatic, and effectively bridges the old V2 UI components with the new V3 data store without requiring a massive rewrite of the rendering logic.

**Strengths:**
* **Separation of Concerns:** `store.js` neatly encapsulates all the complex Yjs and WebRTC logic, exposing a clean API (`Store.appendEvent`, `Store.getGroup`) to the frontend.
* **Backwards Compatibility:** We successfully reused `settlement.js`, `currency.js`, and `components.js` from V2, which saved enormous development time and retained our unit-tested math engine.
* **ES Modules (ESM) Integration:** Fetching `yjs` and `y-webrtc` directly via CDN (`esm.sh`) keeps the repository completely free of Node.js build steps (`npm`, `webpack`), maintaining our ultra-lightweight Vanilla JS philosophy.

**Areas for Improvement / Technical Debt:**
1. **Global Namespace Pollution:** Because V2 scripts (`components.js`, `settlement.js`) weren't written as ES modules, we are forced to attach things to the global window object (e.g., `window.Store = Store`). *Action Item: Gradually refactor the remaining scripts into proper ES `export/import` modules.*
2. **Mobile Battery Optimization:** WebRTC connections can drain battery if left active in the background. *Action Item: Add a `visibilitychange` listener in `app.js` to disconnect the `WebrtcProvider` when the user minimizes the app, and reconnect when they bring it back to the foreground.*
3. **Error Handling:** Currently, if IndexedDB fails to initialize (which happens in Safari Private Browsing mode occasionally), the app fails silently. We need a `try/catch` block around `new IndexeddbPersistence()`.
