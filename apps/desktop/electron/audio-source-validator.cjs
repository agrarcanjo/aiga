// Validação de fonte de áudio.
// O teste real (nível em dBFS) roda no renderer, que é quem abre a fonte
// (getUserMedia para microfone, desktopCapturer para saída do sistema).

function createAudioSourceValidator(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {} };

  async function testSource(profile) {
    const mode = profile?.mode || "system_loopback";

    if (mode === "microphone") {
      return {
        ok: true,
        code: "OK",
        message: "Modo microfone — teste executado no renderer pela permissão do navegador."
      };
    }

    if (process.platform !== "win32") {
      return {
        ok: false,
        code: "LOOPBACK_UNSUPPORTED",
        message: "Captura da saída do sistema disponível apenas no Windows 10/11."
      };
    }

    logger.info("Audio source test delegated to renderer", { mode });
    return {
      ok: true,
      code: "OK",
      message: "Fonte de saída do sistema disponível (Electron desktopCapturer)."
    };
  }

  return { testSource };
}

module.exports = { createAudioSourceValidator };
