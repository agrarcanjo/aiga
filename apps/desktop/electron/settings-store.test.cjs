const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

function createStore(tempDir) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: { getPath: () => tempDir },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: () => { throw new Error("not available"); },
          decryptString: () => { throw new Error("not available"); }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("./settings-store.cjs")];
    return require("./settings-store.cjs").createSettingsStore();
  } finally {
    Module._load = originalLoad;
  }
}

function withStore(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiga-settings-"));
  try {
    fn(() => createStore(tempDir));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("modelo padrão escolhido da conta (fora do catálogo) persiste após reabrir", () => {
  withStore((open) => {
    open().saveLlmPartial({
      providers: {
        openai: { enabled: true, defaultModelId: "gpt-4o-mini" },
        gemini: { enabled: true, defaultModelId: "gemini-3.8-flash" },
        anthropic: { enabled: true, defaultModelId: "claude-opus-4-1" }
      }
    });
    const providers = open().getPublicLlmSettings().providers;
    assert.equal(providers.openai.defaultModelId, "gpt-4o-mini");
    assert.equal(providers.gemini.defaultModelId, "gemini-3.8-flash");
    assert.equal(providers.anthropic.defaultModelId, "claude-opus-4-1");
  });
});

test("nova chave Gemini salva e lida de volta, sem afetar outros provedores", () => {
  withStore((open) => {
    open().saveLlmPartial({ providers: { openai: { enabled: true, apiKey: "sk-openai" } } });
    open().saveLlmPartial({
      providers: { gemini: { enabled: true, defaultModelId: "gemini-3.8-flash", apiKey: " AIza-nova " } }
    });
    const store = open();
    assert.equal(store.getProviderApiKey("gemini"), "AIza-nova");
    assert.equal(store.getGeminiApiKey(), "AIza-nova");
    assert.equal(store.getProviderApiKey("openai"), "sk-openai");
    assert.equal(store.getPublicLlmSettings().providers.gemini.hasApiKey, true);
  });
});

test("trocar a chave substitui a anterior", () => {
  withStore((open) => {
    open().saveLlmPartial({ providers: { gemini: { apiKey: "AIza-antiga" } } });
    open().saveLlmPartial({ providers: { gemini: { apiKey: "AIza-nova" } } });
    assert.equal(open().getProviderApiKey("gemini"), "AIza-nova");
  });
});

test("trocar só o modelo mantém a chave e o enabled", () => {
  withStore((open) => {
    open().saveLlmPartial({ providers: { gemini: { enabled: true, apiKey: "AIza-1" } } });
    open().saveLlmPartial({ providers: { gemini: { defaultModelId: "gemini-3.8-pro" } } });
    const store = open();
    const gemini = store.getPublicLlmSettings().providers.gemini;
    assert.equal(gemini.defaultModelId, "gemini-3.8-pro");
    assert.equal(gemini.enabled, true);
    assert.equal(store.getProviderApiKey("gemini"), "AIza-1");
  });
});

test("chave vazia ou null remove a chave salva", () => {
  withStore((open) => {
    open().saveLlmPartial({ providers: { anthropic: { apiKey: "sk-ant" } } });
    open().saveLlmPartial({ providers: { anthropic: { apiKey: "" } } });
    assert.equal(open().getPublicLlmSettings().providers.anthropic.hasApiKey, false);
    open().saveLlmPartial({ providers: { gemini: { apiKey: "AIza" } } });
    open().saveLlmPartial({ providers: { gemini: { apiKey: null } } });
    assert.equal(open().getProviderApiKey("gemini"), "");
  });
});

test("desabilitar provedor persiste e mantém a chave", () => {
  withStore((open) => {
    open().saveLlmPartial({ providers: { openai: { enabled: true, apiKey: "sk" } } });
    open().saveLlmPartial({ providers: { openai: { enabled: false } } });
    const store = open();
    assert.equal(store.getPublicLlmSettings().providers.openai.enabled, false);
    assert.equal(store.getProviderApiKey("openai"), "sk");
  });
});

test("gemini-2.5-flash salvo antes é migrado para um modelo atual", () => {
  withStore((open) => {
    open().saveLlmPartial({ providers: { gemini: { defaultModelId: "gemini-2.5-flash" } } });
    assert.notEqual(open().getPublicLlmSettings().providers.gemini.defaultModelId, "gemini-2.5-flash");
  });
});

test("modelos da legenda e das tarefas do Auto persistem", () => {
  withStore((open) => {
    open().savePartial({
      translationPrefs: {
        realtimeModel: "gpt-realtime-next",
        transcriptionModel: "gpt-live-transcribe"
      }
    });
    open().saveLlmPartial({
      selection: {
        profile: "auto",
        autoRoutes: {
          translation: { providerId: "gemini", modelId: "gemini-3.8-flash" },
          code: { providerId: "openai", modelId: "gpt-4o" },
          invalid: { providerId: "outro", modelId: "x" }
        }
      }
    });
    const store = open();
    const prefs = store.getTranslationPrefs();
    assert.equal(prefs.realtimeModel, "gpt-realtime-next");
    assert.equal(prefs.transcriptionModel, "gpt-live-transcribe");
    assert.deepEqual(store.getPublicLlmSettings().selection.autoRoutes, {
      translation: { providerId: "gemini", modelId: "gemini-3.8-flash" },
      code: { providerId: "openai", modelId: "gpt-4o" }
    });
  });
});

test("modelo fixo personalizado persiste após reabrir", () => {
  withStore((open) => {
    open().saveLlmPartial({
      selection: {
        profile: "custom",
        customMode: "model",
        customRoute: { providerId: "gemini", modelId: "gemini-3.8-flash" }
      }
    });
    const selection = open().getPublicLlmSettings().selection;
    assert.equal(selection.profile, "custom");
    assert.deepEqual(selection.customRoute, { providerId: "gemini", modelId: "gemini-3.8-flash" });
  });
});

test("salvar configurações sem apiKey preserva a chave existente", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiga-settings-"));
  try {
    const store = createStore(tempDir);
    store.saveLlmPartial({ providers: { openai: { enabled: true, apiKey: "sk-test-value" } } });
    assert.equal(store.getPublicLlmSettings().providers.openai.hasApiKey, true);
    assert.equal(store.getProviderApiKey("openai"), "sk-test-value");

    store.saveLlmPartial({ providers: { openai: { enabled: true, apiKey: undefined } } });
    assert.equal(store.getPublicLlmSettings().providers.openai.hasApiKey, true);
    assert.equal(store.getProviderApiKey("openai"), "sk-test-value");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
