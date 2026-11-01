import assert from "node:assert/strict";
import test from "node:test";
import { deriveMembers } from "./js/members.js";

const init = { type: "INIT", ts: 1, hash: "a", data: { creator: "Alice" } };
const bob = { type: "ADD_MEMBER", ts: 2, hash: "b", data: { name: "Bob" } };
const carol = { type: "ADD_MEMBER", ts: 2, hash: "c", data: { name: "Carol" } };

test("concurrent member additions survive either arrival order", () => {
  assert.deepEqual(deriveMembers([init, bob, carol]), ["Alice", "Bob", "Carol"]);
  assert.deepEqual(deriveMembers([carol, init, bob]), ["Alice", "Bob", "Carol"]);
});

test("removal and addition converge with matching timestamps", () => {
  const removeBob = { type: "REMOVE_MEMBER", ts: 2, hash: "d", data: { name: "Bob" } };
  assert.deepEqual(deriveMembers([removeBob, carol, bob, init]), ["Alice", "Carol"]);
  assert.deepEqual(deriveMembers([init, bob, removeBob, carol]), ["Alice", "Carol"]);
});

test("legacy groups retain stored members until their event log arrives", () => {
  assert.deepEqual(deriveMembers([], ["Alice", "Bob"]), ["Alice", "Bob"]);
});
