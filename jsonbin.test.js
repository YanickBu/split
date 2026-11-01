import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function event(id, type = "ADD_EXPENSE") {
  return { id, hash: id, type, data: {} };
}

test("replays distinct events from concurrent snapshots and individual messages", async () => {
  const init = event("init", "INIT");
  const local = event("local");
  const remoteA = event("remote-a");
  const remoteB = event("remote-b");
  const direct = event("direct");
  const message = (payload) => JSON.stringify({ message: JSON.stringify(payload) });
  const history = [
    message({ type: "SNAPSHOT_SYNC", timestamp: 1, groupState: { events: [init, remoteA] } }),
    message({ type: "SNAPSHOT_SYNC", timestamp: 2, groupState: { events: [init, remoteB] } }),
    message(direct),
  ].join("\n");

  const context = {
    localStorage: { getItem: () => "bin-1" },
    console,
    fetch: async (url) => {
      if (url.includes("api.jsonbin.io")) {
        return { ok: true, json: async () => ({ record: { id: "group-1", events: [init, local] } }) };
      }
      return { ok: true, text: async () => history };
    },
  };
  vm.runInNewContext(readFileSync("js/jsonbin.js", "utf8") + "\nglobalThis.testJSONBin = JSONBin;", context);

  const result = await context.testJSONBin.fetchGroupHistory("group-1");
  assert.deepEqual(Array.from(result, (item) => item.id).sort(), ["direct", "init", "local", "remote-a", "remote-b"]);
  assert.equal(result._snapshotGroup.id, "group-1");
});
