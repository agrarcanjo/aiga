const { findModel, findModelForTier } = require("./model-catalog.cjs");

const COMPLEX_PATTERN = /\b(arquitetura|trade-?offs?|complexidade|otimiz|diagn[oó]stic|compare|prove|explique em detalhes|algoritmo|big[- ]?o)\b/i;
const CODE_PATTERN = /```|\b(java|python|javascript|typescript|c#|c\+\+|golang|rust|kotlin|leetcode|hackerrank)\b/i;
const AWS_PATTERN = /\b(aws|amazon web services|cloud practitioner|solutions architect|developer associate|sysops|certifica[cç][aã]o)\b/i;

function classifyTask(input = {}) {
  if (input.taskKind) return input.taskKind;
  const text = String(input.ask || "");
  const presetId = input.presetId || "";
  if (input.hasScreenshots && AWS_PATTERN.test(text)) return "aws_exam_screenshot";
  if (input.hasScreenshots && (presetId === "error-diagnosis" || /erro|exception|stack trace/i.test(text))) return "screenshot_error";
  if (input.hasScreenshots && (presetId === "code-solver" || CODE_PATTERN.test(text))) return "screenshot_code";
  if (input.hasScreenshots) return "screenshot_general";
  if (input.hasAudio) return "audio_question";
  if (presetId === "code-solver" || CODE_PATTERN.test(text)) return "code";
  if (text.length > 900 || COMPLEX_PATTERN.test(text)) return "complex_reasoning";
  return "simple_text";
}

function tierForTask(taskKind) {
  if (["code", "complex_reasoning", "screenshot_code", "screenshot_error", "aws_exam_screenshot"].includes(taskKind)) return "high";
  if (["screenshot_general", "audio_question", "meeting_summary"].includes(taskKind)) return "balanced";
  return "light";
}

function requiredModalities(input = {}) {
  const result = ["text"];
  if (input.hasScreenshots) result.push("image");
  // O chat atual encaminha o anexo de áudio bruto ao provider; portanto a rota
  // precisa declarar áudio para não descartar silenciosamente o conteúdo.
  if (input.hasAudio) result.push("audio");
  return result;
}

function isProviderUsable(settings, providerId, input = {}) {
  if (providerId === "local") return input.localAvailable !== false;
  const provider = settings.providers?.[providerId];
  return Boolean(provider?.enabled && provider?.hasApiKey);
}

function resolveSmartRoute(settings, input = {}) {
  const selection = settings.selection || {};
  const profile = input.selectionProfile || selection.profile || "auto";
  let taskKind = classifyTask(input);

  if (profile === "custom" && selection.customMode === "activity") {
    taskKind = input.taskKind || selection.customTaskKind || taskKind;
  }

  if (profile === "custom" && selection.customMode === "model") {
    const route = selection.customRoute;
    const selectedModel = route ? findModel(route.providerId, route.modelId) : null;
    const compatible = selectedModel
      ? requiredModalities(input).every((modality) => selectedModel.modalities.includes(modality))
      : route?.providerId === "local";
    if (route && compatible && isProviderUsable(settings, route.providerId, input)) {
      return { ...route, profile, taskKind, reason: ["custom_fixed_model"] };
    }
  }

  const tier = profile === "light" ? "light" : profile === "balanced" ? "balanced" : profile === "high" ? "high" : tierForTask(taskKind);
  const modalities = requiredModalities(input);
  const preferred = selection.preferredProvider;
  // O runtime Llama é um recurso auxiliar exclusivo do Auto. Perfis escolhidos
  // manualmente devem ter comportamento previsível e usar somente cloud.
  const providerOrder = [
    ...(profile === "auto" ? [preferred] : [preferred === "local" ? null : preferred]),
    "openai",
    "gemini",
    "anthropic",
    ...(profile === "auto" ? ["local"] : [])
  ].filter(Boolean);

  for (const providerId of [...new Set(providerOrder)]) {
    if (!isProviderUsable(settings, providerId, input)) continue;
    if (providerId === "local") {
      return { providerId: "local", modelId: "local", profile, taskKind, reason: ["local_available", `tier_${tier}`] };
    }
    const model = findModelForTier(providerId, tier, modalities);
    if (model) {
      return { providerId, modelId: model.modelId, profile, taskKind, reason: [`task_${taskKind}`, `tier_${tier}`] };
    }
  }

  const cloudFallback = ["openai", "gemini", "anthropic"]
    .find((providerId) => isProviderUsable(settings, providerId, input));
  if (cloudFallback) {
    const model = findModelForTier(cloudFallback, tier, modalities);
    if (model) return { providerId: cloudFallback, modelId: model.modelId, profile, taskKind, reason: ["cloud_fallback_local_unavailable", `tier_${tier}`] };
  }

  const fallback = settings.routing?.ask;
  if (profile !== "auto" && fallback?.providerId === "local") {
    return { providerId: "openai", modelId: findModelForTier("openai", tier, modalities)?.modelId || "gpt-5.6-terra", profile, taskKind, reason: ["manual_profile_never_uses_local"] };
  }
  const catalogModel = fallback ? findModel(fallback.providerId, fallback.modelId) : null;
  return { ...(fallback || { providerId: "local", modelId: "local" }), profile, taskKind, reason: [catalogModel ? "configured_fallback" : "legacy_fallback"] };
}

module.exports = { classifyTask, tierForTask, resolveSmartRoute };
