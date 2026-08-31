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
  sourceLanguage: TranslationLanguageCode;
  targetLanguage: TranslationLanguageCode;
  useCloud: boolean;
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
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  latencyMs: number;
  emittedAtIso: string;
}

export interface TranslationPrefs {
  sourceLanguage: TranslationLanguageCode;
  targetLanguage: TranslationLanguageCode;
  overlayFontSize: number;
  overlayOpacity: number;
  historyLines: number;
  /** Abre janela flutuante always-on-top durante sessão */
  overlayEnabled?: boolean;
}

export interface TranslationSessionStatusResponse {
  active: boolean;
  sessionId?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  captureMode?: string;
  avgLatencyMs?: number;
  maxLatencyMs?: number;
  linesEmitted?: number;
}
