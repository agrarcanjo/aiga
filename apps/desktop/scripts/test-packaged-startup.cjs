const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { once } = require("node:events");
const { createHash } = require("node:crypto");
const desktop = path.resolve(__dirname, "..");
const version = require("../package.json").version;
const executable = path.join(desktop, "release", version, "win-unpacked", "AIGA.exe");
const evidenceDir = path.join(desktop, "out", "packaged-startup", new Date().toISOString().replace(/[:.]/g, "-"));
const report = { version, startedAt: new Date().toISOString(), cases: [] };
const processes = new Set();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync(evidenceDir, { recursive: true });
if (typeof WebSocket === "undefined") throw new Error("The packaged startup smoke test requires Node.js 22+ for its inspector client.");

function start(file, args, options = {}) {
  const env = { ...process.env, FEATURE_FORCE_LOCAL_ONLY: "true", DESKTOP_LOG_LEVEL: "debug" };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(file, args, { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  processes.add(child);
  const state = { child, output: "", ...options };
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => state.output += data);
  child.on("exit", () => processes.delete(child));
  child.stdin.on("error", () => {});
  return state;
}
async function until(check, description, milliseconds = 15000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timeout: ${description}`);
}
async function rpc(url) {
  const socket = new WebSocket(url);
  await until(() => socket.readyState === WebSocket.OPEN, "inspector connection");
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timer);
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Inspector closed")); }
    pending.clear();
  });
  return {
    async evaluate(expression) {
      const id = ++sequence;
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("Inspector command timed out")); }, 5000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    close: () => socket.close()
  };
}
async function launch(name) {
  const profile = path.join(evidenceDir, name);
  const state = start(executable, ["--user-data-dir=" + profile, "--inspect=127.0.0.1:0", "--enable-logging=stderr"], { profile });
  const endpoint = await until(() => {
    if (state.child.exitCode !== null) throw new Error(`AIGA exited before startup: ${state.output}`);
    return state.output.match(/Debugger listening on (ws:\/\/[^\s]+)/)?.[1];
  }, "main process inspector");
  state.inspector = await rpc(endpoint);
  const logPath = path.join(profile, "logs", "desktop.log");
  await until(() => fs.existsSync(logPath) && fs.readFileSync(logPath, "utf8").includes("Main window ready"), "main window readiness");
  const snapshot = await until(async () => {
    const value = await state.inspector.evaluate(`(async () => {
      const e = process.mainModule.require('electron');
      const windows = e.BrowserWindow.getAllWindows();
      if (!windows.length) return null;
      const win = windows[0];
      const text = await win.webContents.executeJavaScript('document.body.innerText');
      return { pid: process.pid, version: e.app.getVersion(), visible: win.isVisible(), count: windows.length, hwnd: win.getNativeWindowHandle().readBigUInt64LE().toString(), url: win.webContents.getURL(), text: text.slice(0, 1500) };
    })()`);
    return value?.text?.includes("AIGA") ? value : null;
  }, "rendered AIGA UI");
  assert.equal(snapshot.version, version); assert.equal(snapshot.visible, true); assert.equal(snapshot.count, 1);
  assert.ok(snapshot.url.startsWith("file:"));
  state.snapshot = snapshot;
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(desktop, "native/capture-compat/query-affinity.ps1"), "-WindowHandle", snapshot.hwnd], { windowsHide: true });
  state.affinity = JSON.parse(stdout);
  assert.equal(state.affinity.known, true); assert.equal(state.affinity.affinity, 17);
  state.log = fs.readFileSync(logPath, "utf8");
  assert.ok(!state.output.includes("UnhandledPromiseRejectionWarning"));
  return state;
}
async function close(state) {
  const exited = once(state.child, "exit");
  await state.inspector.evaluate("setTimeout(() => process.mainModule.require('electron').app.quit(), 100); true");
  state.inspector.close();
  const [code] = await exited; assert.equal(code, 0);
}
(async () => {
  assert.ok(fs.existsSync(executable), "Run pack:win before this test");
  const guide = path.join(path.dirname(executable), "resources/resources/guides/guia-build-windows.md");
  const guideHash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert.equal(guideHash(guide), guideHash(path.resolve(desktop, "../../docs/guia-build-windows.md")));
  report.guideIncluded = true;
  const normal = await launch("normal");
  report.cases.push({ name: "normal-startup", result: "passed", snapshot: normal.snapshot, affinity: normal.affinity });
  await close(normal);
  const blocker = start(require("electron"), [path.join(__dirname, "shortcut-blocker.cjs"), path.join(evidenceDir, "blocker")]);
  await until(() => {
    if (blocker.child.exitCode !== null) throw new Error(blocker.output);
    return blocker.output.includes("AIGA_SHORTCUT_BLOCKER_READY");
  }, "Ctrl+E blocker");
  const conflict = await launch("conflict");
  assert.ok(conflict.log.includes("Global shortcut unavailable; application will still open"));
  assert.ok(conflict.log.includes('"label":"push-to-talk"'));
  report.cases.push({ name: "occupied-shortcut-startup", result: "passed", snapshot: conflict.snapshot, affinity: conflict.affinity, log: conflict.log });
  await conflict.inspector.evaluate(`(() => { const e=process.mainModule.require('electron'); e.BrowserWindow.getAllWindows()[0].hide(); return true; })()`);
  const second = start(executable, ["--user-data-dir=" + conflict.profile]);
  const [code] = await once(second.child, "exit"); assert.equal(code, 0);
  const activated = await until(async () => conflict.inspector.evaluate(`(() => { const e=process.mainModule.require('electron'); const wins=e.BrowserWindow.getAllWindows(); return wins.length===1 && wins[0].isVisible(); })()`), "second launch activates existing window");
  assert.equal(activated, true);
  report.cases.push({ name: "second-instance-activation", result: "passed", originalPid: conflict.snapshot.pid, secondExitCode: code });
  await close(conflict);
  const blockerExit = once(blocker.child, "exit"); blocker.child.kill(); await blockerExit;
  console.log("PASS: full packaged application opens, opens with Ctrl+E occupied, reuses existing window; guide included");
})().catch((error) => {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
}).finally(() => {
  for (const child of processes) child.kill();
  report.finishedAt = new Date().toISOString();
  const destination = path.join(evidenceDir, "evidence.json");
  fs.writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log(`Evidence: ${destination}`);
});
