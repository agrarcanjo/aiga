const test = require("node:test");
const assert = require("node:assert/strict");
const { createLlmProviderRegistry } = require("./llm-provider-registry.cjs");
const { createGeminiProvider } = require("./gemini-provider.cjs");
const { createAnthropicProvider } = require("./anthropic-provider.cjs");

const logger = { info() {}, warn() {}, error() {} };

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function createRegistry({ listModels, testConnection, savedKeys = {} }) {
  const provider = { streamAskResponse: async () => ({}), listModels, testConnection };
  return createLlmProviderRegistry({
    logger,
    settingsStore: {
      getPublicLlmSettings: () => ({ providers: {}, selection: {} }),
      getProviderApiKey: (id) => savedKeys[id] || ""
    },
    geminiProvider: provider,
    openaiProvider: provider,
    anthropicProvider: provider,
    localProvider: { isAvailable: () => false }
  });
}

test("chave válida com modelo indisponível continua válida", async () => {
  const registry = createRegistry({
    listModels: async () => ["gemini-3.8-flash"],
    testConnection: async () => {
      throw new Error("[404 Not Found] This model models/gemini-2.5-flash is no longer available");
    }
  });
  const result = await registry.checkProvider("gemini", "gemini-2.5-flash", "AIza-nova");
  assert.equal(result.ok, false);
  assert.equal(result.keyValid, true);
  assert.equal(result.modelOk, false);
  assert.match(result.message, /Chave válida/);
  assert.match(result.message, /gemini-2\.5-flash/);
});

test("chave rejeitada pelo provedor é inválida", async () => {
  const registry = createRegistry({
    listModels: async () => {
      throw new Error("HTTP 400 ao listar modelos Gemini: API key not valid");
    },
    testConnection: async () => true
  });
  const result = await registry.checkProvider("gemini", "gemini-3.8-flash", "chave-errada");
  assert.equal(result.ok, false);
  assert.equal(result.keyValid, false);
  assert.match(result.message, /Chave inválida/);
});

test("chave e modelo válidos retornam ok", async () => {
  const seen = [];
  const registry = createRegistry({
    listModels: async (key) => {
      seen.push(["list", key]);
      return ["gpt-4o-mini"];
    },
    testConnection: async (key, model) => {
      seen.push(["test", key, model]);
      return true;
    }
  });
  const result = await registry.checkProvider("openai", "gpt-4o-mini", " sk-digitada ");
  assert.deepEqual(result, { ok: true, keyValid: true, modelOk: true, message: "Conexão OK." });
  assert.deepEqual(seen, [
    ["list", "sk-digitada"],
    ["test", "sk-digitada", "gpt-4o-mini"]
  ]);
});

test("sem chave digitada usa a chave salva; sem nenhuma, falha sem chamar a API", async () => {
  let calls = 0;
  const registry = createRegistry({
    listModels: async () => {
      calls += 1;
      return [];
    },
    testConnection: async () => true,
    savedKeys: { anthropic: "sk-ant-salva" }
  });
  assert.equal((await registry.checkProvider("anthropic", "claude-x")).ok, true);
  const missing = await registry.checkProvider("gemini", "gemini-3.8-flash");
  assert.equal(missing.keyValid, false);
  assert.match(missing.message, /ausente/);
  assert.equal(calls, 1);
});

test("listProviderModels usa a lista real de cada provedor", async () => {
  const registry = createRegistry({
    listModels: async () => ["modelo-da-conta"],
    testConnection: async () => true,
    savedKeys: { gemini: "k", openai: "k", anthropic: "k" }
  });
  for (const id of ["gemini", "openai", "anthropic"]) {
    assert.deepEqual(await registry.listProviderModels(id), ["modelo-da-conta"]);
  }
});

test("Gemini lista só modelos de geração, sem prefixo, com paginação e chave no header", async () => {
  const requests = [];
  const pages = [
    {
      models: [
        { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }
      ],
      nextPageToken: "p2"
    },
    { models: [{ name: "models/gemini-3.8-pro", supportedGenerationMethods: ["generateContent"] }] }
  ];
  const provider = createGeminiProvider({
    logger,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), key: init.headers["x-goog-api-key"] });
      return jsonResponse(pages[requests.length - 1]);
    }
  });
  assert.deepEqual(await provider.listModels("AIza-test"), ["gemini-3.8-flash", "gemini-3.8-pro"]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].key, "AIza-test");
  assert.ok(!requests[0].url.includes("AIza-test"));
  assert.match(requests[1].url, /pageToken=p2/);
});

test("Gemini com chave inválida lança erro com o status HTTP", async () => {
  const provider = createGeminiProvider({
    logger,
    fetchImpl: async () => jsonResponse({ error: { message: "API key not valid" } }, 400)
  });
  await assert.rejects(() => provider.listModels("ruim"), /HTTP 400/);
});

test("Anthropic lista modelos com paginação", async () => {
  const requests = [];
  const pages = [
    { data: [{ id: "claude-sonnet-4-20250514" }], has_more: true, last_id: "claude-sonnet-4-20250514" },
    { data: [{ id: "claude-3-5-haiku-latest" }], has_more: false }
  ];
  const provider = createAnthropicProvider({
    logger,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), headers: init.headers });
      return jsonResponse(pages[requests.length - 1]);
    }
  });
  assert.deepEqual(await provider.listModels("sk-ant"), [
    "claude-sonnet-4-20250514",
    "claude-3-5-haiku-latest"
  ]);
  assert.equal(requests[0].headers["x-api-key"], "sk-ant");
  assert.match(requests[1].url, /after_id=claude-sonnet-4-20250514/);
});
