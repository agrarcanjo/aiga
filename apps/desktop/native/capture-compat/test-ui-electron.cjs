const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { once } = require("node:events");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createNativeRunner, createCaptureCompatService, registerCaptureCompatIpc } = require("../../electron/capture-compat-service.cjs");
const { createContentProtectionGuard } = require("../../electron/content-protection-guard.cjs");
app.setPath("userData", path.join(__dirname, "out/ui/profile"));
app.disableHardwareAcceleration();
let fixture, service, guard;
const timeout = setTimeout(() => { console.error("UI test timed out"); app.exit(1); }, 45000);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const fixturePath = path.join(__dirname, "out/x64/Release/aiga-capture-fixture.exe");
  fixture = spawn(fixturePath, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const identity = { ...JSON.parse((await once(fixture.stdout, "data"))[0]), path: fixturePath, arch: "x64" };
  const resourcesRoot = path.resolve(__dirname, "../../resources");
  const native = createNativeRunner(resourcesRoot);
  service = createCaptureCompatService({ resourcesRoot, run: async (operation, selected, token) => {
    // Test-only discovery adapter; never enumerates or selects production Java.
    if (operation === "list") return { protocol: 1, candidates: [{ ...identity, windows: (await native("query", identity, "0".repeat(64))).windows }] };
    return native(operation, selected, token);
  } });
  const win = new BrowserWindow({ width: 850, height: 950, show: false, webPreferences: { preload: path.resolve(__dirname, "../../electron/preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  guard = createContentProtectionGuard(); guard.register(win); guard.start();
  async function aigaAffinity() {
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "query-affinity.ps1"), "-WindowHandle", win.getNativeWindowHandle().readBigUInt64LE().toString()], { windowsHide: true });
    const value = JSON.parse(stdout); assert.equal(value.known, true); assert.equal(value.affinity, 17); return value;
  }
  const guardBefore = await aigaAffinity();
  const url = pathToFileURL(path.join(__dirname, "out/ui/dist/index.html")).href;
  registerCaptureCompatIpc({ ipcMain, service, getMainWindow: () => win, trustedUrl: () => url });
  await win.loadURL(url);
  const read = () => win.webContents.executeJavaScript("document.body.innerText");
  async function waitFor(text) {
    for (let i = 0; i < 150; i++) { if ((await read()).includes(text)) return; await delay(100); }
    throw new Error(`UI did not show ${text}: ${await read()}`);
  }
  async function click(text) {
    for (let i = 0; i < 150; i++) {
      const clicked = await win.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`);
      if (clicked) return; await delay(100);
    }
    throw new Error(`UI button unavailable: ${text}`);
  }
  await waitFor("Compatibilidade de captura");
  await click("Atualizar instâncias"); await waitFor("Selecionar esta instância");
  await click("Selecionar esta instância"); await waitFor("Selecionado: PID");
  await click("Habilitar compatibilidade"); await waitFor("Ativo e verificado");
  assert.equal(service.snapshot().status, "verified");
  assert.equal(guard.getState().enabled, true);
  const guardAfter = await aigaAffinity();
  const activeText = await read();
  await click("Desativar"); await waitFor("Interceptação desativada.");
  assert.equal(service.snapshot().hookActive, false);
  const report = { at: new Date().toISOString(), result: "passed", activeText, disabledText: await read(), guardEnabled: guard.getState().enabled, guardBefore, guardAfter };
  fs.writeFileSync(path.join(__dirname, "out/ui-evidence.json"), JSON.stringify(report, null, 2));
  console.log("UI PASS: discovery, selection, enable, real verification, disable, AIGA guard preserved");
  service.close(); guard.stop(); fixture.stdin.end("quit\n"); await once(fixture, "exit");
  clearTimeout(timeout); win.destroy(); app.exit(0);
}).catch((error) => {
  console.error(error); service?.close(); guard?.stop(); fixture?.stdin.end("quit\n"); clearTimeout(timeout); app.exit(1);
});
