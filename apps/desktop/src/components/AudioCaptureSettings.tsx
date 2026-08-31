import { useCallback, useEffect, useRef, useState } from "react";
import type { FfmpegStatusResponse } from "@clone-perssua/shared-types";
import {
  AudioCaptureHud,
  useMainAudioCaptureLevel,
  type AudioCaptureLevel,
} from "./AudioCaptureHud";

type CaptureMode = "microphone" | "system_loopback" | "output_device";

interface AudioOutputDevice {
  id: string;
  label: string;
}

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
  accent: "#6366f1",
  track: "#2a2a2a",
};

function installStateLabel(state: FfmpegStatusResponse["installState"]): string {
  if (state === "downloading") return "Baixando ffmpeg…";
  if (state === "extracting") return "Extraindo ffmpeg…";
  return "";
}

export function AudioCaptureSettings({
  inputStyle,
  primaryBtn,
  secondaryBtn,
}: AudioCaptureSettingsProps): JSX.Element {
  const [mode, setMode] = useState<CaptureMode>("system_loopback");
  const [deviceId, setDeviceId] = useState("default");
  const [outputs, setOutputs] = useState<AudioOutputDevice[]>([]);
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false);
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatusResponse | null>(null);
  const [platformSupported, setPlatformSupported] = useState(true);
  const [testResult, setTestResult] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [listError, setListError] = useState("");
  const [installMessage, setInstallMessage] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installPercent, setInstallPercent] = useState<number | null>(null);
  const [statusCheckMessage, setStatusCheckMessage] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [saveRecordings, setSaveRecordings] = useState(false);
  const [recordingsPath, setRecordingsPath] = useState("");
  const [defaultRecordingsPath, setDefaultRecordingsPath] = useState("");
  const hydratedRef = useRef(false);
  const liveLevel = useMainAudioCaptureLevel(monitoring);

  const persistCapture = useCallback(
    async (
      nextMode: CaptureMode,
      nextDeviceId: string,
      nextSave?: boolean,
      nextPath?: string
    ) => {
      await window.desktopApi.saveAudioCapture({
        mode: nextMode,
        deviceId: nextMode === "microphone" ? "" : nextDeviceId,
        saveRecordings: nextSave ?? saveRecordings,
        recordingsPath: nextPath ?? recordingsPath,
      });
      setSaveStatus("Perfil de captura salvo.");
    },
    [saveRecordings, recordingsPath]
  );

  const refreshFfmpegStatus = useCallback(async () => {
    try {
      const status = await window.desktopApi.getFfmpegStatus();
      setFfmpegStatus(status);
      setFfmpegAvailable(Boolean(status.available) && status.wasapiSupported !== false);
      return status;
    } catch {
      return null;
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const r = await window.desktopApi.listAudioSources();
      setOutputs(r.outputs || []);
      setFfmpegAvailable(Boolean(r.ffmpegAvailable));
      setPlatformSupported(r.platformSupported !== false);
      setListError(r.error || "");
      await refreshFfmpegStatus();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Falha ao listar dispositivos");
    }
  }, [refreshFfmpegStatus]);

  useEffect(() => {
    void (async () => {
      const [settingsRes, defaults, sources] = await Promise.all([
        window.desktopApi.getSettings(),
        window.desktopApi.getAudioRecordingsDefaults(),
        window.desktopApi.listAudioSources().catch(() => null),
      ]);

      if (sources) {
        setOutputs(sources.outputs || []);
        setPlatformSupported(sources.platformSupported !== false);
        setListError(sources.error || "");
      }
      const status = await refreshFfmpegStatus();
      if (sources && status) {
        setFfmpegAvailable(
          Boolean(status.available) &&
            status.wasapiSupported !== false &&
            sources.ffmpegAvailable !== false
        );
      } else if (sources) {
        setFfmpegAvailable(Boolean(sources.ffmpegAvailable));
      }

      const ac = settingsRes.settings.audioCapture;
      let nextMode = (ac?.mode as CaptureMode) || "system_loopback";
      let nextDeviceId = ac?.deviceId || "default";

      if (nextMode === "output_device" && (!nextDeviceId || nextDeviceId === "")) {
        nextDeviceId = sources?.defaultOutputId || sources?.outputs?.[0]?.id || "default";
        if (nextDeviceId === "default") {
          nextMode = "system_loopback";
        }
      }
      if (nextMode === "system_loopback" && !nextDeviceId) {
        nextDeviceId = "default";
      }

      setMode(nextMode);
      setDeviceId(nextDeviceId);
      setDefaultRecordingsPath(defaults.defaultPath || ac?.defaultRecordingsPath || "");
      setRecordingsPath(ac?.recordingsPath || defaults.recordingsPath || defaults.defaultPath);
      setSaveRecordings(Boolean(ac?.saveRecordings ?? defaults.saveRecordings));

      const needsPersist =
        ac?.mode !== nextMode ||
        (ac?.deviceId || "") !== nextDeviceId ||
        (!ac?.deviceId && nextMode !== "microphone");
      if (needsPersist) {
        await window.desktopApi.saveAudioCapture({
          mode: nextMode,
          deviceId: nextMode === "microphone" ? "" : nextDeviceId,
        });
        setSaveStatus("Captura ajustada para o padrão (saída do sistema).");
      }

      hydratedRef.current = true;
    })();
  }, [refreshFfmpegStatus]);

  useEffect(() => {
    const unsub = window.desktopApi.onFfmpegInstallProgress((ev) => {
      setInstalling(ev.installState === "downloading" || ev.installState === "extracting");
      setInstallPercent(typeof ev.percent === "number" ? ev.percent : null);
      if (ev.message) {
        setInstallMessage(ev.message);
      }
      setFfmpegStatus((prev) =>
        prev
          ? {
              ...prev,
              installState: ev.installState,
              progressPercent: ev.percent ?? prev.progressPercent,
              progressMessage: ev.message || prev.progressMessage,
              lastError: ev.lastError || prev.lastError,
            }
          : prev
      );
    });
    return () => {
      unsub();
      void window.desktopApi.stopAudioCaptureMeter();
    };
  }, []);

  async function handleCheckStatus(): Promise<void> {
    setCheckingStatus(true);
    setStatusCheckMessage("Verificando ffmpeg…");
    try {
      const status = await refreshFfmpegStatus();
      if (!status) {
        setStatusCheckMessage("Não foi possível obter o status do ffmpeg.");
        return;
      }
      const wasapi =
        status.wasapiSupported === true
          ? "WASAPI OK"
          : status.wasapiSupported === false
            ? "sem WASAPI"
            : "WASAPI desconhecido";
      setStatusCheckMessage(
        `${status.available ? "Pronto" : "Indisponível"} · ${wasapi}\n${status.path || "(sem caminho)"}`
      );
      setInstallMessage(status.progressMessage || status.lastError || "");
    } finally {
      setCheckingStatus(false);
    }
  }

  async function handleInstallFfmpeg(force = false): Promise<void> {
    setInstalling(true);
    setInstallPercent(0);
    setInstallMessage(
      force
        ? "Baixando ffmpeg completo (com WASAPI)…"
        : installStateLabel("downloading")
    );
    try {
      const status = await window.desktopApi.installFfmpeg({ force });
      setFfmpegStatus(status);
      setFfmpegAvailable(status.available && status.wasapiSupported !== false);
      setInstallPercent(typeof status.progressPercent === "number" ? status.progressPercent : 100);
      if (status.available && status.wasapiSupported !== false) {
        setInstallMessage(status.progressMessage || "ffmpeg completo instalado com sucesso (WASAPI OK).");
        setListError("");
        await loadSources();
      } else {
        setInstallMessage(
          status.lastError ||
            "Falha ao instalar ffmpeg com WASAPI. Tente novamente ou defina FFMPEG_PATH."
        );
      }
    } catch (e) {
      setInstallMessage(e instanceof Error ? e.message : "Falha ao instalar ffmpeg.");
    } finally {
      setInstalling(false);
    }
  }

  async function handleToggleMonitor(): Promise<void> {
    if (monitoring) {
      await window.desktopApi.stopAudioCaptureMeter();
      setMonitoring(false);
      return;
    }
    await window.desktopApi.startAudioCaptureMeter({
      mode,
      deviceId: mode === "microphone" ? "" : deviceId || "default",
      source: "settings-monitor",
      label:
        mode === "microphone"
          ? "Microfone"
          : mode === "output_device"
            ? "Dispositivo de saída"
            : "Saída do sistema",
    });
    setMonitoring(true);
  }

  async function handleTest(): Promise<void> {
    if (monitoring) {
      await window.desktopApi.stopAudioCaptureMeter();
      setMonitoring(false);
    }
    setTestResult("Testando…");
    const r = await window.desktopApi.testAudioSource({
      mode,
      deviceId: mode === "microphone" ? undefined : deviceId || "default",
    });
    setTestResult(r.ok ? `✓ ${r.message}` : `✗ ${r.message}`);
  }

  async function handleModeChange(nextMode: CaptureMode): Promise<void> {
    const nextDeviceId =
      nextMode === "microphone"
        ? ""
        : deviceId && deviceId !== ""
          ? deviceId
          : outputs[0]?.id || "default";
    setMode(nextMode);
    setDeviceId(nextDeviceId || "default");
    if (hydratedRef.current) {
      await persistCapture(nextMode, nextDeviceId || "default");
    }
  }

  async function handleDeviceChange(nextDeviceId: string): Promise<void> {
    setDeviceId(nextDeviceId);
    if (hydratedRef.current) {
      await persistCapture(mode, nextDeviceId);
    }
  }

  const needsFfmpegFix =
    platformSupported &&
    (!ffmpegAvailable || ffmpegStatus?.wasapiSupported === false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
        Windows 10/11: use <strong>saída do sistema</strong> para capturar áudio do Teams/alto-falante.
        Requer <code>ffmpeg</code> com suporte <strong>WASAPI</strong> (build completo — o essentials não
        serve). Alterações são salvas automaticamente.
      </p>

      {!platformSupported && (
        <p style={{ color: C.error, fontSize: 12 }}>Loopback só está disponível no Windows.</p>
      )}

      {platformSupported && (
        <div
          style={{
            border: `1px solid ${needsFfmpegFix ? C.error : C.border}`,
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>ffmpeg (captura do sistema)</span>
          <p
            style={{
              color: needsFfmpegFix ? C.error : C.textMuted,
              fontSize: 12,
              margin: 0,
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          >
            {needsFfmpegFix
              ? listError ||
                ffmpegStatus?.lastError ||
                "ffmpeg ausente ou sem WASAPI. Use o botão abaixo para baixar o build completo (~160 MB)."
              : "WASAPI OK — pronto para capturar a saída do sistema."}
          </p>
          {ffmpegStatus?.path && (
            <p style={{ color: C.textMuted, fontSize: 11, margin: 0, userSelect: "text" }}>
              Atual: <code>{ffmpegStatus.path}</code>
              {ffmpegStatus.wasapiSupported === false
                ? " (sem WASAPI)"
                : ffmpegStatus.wasapiSupported
                  ? " (WASAPI OK)"
                  : ""}
            </p>
          )}
          {ffmpegStatus?.managedPath && (
            <p style={{ color: C.textMuted, fontSize: 11, margin: 0, userSelect: "text" }}>
              Destino da instalação: <code>{ffmpegStatus.managedPath}</code>
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={primaryBtn}
              disabled={installing}
              onClick={() => void handleInstallFfmpeg(true)}
            >
              {installing
                ? installPercent != null
                  ? `Instalando… ${installPercent}%`
                  : "Baixando ffmpeg completo (~160 MB)…"
                : needsFfmpegFix
                  ? "Instalar / reinstalar ffmpeg completo (WASAPI)"
                  : "Reinstalar ffmpeg completo (WASAPI)"}
            </button>
            <button
              type="button"
              style={secondaryBtn}
              disabled={installing || checkingStatus}
              onClick={() => void handleCheckStatus()}
            >
              {checkingStatus ? "Verificando…" : "Verificar status"}
            </button>
          </div>
          {installing && (
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: C.track,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(2, installPercent ?? 5)}%`,
                  height: "100%",
                  background: C.accent,
                  transition: "width 200ms linear",
                }}
              />
            </div>
          )}
          {statusCheckMessage && (
            <pre
              style={{
                color: C.textMuted,
                fontSize: 11,
                margin: 0,
                whiteSpace: "pre-wrap",
                userSelect: "text",
              }}
            >
              {statusCheckMessage}
            </pre>
          )}
          {installMessage && (
            <p
              style={{
                color: installMessage.toLowerCase().includes("ok") || installMessage.includes("sucesso")
                  ? C.success
                  : installing
                    ? C.textMuted
                    : C.error,
                fontSize: 12,
                margin: 0,
                userSelect: "text",
              }}
            >
              {installMessage}
            </p>
          )}
        </div>
      )}

      <label style={{ color: C.textMuted, fontSize: 12 }}>Modo de captura</label>
      <select
        value={mode}
        onChange={(e) => void handleModeChange(e.target.value as CaptureMode)}
        style={inputStyle}
      >
        <option value="system_loopback">Saída do sistema (padrão — recomendado)</option>
        <option value="output_device">Dispositivo de saída específico</option>
        <option value="microphone">Microfone</option>
      </select>

      {mode !== "microphone" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ color: C.textMuted, fontSize: 12, flex: 1 }}>
              Dispositivo de saída {mode === "system_loopback" ? "(opcional)" : "(obrigatório)"}
            </label>
            <button type="button" style={secondaryBtn} onClick={() => void loadSources()}>
              Atualizar lista
            </button>
          </div>
          <select
            value={deviceId || "default"}
            onChange={(e) => void handleDeviceChange(e.target.value)}
            style={inputStyle}
          >
            <option value="default">Padrão do Windows</option>
            {outputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
            Salvo automaticamente. Usado na tradução ao vivo e no modo reunião.
          </p>
        </>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={secondaryBtn} onClick={() => void handleTest()}>
          Testar fonte (3s)
        </button>
        <button type="button" style={secondaryBtn} onClick={() => void handleToggleMonitor()}>
          {monitoring ? "Parar medidor ao vivo" : "Medidor ao vivo (dB)"}
        </button>
      </div>
      {(monitoring || liveLevel) && (
        <AudioCaptureHud
          level={
            (liveLevel as AudioCaptureLevel | null) || {
              capturing: true,
              mode,
              label: "Aguardando níveis…",
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
          Quando ativo, salva os chunks de captura (reunião/entrevista/tradução) em disco.
          Padrão da aplicação: pasta em dados do usuário.
        </p>
        <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={saveRecordings}
            onChange={(e) => {
              const next = e.target.checked;
              setSaveRecordings(next);
              if (hydratedRef.current) {
                void persistCapture(mode, deviceId, next, recordingsPath);
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
                  await persistCapture(mode, deviceId, saveRecordings, picked.path);
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
              const fallback = defaultRecordingsPath;
              setRecordingsPath(fallback);
              if (hydratedRef.current) {
                void persistCapture(mode, deviceId, saveRecordings, "");
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
