const JSONBin = {
  PREFIX: 'split_v2_app_',
  apiKey: '$2b$10$f4uwic0rmfNeH0WEtch25.hFwoA4gxK8jTdPV2VhGHw5WjjdNL5s6',

  // Get the jsonbin.io bin ID for a group (stored in localStorage)
  _getBinId(groupId) {
    return localStorage.getItem(`jsonbin_id_${groupId}`);
  },

  _setBinId(groupId, binId) {
    localStorage.setItem(`jsonbin_id_${groupId}`, binId);
  },

  async sync(group) {
    if (!group || !group.id) return false;
    const cloudId = `${this.PREFIX}${group.id}`;

    let ntfyOk = false;
    let jsonbinOk = false;

    // 1. Send to ntfy.sh for real-time live sync (ephemeral, 12h)
    try {
      const payload = {
        type: 'SNAPSHOT_SYNC',
        groupId: group.id,
        timestamp: Date.now(),
        groupState: group
      };

      const res = await fetch(`https://ntfy.sh/${cloudId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      ntfyOk = res.ok;
      if (!ntfyOk && res.status === 413) {
        // Payload too large! Send a lightweight ping so live clients know to fetch from jsonbin
        fetch(`https://ntfy.sh/${cloudId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'PING_SYNC', groupId: group.id, timestamp: Date.now() })
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('[JSONBin] ntfy.sh sync failed:', err);
    }

    // 2. Persist to jsonbin.io (permanent storage)
    if (this.apiKey) {
      try {
        const binId = this._getBinId(group.id);
        
        if (binId) {
          // Update existing bin
          const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Master-Key': this.apiKey
            },
            body: JSON.stringify(group)
          });
          jsonbinOk = res.ok;
          if (!res.ok) {
            console.warn('[JSONBin] jsonbin.io update failed, status:', res.status);
            // If bin was deleted, clear the ID and try creating a new one
            if (res.status === 404 || res.status === 422) {
              localStorage.removeItem(`jsonbin_id_${group.id}`);
              return this.sync(group); // Retry with create
            }
          }
        } else {
          // Create new bin
          const res = await fetch('https://api.jsonbin.io/v3/b', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Master-Key': this.apiKey,
              'X-Bin-Name': cloudId,
              'X-Bin-Private': 'false'
            },
            body: JSON.stringify(group)
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.metadata && data.metadata.id) {
              this._setBinId(group.id, data.metadata.id);
              jsonbinOk = true;
              console.log('[JSONBin] Created new bin:', data.metadata.id);
            }
          } else {
            console.warn('[JSONBin] jsonbin.io create failed, status:', res.status);
          }
        }
      } catch (err) {
        console.warn('[JSONBin] jsonbin.io sync error:', err);
      }
    }

    return ntfyOk || jsonbinOk;
  },

  async fetchGroupHistory(groupId) {
    if (!groupId) return [];
    const cloudId = `${this.PREFIX}${groupId}`;
    
    let events = [];
    let snapshotGroup = null;

    // 1. Try jsonbin.io FIRST (persistent, reliable)
    if (this.apiKey) {
      try {
        const binId = this._getBinId(groupId);
        if (binId) {
          const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
            headers: { 'X-Master-Key': this.apiKey }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.record && data.record.events) {
              snapshotGroup = data.record;
              console.log('[JSONBin] Loaded group from jsonbin.io, events:', snapshotGroup.events.length);
            }
          }
        } else {
          // No bin ID stored locally — try to find it by searching bins by name
          const searchRes = await fetch(`https://api.jsonbin.io/v3/c/uncategorized/bins`, {
            headers: { 'X-Master-Key': this.apiKey }
          });
          if (searchRes.ok) {
            const bins = await searchRes.json();
            if (Array.isArray(bins)) {
              const match = bins.find(b => b.snippetMeta && b.snippetMeta.name === cloudId);
              if (match && match.record) {
                this._setBinId(groupId, match.record);
                // Now fetch the actual bin data
                const binRes = await fetch(`https://api.jsonbin.io/v3/b/${match.record}/latest`, {
                  headers: { 'X-Master-Key': this.apiKey }
                });
                if (binRes.ok) {
                  const binData = await binRes.json();
                  if (binData && binData.record && binData.record.events) {
                    snapshotGroup = binData.record;
                    console.log('[JSONBin] Found and loaded group from jsonbin.io search, events:', snapshotGroup.events.length);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[JSONBin] jsonbin.io fetch error:', err);
      }
    }

    // 2. Also check ntfy.sh for any newer real-time events
    try {
      const res = await fetch(`https://ntfy.sh/${cloudId}/json?poll=1&since=all`);
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');

        lines.forEach(line => {
          if (!line.trim()) return;
          try {
            const item = JSON.parse(line);
            if (item && item.message) {
              const parsedEvt = JSON.parse(item.message);

              // Handle SNAPSHOT_SYNC from ntfy — use if newer than jsonbin snapshot
              if (parsedEvt && parsedEvt.type === 'SNAPSHOT_SYNC' && parsedEvt.groupState) {
                if (!snapshotGroup || (parsedEvt.timestamp > (snapshotGroup._snapshotTs || 0))) {
                  // Only replace if ntfy snapshot has more events
                  const ntfyEvtCount = parsedEvt.groupState.events ? parsedEvt.groupState.events.length : 0;
                  const curEvtCount = snapshotGroup ? (snapshotGroup.events ? snapshotGroup.events.length : 0) : 0;
                  if (ntfyEvtCount >= curEvtCount) {
                    snapshotGroup = parsedEvt.groupState;
                    snapshotGroup._snapshotTs = parsedEvt.timestamp;
                  }
                }
                return;
              }

              // Individual event messages
              if (parsedEvt && (parsedEvt.type || parsedEvt.hash)) {
                events.push(parsedEvt);
              }
            }
          } catch (e) {}
        });
      }
    } catch (err) {
      console.warn(`[JSONBin] ntfy.sh fetch failed for ${cloudId}:`, err);
    }

    // 3. Merge snapshot events with individual events
    if (snapshotGroup && snapshotGroup.events && snapshotGroup.events.length > 0) {
      const allEvents = [...snapshotGroup.events];
      events.forEach(evt => {
        const hashKey = evt.hash || evt.id;
        const exists = allEvents.some(e => (e.hash === hashKey || e.id === hashKey));
        if (!exists) {
          allEvents.push(evt);
        }
      });
      allEvents._snapshotGroup = snapshotGroup;
      return allEvents;
    }

    return events;
  }
};
