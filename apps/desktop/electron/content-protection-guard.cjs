// Mantém content protection (exclusão de captura de tela) aplicada em todas as janelas.
// No Windows a flag é WDA_EXCLUDEFROMCAPTURE (build 19041+); ela pode ser perdida
// quando a janela é escondida/reexibida, então reaplicamos em eventos e por watchdog.
const os = require("node:os");
const { BrowserWindow, screen } = require("electron");

const REAPPLY_EVENTS = [
  "show",
  "restore",
  "focus",
  "blur",
  "move",
  "moved",
  "resize",
  "resized",
  "maximize",
  "unmaximize",
  "always-on-top-changed",
  "ready-to-show"
];

const WATCHDOG_INTERVAL_MS = 2000;

/** WDA_EXCLUDEFROMCAPTURE exige Windows 10 2004 (build 19041). Abaixo disso a janela só fica preta. */
function getPlatformSupport() {
  if (process.platform === "darwin") {
    return { supported: true, level: "full", detail: "macOS sharingType none" };
  }
  if (process.platform !== "win32") {
    return {
      supported: false,
      level: "none",
      detail: "Content protection indisponível nesta plataforma."
    };
  }

  const build = Number(os.release().split(".")[2] || 0);
  if (build >= 19041) {
    return { supported: true, level: "full", detail: `Windows build ${build} (WDA_EXCLUDEFROMCAPTURE)` };
  }
  return {
    supported: false,
    level: "partial",
    detail: `Windows build ${build}: a janela aparece como retângulo preto no compartilhamento, não invisível. Atualize para o Windows 10 2004+ (build 19041).`
  };
}

function createContentProtectionGuard(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {}, debug: () => {} };

  let enabled = true;
  let watchdog = null;
  let lastError = "";

  function applyTo(windowRef) {
    if (!windowRef || windowRef.isDestroyed()) {
      return false;
    }
    try {
      windowRef.setContentProtection(enabled);
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn("Failed to apply content protection", { lastError });
      return false;
    }
  }

  function applyAll() {
    let applied = 0;
    for (const windowRef of BrowserWindow.getAllWindows()) {
      if (applyTo(windowRef)) {
        applied += 1;
      }
    }
    return applied;
  }

  function register(windowRef) {
    if (!windowRef || windowRef.isDestroyed()) {
      return;
    }
    applyTo(windowRef);
    for (const eventName of REAPPLY_EVENTS) {
      windowRef.on(eventName, () => applyTo(windowRef));
    }
    logger.debug("Content protection guard registered for window", { id: windowRef.id });
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    const applied = applyAll();
    logger.info("Content protection state changed", { enabled, windows: applied });
    return getState();
  }

  function start() {
    if (watchdog) {
      return;
    }
    watchdog = setInterval(applyAll, WATCHDOG_INTERVAL_MS);
    if (typeof watchdog.unref === "function") {
      watchdog.unref();
    }
    try {
      screen.on("display-metrics-changed", applyAll);
      screen.on("display-added", applyAll);
      screen.on("display-removed", applyAll);
    } catch {
      // screen indisponível em ambiente de teste
    }
  }

  function stop() {
    if (watchdog) {
      clearInterval(watchdog);
      watchdog = null;
    }
  }

  function getState() {
    const platform = getPlatformSupport();
    return {
      enabled,
      platformSupported: platform.supported,
      protectionLevel: platform.level,
      platformDetail: platform.detail,
      windowCount: BrowserWindow.getAllWindows().length,
      watchdogActive: Boolean(watchdog),
      lastError
    };
  }

  return { register, applyAll, setEnabled, start, stop, getState };
}

module.exports = { createContentProtectionGuard, getPlatformSupport };
