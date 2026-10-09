const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createStartupErrorReporter } = require("./startup-errors.cjs");

test("startup rejection is logged and shown once before quitting", () => {
  const dialogs = [], logs = []; let quits = 0;
  const report = createStartupErrorReporter({
    app: { quit: () => quits++ },
    dialog: { showErrorBox: (...args) => dialogs.push(args) },
    getLogger: () => ({ error: (...args) => logs.push(args), getLogFilePath: () => "C:\\test\\desktop.log" }),
    consoleRef: { error() {} }
  });
  report(new Error("Interface not found"), "Carregamento da interface"); report(new Error("duplicate"), "Inicialização");
  assert.equal(quits, 1); assert.equal(logs.length, 1); assert.equal(dialogs.length, 1);
  assert.match(dialogs[0][1], /Interface not found/); assert.match(dialogs[0][1], /desktop.log/);
});
test("logger failure falls back to a file in the selected profile", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiga-startup-test-"));
  try {
    const dialogs = [];
    const report = createStartupErrorReporter({ app: { getPath: () => root, quit() {} }, dialog: { showErrorBox: (...args) => dialogs.push(args) }, getLogger: () => null, consoleRef: { error() {} } });
    report(new Error("Cannot initialize settings"), "Inicialização");
    const log = path.join(root, "logs/startup-error.log");
    assert.match(fs.readFileSync(log, "utf8"), /Cannot initialize settings/);
    assert.ok(dialogs[0][1].includes(log));
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("aiga-startup-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
