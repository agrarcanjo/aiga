const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

test("salva conversa autocontida com HTML, JSON, imagem e áudio", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiga-conversation-"));
  const userData = path.join(root, "userData");
  const documents = path.join(root, "Documents");
  const imagePath = path.join(root, "capture.png");
  const audioPath = path.join(root, "audio.webm");
  fs.writeFileSync(imagePath, "image");
  fs.writeFileSync(audioPath, "audio");
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") return { app: { getPath: (name) => name === "documents" ? documents : userData } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("./conversation-archive-service.cjs")];
    const service = require("./conversation-archive-service.cjs").createConversationArchiveService();
    service.stageAttachments("session-1", [{ captureId: "cap-1", imagePath }], [{ audioId: "aud-1", audioPath }]);
    const result = service.saveConversation({ sessionId: "session-1", messages: [{ id: "1", requestId: "r", role: "user", content: "Pergunta", createdAtIso: new Date().toISOString(), status: "completed", linkedScreenshotIds: ["cap-1"], linkedAudioIds: ["aud-1"] }] });
    assert.equal(fs.existsSync(result.htmlPath), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.folderPath, "conversa.json"), "utf-8"));
    assert.equal(manifest.messages[0].screenshots.length, 1);
    assert.equal(manifest.messages[0].audios.length, 1);
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
