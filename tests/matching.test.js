import test from "node:test";
import assert from "node:assert/strict";
import { demoProject, demoActors, recommend } from "../dist/matching.js";

test("sample horror role prioritizes relevant, available actors", () => {
  const matches = recommend(demoProject, demoActors);
  assert.ok(matches[0].available);
  assert.ok(matches.slice(0, 3).some(actor => actor.id === "maya"));
  assert.ok(matches.slice(0, 3).some(actor => actor.id === "eli"));
  assert.equal(matches.at(-1).id, "jordan");
  assert.ok(matches.every(actor => actor.score >= 0 && actor.score <= 100));
});

test("schedule is a hard prioritization constraint", () => {
  const weekendProject = { ...demoProject, schedule: "Weekends" };
  const matches = recommend(weekendProject, demoActors);
  const firstUnavailableIndex = matches.findIndex(actor => !actor.available);
  assert.ok(firstUnavailableIndex > 0);
  assert.ok(matches.slice(0, firstUnavailableIndex).every(actor => actor.available));
  assert.ok(matches.slice(firstUnavailableIndex).every(actor => !actor.available));
});
