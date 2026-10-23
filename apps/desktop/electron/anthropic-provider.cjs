// Anthropic Messages API streaming provider
const { buildTextAndMediaParts } = require("./llm-parts-builder.cjs");

function buildAnthropicContent(parts) {
  const content = [];
  let text = "";

  parts.forEach((part) => {
    if (part.type === "text") {
      text += part.text;
      return;
    }
    if (part.type === "image") {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: part.mimeType,
          data: part.base64
        }
      });
    }
  });

  if (text) {
    content.unshift({ type: "text", text });
  }

  return content;
}

function createAnthropicProvider(options) {
  const logger = options.logger;
  const defaultModel = "claude-3-5-haiku-latest";

  async function streamAskResponse(input) {
    const modelName = input.modelId || defaultModel;
    const parts = buildTextAndMediaParts(input.ask, input.screenshots, input.audioItems || []);
    const content = buildAnthropicContent(parts);

    logger.info("Starting Anthropic streaming request", {
      requestId: input.requestId,
      modelName
    });

    input.onEvent({
      requestId: input.requestId,
      status: "started",
      createdAtIso: new Date().toISOString()
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 4096,
        stream: true,
        messages: [{ role: "user", content }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic HTTP ${response.status}: ${errText.slice(0, 300)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Anthropic stream body unavailable.");
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
        if (!data) {
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            const delta = parsed.delta.text || "";
            fullText += delta;
            input.onEvent({
              requestId: input.requestId,
              status: "chunk",
              deltaText: delta,
              fullText,
              createdAtIso: new Date().toISOString()
            });
          }
          if (parsed.type === "message_delta" && parsed.usage && input.onUsage) {
            input.onUsage({
              inputTokens: parsed.usage.input_tokens || 0,
              outputTokens: parsed.usage.output_tokens || 0
            });
          }
        } catch {
          // ignore
        }
      }
    }

    input.onEvent({
      requestId: input.requestId,
      status: "completed",
      fullText,
      createdAtIso: new Date().toISOString()
    });

    logger.info("Anthropic streaming completed", {
      requestId: input.requestId,
      outputLength: fullText.length
    });
  }

  async function testConnection(apiKey, modelId) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelId || defaultModel,
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    return true;
  }

  async function listModels(apiKey) {
    const fetchImpl = options?.fetchImpl || fetch;
    const ids = [];
    let afterId = "";
    for (let page = 0; page < 10; page += 1) {
      const url = new URL("https://api.anthropic.com/v1/models");
      url.searchParams.set("limit", "1000");
      if (afterId) url.searchParams.set("after_id", afterId);
      const response = await fetchImpl(url, {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status} ao listar modelos Anthropic: ${errText.slice(0, 200)}`);
      }
      const body = await response.json();
      for (const model of body.data || []) {
        if (model.id) ids.push(model.id);
      }
      if (!body.has_more || !body.last_id) break;
      afterId = body.last_id;
    }
    return ids;
  }

  return { streamAskResponse, testConnection, listModels };
}

module.exports = { createAnthropicProvider };
