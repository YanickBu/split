const JSONBin = {
  PREFIX: 'split_v2_app_',
  apiKey: null, // Optional JSONBin.io Master/Access Key

  async sync(group) {
    if (!group || !group.id) return false;
    const cloudId = `${this.PREFIX}${group.id}`;

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

      if (this.apiKey) {
        await fetch(`https://api.jsonbin.io/v3/b`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': this.apiKey,
            'X-Bin-Name': cloudId
          },
          body: JSON.stringify(group)
        }).catch(err => console.warn('[JSONBin] JSONBin.io sync skipped:', err));
      }

      return res.ok;
    } catch (err) {
      console.warn(`[JSONBin] Cloud sync failed for ${cloudId}:`, err);
      return false;
    }
  },

  async fetchGroupHistory(groupId) {
    if (!groupId) return [];
    const cloudId = `${this.PREFIX}${groupId}`;
    try {
      // Query with since=all to retrieve complete cloud topic history
      const res = await fetch(`https://ntfy.sh/${cloudId}/json?poll=1&since=all`);
      if (!res.ok) return [];
      
      const text = await res.text();
      const lines = text.trim().split('\n');
      const events = [];

      lines.forEach(line => {
        if (!line.trim()) return;
        try {
          const item = JSON.parse(line);
          if (item && item.message) {
            const parsedEvt = JSON.parse(item.message);
            if (parsedEvt && (parsedEvt.type || parsedEvt.hash)) {
              events.push(parsedEvt);
            }
          }
        } catch (e) {}
      });

      return events;
    } catch (err) {
      console.warn(`[JSONBin] Failed to fetch history for ${cloudId}:`, err);
      return [];
    }
  }
};
