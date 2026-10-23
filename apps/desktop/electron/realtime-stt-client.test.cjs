const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { createRealtimeSttClient, RECONNECT_DELAYS_MS } = require("./realtime-stt-client.cjs");
const { MinimalWebSocket, encodeFrame, decodeFrames } = require("./minimal-websocket.cjs");

function createFakeSocketFactory() {
  const sockets = [];
  class FakeSocket extends EventEmitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.closed = true;
    }
    serverSend(event) {
      this.emit("message", JSON.stringify(event));
    }
  }
  return { FakeSocket, sockets };
}

function setup(overrides = {}) {
  const { FakeSocket, sockets } = createFakeSocketFactory();
  const events = [];
  const scheduled = [];
  const client = createRealtimeSttClient({
    getApiKey: () => "sk-test",
    WebSocketImpl: FakeSocket,
    schedule: (fn, ms) => scheduled.push({ fn, ms }),
    onStatus: (s) => events.push(["status", s]),
    onSpeechStarted: (id, seq) => events.push(["speech", id, seq]),
    onPartial: (id, text, seq) => events.push(["partial", id, text, seq]),
    onFinal: (id, text, seq) => events.push(["final", id, text, seq]),
    onError: (e) => events.push(["error", e.message]),
    ...overrides
  });
  return { client, sockets, events, scheduled };
}

function goLive(socket) {
  socket.serverSend({ type: "session.created" });
  socket.serverSend({ type: "session.updated" });
}

test("sends GA transcription session update with English and server VAD", () => {
  const { client, sockets } = setup();
  client.start();
  const socket = sockets[0];
  assert.equal(socket.url, "wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5");
  assert.equal(socket.options.headers.Authorization, "Bearer sk-test");
  assert.equal(socket.options.headers["OpenAI-Beta"], undefined);
  socket.serverSend({ type: "session.created" });
  const update = socket.sent[0];
  assert.equal(update.type, "session.update");
  assert.equal(update.session.type, "transcription");
  assert.equal(update.session.audio.input.transcription.model, "gpt-4o-mini-transcribe");
  assert.equal(update.session.audio.input.transcription.language, "en");
  assert.equal(update.session.audio.input.format.rate, 24000);
  assert.equal(update.session.audio.input.turn_detection.type, "server_vad");
});

test("uses the configured realtime and transcription models", () => {
  const { client, sockets } = setup({
    sessionModel: "gpt-realtime-next",
    model: "gpt-live-transcribe"
  });
  client.start();
  assert.equal(sockets[0].url, "wss://api.openai.com/v1/realtime?model=gpt-realtime-next");
  sockets[0].serverSend({ type: "session.created" });
  assert.equal(
    sockets[0].sent[0].session.audio.input.transcription.model,
    "gpt-live-transcribe"
  );
});

test("omits language when the source is auto", () => {
  const { client, sockets } = setup({ language: "auto" });
  client.start();
  sockets[0].serverSend({ type: "session.created" });
  assert.equal(sockets[0].sent[0].session.audio.input.transcription.language, undefined);
});

test("deltas accumulate into partials and completed becomes final with stable seq", () => {
  const { client, sockets, events } = setup();
  client.start();
  const socket = sockets[0];
  goLive(socket);
  socket.serverSend({ type: "input_audio_buffer.speech_started", item_id: "a" });
  socket.serverSend({ type: "conversation.item.input_audio_transcription.delta", item_id: "a", delta: "Hello" });
  socket.serverSend({ type: "conversation.item.input_audio_transcription.delta", item_id: "a", delta: " world" });
  socket.serverSend({ type: "conversation.item.input_audio_transcription.completed", item_id: "a", transcript: "Hello world." });
  const relevant = events.filter((e) => e[0] !== "status");
  assert.deepEqual(relevant, [
    ["speech", "a", 0],
    ["partial", "a", "Hello", 0],
    ["partial", "a", "Hello world", 0],
    ["final", "a", "Hello world.", 0]
  ]);
});

test("audio is only sent once the session is live", () => {
  const { client, sockets } = setup();
  client.start();
  const socket = sockets[0];
  assert.equal(client.sendAudio(Buffer.from([1, 2, 3, 4])), false);
  goLive(socket);
  assert.equal(client.sendAudio(Buffer.from([1, 2, 3, 4])), true);
  const append = socket.sent.find((m) => m.type === "input_audio_buffer.append");
  assert.equal(append.audio, Buffer.from([1, 2, 3, 4]).toString("base64"));
});

test("reconnect follows backoff and gives up after the last delay", () => {
  const { client, sockets, events, scheduled } = setup();
  client.start();
  for (let i = 0; i < RECONNECT_DELAYS_MS.length; i += 1) {
    sockets[sockets.length - 1].emit("close", 1006, "");
    assert.equal(scheduled[i].ms, RECONNECT_DELAYS_MS[i]);
    scheduled[i].fn();
  }
  sockets[sockets.length - 1].emit("close", 1006, "");
  assert.equal(scheduled.length, RECONNECT_DELAYS_MS.length);
  assert.ok(events.some((e) => e[0] === "error" && /perdida/.test(e[1])));
});

test("successful session resets the backoff counter", () => {
  const { client, sockets, scheduled } = setup();
  client.start();
  sockets[0].emit("close", 1006, "");
  scheduled[0].fn();
  goLive(sockets[1]);
  sockets[1].emit("close", 1000, "session expired");
  assert.equal(scheduled[1].ms, RECONNECT_DELAYS_MS[0]);
});

test("missing OpenAI key fails without opening a socket", () => {
  const { client, sockets, events } = setup({ getApiKey: () => "" });
  client.start();
  assert.equal(sockets.length, 0);
  assert.ok(events.some((e) => e[0] === "error" && /Chave OpenAI/.test(e[1])));
});

test("stop closes the socket and does not reconnect", () => {
  const { client, sockets, scheduled } = setup();
  client.start();
  client.stop();
  assert.equal(sockets[0].closed, true);
  sockets[0].emit("close", 1000, "");
  assert.equal(scheduled.length, 0);
});

test("frame codec round-trips masked client frames", () => {
  const frame = encodeFrame(0x1, "x".repeat(70000));
  const { frames, rest } = decodeFrames(frame);
  assert.equal(rest.length, 0);
  assert.equal(frames[0].payload.toString("utf8"), "x".repeat(70000));
});

test("MinimalWebSocket talks to a real local upgrade server", async () => {
  const server = http.createServer();
  server.on("upgrade", (req, socket) => {
    const accept = crypto
      .createHash("sha1")
      .update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, rest } = decodeFrames(buffer);
      buffer = Buffer.from(rest);
      for (const f of frames) {
        if (f.opcode === 0x1) {
          const reply = Buffer.from(`echo:${f.payload.toString("utf8")}`);
          socket.write(Buffer.concat([Buffer.from([0x81, reply.length]), reply]));
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const message = await new Promise((resolve, reject) => {
      const ws = new MinimalWebSocket(`ws://127.0.0.1:${port}/x`);
      ws.on("open", () => ws.send("hi"));
      ws.on("message", (m) => {
        ws.close();
        resolve(m);
      });
      ws.on("error", reject);
    });
    assert.equal(message, "echo:hi");
  } finally {
    server.close();
  }
});
