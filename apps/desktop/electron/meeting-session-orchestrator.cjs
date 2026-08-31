// Meeting passive + active modes: record state, transcript, summary, directed-question alerts (G3)
const {
  heuristicDetectDirectedQuestion,
  heuristicDetectInterviewQuestion,
  buildClassifierPrompt,
  buildInterviewClassifierPrompt,
  parseClassifierResponse,
  buildSuggestionPrompt
} = require("./meeting-active-detector.cjs");

const MID_CALL_SUMMARY_PROMPT = `Voce e um assistente de reunioes. Com base APENAS no transcript parcial abaixo, produza um resumo CURTO (max ~12 linhas) do que importa ATE AGORA:
- Topicos em andamento
- Decisoes ja tomadas
- Bloqueios / riscos
- Proximos passos
Nao invente fatos. Markdown objetivo.`;

const MEETING_SUMMARY_PROMPT = `Voce e um assistente de reunioes. Gere um resumo estruturado em Markdown com:
## Resumo executivo
## Topicos discutidos
## Pontos criticos e riscos
## Action items
Seja objetivo. Use apenas o transcript fornecido.`;

const ACTIVE_CONFIDENCE_THRESHOLD = 0.55;
const ACTIVE_ALERT_DEBOUNCE_MS = 8000;
const ACTIVE_DETECTION_DELAY_MS = 2500;

