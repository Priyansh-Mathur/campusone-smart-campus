import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/campus/route.ts", import.meta.url),
  "utf8",
);

test("campus API limits private records and returns a safe directory", () => {
  assert.match(route, /SELECT id,name,role FROM users WHERE verified=1/);
  assert.match(route, /const roster = \["Faculty", "Admin"\]\.includes/);
  assert.match(route, /record\.kind === "message" \|\| record\.kind === "feedback"/);
  assert.match(route, /ownerId === user\.id \|\| recipientId === user\.id/);
  assert.match(route, /user\.role === "Admin"[\s\S]*SELECT \* FROM activity/);
});

test("message, feedback and attendance writes validate their relationships", () => {
  assert.match(route, /You cannot send a message to yourself/);
  assert.match(route, /Message recipient not found/);
  assert.match(route, /recipientId,[\s\S]*recipientName/);
  assert.match(route, /WHERE id=\? AND kind='submission'/);
  assert.match(route, /WHERE id=\? AND kind='assignment'/);
  assert.match(route, /status='graded'/);
  assert.match(route, /presentUserIds must be an array of student IDs/);
  assert.match(route, /role='Student' AND verified=1 AND id IN/);
  assert.match(route, /SELECT COUNT\(\*\) AS count FROM users WHERE role='Student'/);
  assert.match(route, /rosterCount,/);
  assert.match(route, /meta\.present = presentUserIds\.includes\(user\.id\)/);
});

test("event registration enforces capacity and issues a private pass token", () => {
  assert.match(route, /Event capacity must be between 1 and 10000/);
  assert.match(route, /A valid event date is required/);
  assert.match(route, /This event has reached its seat capacity/);
  assert.match(route, /status LIKE 'registered:%'/);
  assert.match(route, /registeredPassToken\(personal\)/);
  assert.match(route, /if \(passToken\) meta\.passToken = passToken/);
  assert.match(route, /Registration is closed for this event/);
});

test("protected demo users and managed record transitions are guarded", () => {
  assert.match(route, /endsWith\("@campusone\.dev"\)/);
  assert.match(route, /Demo accounts cannot be deleted/);
  assert.match(route, /Coordinators can only manage their own/);
  assert.match(route, /\["open", "published", "closed", "cancelled"\]/);
});
