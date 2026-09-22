const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

function safeSegment(value) { return String(value || "conversa").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "conversa"; }
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

function createConversationArchiveService(options = {}) {
  const logger = options.logger || { info: () => {} };
  const draftsRoot = path.join(app.getPath("userData"), "conversation-drafts");
  const archivesRoot = path.join(app.getPath("documents"), "AIGA", "Conversas");

  function stageAttachments(sessionId, screenshots = [], audios = []) {
    const mediaDir = path.join(draftsRoot, safeSegment(sessionId), "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    for (const item of [...screenshots, ...audios]) {
      const source = item.imagePath || item.audioPath;
      const id = item.captureId || item.audioId;
      if (!source || !id || !fs.existsSync(source)) continue;
      const destination = path.join(mediaDir, `${safeSegment(id)}${path.extname(source) || ".bin"}`);
      if (!fs.existsSync(destination)) fs.copyFileSync(source, destination);
    }
  }

  function saveConversation(payload) {
    const now = new Date();
    const destination = path.join(archivesRoot, `${now.toISOString().replace(/[:.]/g, "-")}_${safeSegment(payload.sessionId).slice(0, 12)}`);
    const mediaDestination = path.join(destination, "media");
    fs.mkdirSync(mediaDestination, { recursive: true });
    const stagedMedia = path.join(draftsRoot, safeSegment(payload.sessionId), "media");
    if (fs.existsSync(stagedMedia)) fs.cpSync(stagedMedia, mediaDestination, { recursive: true });
    const mediaNames = new Set(fs.readdirSync(mediaDestination));
    const findMedia = (id) => [...mediaNames].find((name) => name.startsWith(`${safeSegment(id)}.`));
    const messages = payload.messages.map((message) => ({ ...message, linkedScreenshotPreviewUrls: undefined, screenshots: (message.linkedScreenshotIds || []).map(findMedia).filter(Boolean), audios: (message.linkedAudioIds || []).map(findMedia).filter(Boolean) }));
    const manifest = { version: 1, sessionId: payload.sessionId, savedAtIso: now.toISOString(), messages };
    fs.writeFileSync(path.join(destination, "conversa.json"), JSON.stringify(manifest, null, 2), "utf-8");
    const body = messages.map((m) => `<article class="${m.role}"><header>${m.role === "user" ? "Você" : "IA"} · ${escapeHtml(m.createdAtIso)}</header><pre>${escapeHtml(m.content)}</pre>${m.screenshots.map((n) => `<img src="media/${encodeURIComponent(n)}" alt="Screenshot">`).join("")}${m.audios.map((n) => `<audio controls src="media/${encodeURIComponent(n)}"></audio>`).join("")}</article>`).join("\n");
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conversa AIGA</title><style>body{font:14px system-ui;max-width:960px;margin:32px auto;background:#111;color:#eee}article{padding:16px;margin:12px 0;border:1px solid #333;border-radius:10px}.user{background:#182038}.assistant{background:#1c1c1c}header{color:#999;font-size:12px}pre{white-space:pre-wrap;font:inherit}img{max-width:100%;display:block;margin-top:12px;border-radius:8px}audio{width:100%;margin-top:12px}</style><body><h1>Conversa AIGA</h1>${body}</body></html>`;
    const htmlPath = path.join(destination, "conversa.html");
    fs.writeFileSync(htmlPath, html, "utf-8");
    logger.info("Conversation archived", { sessionId: payload.sessionId, destination, messageCount: messages.length });
    return { saved: true, folderPath: destination, htmlPath, savedAtIso: now.toISOString() };
  }
  return { stageAttachments, saveConversation };
}
module.exports = { createConversationArchiveService };
