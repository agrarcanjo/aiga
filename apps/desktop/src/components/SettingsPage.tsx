import { useCallback, useEffect, useState } from "react";
import type { LogLevel, SetupChecklistItem, SetupChecklistResponse } from "@clone-perssua/shared-types";
import { AudioCaptureSettings } from "./AudioCaptureSettings";
import { ScreenCaptureSettings } from "./ScreenCaptureSettings";
import { AutoUpdateSettings } from "./AutoUpdateSettings";
import { EnvironmentSettings } from "./EnvironmentSettings";
import { FeatureFlagsSettings } from "./FeatureFlagsSettings";
import { LlmProvidersSettings } from "./LlmProvidersSettings";
import { MeetingSettings } from "./MeetingSettings";
import { TranslationSettings } from "./TranslationSettings";
import { SetupNoticeBanner } from "./SetupNoticeBanner";

const C = {
  surface: "#1a1a1a",
  surface2: "#242424",
  border: "#2e2e2e",
  accent: "#6366f1",
  text: "#e5e5e5",
  textMuted: "#888",
  textDim: "#555",
  success: "#22c55e",
  error: "#ef4444",
  warn: "#f59e0b",
  bg: "#0f0f0f",
};

const CODE_LANGUAGE_OPTIONS = [
  { id: "java", label: "Java" },
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "csharp", label: "C#" },
  { id: "cpp", label: "C++" },
  { id: "go", label: "Go" },
  { id: "kotlin", label: "Kotlin" },
  { id: "rust", label: "Rust" },
  { id: "ruby", label: "Ruby" },
  { id: "swift", label: "Swift" },
] as const;

export type SettingsTabId =
  | "general"
  | "meeting"
  | "translation"
  | "api"
  | "ia"
  | "environment"
  | "flags"
  | "audio"
  | "screen"
  | "microphone"
  | "resources"
  | "shortcuts"
  | "updates"
  | "logs";

const NAV: { id: SettingsTabId; label: string }[] = [
  { id: "general", label: "Geral" },
  { id: "meeting", label: "Reunião" },
  { id: "translation", label: "Tradução" },
  { id: "api", label: "API Gemini" },
  { id: "ia", label: "Provedores IA" },
  { id: "environment", label: "Ambiente" },
  { id: "flags", label: "Feature flags" },
  { id: "audio", label: "Captura áudio" },
  { id: "screen", label: "Captura tela" },
  { id: "microphone", label: "Microfone" },
  { id: "resources", label: "Recursos (chat)" },
  { id: "shortcuts", label: "Atalhos" },
  { id: "updates", label: "Atualizações" },
  { id: "logs", label: "Logs" },
];

function inputStyle(): React.CSSProperties {
  return {
    background: C.surface2,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    padding: "8px 10px",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  };
}

function primaryBtn(): React.CSSProperties {
  return {
    background: C.accent,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    alignSelf: "flex-start",
  };
}

function secondaryBtn(): React.CSSProperties {
  return {
    background: C.surface2,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 13,
    alignSelf: "flex-start",
  };
}

interface ResourceToggleProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ResourceToggle({ label, description, value, onChange }: ResourceToggleProps): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          flexShrink: 0,
          marginTop: 2,
          width: 36,
          height: 20,
          borderRadius: 10,
          background: value ? C.accent : C.surface2,
          border: `1px solid ${value ? C.accent : C.border}`,
          cursor: "pointer",
          position: "relative",
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: value ? 18 : 2,
            width: 14,
            height: 14,
            background: "#fff",
            borderRadius: "50%",
            display: "block",
          }}
        />
      </button>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{label}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
    </div>
  );
}

export interface SettingsPageProps {
  initialTab?: SettingsTabId;
  onClose: () => void;
  opacity: number;
  onOpacityChange: (value: number) => void;
  autoScroll: boolean;
  onAutoScrollChange: (v: boolean) => void;
  selectToPrompt: boolean;
  onSelectToPromptChange: (v: boolean) => void;
  quickAnalysis: boolean;
  onQuickAnalysisChange: (v: boolean) => void;
  onSettingsChanged?: () => void;
}

