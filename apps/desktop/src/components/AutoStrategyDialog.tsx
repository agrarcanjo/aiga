import { useEffect, useState } from "react";
import type { LlmCloudProviderId, LlmRoute, LlmTaskKind } from "@clone-perssua/shared-types";
import type { ModelOption } from "../lib/modelOptions";
import { ModelCombobox } from "./ModelCombobox";

const C = {
  overlay: "rgba(0,0,0,0.62)",
  surface: "#161616",
  border: "#2e2e2e",
  text: "#e5e5e5",
  muted: "#888",
  accent: "#6366f1",
};

export const AUTO_TASKS: Array<{ id: LlmTaskKind; label: string; hint: string }> = [
  { id: "simple_text", label: "Pergunta simples", hint: "Modelo rápido e barato." },
  { id: "complex_reasoning", label: "Raciocínio complexo", hint: "Modelo mais capaz, mesmo que seja mais lento." },
  { id: "code", label: "Código", hint: "Modelo forte em programação." },
  { id: "screenshot_general", label: "Screenshot geral", hint: "Modelo com visão de imagens." },
  { id: "screenshot_code", label: "Screenshot de código", hint: "Modelo com visão e boa leitura de código." },
  { id: "screenshot_error", label: "Screenshot de erro", hint: "Modelo com visão, capaz de diagnosticar erros." },
  { id: "aws_exam_screenshot", label: "Questão de prova AWS", hint: "Modelo com visão e raciocínio alto." },
  { id: "audio_question", label: "Pergunta por áudio", hint: "Modelo que aceite áudio; se não houver, use um modelo rápido de texto." },
  { id: "meeting_summary", label: "Resumo de reunião", hint: "Modelo equilibrado para textos longos." },
  { id: "meeting_classifier", label: "Classificador de reunião", hint: "Modelo rápido para uma resposta curta." },
  { id: "translation", label: "Tradução do texto", hint: "Modelo rápido e fiel. A transcrição do áudio é configurada em Tradução." },
];

const PROVIDERS: LlmCloudProviderId[] = ["openai", "gemini", "anthropic"];
const LABELS: Record<LlmCloudProviderId, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Anthropic",
};

interface AutoStrategyDialogProps {
  routes: Partial<Record<LlmTaskKind, LlmRoute>>;
  defaults: Record<LlmCloudProviderId, string>;
  optionsFor: (providerId: LlmCloudProviderId, selectedId: string) => ModelOption[];
  loading: Partial<Record<LlmCloudProviderId, boolean>>;
  onClose: () => void;
  onSave: (routes: Partial<Record<LlmTaskKind, LlmRoute>>) => void;
}

export function AutoStrategyDialog({
  routes,
  defaults,
  optionsFor,
  loading,
  onClose,
  onSave,
}: AutoStrategyDialogProps): JSX.Element {
  const [draft, setDraft] = useState<Partial<Record<LlmTaskKind, LlmRoute>>>(() =>
    Object.fromEntries(
      AUTO_TASKS.map((task) => {
        const route = routes[task.id];
        const providerId =
          route?.providerId && route.providerId !== "local" ? route.providerId : "openai";
        return [task.id, { providerId, modelId: route?.modelId || defaults[providerId] || "" }];
      })
    )
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function update(task: LlmTaskKind, route: LlmRoute): void {
    setDraft((current) => ({ ...current, [task]: route }));
  }

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: C.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Modelos do modo Auto"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          maxHeight: "min(820px, calc(100vh - 48px))",
          overflow: "auto",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
        }}
      >
        <div>
          <strong style={{ color: C.text, fontSize: 16 }}>Modelos do modo Auto</strong>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "6px 0 0" }}>
            Escolha o modelo de cada tarefa. A sugestão indica o tipo de modelo; o id exato fica
            com você, para atualizar quando o provedor lançar ou aposentar um modelo.
          </p>
        </div>
        {AUTO_TASKS.map((task) => {
          const route = draft[task.id];
          const providerId =
            route?.providerId && route.providerId !== "local" ? route.providerId : "openai";
          const modelId = route?.modelId || defaults[providerId] || "";
          return (
            <section
              key={task.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 240px) 150px minmax(180px, 1fr)",
                gap: 10,
                alignItems: "center",
                borderTop: `1px solid ${C.border}`,
                paddingTop: 12,
              }}
            >
              <div>
                <strong style={{ color: C.text, fontSize: 13 }}>{task.label}</strong>
                <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.4, margin: "4px 0 0" }}>
                  {task.hint}
                </p>
              </div>
              <select
                aria-label={`Provedor de ${task.label}`}
                value={providerId}
                onChange={(event) => {
                  const nextProvider = event.target.value as LlmCloudProviderId;
                  update(task.id, {
                    providerId: nextProvider,
                    modelId: defaults[nextProvider] || "",
                  });
                }}
                onMouseDown={(event) => event.stopPropagation()}
                style={{
                  background: "#242424",
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {PROVIDERS.map((id) => (
                  <option key={id} value={id}>
                    {LABELS[id]}
                  </option>
                ))}
              </select>
              <ModelCombobox
                ariaLabel={`Modelo de ${task.label}`}
                value={modelId}
                loading={Boolean(loading[providerId])}
                options={optionsFor(providerId, modelId)}
                onChange={(nextModel) => update(task.id, { providerId, modelId: nextModel })}
              />
            </section>
          );
        })}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#242424",
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            style={{
              background: C.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Aplicar modelos
          </button>
        </div>
      </div>
    </div>
  );
}
