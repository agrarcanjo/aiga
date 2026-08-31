import { useEffect, useState } from "react";
import type {
  LlmCloudProviderId,
  LlmSettingsPublic,
  MeetingPrefs,
  MeetingSessionMode,
} from "@clone-perssua/shared-types";
import { ContextProfilesSettings } from "./ContextProfilesSettings";
import { TeamMemoryPanel } from "./TeamMemoryPanel";

const C = {
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
};

interface MeetingSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

export function MeetingSettings({
  inputStyle,
  primaryBtn,
  secondaryBtn,
}: MeetingSettingsProps): JSX.Element {
  const [llm, setLlm] = useState<LlmSettingsPublic | null>(null);
  const [meetingPrefs, setMeetingPrefs] = useState<MeetingPrefs>({
    defaultMode: "passive",
    userAliases: [],
    questionOnlyMode: false,
  });
  const [aliasesText, setAliasesText] = useState("");
  const [status, setStatus] = useState("");

  async function load(): Promise<void> {
    const [llmRes, settingsRes] = await Promise.all([
      window.desktopApi.getLlmSettings(),
      window.desktopApi.getSettings(),
    ]);
    setLlm(llmRes.llm);
    const prefs = settingsRes.settings.meetingPrefs;
    if (prefs) {
      setMeetingPrefs(prefs);
      setAliasesText((prefs.userAliases || []).join(", "));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(): Promise<void> {
    if (!llm) return;
    const userAliases = aliasesText
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await Promise.all([
      window.desktopApi.saveLlmSettings({
        routing: {
          meetingSummary: llm.routing.meetingSummary,
          meetingActiveClassifier: llm.routing.meetingActiveClassifier,
          translation: llm.routing.translation,
        },
        privacy: llm.privacy,
      }),
      window.desktopApi.saveSettings({
        meetingPrefs: {
          ...meetingPrefs,
          userAliases,
        },
      }),
    ]);
    setStatus("Configurações de reunião salvas.");
    await load();
  }

  if (!llm) {
    return <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando…</p>;
  }

  function routingSelect(
    key: "meetingSummary" | "meetingActiveClassifier" | "translation",
    label: string,
    description: string
  ): JSX.Element {
    const route = llm!.routing[key];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ color: C.textMuted, fontSize: 11, marginBottom: 4 }}>{description}</span>
        <select
          value={route.providerId}
          onChange={(e) =>
            setLlm({
              ...llm!,
              routing: {
                ...llm!.routing,
                [key]: {
                  ...route,
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
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        Preferências do modo reunião: privacidade na nuvem e roteamento de modelos para resumo e
        classificação ativa. Para entrevista técnica, use o template &quot;Entrevista técnica&quot; no
        wizard da reunião e configure o perfil/contexto abaixo.
      </p>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Modo reunião ativo (padrão)</span>
        <select
          value={meetingPrefs.defaultMode}
          onChange={(e) =>
            setMeetingPrefs({
              ...meetingPrefs,
              defaultMode: e.target.value as MeetingSessionMode,
            })
          }
          style={inputStyle}
        >
          <option value="passive">Observador</option>
          <option value="active">Ativo (alertas)</option>
        </select>
        <label style={{ color: C.textMuted, fontSize: 11 }}>Apelidos padrão (vírgula)</label>
        <input
          type="text"
          value={aliasesText}
          onChange={(e) => setAliasesText(e.target.value)}
          style={inputStyle}
          placeholder="Seu nome e apelidos na reunião"
        />
        <label style={{ fontSize: 12, color: C.text, display: "flex", gap: 8 }}>
          <input
            type="checkbox"
            checked={meetingPrefs.questionOnlyMode}
            onChange={(e) =>
              setMeetingPrefs({ ...meetingPrefs, questionOnlyMode: e.target.checked })
            }
          />
          Preferir só heurística (sem classificador LLM)
        </label>
      </div>

      <label style={{ fontSize: 13, color: C.text, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={llm.privacy.allowCloudProcessingForMeetings}
          onChange={(e) =>
            setLlm({
              ...llm,
              privacy: {
                ...llm.privacy,
                allowCloudProcessingForMeetings: e.target.checked,
              },
            })
          }
          style={{ marginTop: 3, accentColor: "#6366f1" }}
        />
        <span>
          <strong>Processamento na nuvem em reuniões</strong>
          <br />
          <span style={{ color: C.textMuted, fontSize: 12 }}>
            Quando ativo, resumos e análises de reunião podem usar provedores cloud configurados.
          </span>
        </span>
      </label>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {routingSelect(
          "meetingSummary",
          "Modelo para resumo de reunião",
          "Usado ao encerrar uma sessão no modo observador."
        )}
        {routingSelect(
          "meetingActiveClassifier",
          "Modelo para modo reunião ativo",
          "Classificação e sugestões durante a reunião (quando disponível)."
        )}
        {routingSelect(
          "translation",
          "Modelo para tradução ao vivo",
          "Usado no modo legendas (G4)."
        )}
      </div>

      <label style={{ fontSize: 12, color: C.textMuted }}>
        Retenção de dados (dias): {llm.privacy.retentionDays}
      </label>
      <input
        type="number"
        min={1}
        max={90}
        value={llm.privacy.retentionDays}
        onChange={(e) =>
          setLlm({
            ...llm,
            privacy: {
              ...llm.privacy,
              retentionDays: Math.min(90, Math.max(1, Number(e.target.value) || 7)),
            },
          })
        }
        style={inputStyle}
      />

      <button type="button" style={primaryBtn} onClick={() => void save()}>
        Salvar configurações de reunião
      </button>
      {status && <span style={{ color: C.success, fontSize: 12 }}>{status}</span>}

      <ContextProfilesSettings
        inputStyle={inputStyle}
        primaryBtn={primaryBtn}
        secondaryBtn={secondaryBtn}
      />

      <TeamMemoryPanel inputStyle={inputStyle} secondaryBtn={secondaryBtn} />
    </div>
  );
}
