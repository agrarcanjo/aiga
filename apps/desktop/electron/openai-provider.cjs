// OpenAI Responses API streaming provider
const { buildTextAndMediaParts } = require("./llm-parts-builder.cjs");

function buildOpenAiInput(parts) {
  return [{
    role: "user",
    content: parts.flatMap((part) => {
      if (part.type === "text") return [{ type: "input_text", text: part.text }];
      if (part.type === "image") {
        return [{ type: "input_image", image_url: `data:${part.mimeType};base64,${part.base64}`, detail: "auto" }];
      }
      return [];
    })
  }];
}

function reasoningEffort(profile) {
  if (profile === "light") return "low";
  if (profile === "high") return "high";
  return "medium";
}

function createOpenAiProvider(options) {
  const logger = options.logger;
  const defaultModel = "gpt-5.6-terra";

  async function streamAskResponse(input) {
    const modelName = input.modelId || defaultModel;
    const parts = buildTextAndMediaParts(input.ask, input.screenshots, input.audioItems || []);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        input: buildOpenAiInput(parts),
        reasoning: { effort: reasoningEffort(input.selectionProfile) },
        stream: true,
        store: false
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errText.slice(0, 300)}`);
    }

    logger.info("Starting OpenAI Responses stream", { requestId: input.requestId, modelName });
    input.onEvent({ requestId: input.requestId, status: "started", createdAtIso: new Date().toISOString() });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("OpenAI stream body unavailable.");
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";
      for (const block of blocks) {
        const line = block.split("\n").find((item) => item.startsWith("data:"));
        if (!line) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === "response.output_text.delta" && event.delta) {
            fullText += event.delta;
            input.onEvent({ requestId: input.requestId, status: "chunk", deltaText: event.delta, fullText, createdAtIso: new Date().toISOString() });
          }
          if (event.type === "response.completed" && event.response?.usage && input.onUsage) {
            input.onUsage({
              inputTokens: event.response.usage.input_tokens || 0,
              outputTokens: event.response.usage.output_tokens || 0,
              estimated: false
            });
          }
        } catch {
          // Evento SSE parcial ou desconhecido.
        }
      }
    }

    input.onEvent({ requestId: input.requestId, status: "completed", fullText, createdAtIso: new Date().toISOString() });
    logger.info("OpenAI Responses stream completed", { requestId: input.requestId, modelName, outputLength: fullText.length });
  }

  async function testConnection(apiKey, modelId) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId || defaultModel, input: "Responda somente: OK", max_output_tokens: 16, store: false })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    return true;
  }

  async function listModels(apiKey) {
    const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status} ao listar modelos OpenAI.`);
    const body = await response.json();
    return Array.isArray(body.data) ? body.data.map((item) => item.id).filter(Boolean) : [];
  }

  return { streamAskResponse, testConnection, listModels };
}

module.exports = { createOpenAiProvider, buildOpenAiInput, reasoningEffort };
