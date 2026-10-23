import { useEffect, useState } from "react";
import type {
  LlmCloudProviderId,
  LlmRouteTarget,
  LlmSettingsPublic,
  LlmTaskKind,
  ModelSelectionProfile,
} from "@clone-perssua/shared-types";
import { buildModelOptions, isChatModel } from "../lib/modelOptions";
import { AutoStrategyDialog } from "./AutoStrategyDialog";
import { ModelCombobox } from "./ModelCombobox";

type CatalogEntry = Awaited<ReturnType<typeof window.desktopApi.getLlmSettings>>["catalog"][number];
type LocalRuntime = Awaited<ReturnType<typeof window.desktopApi.getLlmSettings>>["localRuntime"];

const C = {
  surface: "#1a1a1a",
  surface2: "#242424",
  border: "#2e2e2e",
  accent: "#6366f1",
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  error: "#ef4444",
  warn: "#f59e0b",
};

const CLOUD_PROVIDERS: LlmCloudProviderId[] = ["openai", "gemini", "anthropic"];
const LABELS: Record<LlmRouteTarget, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic",
  local: "Llama local",
};
const PROFILE_LABELS: Record<ModelSelectionProfile, string> = {
  auto: "Auto (recomendado)",
  light: "Leve",
  balanced: "Balanceado",
  high: "Alto",
  custom: "Personalizado",
};
const TASKS: Array<{ id: LlmTaskKind; label: string }> = [
  { id: "simple_text", label: "Pergunta simples" },
  { id: "complex_reasoning", label: "Raciocínio complexo" },
  { id: "code", label: "Código / algoritmo" },
  { id: "screenshot_general", label: "Screenshot geral" },
  { id: "screenshot_code", label: "Screenshot de código" },
  { id: "screenshot_error", label: "Screenshot de erro" },
  { id: "aws_exam_screenshot", label: "Questão de prova AWS" },
  { id: "audio_question", label: "Pergunta por áudio" },
  { id: "meeting_summary", label: "Resumo de reunião" },
  { id: "meeting_classifier", label: "Classificador de reunião" },
  { id: "translation", label: "Tradução" },
];

const DEFAULT_PRIORITY: LlmRouteTarget[] = ["openai", "gemini", "anthropic"];

function normalizePriority(list: LlmRouteTarget[] | undefined): LlmRouteTarget[] {
  const seen = new Set<LlmRouteTarget>();
  const out: LlmRouteTarget[] = [];
  for (const id of list || []) {
    if (!LABELS[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of DEFAULT_PRIORITY) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

interface Props {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  onSettingsChanged?: () => void;
}

function cardStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: C.surface,
    ...extra,
  };
}

function sectionTitle(title: string, subtitle?: string): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <strong style={{ color: C.text, fontSize: 13 }}>{title}</strong>
      {subtitle && (
        <span style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.45 }}>{subtitle}</span>
      )}
    </div>
  );
}

