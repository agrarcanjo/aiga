import type { SetupChecklistItem } from "@clone-perssua/shared-types";

const C = {
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  warn: "#f59e0b",
  error: "#ef4444",
  accent: "#6366f1",
  surface2: "#242424",
};

interface SetupNoticeBannerProps {
  items: SetupChecklistItem[];
  onGoToTab: (tab: string) => void;
}

export function SetupNoticeBanner({ items, onGoToTab }: SetupNoticeBannerProps): JSX.Element | null {
  const pending = items.filter((item) => !item.ready);
  if (pending.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: `1px solid ${C.warn}`,
        background: "#2a2214",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 14,
      }}
    >
      <span style={{ color: C.warn, fontSize: 12, fontWeight: 700 }}>
        Configuração pendente nesta área
      </span>
      {pending.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>
              {item.title}
              {item.severity === "required" ? " · obrigatório" : ""}
            </div>
            <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{item.description}</div>
          </div>
          <button
            type="button"
            onClick={() => onGoToTab(item.tab)}
            style={{
              background: C.accent,
              border: "none",
              color: "#fff",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 11,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {item.actionLabel}
          </button>
        </div>
      ))}
    </div>
  );
}
