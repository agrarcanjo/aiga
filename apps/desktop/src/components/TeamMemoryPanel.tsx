import { useCallback, useEffect, useState } from "react";
import type { TeamMemoryItem } from "@clone-perssua/shared-types";

const C = {
  surface2: "#242424",
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  error: "#ef4444",
  accent: "#6366f1",
};

interface TeamMemoryPanelProps {
  inputStyle: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

export function TeamMemoryPanel({
  inputStyle,
  secondaryBtn,
}: TeamMemoryPanelProps): JSX.Element {
  const [items, setItems] = useState<TeamMemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editSummary, setEditSummary] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await window.desktopApi.listTeamMemory();
      setItems(r.items.slice().reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar memória");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(item: TeamMemoryItem): void {
    setEditingId(item.id);
    setEditExcerpt(item.excerpt || "");
    setEditSummary(item.fullSummary || "");
  }

  async function handleSaveEdit(itemId: string): Promise<void> {
    try {
      const r = await window.desktopApi.updateTeamMemoryItem({
        itemId,
        excerpt: editExcerpt,
        fullSummary: editSummary,
      });
      setItems(r.items.slice().reverse());
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  async function handleDelete(itemId: string): Promise<void> {
    const ok = globalThis.confirm("Excluir este registro da memória do time?");
    if (!ok) return;
    try {
      const r = await window.desktopApi.deleteTeamMemoryItem({ itemId });
      setItems(r.items.slice().reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Memória do time</span>
        <button type="button" style={secondaryBtn} onClick={() => void load()}>
          Atualizar
        </button>
      </div>
      <p style={{ color: C.textMuted, fontSize: 11, margin: 0, lineHeight: 1.5 }}>
        Resumos salvos ao encerrar reuniões. Exclua entradas antigas ou incorretas.
      </p>
      {loading && <p style={{ color: C.textMuted, fontSize: 12 }}>Carregando…</p>}
      {error && <p style={{ color: C.error, fontSize: 12 }}>{error}</p>}
      {!loading && items.length === 0 && (
        <p style={{ color: C.textMuted, fontSize: 12 }}>Nenhum registro ainda.</p>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: C.textMuted, fontSize: 10 }}>
              {new Date(item.createdAtIso).toLocaleString("pt-BR")}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => startEdit(item)}
                style={{ ...secondaryBtn, padding: "4px 8px", fontSize: 10 }}
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(item.id)}
                style={{
                  ...secondaryBtn,
                  padding: "4px 8px",
                  fontSize: 10,
                  color: C.error,
                  borderColor: C.error,
                }}
              >
                Excluir
              </button>
            </div>
          </div>
          {item.objective && (
            <span style={{ color: C.accent, fontSize: 11, fontWeight: 600 }}>{item.objective}</span>
          )}
          {editingId === item.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                value={editExcerpt}
                onChange={(e) => setEditExcerpt(e.target.value)}
                rows={2}
                placeholder="Trecho"
                style={inputStyle}
              />
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                rows={4}
                placeholder="Resumo completo"
                style={inputStyle}
              />
              <button
                type="button"
                style={{ ...secondaryBtn, alignSelf: "flex-start" }}
                onClick={() => void handleSaveEdit(item.id)}
              >
                Salvar
              </button>
            </div>
          ) : (
            <>
              <p style={{ color: C.text, fontSize: 11, margin: 0, whiteSpace: "pre-wrap" }}>
                {item.excerpt || item.fullSummary?.slice(0, 400) || "(sem texto)"}
              </p>
              {item.fullSummary && item.fullSummary.length > 400 && (
                <details>
                  <summary style={{ color: C.textMuted, fontSize: 10, cursor: "pointer" }}>
                    Ver resumo completo
                  </summary>
                  <pre
                    style={{
                      ...inputStyle,
                      marginTop: 6,
                      fontSize: 10,
                      whiteSpace: "pre-wrap",
                      maxHeight: 160,
                      overflow: "auto",
                    }}
                  >
                    {item.fullSummary}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
