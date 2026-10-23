import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  customModelCandidate,
  filterModelOptions,
  matchRanges,
  type ModelOption,
} from "../lib/modelOptions";

const C = {
  surface: "#1a1a1a",
  surface2: "#242424",
  hover: "#2c2c35",
  border: "#2e2e2e",
  borderFocus: "#6366f1",
  accent: "#6366f1",
  text: "#e5e5e5",
  textMuted: "#888",
  warn: "#f59e0b",
};

interface ModelComboboxProps {
  value: string;
  options: ModelOption[];
  onChange: (modelId: string) => void;
  placeholder?: string;
  loading?: boolean;
  ariaLabel?: string;
}

type Row = { kind: "option"; option: ModelOption } | { kind: "custom"; id: string };

function Highlighted({ text, query }: { text: string; query: string }): JSX.Element {
  const ranges = matchRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const parts: JSX.Element[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, start)}</span>);
    parts.push(
      <mark
        key={`m${i}`}
        style={{ background: "transparent", color: "#a5b4fc", fontWeight: 600 }}
      >
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

export function ModelCombobox({
  value,
  options,
  onChange,
  placeholder = "Selecione um modelo",
  loading = false,
  ariaLabel = "Modelo",
}: ModelComboboxProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const rows = useMemo<Row[]>(() => {
    const filtered = filterModelOptions(options, query).map(
      (option): Row => ({ kind: "option", option })
    );
    const custom = customModelCandidate(options, query);
    return custom ? [...filtered, { kind: "custom", id: custom }] : filtered;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    inputRef.current?.focus();
    const selectedIndex = rows.findIndex(
      (row) => row.kind === "option" && row.option.id === value
    );
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // Só ao abrir: recalcular a cada digitação faria o destaque pular para o selecionado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close(): void {
    setOpen(false);
    setQuery("");
  }

  function choose(row: Row | undefined): void {
    if (!row) return;
    onChange(row.kind === "option" ? row.option.id : row.id);
    close();
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, rows.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(rows[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close();
    }
  }

  const selected = options.find((option) => option.id === value);
  const optionCount = rows.filter((row) => row.kind === "option").length;

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", WebkitAppRegion: "no-drag" } as React.CSSProperties}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: C.surface2,
          border: `1px solid ${open ? C.borderFocus : C.border}`,
          boxShadow: open ? "0 0 0 3px rgba(99,102,241,0.18)" : "none",
          borderRadius: 8,
          padding: "9px 12px",
          color: value ? C.text : C.textMuted,
          fontSize: 13,
          fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
          cursor: "pointer",
          textAlign: "left",
          transition: "border-color 120ms, box-shadow 120ms",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        {selected?.unverified && (
          <span
            title="Este modelo não apareceu na última lista da conta"
            style={{ color: C.warn, fontSize: 10, fontFamily: "inherit", flexShrink: 0 }}
          >
            não confirmado
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden
          style={{
            flexShrink: 0,
            color: C.textMuted,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 120ms",
          }}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden style={{ color: C.textMuted, flexShrink: 0 }}>
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pesquisar modelo…"
              spellCheck={false}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: C.text,
                fontSize: 13,
                padding: "4px 0",
              }}
            />
            {loading && <span style={{ color: C.textMuted, fontSize: 11 }}>carregando…</span>}
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ maxHeight: 280, overflowY: "auto", padding: 4 }}
          >
            {rows.length === 0 && (
              <div style={{ padding: "14px 12px", color: C.textMuted, fontSize: 12 }}>
                Nenhum modelo encontrado.
              </div>
            )}
            {rows.map((row, index) => {
              const id = row.kind === "option" ? row.option.id : row.id;
              const isSelected = row.kind === "option" && id === value;
              const isActive = index === active;
              return (
                <div
                  key={`${row.kind}-${id}`}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(row)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: isActive ? C.hover : "transparent",
                    color: C.text,
                    fontSize: 13,
                    fontFamily:
                      row.kind === "option" ? "ui-monospace, SFMono-Regular, Consolas, monospace" : "inherit",
                    borderTop: row.kind === "custom" && index > 0 ? `1px solid ${C.border}` : "none",
                    marginTop: row.kind === "custom" && index > 0 ? 4 : 0,
                  }}
                >
                  <span style={{ width: 14, flexShrink: 0, color: C.accent }}>
                    {isSelected ? "✓" : ""}
                  </span>
                  {row.kind === "option" ? (
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <Highlighted text={id} query={query} />
                    </span>
                  ) : (
                    <span style={{ flex: 1, color: C.textMuted }}>
                      Usar <code style={{ color: C.text }}>{id}</code>
                    </span>
                  )}
                  {row.kind === "option" && row.option.unverified && (
                    <span style={{ color: C.warn, fontSize: 10 }}>não confirmado</span>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 12px",
              borderTop: `1px solid ${C.border}`,
              color: C.textMuted,
              fontSize: 11,
            }}
          >
            <span>
              {optionCount} de {options.length} modelo(s)
            </span>
            <span>↑↓ navegar · Enter selecionar · Esc fechar</span>
          </div>
        </div>
      )}
    </div>
  );
}
