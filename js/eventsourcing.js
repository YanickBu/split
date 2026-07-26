const EventSourcing = {
  PREFIX: 'split_v2_app_',
  activeSubscription: null,
  activeGroupId: null,

  async publish(groupId, event) {
    if (!groupId || !event) return false;
    const topic = `${this.PREFIX}${groupId}`;
    try {
      const res = await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });
      return res.ok;
    } catch (err) {
      console.warn(`[EventSourcing] Publish offline/failed for topic ${topic}:`, err);
      return false;
    }
  },
  
  subscribe(groupId, onEvent) {
    if (!groupId) return () => {};
    
    // Unsubscribe from previous group if active
    if (this.activeSubscription && this.activeGroupId !== groupId) {
      this.unsubscribe();
    }

    const topic = `${this.PREFIX}${groupId}`;
    const url = `https://ntfy.sh/${topic}/sse`;
    
    console.log(`[EventSourcing] Subscribing to live SSE topic ${topic}`);
    let es;
    try {
      es = new EventSource(url);
      
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          // ntfy wraps messages in an envelope with 'message' field
          let evtData = payload;
          if (payload && payload.message) {
            evtData = JSON.parse(payload.message);
          }
          if (evtData && (evtData.type || evtData.hash)) {
            onEvent(evtData);
          }
        } catch (parseErr) {
          // Ignore non-json system messages
        }
      };

      es.onerror = (err) => {
        console.warn(`[EventSourcing] SSE stream connection issue for ${topic}`);
      };

      this.activeSubscription = es;
      this.activeGroupId = groupId;
    } catch (err) {
      console.warn(`[EventSourcing] Failed to initialize EventSource for ${topic}:`, err);
    }

    return () => this.unsubscribe();
  },

  unsubscribe() {
    if (this.activeSubscription) {
      console.log(`[EventSourcing] Closing SSE connection for ${this.activeGroupId}`);
      try {
        this.activeSubscription.close();
      } catch (e) {}
      this.activeSubscription = null;
      this.activeGroupId = null;
    }
  }
};
