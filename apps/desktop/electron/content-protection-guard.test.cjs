const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
test("AIGA protection remains enabled across window events and watchdog", () => {
  const events = {}, protections = [], screenEvents = {}; let tick;
  const window = { id: 1, isDestroyed: () => false, setContentProtection: (value) => protections.push(value), on: (name, callback) => events[name] = callback };
  const context = { module: { exports: {} }, process: { platform: "win32" },
    setInterval: (callback) => { tick = callback; return { unref() {} }; }, clearInterval() {},
    require: (name) => name === "node:os" ? { release: () => "10.0.26100" } : { BrowserWindow: { getAllWindows: () => [window] }, screen: { on: (name, callback) => screenEvents[name] = callback } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "content-protection-guard.cjs"), "utf8"), context);
  const guard = context.module.exports.createContentProtectionGuard(); guard.register(window); guard.start();
  for (const callback of Object.values(events)) callback(); tick(); screenEvents["display-added"]();
  assert.ok(protections.length > 10); assert.ok(protections.every((value) => value === true)); assert.equal(guard.getState().enabled, true); guard.stop();
});
