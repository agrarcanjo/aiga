const test = require("node:test");
const assert = require("node:assert/strict");
const { createTranslationSession, dedupeAgainstPrevious } = require("./translation-session.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup(overrides = {}) {
  const events = [];
  const pendingTranslations = [];
  let client = null;
  let clock = 1000;
  const session = createTranslationSession({
    logger: { info() {}, warn() {}, error() {} },
    settingsStore: {
      getTranslationPrefs: () => ({ sourceLanguage: "auto", targetLanguage: "pt" }),
      getPublicLlmSettings: () => ({ privacy: { allowCloudProcessingForMeetings: true } }),
      getAudioCapture: () => ({ mode: "system_loopback" })
    },
    tokenUsageTracker: { shouldBlockCloud: () => false, setSessionCloud() {}, clearSession() {} },
    llmProviderRegistry: {
      streamForFeature: async (input) => {
        const d = deferred();
        pendingTranslations.push({ input, resolve: d.resolve });
        const text = await d.promise;
        input.onEvent({ fullText: text });
      }
    },
    emitRendererEvent: (channel, payload) => events.push([channel, payload]),
    getEffectiveFlags: () => ({}),
    getOpenAiApiKey: () => "sk-test",
    now: () => clock,
    schedule: () => {},
    createSttClient: (options) => {
      client = {
        options,
        started: false,
        frames: [],
        start() {
          this.started = true;
        },
        stop() {
          this.started = false;
        },
        sendAudio(buf) {
          this.frames.push(buf);
          return true;
        }
      };
      return client;
    },
    ...overrides
  });
  return {
    session,
    events,
    pendingTranslations,
    getClient: () => client,
    advance: (ms) => {
      clock += ms;
    }
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("uses the saved source language and defaults to English", () => {
  const { session, getClient } = setup();
  session.start({ targetLanguage: "pt", consentAccepted: true });
  assert.equal(getClient().options.language, "auto");
  assert.equal(getClient().options.sessionModel, "gpt-realtime-1.5");
  assert.equal(getClient().options.model, "gpt-4o-mini-transcribe");
  session.stop();

  const spanish = setup({
    settingsStore: {
      getTranslationPrefs: () => ({ sourceLanguage: "es", targetLanguage: "pt" }),
      getPublicLlmSettings: () => ({ privacy: { allowCloudProcessingForMeetings: true } }),
      getAudioCapture: () => ({ mode: "system_loopback" })
    }
  });
  spanish.session.start({ targetLanguage: "pt", consentAccepted: true });
  assert.equal(spanish.getClient().options.language, "es");
  assert.equal(spanish.session.getStatus().sourceLanguage, "es");

  const fallback = setup({
    settingsStore: {
      getTranslationPrefs: () => ({ targetLanguage: "pt" }),
      getPublicLlmSettings: () => ({ privacy: { allowCloudProcessingForMeetings: true } }),
      getAudioCapture: () => ({ mode: "system_loopback" })
    }
  });
  fallback.session.start({ targetLanguage: "pt", consentAccepted: true });
  assert.equal(fallback.getClient().options.language, "en");
});

test("fails clearly without an OpenAI key", () => {
  const { session } = setup({ getOpenAiApiKey: () => "" });
  assert.throws(() => session.start({ targetLanguage: "pt", consentAccepted: true }), /chave OpenAI/);
  assert.equal(session.isActive(), false);
});

test("fails clearly when cloud processing is disabled", () => {
  const { session } = setup({
    settingsStore: {
      getTranslationPrefs: () => ({ targetLanguage: "pt" }),
      getPublicLlmSettings: () => ({ privacy: { allowCloudProcessingForMeetings: false } }),
      getAudioCapture: () => ({ mode: "system_loopback" })
    }
  });
  assert.throws(
    () => session.start({ targetLanguage: "pt", consentAccepted: true }),
    /exigem processamento em nuvem/
  );
});

test("partial is emitted before the final line with the same itemId", async () => {
  const { session, events, pendingTranslations, getClient, advance } = setup();
  session.start({ targetLanguage: "pt", consentAccepted: true });
  const cb = getClient().options;
  cb.onSpeechStarted("a", 0);
  advance(400);
  cb.onPartial("a", "Hello", 0);
  advance(600);
  cb.onFinal("a", "Hello world.", 0);
  assert.equal(pendingTranslations.length, 1);
  pendingTranslations[0].resolve("Olá mundo.");
  await flush();

  const partials = events.filter((e) => e[0] === "translation:partial").map((e) => e[1].text);
  assert.deepEqual(partials, ["Hello", "Hello world."]);
  const line = events.find((e) => e[0] === "translation:line")[1];
  assert.equal(line.itemId, "a");
  assert.equal(line.originalText, "Hello world.");
  assert.equal(line.translatedText, "Olá mundo.");
  assert.equal(line.sttMs, 1000);
  const firstLineIndex = events.findIndex((e) => e[0] === "translation:line");
  const firstPartialIndex = events.findIndex((e) => e[0] === "translation:partial");
  assert.ok(firstPartialIndex < firstLineIndex);
  assert.equal(session.getStatus().firstPartialMs, 400);
});

test("lines are emitted in sentence order even when translations finish out of order", async () => {
  const { session, events, pendingTranslations, getClient } = setup();
  session.start({ targetLanguage: "pt", consentAccepted: true });
  const cb = getClient().options;
  cb.onFinal("a", "First sentence here.", 0);
  cb.onFinal("b", "Second sentence here.", 1);
  assert.equal(pendingTranslations.length, 2);
  pendingTranslations[1].resolve("Segunda frase.");
  await flush();
  assert.equal(events.filter((e) => e[0] === "translation:line").length, 0);
  pendingTranslations[0].resolve("Primeira frase.");
  await flush();
  const lines = events.filter((e) => e[0] === "translation:line").map((e) => e[1].itemId);
  assert.deepEqual(lines, ["a", "b"]);
});

test("at most two translations run at the same time and none are dropped", async () => {
  const { session, events, pendingTranslations, getClient } = setup();
  session.start({ targetLanguage: "pt", consentAccepted: true });
  const cb = getClient().options;
  cb.onFinal("a", "Sentence number one.", 0);
  cb.onFinal("b", "Sentence number two.", 1);
  cb.onFinal("c", "Sentence number three.", 2);
  assert.equal(pendingTranslations.length, 2);
  pendingTranslations[0].resolve("Um.");
  await flush();
  assert.equal(pendingTranslations.length, 3);
  pendingTranslations[1].resolve("Dois.");
  pendingTranslations[2].resolve("Três.");
  await flush();
  await flush();
  const lines = events.filter((e) => e[0] === "translation:line").map((e) => e[1].itemId);
  assert.deepEqual(lines, ["a", "b", "c"]);
});

test("empty final clears the partial and does not block later sentences", async () => {
  const { session, events, pendingTranslations, getClient } = setup();
  session.start({ targetLanguage: "pt", consentAccepted: true });
  const cb = getClient().options;
  cb.onPartial("a", "uh", 0);
  cb.onFinal("a", "", 0);
  cb.onFinal("b", "Real sentence here.", 1);
  pendingTranslations[0].resolve("Frase real.");
  await flush();
  const lines = events.filter((e) => e[0] === "translation:line").map((e) => e[1].itemId);
  assert.deepEqual(lines, ["b"]);
  const cleared = events.find((e) => e[0] === "translation:partial" && e[1].itemId === "a" && e[1].text === "");
  assert.ok(cleared);
});

test("audio frames are forwarded to the streaming client", () => {
  const { session, getClient } = setup();
  assert.equal(session.ingestAudioFrame(Buffer.alloc(4800)), false);
  session.start({ targetLanguage: "pt", consentAccepted: true });
  assert.equal(session.ingestAudioFrame(Buffer.alloc(4800)), true);
  assert.equal(getClient().frames.length, 1);
  session.stop();
  assert.equal(session.ingestAudioFrame(Buffer.alloc(4800)), false);
});

test("dedupe trims overlap with the previous sentence", () => {
  assert.equal(
    dedupeAgainstPrevious("we went to the market today", "the market today and bought apples"),
    "and bought apples"
  );
  assert.equal(dedupeAgainstPrevious("Same text", "same text"), "");
});
