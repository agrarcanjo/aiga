import { useEffect, useRef, useState } from "react";

const C = {
  surface: "#141414",
  border: "#2e2e2e",
  text: "#e5e5e5",
  textMuted: "#888",
  live: "#22c55e",
  warn: "#eab308",
  hot: "#ef4444",
  track: "#2a2a2a",
};

function clampDb(db: number): number {
  if (!Number.isFinite(db)) return -90;
  return Math.max(-90, Math.min(0, db));
}

function dbToPercent(db: number): number {
  // Map -60..0 dBFS to 0..100 for a readable VU
  const clamped = clampDb(db);
  return Math.max(0, Math.min(100, ((clamped + 60) / 60) * 100));
}

function barColor(db: number): string {
  if (db > -6) return C.hot;
  if (db > -18) return C.warn;
  return C.live;
}

export interface AudioCaptureLevel {
  capturing: boolean;
  source?: string;
  mode?: string;
  label?: string;
  deviceId?: string;
  dbFs?: number;
  peakDbFs?: number;
  rms?: number;
  error?: string;
}

interface AudioCaptureHudProps {
  level: AudioCaptureLevel | null;
  compact?: boolean;
}

/**
 * HUD de captura: mostra que o áudio está sendo capturado e o nível em dBFS.
 */
export function AudioCaptureHud({ level, compact = false }: AudioCaptureHudProps): JSX.Element | null {
  if (!level?.capturing) {
    return null;
  }

  const db = clampDb(level.dbFs ?? -90);
  const peak = clampDb(level.peakDbFs ?? db);
  const pct = dbToPercent(db);
  const peakPct = dbToPercent(peak);
  const label =
    level.label ||
    (level.mode === "microphone"
      ? "Microfone"
      : level.mode === "output_device"
        ? "Dispositivo de saída"
        : "Saída do sistema");

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: compact ? "8px 10px" : "10px 12px",
        background: C.surface,
        display: "flex",
        flexDirection: "column",
        gap: compact ? 6 : 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ color: C.live, fontSize: compact ? 11 : 12, fontWeight: 600 }}>
          ● Capturando · {label}
        </span>
        <span
          style={{
            color: C.text,
            fontSize: compact ? 11 : 12,
            fontVariantNumeric: "tabular-nums",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          }}
        >
          {db <= -89 ? "−∞" : `${db.toFixed(1)}`} dB
          <span style={{ color: C.textMuted }}> · pico {peak <= -89 ? "−∞" : peak.toFixed(1)}</span>
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: compact ? 8 : 10,
          borderRadius: 999,
          background: C.track,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: barColor(db),
            transition: "width 80ms linear, background 120ms ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${Math.max(0, peakPct - 1)}%`,
            width: 2,
            background: "#fff",
            opacity: 0.85,
          }}
        />
      </div>
      {!compact && (
        <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
          Nível da captura em tempo real (dBFS). Se ficar em −∞, não há áudio na fonte.
        </p>
      )}
      {level.error && (
        <p style={{ color: C.hot, fontSize: 11, margin: 0, userSelect: "text" }}>{level.error}</p>
      )}
    </div>
  );
}

/**
 * Mede nível do MediaStream (microfone) via Web Audio API.
 */
export function useMicrophoneLevel(
  stream: MediaStream | null,
  enabled: boolean
): AudioCaptureLevel | null {
  const [level, setLevel] = useState<AudioCaptureLevel | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!enabled || !stream) {
      setLevel(null);
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      const rms = Math.sqrt(sum / data.length);
      const dbFs = rms > 1e-9 ? 20 * Math.log10(rms) : -90;
      const peakDbFs = peak > 1e-9 ? 20 * Math.log10(peak) : -90;
      setLevel({
        capturing: true,
        mode: "microphone",
        label: "Microfone",
        dbFs: Number(dbFs.toFixed(1)),
        peakDbFs: Number(peakDbFs.toFixed(1)),
        rms: Number(rms.toFixed(4)),
      });
      void window.desktopApi.reportAudioCaptureLevel?.({
        dbFs: Number(dbFs.toFixed(1)),
        peakDbFs: Number(peakDbFs.toFixed(1)),
        rms: Number(rms.toFixed(4)),
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        source.disconnect();
        analyser.disconnect();
        void ctx.close();
      } catch {
        // ignore
      }
      ctxRef.current = null;
      setLevel(null);
    };
  }, [stream, enabled]);

  return level;
}

/**
 * Escuta níveis emitidos pelo main (loopback WASAPI).
 */
export function useMainAudioCaptureLevel(enabled: boolean): AudioCaptureLevel | null {
  const [level, setLevel] = useState<AudioCaptureLevel | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLevel(null);
      return;
    }
    const unsub = window.desktopApi.onAudioCaptureLevel((payload) => {
      setLevel(payload);
    });
    return () => {
      unsub();
    };
  }, [enabled]);

  return level?.capturing ? level : null;
}
