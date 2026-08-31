// Enumeração de fontes de áudio.
// A captura da saída do sistema usa o desktopCapturer do Electron (Chromium);
// não há dependência de ffmpeg/WASAPI para listar nem para capturar.

function createAudioSourceEnumerator(options) {
  const logger = options?.logger || { debug: () => {}, warn: () => {} };

  async function listSources() {
    const platformSupported = process.platform === "win32";
    logger.debug("Audio sources listed", { platformSupported });
    return {
      modes: platformSupported ? ["microphone", "system_loopback"] : ["microphone"],
      outputs: [],
      inputs: [],
      platformSupported,
      loopbackProvider: "desktopCapturer",
      defaultOutputId: ""
    };
  }

  return { listSources };
}

module.exports = { createAudioSourceEnumerator };
