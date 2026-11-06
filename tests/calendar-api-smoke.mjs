import assert from "node:assert/strict";

const baseUrl = process.env.CALENDAR_TEST_URL || "http://127.0.0.1:3310";
const origin = "https://romankhasin.github.io";

const health = await fetch(`${baseUrl}/health`, { headers: { Origin: origin } });
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true });

const read = await fetch(`${baseUrl}/calendar`, { headers: { Origin: origin } });
assert.equal(read.status, 200);
const current = await read.json();
assert.equal(current.revision, 1);
assert.equal(Object.values(current.payload.months).reduce((sum, month) => sum + month.tasks.length, 0), 46);

const saved = await fetch(`${baseUrl}/calendar`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ payload: current.payload, expectedRevision: current.revision })
});
assert.equal(saved.status, 200);
assert.equal((await saved.json()).revision, 2);

const conflict = await fetch(`${baseUrl}/calendar`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ payload: current.payload, expectedRevision: current.revision })
});
assert.equal(conflict.status, 409);

const rejectedOrigin = await fetch(`${baseUrl}/calendar`, { headers: { Origin: "https://example.com" } });
assert.equal(rejectedOrigin.status, 403);

console.log("calendar API smoke tests passed");
