import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayInfo, ScreenCaptureMode } from "@clone-perssua/shared-types";

interface ScreenCaptureSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

const C = {
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  error: "#ef4444",
};

export function ScreenCaptureSettings({
  inputStyle,
  secondaryBtn,
}: ScreenCaptureSettingsProps): JSX.Element {
  const [mode, setMode] = useState<ScreenCaptureMode>("primary");
  const [displayId, setDisplayId] = useState("");
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const hydratedRef = useRef(false);

  const persist = useCallback(async (nextMode: ScreenCaptureMode, nextDisplayId: string) => {
    await window.desktopApi.saveScreenCapture({
      mode: nextMode,
      displayId: nextMode === "specific_display" ? nextDisplayId : "",
    });
    setStatus("Preferência de captura de tela salva.");
  }, []);

  const loadDisplays = useCallback(async () => {
    try {
      const r = await window.desktopApi.listDisplays();
      setDisplays(r.displays || []);
      setError("");
      return r.displays || [];
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao listar telas");
      return [];
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const listed = await loadDisplays();
      const settings = await window.desktopApi.getSettings();
      const sc = settings.settings.screenCapture;
      const nextMode = (sc?.mode as ScreenCaptureMode) || "primary";
      let nextDisplayId = sc?.displayId || "";

      if (nextMode === "specific_display" && !nextDisplayId) {
        nextDisplayId = listed.find((d) => d.isPrimary)?.id || listed[0]?.id || "";
      }

      setMode(nextMode);
      setDisplayId(nextDisplayId);
      hydratedRef.current = true;
    })();
  }, [loadDisplays]);

  async function handleModeChange(nextMode: ScreenCaptureMode): Promise<void> {
    setMode(nextMode);
    let nextDisplayId = displayId;
    if (nextMode === "specific_display" && !nextDisplayId) {
      nextDisplayId = displays.find((d) => d.isPrimary)?.id || displays[0]?.id || "";
      setDisplayId(nextDisplayId);
    }
    if (hydratedRef.current) {
      await persist(nextMode, nextDisplayId);
    }
  }

  async function handleDisplayChange(nextDisplayId: string): Promise<void> {
    setDisplayId(nextDisplayId);
    if (hydratedRef.current) {
      await persist(mode, nextDisplayId);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
        Escolha qual monitor usar na captura de tela (atalho ou botão). Com várias telas, evite
        capturar tudo sem querer.
      </p>

      <label style={{ color: C.textMuted, fontSize: 12 }}>Modo de captura</label>
      <select
        value={mode}
        onChange={(e) => void handleModeChange(e.target.value as ScreenCaptureMode)}
        style={inputStyle}
      >
        <option value="primary">Somente tela principal</option>
        <option value="specific_display">Tela específica</option>
        <option value="all_displays">Todas as telas</option>
      </select>

      {mode === "specific_display" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ color: C.textMuted, fontSize: 12, flex: 1 }}>Tela</label>
            <button type="button" style={secondaryBtn} onClick={() => void loadDisplays()}>
              Atualizar lista
            </button>
          </div>
          <select
            value={displayId}
            onChange={(e) => void handleDisplayChange(e.target.value)}
            style={inputStyle}
          >
            {displays.length === 0 && <option value="">Nenhuma tela detectada</option>}
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} — {d.size.width}×{d.size.height}
                {d.isPrimary ? " (principal)" : ""}
              </option>
            ))}
          </select>
        </>
      )}

      {mode === "all_displays" && (
        <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
          Cada monitor será capturado como uma imagem separada na fila
          {displays.length > 0 ? ` (${displays.length} tela(s) detectada(s))` : ""}.
        </p>
      )}

      {error && <p style={{ color: C.error, fontSize: 12, margin: 0 }}>{error}</p>}
      {status && <p style={{ color: C.success, fontSize: 12, margin: 0 }}>{status}</p>}
    </div>
  );
}
