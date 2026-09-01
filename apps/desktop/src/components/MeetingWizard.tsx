import { useEffect, useState } from "react";
import type {
  ConsentTextResponse,
  MeetingSessionMode,
  MeetingTemplate,
  MeetingTemplateId,
  UserProfile,
} from "@clone-perssua/shared-types";

const C = {
  surface2: "#242424",
  border: "#2e2e2e",
  accent: "#6366f1",
  text: "#e5e5e5",
  textMuted: "#888",
};

export interface MeetingWizardValues {
  templateId: MeetingTemplateId | "";
  profileId: string;
  objective: string;
  customPrompt: string;
  sessionMode: MeetingSessionMode;
  aliasesText: string;
  questionOnlyMode: boolean;
  useCloud: boolean;
  consent: boolean;
  consentTextVersion: string;
}

interface MeetingWizardProps {
  profiles: UserProfile[];
  values: MeetingWizardValues;
  onChange: (patch: Partial<MeetingWizardValues>) => void;
  captureMode: string;
  preflightStatus: string;
  onStart: () => void;
  expanded?: boolean;
}

const STEPS = ["template", "context", "mode", "consent"] as const;
type StepId = (typeof STEPS)[number];

const STEP_LABELS: Record<StepId, string> = {
  template: "Template",
  context: "Contexto",
  mode: "Modo",
  consent: "Consentimento",
};