function normalizeQuestionKey(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

function isActiveMeetingMode(mode) {
  return mode === "active" || mode === "hybrid";
}

function createMeetingSessionOrchestrator(dependencies) {
  const logger = dependencies.logger;
  const llmRegistry = dependencies.llmProviderRegistry;
  const contextStore = dependencies.contextStore;
  const tokenUsageTracker = dependencies.tokenUsageTracker;
  const emitRendererEvent = dependencies.emitRendererEvent;
  const settingsStore = dependencies.settingsStore;
  const audioLoopbackCapture = dependencies.audioLoopbackCapture;
  const audioSourceValidator = dependencies.audioSourceValidator;
  const getStealthState = dependencies.getStealthState;
  const meetingTrayService = dependencies.meetingTrayService;
  const consentAuditStore = dependencies.consentAuditStore;

  const sessions = new Map();
  let statusInterval = null;

  function sessionElapsedSeconds(session) {
    return Math.floor((Date.now() - session.startedAt) / 1000);
  }

  function syncTray(session) {
    if (!meetingTrayService) {
      return;
    }
    if (session.status === "recording") {
      const elapsed = sessionElapsedSeconds(session);
      if (!session.trayActive) {
        meetingTrayService.setRecording({ sessionId: session.id, elapsedSeconds: elapsed });
        session.trayActive = true;
      } else {
        meetingTrayService.updateElapsed(elapsed);
      }
    } else {
      meetingTrayService.clearRecording();
      session.trayActive = false;
    }
  }

  function emitStatus(session) {
    const elapsedSeconds = sessionElapsedSeconds(session);
    const usage = tokenUsageTracker.getSessionUsage(session.id);
    const tokenBudgetLevel = tokenUsageTracker.getSessionBudgetLevel
      ? tokenUsageTracker.getSessionBudgetLevel(session.id)
      : "ok";

    if (session.lastTokenBudgetLevel !== tokenBudgetLevel) {
      session.lastTokenBudgetLevel = tokenBudgetLevel;
      if (tokenBudgetLevel !== "ok") {
        emitRendererEvent("usage:tokens:threshold", {
          sessionId: session.id,
          level: tokenBudgetLevel,
          estimatedCloudTokens:
            usage.estimatedTokens + usage.recordedInputTokens + usage.recordedOutputTokens,
          emittedAtIso: new Date().toISOString()
        });
      }
    }

    emitRendererEvent("meeting:session:status", {
      sessionId: session.id,
      status: session.status,
      elapsedSeconds,
      estimatedCloudTokens: usage.estimatedTokens + usage.recordedInputTokens + usage.recordedOutputTokens,
      cloudActive: session.useCloud,
      transcriptLength: session.transcript.length,
      tokenBudgetLevel,
      bookmarkCount: (session.bookmarks || []).length
    });
    syncTray(session);
  }

  function resolveAliases(session) {
    const fromSession = (session.userAliases || []).map((a) => String(a).trim()).filter(Boolean);
    if (fromSession.length) {
      return fromSession;
    }
    const name = session.profile?.name?.trim();
    return name ? [name] : [];
  }

  function isStealthMuted() {
    const state = typeof getStealthState === "function" ? getStealthState() : null;
    return Boolean(state?.enabled);
  }

  async function collectLlmText(input) {
    let fullText = "";
    await llmRegistry.streamForFeature({
      ...input,
      screenshots: input.screenshots || [],
      audioItems: input.audioItems || [],
      onEvent: (ev) => {
        if (ev.fullText) {
          fullText = ev.fullText;
        }
        if (ev.status === "completed" && ev.fullText) {
          fullText = ev.fullText;
        }
      }
    });
    return fullText.trim();
  }

  async function runActiveDetection(session) {
    if (!isActiveMeetingMode(session.mode) || session.status !== "recording") {
      return;
    }

    const isInterview = session.templateId === "interview";
    const aliases = resolveAliases(session);
    if (!isInterview && !aliases.length) {
      return;
    }

    const transcript = session.transcript;
    let detection = isInterview
      ? heuristicDetectInterviewQuestion(transcript)
      : heuristicDetectDirectedQuestion(transcript, aliases);

    const canUseCloud =
      session.useCloud && !tokenUsageTracker.shouldBlockCloud(session.id);

    if (!detection.directed && !session.questionOnlyMode && canUseCloud) {
      try {
        const requestId = require("node:crypto").randomUUID();
        const classifierAsk = isInterview
          ? buildInterviewClassifierPrompt(transcript, session.profile)
          : buildClassifierPrompt(transcript, aliases, session.profile);
        const raw = await collectLlmText({
          feature: "meetingActiveClassifier",
          requestId,
          sessionId: session.id,
          apiKey: "",
          effectiveFlags: {},
          ask: classifierAsk
        });
        const llmResult = parseClassifierResponse(raw);
        if (llmResult.directed && llmResult.confidence >= detection.confidence) {
          detection = llmResult;
        }
      } catch (error) {
        logger.warn("Meeting active classifier failed", {
          sessionId: session.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (!detection.directed || detection.confidence < ACTIVE_CONFIDENCE_THRESHOLD) {
      return;
    }

    const questionText = detection.questionText || "(pergunta detectada)";
    const now = Date.now();
    if (session.lastAlertAt && now - session.lastAlertAt < ACTIVE_ALERT_DEBOUNCE_MS) {
      return;
    }
    if (session.lastAlertQuestion === questionText) {
      return;
    }
    const questionKey = normalizeQuestionKey(questionText);
    if (session.dismissedQuestions?.has(questionKey)) {
      return;
    }

    let suggestedResponse = "";
    if (canUseCloud) {
      try {
        const requestId = require("node:crypto").randomUUID();
        suggestedResponse = await collectLlmText({
          feature: "meetingSummary",
          requestId,
          sessionId: session.id,
          apiKey: "",
          effectiveFlags: {},
          ask: buildSuggestionPrompt(
            questionText,
            session.profile,
            session.objective,
            transcript,
            {
              templateId: session.templateId,
              customPrompt: session.customPrompt
            }
          )
        });
      } catch (error) {
        logger.warn("Meeting active suggestion failed", {
          sessionId: session.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (!suggestedResponse) {
      suggestedResponse = isInterview
        ? "Pergunta de entrevista detectada. Estruture a resposta: tese → abordagem → trade-offs → exemplo."
        : `Pergunta detectada. Responda de forma objetiva como ${session.profile?.role || "participante"}.`;
    }

    session.lastAlertAt = now;
    session.lastAlertQuestion = questionText;

    emitRendererEvent("meeting:active:alert", {
      sessionId: session.id,
      questionText,
      confidence: detection.confidence,
      suggestedResponse,
      detectedAtIso: new Date().toISOString(),
      source: detection.source,
      stealthMuted: isStealthMuted()
    });

    logger.info("Meeting active alert", {
      sessionId: session.id,
      confidence: detection.confidence,
      source: detection.source
    });
  }

  function dismissActiveAlert(sessionId, questionText) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { ok: false };
    }
    if (!session.dismissedQuestions) {
      session.dismissedQuestions = new Set();
    }
    session.dismissedQuestions.add(normalizeQuestionKey(questionText));
    logger.info("Meeting active alert dismissed", { sessionId, questionText });
    return { ok: true };
  }

  function scheduleActiveDetection(session) {
    if (!isActiveMeetingMode(session.mode)) {
      return;
    }
    if (session.activeDetectionTimer) {
      clearTimeout(session.activeDetectionTimer);
    }
    session.activeDetectionTimer = setTimeout(() => {
      session.activeDetectionTimer = null;
      void runActiveDetection(session).catch((err) => {
        logger.error("Active detection failed", {
          sessionId: session.id,
          message: String(err)
        });
      });
    }, ACTIVE_DETECTION_DELAY_MS);
  }

  function clearActiveTimers(session) {
    if (session.activeDetectionTimer) {
      clearTimeout(session.activeDetectionTimer);
      session.activeDetectionTimer = null;
    }
  }

  function startStatusTicker() {
    if (statusInterval) {
      return;
    }
    statusInterval = setInterval(() => {
      for (const session of sessions.values()) {
        if (session.status === "recording") {
          emitStatus(session);
        }
      }
    }, 1000);
  }

  function stopStatusTickerIfIdle() {
    const anyRecording = [...sessions.values()].some((s) => s.status === "recording");
    if (!anyRecording && statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
  }

  async function startSession(payload) {
    const profile = contextStore.getProfile(payload.profileId);
    if (!profile) {
      throw new Error("Perfil nao encontrado.");
    }

    const audioProfile = settingsStore?.getAudioCapture
      ? settingsStore.getAudioCapture()
      : { mode: "microphone" };

    if (audioProfile.mode !== "microphone" && audioSourceValidator) {
      const test = await audioSourceValidator.testSource(audioProfile);
      if (!test.ok) {
        throw new Error(test.message || "Falha na validacao da fonte de audio.");
      }
    }

    const meetingPrefs = settingsStore?.getMeetingPrefs ? settingsStore.getMeetingPrefs() : {};
    const mode = payload.mode || meetingPrefs.defaultMode || "passive";
    const userAliases =
      payload.userAliases?.length > 0
        ? payload.userAliases
        : meetingPrefs.userAliases || [];
    const questionOnlyMode =
      payload.questionOnlyMode !== undefined
        ? Boolean(payload.questionOnlyMode)
        : Boolean(meetingPrefs.questionOnlyMode);

    const session = {
      id: require("node:crypto").randomUUID(),
      profileId: payload.profileId,
      objective: payload.objective || "",
      customPrompt: payload.customPrompt || "",
      endAtIso: payload.endAtIso,
      useCloud: Boolean(payload.useCloud),
      mode,
      userAliases,
      questionOnlyMode,
      profile,
      transcript: "",
      status: "recording",
      startedAt: Date.now(),
      startedAtIso: new Date().toISOString(),
      audioProfile,
      activeDetectionTimer: null,
      lastAlertAt: 0,
      lastAlertQuestion: "",
      trayActive: false,
      dismissedQuestions: new Set(),
      bookmarks: [],
      lastTokenBudgetLevel: "ok",
      templateId: payload.templateId || null
    };

    if (!payload.consentAccepted) {
      throw new Error("CONSENT_REQUIRED: confirme o aviso legal antes de gravar.");
    }

    if (consentAuditStore) {
      consentAuditStore.recordConsent({
        sessionId: session.id,
        sessionType: "meeting",
        consentAccepted: true,
        consentTextVersion: payload.consentTextVersion,
        useCloud: session.useCloud
      });
    }

    sessions.set(session.id, session);

    // Arma medidor; chunks de áudio (mic ou loopback) vêm do renderer.
    if (audioLoopbackCapture) {
      audioLoopbackCapture.start(session.id, audioProfile);
    }
    tokenUsageTracker.setSessionCloud(session.id, session.useCloud);
    startStatusTicker();
    emitStatus(session);

    if (session.endAtIso) {
      const endMs = new Date(session.endAtIso).getTime();
      const delay = Math.max(0, endMs - Date.now());
      session.endTimer = setTimeout(() => {
        void stopSession({ sessionId: session.id }).catch((err) => {
          logger.error("Auto stop meeting failed", { message: String(err) });
        });
      }, delay);
    }

    logger.info("Meeting session started", {
      sessionId: session.id,
      profileId: profile.id,
      useCloud: session.useCloud,
      mode: session.mode
    });

    return {
      sessionId: session.id,
      startedAtIso: session.startedAtIso
    };
  }

  function appendTranscript(sessionId, text) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== "recording") {
      return { ok: false };
    }
    session.transcript += text;
    tokenUsageTracker.appendTranscript(sessionId, text);
    emitRendererEvent("meeting:transcript:delta", {
      sessionId,
      delta: text,
      fullText: session.transcript
    });
    scheduleActiveDetection(session);
    return { ok: true };
  }

  async function stopSession(payload) {
    const session = sessions.get(payload.sessionId);
    if (!session) {
      throw new Error("Sessao nao encontrada.");
    }
    if (session.status !== "recording") {
      return { sessionId: session.id, status: session.status };
    }

    clearActiveTimers(session);

    if (session.endTimer) {
      clearTimeout(session.endTimer);
    }

    if (audioLoopbackCapture) {
      audioLoopbackCapture.stop();
    }

    session.status = "processing";
    emitStatus(session);

    if (!session.transcript.trim()) {
      session.status = "completed";
      emitRendererEvent("meeting:session:completed", {
        sessionId: session.id,
        summaryMarkdown: "_Nenhum transcript capturado._",
        completedAtIso: new Date().toISOString()
      });
      stopStatusTickerIfIdle();
      return { sessionId: session.id, status: session.status };
    }

    const profileContext = [
      `Perfil: ${session.profile.name} (${session.profile.role})`,
      `Time: ${session.profile.team}`,
      `Objetivo da reuniao: ${session.objective}`,
      session.customPrompt ? `Instrucao extra: ${session.customPrompt}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    const ask = `${MEETING_SUMMARY_PROMPT}\n\n${profileContext}\n\n## Transcript\n${session.transcript.slice(-120_000)}`;

    let summaryMarkdown = "";

    try {
      if (session.useCloud && tokenUsageTracker.shouldBlockCloud(session.id)) {
        throw new Error("TOKEN_BUDGET_EXCEEDED");
      }

      if (session.useCloud) {
        const requestId = require("node:crypto").randomUUID();
        summaryMarkdown = await collectLlmText({
          feature: "meetingSummary",
          requestId,
          sessionId: session.id,
          apiKey: "",
          effectiveFlags: {},
          ask
        });
      } else if (dependencies.localProvider?.isAvailable()) {
        const requestId = require("node:crypto").randomUUID();
        await dependencies.localProvider.streamAskResponse({
          requestId,
          sessionId: session.id,
          apiKey: "",
          effectiveFlags: { forceLocalOnly: true },
          ask,
          screenshots: [],
          onEvent: (ev) => {
            if (ev.fullText) {
              summaryMarkdown = ev.fullText;
            }
          }
        });
      } else {
        summaryMarkdown = `_Resumo local indisponivel. Transcript (${session.transcript.length} chars) armazenado._\n\n${session.transcript.slice(0, 2000)}...`;
      }
    } catch (error) {
      session.status = "failed";
      const msg = error instanceof Error ? error.message : String(error);
      summaryMarkdown = `_Falha ao gerar resumo: ${msg}_`;
      logger.error("Meeting summary failed", { sessionId: session.id, message: msg });
    }

    if (session.status === "processing") {
      session.status = "completed";
    }

    contextStore.appendTeamMemory({
      meetingSessionId: session.id,
      profileId: session.profileId,
      objective: session.objective,
      excerpt: summaryMarkdown.slice(0, 500),
      fullSummary: summaryMarkdown
    });

    emitRendererEvent("meeting:session:completed", {
      sessionId: session.id,
      summaryMarkdown,
      completedAtIso: new Date().toISOString()
    });

    tokenUsageTracker.clearSession(session.id);
    stopStatusTickerIfIdle();

    logger.info("Meeting session completed", {
      sessionId: session.id,
      summaryLength: summaryMarkdown.length
    });

    return { sessionId: session.id, status: session.status };
  }

  function cancelSession(payload) {
    const session = sessions.get(payload.sessionId);
    if (!session) {
      throw new Error("Sessao nao encontrada.");
    }

    clearActiveTimers(session);

    if (session.endTimer) {
      clearTimeout(session.endTimer);
    }

    if (audioLoopbackCapture) {
      audioLoopbackCapture.stop();
    }

    session.status = "cancelled";
    session.transcript = "";
    tokenUsageTracker.clearSession(session.id);
    emitStatus(session);
    stopStatusTickerIfIdle();

    logger.info("Meeting session cancelled", { sessionId: session.id });

    return { sessionId: session.id, status: "cancelled" };
  }

  function hasActiveRecording() {
    return [...sessions.values()].some((s) => s.status === "recording");
  }

  async function requestMidCallSummary(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== "recording") {
      throw new Error("Sessao nao esta gravando.");
    }
    if (!session.transcript.trim()) {
      return { sessionId, summaryMarkdown: "_Ainda sem transcript._" };
    }
    if (session.useCloud && tokenUsageTracker.shouldBlockCloud(session.id)) {
      throw new Error("TOKEN_BUDGET_EXCEEDED");
    }

    const profileContext = [
      `Perfil: ${session.profile.name} (${session.profile.role})`,
      `Objetivo: ${session.objective}`
    ].join("\n");

    const ask = `${MID_CALL_SUMMARY_PROMPT}\n\n${profileContext}\n\n## Transcript parcial\n${session.transcript.slice(-60_000)}`;

    let summaryMarkdown = "";
    if (session.useCloud) {
      const requestId = require("node:crypto").randomUUID();
      summaryMarkdown = await collectLlmText({
        feature: "meetingSummary",
        requestId,
        sessionId: session.id,
        apiKey: "",
        effectiveFlags: {},
        ask
      });
    } else if (dependencies.localProvider?.isAvailable()) {
      const requestId = require("node:crypto").randomUUID();
      await dependencies.localProvider.streamAskResponse({
        requestId,
        sessionId: session.id,
        apiKey: "",
        effectiveFlags: { forceLocalOnly: true },
        ask,
        screenshots: [],
        onEvent: (ev) => {
          if (ev.fullText) {
            summaryMarkdown = ev.fullText;
          }
        }
      });
    } else {
      summaryMarkdown = session.transcript.slice(-1500);
    }

    emitRendererEvent("meeting:mid-summary", {
      sessionId: session.id,
      summaryMarkdown,
      generatedAtIso: new Date().toISOString()
    });

    return { sessionId: session.id, summaryMarkdown };
  }

  function addBookmark(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== "recording") {
      return { ok: false };
    }
    const elapsedSeconds = sessionElapsedSeconds(session);
    const bookmark = {
      id: require("node:crypto").randomUUID(),
      elapsedSeconds,
      createdAtIso: new Date().toISOString(),
      transcriptLength: session.transcript.length
    };
    session.bookmarks.push(bookmark);
    emitRendererEvent("meeting:transcript:bookmark", {
      sessionId: session.id,
      bookmark
    });
    emitStatus(session);
    return { ok: true, bookmark };
  }

  return {
    startSession,
    stopSession,
    cancelSession,
    appendTranscript,
    dismissActiveAlert,
    requestMidCallSummary,
    addBookmark,
    hasActiveRecording
  };
}

module.exports = { createMeetingSessionOrchestrator };
