const test = require("node:test");
const assert = require("node:assert/strict");
const { createLlmProviderRegistry } = require("./llm-provider-registry.cjs");

function createRegistry(options = {}) {
  const calls = [];
  const settings = {
    providers: {
      openai: { enabled: true, hasApiKey: true, defaultModelId: "gpt-5.6-terra" },
      gemini: {
        enabled: options.geminiEnabled !== false,
        hasApiKey: true,
        defaultModelId: "gemini-3.5-flash-lite"
      },
      anthropic: { enabled: false, hasApiKey: false, defaultModelId: "claude-3-5-haiku-latest" }
    },
    routing: {
      ask: { providerId: "gemini", modelId: "gemini-3.5-flash" },
      translation: { providerId: "gemini", modelId: "gemini-3.5-flash-lite" }
    },
    selection: {
      profile: "auto",
      providerPriority: options.priority || ["gemini", "openai"],
      allowFallback: options.allowFallback !== false,
      customMode: "model",
      customRoute: { providerId: "openai", modelId: "gpt-5.6-terra" },
      customTaskKind: "translation"
    }
  };

  const registry = createLlmProviderRegistry({
    logger: { info() {}, warn() {}, error() {} },
    settingsStore: {
      getPublicLlmSettings: () => settings,
      getProviderApiKey: (id) => (id === "anthropic" ? "" : `key-${id}`)
    },
    geminiProvider: {
      streamAskResponse: async () => {
        calls.push("gemini");
        if (options.failGemini) {
          throw new Error("Gemini 402 Payment Required");
        }
        return { ok: true, provider: "gemini" };
      }
    },
    openaiProvider: {
      streamAskResponse: async () => {
        calls.push("openai");
        return { ok: true, provider: "openai" };
      }
    },
    anthropicProvider: {
      streamAskResponse: async () => {
        calls.push("anthropic");
        return { ok: true, provider: "anthropic" };
      }
    },
    localProvider: {
      isAvailable: () => false,
      streamAskResponse: async () => {
        calls.push("local");
        return { ok: true, provider: "local" };
      }
    },
    tokenUsageTracker: {
      shouldBlockCloud: () => false,
      setSessionCloud() {},
      recordUsage() {}
    }
  });

  return { registry, calls, settings };
}

test("translation resolveRoute respeita prioridade OpenAI acima do routing.gemini", () => {
  const { registry } = createRegistry({ priority: ["openai", "gemini"] });
  const route = registry.resolveRoute("translation", { ask: "traduza" });
  assert.equal(route.providerId, "openai");
});

test("translation faz fallback para OpenAI quando Gemini falha", async () => {
  const { registry, calls } = createRegistry({
    priority: ["gemini", "openai"],
    failGemini: true,
    allowFallback: true
  });
  const result = await registry.streamForFeature({
    feature: "translation",
    requestId: "t1",
    sessionId: "s1",
    ask: "hello",
    onEvent: () => {}
  });
  assert.equal(result.provider, "openai");
  assert.deepEqual(calls, ["gemini", "openai"]);
});

test("sem allowFallback nao tenta o proximo provedor", async () => {
  const { registry, calls } = createRegistry({
    priority: ["gemini", "openai"],
    failGemini: true,
    allowFallback: false
  });
  await assert.rejects(
    () =>
      registry.streamForFeature({
        feature: "translation",
        requestId: "t2",
        sessionId: "s2",
        ask: "hello",
        onEvent: () => {}
      }),
    /402 Payment Required/
  );
  assert.deepEqual(calls, ["gemini"]);
});

test("Gemini desabilitado e pulado na prioridade", async () => {
  const { registry, calls } = createRegistry({
    priority: ["gemini", "openai"],
    geminiEnabled: false,
    failGemini: true
  });
  const result = await registry.streamForFeature({
    feature: "translation",
    requestId: "t3",
    sessionId: "s3",
    ask: "hello",
    onEvent: () => {}
  });
  assert.equal(result.provider, "openai");
  assert.deepEqual(calls, ["openai"]);
});
