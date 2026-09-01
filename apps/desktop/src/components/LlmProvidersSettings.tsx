import { useEffect, useState } from "react";
import type { LlmCloudProviderId, LlmSettingsPublic } from "@clone-perssua/shared-types";

const MODEL_OPTIONS: Record<LlmCloudProviderId, string[]> = {
  gemini: ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.5-pro", "gemini-2.5-flash", "gemini-2.5-pro"],
  openai: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
  anthropic: ["claude-3-5-haiku-latest", "claude-sonnet-4-20250514"],
};

const C = {
  surface2: "#242424",
  border: "#2e2e2e",
  accent: "#6366f1",
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  error: "#ef4444",
};

interface LlmProvidersSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
}

export function LlmProvidersSettings({
  inputStyle,
  primaryBtn,
}: LlmProvidersSettingsProps): JSX.Element {
  const [llm, setLlm] = useState<LlmSettingsPublic | null>(null);
  const [keys, setKeys] = useState<Record<LlmCloudProviderId, string>>({
    gemini: "",
    openai: "",
    anthropic: "",
  });
  const [status, setStatus] = useState("");
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});

  async function load(): Promise<void> {
    const r = await window.desktopApi.getLlmSettings();
    setLlm(r.llm);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(): Promise<void> {
    if (!llm) return;
    await window.desktopApi.saveLlmSettings({
      providers: {
        gemini: {
          enabled: llm.providers.gemini.enabled,
          defaultModelId: llm.providers.gemini.defaultModelId,
          apiKey: keys.gemini || undefined,
        },
        openai: {
          enabled: llm.providers.openai.enabled,
          defaultModelId: llm.providers.openai.defaultModelId,
          apiKey: keys.openai || undefined,
        },
        anthropic: {
          enabled: llm.providers.anthropic.enabled,
          defaultModelId: llm.providers.anthropic.defaultModelId,
          apiKey: keys.anthropic || undefined,
        },
      },
      routing: llm.routing,
      tokenBudget: llm.tokenBudget,
    });
    setStatus("Configurações de IA salvas.");
    setKeys({ gemini: "", openai: "", anthropic: "" });
    await load();
  }

  async function testProvider(providerId: LlmCloudProviderId): Promise<void> {
    const r = await window.desktopApi.testLlmProvider({
      providerId,
      modelId: llm?.providers[providerId].defaultModelId,
    });
    setTestStatus((s) => ({
      ...s,
      [providerId]: r.ok ? "OK" : r.message,
    }));
  }

  if (!llm) {
    return <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando…</p>;
  }

  const providerLabels: Record<LlmCloudProviderId, string> = {
    gemini: "Google Gemini",
    openai: "OpenAI",
    anthropic: "Anthropic",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {(["gemini", "openai", "anthropic"] as LlmCloudProviderId[]).map((pid) => (
        <div
          key={pid}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ color: C.text, fontSize: 13 }}>{providerLabels[pid]}</strong>
            <label style={{ fontSize: 11, color: C.textMuted }}>
              <input
                type="checkbox"
                checked={llm.providers[pid].enabled}
                onChange={(e) =>
                  setLlm({
                    ...llm,
                    providers: {
                      ...llm.providers,
                      [pid]: { ...llm.providers[pid], enabled: e.target.checked },
                    },
                  })
                }
              />{" "}
              Ativo
            </label>
          </div>
          <span style={{ fontSize: 11, color: llm.providers[pid].hasApiKey ? C.success : C.error }}>
            {llm.providers[pid].hasApiKey ? "Chave configurada" : "Sem chave"}
          </span>
          <select
            value={llm.providers[pid].defaultModelId}
            onChange={(e) =>
              setLlm({
                ...llm,
                providers: {
                  ...llm.providers,
                  [pid]: { ...llm.providers[pid], defaultModelId: e.target.value },
                },
              })
            }
            style={inputStyle}
          >
            {MODEL_OPTIONS[pid].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="password"
            placeholder="Nova API key (opcional)"
            value={keys[pid]}
            onChange={(e) => setKeys({ ...keys, [pid]: e.target.value })}
            style={inputStyle}
          />
          <button type="button" style={{ ...primaryBtn, fontSize: 12 }} onClick={() => void testProvider(pid)}>
            Testar conexão
          </button>
          {testStatus[pid] && (
            <span style={{ fontSize: 11, color: testStatus[pid] === "OK" ? C.success : C.error }}>
              {testStatus[pid]}
            </span>
          )}
        </div>
      ))}

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <p style={{ color: C.textMuted, fontSize: 12, margin: "0 0 8px" }}>Roteamento ASK</p>
        <select
          value={llm.routing.ask.providerId}
          onChange={(e) =>
            setLlm({
              ...llm,
              routing: {
                ...llm.routing,
                ask: {
                  ...llm.routing.ask,
                  providerId: e.target.value as LlmCloudProviderId | "local",
                },
              },
            })
          }
          style={inputStyle}
        >
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="local">Local</option>
        </select>
      </div>

      <div>
        <p style={{ color: C.textMuted, fontSize: 12 }}>Orçamento de tokens (sessão)</p>
        <label style={{ fontSize: 11, color: C.text }}>
          <input
            type="checkbox"
            checked={llm.tokenBudget.enabled}
            onChange={(e) =>
              setLlm({
                ...llm,
                tokenBudget: { ...llm.tokenBudget, enabled: e.target.checked },
              })
            }
          />{" "}
          Alertas ativos
        </label>
        <input
          type="number"
          value={llm.tokenBudget.sessionWarningTokens}
          onChange={(e) =>
            setLlm({
              ...llm,
              tokenBudget: {
                ...llm.tokenBudget,
                sessionWarningTokens: Number(e.target.value) || 50000,
              },
            })
          }
          style={{ ...inputStyle, marginTop: 6 }}
        />
      </div>

      <button type="button" style={primaryBtn} onClick={() => void save()}>
        Salvar provedores e IA
      </button>
      {status && <span style={{ color: C.success, fontSize: 12 }}>{status}</span>}
    </div>
  );
}
