import { useEffect, useState } from "react";
import type { TranslationLanguageCode, TranslationPrefs } from "@clone-perssua/shared-types";
import { buildModelOptions } from "../lib/modelOptions";
import { ModelCombobox } from "./ModelCombobox";
import { TranscriptionPacksSettings } from "./TranscriptionPacksSettings";

const C = {
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  border: "#2e2e2e",
};

const SOURCE_OPTIONS: { value: TranslationLanguageCode; label: string }[] = [
  { value: "en", label: "Inglês" },
  { value: "pt", label: "Português" },
  { value: "es", label: "Espanhol" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
  { value: "auto", label: "Automático" },
];

const TARGET_OPTIONS = SOURCE_OPTIONS.filter((option) => option.value !== "auto");

interface TranslationSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

export function TranslationSettings({
  inputStyle,
  primaryBtn,
  secondaryBtn,
}: TranslationSettingsProps): JSX.Element {
  const [prefs, setPrefs] = useState<TranslationPrefs>({
    sourceLanguage: "en",
    targetLanguage: "pt",
    overlayFontSize: 14,
    overlayOpacity: 0.92,
    historyLines: 8,
    realtimeModel: "gpt-realtime-1.5",
    transcriptionModel: "gpt-4o-mini-transcribe",
    overlayEnabled: false,
  });
  const [status, setStatus] = useState("");
  const [openaiModels, setOpenaiModels] = useState<string[] | undefined>();
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    void window.desktopApi.getSettings().then((r) => {
      if (r.settings.translationPrefs) {
        setPrefs(r.settings.translationPrefs);
      }
    });
    void window.desktopApi.getLlmSettings().then(async (result) => {
      if (!result.llm.providers.openai.hasApiKey) return;
      setLoadingModels(true);
      try {
        const listed = await window.desktopApi.listLlmProviderModels("openai");
        if (listed.ok !== false) setOpenaiModels(listed.modelIds);
      } finally {
        setLoadingModels(false);
      }
    });
  }, []);

  async function save(): Promise<void> {
    await window.desktopApi.saveSettings({
      translationPrefs: { ...prefs, overlayEnabled: false },
    });
    setStatus("Preferências de tradução salvas.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={{ color: C.textMuted, fontSize: 12 }}>Idioma origem</label>
      <select
        value={prefs.sourceLanguage || "en"}
        onChange={(e) =>
          setPrefs({ ...prefs, sourceLanguage: e.target.value as TranslationLanguageCode })
        }
        onMouseDown={(e) => e.stopPropagation()}
        style={{ ...inputStyle, userSelect: "auto", WebkitUserSelect: "auto" } as React.CSSProperties}
      >
        {SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label style={{ color: C.textMuted, fontSize: 12 }}>Idioma destino</label>
      <select
        value={prefs.targetLanguage}
        onChange={(e) =>
          setPrefs({ ...prefs, targetLanguage: e.target.value as TranslationLanguageCode })
        }
        onMouseDown={(e) => e.stopPropagation()}
        style={{ ...inputStyle, userSelect: "auto", WebkitUserSelect: "auto" } as React.CSSProperties}
      >
        {TARGET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label style={{ color: C.textMuted, fontSize: 12 }}>Modelo da sessão Realtime</label>
      <p style={{ color: C.textMuted, fontSize: 11, margin: 0, lineHeight: 1.45 }}>
        A OpenAI exige este modelo na conexão. O exemplo atual é{" "}
        <code>gpt-realtime-1.5</code>. Quando a conta mudar, pesquise o novo id aqui ou digite-o
        e escolha “Usar”.
      </p>
      <ModelCombobox
        ariaLabel="Modelo da sessão Realtime"
        value={prefs.realtimeModel || "gpt-realtime-1.5"}
        loading={loadingModels}
        options={buildModelOptions(
          ["gpt-realtime-1.5"],
          openaiModels,
          prefs.realtimeModel || "gpt-realtime-1.5",
          { includeAll: true }
        )}
        onChange={(realtimeModel) => setPrefs({ ...prefs, realtimeModel })}
      />
      <label style={{ color: C.textMuted, fontSize: 12 }}>Modelo de transcrição</label>
      <p style={{ color: C.textMuted, fontSize: 11, margin: 0, lineHeight: 1.45 }}>
        Transforma o áudio em texto. Escolha um modelo de transcrição da conta, como{" "}
        <code>gpt-4o-mini-transcribe</code> ou o sucessor indicado pela OpenAI.
      </p>
      <ModelCombobox
        ariaLabel="Modelo de transcrição"
        value={prefs.transcriptionModel || "gpt-4o-mini-transcribe"}
        loading={loadingModels}
        options={buildModelOptions(
          ["gpt-4o-mini-transcribe"],
          openaiModels,
          prefs.transcriptionModel || "gpt-4o-mini-transcribe",
          { includeAll: true }
        )}
        onChange={(transcriptionModel) => setPrefs({ ...prefs, transcriptionModel })}
      />
      <label style={{ color: C.textMuted, fontSize: 12 }}>
        Tamanho da fonte no overlay flutuante: {prefs.overlayFontSize}px
      </label>
      <input
        type="range"
        min={12}
        max={24}
        value={prefs.overlayFontSize}
        onChange={(e) => setPrefs({ ...prefs, overlayFontSize: Number(e.target.value) })}
      />
      <label style={{ color: C.textMuted, fontSize: 12 }}>
        Opacidade do painel de legendas: {Math.round((prefs.overlayOpacity || 0.92) * 100)}%
      </label>
      <input
        type="range"
        min={0.5}
        max={1}
        step={0.02}
        value={prefs.overlayOpacity}
        onChange={(e) => setPrefs({ ...prefs, overlayOpacity: Number(e.target.value) })}
      />
      <label style={{ color: C.textMuted, fontSize: 12 }}>
        Linhas de histórico na UI: {prefs.historyLines}
      </label>
      <input
        type="range"
        min={4}
        max={20}
        value={prefs.historyLines}
        onChange={(e) => setPrefs({ ...prefs, historyLines: Number(e.target.value) })}
      />
      <button type="button" style={primaryBtn} onClick={() => void save()}>
        Salvar tradução
      </button>
      {status && <span style={{ color: C.success, fontSize: 12 }}>{status}</span>}

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 8 }}>
        <p style={{ color: C.textMuted, fontSize: 12, margin: "0 0 12px", lineHeight: 1.5 }}>
          Os pacotes Whisper abaixo são usados na transcrição de reuniões gravadas (local, sem
          tempo real), não nas legendas ao vivo.
        </p>
        <TranscriptionPacksSettings
          inputStyle={inputStyle}
          primaryBtn={primaryBtn}
          secondaryBtn={secondaryBtn}
        />
      </div>
    </div>
  );
}
