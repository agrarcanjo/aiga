const test = require("node:test");
const assert = require("node:assert/strict");
const { createStealthWindowService } = require("./stealth-window-service.cjs");

function setup() {
  const calls = [], scheduled = [];
  let visible = true, minimized = false;
  const win = {
    isDestroyed: () => false, isVisible: () => visible, isMinimized: () => minimized,
    isFocused: () => false, isAlwaysOnTop: () => calls.some((c) => c[0] === "top" && c[1] === true),
    setContentProtection: value => calls.push(["protection", value]),
    setAlwaysOnTop: value => calls.push(["top", value]),
    setSkipTaskbar() {}, setOpacity() {}, setIgnoreMouseEvents() {}, flashFrame() {}, setProgressBar() {},
    restore() { minimized = false; }, show() { visible = true; }, showInactive() { visible = true; },
    hide() { visible = false; }, focus: () => calls.push(["focus"]), moveTop: () => calls.push(["move"]),
  };
  const service = createStealthWindowService({ getMainWindow: () => win, schedule: callback => { scheduled.push(callback); }, logger: { info() {}, debug() {}, warn() {}, error() {} } });
  return { service, calls, scheduled, minimize: () => { minimized = true; } };
}

test("visible stealth stays on top without stealing focus or removing protection", () => {
  const { service, calls } = setup();
  service.setStealthMode({ enabled: true, hardening: "safe" });
  calls.length = 0;
  service.ensureVisibleOnTop();
  assert.deepEqual(calls, [["top", true], ["move"]]);
});

test("maintenance skip moveTop while window is focused (native select)", () => {
  const calls = [];
  let focused = true;
  const win = {
    isDestroyed: () => false, isVisible: () => true, isMinimized: () => false,
    isFocused: () => focused, isAlwaysOnTop: () => true,
    setContentProtection() {}, setAlwaysOnTop: value => calls.push(["top", value]),
    setSkipTaskbar() {}, setOpacity() {}, setIgnoreMouseEvents() {}, flashFrame() {}, setProgressBar() {},
    restore() {}, show() {}, showInactive() {}, hide() {}, focus: () => calls.push(["focus"]),
    moveTop: () => calls.push(["move"]),
  };
  const service = createStealthWindowService({
    getMainWindow: () => win,
    schedule: () => {},
    logger: { info() {}, debug() {}, warn() {}, error() {} }
  });
  service.setStealthMode({ enabled: true, hardening: "safe" });
  calls.length = 0;
  service.ensureVisibleOnTop();
  assert.deepEqual(calls, []);
  focused = false;
  service.ensureVisibleOnTop();
  assert.deepEqual(calls, [["top", true], ["move"]]);
});
test("top refresh respects full stealth, capture hiding, minimization and normal mode", () => {
  for (const mode of ["full", "capture", "minimized", "normal"]) {
    const { service, calls, minimize } = setup();
    service.setStealthMode({ enabled: true, hardening: "safe" });
    if (mode === "full") service.enterFullStealth();
    if (mode === "capture") { service.setStealthMode({ enabled: false }); service.hideForExternalCapture(); }
    if (mode === "minimized") minimize();
    if (mode === "normal") service.setStealthMode({ enabled: false });
    calls.length = 0;
    service.ensureVisibleOnTop();
    assert.deepEqual(calls, [], mode);
  }
});
test("explicit shortcut restores minimized window and reinserts it above other topmost windows", () => {
  const { service, calls, minimize } = setup();
  service.setStealthMode({ enabled: true, hardening: "safe" });
  minimize();
  calls.length = 0;
  service.ensureVisibleOnTop({ force: true, reason: "compatibility-shortcut" });
  assert.deepEqual(calls, [["top", false], ["top", true], ["move"], ["focus"]]);
  assert.equal(service.getWindowDiagnostics().minimized, false);
  assert.equal(service.getWindowDiagnostics().enabled, true);
});

test("every capture restores top position and retries without stealing focus", () => {
  const { service, calls, scheduled } = setup();
  service.setStealthMode({ enabled: true, hardening: "safe" });
  const snapshot = service.hideForExternalCapture();
  calls.length = 0;
  service.restoreAfterExternalCapture(snapshot);
  assert.ok(calls.some(c => c[0] === "focus"));
  assert.equal(service.getWindowDiagnostics().visible, true);
  assert.equal(scheduled.length, 2);
  calls.length = 0;
  scheduled.forEach(callback => callback());
  assert.deepEqual(calls, [["top", false], ["top", true], ["move"], ["top", false], ["top", true], ["move"]]);
});
test("deferred top retries do not expose the agent in another capture or full stealth", () => {
  for (const action of ["capture", "full", "minimize"]) {
    const { service, calls, scheduled, minimize } = setup();
    service.setStealthMode({ enabled: true, hardening: "safe" });
    service.restoreAfterExternalCapture(service.hideForExternalCapture());
    if (action === "capture") service.hideForExternalCapture();
    if (action === "full") service.enterFullStealth();
    if (action === "minimize") minimize();
    calls.length = 0;
    scheduled.forEach(callback => callback());
    assert.deepEqual(calls, [], action);
  }
});

test("stealth capture keeps AIGA visible and skips hide delay while preserving protection", () => {
  const { service, calls } = setup();
  service.setStealthMode({ enabled: true, hardening: "safe" });
  calls.length = 0;
  const snapshot = service.hideForExternalCapture();
  assert.equal(snapshot.hiddenForCapture, false);
  assert.equal(service.getWindowDiagnostics().visible, true);
  assert.deepEqual(calls, [["protection", true]]);
});
test("non-stealth capture retains hiding and full stealth stays hidden", () => {
  const { service } = setup();
  assert.equal(service.hideForExternalCapture().hiddenForCapture, true);
  assert.equal(service.getWindowDiagnostics().visible, false);
  service.setStealthMode({ enabled: true, hardening: "safe" });
  service.enterFullStealth();
  assert.equal(service.hideForExternalCapture().hiddenForCapture, false);
  assert.equal(service.getWindowDiagnostics().visible, false);
});
