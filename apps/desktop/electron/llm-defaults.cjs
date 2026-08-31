// Default LLM catalogs and settings

const DEFAULT_LLM_ROUTING = {
  ask: { providerId: "gemini", modelId: "gemini-2.5-flash" },
  meetingSummary: { providerId: "gemini", modelId: "gemini-2.5-flash-lite" },
  meetingActiveClassifier: { providerId: "gemini", modelId: "gemini-2.5-flash-lite" },
  translation: { providerId: "gemini", modelId: "gemini-2.5-flash-lite" }
};

const DEFAULT_TOKEN_BUDGET = {
  enabled: true,
  sessionWarningTokens: 50_000,
  sessionHardLimitTokens: 200_000,
  onLimitReached: "warn"
};

const DEFAULT_PRIVACY = {
  allowCloudProcessingForMeetings: true,
  retentionDays: 7
};

const MODEL_CATALOG = {
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
  openai: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
  anthropic: ["claude-3-5-haiku-latest", "claude-sonnet-4-20250514"]
};

const DEFAULT_LLM_PROVIDERS = {
  gemini: { enabled: true, defaultModelId: "gemini-2.5-flash", apiKeyEncrypted: "" },
  openai: { enabled: false, defaultModelId: "gpt-4o-mini", apiKeyEncrypted: "" },
  anthropic: { enabled: false, defaultModelId: "claude-3-5-haiku-latest", apiKeyEncrypted: "" }
};

module.exports = {
  DEFAULT_LLM_ROUTING,
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_PRIVACY,
  MODEL_CATALOG,
  DEFAULT_LLM_PROVIDERS
};
