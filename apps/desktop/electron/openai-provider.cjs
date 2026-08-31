// OpenAI Chat Completions streaming provider
const { buildTextAndMediaParts } = require("./llm-parts-builder.cjs");

function buildOpenAiMessages(parts) {
  const content = [];
  let text = "";

  parts.forEach((part) => {
    if (part.type === "text") {
      text += part.text;
      return;
    }
    if (part.type === "image") {
      content.push({
        type: "image_url",
        image_url: { url: `data:${part.mimeType};base64,${part.base64}` }
      });
    }
  });

  if (text) {
    content.unshift({ type: "text", text });
  }

  if (content.length === 1 && content[0].type === "text") {
    return [{ role: "user", content: content[0].text }];
  }

  return [{ role: "user", content }];
}

function createOpenAiProvider(options) {
  const logger = options.logger;
  const defaultModel = "gpt-4o-mini";

  async function streamAskResponse(input) {
    const modelName = input.modelId || defaultModel;
    const parts = buildTextAndMediaParts(input.ask, input.screenshots, input.audioItems || []);
    const messages = buildOpenAiMessages(parts);

    logger.info("Starting OpenAI streaming request", {
      requestId: input.requestId,
      modelName
    });

    input.onEvent({
      requestId: input.requestId,
      status: "started",
      createdAtIso: new Date().toISOString()
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errText.slice(0, 300)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("OpenAI stream body unavailable.");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (!delta) {
            continue;
          }
          fullText += delta;
          input.onEvent({
            requestId: input.requestId,
            status: "chunk",
            deltaText: delta,
            fullText,
            createdAtIso: new Date().toISOString()
          });
          if (input.onUsage && parsed.usage) {
            input.onUsage({
              inputTokens: parsed.usage.prompt_tokens || 0,
              outputTokens: parsed.usage.completion_tokens || 0
            });
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }

    input.onEvent({
      requestId: input.requestId,
      status: "completed",
      fullText,
      createdAtIso: new Date().toISOString()
    });

    logger.info("OpenAI streaming completed", {
      requestId: input.requestId,
      outputLength: fullText.length
    });
  }

  async function testConnection(apiKey, modelId) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelId || defaultModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    return true;
  }

  return { streamAskResponse, testConnection };
}

module.exports = { createOpenAiProvider };
