import * as Y from "https://esm.sh/yjs@13.6.14";
import { WebrtcProvider } from "https://esm.sh/y-webrtc@10.3.0?deps=yjs@13.6.14";
import { IndexeddbPersistence } from "https://esm.sh/y-indexeddb@9.0.12?deps=yjs@13.6.14";

const Store = {
  ydoc: null,
  provider: null,
  persistence: null,

  groupMap: null,
  eventsArray: null,

  currentRoomName: null,

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

    this.persistence = new IndexeddbPersistence(roomName, this.ydoc);
    this.provider = new WebrtcProvider(roomName, this.ydoc, {
      signaling: ['wss://split-signal-server.onrender.com']
    });

    this.groupMap = this.ydoc.getMap("group");
    this.eventsArray = this.ydoc.getArray("events");

    // Status reporting
    this.provider.on("status", (event) => {
      const pill = document.getElementById("syncPill");
      if (pill) {
        if (event.status === "connected") {
          pill.style.display = "none";
        } else {
          pill.style.display = "inline-flex";
          pill.innerText = "Offline";
        }
      }
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
  },

  getDeviceId() {
    let id = localStorage.getItem("split_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).substring(2, 8);
      localStorage.setItem("split_device_id", id);
    }
    return id;
  },

  generateEventHash(groupId, type, ts, data, prevHash, source) {
    const str = `${groupId}:${type}:${ts}:${JSON.stringify(data)}:${prevHash}:${source}`;
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
    const hash = this.generateEventHash(
      id,
      "INIT",
      ts,
      { name, currency, creator: creatorName },
      "",
      source,
    );

    const initEvt = {
      id: hash,
      hash: hash,
      prevHash: "",
      type: "INIT",
      ts: ts,
      source: source,
      data: { name, currency, creator: creatorName },
      synced: true, // Yjs inherently syncs
    };

    this.eventsArray.push([initEvt]);
    return id;
  },

  getGroup() {
    if (!this.groupMap || !this.groupMap.get("id")) return null;
    return {
      id: this.groupMap.get("id"),
      name: this.groupMap.get("name"),
      currency: this.groupMap.get("currency"),
      members: this.groupMap.get("members") || [],
      events: this.eventsArray ? this.eventsArray.toArray() : [],
    };
  },

  appendEvent(groupId, type, data) {
    const ts = Date.now();
    const source = this.getDeviceId();
    const events = this.eventsArray.toArray();
    const prevHash = events.length > 0 ? events[events.length - 1].hash : "";
    const hash = this.generateEventHash(
      groupId,
      type,
      ts,
      data,
      prevHash,
      source,
    );

    const evt = {
      id: hash, // For backwards compatibility
      hash,
      prevHash,
      type,
      ts,
      source,
      data,
      synced: true,
    };

    this.eventsArray.push([evt]);

    // If it's a member update, also update the fast lookup map
    if (type === "ADD_MEMBER" || type === "REMOVE_MEMBER") {
      const members = this.groupMap.get("members") || [];
      if (type === "ADD_MEMBER" && !members.includes(data.name)) {
        this.groupMap.set("members", [...members, data.name]);
      }
      if (type === "REMOVE_MEMBER") {
        this.groupMap.set(
          "members",
          members.filter((m) => m !== data.name),
        );
      }
    }

    return evt;
  },
};

window.Store = Store; // Expose globally for components.js
export default Store;
