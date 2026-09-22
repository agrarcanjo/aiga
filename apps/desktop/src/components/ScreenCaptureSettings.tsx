import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DisplayInfo,
  ScreenCaptureMode,
  ScreenCaptureRegion,
} from "@clone-perssua/shared-types";

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
  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropRegion, setCropRegion] = useState<ScreenCaptureRegion>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const hydratedRef = useRef(false);

  const persist = useCallback(async (
    nextMode: ScreenCaptureMode,
    nextDisplayId: string,
    nextCropEnabled: boolean,
    nextCropRegion: ScreenCaptureRegion,
  ) => {
    await window.desktopApi.saveScreenCapture({
      mode: nextMode,
      displayId: nextMode === "specific_display" ? nextDisplayId : "",
      cropEnabled: nextCropEnabled,
      cropRegion: nextCropRegion,
    });
    setStatus("Preferência e região de captura salvas.");
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
      setCropEnabled(Boolean(sc?.cropEnabled));
      setCropRegion(sc?.cropRegion || { x: 0, y: 0, width: 1, height: 1 });
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
      await persist(nextMode, nextDisplayId, cropEnabled, cropRegion);
    }
  }

  async function handleDisplayChange(nextDisplayId: string): Promise<void> {
    setDisplayId(nextDisplayId);
    if (hydratedRef.current) {
      await persist(mode, nextDisplayId, cropEnabled, cropRegion);
    }
  }

  async function handleCropEnabled(nextEnabled: boolean): Promise<void> {
    setCropEnabled(nextEnabled);
    if (hydratedRef.current) {
      await persist(mode, displayId, nextEnabled, cropRegion);
    }
  }

  async function handleRegionChange(
    field: keyof ScreenCaptureRegion,
    percentValue: number,
  ): Promise<void> {
    const value = Math.max(0, Math.min(100, percentValue)) / 100;
    const next = { ...cropRegion, [field]: value };
    if (field === "x") next.width = Math.min(next.width, 1 - next.x);
    if (field === "y") next.height = Math.min(next.height, 1 - next.y);
    if (field === "width") next.width = Math.min(next.width, 1 - next.x);
    if (field === "height") next.height = Math.min(next.height, 1 - next.y);
    next.width = Math.max(0.1, next.width);
    next.height = Math.max(0.1, next.height);
    setCropRegion(next);
    if (hydratedRef.current) {
      await persist(mode, displayId, cropEnabled, next);
    }
  }

  async function applyUsefulAreaPreset(): Promise<void> {
    const next = { x: 0, y: 0.08, width: 1, height: 0.87 };
    setCropEnabled(true);
    setCropRegion(next);
    await persist(mode, displayId, true, next);
  }

  async function resetRegion(): Promise<void> {
    const next = { x: 0, y: 0, width: 1, height: 1 };
    setCropRegion(next);
    await persist(mode, displayId, cropEnabled, next);
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
        <option value="area">Captura de área (monitor principal)</option>
      </select>

      {mode === "area" && (
        <div
          style={{
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
            padding: "9px 10px",
            borderRadius: 6,
            border: "1px solid #3a3a3a",
            background: "#181818",
            color: C.textMuted,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          <span
            aria-label="Informação sobre overlay e modo stealth"
            title="Overlay e modo stealth"
            style={{ color: "#60a5fa", fontSize: 16, lineHeight: 1 }}
          >
            ⓘ
          </span>
          <span>
            <strong style={{ color: C.text }}>Overlay e modo stealth:</strong> ao capturar, o AIGA
            será ocultado e um overlay escurecido aparecerá temporariamente no monitor principal.
            Arraste para selecionar a área ou pressione Esc para cancelar. O AIGA volta ao estado
            anterior assim que a seleção terminar.
          </span>
        </div>
      )}

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

      {mode !== "area" && <div style={{ height: 1, background: "#2e2e2e" }} />}

      {mode !== "area" && (
      <>
      <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.text, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={cropEnabled}
          onChange={(e) => void handleCropEnabled(e.target.checked)}
        />
        Capturar somente uma região útil
      </label>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
        O recorte é aplicado antes de salvar e enviar a imagem para a IA. Os valores são percentuais
        e continuam válidos quando a resolução ou a escala do monitor mudar.
      </p>

      {cropEnabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            aria-label="Prévia proporcional da região capturada"
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 9",
              maxHeight: 190,
              background: "#161616",
              border: "1px solid #3a3a3a",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: "rgba(239,68,68,0.12)" }} />
            <div
              style={{
                position: "absolute",
                left: `${cropRegion.x * 100}%`,
                top: `${cropRegion.y * 100}%`,
                width: `${cropRegion.width * 100}%`,
                height: `${cropRegion.height * 100}%`,
                border: `2px solid ${C.success}`,
                background: "rgba(34,197,94,0.12)",
              }}
            />
          </div>

          {([
            ["x", "Margem esquerda", 0, 90],
            ["y", "Margem superior", 0, 90],
            ["width", "Largura capturada", 10, 100],
            ["height", "Altura capturada", 10, 100],
          ] as const).map(([field, label, min, max]) => (
            <label key={field} style={{ display: "grid", gridTemplateColumns: "145px 1fr 48px", gap: 8, alignItems: "center", color: C.textMuted, fontSize: 12 }}>
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={Math.round(cropRegion[field] * 100)}
                onChange={(e) => void handleRegionChange(field, Number(e.target.value))}
                style={{ accentColor: C.success }}
              />
              <span style={{ textAlign: "right" }}>{Math.round(cropRegion[field] * 100)}%</span>
            </label>
          ))}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={secondaryBtn} onClick={() => void applyUsefulAreaPreset()}>
              Remover barras (preset)
            </button>
            <button type="button" style={secondaryBtn} onClick={() => void resetRegion()}>
              Usar tela inteira
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {error && <p style={{ color: C.error, fontSize: 12, margin: 0 }}>{error}</p>}
      {status && <p style={{ color: C.success, fontSize: 12, margin: 0 }}>{status}</p>}
    </div>
  );
}
