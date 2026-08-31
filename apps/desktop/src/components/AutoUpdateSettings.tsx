import { useCallback, useEffect, useState } from "react";
import type { AutoUpdateChannel, AutoUpdateState } from "@clone-perssua/shared-types";

const C = {
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  error: "#ef4444",
  warn: "#f59e0b",
};

interface AutoUpdateSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

export function AutoUpdateSettings({
  inputStyle,
  primaryBtn,
  secondaryBtn,
}: AutoUpdateSettingsProps): JSX.Element {
  const [state, setState] = useState<AutoUpdateState | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [channel, setChannel] = useState<AutoUpdateChannel>("stable");
  const [allowPrerelease, setAllowPrerelease] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const r = await window.desktopApi.getAutoUpdateState();
    setState(r.state);
    setEnabled(r.state.config.enabled);
    setFeedUrl(r.state.config.feedUrl || "");
    setChannel(r.state.config.channel);
    setAllowPrerelease(r.state.config.allowPrerelease);
  }, []);

  useEffect(() => {
    void load();
    const unsub = window.desktopApi.onAutoUpdateEvent(() => {
      void load();
    });
    return unsub;
  }, [load]);

  if (!state) {
    return <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando…</p>;
  }

  async function saveConfig(): Promise<void> {
    await window.desktopApi.saveAutoUpdateConfig({
      enabled,
      feedUrl: feedUrl.trim() || null,
      channel,
      allowPrerelease,
    });
    setStatus("Configuração de atualização salva.");
    await load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        Atualizações automáticas via feed HTTP(S). Em desenvolvimento (não empacotado) algumas ações
        ficam indisponíveis.
      </p>

      <div
        style={{
          fontSize: 11,
          color: C.textMuted,
          border: `1px solid ${C.textMuted}`,
          borderRadius: 8,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <span>
          Versão atual: <strong style={{ color: C.text }}>{state.currentVersion}</strong>
        </span>
        <span>
          Status: <strong style={{ color: C.text }}>{state.status}</strong>
        </span>
        {state.availableVersion && (
          <span style={{ color: C.warn }}>Disponível: {state.availableVersion}</span>
        )}
        {state.lastError && <span style={{ color: C.error }}>{state.lastError}</span>}
      </div>

      <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Habilitar verificação automática
      </label>

      <label style={{ color: C.textMuted, fontSize: 12 }}>URL do feed (HTTPS)</label>
      <input
        type="url"
        value={feedUrl}
        onChange={(e) => setFeedUrl(e.target.value)}
        placeholder="https://…"
        style={inputStyle}
      />

      <label style={{ color: C.textMuted, fontSize: 12 }}>Canal</label>
      <select
        value={channel}
        onChange={(e) => setChannel(e.target.value as AutoUpdateChannel)}
        style={inputStyle}
      >
        <option value="stable">Stable</option>
        <option value="beta">Beta</option>
      </select>

      <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
        <input
          type="checkbox"
          checked={allowPrerelease}
          onChange={(e) => setAllowPrerelease(e.target.checked)}
        />
        Permitir pré-release no canal
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primaryBtn} onClick={() => void saveConfig()}>
          Salvar configuração
        </button>
        <button
          type="button"
          style={secondaryBtn}
          disabled={!state.canCheck}
          onClick={() => void window.desktopApi.checkForAutoUpdate().then(() => load())}
        >
          Verificar agora
        </button>
        <button
          type="button"
          style={secondaryBtn}
          disabled={!state.canDownload}
          onClick={() => void window.desktopApi.downloadAutoUpdate().then(() => load())}
        >
          Baixar
        </button>
        <button
          type="button"
          style={secondaryBtn}
          disabled={!state.canInstall}
          onClick={() => void window.desktopApi.installAutoUpdate().then(() => load())}
        >
          Instalar
        </button>
        {state.canRollback && (
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => void window.desktopApi.rollbackAutoUpdate({}).then(() => load())}
          >
            Rollback
          </button>
        )}
        {state.requiresHealthConfirmation && (
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => void window.desktopApi.confirmAutoUpdateHealth().then(() => load())}
          >
            Confirmar saúde pós-update
          </button>
        )}
      </div>
      {status && <span style={{ color: C.success, fontSize: 12 }}>{status}</span>}
    </div>
  );
}
