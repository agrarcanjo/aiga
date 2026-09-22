const MODEL_CATALOG = [
  { providerId: "openai", modelId: "gpt-5.6-luna", label: "GPT-5.6 Luna", description: "Rápido e econômico para tarefas simples, tradução e classificação.", tier: "light", modalities: ["text", "image"], reasoning: true, relativeLatency: "low", relativeCost: "low" },
  { providerId: "openai", modelId: "gpt-5.6-terra", label: "GPT-5.6 Terra", description: "Equilíbrio entre inteligência, custo e análise visual.", tier: "balanced", modalities: ["text", "image"], reasoning: true, relativeLatency: "medium", relativeCost: "medium" },
  { providerId: "openai", modelId: "gpt-5.6-sol", label: "GPT-5.6 Sol", description: "Trabalho profissional complexo, código e diagnóstico avançado.", tier: "high", modalities: ["text", "image"], reasoning: true, relativeLatency: "high", relativeCost: "high" },
  { providerId: "openai", modelId: "gpt-6-astra", label: "GPT-6 Astra", description: "Maior capacidade para problemas excepcionais e raciocínio profundo.", tier: "high", modalities: ["text", "image"], reasoning: true, relativeLatency: "high", relativeCost: "high" },
  { providerId: "gemini", modelId: "gemini-3.5-flash-lite", label: "Gemini Flash Lite", description: "Baixa latência para classificação, tradução e respostas curtas.", tier: "light", modalities: ["text", "image", "audio"], reasoning: false, relativeLatency: "low", relativeCost: "low" },
  { providerId: "gemini", modelId: "gemini-3.5-flash", label: "Gemini Flash", description: "Modelo multimodal balanceado para chat e screenshots.", tier: "balanced", modalities: ["text", "image", "audio"], reasoning: false, relativeLatency: "medium", relativeCost: "medium" },
  { providerId: "gemini", modelId: "gemini-3.5-pro", label: "Gemini Pro", description: "Maior qualidade para código e raciocínio complexo.", tier: "high", modalities: ["text", "image", "audio"], reasoning: true, relativeLatency: "high", relativeCost: "high" },
  { providerId: "anthropic", modelId: "claude-3-5-haiku-latest", label: "Claude Haiku", description: "Respostas rápidas e tarefas bem definidas.", tier: "light", modalities: ["text", "image"], reasoning: false, relativeLatency: "low", relativeCost: "low" },
  { providerId: "anthropic", modelId: "claude-sonnet-4-20250514", label: "Claude Sonnet", description: "Análise, escrita e código com maior profundidade.", tier: "high", modalities: ["text", "image"], reasoning: true, relativeLatency: "high", relativeCost: "high" }
];

function listModelCatalog() {
  return MODEL_CATALOG.map((model) => ({ ...model, modalities: [...model.modalities] }));
}

function findModel(providerId, modelId) {
  return MODEL_CATALOG.find((model) => model.providerId === providerId && model.modelId === modelId) || null;
}

function findModelForTier(providerId, tier, requiredModalities = []) {
  const providerModels = MODEL_CATALOG.filter(
    (model) =>
      model.providerId === providerId &&
      requiredModalities.every((modality) => model.modalities.includes(modality))
  );
  return (
    providerModels.find((model) => model.tier === tier) ||
    (tier === "balanced" ? providerModels.find((model) => model.tier === "high") : null) ||
    providerModels[0] ||
    null
  );
}

module.exports = { listModelCatalog, findModel, findModelForTier };
