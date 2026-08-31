// G4 — frameless always-on-top window for live subtitles
const path = require("node:path");
const { BrowserWindow } = require("electron");

// Content protection do overlay é mantida pelo content-protection-guard no main.
function applyOverlayStealthProfile(windowRef, hardening) {
  const level = hardening || "safe";
  if (level === "strict") {
    windowRef.setOpacity(0.88);
  }
}

function createTranslationOverlayWindow(dependencies) {
  const logger = dependencies.logger;
  const getOverlayUrl = dependencies.getOverlayUrl;
  const getStealthHardening = dependencies.getStealthHardening;

  let overlayWindow = null;

  function createWindow() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      return overlayWindow;
    }

    overlayWindow = new BrowserWindow({
      width: 560,
      height: 200,
      minWidth: 320,
      minHeight: 80,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      show: false,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    overlayWindow.setAlwaysOnTop(true, "screen-saver");
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    applyOverlayStealthProfile(
      overlayWindow,
      typeof getStealthHardening === "function" ? getStealthHardening() : "safe"
    );

    const url = getOverlayUrl();
    void overlayWindow.loadURL(url);

    overlayWindow.on("closed", () => {
      overlayWindow = null;
    });

    logger.info("Translation overlay window created", { url });
    return overlayWindow;
  }

  function show() {
    const win = createWindow();
    applyOverlayStealthProfile(
      win,
      typeof getStealthHardening === "function" ? getStealthHardening() : "safe"
    );
    if (!win.isVisible()) {
      win.show();
    }
    return win;
  }

  function hide() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
  }

  function destroy() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
      overlayWindow = null;
    }
  }

  function isVisible() {
    return Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible());
  }

  return {
    show,
    hide,
    destroy,
    isVisible
  };
}

module.exports = { createTranslationOverlayWindow };
