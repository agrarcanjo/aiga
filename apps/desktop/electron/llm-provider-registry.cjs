// Routes LLM requests to gemini | openai | anthropic | local by feature
const { resolveSmartRoute } = require("./smart-model-router.cjs");
const { listModelCatalog } = require("./model-catalog.cjs");

function createLlmProviderRegistry(dependencies) {
  const logger = dependencies.logger;
  const settingsStore = dependencies.settingsStore;
  const geminiProvider = dependencies.geminiProvider;
  const openaiProvider = dependencies.openaiProvider;
  const anthropicProvider = dependencies.anthropicProvider;
  const localProvider = dependencies.localProvider;
  const tokenUsageTracker = dependencies.tokenUsageTracker;

  function resolveRoute(feature, input = {}) {
    if (input.routeOverride) {
      return input.routeOverride;
    }
    if (feature === "ask") {
      return resolveSmartRoute(settingsStore.getPublicLlmSettings(), {
        ...input,
        localAvailable: localProvider?.isAvailable?.() !== false
      });
    }
    const routing = settingsStore.getLlmRouting();
    return routing[feature] || routing.ask;
  }

  function getApiKey(providerId) {
    return settingsStore.getProviderApiKey(providerId);
  }

  async function streamForFeature(input) {
    const feature = input.feature || "ask";
    const route = resolveRoute(feature, input);
    const requestId = input.requestId;
    const sessionId = input.sessionId || requestId;

    if (route.providerId === "local") {
      if (!localProvider.isAvailable()) {
        throw new Error("LOCAL_PROVIDER_UNAVAILABLE: runtime local indisponivel.");
      }
      return localProvider.streamAskResponse(input);
    }

    const apiKey = getApiKey(route.providerId);
    if (!apiKey) {
      throw new Error(
        `API key nao configurada para ${route.providerId}. Abra Configuracoes > Provedores de IA.`
      );
    }

    if (tokenUsageTracker?.shouldBlockCloud(sessionId)) {
      throw new Error("TOKEN_BUDGET_EXCEEDED: limite de tokens da sessao atingido.");
    }

    if (tokenUsageTracker) {
      tokenUsageTracker.setSessionCloud(sessionId, true);
    }

    const onUsage = (usage) => {
      if (tokenUsageTracker) {
        tokenUsageTracker.recordUsage(sessionId, {
          ...usage,
          estimated: usage.estimated !== false
        });
      }
    };

    const providerInput = {
      ...input,
      apiKey,
      modelId: route.modelId,
      onUsage,
      onEvent: (event) => input.onEvent({
        ...event,
        providerId: route.providerId,
        modelId: route.modelId,
        selectionProfile: route.profile || input.selectionProfile,
        taskKind: route.taskKind || input.taskKind
      })
    };

    logger.info("LlmProviderRegistry route", {
      requestId,
      feature,
      providerId: route.providerId,
      modelId: route.modelId
    });

    if (route.providerId === "openai") {
      return openaiProvider.streamAskResponse(providerInput);
    }
    if (route.providerId === "anthropic") {
      return anthropicProvider.streamAskResponse(providerInput);
    }
    return geminiProvider.streamAskResponse(providerInput);
  }

  async function streamAskResponse(input) {
    return streamForFeature({ ...input, feature: "ask" });
  }

  async function streamMeetingSummary(input) {
    return streamForFeature({ ...input, feature: "meetingSummary" });
  }

  async function testProvider(providerId, modelId, candidateApiKey) {
    const apiKey = candidateApiKey?.trim() || getApiKey(providerId);
    if (!apiKey) {
      throw new Error("API key ausente.");
    }
    if (providerId === "openai") {
      return openaiProvider.testConnection(apiKey, modelId);
    }
    if (providerId === "anthropic") {
      return anthropicProvider.testConnection(apiKey, modelId);
    }
    return geminiProvider.testConnection(apiKey, modelId);
  }

  async function listProviderModels(providerId, candidateApiKey) {
    const apiKey = candidateApiKey?.trim() || getApiKey(providerId);
    if (!apiKey) throw new Error("API key ausente.");
    if (providerId === "openai" && typeof openaiProvider.listModels === "function") {
      return openaiProvider.listModels(apiKey);
    }
    return listModelCatalog().filter((model) => model.providerId === providerId).map((model) => model.modelId);
  }

  return {
    streamAskResponse,
    streamMeetingSummary,
    streamForFeature,
    testProvider,
    resolveRoute,
    listProviderModels
  };
}

module.exports = { createLlmProviderRegistry };
