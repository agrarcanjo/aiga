const test = require("node:test");
const assert = require("node:assert/strict");
const { createCaptureCompatService, registerCaptureCompatIpc } = require("./capture-compat-service.cjs");
const identity = { pid: 42, created: "134000000000000000", path: "C:\\Java\\javaw.exe", arch: "x64" };
const row = { hwnd: "123", threadId: 2, className: "Fixture", valid: true, before: 17, affinity: 0, queryError: 0, clearError: 0 };
const result = (overrides = {}) => ({ protocol: 1, version: "1.0.0", loaded: true, initialized: true, hookActive: true, stable: true, overflow: false, error: 0, stage: "command", blocked: "12", observedAt: "134000000000000000", identity, windows: [row], ...overrides });
test("missing artifacts are diagnosed at startup without dispatching native operations", () => {
  const logs = [];
  const service = createCaptureCompatService({ resourcesRoot: "missing-artifacts-test-directory", pollMs: 0,
    logger: { info: (event, data) => logs.push({ event, data }) },
    run: () => { assert.fail("must not run native commands during preflight"); } });
  const result = service.preflight();
  assert.equal(result.ready, false);
  assert.match(result.message, /build:capture-compat/);
  assert.equal(logs[0].data.code, "ARTIFACTS_MISSING");
  assert.match(logs[0].data.artifactPath, /manifest.json$/);
  assert.equal(service.snapshot().selected, null);
  service.close();
});
test("shortcut discovers a unique Java and enables with verified evidence", async () => {
  const calls = [];
  const service = createCaptureCompatService({ platform: "win32", resourcesRoot: "unused", pollMs: 0,
    run: async (op) => {
      calls.push(op);
      if (op === "list") return { candidates: [{ ...identity, windows: [row] }] };
      return result({ hookActive: op === "enable" });
    } });
  assert.equal((await service.enableFromShortcut()).status, "verified");
  assert.deepEqual(calls, ["list", "query", "enable"]);
  service.close();
});
test("shortcut never chooses between multiple Java instances or acts with no target", async () => {
  for (const candidates of [[], [{ ...identity, windows: [] }, { ...identity, pid: 43, windows: [] }]]) {
    const calls = [];
    const service = createCaptureCompatService({ platform: "win32", resourcesRoot: "unused", pollMs: 0,
      run: async (op) => { calls.push(op); return { candidates }; } });
    await assert.rejects(service.enableFromShortcut(), /instâncias Java|instância Java/);
    assert.deepEqual(calls, ["list"]);
    assert.equal(service.snapshot().selected, null);
    service.close();
  }
});
test("shortcut rechecks an active selection without injecting again", async () => {
  const { service, calls } = await setup();
  await service.enable();
  const start = calls.length;
  assert.equal((await service.enableFromShortcut()).status, "verified");
  assert.deepEqual(calls.slice(start).map(c => c.op), ["query"]);
  service.close();
});
test("shortcut does not migrate a stale selected process", async () => {
  const { service, calls } = await setup({ protocol: 1, error: 87, stage: "access" });
  calls.length = 1; // Keep the initial query counted by the fixture.
  calls[0] = { op: "query" };
  const state = await service.enableFromShortcut();
  assert.equal(state.selected, null);
  assert.equal(calls.some(c => c.op === "enable" || c.op === "list"), false);
  service.close();
});
async function setup(next = result()) {
  const calls = [];
  const service = createCaptureCompatService({ platform: "win32", resourcesRoot: "unused", pollMs: 0, run: async (op, target) => {
    calls.push({ op, target });
    if (op === "list") return { protocol: 1, candidates: [{ ...identity, windows: [row] }] };
    if (calls.filter((call) => call.op !== "list").length === 1) return result({ hookActive: false });
    return typeof next === "function" ? next(op, target) : next;
  } });
  await service.list(); await service.select(identity); return { service, calls };
}
test("verified requires real complete evidence, not simulated TRUE", async () => {
  for (const overrides of [{}, { windows: [] }, { stable: false }, { overflow: true }, { windows: [{ ...row, affinity: null, queryError: 5 }] }, { windows: [{ ...row, affinity: 17 }] }, { windows: [{ ...row, clearError: 5 }] }, { hookActive: false }]) {
    const { service } = await setup(result(overrides)); const state = await service.enable();
    assert.equal(state.status, !Object.keys(overrides).length ? "verified" : overrides.hookActive === false ? "disabled" : "partial"); service.close();
  }
});
test("identity mismatches invalidate evidence", async () => {
  const { service } = await setup(result({ identity: { ...identity, created: "2" } }));
  const state = await service.enable(); assert.equal(state.status, "unknown"); assert.equal(state.hookActive, null); service.close();
});
test("selection must come from discovery and rejects arbitrary fields", async () => {
  const { service } = await setup();
  await assert.rejects(service.select({ ...identity, pid: 99 }), /descoberta/);
  await assert.rejects(service.select({ ...identity, dll: "evil.dll" })); service.close();
});
test("unknown affinity is never rendered as zero", async () => {
  const { service } = await setup(result({ windows: [{ ...row, affinity: null, queryError: 5 }] }));
  const state = await service.enable(); assert.equal(state.windows[0].affinity, null); assert.equal(state.status, "partial"); service.close();
});
test("timeouts invalidate stale success and block reinstallation", async () => {
  let fail = false;
  const { service } = await setup(() => fail ? { protocol: 1, error: 1460, uncertain: true, stage: "load" } : result());
  assert.equal((await service.enable()).status, "verified"); fail = true;
  assert.equal((await service.query()).status, "unknown"); assert.equal(service.snapshot().verifiedAt, null);
  await assert.rejects(service.enable(), /residual/); service.close();
});
test("conflicting operations are serialized", async () => {
  let active = 0, maximum = 0;
  const { service } = await setup(async () => { active++; maximum = Math.max(maximum, active); await new Promise((r) => setTimeout(r, 10)); active--; return result(); });
  await Promise.all([service.enable(), service.enable(), service.disable()]); assert.equal(maximum, 1); service.close();
});
test("IPC rejects foreign window, subframe, navigation and extra arguments", async () => {
  const handlers = {}, frame = { url: "file:///app/index.html" }, webContents = { mainFrame: null }; webContents.mainFrame = frame;
  let called = 0;
  registerCaptureCompatIpc({ ipcMain: { handle: (channel, callback) => handlers[channel] = callback }, service: { query: () => called++ },
    getMainWindow: () => ({ isDestroyed: () => false, webContents }), trustedUrl: () => "file:///app/index.html" });
  const valid = { sender: webContents, senderFrame: frame };
  assert.throws(() => handlers["capture-compat:query"]({ ...valid, sender: {} }), /Origem/);
  assert.throws(() => handlers["capture-compat:query"]({ ...valid, senderFrame: { url: frame.url } }), /Origem/);
  assert.throws(() => handlers["capture-compat:query"](valid, { pid: 1 }), /parâmetros/);
  frame.url = "https://untrusted.example"; assert.throws(() => handlers["capture-compat:query"](valid), /Origem/);
  frame.url = "file:///app/index.html"; handlers["capture-compat:query"](valid); assert.equal(called, 1);
});
test("ended process releases selection without migrating to a reused PID", async () => {
  const { service } = await setup({ protocol: 1, error: 87, stage: "access" });
  const state = await service.query(); assert.equal(state.status, "failed"); assert.equal(state.selected, null);
  await assert.rejects(service.enable(), /Selecione/); service.close();
});
test("access and installation failures do not claim rollback or retry", async () => {
  for (const error of [5, 1114]) {
    const { service, calls } = await setup({ protocol: 1, error, stage: error === 5 ? "access" : "load", uncertain: error === 1114 });
    const state = await service.enable(); assert.notEqual(state.status, "verified"); assert.equal(state.hookActive, null);
    assert.equal(calls.filter((call) => call.op === "enable").length, 1); service.close();
  }
});
test("missing or modified package artifacts fail before starting helper", () => {
  const { resolveArtifacts } = require("./capture-compat-service.cjs");
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiga-capture-test-"));
  try {
    assert.throws(() => resolveArtifacts(root), error => error.code === "ARTIFACTS_MISSING" && error.stage === "artifacts" && error.message.includes("Nenhuma operação"));
    const dir = path.join(root, "capture-compat", "x64"); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ protocol: 1, version: "1.0.0", arch: "x64", sha256: {} }));
    fs.writeFileSync(path.join(dir, "aiga-capture-helper.exe"), "invalid");
    fs.writeFileSync(path.join(dir, "aiga-capture-compat.dll"), "invalid");
    assert.throws(() => resolveArtifacts(root), /Integridade/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("malformed native reply leaves unknown state and blocks another installation", async () => {
  const { service } = await setup({ protocol: 1, error: 0, hookActive: true });
  assert.equal((await service.enable()).status, "unknown");
  await assert.rejects(service.enable(), /residual/); service.close();
});
test("native busy response cannot masquerade as a disabled hook", async () => {
  const { service } = await setup(result({ error: 170, initialized: false, hookActive: false, windows: [] }));
  const state = await service.enable(); assert.equal(state.status, "unknown"); assert.equal(state.hookActive, null);
  await assert.rejects(service.select({ ...identity, pid: 43 }), /Desative/); service.close();
});
