// A shared array of members loses concurrent writes. Rebuild membership from
// the CRDT event log so every device sees the same result after merging.
export function deriveMembers(events, legacyMembers = []) {
  if (!events.some((event) => event.type === "INIT")) return [...legacyMembers];

  const members = new Set();
  [...events]
    .sort((a, b) => {
      const timeOrder = (a.ts || 0) - (b.ts || 0);
      if (timeOrder) return timeOrder;
      const aId = String(a.hash || a.id || "");
      const bId = String(b.hash || b.id || "");
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    })
    .forEach((event) => {
      if (event.type === "INIT" && event.data?.creator) members.add(event.data.creator);
      if (event.type === "ADD_MEMBER" && event.data?.name) members.add(event.data.name);
      if (event.type === "REMOVE_MEMBER" && event.data?.name) members.delete(event.data.name);
    });
  return [...members];
}
