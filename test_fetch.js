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
    } catch (err) {
      console.error(err);
    }

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

JSONBin.fetchGroupHistory('grp_17879015000199fuvc').then(events => {
  console.log("Returned events:", events.length);
  if (events._snapshotGroup) console.log("Has snapshot");
});
