import { useCallback, useEffect, useState } from "react";
import type { TranscriptionPacksListResponse } from "@clone-perssua/shared-types";

const C = {
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  error: "#ef4444",
  warn: "#f59e0b",
  accent: "#6366f1",
  surface2: "#242424",
};

interface TranscriptionPacksSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

function statusLabel(status: string): string {
  if (status === "ready") return "Pronto";
  if (status === "downloading") return "Baixando…";
  if (status === "needs_engine") return "Aguardando motor";
  if (status === "error") return "Erro";
  return "Não instalado";
}

function statusColor(status: string): string {
  if (status === "ready") return C.success;
  if (status === "downloading") return C.accent;
  if (status === "needs_engine") return C.warn;
  if (status === "error") return C.error;
  return C.textMuted;
}

export function TranscriptionPacksSettings({
  inputStyle,
  primaryBtn,
  secondaryBtn,
}: TranscriptionPacksSettingsProps): JSX.Element {
  const [data, setData] = useState<TranscriptionPacksListResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const listed = await window.desktopApi.listTranscriptionPacks();
    setData(listed);
    return listed;
  }, []);

  useEffect(() => {
    void refresh().catch((e) =>
      setError(e instanceof Error ? e.message : "Falha ao listar pacotes")
    );
    const unsub = window.desktopApi.onTranscriptionPacksProgress((p) => {
      if (typeof p.percent === "number") setProgressPercent(p.percent);
      if (p.message) setMessage(p.message);
      if (p.status === "error") setError(p.message || "Erro no download");
      if (p.status === "ready") {
        setProgressPercent(null);
        void refresh();
      }
    });
    return unsub;
  }, [refresh]);

  async function setupAll(): Promise<void> {
    setBusy(true);
    setError("");
    setMessage("Instalando tudo automaticamente (whisper-cli + modelo + PT/EN)…");
    try {
      const listed = await window.desktopApi.setupTranscriptionRuntime({
        tier: data?.preferredModelTier || "base",
      });
      setData(listed);
      setMessage("Pronto para usar: runtime e pacotes PT/EN instalados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na preparação automática");
    } finally {
      setBusy(false);
      setProgressPercent(null);
    }
  }

  async function installOne(packId: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const listed = await window.desktopApi.installTranscriptionPack({ packId });
      setData(listed);
      setMessage(`Pacote ${packId} pronto.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao instalar pacote");
    } finally {
      setBusy(false);
      setProgressPercent(null);
    }
  }

  async function uninstallOne(packId: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const listed = await window.desktopApi.uninstallTranscriptionPack({ packId });
      setData(listed);
      setMessage(`Pacote ${packId} removido.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao desinstalar pacote");
    } finally {
      setBusy(false);
    }
  }

  async function changeTier(tier: "base" | "small" | "medium"): Promise<void> {
    setBusy(true);
    setError("");
    setMessage(`Trocando para modelo ${tier} (download automático se necessário)…`);
    try {
      const listed = await window.desktopApi.setTranscriptionModelTier({ tier });
      setData(listed);
      setMessage(`Modelo ${tier} ativo.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao alterar modelo");
    } finally {
      setBusy(false);
      setProgressPercent(null);
    }
  }

  async function uninstallModel(tier: "base" | "small" | "medium"): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const listed = await window.desktopApi.uninstallTranscriptionModel({ tier });
      setData(listed);
      setMessage(`Modelo ${tier} desinstalado.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao desinstalar modelo");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando pacotes de áudio…</p>;
  }

  const fullyReady = Boolean(data.requiredReady && data.engine.fullyReady);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
          Pacotes de transcrição (STT local)
        </p>
        <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
          Um clique instala whisper-cli, o modelo escolhido e os idiomas obrigatórios (PT + EN).
        </p>
      </div>

      <div
        style={{
          border: `1px solid ${fullyReady ? C.success : C.border}`,
          borderRadius: 8,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: C.surface2,
        }}
      >
        <span style={{ color: fullyReady ? C.success : C.warn, fontSize: 12, fontWeight: 600 }}>
          {fullyReady
            ? "✓ Pronto para tradução/reunião"
            : "Pendente: prepare o runtime com um clique"}
        </span>
        <span style={{ color: C.textMuted, fontSize: 11 }}>
          whisper-cli: {data.engine.binaryReady ? "OK" : "ausente"}
          {" · "}
          modelo: {data.engine.modelReady ? "OK" : "ausente"}
          {" · "}
          PT/EN: {data.requiredInstalled ? "marcados" : "pendentes"}
        </span>
        {data.engine.modelPath && (
          <span style={{ color: C.textMuted, fontSize: 10 }}>
            Modelo ativo: <code>{data.engine.modelPath}</code>
          </span>
        )}
        <button type="button" style={primaryBtn} disabled={busy} onClick={() => void setupAll()}>
          {busy ? "Preparando…" : fullyReady ? "Reinstalar / reparar tudo" : "Preparar tudo com 1 clique"}
        </button>
        {typeof progressPercent === "number" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 6, borderRadius: 4, background: "#111", overflow: "hidden" }}>
              <div style={{ width: `${progressPercent}%`, height: "100%", background: C.accent }} />
            </div>
            <span style={{ color: C.textMuted, fontSize: 11 }}>{progressPercent}%</span>
          </div>
        )}
      </div>

      <label style={{ color: C.textMuted, fontSize: 12 }}>Qualidade do modelo</label>
      <select
        value={data.preferredModelTier}
        disabled={busy}
        onChange={(e) => void changeTier(e.target.value as "base" | "small" | "medium")}
        style={inputStyle}
      >
        {data.modelTiers.map((tier) => (
          <option key={tier.id} value={tier.id}>
            {tier.label} (~{tier.approximateSizeMb} MB)
            {tier.installed ? " · instalado" : ""}
            {tier.active ? " · ativo" : ""}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {data.modelTiers
          .filter((tier) => tier.installed)
          .map((tier) => (
            <button
              key={`uninstall-${tier.id}`}
              type="button"
              style={secondaryBtn}
              disabled={busy}
              onClick={() => void uninstallModel(tier.id as "base" | "small" | "medium")}
            >
              Desinstalar {tier.id}
            </button>
          ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.packs.map((pack) => (
          <div
            key={pack.id}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 10,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{pack.label}</span>
                {pack.required && (
                  <span style={{ color: C.warn, fontSize: 10, fontWeight: 700 }}>OBRIGATÓRIO</span>
                )}
                <span style={{ color: statusColor(pack.status), fontSize: 11 }}>
                  {statusLabel(pack.status)}
                </span>
              </div>
              <p style={{ color: C.textMuted, fontSize: 11, margin: "4px 0 0" }}>{pack.description}</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {pack.status === "ready" || pack.installed ? (
                <button
                  type="button"
                  style={secondaryBtn}
                  disabled={busy}
                  onClick={() => void uninstallOne(pack.id)}
                >
                  Desinstalar
                </button>
              ) : (
                <button
                  type="button"
                  style={secondaryBtn}
                  disabled={busy || pack.status === "downloading"}
                  onClick={() => void installOne(pack.id)}
                >
                  Instalar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {message && <p style={{ color: C.success, fontSize: 12, margin: 0 }}>{message}</p>}
      {(error || data.engine.lastError) && (
        <p style={{ color: C.error, fontSize: 12, margin: 0 }}>{error || data.engine.lastError}</p>
      )}
    </div>
  );
}
