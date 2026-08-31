// Meeting modes and context

export type MeetingSessionStatus =
  | "recording"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed";

/** passive = observador; active = alertas; hybrid = resumo + alertas (G3) */
export type MeetingSessionMode = "passive" | "active" | "hybrid";

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  team: string;
  responsibilities: string;
  communicationStyle: string;
  basePrompt: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export type MeetingTemplateId =
  | "daily"
  | "retro"
  | "one_on_one"
  | "planning"
  | "review"
  | "interview";

export interface MeetingTemplate {
  id: MeetingTemplateId;
  label: string;
  suggestedMode: MeetingSessionMode;
  objective: string;
  customPrompt: string;
}

export interface MeetingTemplatesListResponse {
  templates: MeetingTemplate[];
}

export interface ConsentTextResponse {
  version: string;
  text: string;
}

export interface ConsentAuditEntry {
  id: string;
  sessionId: string;
  sessionType: "meeting" | "translation";
  consentAccepted: boolean;
  consentTextVersion: string;
  useCloud: boolean;
  recordedAtIso: string;
}

export interface ConsentAuditListResponse {
  entries: ConsentAuditEntry[];
}

export type TokenBudgetLevel = "ok" | "warning" | "hard";

export interface MeetingSessionStartRequest {
  profileId: string;
  objective: string;
  customPrompt?: string;
  endAtIso?: string;
  useCloud: boolean;
  mode?: MeetingSessionMode;
  /** Nomes/apelidos do usuário para detecção de pergunta dirigida (modo ativo) */
  userAliases?: string[];
  /** Se true, alerta só com "?" + heurística (sem classificador LLM) */
  questionOnlyMode?: boolean;
  /** Template curado (daily, retro, …) — preenche objective/prompt/mode se vazios */
  templateId?: MeetingTemplateId;
  /** Obrigatório para iniciar gravação (auditoria §12.7) */
  consentAccepted: boolean;
  consentTextVersion?: string;
}

export interface MeetingSessionStartResponse {
  sessionId: string;
  startedAtIso: string;
}

export interface MeetingSessionStopResponse {
  sessionId: string;
  status: MeetingSessionStatus;
}

export interface MeetingSessionCancelResponse {
  sessionId: string;
  status: "cancelled";
}

export interface MeetingSessionStatusEvent {
  sessionId: string;
  status: MeetingSessionStatus;
  elapsedSeconds: number;
  estimatedCloudTokens: number;
  cloudActive: boolean;
  transcriptLength: number;
  tokenBudgetLevel?: TokenBudgetLevel;
  bookmarkCount?: number;
}

export interface MeetingTranscriptBookmark {
  id: string;
  elapsedSeconds: number;
  createdAtIso: string;
  transcriptLength: number;
}

export interface MeetingTranscriptBookmarkEvent {
  sessionId: string;
  bookmark: MeetingTranscriptBookmark;
}

export interface MeetingMidSummaryResponse {
  sessionId: string;
  summaryMarkdown: string;
}

export interface MeetingMidSummaryEvent {
  sessionId: string;
  summaryMarkdown: string;
  generatedAtIso: string;
}

export interface TokenUsageThresholdEvent {
  sessionId: string;
  level: Exclude<TokenBudgetLevel, "ok">;
  estimatedCloudTokens: number;
  emittedAtIso: string;
}

export interface TokenUsageDailyResponse {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  overDaily: boolean;
}

export interface RetentionPurgeRunResponse {
  retentionDays: number;
  deletedFiles: number;
  errors: number;
  ranAtIso: string;
}

export interface ContextProfileDeleteRequest {
  profileId: string;
}

export interface TeamMemoryUpdateRequest {
  itemId: string;
  excerpt?: string;
  fullSummary?: string;
  objective?: string;
}

export interface MeetingSessionCompletedEvent {
  sessionId: string;
  summaryMarkdown: string;
  completedAtIso: string;
}

export interface MeetingTranscriptDeltaEvent {
  sessionId: string;
  delta: string;
  fullText: string;
}

export interface MeetingActiveAlertEvent {
  sessionId: string;
  questionText: string;
  confidence: number;
  suggestedResponse: string;
  detectedAtIso: string;
  source: "heuristic" | "llm";
  /** true quando stealth ativo — UI deve enfileirar sem toast/modal */
  stealthMuted?: boolean;
}

export interface MeetingActiveDismissRequest {
  sessionId: string;
  questionText: string;
}

export interface MeetingActiveDismissResponse {
  ok: boolean;
}

export interface TeamMemoryItem {
  id: string;
  createdAtIso: string;
  meetingSessionId?: string;
  profileId?: string;
  objective?: string;
  excerpt?: string;
  fullSummary?: string;
}

export interface TeamMemoryListResponse {
  items: TeamMemoryItem[];
}

/** Preferências persistidas (Configurações → Reunião) */
export interface MeetingPrefs {
  defaultMode: MeetingSessionMode;
  userAliases: string[];
  questionOnlyMode: boolean;
}

export interface ContextProfilesListResponse {
  profiles: UserProfile[];
}

export interface ContextProfileSaveRequest {
  profile: Omit<UserProfile, "createdAtIso" | "updatedAtIso"> & {
    id?: string;
    createdAtIso?: string;
  };
}

export interface ContextProfileDuplicateRequest {
  profileId: string;
}
