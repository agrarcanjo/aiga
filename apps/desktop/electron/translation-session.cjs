// G4 — continuous translation: chunks de áudio do renderer → STT → LLM translate → events
// A captura (mic ou saída do sistema) acontece no renderer; o main só processa os chunks.

const LANG_LABELS = {
  auto: "idioma detectado",
  pt: "português",
  en: "inglês",
  es: "espanhol",
  fr: "francês",
  de: "alemão",
  it: "italiano"
};

function buildTranslatePrompt(sourceLang, targetLang, text) {
  const src =
    sourceLang === "auto" ? "o idioma de origem (detecte)" : LANG_LABELS[sourceLang] || sourceLang;
  const tgt = LANG_LABELS[targetLang] || targetLang;
  return (
    `Traduza o texto abaixo de ${src} para ${tgt}.\n` +
    "Responda APENAS com a traducao, sem aspas nem explicacao.\n\n" +
    text
  );
}

function createTranslationSession(dependencies) {
  const logger = dependencies.logger;
  const sttAdapter = dependencies.sttAdapter;
  const llmRegistry = dependencies.llmProviderRegistry;
  const settingsStore = dependencies.settingsStore;
  const tokenUsageTracker = dependencies.tokenUsageTracker;
  const emitRendererEvent = dependencies.emitRendererEvent;
  const getApiKey = dependencies.getApiKey;
  const getEffectiveFlags = dependencies.getEffectiveFlags;
  const localProvider = dependencies.localProvider;
  const translationOverlayWindow = dependencies.translationOverlayWindow;
  const consentAuditStore = dependencies.consentAuditStore;
  const transcriptionPacksService = dependencies.transcriptionPacksService;
  const audioCaptureMeter = dependencies.audioCaptureMeter;

  let session = null;
  let recording = false;
  const lastErrorEmitAt = new Map();

  // Textos de diagnostico do STT (stub/fallback) nao sao fala do usuario.
  function isDiagnosticSttText(text) {
    return /^\s*\[(local|cloud):/i.test(text) || /fallback stub/i.test(text);
  }

  function emitError(code, message) {
    const now = Date.now();
    const last = lastErrorEmitAt.get(code) || 0;
    if (now - last < 15000) {
      return;
    }
    lastErrorEmitAt.set(code, now);
    emitRendererEvent("translation:error", {
      sessionId: session?.id || "",
      code,
      message,
      emittedAtIso: new Date().toISOString()
    });
  }

  async function collectLlmText(input) {
    let fullText = "";
    await llmRegistry.streamForFeature({
      ...input,
      screenshots: [],
      audioItems: [],
      onEvent: (ev) => {
        if (ev.fullText) {
          fullText = ev.fullText;
        }
      }
    });
    return fullText.trim();
  }

  async function collectLocalText(ask, sessionId) {
    let fullText = "";
    const requestId = require("node:crypto").randomUUID();
    await localProvider.streamAskResponse({
      requestId,
      sessionId,
      apiKey: "",
      effectiveFlags: { forceLocalOnly: true },
      ask,
      screenshots: [],
      onEvent: (ev) => {
        if (ev.fullText) {
          fullText = ev.fullText;
        }
      }
    });
    return fullText.trim();
  }

  async function processText(originalText, chunkStartedAt) {
    if (!session || !originalText.trim()) {
      return;
    }

    const latencyMs = Math.max(0, Date.now() - chunkStartedAt);
    let translatedText = "";
    const flags = getEffectiveFlags ? getEffectiveFlags() : {};
    const forceLocal = Boolean(flags.forceLocalOnly);
    const prompt = buildTranslatePrompt(
      session.sourceLanguage,
      session.targetLanguage,
      originalText.trim()
    );
    const canUseCloud =
      session.useCloud && !forceLocal && !tokenUsageTracker.shouldBlockCloud(session.id);

    if (canUseCloud) {
      try {
        const requestId = require("node:crypto").randomUUID();
        translatedText = await collectLlmText({
          feature: "translation",
          requestId,
          sessionId: session.id,
          apiKey: "",
          effectiveFlags: flags,
          ask: prompt
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Translation cloud failed", { message });
        const modelGone =
          /no longer available|model not found|not found for api version/i.test(message);
        emitError(
          modelGone ? "TRANSLATION_MODEL_UNAVAILABLE" : "TRANSLATION_CLOUD_FAILED",
          modelGone
            ? "Modelo de traducao indisponivel no provedor. Atualize o modelo em Configuracoes > Provedores IA (rota 'translation')."
            : `Falha na traducao pelo provedor cloud: ${message}`
        );
        return;
      }
    } else if (localProvider?.isAvailable?.()) {
      try {
        translatedText = await collectLocalText(prompt, session.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Translation local failed", { message });
        emitError("TRANSLATION_LOCAL_FAILED", `Falha na traducao pelo provedor local: ${message}`);
        return;
      }
    } else {
      emitError(
        "TRANSLATION_PROVIDER_UNAVAILABLE",
        "Nenhum provedor de traducao disponivel. Configure uma API key ou habilite o provider local."
      );
      return;
    }

    if (!translatedText.trim()) {
      return;
    }

    const line = {
      sessionId: session.id,
      originalText: originalText.trim(),
      translatedText: translatedText.trim(),
      sourceLanguage: session.sourceLanguage,
      targetLanguage: session.targetLanguage,
      latencyMs,
      emittedAtIso: new Date().toISOString()
    };

    session.latencySamples.push(latencyMs);
    if (session.latencySamples.length > 30) {
      session.latencySamples.shift();
    }
    session.linesEmitted += 1;

    emitRendererEvent("translation:line", line);
  }

  async function processChunk(chunkBase64, sttLanguage) {
    if (!session || !chunkBase64) {
      return;
    }
    const started = Date.now();
    try {
      const baseFlags = getEffectiveFlags ? getEffectiveFlags() : {};
      const packsReady =
        typeof transcriptionPacksService?.isLanguageReady === "function"
          ? transcriptionPacksService.isLanguageReady(sttLanguage)
          : false;
      const effectiveFlags = packsReady
        ? {
            ...baseFlags,
            providerMode: "local",
            localProviderEnabled: true
          }
        : baseFlags;

      const result = await sttAdapter.transcribe({
        sessionId: session.id,
        chunkBase64,
        language: sttLanguage === "auto" ? "auto" : sttLanguage,
        apiKey: getApiKey ? getApiKey() : "",
        effectiveFlags
      });
      if (result?.text?.trim()) {
        if (isDiagnosticSttText(result.text)) {
          logger.warn("Translation STT returned diagnostic stub", { text: result.text.slice(0, 160) });
          emitError(
            "STT_STUB_ACTIVE",
            `Transcricao local indisponivel: ${result.text.trim()}. Reinstale o runtime em Configuracoes > Traducao.`
          );
          return;
        }
        await processText(result.text, started);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Translation STT chunk failed", { message });
      emitError("STT_CHUNK_FAILED", `Falha ao transcrever o audio: ${message}`);
    }
  }

  function start(payload) {
    if (session) {
      throw new Error("Sessao de traducao ja ativa.");
    }

    const audioProfile = settingsStore?.getAudioCapture
      ? settingsStore.getAudioCapture()
      : { mode: "microphone" };

    if (payload.targetLanguage === "auto") {
      throw new Error("Idioma de destino deve ser fixo.");
    }

    if (!payload.consentAccepted) {
      throw new Error("CONSENT_REQUIRED: confirme o aviso legal antes de iniciar traducao.");
    }

    session = {
      id: require("node:crypto").randomUUID(),
      sourceLanguage: payload.sourceLanguage || "auto",
      targetLanguage: payload.targetLanguage || "pt",
      useCloud: Boolean(payload.useCloud),
      audioProfile,
      startedAtIso: new Date().toISOString(),
      latencySamples: [],
      linesEmitted: 0
    };

    if (consentAuditStore) {
      consentAuditStore.recordConsent({
        sessionId: session.id,
        sessionType: "translation",
        consentAccepted: true,
        consentTextVersion: payload.consentTextVersion,
        useCloud: session.useCloud
      });
    }

    tokenUsageTracker.setSessionCloud(session.id, session.useCloud);
    recording = true;

    if (audioCaptureMeter?.start) {
      audioCaptureMeter.start({
        mode: audioProfile.mode || "system_loopback",
        deviceId: audioProfile.deviceId || "default",
        source: "translation",
        label:
          audioProfile.mode === "microphone"
            ? "Microfone"
            : audioProfile.mode === "output_device"
              ? "Dispositivo de saída"
              : "Saída do sistema"
      });
    }

    const prefs = settingsStore?.getTranslationPrefs
      ? settingsStore.getTranslationPrefs()
      : { overlayEnabled: true };
    if (translationOverlayWindow && prefs.overlayEnabled !== false) {
      translationOverlayWindow.show();
    }

    // Áudio (mic ou saída do sistema) chega do renderer via ingestMicChunk.

    logger.info("Translation session started", {
      sessionId: session.id,
      source: session.sourceLanguage,
      target: session.targetLanguage,
      captureMode: audioProfile.mode
    });

    return {
      sessionId: session.id,
      startedAtIso: session.startedAtIso,
      captureMode: audioProfile.mode
    };
  }

  function stop() {
    recording = false;
    if (audioCaptureMeter?.stop) {
      audioCaptureMeter.stop();
    }
    if (translationOverlayWindow) {
      translationOverlayWindow.hide();
    }
    const sessionId = session?.id;
    if (session) {
      tokenUsageTracker.clearSession(session.id);
    }
    session = null;
    logger.info("Translation session stopped", { sessionId });
    return { sessionId, status: "stopped" };
  }

  function getStatus() {
    if (!session) {
      return { active: false };
    }
    const samples = session.latencySamples;
    const avgLatencyMs = samples.length
      ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
      : 0;
    const maxLatencyMs = samples.length ? Math.max(...samples) : 0;
    return {
      active: true,
      sessionId: session.id,
      sourceLanguage: session.sourceLanguage,
      targetLanguage: session.targetLanguage,
      captureMode: session.audioProfile.mode,
      avgLatencyMs,
      maxLatencyMs,
      linesEmitted: session.linesEmitted
    };
  }

  /** Renderer envia chunks de áudio (microfone ou saída do sistema) */
  async function ingestMicChunk(chunkBase64) {
    if (!session || !recording) {
      return { ok: false };
    }
    const sttLang = session.sourceLanguage === "auto" ? "auto" : session.sourceLanguage;
    await processChunk(chunkBase64, sttLang);
    return { ok: true };
  }

  return {
    start,
    stop,
    getStatus,
    ingestMicChunk,
    isActive: () => Boolean(session && recording)
  };
}

module.exports = { createTranslationSession };
