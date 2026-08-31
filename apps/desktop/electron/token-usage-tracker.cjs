// Session and daily token usage tracking
const { estimateTokensFromText } = require("./llm-parts-builder.cjs");

function createTokenUsageTracker(options) {
  const logger = options.logger;
  const getBudget = options.getBudget;
  const sessions = new Map();
  let dailyInput = 0;
  let dailyOutput = 0;
  let dailyDate = new Date().toISOString().slice(0, 10);

  function rollDailyIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== dailyDate) {
      dailyDate = today;
      dailyInput = 0;
      dailyOutput = 0;
    }
  }

  function ensureSession(sessionId) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        inputTokens: 0,
        outputTokens: 0,
        estimatedTokens: 0,
        transcriptChars: 0,
        cloudActive: false
      });
    }
    return sessions.get(sessionId);
  }

  function recordUsage(sessionId, payload) {
    rollDailyIfNeeded();
    const session = ensureSession(sessionId);
    const input = payload.inputTokens || 0;
    const output = payload.outputTokens || 0;
    session.inputTokens += input;
    session.outputTokens += output;
    if (payload.estimated) {
      session.estimatedTokens += input + output;
    }
    dailyInput += input;
    dailyOutput += output;
    logger.debug("Token usage recorded", {
      sessionId,
      input,
      output,
      estimated: Boolean(payload.estimated)
    });
  }

  function setSessionCloud(sessionId, active) {
    const session = ensureSession(sessionId);
    session.cloudActive = Boolean(active);
  }

  function appendTranscript(sessionId, text) {
    const session = ensureSession(sessionId);
    session.transcriptChars += (text || "").length;
    session.estimatedTokens = estimateTokensFromText(
      "x".repeat(session.transcriptChars)
    );
  }

  function getSessionUsage(sessionId) {
    const session = sessions.get(sessionId) || {
      inputTokens: 0,
      outputTokens: 0,
      estimatedTokens: 0,
      transcriptChars: 0,
      cloudActive: false
    };
    const budget = getBudget ? getBudget() : { enabled: false };
    const total =
      session.inputTokens + session.outputTokens + session.estimatedTokens;
    return {
      sessionId,
      estimatedTokens: session.estimatedTokens,
      recordedInputTokens: session.inputTokens,
      recordedOutputTokens: session.outputTokens,
      totalTokens: total,
      cloudActive: session.cloudActive,
      budget,
      overWarning:
        budget.enabled &&
        budget.sessionWarningTokens > 0 &&
        total >= budget.sessionWarningTokens,
      overHard:
        budget.enabled &&
        budget.sessionHardLimitTokens > 0 &&
        total >= budget.sessionHardLimitTokens
    };
  }

  function shouldBlockCloud(sessionId) {
    const usage = getSessionUsage(sessionId);
    if (!usage.budget?.enabled) {
      return false;
    }
    if (usage.budget.onLimitReached !== "block_cloud") {
      return false;
    }
    return usage.overHard;
  }

  function clearSession(sessionId) {
    sessions.delete(sessionId);
  }

  function getDailyUsage() {
    rollDailyIfNeeded();
    const budget = getBudget ? getBudget() : { enabled: false };
    const total = dailyInput + dailyOutput;
    return {
      date: dailyDate,
      inputTokens: dailyInput,
      outputTokens: dailyOutput,
      totalTokens: total,
      budget,
      overDaily:
        budget.enabled &&
        budget.dailyLimitTokens > 0 &&
        total >= budget.dailyLimitTokens
    };
  }

  /** @returns {'ok'|'warning'|'hard'} */
  function getSessionBudgetLevel(sessionId) {
    const usage = getSessionUsage(sessionId);
    if (!usage.budget?.enabled) {
      return "ok";
    }
    if (usage.overHard) {
      return "hard";
    }
    if (usage.overWarning) {
      return "warning";
    }
    return "ok";
  }

  return {
    recordUsage,
    setSessionCloud,
    appendTranscript,
    getSessionUsage,
    getDailyUsage,
    getSessionBudgetLevel,
    shouldBlockCloud,
    clearSession
  };
}

module.exports = { createTokenUsageTracker };
