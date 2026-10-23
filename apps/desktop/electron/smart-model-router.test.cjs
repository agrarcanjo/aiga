const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyTask,
  tierForTask,
  resolveSmartRoute,
  listCandidateRoutes
} = require("./smart-model-router.cjs");
const { normalizeProviderPriority } = require("./llm-defaults.cjs");

const settings = {
  providers: {
    openai: { enabled: true, hasApiKey: true, defaultModelId: "gpt-5.6-terra" },
    gemini: { enabled: true, hasApiKey: true, defaultModelId: "gemini-3.5-flash" },
    anthropic: { enabled: false, hasApiKey: false, defaultModelId: "claude-3-5-haiku-latest" }
  },
  routing: { ask: { providerId: "gemini", modelId: "gemini-3.5-flash" } },
  selection: {
    profile: "auto",
    providerPriority: ["openai", "gemini", "anthropic"],
    preferredProvider: "openai",
    allowFallback: true,
    customMode: "model",
    customRoute: { providerId: "openai", modelId: "gpt-5.6-terra" },
    customTaskKind: "screenshot_general"
  }
};

test("normalizeProviderPriority migra preferredProvider antigo", () => {
  const list = normalizeProviderPriority({ preferredProvider: "anthropic" });
  assert.equal(list[0], "anthropic");
  assert.ok(list.includes("openai"));
  assert.ok(list.includes("gemini"));
});

test("Auto classifica screenshot de prova AWS como alta complexidade", () => {
  const task = classifyTask({
    hasScreenshots: true,
    ask: "Resolva esta questão da certificação AWS Solutions Architect"
  });
  assert.equal(task, "aws_exam_screenshot");
  assert.equal(tierForTask(task), "high");
  const route = resolveSmartRoute(settings, {
    hasScreenshots: true,
    ask: "Questão AWS",
    presetId: "screenshot-analysis"
  });
  assert.equal(route.providerId, "openai");
  assert.equal(route.modelId, "gpt-5.6-sol");
});

test("Leve escolhe modelo visual econômico quando há screenshot", () => {
  const route = resolveSmartRoute(settings, {
    selectionProfile: "light",
    hasScreenshots: true,
    ask: "resuma"
  });
  assert.equal(route.providerId, "openai");
  assert.equal(route.modelId, "gpt-5.6-luna");
});

test("Personalizado aceita modelo fixo", () => {
  const custom = {
    ...settings,
    selection: {
      ...settings.selection,
      profile: "custom",
      customMode: "model",
      customRoute: { providerId: "gemini", modelId: "gemini-3.5-pro" }
    }
  };
  const route = resolveSmartRoute(custom, { ask: "qualquer tarefa" });
  assert.equal(route.providerId, "gemini");
  assert.equal(route.modelId, "gemini-3.5-pro");
});

test("Auto não encaminha áudio bruto para modelo sem suporte", () => {
  const route = resolveSmartRoute(settings, { hasAudio: true, ask: "responda ao áudio" });
  assert.equal(route.providerId, "gemini");
  assert.equal(route.modelId, "gemini-3.5-flash");
});

test("Prioridade OpenAI é usada mesmo com routing.ask em Gemini", () => {
  const route = resolveSmartRoute(settings, { feature: "translation", ask: "traduza olá" });
  assert.equal(route.providerId, "openai");
});

test("Tradução ignora Gemini desabilitado e usa OpenAI da prioridade", () => {
  const onlyOpenAi = {
    ...settings,
    providers: {
      ...settings.providers,
      gemini: { enabled: false, hasApiKey: true, defaultModelId: "gemini-3.5-flash-lite" }
    },
    selection: {
      ...settings.selection,
      providerPriority: ["gemini", "openai", "anthropic"]
    }
  };
  const route = resolveSmartRoute(onlyOpenAi, { feature: "translation", ask: "hi" });
  assert.equal(route.providerId, "openai");
});

test("Auto usa o modelo configurado para a tarefa antes da lista interna", () => {
  const configured = {
    ...settings,
    selection: {
      ...settings.selection,
      autoRoutes: {
        aws_exam_screenshot: { providerId: "gemini", modelId: "gemini-3.8-flash" },
        translation: { providerId: "anthropic", modelId: "claude-haiku-next" }
      }
    },
    providers: {
      ...settings.providers,
      anthropic: { enabled: true, hasApiKey: true, defaultModelId: "claude-3-5-haiku-latest" }
    }
  };
  const screenshot = resolveSmartRoute(configured, {
    hasScreenshots: true,
    ask: "Questão AWS",
    presetId: "screenshot-analysis"
  });
  assert.equal(screenshot.providerId, "gemini");
  assert.equal(screenshot.modelId, "gemini-3.8-flash");
  const translation = listCandidateRoutes(configured, { feature: "translation", ask: "hi" });
  assert.deepEqual(
    [translation[0].providerId, translation[0].modelId],
    ["anthropic", "claude-haiku-next"]
  );
});

test("Tradução percorre todos os provedores habilitados com o modelo padrão de cada um", () => {
  const withAnthropic = {
    ...settings,
    providers: {
      ...settings.providers,
      openai: { ...settings.providers.openai, defaultModelId: "gpt-4o-mini" },
      anthropic: { enabled: true, hasApiKey: true, defaultModelId: "claude-sonnet-4-20250514" }
    }
  };
  const candidates = listCandidateRoutes(withAnthropic, { feature: "translation", ask: "hi" });
  assert.deepEqual(
    candidates.map((candidate) => [candidate.providerId, candidate.modelId]),
    [
      ["openai", "gpt-4o-mini"],
      ["gemini", "gemini-3.5-flash"],
      ["anthropic", "claude-sonnet-4-20250514"]
    ]
  );
});

test("allowFallback=false retorna só o primeiro provedor utilizável", () => {
  const noFallback = {
    ...settings,
    selection: { ...settings.selection, allowFallback: false }
  };
  const candidates = listCandidateRoutes(noFallback, { feature: "translation", ask: "hi" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].providerId, "openai");
});

test("allowFallback=true lista vários provedores na ordem", () => {
  const candidates = listCandidateRoutes(settings, { feature: "ask", ask: "oi" });
  assert.ok(candidates.length >= 2);
  assert.equal(candidates[0].providerId, "openai");
  assert.equal(candidates[1].providerId, "gemini");
});

test("Atividade personalizada ignora local indisponível e usa nuvem", () => {
  const custom = {
    ...settings,
    selection: {
      ...settings.selection,
      profile: "custom",
      customMode: "activity",
      customTaskKind: "aws_exam_screenshot",
      providerPriority: ["local", "openai", "gemini"]
    }
  };
  const route = resolveSmartRoute(custom, { hasScreenshots: true, localAvailable: false });
  assert.equal(route.taskKind, "aws_exam_screenshot");
  assert.equal(route.providerId, "openai");
  assert.equal(route.modelId, "gpt-5.6-sol");
});

test("Llama local só pode ser escolhido no perfil Auto", () => {
  const localPreferred = {
    ...settings,
    selection: {
      ...settings.selection,
      providerPriority: ["local", "openai", "gemini"]
    }
  };
  const manual = resolveSmartRoute(localPreferred, {
    selectionProfile: "balanced",
    localAvailable: true,
    ask: "resuma"
  });
  assert.notEqual(manual.providerId, "local");

  const automatic = resolveSmartRoute(localPreferred, {
    selectionProfile: "auto",
    localAvailable: true,
    ask: "resuma"
  });
  assert.equal(automatic.providerId, "local");
});
