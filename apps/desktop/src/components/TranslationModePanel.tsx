import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TranslationConnectionState,
  TranslationLineEvent,
  TranslationPrefs,
} from "@clone-perssua/shared-types";
import {
  AudioCaptureHud,
  useMicrophoneLevel,
} from "./AudioCaptureHud";
import {
  startPcmStreamCapture,
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
  warn: "#f59e0b",
};

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

function langLabel(code: string): string {
  const map: Record<string, string> = {
    auto: "Automático",
    en: "Inglês",
    pt: "Português",
    es: "Espanhol",
    fr: "Francês",
    de: "Alemão",
    it: "Italiano",
  };
  return map[code] || code;
}

const CONNECTION_LABEL: Record<TranslationConnectionState, string> = {
  connecting: "conectando",
  live: "ao vivo",
  reconnecting: "reconectando",
  error: "erro de conexão",
  closed: "desconectado",
};

interface PartialEntry {
  itemId: string;
  text: string;
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
    sourceLanguage: "en",
    targetLanguage: "pt",
    overlayFontSize: 14,
    overlayOpacity: 0.92,
    historyLines: 8,
    overlayEnabled: false,
  });
  const [chatFontSize, setChatFontSize] = useState(14);
  const [consentTextVersion, setConsentTextVersion] = useState("");
  const [active, setActive] = useState(false);
  const [captureMode, setCaptureMode] = useState<"microphone" | "system_loopback">(
    "system_loopback"
  );
  const [lines, setLines] = useState<TranslationLineEvent[]>([]);
  const [partials, setPartials] = useState<PartialEntry[]>([]);
  const [connection, setConnection] = useState<TranslationConnectionState>("closed");
  const [firstPartialMs, setFirstPartialMs] = useState(0);
  const [sttFinalMs, setSttFinalMs] = useState(0);
  const [llmMs, setLlmMs] = useState(0);
  const [linesEmitted, setLinesEmitted] = useState(0);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [floatingOverlay, setFloatingOverlay] = useState(false);

  const captureRef = useRef<ChunkedCaptureController | null>(null);
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);

  const captureLevel = useMicrophoneLevel(captureStream, active, {
    mode: captureMode,
    label: captureMode === "microphone" ? "Microfone" : "Saída do sistema",
  });

  const applyStatus = useCallback(
    (st: Awaited<ReturnType<typeof window.desktopApi.getTranslationSessionStatus>>) => {
      setActive(st.active);
      if (st.connection) setConnection(st.connection);
      if (st.firstPartialMs !== undefined) setFirstPartialMs(st.firstPartialMs);
      if (st.sttFinalMs !== undefined) setSttFinalMs(st.sttFinalMs);
      if (st.llmMs !== undefined) setLlmMs(st.llmMs);
      if (st.linesEmitted !== undefined) setLinesEmitted(st.linesEmitted);
    },
    []
  );

  const loadPrefs = useCallback(async () => {
    const settingsRes = await window.desktopApi.getSettings();
    if (settingsRes.settings.translationPrefs) {
      setPrefs(settingsRes.settings.translationPrefs);
    }
    setChatFontSize(settingsRes.settings.chatFontSize || 14);
    const ac = settingsRes.settings.audioCapture;
    setCaptureMode(ac?.mode === "microphone" ? "microphone" : "system_loopback");
    applyStatus(await window.desktopApi.getTranslationSessionStatus());
    const ov = await window.desktopApi.getTranslationOverlayVisible();
    setFloatingOverlay(Boolean(ov.visible));
  }, [applyStatus]);

  useEffect(() => {
    void loadPrefs();
    void window.desktopApi.getTranslationConsentText().then((r) => {
      setConsentTextVersion(r.version);
    });
  }, [loadPrefs]);

  useEffect(() => {
    const unsubPartial = window.desktopApi.onTranslationPartial((ev) => {
      setPartials((prev) => {
        const rest = prev.filter((p) => p.itemId !== ev.itemId);
        if (!ev.text) {
          return rest;
        }
        const idx = prev.findIndex((p) => p.itemId === ev.itemId);
        if (idx === -1) {
          return [...prev, { itemId: ev.itemId, text: ev.text }];
        }
        const next = prev.slice();
        next[idx] = { itemId: ev.itemId, text: ev.text };
        return next;
      });
    });
    const unsubLine = window.desktopApi.onTranslationLine((line) => {
      setLines((prev) => [line, ...prev].slice(0, prefs.historyLines || 8));
      if (line.itemId) {
        setPartials((prev) => prev.filter((p) => p.itemId !== line.itemId));
      }
      if (line.sttMs !== undefined) setSttFinalMs(line.sttMs);
      if (line.llmMs !== undefined) setLlmMs(line.llmMs);
    });
    const unsubError = window.desktopApi.onTranslationError((ev) => {
      setError(`${ev.code}: ${ev.message}`);
    });
    const poll = setInterval(() => {
      void window.desktopApi.getTranslationSessionStatus().then(applyStatus);
    }, 2000);
    return () => {
      unsubPartial();
      unsubLine();
      unsubError();
      clearInterval(poll);
    };
  }, [prefs.historyLines, applyStatus]);

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

  async function persistCaptureMode(
    mode: "microphone" | "system_loopback"
  ): Promise<void> {
    await window.desktopApi.saveAudioCapture({ mode, deviceId: "" });
    setCaptureMode(mode);
  }

  async function startStreaming(mode: string): Promise<void> {
    const controller = await startPcmStreamCapture({
      mode,
      onFrame: (pcm) => {
        window.desktopApi.sendTranslationAudioFrame(pcm);
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
    setPartials([]);
    setFirstPartialMs(0);
    setSttFinalMs(0);
    setLlmMs(0);
    setStarting(true);
    try {
      await persistCaptureMode(captureMode);
      const latest = await window.desktopApi.getSettings();
      const nextPrefs = latest.settings.translationPrefs || prefs;
      setPrefs(nextPrefs);
      const started = await window.desktopApi.startTranslationSession({
        sourceLanguage: nextPrefs.sourceLanguage || "en",
        targetLanguage: nextPrefs.targetLanguage || "pt",
        consentAccepted: true,
        consentTextVersion: consentTextVersion || undefined,
      });
      setActive(true);
      setConnection("connecting");
      setFloatingOverlay(false);
      try {
        await startStreaming(started.captureMode || captureMode);
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
      if (floatingOverlay) {
        await window.desktopApi.setTranslationOverlayVisible({ visible: false });
        setFloatingOverlay(false);
      }
      await window.desktopApi.stopTranslationSession();
      setActive(false);
      setConnection("closed");
      setLines([]);
      setPartials([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao parar");
    }
  }

  async function toggleFloatingOverlay(): Promise<void> {
    const next = !floatingOverlay;
    try {
      await window.desktopApi.setTranslationOverlayVisible({ visible: next });
      setFloatingOverlay(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao alternar overlay");
    }
  }

  function handleCopy(): void {
    void (async () => {
      const text = lines
        .slice()
        .reverse()
        .map((l) => (l.originalText ? `${l.originalText}\n${l.translatedText}` : l.translatedText))
        .join("\n\n");
      try {
        await navigator.clipboard.writeText(text);
        setCopyStatus("Copiado");
        setTimeout(() => setCopyStatus(""), 1500);
      } catch {
        setCopyStatus("Falhou");
      }
    })();
  }

  function handleSaveConversation(): void {
    if (lines.length === 0) {
      return;
    }
    const body = lines
      .slice()
      .reverse()
      .map((l) => {
        const ts = l.emittedAtIso || "";
        const orig = l.originalText ? `**Origem:** ${l.originalText}\n` : "";
        return `### ${ts}\n${orig}**Tradução:** ${l.translatedText}\n`;
      })
      .join("\n");
    const md =
      `# Tradução ao vivo\n\n` +
      `- Origem: ${prefs.sourceLanguage || "en"}\n` +
      `- Destino: ${prefs.targetLanguage}\n` +
      `- Gerado em: ${new Date().toISOString()}\n\n` +
      body;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aiga-traducao-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveStatus("Salvo");
    setTimeout(() => setSaveStatus(""), 1500);
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
    userSelect: "auto",
    WebkitUserSelect: "auto",
    WebkitAppRegion: "no-drag",
  } as React.CSSProperties;

  const iconBtn = (disabled?: boolean): React.CSSProperties => ({
    background: C.surface2,
    border: `1px solid ${C.border}`,
    color: disabled ? C.textMuted : C.text,
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    lineHeight: 1,
  });

  const showInlineCaptions = !floatingOverlay;
  const connectionColor =
    connection === "live" ? C.live : connection === "error" ? C.error : C.warn;
  const fmtMs = (ms: number): string => (ms > 0 ? `${ms} ms` : "—");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: expanded ? 16 : 12,
        padding: "8px 0",
        flex: 1,
        minHeight: 0,
        WebkitAppRegion: "no-drag",
      } as React.CSSProperties}
    >
      {active && (
        <div
          style={{
            padding: "8px 12px",
            background: "#122a18",
            border: `1px solid ${C.live}`,
            borderRadius: 8,
            fontSize: 11,
            color: C.live,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>
              Tradução ao vivo · {langLabel(prefs.sourceLanguage || "en")} →{" "}
              {langLabel(prefs.targetLanguage)}
              {stealthEnabled ? " (stealth)" : ""}
            </span>
            <span style={{ color: connectionColor, flexShrink: 0 }}>
              ● {CONNECTION_LABEL[connection]} · {linesEmitted} linhas
            </span>
          </div>
          <span style={{ color: C.textMuted }}>
            parcial {fmtMs(firstPartialMs)} · frase {fmtMs(sttFinalMs)} · tradução{" "}
            {fmtMs(llmMs)}
          </span>
        </div>
      )}

      {active && <AudioCaptureHud level={captureLevel} compact />}

      {!active && (
        <>
          <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.45 }}>
            {langLabel(prefs.sourceLanguage || "en")} → {langLabel(prefs.targetLanguage)}{" "}
            (altere em Configurações → Tradução). A tradução segue a prioridade dos provedores
            de IA.
          </p>
          <label style={{ color: C.textMuted, fontSize: 12 }}>Fonte de áudio</label>
          <select
            value={captureMode}
            onChange={(e) => {
              const mode = e.target.value as "microphone" | "system_loopback";
              setCaptureMode(mode);
              void persistCaptureMode(mode);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={selectStyle}
          >
            <option value="system_loopback">Saída do sistema</option>
            <option value="microphone">Microfone</option>
          </select>
          <button
            type="button"
            disabled={starting}
            onClick={() => void handleStart()}
            style={{
              background: !starting ? C.accent : C.surface2,
              border: "none",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 6,
              cursor: !starting ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {starting && <Spinner />}
            {starting ? "Conectando…" : "Iniciar legendas"}
          </button>
        </>
      )}

      {active && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
          <button
            type="button"
            title={
              floatingOverlay
                ? "Voltar legendas para o AIGA"
                : "Abrir janela flutuante e ocultar legendas no AIGA"
            }
            onClick={() => void toggleFloatingOverlay()}
            style={{
              ...iconBtn(),
              borderColor: floatingOverlay ? C.accent : C.border,
              color: floatingOverlay ? C.accent : C.text,
            }}
          >
            ⧉
            <span style={{ fontSize: 11, marginLeft: 6 }}>
              {floatingOverlay ? "Integrado" : "Flutuante"}
            </span>
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          title="Copiar legendas"
          aria-label="Copiar legendas"
          onClick={handleCopy}
          disabled={lines.length === 0}
          style={iconBtn(lines.length === 0)}
        >
          ⎘
        </button>
        <button
          type="button"
          title="Salvar conversa"
          aria-label="Salvar conversa de tradução"
          onClick={handleSaveConversation}
          disabled={lines.length === 0}
          style={iconBtn(lines.length === 0)}
        >
          ⬇
        </button>
        {copyStatus && <span style={{ color: C.textMuted, fontSize: 11 }}>{copyStatus}</span>}
        {saveStatus && <span style={{ color: C.textMuted, fontSize: 11 }}>{saveStatus}</span>}
      </div>

      {showInlineCaptions && (
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
            fontSize: expanded ? Math.max(chatFontSize, 15) : chatFontSize,
            lineHeight: 1.45,
            userSelect: "text",
            WebkitUserSelect: "text",
            cursor: "text",
          }}
        >
          {lines.length === 0 && partials.length === 0 && (
            <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
              {active ? "Aguardando fala…" : "Nenhuma legenda ainda."}
            </p>
          )}
          {partials
            .slice()
            .reverse()
            .map((p) => (
              <p
                key={`partial-${p.itemId}`}
                style={{ color: C.textMuted, margin: "0 0 10px", fontStyle: "italic" }}
              >
                {p.text}
              </p>
            ))}
          {lines.map((line, idx) => (
            <div key={line.itemId || `${line.emittedAtIso}-${idx}`} style={{ marginBottom: 10 }}>
              {line.originalText && (
                <p style={{ color: C.textMuted, margin: "0 0 4px", fontSize: 11 }}>
                  {line.originalText}
                </p>
              )}
              <p style={{ color: C.text, margin: 0 }}>{line.translatedText}</p>
            </div>
          ))}
        </div>
      )}

      {floatingOverlay && active && (
        <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
          Legendas no overlay flutuante. Use “Integrado” para voltar ao painel do AIGA.
        </p>
      )}

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
