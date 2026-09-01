import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
const ydoc = new Y.Doc();
const provider = new WebrtcProvider("my-room", ydoc);
console.log("roomName:", provider.roomName);
console.log("room:", provider.room);
process.exit(0);
