// LLM providers, routing and token budget

export type LlmCloudProviderId = "gemini" | "openai" | "anthropic";
export type LlmRouteTarget = LlmCloudProviderId | "local";

export type LlmFeatureId =
  | "ask"
  | "meetingSummary"
  | "meetingActiveClassifier"
  | "translation";

export interface LlmRoute {
  providerId: LlmRouteTarget;
  modelId: string;
}

export interface LlmProviderPublicConfig {
  enabled: boolean;
  defaultModelId: string;
  hasApiKey: boolean;
}

export interface LlmRoutingPublicConfig {
  ask: LlmRoute;
  meetingSummary: LlmRoute;
  meetingActiveClassifier: LlmRoute;
  translation: LlmRoute;
}

export type TokenLimitAction = "warn" | "block_cloud" | "switch_to_local";

export interface TokenBudgetSettings {
  enabled: boolean;
  dailyLimitTokens?: number;
  sessionWarningTokens: number;
  sessionHardLimitTokens?: number;
  onLimitReached: TokenLimitAction;
}

export interface PrivacySettings {
  allowCloudProcessingForMeetings: boolean;
  retentionDays: number;
}

export interface LlmSettingsPublic {
  providers: Record<LlmCloudProviderId, LlmProviderPublicConfig>;
  routing: LlmRoutingPublicConfig;
  tokenBudget: TokenBudgetSettings;
  privacy: PrivacySettings;
}

export interface LlmProviderTestRequest {
  providerId: LlmCloudProviderId;
  modelId?: string;
}

export interface LlmProviderTestResponse {
  ok: boolean;
  message: string;
  testedAtIso: string;
}

export interface TokenUsageSessionResponse {
  sessionId: string;
  estimatedTokens: number;
  recordedInputTokens: number;
  recordedOutputTokens: number;
  cloudActive: boolean;
}
