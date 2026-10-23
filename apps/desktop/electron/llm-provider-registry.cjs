// Routes LLM requests to gemini | openai | anthropic | local by feature,
// respecting providerPriority + allowFallback.
const { resolveSmartRoute, listCandidateRoutes } = require("./smart-model-router.cjs");
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
    const settings = settingsStore.getPublicLlmSettings();
    const routeInput = {
      ...input,
      feature,
      localAvailable: localProvider?.isAvailable?.() !== false
    };
    // ASK e demais features (tradução, reunião) usam a mesma prioridade global.
    return resolveSmartRoute(settings, routeInput);
  }

  function getApiKey(providerId) {
    return settingsStore.getProviderApiKey(providerId);
  }

  async function streamOnce(route, input) {
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
        `API key nao configurada para ${route.providerId}. Abra Configuracoes > IA e modelos.`
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
      onEvent: (event) =>
        input.onEvent({
          ...event,
          providerId: route.providerId,
          modelId: route.modelId,
          selectionProfile: route.profile || input.selectionProfile,
          taskKind: route.taskKind || input.taskKind
        })
    };

    logger.info("LlmProviderRegistry route", {
      requestId,
      feature: input.feature || "ask",
      providerId: route.providerId,
      modelId: route.modelId,
      reason: route.reason
    });

    if (route.providerId === "openai") {
      return openaiProvider.streamAskResponse(providerInput);
    }
    if (route.providerId === "anthropic") {
      return anthropicProvider.streamAskResponse(providerInput);
    }
    return geminiProvider.streamAskResponse(providerInput);
  }

  async function streamForFeature(input) {
    const feature = input.feature || "ask";
    const settings = settingsStore.getPublicLlmSettings();
    const allowFallback = settings.selection?.allowFallback !== false;

    let candidates;
    if (input.routeOverride) {
      candidates = [input.routeOverride];
    } else {
      candidates = listCandidateRoutes(settings, {
        ...input,
        feature,
        localAvailable: localProvider?.isAvailable?.() !== false
      });
    }

    if (!candidates.length) {
      throw new Error(
        "Nenhum provedor LLM disponivel. Configure uma API key em Configuracoes > IA e modelos."
      );
    }

    if (!allowFallback) {
      candidates = candidates.slice(0, 1);
    }

    let lastError = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const route = candidates[i];
      try {
        return await streamOnce(route, { ...input, feature });
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const hasNext = i < candidates.length - 1 && allowFallback;
        logger.warn("LlmProviderRegistry provider failed", {
          feature,
          providerId: route.providerId,
          modelId: route.modelId,
          message,
          willFallback: hasNext
        });
        if (!hasNext) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Falha em todos os provedores LLM da prioridade.");
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

  function providerFor(providerId) {
    if (providerId === "openai") return openaiProvider;
    if (providerId === "anthropic") return anthropicProvider;
    return geminiProvider;
  }

  async function listProviderModels(providerId, candidateApiKey) {
    const apiKey = candidateApiKey?.trim() || getApiKey(providerId);
    if (!apiKey) throw new Error("API key ausente.");
    const provider = providerFor(providerId);
    if (typeof provider?.listModels === "function") {
      return provider.listModels(apiKey);
    }
    return listModelCatalog()
      .filter((model) => model.providerId === providerId)
      .map((model) => model.modelId);
  }

  /**
   * Valida a chave sem depender do modelo (listar modelos só exige uma chave válida)
   * e depois testa o modelo. Chave válida + modelo indisponível não invalida a chave.
   */
  async function checkProvider(providerId, modelId, candidateApiKey) {
    const apiKey = candidateApiKey?.trim() || getApiKey(providerId);
    if (!apiKey) {
      return { ok: false, keyValid: false, modelOk: false, message: "API key ausente." };
    }
    try {
      await listProviderModels(providerId, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, keyValid: false, modelOk: false, message: `Chave inválida: ${message}` };
    }
    try {
      await testProvider(providerId, modelId, apiKey);
      return { ok: true, keyValid: true, modelOk: true, message: "Conexão OK." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        keyValid: true,
        modelOk: false,
        message: `Chave válida, mas o modelo ${modelId || "padrão"} falhou: ${message}`
      };
    }
  }

  return {
    streamAskResponse,
    streamMeetingSummary,
    streamForFeature,
    testProvider,
    checkProvider,
    resolveRoute,
    listProviderModels,
    listCandidateRoutes: (feature, input = {}) =>
      listCandidateRoutes(settingsStore.getPublicLlmSettings(), {
        ...input,
        feature,
        localAvailable: localProvider?.isAvailable?.() !== false
      })
  };
}

module.exports = { createLlmProviderRegistry };