export function SettingsPage({
  initialTab = "general",
  onClose,
  opacity,
  onOpacityChange,
  autoScroll,
  onAutoScrollChange,
  selectToPrompt,
  onSelectToPromptChange,
  quickAnalysis,
  onQuickAnalysisChange,
  onSettingsChanged,
}: SettingsPageProps): JSX.Element {
  const [tab, setTab] = useState<SettingsTabId>(initialTab);

  const [nonStealthModeEnabled, setNonStealthModeEnabled] = useState(false);
  const [defaultCodeLanguage, setDefaultCodeLanguage] = useState("java");
  const [generalStatus, setGeneralStatus] = useState("");

  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [hasGeminiApiKey, setHasGeminiApiKey] = useState(false);
  const [apiStatus, setApiStatus] = useState("");

  const [audioDevices, setAudioDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [savedMicLabel, setSavedMicLabel] = useState("");
  const [micStatus, setMicStatus] = useState("");

  const [captureShortcut, setCaptureShortcut] = useState("Ctrl+E");
  const [pushToTalkShortcut, setPushToTalkShortcut] = useState("Ctrl+D");
  const [fullStealthShortcut, setFullStealthShortcut] = useState("Ctrl+Shift+H");
  const [shortcutStatus, setShortcutStatus] = useState("");

  const [recentLogs, setRecentLogs] = useState<string[]>([]);
  const [logLevel, setLogLevel] = useState<LogLevel>("info");
  const [purgeStatus, setPurgeStatus] = useState("");
  const [checklist, setChecklist] = useState<SetupChecklistResponse | null>(null);

  const loadChecklist = useCallback(async () => {
    try {
      const c = await window.desktopApi.getSetupChecklist();
      setChecklist(c);
    } catch {
      setChecklist(null);
    }
  }, []);

  const load = useCallback(async () => {
    const r = await window.desktopApi.getSettings();
    setNonStealthModeEnabled(Boolean(r.settings.nonStealthModeEnabled));
    setDefaultCodeLanguage(r.settings.defaultCodeLanguage || "java");
    setHasGeminiApiKey(r.settings.hasGeminiApiKey);
    setCaptureShortcut(r.settings.shortcuts.captureScreen);
    setPushToTalkShortcut(r.settings.shortcuts.pushToTalk);
    setFullStealthShortcut(r.settings.shortcuts.toggleFullStealth || "Ctrl+Shift+H");
    setSelectedDeviceId(r.settings.selectedAudioInputDeviceId || "");
    setSavedMicLabel(r.settings.selectedAudioInputDeviceLabel || "");
    const diag = await window.desktopApi.getDiagnostics();
    setRecentLogs(diag.recentLines || []);
    setLogLevel(diag.logLevel);
    await loadChecklist();
  }, [loadChecklist]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void loadChecklist();
  }, [tab, loadChecklist]);

  const hydrateMicrophoneTab = useCallback(async () => {
    const r = await window.desktopApi.getSettings();
    const savedId = r.settings.selectedAudioInputDeviceId || "";
    const savedLabel = r.settings.selectedAudioInputDeviceLabel || "";
    setSelectedDeviceId(savedId);
    setSavedMicLabel(savedLabel);

    if (savedId) {
      setAudioDevices([{ deviceId: savedId, label: savedLabel || "Microfone salvo" }]);
    }

    try {
      let devices = await globalThis.navigator.mediaDevices.enumerateDevices();
      let inputs = devices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || "Microfone" }));

      const needsPermission =
        inputs.length === 0 || inputs.every((d) => !d.label || d.label === "Microfone");

      if (needsPermission) {
        try {
          const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          devices = await globalThis.navigator.mediaDevices.enumerateDevices();
          inputs = devices
            .filter((d) => d.kind === "audioinput")
            .map((d) => ({ deviceId: d.deviceId, label: d.label || "Microfone" }));
        } catch {
          if (savedId) {
            setMicStatus(
              `Microfone salvo: ${savedLabel || savedId}. Clique abaixo para atualizar a lista.`
            );
            return;
          }
          setMicStatus("Permissão de microfone negada.");
          return;
        }
      }

      if (savedId && !inputs.some((d) => d.deviceId === savedId)) {
        inputs.push({
          deviceId: savedId,
          label: savedLabel || "Microfone salvo (desconectado?)",
        });
      }

      setAudioDevices(inputs);
      if (savedId) {
        setMicStatus(`Microfone atual: ${savedLabel || savedId}`);
      } else {
        setMicStatus(`${inputs.length} dispositivo(s) encontrado(s).`);
      }
    } catch {
      if (savedId) {
        setMicStatus(`Microfone salvo: ${savedLabel || savedId}`);
      } else {
        setMicStatus("Não foi possível listar dispositivos de microfone.");
      }
    }
  }, []);

  useEffect(() => {
    if (tab === "microphone") {
      void hydrateMicrophoneTab();
    }
  }, [tab, hydrateMicrophoneTab]);

  async function saveGeneral(): Promise<void> {
    await window.desktopApi.saveSettings({
      nonStealthModeEnabled,
      defaultCodeLanguage,
    });
    setGeneralStatus("Configurações gerais salvas.");
    onSettingsChanged?.();
    await load();
    await loadChecklist();
  }

  async function saveApi(): Promise<void> {
    await window.desktopApi.saveSettings({ geminiApiKey: geminiApiKey.trim() || null });
    setApiStatus("API Key salva.");
    setGeminiApiKey("");
    onSettingsChanged?.();
    await load();
    await loadChecklist();
  }

  async function loadAudioDevices(): Promise<void> {
    await hydrateMicrophoneTab();
  }

  async function saveMic(): Promise<void> {
    const label =
      audioDevices.find((d) => d.deviceId === selectedDeviceId)?.label || savedMicLabel || "";
    await window.desktopApi.saveSettings({
      selectedAudioInputDeviceId: selectedDeviceId || null,
      selectedAudioInputDeviceLabel: label || null,
    });
    setMicStatus("Microfone salvo.");
    setSavedMicLabel(label);
    onSettingsChanged?.();
    await loadChecklist();
  }

  async function saveShortcuts(): Promise<void> {
    await window.desktopApi.saveSettings({
      shortcuts: {
        captureScreen: captureShortcut,
        pushToTalk: pushToTalkShortcut,
        toggleFullStealth: fullStealthShortcut,
      },
    });
    setShortcutStatus("Atalhos salvos. Reinicie o app para aplicar.");
    onSettingsChanged?.();
  }

  async function runPurge(): Promise<void> {
    const r = await window.desktopApi.runRetentionPurge();
    setPurgeStatus(
      `Purge: ${r.deletedFiles} arquivo(s) removido(s), retenção ${r.retentionDays} dias.`
    );
  }

  const is = inputStyle();
  const pb = primaryBtn();
  const sb = secondaryBtn();

  function tabPending(tabId: string): SetupChecklistItem[] {
    return (checklist?.byTab?.[tabId] || []).filter((item) => !item.ready);
  }

  function goToTab(nextTab: string): void {
    if (NAV.some((n) => n.id === nextTab)) {
      setTab(nextTab as SettingsTabId);
    }
  }

  const globalPending = checklist?.pendingRequired || [];
  const currentTabPending = tabPending(tab);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        overflow: "hidden",
        background: C.surface,
      }}
    >
      <nav
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          overflowY: "auto",
          padding: "10px 0",
          background: C.bg,
        }}
      >
        {NAV.map(({ id, label }) => {
          const pendingCount = tabPending(id).length;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                display: "flex",
                width: "100%",
                textAlign: "left",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                background: tab === id ? C.surface2 : "transparent",
                border: "none",
                borderLeft: tab === id ? `3px solid ${C.accent}` : "3px solid transparent",
                color: tab === id ? C.accent : C.textMuted,
                padding: "11px 16px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: tab === id ? 600 : 400,
              }}
            >
              <span>{label}</span>
              {pendingCount > 0 && (
                <span
                  style={{
                    background: C.warn,
                    color: "#111",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    minWidth: 16,
                    height: 16,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18, color: C.text }}>
            {NAV.find((n) => n.id === tab)?.label}
          </h1>
          <button type="button" style={sb} onClick={onClose}>
            Voltar ao chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 28px" }}>
          {tab === "general" && globalPending.length > 0 && (
            <SetupNoticeBanner items={globalPending} onGoToTab={goToTab} />
          )}
          {tab !== "general" && currentTabPending.length > 0 && (
            <SetupNoticeBanner items={currentTabPending} onGoToTab={goToTab} />
          )}

          {tab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
              <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                Comportamento da janela, linguagem de código e opacidade no modo stealth.
              </p>
              <label style={{ display: "flex", gap: 10, fontSize: 13, color: C.text }}>
                <input
                  type="checkbox"
                  checked={nonStealthModeEnabled}
                  onChange={(e) => setNonStealthModeEnabled(e.target.checked)}
                  style={{ accentColor: C.accent }}
                />
                <span>
                  <strong>Modo não-stealth</strong>
                  <br />
                  <span style={{ color: C.textMuted, fontSize: 12 }}>
                    Janela opaca, na barra de tarefas, sem proteção de conteúdo.
                  </span>
                </span>
              </label>
              <label style={{ color: C.textMuted, fontSize: 12 }}>Linguagem padrão para código</label>
              <select
                value={defaultCodeLanguage}
                onChange={(e) => setDefaultCodeLanguage(e.target.value)}
                style={is}
              >
                {CODE_LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <label style={{ color: C.textMuted, fontSize: 12 }}>
                Opacidade stealth: {Math.round(opacity * 100)}%
              </label>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={Math.round(opacity * 100)}
                onChange={(e) => void onOpacityChange(Number(e.target.value) / 100)}
                style={{ width: "100%", accentColor: C.accent }}
              />
              <button type="button" style={pb} onClick={() => void saveGeneral()}>
                Salvar geral
              </button>
              {generalStatus && <span style={{ color: C.success, fontSize: 12 }}>{generalStatus}</span>}
            </div>
          )}

          {tab === "meeting" && (
            <div style={{ maxWidth: 720 }}>
              <MeetingSettings inputStyle={is} primaryBtn={pb} secondaryBtn={sb} />
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={sb} onClick={() => void runPurge()}>
                  Executar purge de retenção agora
                </button>
                {purgeStatus && (
                  <span style={{ color: C.textMuted, fontSize: 11, alignSelf: "center" }}>
                    {purgeStatus}
                  </span>
                )}
              </div>
            </div>
          )}

          {tab === "translation" && (
            <div style={{ maxWidth: 560 }}>
              <TranslationSettings inputStyle={is} primaryBtn={pb} secondaryBtn={sb} />
            </div>
          )}

          {tab === "ia" && (
            <div style={{ maxWidth: 640 }}>
              <LlmProvidersSettings inputStyle={is} primaryBtn={pb} />
            </div>
          )}

          {tab === "environment" && (
            <div style={{ maxWidth: 720 }}>
              <EnvironmentSettings secondaryBtn={sb} />
            </div>
          )}

          {tab === "flags" && (
            <div style={{ maxWidth: 560 }}>
              <FeatureFlagsSettings inputStyle={is} primaryBtn={pb} secondaryBtn={sb} />
            </div>
          )}

          {tab === "audio" && (
            <div style={{ maxWidth: 560 }}>
              <AudioCaptureSettings inputStyle={is} primaryBtn={pb} secondaryBtn={sb} />
            </div>
          )}

          {tab === "screen" && (
            <div style={{ maxWidth: 560 }}>
              <ScreenCaptureSettings inputStyle={is} primaryBtn={pb} secondaryBtn={sb} />
            </div>
          )}

          {tab === "api" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
              <span style={{ fontSize: 11, color: hasGeminiApiKey ? C.success : C.error, fontWeight: 600 }}>
                {hasGeminiApiKey ? "✓ API Key configurada" : "✗ API Key não configurada"}
              </span>
              <label style={{ color: C.textMuted, fontSize: 12 }}>Gemini API Key</label>
              <input
                type="password"
                placeholder="AIza…"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                style={is}
              />
              <button
                type="button"
                disabled={!geminiApiKey.trim()}
                style={{ ...pb, opacity: geminiApiKey.trim() ? 1 : 0.5 }}
                onClick={() => void saveApi()}
              >
                Salvar API
              </button>
              {apiStatus && <span style={{ color: C.success, fontSize: 12 }}>{apiStatus}</span>}
            </div>
          )}

          {tab === "microphone" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
              {savedMicLabel && selectedDeviceId && (
                <p style={{ color: C.text, fontSize: 13, margin: 0 }}>
                  Microfone salvo: <strong>{savedMicLabel}</strong>
                </p>
              )}
              <button type="button" style={sb} onClick={() => void loadAudioDevices()}>
                Atualizar lista de dispositivos
              </button>
              {micStatus && <span style={{ color: C.textMuted, fontSize: 12 }}>{micStatus}</span>}
              {(audioDevices.length > 0 || selectedDeviceId) && (
                <>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    style={is}
                  >
                    {audioDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" style={pb} onClick={() => void saveMic()}>
                    Salvar microfone
                  </button>
                </>
              )}
            </div>
          )}

          {tab === "resources" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
              <ResourceToggle
                label="Rolagem automática"
                description="Rola a conversa para a mensagem mais recente."
                value={autoScroll}
                onChange={onAutoScrollChange}
              />
              <ResourceToggle
                label="Selecionar para prompt"
                description="Ctrl+C com texto selecionado preenche o campo de pergunta."
                value={selectToPrompt}
                onChange={onSelectToPromptChange}
              />
              <ResourceToggle
                label="Análise rápida de screenshots"
                description="Captura envia imediatamente com prompt pré-definido."
                value={quickAnalysis}
                onChange={onQuickAnalysisChange}
              />
            </div>
          )}

          {tab === "shortcuts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 400 }}>
              {(
                [
                  ["Captura de tela", captureShortcut, setCaptureShortcut],
                  ["Push-to-talk", pushToTalkShortcut, setPushToTalkShortcut],
                  ["Full stealth", fullStealthShortcut, setFullStealthShortcut],
                ] as [string, string, (v: string) => void][]
              ).map(([label, value, setter]) => (
                <div key={label}>
                  <label style={{ color: C.textMuted, fontSize: 12 }}>{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    style={{ ...is, marginTop: 4 }}
                  />
                </div>
              ))}
              <button type="button" style={pb} onClick={() => void saveShortcuts()}>
                Salvar atalhos
              </button>
              {shortcutStatus && <span style={{ color: C.success, fontSize: 12 }}>{shortcutStatus}</span>}
            </div>
          )}

          {tab === "updates" && (
            <div style={{ maxWidth: 640 }}>
              <AutoUpdateSettings inputStyle={is} primaryBtn={pb} secondaryBtn={sb} />
            </div>
          )}

          {tab === "logs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 800 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={logLevel}
                  onChange={async (e) => {
                    const next = e.target.value as LogLevel;
                    setLogLevel(next);
                    await window.desktopApi.setLogLevel({ level: next });
                    await load();
                  }}
                  style={{ ...is, width: "auto" }}
                >
                  {(["debug", "info", "warn", "error"] as LogLevel[]).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <button type="button" style={sb} onClick={() => void load()}>
                  Atualizar
                </button>
              </div>
              <pre
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 11,
                  color: C.textMuted,
                  maxHeight: 420,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
              >
                {recentLogs.length === 0
                  ? "Nenhum log disponível."
                  : recentLogs.slice(-80).join("\n")}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
