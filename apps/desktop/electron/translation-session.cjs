// G4 — continuous translation: loopback/mic chunks → STT → LLM translate → events
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveFfmpegPath } = require("./audio-source-enumerator.cjs");

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
  const meetingAudioArchive = dependencies.meetingAudioArchive;
  const transcriptionPacksService = dependencies.transcriptionPacksService;
  const audioCaptureMeter = dependencies.audioCaptureMeter;

  let session = null;
  let chunkTimer = null;
  let recording = false;

  function buildWasapiInput(deviceId) {
    return deviceId && deviceId !== "default" ? `audio=${deviceId}` : "audio=default";
  }

  async function recordLoopbackChunk(deviceId) {
    const ffmpeg = resolveFfmpegPath();
    const tempPath = path.join(os.tmpdir(), `aiga-trans-${Date.now()}.wav`);
    const durationSec = 6;

    return new Promise((resolve) => {
      const proc = spawn(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "wasapi",
          "-i",
          buildWasapiInput(deviceId),
          "-t",
          String(durationSec),
          "-ac",
          "1",
          "-ar",
          "16000",
          "-y",
          tempPath
        ],
        { windowsHide: true }
      );

      proc.on("close", async (code) => {
        if (code !== 0 || !fs.existsSync(tempPath)) {
          resolve(null);
          return;
        }
        try {
          const buffer = fs.readFileSync(tempPath);
          try {
            fs.unlinkSync(tempPath);
          } catch {
            // ignore
          }
          if (buffer.length < 800) {
            resolve(null);
            return;
          }
          if (session && meetingAudioArchive?.saveChunk) {
            meetingAudioArchive.saveChunk({
              sessionId: session.id,
              kind: "translation",
              extension: "wav",
              buffer
            });
          }
          resolve(buffer.toString("base64"));
        } catch {
          resolve(null);
        }
      });
      proc.on("error", () => resolve(null));
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
    let translatedText = originalText;
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
        logger.warn("Translation cloud failed", {
          message: error instanceof Error ? error.message : String(error)
        });
        translatedText = `[falha traducao] ${originalText}`;
      }
    } else if (localProvider?.isAvailable?.()) {
      try {
        translatedText = await collectLocalText(prompt, session.id);
      } catch (error) {
        logger.warn("Translation local failed", {
          message: error instanceof Error ? error.message : String(error)
        });
        translatedText = originalText;
      }
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
        await processText(result.text, started);
      }
    } catch (error) {
      logger.warn("Translation STT chunk failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function loopbackTick() {
    if (!session || !recording) {
      return;
    }
    const profile = session.audioProfile;
    if (profile.mode === "microphone") {
      return;
    }
    const chunk = await recordLoopbackChunk(profile.deviceId || "default");
    if (chunk) {
      const sttLang = session.sourceLanguage === "auto" ? "auto" : session.sourceLanguage;
      await processChunk(chunk, sttLang);
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

    // Áudio (mic ou loopback) chega do renderer via ingestMicChunk.
    // FFmpeg não possui demuxer WASAPI no upstream — não usar loopbackTick.

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
    if (chunkTimer) {
      clearInterval(chunkTimer);
      chunkTimer = null;
    }
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

  /** Renderer envia chunks de microfone */
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
