global.localStorage = { getItem: () => null, setItem: () => {} };
const fs = require('fs');

// We need State and Components and Settlement
eval(fs.readFileSync('js/state.js', 'utf8'));
eval(fs.readFileSync('js/settlement.js', 'utf8'));
eval(fs.readFileSync('js/components.js', 'utf8'));

const JSONBin = {
  PREFIX: 'split_v2_app_',
  apiKey: '$2b$10$6tLmwP.cVLD00AAmIH0uU.70UpEmnKwxiSbnUcIgF4rlyMx/18bgS',
  _getBinId(groupId) { return null; },
  _setBinId(groupId, binId) {},
  
  async fetchGroupHistory(groupId) {
    const cloudId = `${this.PREFIX}${groupId}`;
    let events = [];
    let snapshotGroup = null;

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
              if (parsedEvt && parsedEvt.type === 'SNAPSHOT_SYNC' && parsedEvt.groupState) {
                if (!snapshotGroup || (parsedEvt.timestamp > (snapshotGroup._snapshotTs || 0))) {
                  const ntfyEvtCount = parsedEvt.groupState.events ? parsedEvt.groupState.events.length : 0;
                  const curEvtCount = snapshotGroup ? (snapshotGroup.events ? snapshotGroup.events.length : 0) : 0;
                  if (ntfyEvtCount >= curEvtCount) {
                    snapshotGroup = parsedEvt.groupState;
                    snapshotGroup._snapshotTs = parsedEvt.timestamp;
                  }
                }
                return;
              }
              if (parsedEvt && (parsedEvt.type || parsedEvt.hash)) {
                events.push(parsedEvt);
              }
            }
          } catch (e) {
            console.error(e);
          }
        });
      }
    } catch (err) {}

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

(async () => {
  const groupId = 'grp_17879015000199fuvc';
  const history = await JSONBin.fetchGroupHistory(groupId);
  
  if (history && history.length > 0) {
    let group = State.getGroup(groupId);
    if (!group) {
      if (history._snapshotGroup) {
        const snap = history._snapshotGroup;
        State.data.groups[groupId] = {
          id: groupId,
          name: snap.name || 'Shared Group',
          currency: snap.currency || 'USD',
          members: snap.members || ['Member'],
          events: [],
          pendingDeltas: []
        };
        group = State.getGroup(groupId);
      }
    }

    if (group) {
      history.forEach(remoteEvt => {
        const hashKey = remoteEvt.hash || remoteEvt.id;
        const exists = group.events.some(e => (e.hash === hashKey || e.id === hashKey));
        if (!exists && remoteEvt.type) {
          remoteEvt.synced = true;
          group.events.push(remoteEvt);
        }
      });

      State.rehydrate(groupId);
      
      try {
        const html = Components.renderGroupDashboard(group);
        console.log("Render successful! Length:", html.length);
      } catch (err) {
        console.error("Render crashed:", err);
      }
    }
  }
})();
