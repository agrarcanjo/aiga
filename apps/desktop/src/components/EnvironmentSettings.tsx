import { useCallback, useEffect, useState } from "react";
import type { EnvGetResponse, FeatureFlagsGetResponse } from "@clone-perssua/shared-types";

const C = {
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  accent: "#6366f1",
  warn: "#f59e0b",
  success: "#22c55e",
};

interface EnvironmentSettingsProps {
  secondaryBtn: React.CSSProperties;
}

function EnvBadge({ active }: { active: boolean }): JSX.Element {
  if (!active) {
    return (
      <span style={{ fontSize: 10, color: C.textMuted }}>arquivo / padrão</span>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        color: C.warn,
        fontWeight: 600,
        border: `1px solid ${C.warn}`,
        borderRadius: 4,
        padding: "2px 6px",
      }}
    >
      definido por ambiente
    </span>
  );
}

export function EnvironmentSettings({
  secondaryBtn,
}: EnvironmentSettingsProps): JSX.Element {
  const [flags, setFlags] = useState<FeatureFlagsGetResponse | null>(null);
  const [envReport, setEnvReport] = useState<EnvGetResponse | null>(null);

  const load = useCallback(async () => {
    const [ff, env] = await Promise.all([
      window.desktopApi.getFeatureFlags(),
      window.desktopApi.getEnvironment(),
    ]);
    setFlags(ff);
    setEnvReport(env);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!flags || !envReport) {
    return <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando…</p>;
  }

  const flagRows: {
    label: string;
    effective: string;
    sourceKey: keyof FeatureFlagsGetResponse["source"];
  }[] = [
    { label: "Modo do provedor", effective: flags.effective.providerMode, sourceKey: "providerMode" },
    {
      label: "Provedor local",
      effective: flags.effective.localProviderEnabled ? "sim" : "não",
      sourceKey: "localProviderEnabled",
    },
    {
      label: "Somente local",
      effective: flags.effective.forceLocalOnly ? "sim" : "não",
      sourceKey: "forceLocalOnly",
    },
    { label: "Stealth hardening", effective: flags.effective.stealthHardening, sourceKey: "stealthHardening" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        Valores definidos por variáveis de ambiente no <strong>boot</strong> têm precedência sobre o
        arquivo de configuração. Edite <code style={{ color: C.text }}>.env</code> ou variáveis do
        sistema e reinicie o app.
      </p>

      <div>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Feature flags (efetivas)</span>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          {flagRows.map((row) => (
            <div
              key={row.sourceKey}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
            >
              <span style={{ color: C.text }}>{row.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.accent, fontWeight: 600 }}>{row.effective}</span>
                <EnvBadge active={flags.source[row.sourceKey] === "env"} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
          Variáveis de ambiente no boot
        </span>
        {envReport.overrides.length === 0 ? (
          <p style={{ color: C.textMuted, fontSize: 11, margin: "8px 0 0" }}>
            Nenhuma variável do catálogo definida — usando defaults e settings.json.
          </p>
        ) : (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11, color: C.text }}>
            {envReport.overrides.map((o) => (
              <li key={o.envKey} style={{ marginBottom: 4 }}>
                <code>{o.envKey}</code> = {o.value}
                <span style={{ color: C.textMuted }}> ({o.label})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Catálogo completo</span>
        <div
          style={{
            marginTop: 8,
            maxHeight: 160,
            overflowY: "auto",
            fontSize: 10,
            color: C.textMuted,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: 8,
          }}
        >
          {envReport.catalog.map((entry) => (
            <div key={entry.envKey} style={{ marginBottom: 4 }}>
              <code style={{ color: entry.isSet ? C.success : C.textMuted }}>{entry.envKey}</code>
              {entry.isSet ? " ✓" : ""} — {entry.label}
            </div>
          ))}
        </div>
      </div>

      <button type="button" style={secondaryBtn} onClick={() => void load()}>
        Atualizar
      </button>
    </div>
  );
}
