// Streaming STT na nuvem (OpenAI Realtime, sessao so de transcricao) para legenda ao vivo.
const { MinimalWebSocket } = require("./minimal-websocket.cjs");

const REALTIME_URL = "wss://api.openai.com/v1/realtime";
const DEFAULT_SESSION_MODEL = "gpt-realtime-1.5";
const DEFAULT_MODEL = "gpt-4o-mini-transcribe";
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

function buildRealtimeUrl(sessionModel, baseUrl = REALTIME_URL) {
  const url = new URL(baseUrl);
  url.searchParams.set("model", sessionModel || DEFAULT_SESSION_MODEL);
  return url.toString();
}

/** Sessão GA de transcrição. O header OpenAI-Beta foi removido em maio de 2026. */
function buildSessionUpdate({ model, language }) {
  const transcription = { model };
  if (language && language !== "auto") {
    transcription.language = language;
  }
  return {
    type: "session.update",
    session: {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          transcription,
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
          },
          noise_reduction: { type: "near_field" }
        }
      }
    }
  };
}

/**
 * Cria cliente de transcricao em streaming.
 * Callbacks: onStatus(state), onSpeechStarted(itemId, seq), onPartial(itemId, text, seq),
 * onFinal(itemId, text, seq), onError(error).
 */
function createRealtimeSttClient(options) {
  const logger = options.logger || { info() {}, warn() {}, error() {} };
  const getApiKey = options.getApiKey;
  const WebSocketImpl = options.WebSocketImpl || MinimalWebSocket;
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms));
  const sessionModel = options.sessionModel || DEFAULT_SESSION_MODEL;
  const url = options.url || buildRealtimeUrl(sessionModel);
  const model = options.model || DEFAULT_MODEL;
  const language = options.language || "en";
  const callbacks = {
    onStatus: options.onStatus || (() => {}),
    onSpeechStarted: options.onSpeechStarted || (() => {}),
    onPartial: options.onPartial || (() => {}),
    onFinal: options.onFinal || (() => {}),
    onError: options.onError || (() => {})
  };

  let socket = null;
  let active = false;
  let ready = false;
  let configured = false;
  let attempts = 0;
  let nextSeq = 0;
  const items = new Map();

  function sendSessionUpdate(ws) {
    if (!ws || configured) return;
    configured = true;
    ws.send(JSON.stringify(buildSessionUpdate({ model, language })));
  }

  function setStatus(state) {
    callbacks.onStatus(state);
  }

  function itemFor(itemId) {
    let item = items.get(itemId);
    if (!item) {
      item = { seq: nextSeq, text: "" };
      nextSeq += 1;
      items.set(itemId, item);
    }
    return item;
  }

  function handleMessage(raw) {
    let event;
    try {
      event = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
    } catch {
      return;
    }
    switch (event.type) {
      case "session.created":
      case "transcription_session.created":
        sendSessionUpdate(socket);
        return;
      case "session.updated":
      case "transcription_session.updated":
        ready = true;
        attempts = 0;
        setStatus("live");
        return;
      case "input_audio_buffer.speech_started": {
        if (!event.item_id) return;
        const item = itemFor(event.item_id);
        callbacks.onSpeechStarted(event.item_id, item.seq);
        return;
      }
      case "input_audio_buffer.committed":
        if (event.item_id) itemFor(event.item_id);
        return;
      case "conversation.item.input_audio_transcription.delta": {
        if (!event.item_id || !event.delta) return;
        const item = itemFor(event.item_id);
        item.text += event.delta;
        callbacks.onPartial(event.item_id, item.text, item.seq);
        return;
      }
      case "conversation.item.input_audio_transcription.completed": {
        if (!event.item_id) return;
        const item = itemFor(event.item_id);
        const text = (event.transcript ?? item.text ?? "").trim();
        items.delete(event.item_id);
        callbacks.onFinal(event.item_id, text, item.seq);
        return;
      }
      case "conversation.item.input_audio_transcription.failed": {
        const item = event.item_id ? items.get(event.item_id) : null;
        if (event.item_id) items.delete(event.item_id);
        if (item) callbacks.onFinal(event.item_id, "", item.seq);
        callbacks.onError(new Error(event.error?.message || "Falha ao transcrever trecho."));
        return;
      }
      case "error":
        callbacks.onError(new Error(event.error?.message || "Erro no streaming de transcricao."));
        return;
      default:
        return;
    }
  }

  function connect() {
    const apiKey = getApiKey ? getApiKey() : "";
    if (!apiKey) {
      const error = new Error("Chave OpenAI ausente. Configure em Configuracoes > IA e modelos.");
      setStatus("error");
      callbacks.onError(error);
      return;
    }
    ready = false;
    configured = false;
    setStatus(attempts === 0 ? "connecting" : "reconnecting");
    const ws = new WebSocketImpl(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    socket = ws;
    ws.on("open", () => {
      if (socket === ws) sendSessionUpdate(ws);
    });
    ws.on("message", (raw) => {
      if (socket === ws) handleMessage(raw);
    });
    ws.on("error", (error) => {
      logger.warn("Realtime STT socket error", { message: error?.message });
    });
    ws.on("close", (code, reason) => {
      if (socket !== ws) return;
      socket = null;
      ready = false;
      if (!active) {
        setStatus("closed");
        return;
      }
      scheduleReconnect(code, reason);
    });
  }

  function scheduleReconnect(code, reason) {
    if (attempts >= RECONNECT_DELAYS_MS.length) {
      setStatus("error");
      callbacks.onError(
        new Error(`Conexao de transcricao perdida (codigo ${code}${reason ? `: ${reason}` : ""}).`)
      );
      active = false;
      return;
    }
    const delay = RECONNECT_DELAYS_MS[attempts];
    attempts += 1;
    setStatus("reconnecting");
    logger.info("Realtime STT reconnecting", { code, attempt: attempts, delay });
    schedule(() => {
      if (active) connect();
    }, delay);
  }

  function start() {
    if (active) return;
    active = true;
    attempts = 0;
    nextSeq = 0;
    items.clear();
    connect();
  }

  /** Recebe PCM16 mono 24 kHz. Frames com a conexao caida sao descartados. */
  function sendAudio(pcmBuffer) {
    if (!active || !ready || !socket) return false;
    const audio = Buffer.from(pcmBuffer).toString("base64");
    try {
      socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
      return true;
    } catch {
      return false;
    }
  }

  function stop() {
    active = false;
    ready = false;
    items.clear();
    const ws = socket;
    socket = null;
    if (ws) {
      try {
        ws.close(1000, "stop");
      } catch {
        // ignore
      }
    }
    setStatus("closed");
  }

  return {
    start,
    stop,
    sendAudio,
    isReady: () => ready
  };
}

module.exports = {
  createRealtimeSttClient,
  buildSessionUpdate,
  buildRealtimeUrl,
  REALTIME_URL,
  DEFAULT_SESSION_MODEL,
  DEFAULT_MODEL,
  RECONNECT_DELAYS_MS
};
