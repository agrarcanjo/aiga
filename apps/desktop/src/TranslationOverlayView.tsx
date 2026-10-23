import { useEffect, useState } from "react";
import type { TranslationLineEvent, TranslationPrefs } from "@clone-perssua/shared-types";

interface PartialEntry {
  itemId: string;
  text: string;
}

export function TranslationOverlayView(): JSX.Element {
  const [lines, setLines] = useState<TranslationLineEvent[]>([]);
  const [partial, setPartial] = useState<PartialEntry | null>(null);
  const [prefs, setPrefs] = useState<TranslationPrefs>({
    sourceLanguage: "en",
    targetLanguage: "pt",
    overlayFontSize: 16,
    overlayOpacity: 0.92,
    historyLines: 6,
    overlayEnabled: false,
  });
  const [avgLatencyMs, setAvgLatencyMs] = useState(0);

  useEffect(() => {
    void window.desktopApi.getSettings().then((r) => {
      if (r.settings.translationPrefs) {
        setPrefs(r.settings.translationPrefs);
      }
    });

    const unsubPartial = window.desktopApi.onTranslationPartial((ev) => {
      setPartial((prev) => {
        if (!ev.text) {
          return prev?.itemId === ev.itemId ? null : prev;
        }
        return { itemId: ev.itemId, text: ev.text };
      });
    });

    const unsubLine = window.desktopApi.onTranslationLine((line) => {
      setLines((prev) => [line, ...prev].slice(0, prefs.historyLines || 6));
      setAvgLatencyMs(line.latencyMs);
      if (line.itemId) {
        setPartial((prev) => (prev?.itemId === line.itemId ? null : prev));
      }
    });

    const poll = setInterval(() => {
      void window.desktopApi.getTranslationSessionStatus().then((st) => {
        if (st.avgLatencyMs) {
          setAvgLatencyMs(st.avgLatencyMs);
        }
      });
    }, 2500);

    return () => {
      unsubPartial();
      unsubLine();
      clearInterval(poll);
    };
  }, [prefs.historyLines]);

  const shellStyle = {
    margin: 0,
    padding: "12px 14px",
    fontFamily: "Segoe UI, system-ui, sans-serif",
    background: `rgba(12, 12, 14, ${prefs.overlayOpacity})`,
    border: "1px solid rgba(99, 102, 241, 0.45)",
    borderRadius: 10,
    minHeight: "100vh",
    boxSizing: "border-box" as const,
    WebkitAppRegion: "drag",
  } as React.CSSProperties;

  return (
    <div style={shellStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
          fontSize: 10,
          color: "#888",
        }}
      >
        <span>AIGA · Legendas</span>
        <span>~{avgLatencyMs} ms</span>
      </div>
      {partial && (
        <p
          style={{
            color: "#9a9a9a",
            fontSize: Math.max(12, prefs.overlayFontSize - 2),
            fontStyle: "italic",
            lineHeight: 1.4,
            margin: "0 0 8px",
          }}
        >
          {partial.text}
        </p>
      )}
      {lines.length === 0 && !partial ? (
        <p style={{ color: "#666", fontSize: prefs.overlayFontSize, margin: 0 }}>Aguardando áudio…</p>
      ) : (
        lines.map((line, idx) => (
          <p
            key={line.itemId || `${line.emittedAtIso}-${idx}`}
            style={{
              color: "#f0f0f0",
              fontSize: prefs.overlayFontSize,
              lineHeight: 1.4,
              margin: idx === 0 ? "0 0 8px" : "0 0 6px",
              fontWeight: idx === 0 ? 600 : 400,
            }}
          >
            {line.translatedText}
          </p>
        ))
      )}
    </div>
  );
}
