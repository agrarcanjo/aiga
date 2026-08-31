// Live audio level meter — níveis vêm do renderer (AnalyserNode).
// FFmpeg upstream não possui WASAPI; não spawnamos captura aqui.

function dbFromLinear(value) {
  if (!Number.isFinite(value) || value <= 1e-9) {
    return -90;
  }
  return Math.max(-90, Math.min(0, 20 * Math.log10(value)));
}

function createAudioCaptureMeter(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {}, debug: () => {} };
  const emitLevel = options?.emitLevel || (() => {});

  let activeMeta = null;
  let lastEmitAt = 0;

  function publish(partial) {
    if (!activeMeta) {
      return;
    }
    const now = Date.now();
    if (partial.capturing !== false && now - lastEmitAt < 40) {
      return;
    }
    lastEmitAt = now;
    emitLevel({
      capturing: true,
      source: activeMeta.source,
      mode: activeMeta.mode,
      label: activeMeta.label,
      deviceId: activeMeta.deviceId || "default",
      dbFs: -90,
      peakDbFs: -90,
      rms: 0,
      meterSource: "renderer",
      emittedAtIso: new Date().toISOString(),
      ...partial
    });
  }

  function start(payload = {}) {
    const mode = payload.mode || "system_loopback";
    const deviceId = payload.deviceId || "default";
    const source = payload.source || "capture";
    const label =
      payload.label ||
      (mode === "microphone"
        ? "Microfone"
        : mode === "output_device"
          ? "Dispositivo de saída"
          : "Saída do sistema");

    activeMeta = { mode, deviceId, source, label };
    publish({ capturing: true, dbFs: -90, peakDbFs: -90, rms: 0 });
    logger.info("Audio meter armed (renderer levels)", { source, mode });
    return { ok: true, mode, meterSource: "renderer" };
  }

  function reportRendererLevel(payload = {}) {
    if (!activeMeta) {
      return;
    }
    publish({
      capturing: true,
      meterSource: "renderer",
      dbFs: Number(payload.dbFs ?? -90),
      peakDbFs: Number(payload.peakDbFs ?? payload.dbFs ?? -90),
      rms: Number(payload.rms ?? 0)
    });
  }

  function stop() {
    const had = Boolean(activeMeta);
    if (had) {
      emitLevel({
        capturing: false,
        source: activeMeta?.source,
        mode: activeMeta?.mode,
        label: activeMeta?.label,
        deviceId: activeMeta?.deviceId,
        dbFs: -90,
        peakDbFs: -90,
        rms: 0,
        emittedAtIso: new Date().toISOString()
      });
    }
    activeMeta = null;
  }

  function getState() {
    return {
      active: Boolean(activeMeta),
      ...(activeMeta || {})
    };
  }

  return {
    start,
    stop,
    reportRendererLevel,
    getState,
    dbFromLinear
  };
}

module.exports = { createAudioCaptureMeter, dbFromLinear };
