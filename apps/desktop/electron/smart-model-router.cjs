const { findModel, findModelForTier } = require("./model-catalog.cjs");
const { normalizeProviderPriority } = require("./llm-defaults.cjs");

const COMPLEX_PATTERN = /\b(arquitetura|trade-?offs?|complexidade|otimiz|diagn[oó]stic|compare|prove|explique em detalhes|algoritmo|big[- ]?o)\b/i;
const CODE_PATTERN = /```|\b(java|python|javascript|typescript|c#|c\+\+|golang|rust|kotlin|leetcode|hackerrank)\b/i;
const AWS_PATTERN = /\b(aws|amazon web services|cloud practitioner|solutions architect|developer associate|sysops|certifica[cç][aã]o)\b/i;

function classifyTask(input = {}) {
  if (input.taskKind) return input.taskKind;
  const text = String(input.ask || "");
  const presetId = input.presetId || "";
  if (input.hasScreenshots && AWS_PATTERN.test(text)) return "aws_exam_screenshot";
  if (input.hasScreenshots && (presetId === "error-diagnosis" || /erro|exception|stack trace/i.test(text))) {
    return "screenshot_error";
  }
  if (input.hasScreenshots && (presetId === "code-solver" || CODE_PATTERN.test(text))) {
    return "screenshot_code";
  }
  if (input.hasScreenshots) return "screenshot_general";
  if (input.hasAudio) return "audio_question";
  if (presetId === "code-solver" || CODE_PATTERN.test(text)) return "code";
  if (text.length > 900 || COMPLEX_PATTERN.test(text)) return "complex_reasoning";
  return "simple_text";
}

function tierForTask(taskKind) {
  if (
    ["code", "complex_reasoning", "screenshot_code", "screenshot_error", "aws_exam_screenshot"].includes(
      taskKind
    )
  ) {
    return "high";
  }
  if (["screenshot_general", "audio_question", "meeting_summary"].includes(taskKind)) {
    return "balanced";
  }
  return "light";
}

function tierForFeature(feature) {
  if (feature === "meetingSummary") return "balanced";
  if (feature === "meetingActiveClassifier") return "light";
  if (feature === "translation") return "light";
  return null;
}

function requiredModalities(input = {}) {
  const result = ["text"];
  if (input.hasScreenshots) result.push("image");
  if (input.hasAudio) result.push("audio");
  return result;
}

function isProviderUsable(settings, providerId, input = {}) {
  if (providerId === "local") return input.localAvailable !== false;
  const provider = settings.providers?.[providerId];
  return Boolean(provider?.enabled && provider?.hasApiKey);
}

function buildProviderOrder(selection, profile) {
  const priority = normalizeProviderPriority(selection || {});
  return priority.filter((providerId) => {
    if (providerId === "local" && profile !== "auto") {
      return false;
    }
    return true;
  });
}

/**
 * Lista rotas candidatas na ordem de prioridade do usuário.
 * Se allowFallback=false, retorna no máximo a primeira utilizável.
 */
function listCandidateRoutes(settings, input = {}) {
  const selection = settings.selection || {};
  const profile = input.selectionProfile || selection.profile || "auto";
  const allowFallback = selection.allowFallback !== false;
  const feature = input.feature || "ask";
  let taskKind = classifyTask(input);

  if (input.feature === "translation") taskKind = "translation";
  else if (input.feature === "meetingSummary") taskKind = "meeting_summary";
  else if (input.feature === "meetingActiveClassifier") taskKind = "meeting_classifier";
  else if (profile === "custom" && selection.customMode === "activity") {
    taskKind = input.taskKind || selection.customTaskKind || taskKind;
  }

  if (profile === "auto") {
    const configured = selection.autoRoutes?.[taskKind];
    if (
      configured?.providerId &&
      configured?.modelId &&
      isProviderUsable(settings, configured.providerId, input)
    ) {
      const chosen = {
        ...configured,
        profile,
        taskKind,
        reason: ["auto_task_model"]
      };
      return allowFallback
        ? [chosen, ...listPriorityRoutes(settings, input, profile, taskKind, chosen)]
        : [chosen];
    }
  }

  if (profile === "custom" && selection.customMode === "model") {
    const route = selection.customRoute;
    const selectedModel = route ? findModel(route.providerId, route.modelId) : null;
    const compatible = selectedModel
      ? requiredModalities(input).every((modality) => selectedModel.modalities.includes(modality))
      : route?.providerId === "local";
    if (route && compatible && isProviderUsable(settings, route.providerId, input)) {
      const fixed = {
        ...route,
        profile,
        taskKind,
        reason: ["custom_fixed_model"]
      };
      return allowFallback ? [fixed, ...listPriorityRoutes(settings, input, profile, taskKind, route)] : [fixed];
    }
  }

  return listPriorityRoutes(settings, input, profile, taskKind);
}

function listPriorityRoutes(settings, input, profile, taskKind, excludeRoute = null) {
  const selection = settings.selection || {};
  const allowFallback = selection.allowFallback !== false;
  const featureTier = tierForFeature(input.feature);
  const tier =
    featureTier ||
    (profile === "light"
      ? "light"
      : profile === "balanced"
        ? "balanced"
        : profile === "high"
          ? "high"
          : tierForTask(taskKind));
  const modalities = requiredModalities(input);
  const providerOrder = buildProviderOrder(selection, profile);
  const candidates = [];

  for (const providerId of providerOrder) {
    if (!isProviderUsable(settings, providerId, input)) {
      continue;
    }
    if (
      excludeRoute &&
      excludeRoute.providerId === providerId &&
      excludeRoute.modelId
    ) {
      // Já tentamos esta combinação como custom fixo.
      continue;
    }

    if (input.feature === "translation" && providerId !== "local") {
      const modelId = settings.providers?.[providerId]?.defaultModelId;
      if (!modelId) {
        continue;
      }
      candidates.push({
        providerId,
        modelId,
        profile,
        taskKind,
        reason: ["translation_default_model", "priority_list"]
      });
      if (!allowFallback) {
        break;
      }
      continue;
    }

    if (providerId === "local") {
      // Local não recebe áudio/imagem brutos no chat atual.
      if (modalities.includes("audio") || modalities.includes("image")) {
        continue;
      }
      candidates.push({
        providerId: "local",
        modelId: "local",
        profile,
        taskKind,
        reason: ["local_available", `tier_${tier}`, "priority_list"]
      });
    } else {
      const model = findModelForTier(providerId, tier, modalities);
      // Não usar defaultModelId se ele não atende as modalidades (ex.: áudio).
      if (!model?.modelId) {
        continue;
      }
      candidates.push({
        providerId,
        modelId: model.modelId,
        profile,
        taskKind,
        reason: [`task_${taskKind}`, `tier_${tier}`, "priority_list"]
      });
    }

    if (!allowFallback) {
      break;
    }
  }

  if (candidates.length === 0) {
    const fallback = settings.routing?.[input.feature || "ask"] || settings.routing?.ask;
    if (fallback) {
      candidates.push({
        ...fallback,
        profile,
        taskKind,
        reason: ["configured_fallback"]
      });
    }
  }

  return candidates;
}

function resolveSmartRoute(settings, input = {}) {
  const candidates = listCandidateRoutes(settings, input);
  if (candidates.length > 0) {
    return candidates[0];
  }

  const selection = settings.selection || {};
  const profile = input.selectionProfile || selection.profile || "auto";
  const taskKind = classifyTask(input);
  const fallback = settings.routing?.ask || { providerId: "local", modelId: "local" };
  return { ...fallback, profile, taskKind, reason: ["legacy_fallback"] };
}

module.exports = {
  classifyTask,
  tierForTask,
  tierForFeature,
  resolveSmartRoute,
  listCandidateRoutes,
  isProviderUsable,
  buildProviderOrder,
  normalizeProviderPriority
};
