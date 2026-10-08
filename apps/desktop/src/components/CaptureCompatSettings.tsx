import { useEffect, useRef, useState } from "react";
import type { CaptureCompatCandidate, CaptureCompatState } from "@clone-perssua/shared-types";

const labels: Record<CaptureCompatState["status"], string> = {
  disabled: "Desativado", installing: "Operação em andamento", verified: "Ativo e verificado",
  partial: "Parcialmente aplicado", failed: "Falha", unknown: "Estado desconhecido",
};
const date = (created: string) => new Date(Number(BigInt(created) / 10000n - 11644473600000n)).toLocaleString();
const affinity = (value: number | null) => value === null ? "Desconhecida" : `0x${value.toString(16)}`;

export function CaptureCompatSettings({ buttonStyle }: { buttonStyle: React.CSSProperties }): JSX.Element {
  const [candidates, setCandidates] = useState<CaptureCompatCandidate[]>([]);
  const [state, setState] = useState<CaptureCompatState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  async function perform(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await work(); }
    catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "Falha na comunicação.");
        setState((previous) => previous ? { ...previous, status: "unknown", hookActive: null, verifiedAt: null, windows: [], message: "Não foi possível confirmar o estado atual." } : null);
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      if (inFlight.current) return;
      void perform(async () => {
        const next = await window.desktopApi.queryCaptureCompat();
        if (mounted.current) setState(next);
      });
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);
  const selected = state?.selected;
  return <section style={{ marginTop: 28, borderTop: "1px solid #444", paddingTop: 18, color: "#ddd", fontSize: 13 }}>
    <h3>Compatibilidade de captura — Java</h3>
    <p>Recurso opcional para todas as janelas de uma instância selecionada. Disponível para Windows x64.</p>
    <button style={buttonStyle} disabled={busy} onClick={() => void perform(async () => setCandidates(await window.desktopApi.listCaptureCompatCandidates()))}>Atualizar instâncias</button>
    <ul style={{ paddingLeft: 18 }}>
      {candidates.map((candidate) => <li key={`${candidate.pid}:${candidate.created}`} style={{ marginTop: 12 }}>
        <strong>PID {candidate.pid} · {candidate.arch} · {date(candidate.created)}</strong>
        <div style={{ overflowWrap: "anywhere" }}>{candidate.path}</div>
        <div>{candidate.windows.length} janela(s): {candidate.windows.map((window) => `${window.className} / HWND ${window.hwnd} / ${affinity(window.affinity)}`).join("; ")}</div>
        <button style={buttonStyle} disabled={busy || (!!selected && state?.hookActive !== false && selected.pid !== candidate.pid)} onClick={() => void perform(async () => {
          const { windows: _windows, ...identity } = candidate;
          setState(await window.desktopApi.selectCaptureCompatTarget(identity));
        })}>Selecionar esta instância</button>
      </li>)}
    </ul>
    {!candidates.length && <p>Atualize a lista para descobrir instâncias acessíveis. Nenhum processo é selecionado automaticamente.</p>}
    {selected && <p style={{ overflowWrap: "anywhere" }}>Selecionado: PID {selected.pid} · {selected.arch}<br />Criado em {date(selected.created)}<br />{selected.path}</p>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button style={buttonStyle} disabled={busy || !selected || selected.arch !== "x64" || state?.status === "unknown"} onClick={() => void perform(async () => setState(await window.desktopApi.enableCaptureCompat()))}>Habilitar compatibilidade</button>
      <button style={buttonStyle} disabled={busy || !selected} onClick={() => void perform(async () => setState(await window.desktopApi.queryCaptureCompat()))}>Verificar agora</button>
      <button style={buttonStyle} disabled={busy || !selected} onClick={() => void perform(async () => setState(await window.desktopApi.disableCaptureCompat()))}>Desativar</button>
    </div>
    <div role="status" aria-live="polite" style={{ marginTop: 12 }}>
      <strong>{busy ? "Consultando / aplicando…" : state ? labels[state.status] : "Desativado"}</strong>
      <p>{state?.message}</p>
      {state?.verifiedAt && <p>Observação: {new Date(state.verifiedAt).toLocaleString()} · Chamadas neutralizadas: {state.blocked || "0"}</p>}
      {state?.stage && <p>Etapa: {state.stage} · DLL: {state.loaded ? "carregada" : "não confirmada"} · Hook: {state.hookActive === null ? "desconhecido" : state.hookActive ? "ativo" : "inativo"}</p>}
    </div>
    {error && <p role="alert" style={{ color: "#f88" }}>{error}</p>}
    {!!state?.windows.length && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left" }}>
      <thead><tr><th>HWND / classe</th><th>Antes</th><th>Observada</th><th>Erro consulta / limpeza</th></tr></thead>
      <tbody>{state.windows.map((window) => <tr key={window.hwnd}>
        <td>{window.hwnd}<br />{window.className}{!window.valid && " (destruída / inválida)"}</td>
        <td>{affinity(window.before)}</td><td>{affinity(window.affinity)}</td><td>{window.queryError} / {window.clearError}</td>
      </tr>)}</tbody>
    </table></div>}
    <p>O resultado corresponde às janelas e ao horário consultados. Ao fechar o AIGA ou perder comunicação, a DLL tenta remover a interceptação após 15 segundos. Desativar não restaura a proteção anterior; a aplicação poderá solicitá-la novamente.</p>
  </section>;
}
