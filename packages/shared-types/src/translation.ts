// Live translation mode (G4)

export type TranslationLanguageCode =
  | "auto"
  | "pt"
  | "en"
  | "es"
  | "fr"
  | "de"
  | "it";

export interface TranslationSessionStartRequest {
  /** Ignorado: a legenda ao vivo transcreve sempre em inglês. */
  sourceLanguage?: TranslationLanguageCode;
  targetLanguage: TranslationLanguageCode;
  /** Obrigatório para iniciar captura (auditoria §12.7) */
  consentAccepted: boolean;
  consentTextVersion?: string;
}

export interface TranslationSessionStartResponse {
  sessionId: string;
  startedAtIso: string;
}

export interface TranslationSessionStopResponse {
  sessionId: string;
  status: "stopped";
}

export interface TranslationLineEvent {
  sessionId: string;
  /** Mesmo id do parcial que esta linha substitui. */
  itemId?: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Do início da fala até a tradução pronta. */
  latencyMs: number;
  /** Do início da fala até a frase final do STT. */
  sttMs?: number;
  llmMs?: number;
  emittedAtIso: string;
}

/** Texto em inglês ainda em transcrição; `text` vazio remove o parcial. */
export interface TranslationPartialEvent {
  sessionId: string;
  itemId: string;
  text: string;
  emittedAtIso: string;
}

export type TranslationConnectionState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"
  | "closed";

export interface TranslationPrefs {
  sourceLanguage: TranslationLanguageCode;
  targetLanguage: TranslationLanguageCode;
  overlayFontSize: number;
  overlayOpacity: number;
  historyLines: number;
  /** Modelo exigido na URL da sessão Realtime, ex.: gpt-realtime-1.5. */
  realtimeModel?: string;
  /** Modelo que transcreve o áudio dentro da sessão. */
  transcriptionModel?: string;
  /** @deprecated Overlay agora é sob demanda via ícone; default false */
  overlayEnabled?: boolean;
}

export interface TranslationSessionStatusResponse {
  active: boolean;
  sessionId?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  captureMode?: string;
  connection?: TranslationConnectionState;
  /** Média recente: do início da fala até o primeiro parcial. */
  firstPartialMs?: number;
  /** Média recente: do início da fala até a frase final do STT. */
  sttFinalMs?: number;
  /** Média recente da tradução no LLM. */
  llmMs?: number;
  avgLatencyMs?: number;
  maxLatencyMs?: number;
  linesEmitted?: number;
  useCloud?: boolean;
  overlayVisible?: boolean;
}
