// Multimodal parts for cloud LLM providers
const fs = require("node:fs");

function buildTextAndMediaParts(ask, screenshots, audioItems) {
  const parts = [{ type: "text", text: ask }];

  (screenshots || []).forEach((item) => {
    if (!item?.imagePath || !fs.existsSync(item.imagePath)) {
      return;
    }
    parts.push({
      type: "image",
      mimeType: "image/png",
      base64: fs.readFileSync(item.imagePath).toString("base64")
    });
  });

  (audioItems || []).forEach((item) => {
    if (!item?.audioPath || !fs.existsSync(item.audioPath)) {
      return;
    }
    parts.push({
      type: "audio",
      mimeType: item.mimeType || "audio/webm",
      base64: fs.readFileSync(item.audioPath).toString("base64")
    });
  });

  return parts;
}

function buildGeminiParts(ask, screenshots, audioItems) {
  const parts = [{ text: ask }];
  (screenshots || []).forEach((item) => {
    if (!item?.imagePath || !fs.existsSync(item.imagePath)) {
      return;
    }
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: fs.readFileSync(item.imagePath).toString("base64")
      }
    });
  });
  (audioItems || []).forEach((item) => {
    if (!item?.audioPath || !fs.existsSync(item.audioPath)) {
      return;
    }
    parts.push({
      inlineData: {
        mimeType: item.mimeType || "audio/webm",
        data: fs.readFileSync(item.audioPath).toString("base64")
      }
    });
  });
  return parts;
}

function estimateTokensFromText(text) {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

module.exports = {
  buildTextAndMediaParts,
  buildGeminiParts,
  estimateTokensFromText
};
