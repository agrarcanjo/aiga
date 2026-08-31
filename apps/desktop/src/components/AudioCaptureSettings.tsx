import { useCallback, useEffect, useRef, useState } from "react";
import { AudioCaptureHud, useMicrophoneLevel } from "./AudioCaptureHud";
import { openCaptureStream, stopMediaStream, testCaptureSource } from "../lib/systemAudioCapture";

type CaptureMode = "microphone" | "system_loopback";

interface AudioCaptureSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

const C = {
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  error: "#ef4444",
};

function modeLabel(mode: CaptureMode): string {
  return mode === "microphone" ? "Microfone" : "Saída do sistema";
}

export function AudioCaptureSettings({
  inputStyle,
  primaryBtn,
  secondaryBtn,
}: AudioCaptureSettingsProps): JSX.Element {
  const [mode, setMode] = useState<CaptureMode>("system_loopback");
  const [platformSupported, setPlatformSupported] = useState(true);
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [monitorStream, setMonitorStream] = useState<MediaStream | null>(null);
  const [saveRecordings, setSaveRecordings] = useState(false);
  const [recordingsPath, setRecordingsPath] = useState("");
  const [defaultRecordingsPath, setDefaultRecordingsPath] = useState("");
  const hydratedRef = useRef(false);
  const monitorSourceRef = useRef<MediaStream | null>(null);

  const liveLevel = useMicrophoneLevel(monitorStream, monitoring, {
    mode,
    label: modeLabel(mode),
  });

  const persistCapture = useCallback(
    async (nextMode: CaptureMode, nextSave?: boolean, nextPath?: string) => {
      await window.desktopApi.saveAudioCapture({
        mode: nextMode,
        deviceId: "",
        saveRecordings: nextSave ?? saveRecordings,
        recordingsPath: nextPath ?? recordingsPath,
      });
      setSaveStatus("Perfil de captura salvo.");
    },
    [saveRecordings, recordingsPath]
  );

  const stopMonitor = useCallback(() => {
    stopMediaStream(monitorSourceRef.current);
    monitorSourceRef.current = null;
    setMonitorStream(null);
    setMonitoring(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const [settingsRes, defaults, sources] = await Promise.all([
        window.desktopApi.getSettings(),
        window.desktopApi.getAudioRecordingsDefaults(),
        window.desktopApi.listAudioSources().catch(() => null),
      ]);

      if (sources) {
        setPlatformSupported(sources.platformSupported !== false);
      }

      const ac = settingsRes.settings.audioCapture;
      const nextMode: CaptureMode = ac?.mode === "microphone" ? "microphone" : "system_loopback";

      setMode(nextMode);
      setDefaultRecordingsPath(defaults.defaultPath || "");
      setRecordingsPath(ac?.recordingsPath || defaults.recordingsPath || defaults.defaultPath);
      setSaveRecordings(Boolean(ac?.saveRecordings ?? defaults.saveRecordings));

      if (ac?.mode !== nextMode || (ac?.deviceId || "") !== "") {
        await window.desktopApi.saveAudioCapture({ mode: nextMode, deviceId: "" });
      }

      hydratedRef.current = true;
    })();
  }, []);

  useEffect(() => stopMonitor, [stopMonitor]);

  async function handleToggleMonitor(): Promise<void> {
    if (monitoring) {
      stopMonitor();
      return;
    }
    try {
      const opened = await openCaptureStream(mode);
      monitorSourceRef.current = opened.stream;
      setMonitorStream(opened.audioStream);
      setMonitoring(true);
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : "Falha ao abrir a fonte."}`);
    }
  }

  async function handleTest(): Promise<void> {
    if (monitoring) {
      stopMonitor();
    }
    setTesting(true);
    setTestResult("Testando… reproduza áudio na fonte selecionada.");
    try {
      const r = await testCaptureSource(mode, mode === "microphone" ? 2000 : 3000);
      setTestResult(r.ok ? `✓ ${r.message}` : `✗ ${r.message}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleModeChange(nextMode: CaptureMode): Promise<void> {
    if (monitoring) {
      stopMonitor();
    }
    setMode(nextMode);
    setTestResult("");
    if (hydratedRef.current) {
      await persistCapture(nextMode);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
        A captura da <strong>saída do sistema</strong> (Teams/Meet/Zoom no alto-falante) usa o
        compartilhamento de áudio do próprio Electron — não depende de <code>ffmpeg</code>. O áudio
        capturado é o do <strong>dispositivo de reprodução padrão do Windows</strong>. Alterações são
        salvas automaticamente.
      </p>

      {!platformSupported && (
        <p style={{ color: C.error, fontSize: 12 }}>
          Captura da saída do sistema disponível apenas no Windows.
        </p>
      )}

      <label style={{ color: C.textMuted, fontSize: 12 }}>Modo de captura</label>
      <select
        value={mode}
        onChange={(e) => void handleModeChange(e.target.value as CaptureMode)}
        style={inputStyle}
      >
        <option value="system_loopback">Saída do sistema (padrão — recomendado)</option>
        <option value="microphone">Microfone</option>
      </select>

      {mode === "system_loopback" && (
        <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
          Para trocar a fonte, altere o dispositivo de reprodução padrão em Windows → Configurações →
          Sistema → Som.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primaryBtn} disabled={testing} onClick={() => void handleTest()}>
          {testing ? "Testando…" : "Testar fonte (3s)"}
        </button>
        <button type="button" style={secondaryBtn} onClick={() => void handleToggleMonitor()}>
          {monitoring ? "Parar medidor ao vivo" : "Medidor ao vivo (dB)"}
        </button>
      </div>

      {monitoring && (
        <AudioCaptureHud
          level={
            liveLevel || {
              capturing: true,
              mode,
              label: modeLabel(mode),
              dbFs: -90,
              peakDbFs: -90,
            }
          }
        />
      )}

      <div
        style={{
          borderTop: `1px solid ${C.border}`,
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Áudios de reunião</span>
        <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
          Quando ativo, salva os chunks de captura (reunião/entrevista/tradução) em disco. Padrão da
          aplicação: pasta em dados do usuário.
        </p>
        <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={saveRecordings}
            onChange={(e) => {
              const next = e.target.checked;
              setSaveRecordings(next);
              if (hydratedRef.current) {
                void persistCapture(mode, next, recordingsPath);
              }
            }}
          />
          Salvar áudios das sessões com captura
        </label>
        <label style={{ color: C.textMuted, fontSize: 12 }}>Pasta de gravações</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            value={recordingsPath || defaultRecordingsPath}
            readOnly
            style={{ ...inputStyle, flex: 1, minWidth: 220 }}
            title={recordingsPath || defaultRecordingsPath}
          />
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => {
              void (async () => {
                const picked = await window.desktopApi.pickAudioRecordingsFolder();
                if (picked.canceled || !picked.path) return;
                setRecordingsPath(picked.path);
                if (hydratedRef.current) {
                  await persistCapture(mode, saveRecordings, picked.path);
                }
              })();
            }}
          >
            Escolher pasta…
          </button>
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => {
              setRecordingsPath(defaultRecordingsPath);
              if (hydratedRef.current) {
                void persistCapture(mode, saveRecordings, "");
              }
            }}
          >
            Usar padrão
          </button>
        </div>
        {defaultRecordingsPath && (
          <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
            Padrão: <code>{defaultRecordingsPath}</code>
          </p>
        )}
      </div>

      {testResult && (
        <p
          style={{
            color: testResult.startsWith("✓") ? C.success : C.error,
            fontSize: 12,
            margin: 0,
            userSelect: "text",
            WebkitUserSelect: "text",
            cursor: "text",
            whiteSpace: "pre-wrap",
          }}
        >
          {testResult}
        </p>
      )}
      {saveStatus && <p style={{ color: C.success, fontSize: 12, margin: 0 }}>{saveStatus}</p>}
    </div>
  );
}
