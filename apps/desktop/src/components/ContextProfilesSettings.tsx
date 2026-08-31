import { useCallback, useEffect, useState } from "react";
import type { ContextProfileSaveRequest, UserProfile } from "@clone-perssua/shared-types";

const C = {
  surface2: "#242424",
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  error: "#ef4444",
  success: "#22c55e",
  accent: "#6366f1",
};

type ProfileDraft = {
  id?: string;
  name: string;
  role: string;
  team: string;
  responsibilities: string;
  communicationStyle: string;
  basePrompt: string;
};

const EMPTY_PROFILE: ProfileDraft = {
  name: "",
  role: "",
  team: "",
  responsibilities: "",
  communicationStyle: "",
  basePrompt: "",
};

interface ContextProfilesSettingsProps {
  inputStyle: React.CSSProperties;
  primaryBtn: React.CSSProperties;
  secondaryBtn: React.CSSProperties;
}

export function ContextProfilesSettings({
  inputStyle,
  primaryBtn,
  secondaryBtn,
}: ContextProfilesSettingsProps): JSX.Element {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [editing, setEditing] = useState<ProfileDraft>({ ...EMPTY_PROFILE });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await window.desktopApi.listContextProfiles();
    setProfiles(r.profiles);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startNew(): void {
    setEditing({ ...EMPTY_PROFILE });
    setError("");
    setStatus("");
  }

  function startEdit(p: UserProfile): void {
    setEditing({
      id: p.id,
      name: p.name,
      role: p.role,
      team: p.team,
      responsibilities: p.responsibilities,
      communicationStyle: p.communicationStyle,
      basePrompt: p.basePrompt,
    });
    setError("");
    setStatus("");
  }

  async function handleSave(): Promise<void> {
    if (!editing.name.trim()) {
      setError("Nome obrigatório.");
      return;
    }
    try {
      const r = await window.desktopApi.saveContextProfile({
        profile: editing as ContextProfileSaveRequest["profile"],
      });
      setProfiles(r.profiles);
      setStatus("Perfil salvo.");
      setEditing({ ...EMPTY_PROFILE });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  async function handleDelete(profileId: string): Promise<void> {
    const ok = globalThis.confirm("Excluir este perfil? Não é possível desfazer.");
    if (!ok) return;
    try {
      const r = await window.desktopApi.deleteContextProfile({ profileId });
      setProfiles(r.profiles);
      setStatus("Perfil removido.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir");
    }
  }

  async function handleDuplicate(profileId: string): Promise<void> {
    try {
      const r = await window.desktopApi.duplicateContextProfile({ profileId });
      setProfiles(r.profiles);
      setStatus("Perfil duplicado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao duplicar");
    }
  }

  const field = (key: keyof ProfileDraft, rows = 1) =>
    rows > 1 ? (
      <textarea
        key={key}
        value={editing[key]}
        onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
        rows={rows}
        style={inputStyle}
      />
    ) : (
      <input
        key={key}
        type="text"
        value={editing[key]}
        onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
        style={inputStyle}
      />
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Perfis de contexto</span>
        <button type="button" style={secondaryBtn} onClick={() => startNew()}>
          Novo perfil
        </button>
      </div>
      <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
        Perfis alimentam resumos e alertas do modo reunião (papel, estilo, prompt base).
      </p>

      {profiles.map((p) => (
        <div
          key={p.id}
          style={{
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 10,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div>
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{p.name}</span>
            <span style={{ color: C.textMuted, fontSize: 11, display: "block" }}>
              {p.role} · {p.team}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" style={secondaryBtn} onClick={() => startEdit(p)}>
              Editar
            </button>
            <button type="button" style={secondaryBtn} onClick={() => void handleDuplicate(p.id)}>
              Duplicar
            </button>
            <button
              type="button"
              style={{ ...secondaryBtn, color: C.error, borderColor: C.error }}
              onClick={() => void handleDelete(p.id)}
            >
              Excluir
            </button>
          </div>
        </div>
      ))}

      {(editing.name || editing.role || editing.id) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ color: C.textMuted, fontSize: 11 }}>Nome</label>
          {field("name")}
          <label style={{ color: C.textMuted, fontSize: 11 }}>Papel</label>
          {field("role")}
          <label style={{ color: C.textMuted, fontSize: 11 }}>Time</label>
          {field("team")}
          <label style={{ color: C.textMuted, fontSize: 11 }}>Responsabilidades</label>
          {field("responsibilities", 2)}
          <label style={{ color: C.textMuted, fontSize: 11 }}>Estilo de comunicação</label>
          {field("communicationStyle", 2)}
          <label style={{ color: C.textMuted, fontSize: 11 }}>Prompt base</label>
          {field("basePrompt", 3)}
          <button type="button" style={primaryBtn} onClick={() => void handleSave()}>
            Salvar perfil
          </button>
        </div>
      )}

      {status && <span style={{ color: C.success, fontSize: 12 }}>{status}</span>}
      {error && <span style={{ color: C.error, fontSize: 12 }}>{error}</span>}
    </div>
  );
}
