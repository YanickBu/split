import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
const ydoc = new Y.Doc();
const groupMap = ydoc.getMap("group");
groupMap.set("name", "My Group");
console.log("name before:", groupMap.get("name"));
// Simulating an async load that might somehow affect it?
// Not possible since IndexedDB is not in Node, but let's see.
