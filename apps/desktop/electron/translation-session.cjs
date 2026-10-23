// G4 — legenda ao vivo: PCM do renderer → STT em streaming (OpenAI Realtime) → LLM traduz → eventos
const { createRealtimeSttClient } = require("./realtime-stt-client.cjs");

const DEFAULT_SOURCE_LANGUAGE = "en";
const STT_PROVIDER = "openai-realtime";
const LANGUAGE_CODES = ["auto", "pt", "en", "es", "fr", "de", "it"];
const MAX_CONCURRENT_TRANSLATIONS = 2;
const MIN_STT_CHARS = 3;
const CONTEXT_LINES = 2;
// Frase que nunca recebeu resultado final não pode travar as seguintes para sempre.
const ORDER_SKIP_AFTER_MS = 8000;

const LANG_LABELS = {
  pt: "português",
  en: "inglês",
  es: "espanhol",
  fr: "francês",
  de: "alemão",
  it: "italiano"
};

function normalizeLanguage(code, fallback) {
  return LANGUAGE_CODES.includes(code) ? code : fallback;
}

function buildTranslatePrompt(sourceLang, targetLang, text, recentOriginals) {
  const src =
    !sourceLang || sourceLang === "auto" ? "o idioma original" : LANG_LABELS[sourceLang] || sourceLang;
  const tgt = LANG_LABELS[targetLang] || targetLang;
  const context =
    recentOriginals && recentOriginals.length
      ? `Contexto das frases anteriores (NAO traduza de novo, use so para coerencia):\n${recentOriginals
          .map((t, i) => `${i + 1}. ${t}`)
          .join("\n")}\n\n`
      : "";
  return (
    `${context}Traduza o texto abaixo de ${src} para ${tgt}.\n` +
    "Responda APENAS com a traducao, sem aspas nem explicacao.\n\n" +
    text
  );
}

/** Remove sobreposição inicial com a frase anterior. */
function dedupeAgainstPrevious(previous, next) {
  const prev = (previous || "").trim().toLowerCase();
  const curr = (next || "").trim();
  if (!prev || !curr) {
    return curr;
  }
  if (prev === curr.toLowerCase()) {
    return "";
  }
  const prevWords = prev.split(/\s+/).filter(Boolean);
  const currWords = curr.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(12, prevWords.length, currWords.length);
  for (let n = maxOverlap; n >= 3; n -= 1) {
    const tail = prevWords.slice(-n).join(" ");
    const head = currWords.slice(0, n).join(" ").toLowerCase();
    if (tail === head) {
      return currWords.slice(n).join(" ").trim();
    }
  }
  return curr;
}

function average(list) {
  if (!list.length) {
    return 0;
  }
  return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
}

function pushMetric(list, value, max = 30) {
  list.push(value);
  if (list.length > max) {
    list.shift();
  }
}

