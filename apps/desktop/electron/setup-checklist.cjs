// Aggregates pending user setup items for settings banners / onboarding.

function createSetupChecklistService(options) {
  const settingsStore = options.settingsStore;
  const transcriptionPacksService = options.transcriptionPacksService;
  const ffmpegInstaller = options.ffmpegInstaller;
  const audioSourceEnumerator = options.audioSourceEnumerator;

  async function getChecklist() {
    const settings = settingsStore.getPublicSettings();
    const llm = settingsStore.getPublicLlmSettings();
    const packs = transcriptionPacksService?.listPacks?.() || {
      requiredReady: false,
      engine: { binaryReady: false, modelReady: false, fullyReady: false }
    };

    let ffmpegAvailable = true;
    try {
      if (ffmpegInstaller?.getStatus) {
        const st = await ffmpegInstaller.getStatus();
        ffmpegAvailable = Boolean(st.available);
      } else if (audioSourceEnumerator?.listSources) {
        const sources = await audioSourceEnumerator.listSources();
        ffmpegAvailable = sources.ffmpegAvailable !== false;
      }
    } catch {
      ffmpegAvailable = false;
    }

    const hasAnyLlmKey =
      Boolean(llm?.providers?.gemini?.hasApiKey) ||
      Boolean(llm?.providers?.openai?.hasApiKey) ||
      Boolean(llm?.providers?.anthropic?.hasApiKey) ||
      Boolean(settings.hasGeminiApiKey);

    const audioMode = settings.audioCapture?.mode || "system_loopback";
    const audioDeviceId = settings.audioCapture?.deviceId || "";
    const needsFfmpeg = audioMode !== "microphone";
    const hasMic =
      Boolean(settings.selectedAudioInputDeviceId) || Boolean(settings.selectedAudioInputDeviceLabel);
    const outputDeviceConfigured =
      audioMode === "microphone" ||
      audioMode === "system_loopback" ||
      (audioMode === "output_device" && Boolean(audioDeviceId && audioDeviceId !== ""));

    const items = [
      {
        id: "llm",
        tab: "ia",
        title: "Provedor de IA / API Key",
        description: "Configure pelo menos uma API key (Gemini, OpenAI ou Anthropic) para respostas.",
        severity: "required",
        ready: hasAnyLlmKey,
        actionLabel: "Abrir Provedores IA"
      },
      {
        id: "transcription",
        tab: "translation",
        title: "Transcrição local (PT + EN)",
        description:
          "Instale whisper-cli + modelo + pacotes PT/EN com um clique em Configurações → Tradução.",
        severity: "required",
        ready: Boolean(packs.requiredReady),
        actionLabel: "Abrir Tradução"
      },
      {
        id: "audio-capture",
        tab: "audio",
        title: "Captura de áudio (saída do sistema)",
        description:
          "Para tradução/reunião, use “Saída do sistema” (padrão) ou escolha um dispositivo de saída específico.",
        severity: "required",
        ready: outputDeviceConfigured && (audioMode === "microphone" || ffmpegAvailable),
        actionLabel: "Abrir Captura áudio"
      },
      {
        id: "ffmpeg",
        tab: "audio",
        title: "ffmpeg (captura de saída do sistema)",
        description: "Necessário para loopback/Teams. Pode ser instalado automaticamente.",
        severity: needsFfmpeg ? "required" : "recommended",
        ready: ffmpegAvailable,
        actionLabel: "Abrir Captura áudio"
      },
      {
        id: "microphone",
        tab: "microphone",
        title: "Microfone padrão",
        description: "Selecione e salve o microfone usado no chat/reunião.",
        severity: "recommended",
        ready: hasMic,
        actionLabel: "Abrir Microfone"
      },
      {
        id: "screen",
        tab: "screen",
        title: "Captura de tela",
        description: "Escolha monitor principal, específico ou todas as telas.",
        severity: "optional",
        ready: Boolean(settings.screenCapture?.mode),
        actionLabel: "Abrir Captura tela"
      }
    ];

    const pending = items.filter((item) => !item.ready);
    const pendingRequired = pending.filter((item) => item.severity === "required");

    return {
      items,
      pending,
      pendingRequired,
      readyCount: items.filter((item) => item.ready).length,
      totalCount: items.length,
      allRequiredReady: pendingRequired.length === 0,
      byTab: items.reduce((acc, item) => {
        if (!acc[item.tab]) acc[item.tab] = [];
        acc[item.tab].push(item);
        return acc;
      }, {})
    };
  }

  return { getChecklist };
}

module.exports = { createSetupChecklistService };
