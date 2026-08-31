import { useCallback, useEffect, useState } from "react";
import type {
  FeatureFlags,
  FeatureFlagsGetResponse,
  ProviderMode,
  StealthHardening,
} from "@clone-perssua/shared-types";

const C = {
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  warn: "#f59e0b",
};

interface FeatureFlagsSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

export function FeatureFlagsSettings({
  inputStyle,
  primaryBtn,
  secondaryBtn,
}: FeatureFlagsSettingsProps): JSX.Element {
  const [flags, setFlags] = useState<FeatureFlagsGetResponse | null>(null);
  const [draft, setDraft] = useState<FeatureFlags | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const ff = await window.desktopApi.getFeatureFlags();
    setFlags(ff);
    setDraft({ ...ff.persisted });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!flags || !draft) {
    return <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando…</p>;
  }

  function envLocked(key: keyof FeatureFlagsGetResponse["source"]): boolean {
    return flags!.source[key] === "env";
  }

  async function save(): Promise<void> {
    if (!draft) return;
    const r = await window.desktopApi.saveFeatureFlags({
      providerMode: draft.providerMode,
      localProviderEnabled: draft.localProviderEnabled,
      forceLocalOnly: draft.forceLocalOnly,
      stealthHardening: draft.stealthHardening,
    });
    setFlags(r);
    setDraft({ ...r.persisted });
    setStatus("Feature flags salvas. Reinicie se o modo de provedor não refletir imediatamente.");
  }

  async function reset(): Promise<void> {
    const r = await window.desktopApi.resetFeatureFlags();
    setFlags(r);
    setDraft({ ...r.persisted });
    setStatus("Flags restauradas ao padrão do arquivo.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        Flags persistidas em <code>settings.json</code>. Valores definidos por variáveis de ambiente
        no boot não podem ser alterados aqui (veja aba Ambiente).
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ color: C.textMuted, fontSize: 12 }}>
          Modo do provedor {envLocked("providerMode") && <span style={{ color: C.warn }}>(env)</span>}
        </label>
        <select
          value={draft.providerMode}
          disabled={envLocked("providerMode")}
          onChange={(e) =>
            setDraft({ ...draft, providerMode: e.target.value as ProviderMode })
          }
          style={inputStyle}
        >
          <option value="cloud">Cloud</option>
          <option value="local">Local</option>
          <option value="hybrid">Híbrido</option>
        </select>
        <span style={{ color: C.textMuted, fontSize: 11 }}>
          Efetivo agora: <strong style={{ color: C.text }}>{flags.effective.providerMode}</strong>
        </span>
      </div>

      <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
        <input
          type="checkbox"
          checked={draft.localProviderEnabled}
          disabled={envLocked("localProviderEnabled")}
          onChange={(e) => setDraft({ ...draft, localProviderEnabled: e.target.checked })}
        />
        Provedor local habilitado
        {envLocked("localProviderEnabled") && <span style={{ color: C.warn }}>(env)</span>}
      </label>

      <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
        <input
          type="checkbox"
          checked={draft.forceLocalOnly}
          disabled={envLocked("forceLocalOnly")}
          onChange={(e) => setDraft({ ...draft, forceLocalOnly: e.target.checked })}
        />
        Somente local (sem nuvem)
        {envLocked("forceLocalOnly") && <span style={{ color: C.warn }}>(env)</span>}
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ color: C.textMuted, fontSize: 12 }}>
          Stealth hardening {envLocked("stealthHardening") && <span style={{ color: C.warn }}>(env)</span>}
        </label>
        <select
          value={draft.stealthHardening}
          disabled={envLocked("stealthHardening")}
          onChange={(e) =>
            setDraft({ ...draft, stealthHardening: e.target.value as StealthHardening })
          }
          style={inputStyle}
        >
          <option value="off">Desligado</option>
          <option value="safe">Safe</option>
          <option value="strict">Strict</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primaryBtn} onClick={() => void save()}>
          Salvar flags
        </button>
        <button type="button" style={secondaryBtn} onClick={() => void reset()}>
          Restaurar padrão
        </button>
      </div>
      {status && <span style={{ color: C.success, fontSize: 12 }}>{status}</span>}
    </div>
  );
}
