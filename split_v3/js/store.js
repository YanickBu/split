import * as Y from "https://esm.sh/yjs@13.6.14";
import { IndexeddbPersistence } from "https://esm.sh/y-indexeddb@9.0.12?deps=yjs@13.6.14";
import { createClient } from "https://esm.sh/@liveblocks/client@2.6.0";
import { LiveblocksYjsProvider } from "https://esm.sh/@liveblocks/yjs@2.6.0?deps=yjs@13.6.14";
import { deriveMembers } from "./members.js?v=3.0.36";

const Store = {
  ydoc: null,
  provider: null,
  persistence: null,

  groupMap: null,
  eventsArray: null,

  currentRoomName: null,
  connectionStatus: "connecting",

  eventNonce() {
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  },

  init(groupId, onUpdate) {
    const roomName = "split-v3-" + groupId;
    this._onUpdate = onUpdate;

    if (this.currentRoomName === roomName && this.ydoc) {
      return;
    }

    // Cleanup previous if exists
    if (this.provider) this.provider.destroy();

    this.ydoc = new Y.Doc();
    this.currentRoomName = roomName;
    this.connectionStatus = "connecting";

    this.persistence = new IndexeddbPersistence(roomName, this.ydoc);
    
    // Liveblocks setup
    const client = createClient({
      publicApiKey: "pk_dev_RapxKA-xWsl0m4as-dVuRlRXjPNnVnwzdr0mCZIVyDQCeZ_-T6rWUbsEx96i1A-_"
    });
    const { room } = client.enterRoom(roomName);
    this.provider = new LiveblocksYjsProvider(room, this.ydoc);

    this.groupMap = this.ydoc.getMap("group");
    this.eventsArray = this.ydoc.getArray("events");

    // Status reporting
    room.subscribe("status", (status) => {
      this.connectionStatus = status;
      this.updateSyncPill();
    });

    // Observe changes
    this.groupMap.observe(() => {
      if (this._onUpdate) this._onUpdate();
    });
    this.eventsArray.observe(() => {
      if (this._onUpdate) this._onUpdate();
    });
    this.persistence.on("synced", () => {
      if (this._onUpdate) this._onUpdate();
    });
    
    // Also trigger update when Liveblocks fully syncs
    this.provider.on("sync", (isSynced) => {
      if (isSynced && this._onUpdate) {
        this._onUpdate();
      }
    });
  },

  updateSyncPill() {
    const pill = document.getElementById("syncPill");
    if (!pill) return;
    pill.style.display = this.connectionStatus === "connected" ? "none" : "inline-flex";
    pill.innerText = this.connectionStatus === "connecting" ? "Connecting..." : "Offline";
  },

  getDeviceId() {
    let id = localStorage.getItem("split_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).substring(2, 8);
      localStorage.setItem("split_device_id", id);
    }
    return id;
  },

  generateEventHash(groupId, type, ts, data, prevHash, source, nonce = "") {
    const str = `${groupId}:${type}:${ts}:${JSON.stringify(data)}:${prevHash}:${source}:${nonce}`;
    let h1 = 0xdeadbeef ^ 0,
      h2 = 0x41c6ce57 ^ 0;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 =
      Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
      Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
      Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
      Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0))
      .toString(16)
      .padStart(12, "0");
    return `0x${hex}`;
  },

  createGroup(name, currency, creatorName) {
    const id = "grp_" + Date.now() + Math.random().toString(36).substring(2, 7);

    // Initialize Yjs store so this.groupMap is available
    this.init(id, () => {});

    // Set map data
    this.groupMap.set("id", id);
    this.groupMap.set("name", name);
    this.groupMap.set("currency", currency);
    this.groupMap.set("members", [creatorName]);

    const ts = Date.now();
    const source = this.getDeviceId();
    const nonce = this.eventNonce();
    const hash = this.generateEventHash(
      id,
      "INIT",
      ts,
      { name, currency, creator: creatorName },
      "",
      source,
      nonce,
    );

    const initEvt = {
      id: hash,
      hash: hash,
      prevHash: "",
      type: "INIT",
      ts: ts,
      source: source,
      nonce,
      data: { name, currency, creator: creatorName },
      synced: true, // Yjs inherently syncs
    };

    this.eventsArray.push([initEvt]);
    return id;
  },

  getGroup() {
    if (!this.groupMap || !this.groupMap.get("id")) return null;
    const events = this.eventsArray ? this.eventsArray.toArray() : [];
    return {
      id: this.groupMap.get("id"),
      name: this.groupMap.get("name"),
      currency: this.groupMap.get("currency"),
      members: deriveMembers(events, this.groupMap.get("members") || []),
      events,
    };
  },

  appendEvent(groupId, type, data) {
    if (!this.groupMap || this.groupMap.get("id") !== groupId || !this.eventsArray) return null;
    const ts = Date.now();
    const source = this.getDeviceId();
    const nonce = this.eventNonce();
    const events = this.eventsArray.toArray();
    const prevHash = events.length > 0 ? events[events.length - 1].hash : "";
    const hash = this.generateEventHash(
      groupId,
      type,
      ts,
      data,
      prevHash,
      source,
      nonce,
    );

    const evt = {
      id: hash, // For backwards compatibility
      hash,
      prevHash,
      type,
      ts,
      source,
      nonce,
      data,
      synced: true,
    };

    this.eventsArray.push([evt]);

    return evt;
  },

  getValidExpenses(group) {
    if (!group || !group.events) return [];
    const stornoIds = new Set();
    const editsByTarget = {};

    group.events.forEach((x) => {
      if (x.type === "STORNO_EXPENSE" && x.data) {
        if (x.data.targetHash) stornoIds.add(x.data.targetHash);
        if (x.data.expenseId) stornoIds.add(x.data.expenseId);
      }
      if (x.type === "EDIT_EXPENSE" && x.data && x.data.targetHash) {
        if (!editsByTarget[x.data.targetHash]) editsByTarget[x.data.targetHash] = [];
        editsByTarget[x.data.targetHash].push(x);
      }
    });

    return group.events
      .filter((e) => e.type === "ADD_EXPENSE")
      .filter((e) => {
        const evtId = e.hash || e.id;
        return !stornoIds.has(e.id) && !stornoIds.has(e.hash) && !stornoIds.has(evtId);
      })
      .map((e) => {
        const evtId = e.hash || e.id;
        const edits = editsByTarget[evtId] || [];
        if (edits.length > 0) {
          edits.sort((a, b) => a.ts - b.ts);
          const finalData = { ...e.data };
          edits.forEach((edit) => {
            Object.assign(finalData, edit.data.changes);
          });
          return { ...e, data: finalData, isEdited: true };
        }
        return e;
      });
  },
};

window.Store = Store; // Expose globally for components.js
export default Store;
