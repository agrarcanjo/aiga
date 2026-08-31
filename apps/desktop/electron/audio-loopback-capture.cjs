// Loopback capture — medidor/arming only.
// Captura real de áudio do sistema é feita no renderer via desktopCapturer.

function createAudioLoopbackCapture(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {}, error: () => {} };
  const audioCaptureMeter = options.audioCaptureMeter;

  let activeSessionId = null;
  let recording = false;

  function start(sessionId, audioProfile) {
    activeSessionId = sessionId;
    recording = true;
    const mode = audioProfile?.mode || "system_loopback";
    const deviceId = audioProfile?.deviceId || "default";

    if (audioCaptureMeter?.start) {
      audioCaptureMeter.start({
        mode,
        deviceId,
        source: options.archiveKind === "translation" ? "translation" : "meeting",
        label:
          mode === "microphone"
            ? "Microfone"
            : mode === "output_device"
              ? "Dispositivo de saída"
              : "Saída do sistema"
      });
    }

    logger.info("Loopback capture armed (renderer desktopCapturer)", {
      sessionId,
      mode,
      deviceId
    });
    return { mode: mode === "microphone" ? "microphone" : "loopback", deviceId };
  }

  function stop() {
    recording = false;
    activeSessionId = null;
    if (audioCaptureMeter?.stop) {
      audioCaptureMeter.stop();
    }
    logger.info("Loopback capture stopped");
  }

  return { start, stop, isRecording: () => recording, getActiveSessionId: () => activeSessionId };
}

module.exports = { createAudioLoopbackCapture };
