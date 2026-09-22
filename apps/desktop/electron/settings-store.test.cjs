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
