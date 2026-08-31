import { useEffect, useState } from "react";
import type { TranslationLanguageCode, TranslationPrefs } from "@clone-perssua/shared-types";
import { TranscriptionPacksSettings } from "./TranscriptionPacksSettings";

const C = {
  text: "#e5e5e5",
  textMuted: "#888",
  success: "#22c55e",
  border: "#2e2e2e",
};

const LANG_OPTIONS: { value: TranslationLanguageCode; label: string }[] = [
  { value: "auto", label: "Automático" },
  { value: "en", label: "Inglês" },
  { value: "pt", label: "Português" },
  { value: "es", label: "Espanhol" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
];

const TARGET_OPTIONS = LANG_OPTIONS.filter((o) => o.value !== "auto");

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
    sourceLanguage: "auto",
    targetLanguage: "pt",
    overlayFontSize: 14,
    overlayOpacity: 0.92,
    historyLines: 8,
    overlayEnabled: true,
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    void window.desktopApi.getSettings().then((r) => {
      if (r.settings.translationPrefs) {
        setPrefs(r.settings.translationPrefs);
      }
    });
  }, []);

  async function save(): Promise<void> {
    await window.desktopApi.saveSettings({ translationPrefs: prefs });
    setStatus("Preferências de tradução salvas.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: C.textMuted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        Padrões do modo legendas ao vivo (idiomas, overlay flutuante e histórico na UI).
      </p>
      <label style={{ color: C.textMuted, fontSize: 12 }}>Idioma origem padrão</label>
      <select
        value={prefs.sourceLanguage}
        onChange={(e) =>
          setPrefs({ ...prefs, sourceLanguage: e.target.value as TranslationLanguageCode })
        }
        style={inputStyle}
      >
        {LANG_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label style={{ color: C.textMuted, fontSize: 12 }}>Idioma destino padrão</label>
      <select
        value={prefs.targetLanguage}
        onChange={(e) =>
          setPrefs({ ...prefs, targetLanguage: e.target.value as TranslationLanguageCode })
        }
        style={inputStyle}
      >
        {TARGET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.text }}>
        <input
          type="checkbox"
          checked={prefs.overlayEnabled !== false}
          onChange={(e) => setPrefs({ ...prefs, overlayEnabled: e.target.checked })}
        />
        Abrir overlay always-on-top durante sessão
      </label>
      <label style={{ color: C.textMuted, fontSize: 12 }}>
        Tamanho da fonte no overlay: {prefs.overlayFontSize}px
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
        <TranscriptionPacksSettings
          inputStyle={inputStyle}
          primaryBtn={primaryBtn}
          secondaryBtn={secondaryBtn}
        />
      </div>
    </div>
  );
}
