const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness({ blocked = [], throwing = [] } = {}) {
  const attempts = [], warnings = [];
  const shortcuts = { captureScreen: "Ctrl+E", toggleFullStealth: "Ctrl+Shift+H", pushToTalk: "Ctrl+D" };
  const context = { module: { exports: {} }, require(name) {
    if (name === "electron") return { globalShortcut: {
      register(accelerator) {
        attempts.push(accelerator);
        if (throwing.includes(accelerator)) throw new Error("Invalid accelerator");
        return !blocked.includes(accelerator);
      }, unregister() {}, unregisterAll() {}
    } };
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "shortcut-service.cjs"), "utf8"), context);
  const service = context.module.exports.createShortcutService({
    logger: { info() {}, error() {}, warn: (...args) => warnings.push(args) },
    settingsStore: { getPublicSettings: () => ({ shortcuts }), savePartial: (partial) => Object.assign(shortcuts, partial.shortcuts) },
  });
  return { service, attempts, warnings, shortcuts };
}
test("occupied startup shortcut does not prevent other shortcuts or application startup", () => {
  const { service, attempts, warnings } = harness({ blocked: ["Ctrl+E"] });
  const state = service.refreshShortcuts({ allowUnavailable: true });
  assert.equal(state.captureShortcut, null);
  assert.equal(state.fullStealthShortcut, "Ctrl+Shift+H");
  assert.equal(state.pushToTalkShortcut, "Ctrl+D");
  assert.deepEqual(attempts, ["Ctrl+E", "Ctrl+Shift+H", "Ctrl+D"]);
  assert.equal(state.unavailable.length, 1); assert.equal(warnings.length, 1);
});
test("all occupied shortcuts remain nonfatal during startup", () => {
  const { service } = harness({ blocked: ["Ctrl+E", "Ctrl+Shift+H", "Ctrl+D"] });
  const state = service.refreshShortcuts({ allowUnavailable: true });
  assert.equal(state.unavailable.length, 3);
});
test("invalid accelerator is contained during startup", () => {
  const { service, attempts } = harness({ throwing: ["Ctrl+E"] });
  assert.equal(service.refreshShortcuts({ allowUnavailable: true }).captureShortcut, null);
  assert.equal(attempts.length, 3);
});
test("explicit shortcut configuration still reports registration errors", () => {
  const { service } = harness({ blocked: ["Ctrl+E"] });
  assert.throws(() => service.refreshShortcuts(), /Unable to register global shortcut/);
});

test("unavailable shortcuts are persisted blank and remain disabled on refresh", () => {
 const { service, attempts, shortcuts } = harness({ blocked: ["Ctrl+E", "Ctrl+Shift+H", "Ctrl+D"] });
 service.refreshShortcuts({ allowUnavailable: true });
 assert.deepEqual(shortcuts, { captureScreen: "", toggleFullStealth: "", pushToTalk: "" });
 attempts.length = 0;
 service.refreshShortcuts({ allowUnavailable: true });
 assert.deepEqual(attempts, []);
});
test("clearing one conflict preserves other shortcuts", () => {
 const { service, shortcuts } = harness({ blocked: ["Ctrl+Shift+H"] });
 service.refreshShortcuts({ allowUnavailable: true });
 assert.equal(shortcuts.toggleFullStealth, "");
 assert.equal(shortcuts.captureScreen, "Ctrl+E");
 assert.equal(shortcuts.pushToTalk, "Ctrl+D");
});
