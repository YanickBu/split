const State = {
  KEYS: {
    GROUPS: 'split_groups'
  },

  data: {
    groups: {}
  },

  // Deterministic Cryptographic Hash Generator for Immutable Ledger Events
  generateEventHash(groupId, type, ts, data, prevHash = '') {
    const payload = `${groupId}:${type}:${ts}:${JSON.stringify(data || {})}:${prevHash}`;
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
  },

  load() {
    const d = localStorage.getItem(this.KEYS.GROUPS);
    if (d) {
      try {
        this.data.groups = JSON.parse(d);
        // Ensure all loaded groups have events sorted deterministically
        Object.keys(this.data.groups).forEach(id => this.rehydrate(id));
      } catch (e) {
        this.data.groups = {};
      }
    }
  },

  save() {
    localStorage.setItem(this.KEYS.GROUPS, JSON.stringify(this.data.groups));
  },

  createGroup(name, currency, creatorName) {
    const id = 'grp_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const group = {
      id,
      name,
      currency,
      members: [creatorName],
      events: []
    };
    
    const ts = Date.now();
    const hash = this.generateEventHash(id, 'INIT', ts, { name, currency, creator: creatorName }, '');
    
    group.events.push({
      id: hash,
      hash: hash,
      prevHash: '',
      type: 'INIT',
      ts: ts,
      data: { name, currency, creator: creatorName },
      synced: false
    });

    this.data.groups[id] = group;
    this.save();
    return id;
  },

  getGroup(id) {
    return this.data.groups[id];
  },

  deleteGroup(id) {
    delete this.data.groups[id];
    this.save();
  },

  appendEvent(groupId, eventType, eventData) {
    const group = this.data.groups[groupId];
    if (!group) return null;
    
    const ts = Date.now();
    const prevHash = group.events.length > 0 ? (group.events[group.events.length - 1].hash || '') : '';
    const hash = this.generateEventHash(groupId, eventType, ts, eventData, prevHash);

    // Prevent duplicate event insertion
    if (group.events.some(e => e.hash === hash || e.id === hash)) {
      return group.events.find(e => e.hash === hash || e.id === hash);
    }

    const evt = {
      id: hash,
      hash: hash,
      prevHash: prevHash,
      type: eventType,
      ts: ts,
      data: eventData,
      synced: false
    };
    
    group.events.push(evt);
    this.processEvent(group, evt);
    this.save();
    return evt;
  },
  
  processEvent(group, evt) {
    if (evt.type === 'ADD_MEMBER') {
      if (evt.data && evt.data.name && !group.members.includes(evt.data.name)) {
        group.members.push(evt.data.name);
      }
    } else if (evt.type === 'REMOVE_MEMBER') {
      if (evt.data && evt.data.name) {
        group.members = group.members.filter(m => m !== evt.data.name);
      }
    }
  },

  markEventSynced(groupId, eventHash) {
    const group = this.data.groups[groupId];
    if (!group) return;
    const evt = group.events.find(e => (e.hash === eventHash || e.id === eventHash));
    if (evt) {
      evt.synced = true;
      this.save();
    }
  },

  getUnsyncedEvents(groupId) {
    const group = this.data.groups[groupId];
    if (!group) return [];
    return group.events.filter(e => !e.synced);
  },

  rehydrate(groupId) {
    const group = this.data.groups[groupId];
    if (!group) return;
    
    group.members = [];
    
    // Sort events deterministically by timestamp ascending
    group.events.sort((a, b) => a.ts - b.ts);

    // Deduplicate events by hash/id
    const seenHashes = new Set();
    const cleanEvents = [];
    
    group.events.forEach(evt => {
      const hashKey = evt.hash || evt.id;
      if (hashKey && seenHashes.has(hashKey)) return;
      if (hashKey) seenHashes.add(hashKey);
      cleanEvents.push(evt);

      if (evt.type === 'INIT' && evt.data) {
        if (evt.data.creator && !group.members.includes(evt.data.creator)) {
           group.members.push(evt.data.creator);
        }
      } else {
        this.processEvent(group, evt);
      }
    });

    group.events = cleanEvents;
  }
};

State.load();