function createTranslationSession(dependencies) {
  const logger = dependencies.logger;
  const llmRegistry = dependencies.llmProviderRegistry;
  const settingsStore = dependencies.settingsStore;
  const tokenUsageTracker = dependencies.tokenUsageTracker;
  const emitRendererEvent = dependencies.emitRendererEvent;
  const getEffectiveFlags = dependencies.getEffectiveFlags;
  const getOpenAiApiKey = dependencies.getOpenAiApiKey;
  const localProvider = dependencies.localProvider;
  const translationOverlayWindow = dependencies.translationOverlayWindow;
  const consentAuditStore = dependencies.consentAuditStore;
  const audioCaptureMeter = dependencies.audioCaptureMeter;
  const createSttClient = dependencies.createSttClient || createRealtimeSttClient;
  const now = dependencies.now || (() => Date.now());
  const schedule = dependencies.schedule || ((fn, ms) => setTimeout(fn, ms));

  let session = null;
  let sttClient = null;
  const lastErrorEmitAt = new Map();

  function emitError(code, message, sessionId) {
    const at = now();
    const last = lastErrorEmitAt.get(code) || 0;
    if (at - last < 15000) {
      return;
    }
    lastErrorEmitAt.set(code, at);
    emitRendererEvent("translation:error", {
      sessionId: sessionId || session?.id || "",
      code,
      message,
      emittedAtIso: new Date().toISOString()
    });
  }

  function emitPartial(current, itemId, text) {
    emitRendererEvent("translation:partial", {
      sessionId: current.id,
      itemId,
      text,
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
    await localProvider.streamAskResponse({
      requestId: require("node:crypto").randomUUID(),
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

  async function translate(current, text) {
    const prompt = buildTranslatePrompt(
      current.sourceLanguage,
      current.targetLanguage,
      text,
      current.recentOriginals.slice(-CONTEXT_LINES)
    );
    const flags = getEffectiveFlags ? getEffectiveFlags() : {};
    if (!tokenUsageTracker.shouldBlockCloud(current.id)) {
      return collectLlmText({
        feature: "translation",
        requestId: require("node:crypto").randomUUID(),
        sessionId: current.id,
        apiKey: "",
        effectiveFlags: flags,
        ask: prompt
      });
    }
    if (localProvider?.isAvailable?.()) {
      return collectLocalText(prompt, current.id);
    }
    throw new Error("Orcamento de tokens da nuvem esgotado e nenhum LLM local disponivel.");
  }

  function itemState(current, itemId, seq) {
    let item = current.items.get(itemId);
    if (!item) {
      item = { seq, speechStartedAt: 0, firstPartialAt: 0, done: false };
      current.items.set(itemId, item);
    }
    return item;
  }

  /** Emite as linhas prontas na ordem das frases. */
  function flushOrdered(current) {
    if (session !== current) {
      return;
    }
    for (;;) {
      if (current.results.has(current.nextEmitSeq)) {
        const line = current.results.get(current.nextEmitSeq);
        current.results.delete(current.nextEmitSeq);
        current.nextEmitSeq += 1;
        if (line) {
          emitRendererEvent("translation:line", line);
        }
        continue;
      }
      const readySeqs = [...current.results.keys()];
      if (!readySeqs.length) {
        return;
      }
      const oldestReadyAt = Math.min(
        ...readySeqs.map((seq) => current.readyAt.get(seq) || now())
      );
      if (now() - oldestReadyAt >= ORDER_SKIP_AFTER_MS) {
        current.nextEmitSeq += 1;
        continue;
      }
      if (!current.flushTimer) {
        current.flushTimer = true;
        schedule(() => {
          current.flushTimer = false;
          flushOrdered(current);
        }, ORDER_SKIP_AFTER_MS);
      }
      return;
    }
  }

  function settle(current, seq, line) {
    if (seq < current.nextEmitSeq) {
      if (line) {
        emitRendererEvent("translation:line", line);
      }
      return;
    }
    current.results.set(seq, line);
    current.readyAt.set(seq, now());
    flushOrdered(current);
  }

  function pumpTranslations(current) {
    while (
      session === current &&
      current.inFlight < MAX_CONCURRENT_TRANSLATIONS &&
      current.translationQueue.length
    ) {
      const job = current.translationQueue.shift();
      current.inFlight += 1;
      void runTranslation(current, job).finally(() => {
        current.inFlight -= 1;
        pumpTranslations(current);
      });
    }
  }

  async function runTranslation(current, job) {
    const llmStarted = now();
    let translatedText = "";
    try {
      translatedText = await translate(current, job.text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Live translation failed", { message });
      const modelGone = /no longer available|model not found|not found for api version/i.test(message);
      emitError(
        modelGone ? "TRANSLATION_MODEL_UNAVAILABLE" : "TRANSLATION_CLOUD_FAILED",
        modelGone
          ? "Modelo de traducao indisponivel. Ajuste a prioridade/modelos em Configuracoes > IA e modelos."
          : `Falha na traducao: ${message}`,
        current.id
      );
    }
    if (session !== current) {
      return;
    }
    if (!translatedText.trim()) {
      emitPartial(current, job.itemId, "");
      settle(current, job.seq, null);
      return;
    }
    const llmMs = Math.max(0, now() - llmStarted);
    pushMetric(current.llmSamples, llmMs);
    pushMetric(current.latencySamples, job.sttFinalMs + llmMs);
    current.linesEmitted += 1;
    settle(current, job.seq, {
      sessionId: current.id,
      itemId: job.itemId,
      originalText: job.text,
      translatedText: translatedText.trim(),
      sourceLanguage: current.sourceLanguage,
      targetLanguage: current.targetLanguage,
      latencyMs: job.sttFinalMs + llmMs,
      sttMs: job.sttFinalMs,
      llmMs,
      emittedAtIso: new Date().toISOString()
    });
  }

  function handleSpeechStarted(current, itemId, seq) {
    const item = itemState(current, itemId, seq);
    if (!item.speechStartedAt) {
      item.speechStartedAt = now();
    }
  }

  function handlePartial(current, itemId, text, seq) {
    const item = itemState(current, itemId, seq);
    const at = now();
    if (!item.speechStartedAt) {
      item.speechStartedAt = at;
    }
    if (!item.firstPartialAt) {
      item.firstPartialAt = at;
      pushMetric(current.firstPartialSamples, at - item.speechStartedAt);
    }
    emitPartial(current, itemId, text);
  }

  function handleFinal(current, itemId, rawText, seq) {
    const item = itemState(current, itemId, seq);
    item.done = true;
    current.items.delete(itemId);
    const at = now();
    const sttFinalMs = Math.max(0, at - (item.speechStartedAt || at));

    const previous = current.recentOriginals[current.recentOriginals.length - 1];
    const text = dedupeAgainstPrevious(previous, rawText);
    if (!text || text.length < MIN_STT_CHARS) {
      emitPartial(current, itemId, "");
      settle(current, seq, null);
      return;
    }

    pushMetric(current.sttFinalSamples, sttFinalMs);
    current.recentOriginals.push(text);
    if (current.recentOriginals.length > CONTEXT_LINES + 2) {
      current.recentOriginals.shift();
    }
    // Mostra a frase final em inglês enquanto a tradução não chega.
    emitPartial(current, itemId, text);
    current.translationQueue.push({ itemId, seq, text, sttFinalMs });
    pumpTranslations(current);
  }

  function handleStatus(current, state) {
    current.connection = state;
    if (state === "reconnecting") {
      // Frases abertas no socket anterior não vão receber resultado final.
      for (const [itemId, item] of current.items) {
        if (!item.done) {
          emitPartial(current, itemId, "");
          settle(current, item.seq, null);
        }
      }
      current.items.clear();
    }
  }

  function start(payload) {
    if (session) {
      throw new Error("Sessao de traducao ja ativa.");
    }
    if (!payload.consentAccepted) {
      throw new Error("CONSENT_REQUIRED: confirme o aviso legal antes de iniciar traducao.");
    }

    const prefs = settingsStore?.getTranslationPrefs ? settingsStore.getTranslationPrefs() : {};
    const sourceLanguage = normalizeLanguage(
      payload.sourceLanguage || prefs.sourceLanguage,
      DEFAULT_SOURCE_LANGUAGE
    );
    const targetLanguage = normalizeLanguage(payload.targetLanguage || prefs.targetLanguage, "pt");
    if (targetLanguage === "auto" || sourceLanguage === targetLanguage) {
      throw new Error("Origem e destino precisam ser idiomas diferentes. Ajuste em Configuracoes > Traducao.");
    }

    const flags = getEffectiveFlags ? getEffectiveFlags() : {};
    const privacy = settingsStore?.getPublicLlmSettings?.()?.privacy;
    if (flags.forceLocalOnly || privacy?.allowCloudProcessingForMeetings === false) {
      throw new Error(
        "Legendas ao vivo exigem processamento em nuvem. Ative em Configuracoes > IA e modelos."
      );
    }
    if (!getOpenAiApiKey?.()) {
      throw new Error(
        "Legendas ao vivo usam a transcricao em streaming da OpenAI. Configure a chave OpenAI em Configuracoes > IA e modelos."
      );
    }

    const audioProfile = settingsStore?.getAudioCapture
      ? settingsStore.getAudioCapture()
      : { mode: "system_loopback" };

    const current = {
      id: require("node:crypto").randomUUID(),
      sourceLanguage,
      targetLanguage,
      audioProfile,
      startedAtIso: new Date().toISOString(),
      connection: "connecting",
      items: new Map(),
      results: new Map(),
      readyAt: new Map(),
      nextEmitSeq: 0,
      flushTimer: false,
      translationQueue: [],
      inFlight: 0,
      recentOriginals: [],
      firstPartialSamples: [],
      sttFinalSamples: [],
      llmSamples: [],
      latencySamples: [],
      linesEmitted: 0
    };
    session = current;

    if (consentAuditStore) {
      consentAuditStore.recordConsent({
        sessionId: current.id,
        sessionType: "translation",
        consentAccepted: true,
        consentTextVersion: payload.consentTextVersion,
        useCloud: true,
        sttProvider: STT_PROVIDER
      });
    }
    tokenUsageTracker.setSessionCloud(current.id, true);

    sttClient = createSttClient({
      logger,
      language: sourceLanguage,
      sessionModel: prefs.realtimeModel || "gpt-realtime-1.5",
      model: prefs.transcriptionModel || "gpt-4o-mini-transcribe",
      getApiKey: getOpenAiApiKey,
      onStatus: (state) => {
        if (session === current) handleStatus(current, state);
      },
      onSpeechStarted: (itemId, seq) => {
        if (session === current) handleSpeechStarted(current, itemId, seq);
      },
      onPartial: (itemId, text, seq) => {
        if (session === current) handlePartial(current, itemId, text, seq);
      },
      onFinal: (itemId, text, seq) => {
        if (session === current) handleFinal(current, itemId, text, seq);
      },
      onError: (error) => {
        if (session !== current) return;
        logger.warn("Realtime STT error", { message: error.message });
        emitError("TRANSLATION_STT_STREAM", error.message, current.id);
      }
    });
    sttClient.start();

    if (audioCaptureMeter?.start) {
      audioCaptureMeter.start({
        mode: audioProfile.mode || "system_loopback",
        deviceId: audioProfile.deviceId || "default",
        source: "translation",
        label: audioProfile.mode === "microphone" ? "Microfone" : "Saída do sistema"
      });
    }

    logger.info("Translation session started", {
      sessionId: current.id,
      source: sourceLanguage,
      target: targetLanguage,
      captureMode: audioProfile.mode,
      sttProvider: STT_PROVIDER
    });

    return {
      sessionId: current.id,
      startedAtIso: current.startedAtIso,
      captureMode: audioProfile.mode
    };
  }

  function stop() {
    const current = session;
    session = null;
    if (sttClient) {
      sttClient.stop();
      sttClient = null;
    }
    if (audioCaptureMeter?.stop) {
      audioCaptureMeter.stop();
    }
    if (translationOverlayWindow) {
      translationOverlayWindow.hide();
    }
    if (current) {
      tokenUsageTracker.clearSession(current.id);
    }
    logger.info("Translation session stopped", { sessionId: current?.id });
    return { sessionId: current?.id, status: "stopped" };
  }

  function getStatus() {
    if (!session) {
      return { active: false };
    }
    return {
      active: true,
      sessionId: session.id,
      sourceLanguage: session.sourceLanguage,
      targetLanguage: session.targetLanguage,
      captureMode: session.audioProfile.mode,
      connection: session.connection,
      firstPartialMs: average(session.firstPartialSamples),
      sttFinalMs: average(session.sttFinalSamples),
      llmMs: average(session.llmSamples),
      avgLatencyMs: average(session.latencySamples),
      maxLatencyMs: session.latencySamples.length ? Math.max(...session.latencySamples) : 0,
      linesEmitted: session.linesEmitted,
      useCloud: true,
      overlayVisible: Boolean(translationOverlayWindow?.isVisible?.())
    };
  }

  /** PCM16 mono 24 kHz vindo do renderer (frames de 100 ms). */
  function ingestAudioFrame(pcm) {
    if (!session || !sttClient) {
      return false;
    }
    return sttClient.sendAudio(pcm);
  }

  return {
    start,
    stop,
    getStatus,
    ingestAudioFrame,
    isActive: () => Boolean(session)
  };
}

module.exports = { createTranslationSession, buildTranslatePrompt, dedupeAgainstPrevious };
