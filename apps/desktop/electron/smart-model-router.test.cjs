const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTask, tierForTask, resolveSmartRoute } = require("./smart-model-router.cjs");

const settings = {
  providers: {
    openai: { enabled: true, hasApiKey: true },
    gemini: { enabled: true, hasApiKey: true },
    anthropic: { enabled: false, hasApiKey: false }
  },
  routing: { ask: { providerId: "gemini", modelId: "gemini-3.5-flash" } },
  selection: {
    profile: "auto",
    preferredProvider: "openai",
    allowFallback: true,
    customMode: "model",
    customRoute: { providerId: "openai", modelId: "gpt-5.6-terra" },
    customTaskKind: "screenshot_general"
  }
};

test("Auto classifica screenshot de prova AWS como alta complexidade", () => {
  const task = classifyTask({ hasScreenshots: true, ask: "Resolva esta questão da certificação AWS Solutions Architect" });
  assert.equal(task, "aws_exam_screenshot");
  assert.equal(tierForTask(task), "high");
  const route = resolveSmartRoute(settings, { hasScreenshots: true, ask: "Questão AWS", presetId: "screenshot-analysis" });
  assert.equal(route.modelId, "gpt-5.6-sol");
});

test("Leve escolhe modelo visual econômico quando há screenshot", () => {
  const route = resolveSmartRoute(settings, { selectionProfile: "light", hasScreenshots: true, ask: "resuma" });
  assert.equal(route.providerId, "openai");
  assert.equal(route.modelId, "gpt-5.6-luna");
});

test("Personalizado aceita modelo fixo", () => {
  const custom = { ...settings, selection: { ...settings.selection, profile: "custom", customMode: "model", customRoute: { providerId: "gemini", modelId: "gemini-3.5-pro" } } };
  const route = resolveSmartRoute(custom, { ask: "qualquer tarefa" });
  assert.equal(route.providerId, "gemini");
  assert.equal(route.modelId, "gemini-3.5-pro");
});

test("Auto não encaminha áudio bruto para modelo sem suporte", () => {
  const route = resolveSmartRoute(settings, { hasAudio: true, ask: "responda ao áudio" });
  assert.equal(route.providerId, "gemini");
  assert.equal(route.modelId, "gemini-3.5-flash");
});

test("Atividade personalizada ignora local indisponível e usa nuvem", () => {
  const custom = {
    ...settings,
    selection: {
      ...settings.selection,
      profile: "custom",
      customMode: "activity",
      customTaskKind: "aws_exam_screenshot",
      preferredProvider: "local"
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
    selection: { ...settings.selection, preferredProvider: "local" }
  };
  const manual = resolveSmartRoute(localPreferred, { selectionProfile: "balanced", localAvailable: true, ask: "resuma" });
  assert.notEqual(manual.providerId, "local");

  const automatic = resolveSmartRoute(localPreferred, { selectionProfile: "auto", localAvailable: true, ask: "resuma" });
  assert.equal(automatic.providerId, "local");
});
