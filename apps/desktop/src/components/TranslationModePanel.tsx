import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TranslationLanguageCode,
  TranslationLineEvent,
  TranslationPrefs,
} from "@clone-perssua/shared-types";
import {
  AudioCaptureHud,
  useMicrophoneLevel,
} from "./AudioCaptureHud";
import {
  startChunkedCapture,
  type ChunkedCaptureController,
} from "../lib/systemAudioCapture";

const C = {
  surface: "#1a1a1a",
  surface2: "#242424",
  border: "#2e2e2e",
  accent: "#6366f1",
  text: "#e5e5e5",
  textMuted: "#888",
  error: "#ef4444",
  live: "#22c55e",
};

const LANG_OPTIONS: { value: TranslationLanguageCode; label: string }[] = [
  { value: "auto", label: "Automático" },
  { value: "en", label: "Inglês" },
  { value: "pt", label: "Português" },
  { value: "es", label: "Espanhol" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
];

const TARGET_OPTIONS = LANG_OPTIONS.filter((o) => o.value !== "auto");

function Spinner(): JSX.Element {
  return (
    <>
      <style>{"@keyframes aiga-spin { to { transform: rotate(360deg); } }"}</style>
      <span
        style={{
          width: 12,
          height: 12,
          border: "2px solid rgba(255,255,255,0.35)",
          borderTopColor: "#fff",
          borderRadius: "50%",
          display: "inline-block",
          animation: "aiga-spin 0.8s linear infinite",
        }}
      />
    </>
  );
}

interface TranslationModePanelProps {
  stealthEnabled: boolean;
  expanded?: boolean;
}

export function TranslationModePanel({
  stealthEnabled,
  expanded = false,
}: TranslationModePanelProps): JSX.Element {
  const [prefs, setPrefs] = useState<TranslationPrefs>({
    sourceLanguage: "auto",
    targetLanguage: "pt",
    overlayFontSize: 14,
    overlayOpacity: 0.92,
    historyLines: 8,
    overlayEnabled: true,
  });
  const [useCloud, setUseCloud] = useState(true);
  const [consent, setConsent] = useState(false);
  const [consentTextVersion, setConsentTextVersion] = useState("");
  const [consentText, setConsentText] = useState("");
  const [active, setActive] = useState(false);
  const [captureMode, setCaptureMode] = useState("system_loopback");
  const [captureDeviceId, setCaptureDeviceId] = useState("default");
  const [lines, setLines] = useState<TranslationLineEvent[]>([]);
  const [avgLatencyMs, setAvgLatencyMs] = useState(0);
  const [maxLatencyMs, setMaxLatencyMs] = useState(0);
  const [linesEmitted, setLinesEmitted] = useState(0);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [preflightStatus, setPreflightStatus] = useState("");

  const captureRef = useRef<ChunkedCaptureController | null>(null);
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);

  const captureLevel = useMicrophoneLevel(captureStream, active, {
    mode: captureMode,
    label: captureModeLabel(captureMode),
  });

  const loadPrefs = useCallback(async () => {
    const [settingsRes, llmRes] = await Promise.all([
      window.desktopApi.getSettings(),
      window.desktopApi.getLlmSettings(),
    ]);
    if (settingsRes.settings.translationPrefs) {
      setPrefs(settingsRes.settings.translationPrefs);
    }
    const ac = settingsRes.settings.audioCapture;
    setCaptureMode(ac?.mode || "system_loopback");
    setCaptureDeviceId(ac?.deviceId || "default");
    setUseCloud(llmRes.llm.privacy.allowCloudProcessingForMeetings);
    const st = await window.desktopApi.getTranslationSessionStatus();
    setActive(st.active);
    if (st.avgLatencyMs) setAvgLatencyMs(st.avgLatencyMs);
    if (st.maxLatencyMs) setMaxLatencyMs(st.maxLatencyMs);
    if (st.linesEmitted) setLinesEmitted(st.linesEmitted);
  }, []);

  function captureModeLabel(mode: string): string {
    if (mode === "microphone") return "Microfone";
    if (mode === "output_device") return "Dispositivo de saída específico";
    return "Saída do sistema";
  }

  async function ensureCaptureReady(): Promise<{ mode: string; deviceId: string }> {
    const settings = await window.desktopApi.getSettings();
    let mode = settings.settings.audioCapture?.mode || "system_loopback";
    let deviceId = settings.settings.audioCapture?.deviceId || "default";

    if (mode === "output_device" && (!deviceId || deviceId === "")) {
      mode = "system_loopback";
      deviceId = "default";
      await window.desktopApi.saveAudioCapture({ mode, deviceId });
    }
    if (mode === "system_loopback" && !deviceId) {
      deviceId = "default";
      await window.desktopApi.saveAudioCapture({ mode, deviceId });
    }

    setCaptureMode(mode);
    setCaptureDeviceId(deviceId);
    return { mode, deviceId };
  }

  useEffect(() => {
    void loadPrefs();
    void window.desktopApi.getTranslationConsentText().then((r) => {
      setConsentText(r.text);
      setConsentTextVersion(r.version);
    });
    const unsub = window.desktopApi.onTranslationLine((line) => {
      setLines((prev) => [line, ...prev].slice(0, prefs.historyLines || 8));
      setAvgLatencyMs(line.latencyMs);
    });
    const unsubError = window.desktopApi.onTranslationError((ev) => {
      setError(`${ev.code}: ${ev.message}`);
    });
    const poll = setInterval(() => {
      void window.desktopApi.getTranslationSessionStatus().then((st) => {
        setActive(st.active);
        if (st.avgLatencyMs !== undefined) setAvgLatencyMs(st.avgLatencyMs);
        if (st.maxLatencyMs !== undefined) setMaxLatencyMs(st.maxLatencyMs);
        if (st.linesEmitted !== undefined) setLinesEmitted(st.linesEmitted);
      });
    }, 3000);
    return () => {
      unsub();
      unsubError();
      clearInterval(poll);
    };
  }, [loadPrefs, prefs.historyLines]);

  useEffect(
    () => () => {
      captureRef.current?.stop();
      captureRef.current = null;
    },
    []
  );

  function stopCapture(): void {
    captureRef.current?.stop();
    captureRef.current = null;
    setCaptureStream(null);
  }

  async function runPreflight(): Promise<boolean> {
    setPreflightStatus("");
    await ensureCaptureReady();
    return true;
  }

  async function startCaptureChunks(mode: string): Promise<void> {
    const controller = await startChunkedCapture({
      mode,
      timesliceMs: 6000,
      onChunk: async (chunkBase64) => {
        try {
          const status = await window.desktopApi.getTranslationSessionStatus();
          if (status?.sessionId) {
            void window.desktopApi.saveMeetingAudioChunk({
              sessionId: status.sessionId,
              chunkBase64,
              extension: "webm",
              kind: "translation",
            });
          }
          await window.desktopApi.ingestTranslationMicChunk({ chunkBase64 });
        } catch {
          // non-fatal
        }
      },
    });
    captureRef.current = controller;
    setCaptureStream(controller.stream);
  }

  async function handleStart(): Promise<void> {
    if (starting || active) {
      return;
    }
    setError("");
    setLines([]);
    if (!consent) {
      setError("Confirme o aviso legal antes de iniciar a tradução.");
      return;
    }
    setStarting(true);
    setPreflightStatus("Preparando captura de áudio…");
    try {
      if (!(await runPreflight())) {
        return;
      }
      await window.desktopApi.saveSettings({ translationPrefs: prefs });
      setPreflightStatus("Iniciando sessão de tradução…");
      const started = await window.desktopApi.startTranslationSession({
        sourceLanguage: prefs.sourceLanguage,
        targetLanguage: prefs.targetLanguage,
        useCloud,
        consentAccepted: true,
        consentTextVersion: consentTextVersion || undefined,
      });
      setActive(true);
      try {
        await startCaptureChunks(started.captureMode || captureMode);
        setPreflightStatus("Captura ativa. Aguardando fala…");
      } catch (captureError) {
        await window.desktopApi.stopTranslationSession();
        setActive(false);
        throw captureError;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar tradução");
    } finally {
      setStarting(false);
    }
  }

  async function handleStop(): Promise<void> {
    stopCapture();
    try {
      await window.desktopApi.stopTranslationSession();
      setActive(false);
      setLines([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao parar");
    }
  }

  const selectStyle = {
    background: C.surface2,
    border: `1px solid ${C.border}`,
    color: C.text,
    borderRadius: 6,
    padding: expanded ? "12px 14px" : 8,
    width: "100%",
    fontSize: expanded ? 14 : 13,
    maxWidth: expanded ? 920 : undefined,
  };

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
      {active && (
        <div
          style={{
            padding: "8px 12px",
            background: "#122a18",
            border: `1px solid ${C.live}`,
            borderRadius: 8,
            fontSize: 12,
            color: C.live,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Tradução ao vivo{stealthEnabled ? " (stealth)" : ""}</span>
          <span style={{ color: C.textMuted }}>
            média {avgLatencyMs} ms · pico {maxLatencyMs} ms · {linesEmitted} linhas
          </span>
        </div>
      )}

      {active && <AudioCaptureHud level={captureLevel} compact />}

      {!active && (
        <>
          <label style={{ color: C.textMuted, fontSize: 12 }}>Idioma origem</label>
          <select
            value={prefs.sourceLanguage}
            onChange={(e) =>
              setPrefs({ ...prefs, sourceLanguage: e.target.value as TranslationLanguageCode })
            }
            style={selectStyle}
          >
            {LANG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label style={{ color: C.textMuted, fontSize: 12 }}>Idioma destino</label>
          <select
            value={prefs.targetLanguage}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                targetLanguage: e.target.value as TranslationLanguageCode,
              })
            }
            style={selectStyle}
          >
            {TARGET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
            <input type="checkbox" checked={useCloud} onChange={(e) => setUseCloud(e.target.checked)} />
            Traduzir na nuvem (senão usa LLM local se disponível)
          </label>
          <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
            <input
              type="checkbox"
              checked={prefs.overlayEnabled !== false}
              onChange={(e) => setPrefs({ ...prefs, overlayEnabled: e.target.checked })}
            />
            Overlay flutuante always-on-top
          </label>
          <label style={{ color: C.textMuted, fontSize: 12 }}>
            Tamanho da fonte (overlay): {prefs.overlayFontSize}px
          </label>
          <input
            type="range"
            min={12}
            max={24}
            value={prefs.overlayFontSize}
            onChange={(e) =>
              setPrefs({ ...prefs, overlayFontSize: Number(e.target.value) })
            }
          />
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: expanded ? 12 : 10,
              background: C.surface2,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>Fonte de áudio</span>
            <span style={{ color: C.textMuted, fontSize: 12 }}>
              {captureModeLabel(captureMode)}
              {captureMode !== "microphone"
                ? ` · ${captureDeviceId === "default" || !captureDeviceId ? "Padrão do Windows" : captureDeviceId}`
                : ""}
            </span>
            <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
              Altere em Configurações → Captura áudio (mesmo lugar do ffmpeg). O padrão é a saída do
              sistema — não precisa escolher dispositivo manualmente.
            </p>
          </div>
          <pre
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              padding: expanded ? 14 : 10,
              borderRadius: 6,
              fontSize: expanded ? 12 : 10,
              color: C.textMuted,
              whiteSpace: "pre-wrap",
              margin: 0,
              maxHeight: expanded ? 240 : 100,
              overflow: "auto",
            }}
          >
            {consentText || "Carregando aviso legal…"}
          </pre>
          <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Li e aceito o aviso acima
          </label>
          <button
            type="button"
            disabled={!consent || starting}
            onClick={() => void handleStart()}
            style={{
              background: consent && !starting ? C.accent : C.surface2,
              border: "none",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 6,
              cursor: consent && !starting ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {starting && <Spinner />}
            {starting ? "Iniciando…" : "Iniciar legendas"}
          </button>
        </>
      )}

      {active && (
        <button
          type="button"
          onClick={() => void handleStop()}
          style={{
            background: C.surface2,
            border: `1px solid ${C.error}`,
            color: C.error,
            padding: "8px 14px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Parar tradução
        </button>
      )}

      {preflightStatus && !active && (
        <p style={{ color: C.live, fontSize: 11, margin: 0 }}>{preflightStatus}</p>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const text = lines
                .slice()
                .reverse()
                .map((l) => (l.originalText ? `${l.originalText}\n${l.translatedText}` : l.translatedText))
                .join("\n\n");
              try {
                await navigator.clipboard.writeText(text);
                setCopyStatus("Legendas copiadas.");
              } catch {
                setCopyStatus("Não foi possível copiar. Selecione o texto abaixo.");
              }
            })();
          }}
          disabled={lines.length === 0}
          style={{
            background: C.surface2,
            border: `1px solid ${C.border}`,
            color: lines.length === 0 ? C.textMuted : C.text,
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 11,
            cursor: lines.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          Copiar legendas
        </button>
        {copyStatus && <span style={{ color: C.textMuted, fontSize: 11 }}>{copyStatus}</span>}
      </div>

      <div
        style={{
          background: `rgba(26,26,26,${prefs.overlayOpacity})`,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: expanded ? 16 : 10,
          maxHeight: expanded ? "none" : 220,
          flex: expanded ? 1 : undefined,
          minHeight: expanded ? 280 : undefined,
          overflowY: "auto",
          fontSize: expanded ? Math.max(prefs.overlayFontSize, 15) : prefs.overlayFontSize,
          lineHeight: 1.45,
          userSelect: "text",
          WebkitUserSelect: "text",
          cursor: "text",
        }}
      >
        {lines.length === 0 && (
          <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
            {active ? "Aguardando fala…" : "Nenhuma legenda ainda."}
          </p>
        )}
        {lines.map((line, idx) => (
          <div key={`${line.emittedAtIso}-${idx}`} style={{ marginBottom: 10 }}>
            {line.originalText && prefs.sourceLanguage !== "auto" && (
              <p style={{ color: C.textMuted, margin: "0 0 4px", fontSize: 11 }}>{line.originalText}</p>
            )}
            <p style={{ color: C.text, margin: 0 }}>{line.translatedText}</p>
          </div>
        ))}
      </div>

      {error && (
        <p
          style={{
            color: C.error,
            fontSize: 12,
            userSelect: "text",
            WebkitUserSelect: "text",
            cursor: "text",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
