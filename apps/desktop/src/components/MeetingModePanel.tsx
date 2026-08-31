import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContextProfilesListResponse,
  MeetingActiveAlertEvent,
  MeetingSessionCompletedEvent,
  MeetingSessionStatusEvent,
  TokenBudgetLevel,
  UserProfile,
} from "@clone-perssua/shared-types";
import { MeetingWizard, type MeetingWizardValues } from "./MeetingWizard";
import {
  AudioCaptureHud,
  useMainAudioCaptureLevel,
  useMicrophoneLevel,
} from "./AudioCaptureHud";

const C = {
  surface: "#1a1a1a",
  surface2: "#242424",
  border: "#2e2e2e",
  accent: "#6366f1",
  text: "#e5e5e5",
  textMuted: "#888",
  error: "#ef4444",
  record: "#ef4444",
  warn: "#f59e0b",
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function exportSummaryMarkdown(summary: string, sessionId: string): void {
  const blob = new Blob([summary], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reuniao-${sessionId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

interface MeetingModePanelProps {
  stealthEnabled: boolean;
  expanded?: boolean;
}

const defaultWizardValues = (): MeetingWizardValues => ({
  templateId: "",
  profileId: "",
  objective: "",
  customPrompt: "",
  sessionMode: "passive",
  aliasesText: "",
  questionOnlyMode: false,
  useCloud: true,
  consent: false,
  consentTextVersion: "",
});

export function MeetingModePanel({
  stealthEnabled,
  expanded = false,
}: MeetingModePanelProps): JSX.Element {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [wizard, setWizard] = useState<MeetingWizardValues>(defaultWizardValues);

  const [meetingSessionId, setMeetingSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  const [tokenBudgetLevel, setTokenBudgetLevel] = useState<TokenBudgetLevel>("ok");
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [transcriptPreview, setTranscriptPreview] = useState("");
  const [summary, setSummary] = useState("");
  const [midSummary, setMidSummary] = useState("");
  const [midSummaryLoading, setMidSummaryLoading] = useState(false);
  const [error, setError] = useState("");
  const [captureMode, setCaptureMode] = useState<string>("microphone");
  const [audioDeviceId, setAudioDeviceId] = useState<string | undefined>();
  const [preflightStatus, setPreflightStatus] = useState("");
  const [activeAlerts, setActiveAlerts] = useState<MeetingActiveAlertEvent[]>([]);
  const [pendingStealthAlerts, setPendingStealthAlerts] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const isLive = Boolean(meetingSessionId) && (status === "recording" || status === "processing");
  const loopbackLevel = useMainAudioCaptureLevel(isLive && captureMode !== "microphone");
  const micLevel = useMicrophoneLevel(micStream, isLive && captureMode === "microphone");
  const captureLevel = captureMode === "microphone" ? micLevel : loopbackLevel;

  const patchWizard = useCallback((patch: Partial<MeetingWizardValues>) => {
    setWizard((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadProfiles = useCallback(async () => {
    const r: ContextProfilesListResponse = await window.desktopApi.listContextProfiles();
    setProfiles(r.profiles);
    if (r.profiles.length) {
      setWizard((prev) => (prev.profileId ? prev : { ...prev, profileId: r.profiles[0].id }));
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
    void window.desktopApi.getLlmSettings().then((r) => {
      patchWizard({ useCloud: r.llm.privacy.allowCloudProcessingForMeetings });
    });
    void window.desktopApi.getSettings().then((r) => {
      setCaptureMode(r.settings.audioCapture?.mode || "microphone");
      setAudioDeviceId(r.settings.audioCapture?.deviceId);
      const prefs = r.settings.meetingPrefs;
      if (prefs) {
        patchWizard({
          sessionMode: prefs.defaultMode || "passive",
          aliasesText: (prefs.userAliases || []).join(", "),
          questionOnlyMode: Boolean(prefs.questionOnlyMode),
        });
      }
    });
  }, [loadProfiles, patchWizard]);

  useEffect(() => {
    const unsubStatus = window.desktopApi.onMeetingSessionStatus((p: MeetingSessionStatusEvent) => {
      if (meetingSessionId && p.sessionId !== meetingSessionId) return;
      setStatus(p.status);
      setElapsedSeconds(p.elapsedSeconds);
      setEstimatedTokens(p.estimatedCloudTokens);
      if (p.tokenBudgetLevel) setTokenBudgetLevel(p.tokenBudgetLevel);
      if (p.bookmarkCount !== undefined) setBookmarkCount(p.bookmarkCount);
    });
    const unsubDone = window.desktopApi.onMeetingSessionCompleted((p: MeetingSessionCompletedEvent) => {
      if (meetingSessionId && p.sessionId !== meetingSessionId) return;
      setSummary(p.summaryMarkdown);
      setStatus("completed");
      stopMicCapture();
    });
    const unsubTx = window.desktopApi.onMeetingTranscriptDelta((p) => {
      if (meetingSessionId && p.sessionId !== meetingSessionId) return;
      setTranscriptPreview(p.fullText.slice(-400));
    });
    const unsubMid = window.desktopApi.onMeetingMidSummary((p) => {
      if (meetingSessionId && p.sessionId !== meetingSessionId) return;
      setMidSummary(p.summaryMarkdown);
      setMidSummaryLoading(false);
    });
    const unsubAlert = window.desktopApi.onMeetingActiveAlert((p: MeetingActiveAlertEvent) => {
      if (meetingSessionId && p.sessionId !== meetingSessionId) return;
      const muted = p.stealthMuted || stealthEnabled;
      if (muted) {
        setPendingStealthAlerts((n) => n + 1);
      }
      setActiveAlerts((prev) => [p, ...prev].slice(0, 12));
    });
    const unsubThreshold = window.desktopApi.onTokenUsageThreshold((p) => {
      if (meetingSessionId && p.sessionId !== meetingSessionId) return;
      setTokenBudgetLevel(p.level);
      setError(
        p.level === "hard"
          ? "Orçamento de tokens atingido — nuvem bloqueada para esta sessão."
          : "Aviso: orçamento de tokens próximo do limite."
      );
    });
    return () => {
      unsubStatus();
      unsubDone();
      unsubTx();
      unsubMid();
      unsubAlert();
      unsubThreshold();
    };
  }, [meetingSessionId, stealthEnabled]);

  function stopMicCapture(): void {
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMicStream(null);
  }

  function parseAliases(): string[] {
    return wizard.aliasesText
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function persistMeetingPrefs(): Promise<void> {
    await window.desktopApi.saveSettings({
      meetingPrefs: {
        defaultMode: wizard.sessionMode,
        userAliases: parseAliases(),
        questionOnlyMode: wizard.questionOnlyMode,
      },
    });
  }

  async function transcribeChunk(base64: string): Promise<void> {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    try {
      const r = await window.desktopApi.transcribeAudioChunk({
        sessionId: sid,
        chunkBase64: base64,
        language: "pt",
      });
      if (r.text?.trim()) {
        await window.desktopApi.appendMeetingTranscript({
          sessionId: sid,
          text: `${r.text.trim()} `,
        });
      }
    } catch {
      // STT failures are non-fatal during meeting
    }
  }

  async function startMicChunks(): Promise<void> {
    const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    setMicStream(stream);
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 16000 });
    recorderRef.current = recorder;

    recorder.ondataavailable = async (ev) => {
      if (!ev.data.size) return;
      const buf = await ev.data.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      const chunkBase64 = btoa(binary);
      const sid = activeSessionIdRef.current;
      if (sid) {
        void window.desktopApi.saveMeetingAudioChunk({
          sessionId: sid,
          chunkBase64,
          extension: "webm",
          kind: "meeting",
        });
      }
      await transcribeChunk(chunkBase64);
    };

    recorder.start();
    chunkTimerRef.current = setInterval(() => {
      if (recorder.state === "recording") recorder.stop();
      recorder.start();
    }, 8000);
  }

  async function runAudioPreflight(modeOverride?: string): Promise<boolean> {
    setPreflightStatus("");
    const mode = modeOverride || captureMode;
    if (mode === "microphone") {
      try {
        const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setPreflightStatus("Microfone OK");
        return true;
      } catch {
        setError("Microfone inacessível. Configure em Configurações → Microfone.");
        return false;
      }
    }
    const test = await window.desktopApi.testAudioSource({
      mode,
      deviceId: audioDeviceId,
    });
    if (!test.ok) {
      setError(test.message || "Falha no teste da fonte de áudio.");
      return false;
    }
    setPreflightStatus(test.message || "Fonte de áudio OK");
    return true;
  }

  async function handleStart(): Promise<void> {
    setError("");
    setActiveAlerts([]);
    setPendingStealthAlerts(0);
    setMidSummary("");
    const isInterview = wizard.templateId === "interview";
    if (!wizard.consent) {
      setError("Confirme o aviso legal antes de gravar.");
      return;
    }
    if (!wizard.profileId) {
      setError("Selecione um perfil.");
      return;
    }
    if (
      !isInterview &&
      (wizard.sessionMode === "active" || wizard.sessionMode === "hybrid") &&
      !parseAliases().length &&
      !profiles.find((p) => p.id === wizard.profileId)?.name
    ) {
      setError("Modo ativo/híbrido: informe apelidos ou use um perfil com nome.");
      return;
    }

    let effectiveCaptureMode = captureMode;
    if (isInterview && captureMode === "microphone") {
      try {
        await window.desktopApi.saveAudioCapture({ mode: "system_loopback", deviceId: "" });
        effectiveCaptureMode = "system_loopback";
        setCaptureMode("system_loopback");
        setPreflightStatus("Captura ajustada para saída do sistema (entrevista).");
      } catch {
        setError("Não foi possível ativar captura de saída do sistema para entrevista.");
        return;
      }
    }

    if (!(await runAudioPreflight(effectiveCaptureMode))) {
      return;
    }
    try {
      await persistMeetingPrefs();
      const started = await window.desktopApi.startMeetingSession({
        profileId: wizard.profileId,
        objective: wizard.objective,
        customPrompt: wizard.customPrompt || undefined,
        useCloud: wizard.useCloud,
        mode: isInterview ? "active" : wizard.sessionMode,
        userAliases: parseAliases(),
        questionOnlyMode:
          isInterview || wizard.sessionMode === "active" || wizard.sessionMode === "hybrid"
            ? wizard.questionOnlyMode
            : undefined,
        templateId: wizard.templateId || undefined,
        consentAccepted: true,
        consentTextVersion: wizard.consentTextVersion || undefined,
      });
      activeSessionIdRef.current = started.sessionId;
      setMeetingSessionId(started.sessionId);
      setStatus("recording");
      setSummary("");
      setTranscriptPreview("");
      setElapsedSeconds(0);
      setBookmarkCount(0);
      setTokenBudgetLevel("ok");
      if (effectiveCaptureMode === "microphone") {
        await startMicChunks();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar");
    }
  }

  async function handleStop(): Promise<void> {
    stopMicCapture();
    if (!meetingSessionId) return;
    setStatus("processing");
    try {
      await window.desktopApi.stopMeetingSession({ sessionId: meetingSessionId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao encerrar");
      setStatus("failed");
    }
  }

  async function handleCancel(): Promise<void> {
    if (!meetingSessionId) return;
    const ok = globalThis.confirm(
      "Cancelar reunião? Nenhum resumo será gerado e tokens de LLM não serão consumidos."
    );
    if (!ok) return;
    stopMicCapture();
    try {
      await window.desktopApi.cancelMeetingSession({ sessionId: meetingSessionId });
      activeSessionIdRef.current = null;
      setMeetingSessionId(null);
      setStatus("cancelled");
      setSummary("");
      setMidSummary("");
      setTranscriptPreview("");
      setActiveAlerts([]);
      setPendingStealthAlerts(0);
      setWizard(defaultWizardValues());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cancelar");
    }
  }

  async function handleMidSummary(): Promise<void> {
    if (!meetingSessionId) return;
    setMidSummaryLoading(true);
    setError("");
    try {
      const r = await window.desktopApi.requestMeetingMidSummary({ sessionId: meetingSessionId });
      setMidSummary(r.summaryMarkdown);
    } catch (e) {
      setMidSummaryLoading(false);
      setError(e instanceof Error ? e.message : "Falha no resumo parcial");
    }
  }

  async function handleBookmark(): Promise<void> {
    if (!meetingSessionId) return;
    await window.desktopApi.addMeetingBookmark({ sessionId: meetingSessionId });
  }

  const isRecording = status === "recording";
  const isInterview = wizard.templateId === "interview";
  const sessionMode = isInterview ? "active" : wizard.sessionMode;
  const showAlertPanel =
    (sessionMode === "active" || sessionMode === "hybrid") &&
    (activeAlerts.length > 0 || pendingStealthAlerts > 0 || (isInterview && isRecording));

  async function handleDismissAlert(questionText: string): Promise<void> {
    if (!meetingSessionId) return;
    await window.desktopApi.dismissMeetingActiveAlert({
      sessionId: meetingSessionId,
      questionText,
    });
    setActiveAlerts((prev) => prev.filter((a) => a.questionText !== questionText));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: expanded ? 16 : 12,
        padding: "8px 0",
        flex: 1,
        minHeight: 0,
      }}
    >
      {isRecording && !stealthEnabled && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            background: "#2a1515",
            border: `1px solid ${C.record}`,
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: C.record,
              }}
            />
            <span style={{ color: C.record, fontWeight: 700, fontSize: 13 }}>
              GRAVANDO
              {isInterview
                ? " · ENTREVISTA"
                : sessionMode === "active"
                  ? " · ATIVO"
                  : sessionMode === "hybrid"
                    ? " · HÍBRIDO"
                    : ""}
            </span>
            <span style={{ color: C.text, fontSize: 13 }}>{formatElapsed(elapsedSeconds)}</span>
          </div>
          <span style={{ color: C.textMuted, fontSize: 11 }}>
            {wizard.useCloud ? `~${Math.round(estimatedTokens / 1000)}k tokens` : "Local"}
            {bookmarkCount > 0 ? ` · ${bookmarkCount} marca(s)` : ""}
          </span>
        </div>
      )}

      {tokenBudgetLevel !== "ok" && isRecording && (
        <p
          style={{
            color: tokenBudgetLevel === "hard" ? C.error : C.warn,
            fontSize: 11,
            margin: 0,
          }}
        >
          {tokenBudgetLevel === "hard"
            ? "Orçamento de tokens: limite rígido atingido."
            : "Orçamento de tokens: próximo do aviso."}
        </p>
      )}

      {stealthEnabled && isRecording && (
        <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
          Stealth: gravação em background
          {(sessionMode === "active" || sessionMode === "hybrid") && pendingStealthAlerts > 0
            ? ` · ${pendingStealthAlerts} alerta(s) na fila`
            : ""}
          .
        </p>
      )}

      {!stealthEnabled && showAlertPanel && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: isInterview ? 12 : 8,
            padding: isInterview ? 14 : 10,
            background: isInterview ? "#141820" : "#1f1a12",
            border: `1px solid ${isInterview ? C.accent : C.warn}`,
            borderRadius: 8,
            flex: isInterview ? 1 : undefined,
            minHeight: isInterview ? (expanded ? 360 : 220) : undefined,
            maxHeight: isInterview && expanded ? "none" : undefined,
            overflow: "auto",
          }}
        >
          <span
            style={{
              color: isInterview ? C.accent : C.warn,
              fontSize: isInterview ? 13 : 12,
              fontWeight: 600,
            }}
          >
            {isInterview ? "Sugestão de resposta" : "Perguntas detectadas"}
            {pendingStealthAlerts > 0 ? ` (+${pendingStealthAlerts} em stealth)` : ""}
          </span>
          {activeAlerts.length === 0 && isInterview && (
            <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
              Ouvindo o entrevistador… a sugestão aparece aqui quando uma pergunta for detectada.
            </p>
          )}
          {activeAlerts.slice(0, isInterview ? 2 : 3).map((a, idx) => (
            <div
              key={`${a.detectedAtIso}-${idx}`}
              style={{
                background: C.surface2,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: isInterview ? 12 : 8,
                fontSize: isInterview ? 13 : 11,
                flex: isInterview ? 1 : undefined,
              }}
            >
              <p
                style={{
                  color: C.textMuted,
                  margin: "0 0 8px",
                  fontWeight: 600,
                  fontSize: isInterview ? 12 : 11,
                }}
              >
                {a.questionText}
              </p>
              <p
                style={{
                  color: C.text,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.45,
                  fontSize: isInterview ? 14 : 11,
                }}
              >
                {a.suggestedResponse}
              </p>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(a.suggestedResponse)}
                  style={{
                    background: isInterview ? C.accent : "transparent",
                    border: `1px solid ${isInterview ? C.accent : C.border}`,
                    color: isInterview ? "#fff" : C.text,
                    fontSize: 11,
                    padding: "6px 10px",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Copiar sugestão
                </button>
                <button
                  type="button"
                  onClick={() => void handleDismissAlert(a.questionText)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.textMuted,
                    fontSize: 11,
                    padding: "6px 10px",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Falso positivo
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!meetingSessionId && (
        <MeetingWizard
          profiles={profiles}
          values={wizard}
          onChange={patchWizard}
          captureMode={captureMode}
          preflightStatus={preflightStatus}
          onStart={() => void handleStart()}
          expanded={expanded}
        />
      )}

      {meetingSessionId && (
        <>
          <AudioCaptureHud level={captureLevel} compact />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={status === "processing"}
              onClick={() => void handleStop()}
              style={{
                background: C.accent,
                border: "none",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {status === "processing" ? "Analisando…" : "Encerrar e analisar"}
            </button>
            <button
              type="button"
              disabled={status === "processing"}
              onClick={() => void handleCancel()}
              style={{
                background: C.surface2,
                border: `1px solid ${C.error}`,
                color: C.error,
                padding: "8px 14px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            {isRecording && !isInterview && (
              <>
                <button
                  type="button"
                  disabled={midSummaryLoading}
                  onClick={() => void handleMidSummary()}
                  style={{
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    padding: "8px 14px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  {midSummaryLoading ? "Gerando…" : "O que importa até agora?"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleBookmark()}
                  style={{
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    padding: "8px 14px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Marcar momento
                </button>
              </>
            )}
          </div>

          {midSummary && isRecording && !isInterview && (
            <pre
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                padding: 10,
                borderRadius: 8,
                fontSize: 11,
                color: C.text,
                whiteSpace: "pre-wrap",
                maxHeight: 140,
                overflow: "auto",
                margin: 0,
              }}
            >
              {midSummary}
            </pre>
          )}
        </>
      )}

      {transcriptPreview && isRecording && !isInterview && (
        <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
          Transcript: {transcriptPreview}
        </p>
      )}

      {summary && meetingSessionId && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(summary)}
              style={{
                background: C.surface2,
                border: `1px solid ${C.border}`,
                color: C.text,
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Copiar resumo
            </button>
            <button
              type="button"
              onClick={() => exportSummaryMarkdown(summary, meetingSessionId)}
              style={{
                background: C.surface2,
                border: `1px solid ${C.border}`,
                color: C.text,
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Exportar .md
            </button>
          </div>
          <pre
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              padding: expanded ? 16 : 12,
              borderRadius: 8,
              fontSize: expanded ? 13 : 11,
              color: C.text,
              whiteSpace: "pre-wrap",
              maxHeight: expanded ? "none" : 180,
              flex: expanded ? 1 : undefined,
              overflow: "auto",
            }}
          >
            {summary}
          </pre>
        </>
      )}

      {error && <p style={{ color: C.error, fontSize: 12 }}>{error}</p>}
    </div>
  );
}
