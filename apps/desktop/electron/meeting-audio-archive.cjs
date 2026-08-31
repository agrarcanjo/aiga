const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

function getDefaultMeetingRecordingsPath() {
  return path.join(app.getPath("userData"), "meeting-recordings");
}

function resolveRecordingsRoot(configuredPath) {
  const trimmed = String(configuredPath || "").trim();
  if (trimmed) {
    return trimmed;
  }
  return getDefaultMeetingRecordingsPath();
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Persists meeting/translation capture chunks under userData (or custom path).
 */
function createMeetingAudioArchive(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {} };
  const settingsStore = options?.settingsStore;

  function isEnabled() {
    const ac = settingsStore?.getAudioCapture?.() || {};
    return Boolean(ac.saveRecordings);
  }

  function getRootPath() {
    const ac = settingsStore?.getAudioCapture?.() || {};
    return resolveRecordingsRoot(ac.recordingsPath);
  }

  function getSessionDir(sessionId, kind = "meeting") {
    const safeId = String(sessionId || "session").replace(/[^\w.-]+/g, "_").slice(0, 64);
    const stamp = new Date().toISOString().slice(0, 10);
    return path.join(getRootPath(), kind, `${stamp}_${safeId}`);
  }

  function saveChunk(payload) {
    if (!isEnabled()) {
      return { saved: false, reason: "disabled" };
    }

    const sessionId = payload?.sessionId || "session";
    const kind = payload?.kind || "meeting";
    const extension = payload?.extension || "wav";
    const buffer = payload?.buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 32) {
      return { saved: false, reason: "empty" };
    }

    try {
      const dir = getSessionDir(sessionId, kind);
      ensureDirectory(dir);
      const fileName = `chunk-${Date.now()}.${extension.replace(/^\./, "")}`;
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, buffer);
      logger.info("Meeting audio chunk saved", { filePath, bytes: buffer.length });
      return { saved: true, filePath, dir };
    } catch (error) {
      logger.warn("Failed to save meeting audio chunk", {
        message: error instanceof Error ? error.message : String(error)
      });
      return { saved: false, reason: "error" };
    }
  }

  function saveChunkBase64(payload) {
    const base64 = payload?.chunkBase64 || "";
    if (!base64) {
      return { saved: false, reason: "empty" };
    }
    return saveChunk({
      sessionId: payload.sessionId,
      kind: payload.kind,
      extension: payload.extension || "webm",
      buffer: Buffer.from(base64, "base64")
    });
  }

  return {
    isEnabled,
    getRootPath,
    getDefaultMeetingRecordingsPath,
    saveChunk,
    saveChunkBase64
  };
}

module.exports = {
  createMeetingAudioArchive,
  getDefaultMeetingRecordingsPath,
  resolveRecordingsRoot
};