export function LlmProvidersSettings({
  inputStyle,
  primaryBtn,
  onSettingsChanged,
}: Props): JSX.Element {
  const [llm, setLlm] = useState<LlmSettingsPublic | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [keys, setKeys] = useState<Record<LlmCloudProviderId, string>>({
    gemini: "",
    openai: "",
    anthropic: "",
  });
  const [status, setStatus] = useState("");
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState<Partial<Record<LlmCloudProviderId, string[]>>>({});
  const [loadingModels, setLoadingModels] = useState<Partial<Record<LlmCloudProviderId, boolean>>>({});
  const [localRuntime, setLocalRuntime] = useState<LocalRuntime | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<LlmCloudProviderId | null>("openai");
  const [autoDialogOpen, setAutoDialogOpen] = useState(false);

  async function load(validateSavedKeys = false): Promise<void> {
    const result = await window.desktopApi.getLlmSettings();
    const selection = {
      ...result.llm.selection,
      providerPriority: normalizePriority(result.llm.selection.providerPriority),
    };
    setLlm({ ...result.llm, selection });
    setCatalog(result.catalog);
    setLocalRuntime(result.localRuntime);
    CLOUD_PROVIDERS.filter((pid) => result.llm.providers[pid].hasApiKey).forEach((pid) => {
      void fetchModels(pid).catch(() => undefined);
    });
    if (validateSavedKeys) {
      await Promise.all(
        CLOUD_PROVIDERS.filter((pid) => result.llm.providers[pid].hasApiKey).map(async (pid) => {
          const checked = await window.desktopApi.testLlmProvider({
            providerId: pid,
            modelId: result.llm.providers[pid].defaultModelId,
          });
          setTestStatus((current) => ({
            ...current,
            [pid]: checked.ok
              ? "Chave salva e validada"
              : checked.keyValid
                ? checked.message
                : `Falha ao validar a chave salva: ${checked.message}`,
          }));
        })
      );
    }
  }

  useEffect(() => {
    void load(true);
  }, []);

  function movePriority(index: number, direction: -1 | 1): void {
    if (!llm) return;
    const list = normalizePriority(llm.selection.providerPriority);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = list.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setLlm({
      ...llm,
      selection: { ...llm.selection, providerPriority: next, preferredProvider: next[0] },
    });
  }

  async function save(): Promise<void> {
    if (!llm) return;
    const providers = Object.fromEntries(
      CLOUD_PROVIDERS.map((pid) => {
        const candidateKey = keys[pid].trim();
        return [
          pid,
          {
            enabled: llm.providers[pid].enabled,
            defaultModelId: llm.providers[pid].defaultModelId,
            ...(candidateKey ? { apiKey: candidateKey } : {}),
          },
        ];
      })
    );
    const priority = normalizePriority(llm.selection.providerPriority);
    const saved = await window.desktopApi.saveLlmSettings({
      providers,
      routing: llm.routing,
      tokenBudget: llm.tokenBudget,
      privacy: llm.privacy,
      selection: {
        ...llm.selection,
        providerPriority: priority,
        preferredProvider: priority[0],
        allowFallback: llm.selection.allowFallback !== false,
      },
    });
    setKeys({ gemini: "", openai: "", anthropic: "" });
    setLlm({
      ...saved.llm,
      selection: {
        ...saved.llm.selection,
        providerPriority: normalizePriority(saved.llm.selection.providerPriority),
      },
    });
    const savedProviders = CLOUD_PROVIDERS.filter((pid) => saved.llm.providers[pid].hasApiKey);
    setStatus(
      savedProviders.length > 0
        ? `Salvo. Prioridade: ${priority.map((id) => LABELS[id]).join(" → ")}. Chaves: ${savedProviders
            .map((pid) => LABELS[pid])
            .join(", ")}.`
        : "Salvo, mas nenhuma chave de API está configurada."
    );
    await load(false);
    onSettingsChanged?.();
  }

  async function testProvider(pid: LlmCloudProviderId): Promise<void> {
    const candidateKey = keys[pid].trim();
    const result = await window.desktopApi.testLlmProvider({
      providerId: pid,
      modelId: llm?.providers[pid].defaultModelId,
      apiKey: candidateKey || undefined,
    });
    const keyValid = result.ok || result.keyValid === true;
    setTestStatus((current) => ({
      ...current,
      [pid]: result.ok ? "Conexão OK" : result.message,
    }));
    if (keyValid && candidateKey && llm) {
      await window.desktopApi.saveLlmSettings({
        providers: {
          [pid]: {
            enabled: true,
            defaultModelId: llm.providers[pid].defaultModelId,
            apiKey: candidateKey,
          },
        },
      });
      setKeys((current) => ({ ...current, [pid]: "" }));
      setTestStatus((current) => ({
        ...current,
        [pid]: result.ok
          ? "Chave validada e salva"
          : `Chave salva. ${result.message} Escolha outro modelo na lista e salve.`,
      }));
      await load(false);
    }
    onSettingsChanged?.();
  }

  async function enableCloudFallback(): Promise<void> {
    await window.desktopApi.saveFeatureFlags({
      providerMode: "cloud",
      localProviderEnabled: false,
      forceLocalOnly: false,
    });
    setStatus("Fallback em nuvem ativado. O runtime local será ignorado enquanto não estiver configurado.");
    onSettingsChanged?.();
  }

  async function fetchModels(pid: LlmCloudProviderId, candidateKey?: string): Promise<string[]> {
    setLoadingModels((current) => ({ ...current, [pid]: true }));
    try {
      const result = await window.desktopApi.listLlmProviderModels(pid, candidateKey);
      if (result.ok === false) throw new Error(result.message || "Falha ao atualizar modelos");
      setAvailable((current) => ({ ...current, [pid]: result.modelIds }));
      return result.modelIds;
    } finally {
      setLoadingModels((current) => ({ ...current, [pid]: false }));
    }
  }

  async function refreshModels(pid: LlmCloudProviderId): Promise<void> {
    try {
      const modelIds = await fetchModels(pid, keys[pid].trim() || undefined);
      setTestStatus((current) => ({
        ...current,
        [pid]: `${modelIds.filter(isChatModel).length} modelo(s) de chat disponíveis na conta.`,
      }));
    } catch (error) {
      setTestStatus((current) => ({
        ...current,
        [pid]: error instanceof Error ? error.message : "Falha ao atualizar modelos",
      }));
    }
  }

  if (!llm) {
    return <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando…</p>;
  }

  const priority = normalizePriority(llm.selection.providerPriority);
  const customProviderId = llm.selection.customRoute.providerId;
  const optionsFor = (pid: LlmCloudProviderId, selectedId: string) =>
    buildModelOptions(
      catalog.filter((item) => item.providerId === pid).map((item) => item.modelId),
      available[pid],
      selectedId
    );
  const secondaryBtn: React.CSSProperties = {
    ...primaryBtn,
    background: C.surface2,
    border: `1px solid ${C.border}`,
    color: C.text,
    fontWeight: 500,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {llm.selection.profile === "auto" &&
        localRuntime &&
        (!localRuntime.binaryPath || !localRuntime.modelPath) && (
          <section style={cardStyle({ borderColor: C.warn })}>
            <strong style={{ color: C.warn }}>Llama local opcional (modo Auto)</strong>
            <span style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.45 }}>
              Sem Llama, o Auto usa a prioridade de APIs abaixo. Chamadas cloud podem gerar custo.
            </span>
            <button
              type="button"
              style={{ ...primaryBtn, fontSize: 12, alignSelf: "flex-start" }}
              onClick={() => void enableCloudFallback()}
            >
              Usar só APIs no Auto
            </button>
          </section>
        )}

      {/* 1. Estratégia */}
      <section style={cardStyle()}>
        {sectionTitle(
          "1. Estratégia global",
          "Define como escolher o modelo (custo × qualidade). Vale para chat, tradução e reunião."
        )}
        <select
          value={llm.selection.profile}
          onChange={(e) =>
            setLlm({
              ...llm,
              selection: {
                ...llm.selection,
                profile: e.target.value as ModelSelectionProfile,
              },
            })
          }
          onMouseDown={(e) => e.stopPropagation()}
          style={inputStyle}
        >
          {Object.entries(PROFILE_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>

        {llm.selection.profile === "auto" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.45 }}>
              {Object.keys(llm.selection.autoRoutes || {}).length} de 11 tarefas com modelo
              definido. Sem definição, o Auto continua na lista interna, que pode ficar
              desatualizada.
            </span>
            <button
              type="button"
              style={{ ...secondaryBtn, alignSelf: "flex-start", fontSize: 12 }}
              onClick={() => {
                CLOUD_PROVIDERS.filter((pid) => llm.providers[pid].hasApiKey).forEach((pid) => {
                  if (!available[pid]) void fetchModels(pid).catch(() => undefined);
                });
                setAutoDialogOpen(true);
              }}
            >
              Configurar modelos do Auto
            </button>
          </div>
        )}

        {llm.selection.profile === "custom" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <label style={{ color: C.textMuted, fontSize: 12 }}>Personalizar por</label>
            <select
              value={llm.selection.customMode}
              onChange={(e) =>
                setLlm({
                  ...llm,
                  selection: {
                    ...llm.selection,
                    customMode: e.target.value as "model" | "activity",
                  },
                })
              }
              onMouseDown={(e) => e.stopPropagation()}
              style={inputStyle}
            >
              <option value="model">Modelo fixo</option>
              <option value="activity">Tipo de atividade</option>
            </select>
            {llm.selection.customMode === "model" ? (
              <>
                <select
                  value={llm.selection.customRoute.providerId}
                  onChange={(e) => {
                    const providerId = e.target.value as LlmCloudProviderId;
                    const first = llm.providers[providerId].defaultModelId;
                    setLlm({
                      ...llm,
                      selection: {
                        ...llm.selection,
                        customRoute: { providerId, modelId: first },
                      },
                    });
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={inputStyle}
                >
                  {CLOUD_PROVIDERS.map((pid) => (
                    <option key={pid} value={pid}>
                      {LABELS[pid]}
                    </option>
                  ))}
                </select>
                {customProviderId !== "local" && (
                  <ModelCombobox
                    ariaLabel="Modelo fixo"
                    value={llm.selection.customRoute.modelId}
                    options={optionsFor(customProviderId, llm.selection.customRoute.modelId)}
                    loading={Boolean(loadingModels[customProviderId])}
                    onChange={(modelId) =>
                      setLlm({
                        ...llm,
                        selection: {
                          ...llm.selection,
                          customRoute: { ...llm.selection.customRoute, modelId },
                        },
                      })
                    }
                  />
                )}
              </>
            ) : (
              <select
                value={llm.selection.customTaskKind}
                onChange={(e) =>
                  setLlm({
                    ...llm,
                    selection: {
                      ...llm.selection,
                      customTaskKind: e.target.value as LlmTaskKind,
                    },
                  })
                }
                onMouseDown={(e) => e.stopPropagation()}
                style={inputStyle}
              >
                {TASKS.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </section>

      {/* 2. Prioridade */}
      <section style={cardStyle()}>
        {sectionTitle(
          "2. Prioridade de provedores",
          "A ordem vale globalmente (chat, tradução ao vivo, reunião). Se o 1º falhar ou estiver desligado, tenta o próximo."
        )}
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: C.text,
            fontSize: 12,
          }}
        >
          <input
            type="checkbox"
            checked={llm.selection.allowFallback !== false}
            onChange={(e) =>
              setLlm({
                ...llm,
                selection: { ...llm.selection, allowFallback: e.target.checked },
              })
            }
          />
          Tentar o próximo provedor se o atual falhar
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {priority.map((providerId, index) => {
            const cloud = providerId !== "local";
            const cfg = cloud ? llm.providers[providerId as LlmCloudProviderId] : null;
            const ready = cloud
              ? Boolean(cfg?.enabled && cfg?.hasApiKey)
              : Boolean(localRuntime?.binaryPath && localRuntime?.modelPath);
            return (
              <div
                key={providerId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${index === 0 ? C.accent : C.border}`,
                  background: C.surface2,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: index === 0 ? C.accent : "#333",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {index + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>
                    {LABELS[providerId]}
                    {index === 0 ? " · principal" : ""}
                  </div>
                  <div style={{ color: ready ? C.success : C.textMuted, fontSize: 10 }}>
                    {ready ? "Pronto" : cloud ? "Desligado ou sem chave" : "Runtime local ausente"}
                  </div>
                </div>
                <button
                  type="button"
                  style={{ ...secondaryBtn, padding: "4px 8px", fontSize: 11 }}
                  disabled={index === 0}
                  onClick={() => movePriority(index, -1)}
                  title="Subir prioridade"
                >
                  ↑
                </button>
                <button
                  type="button"
                  style={{ ...secondaryBtn, padding: "4px 8px", fontSize: 11 }}
                  disabled={index === priority.length - 1}
                  onClick={() => movePriority(index, 1)}
                  title="Descer prioridade"
                >
                  ↓
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          style={{ ...secondaryBtn, fontSize: 11, alignSelf: "flex-start" }}
          onClick={() => {
            const withoutLocal = priority.filter((id) => id !== "local");
            const withLocal: LlmRouteTarget[] = [...withoutLocal, "local"];
            setLlm({
              ...llm,
              selection: {
                ...llm.selection,
                providerPriority: priority.includes("local") ? withoutLocal : withLocal,
              },
            });
          }}
        >
          {priority.includes("local") ? "Remover Llama da prioridade" : "Incluir Llama na prioridade"}
        </button>
      </section>

      {/* 3. Cadastro de provedores */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sectionTitle(
          "3. Cadastro de provedores",
          "Ative, cole a API key, escolha o modelo padrão e teste a conexão."
        )}
        {CLOUD_PROVIDERS.map((pid) => {
          const open = expandedProvider === pid;
          const provider = llm.providers[pid];
          return (
            <div key={pid} style={cardStyle()}>
              <button
                type="button"
                onClick={() => setExpandedProvider(open ? null : pid)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  color: C.text,
                  textAlign: "left",
                }}
              >
                <span style={{ fontWeight: 650, fontSize: 13 }}>{LABELS[pid]}</span>
                <span style={{ color: C.textMuted, fontSize: 11 }}>
                  {provider.enabled ? "Ativo" : "Desligado"}
                  {" · "}
                  {provider.hasApiKey ? "chave OK" : "sem chave"}
                  {" · "}
                  {open ? "▾" : "▸"}
                </span>
              </button>

              {open && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      color: C.text,
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={(e) =>
                        setLlm({
                          ...llm,
                          providers: {
                            ...llm.providers,
                            [pid]: { ...provider, enabled: e.target.checked },
                          },
                        })
                      }
                    />
                    Usar este provedor na prioridade (quando tiver chave)
                  </label>

                  <label style={{ color: C.textMuted, fontSize: 11 }}>Modelo padrão</label>
                  <ModelCombobox
                    ariaLabel={`Modelo padrão ${LABELS[pid]}`}
                    value={provider.defaultModelId}
                    options={optionsFor(pid, provider.defaultModelId)}
                    loading={Boolean(loadingModels[pid])}
                    onChange={(modelId) =>
                      setLlm({
                        ...llm,
                        providers: {
                          ...llm.providers,
                          [pid]: { ...provider, defaultModelId: modelId },
                        },
                      })
                    }
                  />

                  <label style={{ color: C.textMuted, fontSize: 11 }}>API key</label>
                  <input
                    type="password"
                    placeholder={
                      provider.hasApiKey
                        ? "Nova chave (vazio = manter a salva)"
                        : "Cole a API key"
                    }
                    value={keys[pid]}
                    onChange={(e) => setKeys({ ...keys, [pid]: e.target.value })}
                    style={inputStyle}
                  />

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={{ ...primaryBtn, fontSize: 12, flex: 1 }}
                      onClick={() => void testProvider(pid)}
                    >
                      Testar conexão
                    </button>
                    <button
                      type="button"
                      style={{ ...secondaryBtn, fontSize: 12, flex: 1 }}
                      onClick={() => void refreshModels(pid)}
                    >
                      Atualizar modelos
                    </button>
                  </div>
                  {testStatus[pid] && (
                    <span
                      style={{
                        color: /falhou/.test(testStatus[pid])
                          ? C.warn
                          : /OK|validada|salva|disponíveis/.test(testStatus[pid])
                            ? C.success
                            : C.error,
                        fontSize: 11,
                        userSelect: "text",
                      }}
                    >
                      {testStatus[pid]}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <button type="button" style={primaryBtn} onClick={() => void save()}>
        Salvar IA e modelos
      </button>
      {status && (
        <span style={{ color: C.success, fontSize: 12, userSelect: "text" }}>{status}</span>
      )}
      {autoDialogOpen && (
        <AutoStrategyDialog
          routes={llm.selection.autoRoutes || {}}
          defaults={{
            openai: llm.providers.openai.defaultModelId,
            gemini: llm.providers.gemini.defaultModelId,
            anthropic: llm.providers.anthropic.defaultModelId,
          }}
          optionsFor={optionsFor}
          loading={loadingModels}
          onClose={() => setAutoDialogOpen(false)}
          onSave={(routes) => {
            setLlm({ ...llm, selection: { ...llm.selection, autoRoutes: routes } });
            setAutoDialogOpen(false);
            setStatus("Modelos do Auto aplicados. Clique em Salvar IA e modelos.");
          }}
        />
      )}
    </div>
  );
}
