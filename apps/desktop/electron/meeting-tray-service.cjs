// System tray indicator during meeting recording (G2 — stealth §4.3.1)
const { Tray, Menu, nativeImage } = require("electron");

function createDotIcon(rgb) {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const [r, g, b] = rgb;
  const cx = 8;
  const cy = 8;
  const radius = 6;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const i = (y * size + x) * 4;
      if (dx * dx + dy * dy <= radius * radius) {
        buffer[i] = r;
        buffer[i + 1] = g;
        buffer[i + 2] = b;
        buffer[i + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function createMeetingTrayService(dependencies) {
  const logger = dependencies.logger;
  const onStop = dependencies.onStop;
  const onCancel = dependencies.onCancel;

  let tray = null;
  let activeSessionId = null;
  let elapsedSeconds = 0;
  let recordingIcon = null;
  let idleIcon = null;

  function ensureTray() {
    if (tray) {
      return tray;
    }
    recordingIcon = createDotIcon([239, 68, 68]);
    idleIcon = createDotIcon([99, 102, 241]);
    tray = new Tray(recordingIcon);
    tray.setToolTip("AIGA");
    tray.on("double-click", () => {
      if (dependencies.onShowWindow) {
        dependencies.onShowWindow();
      }
    });
    return tray;
  }

  function buildMenu() {
    const elapsedLabel = formatElapsed(elapsedSeconds);
    return Menu.buildFromTemplate([
      {
        label: activeSessionId ? `Gravando reunião · ${elapsedLabel}` : "AIGA",
        enabled: false
      },
      { type: "separator" },
      {
        label: "Encerrar e analisar",
        enabled: Boolean(activeSessionId),
        click: () => {
          if (activeSessionId && onStop) {
            void onStop(activeSessionId);
          }
        }
      },
      {
        label: "Cancelar reunião",
        enabled: Boolean(activeSessionId),
        click: () => {
          if (activeSessionId && onCancel) {
            void onCancel(activeSessionId);
          }
        }
      },
      { type: "separator" },
      {
        label: "Mostrar janela",
        click: () => {
          if (dependencies.onShowWindow) {
            dependencies.onShowWindow();
          }
        }
      }
    ]);
  }

  function refreshTray() {
    if (!tray) {
      return;
    }
    if (activeSessionId) {
      tray.setImage(recordingIcon);
      tray.setToolTip(`Gravando reunião · ${formatElapsed(elapsedSeconds)}`);
    } else {
      tray.setImage(idleIcon);
      tray.setToolTip("AIGA");
    }
    tray.setContextMenu(buildMenu());
  }

  function setRecording(payload) {
    activeSessionId = payload.sessionId;
    elapsedSeconds = payload.elapsedSeconds || 0;
    ensureTray();
    refreshTray();
  }

  function updateElapsed(seconds) {
    if (!activeSessionId) {
      return;
    }
    elapsedSeconds = seconds;
    refreshTray();
  }

  function clearRecording() {
    activeSessionId = null;
    elapsedSeconds = 0;
    if (tray) {
      refreshTray();
    }
  }

  function destroy() {
    if (tray) {
      tray.destroy();
      tray = null;
    }
    activeSessionId = null;
    elapsedSeconds = 0;
    logger.debug("Meeting tray destroyed");
  }

  return {
    setRecording,
    updateElapsed,
    clearRecording,
    destroy
  };
}

module.exports = { createMeetingTrayService };