export function MeetingWizard({
  profiles,
  values,
  onChange,
  captureMode,
  preflightStatus,
  onStart,
  expanded = false,
}: MeetingWizardProps): JSX.Element {
  const [step, setStep] = useState<StepId>("template");
  const [templates, setTemplates] = useState<MeetingTemplate[]>([]);
  const [consentText, setConsentText] = useState<ConsentTextResponse | null>(null);

  useEffect(() => {
    void window.desktopApi.listMeetingTemplates().then((r) => setTemplates(r.templates));
    void window.desktopApi.getMeetingConsentText().then((r) => {
      setConsentText(r);
      onChange({ consentTextVersion: r.version });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  function applyTemplate(id: MeetingTemplateId): void {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const isInterview = id === "interview";
    onChange({
      templateId: id,
      objective: values.objective.trim() && !isInterview ? values.objective : t.objective,
      customPrompt: values.customPrompt.trim() && !isInterview ? values.customPrompt : t.customPrompt,
      sessionMode: isInterview ? "active" : values.sessionMode || t.suggestedMode,
    });
  }

  const isInterview = values.templateId === "interview";

  const stepIndex = STEPS.indexOf(step);

  function next(): void {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) {
      setStep(STEPS[i + 1]);
    }
  }

  function back(): void {
    const i = STEPS.indexOf(step);
    if (i > 0) {
      setStep(STEPS[i - 1]);
    }
  }

  const inputStyle = {
    background: C.surface2,
    border: `1px solid ${C.border}`,
    color: C.text,
    borderRadius: 6,
    padding: expanded ? "12px 14px" : 8,
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: expanded ? 14 : 13,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: expanded ? 16 : 12,
        flex: 1,
        minHeight: 0,
        maxWidth: expanded ? 920 : undefined,
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <span
            key={s}
            style={{
              fontSize: 10,
              padding: "4px 8px",
              borderRadius: 4,
              background: i === stepIndex ? C.accent : C.surface2,
              color: i <= stepIndex ? "#fff" : C.textMuted,
              border: `1px solid ${C.border}`,
            }}
          >
            {i + 1}. {STEP_LABELS[s]}
          </span>
        ))}
      </div>

      {step === "template" && (
        <>
          <label style={{ color: C.textMuted, fontSize: 12 }}>Template (opcional)</label>
          <select
            value={values.templateId}
            onChange={(e) => {
              const id = e.target.value as MeetingTemplateId | "";
              onChange({ templateId: id });
              if (id) applyTemplate(id);
            }}
            style={inputStyle}
          >
            <option value="">— Personalizado —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {isInterview && (
            <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
              Entrevista: captura a saída de áudio do computador, detecta perguntas do
              entrevistador e prioriza a sugestão de resposta na tela (sem mostrar fala do
              microfone). Configure o perfil em Configurações → Reunião.
            </p>
          )}
        </>
      )}

      {step === "context" && (
        <>
          <label style={{ color: C.textMuted, fontSize: 12 }}>Perfil</label>
          <select
            value={values.profileId}
            onChange={(e) => onChange({ profileId: e.target.value })}
            style={inputStyle}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.role}
              </option>
            ))}
          </select>
          <label style={{ color: C.textMuted, fontSize: 12 }}>Objetivo</label>
          <textarea
            value={values.objective}
            onChange={(e) => onChange({ objective: e.target.value })}
            rows={expanded ? 5 : 2}
            style={{
              ...inputStyle,
              minHeight: expanded ? 120 : undefined,
              resize: "vertical" as const,
              flex: expanded ? 1 : undefined,
            }}
          />
          <label style={{ color: C.textMuted, fontSize: 12 }}>Prompt adicional (opcional)</label>
          <textarea
            value={values.customPrompt}
            onChange={(e) => onChange({ customPrompt: e.target.value })}
            rows={expanded ? 6 : 2}
            style={{
              ...inputStyle,
              minHeight: expanded ? 140 : undefined,
              resize: "vertical" as const,
              flex: expanded ? 1 : undefined,
            }}
          />
        </>
      )}

      {step === "mode" && (
        <>
          {isInterview ? (
            <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
              Modo entrevista: detecção de perguntas do entrevistador + sugestão de resposta
              (modo ativo). Apelidos são opcionais.
            </p>
          ) : (
            <>
              <label style={{ color: C.textMuted, fontSize: 12 }}>Modo da sessão</label>
              <select
                value={values.sessionMode}
                onChange={(e) => onChange({ sessionMode: e.target.value as MeetingSessionMode })}
                style={inputStyle}
              >
                <option value="passive">Observador (resumo ao encerrar)</option>
                <option value="active">Ativo (alertas de pergunta)</option>
                <option value="hybrid">Híbrido (resumo + alertas)</option>
              </select>
            </>
          )}
          {(isInterview || values.sessionMode === "active" || values.sessionMode === "hybrid") && (
            <>
              {!isInterview && (
                <>
                  <label style={{ color: C.textMuted, fontSize: 12 }}>Apelidos (vírgula)</label>
                  <input
                    type="text"
                    value={values.aliasesText}
                    onChange={(e) => onChange({ aliasesText: e.target.value })}
                    placeholder="João, Jota"
                    style={inputStyle}
                  />
                </>
              )}
              <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
                <input
                  type="checkbox"
                  checked={values.questionOnlyMode}
                  onChange={(e) => onChange({ questionOnlyMode: e.target.checked })}
                />
                Só heurística (menos tokens)
              </label>
            </>
          )}
          <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
            <input
              type="checkbox"
              checked={values.useCloud}
              onChange={(e) => onChange({ useCloud: e.target.checked })}
            />
            Processar na nuvem
          </label>
        </>
      )}

      {step === "consent" && (
        <>
          <pre
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              padding: expanded ? 14 : 10,
              borderRadius: 6,
              fontSize: expanded ? 12 : 10,
              color: C.textMuted,
              whiteSpace: "pre-wrap",
              margin: 0,
              maxHeight: expanded ? 280 : 120,
              overflow: "auto",
              flex: expanded ? 1 : undefined,
            }}
          >
            {consentText?.text || "Carregando aviso legal…"}
          </pre>
          <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
            <input
              type="checkbox"
              checked={values.consent}
              onChange={(e) => onChange({ consent: e.target.checked })}
            />
            Li e aceito o aviso acima
          </label>
          {isInterview && (
            <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
              {captureMode === "microphone"
                ? "Ao iniciar, a captura será ajustada para saída do sistema + microfone (entrevistador e você)."
                : "Captura: saída do sistema + microfone, com identificação de quem falou."}
            </p>
          )}
          {!isInterview && captureMode !== "microphone" && (
            <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
              Captura: saída do sistema (reunião) + microfone (você).
            </p>
          )}
          {preflightStatus && (
            <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>{preflightStatus}</p>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={back}
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              color: C.text,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Voltar
          </button>
        )}
        {stepIndex < STEPS.length - 1 && (
          <button
            type="button"
            onClick={next}
            style={{
              background: C.accent,
              border: "none",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Próximo
          </button>
        )}
        {step === "consent" && (
          <button
            type="button"
            disabled={!values.consent}
            onClick={onStart}
            style={{
              background: values.consent ? C.accent : C.surface2,
              border: "none",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 6,
              cursor: values.consent ? "pointer" : "not-allowed",
            }}
          >
            {isInterview ? "Iniciar entrevista" : "Iniciar gravação"}
          </button>
        )}
      </div>
    </div>
  );
}
