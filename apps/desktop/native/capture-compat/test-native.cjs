const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { randomBytes, createHash } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { createNativeRunner } = require("../../electron/capture-compat-service.cjs");
const resources = process.env.CAPTURE_COMPAT_RESOURCES || path.resolve(__dirname, "../../resources");
const run = createNativeRunner(resources);
const fixturePath = path.join(__dirname, "out/x64/Release/aiga-capture-fixture.exe");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = { startedAt: new Date().toISOString(), windows: os.release(), arch: process.arch, durationSeconds: Number(process.env.CAPTURE_COMPAT_SOAK_SECONDS || 120), manifest: JSON.parse(fs.readFileSync(path.join(resources, "capture-compat/x64/manifest.json"), "utf8").replace(/^\uFEFF/, "")), cases: [] };
evidence.fixtureHashBefore = createHash("sha256").update(fs.readFileSync(fixturePath)).digest("hex");
const children = [];
async function fixture() {
  const child = spawn(fixturePath, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  const [data] = await once(child.stdout, "data");
  const identity = { ...JSON.parse(data), path: fixturePath, arch: "x64" };
  return { child, identity, token: randomBytes(32).toString("hex"), send(command) { child.stdin.write(`${command}\n`); } };
}
async function test(id, name, action) {
  const start = performance.now();
  try { const observations = await action(); evidence.cases.push({ id, name, result: "passed", milliseconds: Math.round(performance.now() - start), observations }); console.log(`${id} PASS ${name}`); }
  catch (error) { evidence.cases.push({ id, name, result: "failed", error: error.stack }); throw error; }
}
function verified(result) {
  assert.equal(result.error, 0, JSON.stringify(result));
  assert.equal(result.hookActive, true);
  assert.equal(result.stable, true);
  assert.ok(result.windows.length > 0);
  for (const row of result.windows) { assert.equal(row.affinity, 0); assert.equal(row.queryError, 0); assert.equal(row.clearError, 0); }
}
(async () => {
  const a = await fixture(), b = await fixture();
  async function fixtureReply(command) { const response = once(a.child.stdout, "data"); a.send(command); return JSON.parse((await response)[0]); }
  const contracts = () => fixtureReply("contracts");
  const originalContracts = await contracts();
  await pause(250);
  await test("T01", "existing affinity cleared with real queries", async () => {
    const before = await run("query", a.identity, a.token); assert.equal(before.windows[0].affinity, 17);
    const after = await run("enable", a.identity, a.token); verified(after); return { before, after };
  });
  await test("T02", "repeated exclusion neutralized", async () => {
    await pause(1000); const result = await run("query", a.identity, a.token); verified(result); assert.ok(BigInt(result.blocked) > 10n); return result;
  });
  await test("T03", "monitor affinity neutralized", async () => {
    a.send("monitor"); await pause(250); const result = await run("query", a.identity, a.token); verified(result); return result;
  });
  await test("forwarding", "unknown affinity, child, invalid HWND and WDA_NONE preserve native results", async () => {
    const hooked = await contracts(); assert.deepEqual(hooked, originalContracts); return { original: originalContracts, hooked };
  });
  await test("T04", "multiple and recreated windows", async () => {
    a.send("new"); await pause(100); const multiple = await run("query", a.identity, a.token); verified(multiple); assert.equal(multiple.windows.length, 2);
    a.send("recreate"); await pause(100); const recreated = await run("query", a.identity, a.token); verified(recreated); assert.equal(recreated.windows.length, 1); return { multiple, recreated };
  });
  await test("no-windows", "active hook without windows never claims capture verification", async () => {
    a.send("empty"); await pause(100); const empty = await run("query", a.identity, a.token); assert.equal(empty.hookActive, true); assert.equal(empty.windows.length, 0);
    a.send("new"); await pause(100); verified(await run("query", a.identity, a.token)); return empty;
  });
  await test("T05-control", "second equivalent process unchanged", async () => {
    const result = await run("query", b.identity, b.token); assert.equal(result.hookActive, false); assert.equal(result.windows[0].affinity, 17); return result;
  });
  await test("T07-identity", "stale creation time refused", async () => {
    const result = await run("enable", { ...a.identity, created: "1" }, a.token); assert.equal(result.error, 87); return result;
  });
  await test("T08-architecture", "incompatible architecture refused", async () => {
    const result = await run("enable", { ...a.identity, arch: "x86" }, a.token); assert.equal(result.error, 193); return result;
  });
  await test("T11", "duplicate enable is idempotent", async () => {
    const results = await Promise.all([run("enable", a.identity, a.token), run("enable", a.identity, a.token)]);
    for (const result of results) if (result.error !== 170) verified(result);
    verified(await run("query", a.identity, a.token)); return results;
  });
  await test("T18-token", "other same-user controller cannot disable or claim", async () => {
    const wrong = randomBytes(32).toString("hex");
    const disabled = await run("disable", a.identity, wrong); assert.equal(disabled.error, 5); assert.equal(disabled.hookActive, true);
    const enabled = await run("enable", a.identity, wrong); assert.equal(enabled.error, 5); return { disabled, enabled };
  });
  await test("T15", "bounded soak with reapplication and recreation", async () => {
    const resourcesBefore = await fixtureReply("metrics");
    const deadline = Date.now() + evidence.durationSeconds * 1000;
    let observations = 0; let last;
    while (Date.now() < deadline) {
      a.send(observations % 2 ? "monitor" : "exclude"); a.send("recreate");
      await pause(500); last = await run("query", a.identity, a.token); verified(last); observations++;
    }
    const resourcesAfter = await fixtureReply("metrics");
    assert.ok(resourcesAfter.handles <= resourcesBefore.handles + 16, "handle growth exceeds the declared allowance");
    assert.ok(resourcesAfter.privateBytes <= resourcesBefore.privateBytes + 16 * 1024 * 1024, "private memory growth exceeds the declared allowance");
    return { observations, resourcesBefore, resourcesAfter, last };
  });
  await test("T12", "disable does not restore old affinity", async () => {
    a.send("pause"); await pause(100); const result = await run("disable", a.identity, a.token);
    assert.equal(result.error, 0); assert.equal(result.hookActive, false); assert.equal(result.windows[0].affinity, 0); return result;
  });
  await test("T13", "original application requests work again", async () => {
    a.send("exclude"); a.send("resume"); await pause(100); const result = await run("query", a.identity, a.token);
    assert.equal(result.windows[0].affinity, 17); return result;
  });
  await test("T14", "lost controller lease removes hook", async () => {
    verified(await run("enable", a.identity, a.token)); await pause(17000);
    const result = await run("query", a.identity, "0".repeat(64)); assert.equal(result.hookActive, false); assert.equal(result.windows[0].affinity, 17); return result;
  });
  await test("T07-exit", "natural process exit invalidates session", async () => {
    a.send("quit"); await once(a.child, "exit"); const result = await run("query", a.identity, a.token); assert.ok(result.error); return result;
  });
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const child of children) { if (child.exitCode === null) child.stdin.end("quit\n"); }
  evidence.finishedAt = new Date().toISOString();
  evidence.fixtureHashAfter = createHash("sha256").update(fs.readFileSync(fixturePath)).digest("hex");
  const destination = path.join(__dirname, process.env.CAPTURE_COMPAT_RESOURCES ? "out/package-evidence.json" : "out/native-evidence.json");
  fs.writeFileSync(destination, JSON.stringify(evidence, null, 2)); console.log(`Evidence: ${destination}`);
});
