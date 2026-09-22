import { useEffect, useState } from "react";
import type {
  LlmCloudProviderId,
  LlmSettingsPublic,
  LlmTaskKind,
  ModelSelectionProfile,
} from "@clone-perssua/shared-types";

type CatalogEntry = Awaited<ReturnType<typeof window.desktopApi.getLlmSettings>>["catalog"][number];
type LocalRuntime = Awaited<ReturnType<typeof window.desktopApi.getLlmSettings>>["localRuntime"];

const C = { surface2: "#242424", border: "#2e2e2e", accent: "#6366f1", text: "#e5e5e5", textMuted: "#888", success: "#22c55e", error: "#ef4444" };
const PROVIDERS: LlmCloudProviderId[] = ["gemini", "openai", "anthropic"];
const LABELS: Record<LlmCloudProviderId, string> = { gemini: "Google Gemini", openai: "OpenAI", anthropic: "Anthropic" };
const PROFILE_LABELS: Record<ModelSelectionProfile, string> = { auto: "Auto (recomendado)", light: "Leve", balanced: "Balanceado", high: "Alto", custom: "Personalizado" };
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

interface Props {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  onSettingsChanged?: () => void;
}

export function LlmProvidersSettings({ inputStyle, primaryBtn, onSettingsChanged }: Props): JSX.Element {
  const [llm, setLlm] = useState<LlmSettingsPublic | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [keys, setKeys] = useState<Record<LlmCloudProviderId, string>>({ gemini: "", openai: "", anthropic: "" });
  const [status, setStatus] = useState("");
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState<Partial<Record<LlmCloudProviderId, string[]>>>({});
  const [localRuntime, setLocalRuntime] = useState<LocalRuntime | null>(null);

  async function load(validateSavedKeys = false): Promise<void> {
    const result = await window.desktopApi.getLlmSettings();
    setLlm(result.llm);
    setCatalog(result.catalog);
    setLocalRuntime(result.localRuntime);
    if (validateSavedKeys) {
      await Promise.all(PROVIDERS.filter((pid) => result.llm.providers[pid].hasApiKey).map(async (pid) => {
        const checked = await window.desktopApi.testLlmProvider({ providerId: pid, modelId: result.llm.providers[pid].defaultModelId });
        setTestStatus((current) => ({ ...current, [pid]: checked.ok ? "Chave salva e validada" : `Falha ao validar a chave salva: ${checked.message}` }));
      }));
    }
  }
  useEffect(() => { void load(true); }, []);

  async function save(): Promise<void> {
    if (!llm) return;
    const providers = Object.fromEntries(PROVIDERS.map((pid) => {
      const candidateKey = keys[pid].trim();
      return [pid, {
        enabled: llm.providers[pid].enabled,
        defaultModelId: llm.providers[pid].defaultModelId,
        ...(candidateKey ? { apiKey: candidateKey } : {}),
      }];
    }));
    const saved = await window.desktopApi.saveLlmSettings({
      providers,
      routing: llm.routing,
      tokenBudget: llm.tokenBudget,
      privacy: llm.privacy,
      selection: llm.selection,
    });
    setKeys({ gemini: "", openai: "", anthropic: "" });
    setLlm(saved.llm);
    const savedProviders = PROVIDERS.filter((pid) => saved.llm.providers[pid].hasApiKey);
    setStatus(savedProviders.length > 0
      ? `Configurações salvas. Chave ativa: ${savedProviders.map((pid) => LABELS[pid]).join(", ")}.`
      : "Configurações salvas, mas nenhuma chave de API está configurada.");
    await load(false);
    onSettingsChanged?.();
  }

  async function testProvider(pid: LlmCloudProviderId): Promise<void> {
    const candidateKey = keys[pid].trim();
    const result = await window.desktopApi.testLlmProvider({ providerId: pid, modelId: llm?.providers[pid].defaultModelId, apiKey: candidateKey || undefined });
    setTestStatus((current) => ({ ...current, [pid]: result.ok ? "Conexão OK" : result.message }));
    if (result.ok && candidateKey && llm) {
      await window.desktopApi.saveLlmSettings({ providers: { [pid]: {
        enabled: true,
        defaultModelId: llm.providers[pid].defaultModelId,
        apiKey: candidateKey,
      } } });
      setKeys((current) => ({ ...current, [pid]: "" }));
      setTestStatus((current) => ({ ...current, [pid]: "Chave validada e salva" }));
      await load(false);
    }
    onSettingsChanged?.();
  }

  async function enableCloudFallback(): Promise<void> {
    await window.desktopApi.saveFeatureFlags({ providerMode: "cloud", localProviderEnabled: false, forceLocalOnly: false });
    setStatus("Fallback em nuvem ativado. O runtime local será ignorado enquanto não estiver configurado.");
    onSettingsChanged?.();
  }

  async function refreshModels(pid: LlmCloudProviderId): Promise<void> {
    try {
      const result = await window.desktopApi.listLlmProviderModels(pid, keys[pid].trim() || undefined);
      if (result.ok === false) throw new Error(result.message || "Falha ao atualizar modelos");
      setAvailable((current) => ({ ...current, [pid]: result.modelIds }));
      setTestStatus((current) => ({ ...current, [pid]: `${result.modelIds.length} modelo(s) disponível(is) na conta` }));
    } catch (error) {
      setTestStatus((current) => ({ ...current, [pid]: error instanceof Error ? error.message : "Falha ao atualizar modelos" }));
    }
  }

  if (!llm) return <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando…</p>;
  const customModels = catalog.filter((item) => item.providerId === llm.selection.customRoute.providerId);

  return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    {llm.selection.profile === "auto" && localRuntime && (!localRuntime.binaryPath || !localRuntime.modelPath) && <section style={{ border: `1px solid #f59e0b`, borderRadius: 9, padding: 12, display: "flex", flexDirection: "column", gap: 7 }}>
      <strong style={{ color: "#f59e0b" }}>Llama local não instalado — opcional no modo Auto</strong>
      <span style={{ color: C.textMuted, fontSize: 11 }}>
        O llama-server roda no seu computador e exige o binário e um modelo GGUF. Sem ele, o modo Auto usa uma API configurada; chamadas à OpenAI, Gemini ou Anthropic podem gerar custo no respectivo provedor. Os demais perfis nunca usam Llama.
      </span>
      <button type="button" style={{ ...primaryBtn, fontSize: 12 }} onClick={() => void enableCloudFallback()}>Ignorar Llama no Auto e usar APIs</button>
      <span style={{ color: C.textMuted, fontSize: 10 }}>Para inferência local real, configure LLAMA_SERVER_PATH, LLAMA_MODEL_PATH ou os arquivos em userData/runtime.</span>
    </section>}
    <section style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
      <strong style={{ color: C.text }}>Estratégia global</strong>
      <select value={llm.selection.profile} onChange={(e) => setLlm({ ...llm, selection: { ...llm.selection, profile: e.target.value as ModelSelectionProfile } })} style={inputStyle}>
        {Object.entries(PROFILE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <span style={{ color: C.textMuted, fontSize: 11 }}>
        Auto usa a atividade e os anexos para escolher sem fazer uma chamada extra de IA.
      </span>
      <label style={{ color: C.textMuted, fontSize: 12 }}>Provedor preferido</label>
      <select value={llm.selection.preferredProvider || "openai"} onChange={(e) => setLlm({ ...llm, selection: { ...llm.selection, preferredProvider: e.target.value as LlmCloudProviderId | "local" } })} style={inputStyle}>
        <option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="anthropic">Anthropic</option><option value="local">Local</option>
      </select>
      {llm.selection.profile === "custom" && <>
        <label style={{ color: C.textMuted, fontSize: 12 }}>Personalizar por</label>
        <select value={llm.selection.customMode} onChange={(e) => setLlm({ ...llm, selection: { ...llm.selection, customMode: e.target.value as "model" | "activity" } })} style={inputStyle}>
          <option value="model">Modelo fixo</option><option value="activity">Atividade</option>
        </select>
        {llm.selection.customMode === "model" ? <>
          <select value={llm.selection.customRoute.providerId} onChange={(e) => {
            const providerId = e.target.value as LlmCloudProviderId;
            const first = catalog.find((item) => item.providerId === providerId)?.modelId || llm.providers[providerId].defaultModelId;
            setLlm({ ...llm, selection: { ...llm.selection, customRoute: { providerId, modelId: first } } });
          }} style={inputStyle}>{PROVIDERS.map((pid) => <option key={pid} value={pid}>{LABELS[pid]}</option>)}</select>
          <select value={llm.selection.customRoute.modelId} onChange={(e) => setLlm({ ...llm, selection: { ...llm.selection, customRoute: { ...llm.selection.customRoute, modelId: e.target.value } } })} style={inputStyle}>
            {customModels.map((model) => <option key={model.modelId} value={model.modelId}>{model.label} — {model.description}</option>)}
          </select>
        </> : <select value={llm.selection.customTaskKind} onChange={(e) => setLlm({ ...llm, selection: { ...llm.selection, customTaskKind: e.target.value as LlmTaskKind } })} style={inputStyle}>
          {TASKS.map((task) => <option key={task.id} value={task.id}>{task.label}</option>)}
        </select>}
      </>}
    </section>

    {PROVIDERS.map((pid) => <section key={pid} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ color: C.text }}>{LABELS[pid]}</strong><label style={{ color: C.textMuted, fontSize: 11 }}><input type="checkbox" checked={llm.providers[pid].enabled} onChange={(e) => setLlm({ ...llm, providers: { ...llm.providers, [pid]: { ...llm.providers[pid], enabled: e.target.checked } } })} /> Ativo</label></div>
      <span style={{ color: llm.providers[pid].hasApiKey ? C.success : C.error, fontSize: 11 }}>{llm.providers[pid].hasApiKey ? "Chave salva" : "Sem chave"}</span>
      <select value={llm.providers[pid].defaultModelId} onChange={(e) => setLlm({ ...llm, providers: { ...llm.providers, [pid]: { ...llm.providers[pid], defaultModelId: e.target.value } } })} style={inputStyle}>
        {catalog.filter((item) => item.providerId === pid).map((model) => <option key={model.modelId} value={model.modelId} disabled={Boolean(available[pid]) && !available[pid]?.includes(model.modelId)}>{model.label} — {model.description}{available[pid] && !available[pid]?.includes(model.modelId) ? " (indisponível)" : ""}</option>)}
      </select>
      <input type="password" placeholder="Nova API key (deixe vazio para manter)" value={keys[pid]} onChange={(e) => setKeys({ ...keys, [pid]: e.target.value })} style={inputStyle} />
      <div style={{ display: "flex", gap: 7 }}>
        <button type="button" style={{ ...primaryBtn, fontSize: 12, flex: 1 }} onClick={() => void testProvider(pid)}>Testar conexão</button>
        <button type="button" style={{ ...primaryBtn, fontSize: 12, flex: 1 }} onClick={() => void refreshModels(pid)}>Atualizar modelos</button>
      </div>
      {testStatus[pid] && <span style={{ color: /OK|validada|salva e validada/.test(testStatus[pid]) ? C.success : C.error, fontSize: 11 }}>{testStatus[pid]}</span>}
    </section>)}

    <button type="button" style={primaryBtn} onClick={() => void save()}>Salvar IA e modelos</button>
    {status && <span style={{ color: C.success, fontSize: 12 }}>{status}</span>}
  </div>;
}
