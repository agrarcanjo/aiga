// Cliente WebSocket (RFC 6455) sem dependencias, para o processo principal.
// O Node do Electron 33 nao expoe WebSocket global estavel.
const https = require("node:https");
const http = require("node:http");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OPCODE = {
  continuation: 0x0,
  text: 0x1,
  binary: 0x2,
  close: 0x8,
  ping: 0x9,
  pong: 0xa
};

function encodeFrame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || "", "utf8");
  const length = data.length;
  let headerLength = 2;
  if (length >= 126 && length <= 0xffff) {
    headerLength += 2;
  } else if (length > 0xffff) {
    headerLength += 8;
  }
  const mask = crypto.randomBytes(4);
  const frame = Buffer.alloc(headerLength + 4 + length);
  frame[0] = 0x80 | opcode;
  if (length < 126) {
    frame[1] = 0x80 | length;
  } else if (length <= 0xffff) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(length, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(length), 2);
  }
  mask.copy(frame, headerLength);
  const offset = headerLength + 4;
  for (let i = 0; i < length; i += 1) {
    frame[offset + i] = data[i] ^ mask[i % 4];
  }
  return frame;
}

/**
 * Decodifica frames completos do inicio do buffer.
 * Retorna os frames lidos e o restante ainda incompleto.
 */
function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (buffer.length - cursor < 2) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (buffer.length - cursor < 8) break;
      length = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
    }
    let maskKey = null;
    if (masked) {
      if (buffer.length - cursor < 4) break;
      maskKey = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }
    if (buffer.length - cursor < length) break;
    let payload = buffer.subarray(cursor, cursor + length);
    if (maskKey) {
      const unmasked = Buffer.alloc(length);
      for (let i = 0; i < length; i += 1) {
        unmasked[i] = payload[i] ^ maskKey[i % 4];
      }
      payload = unmasked;
    }
    frames.push({ fin, opcode, payload: Buffer.from(payload) });
    offset = cursor + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

class MinimalWebSocket extends EventEmitter {
  constructor(url, options = {}) {
    super();
    this.url = url;
    this.readyState = MinimalWebSocket.CONNECTING;
    this._socket = null;
    this._buffer = Buffer.alloc(0);
    this._fragments = [];
    this._fragmentOpcode = 0;
    this._connect(options.headers || {}, options.handshakeTimeoutMs || 10000);
  }

  _connect(extraHeaders, timeoutMs) {
    const target = new URL(this.url);
    const secure = target.protocol === "wss:";
    const key = crypto.randomBytes(16).toString("base64");
    const transport = secure ? https : http;
    const request = transport.request({
      protocol: secure ? "https:" : "http:",
      hostname: target.hostname,
      port: target.port || (secure ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: {
        ...extraHeaders,
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": key
      },
      timeout: timeoutMs
    });

    request.on("timeout", () => {
      request.destroy(new Error("Tempo esgotado ao conectar no WebSocket."));
    });

    request.on("response", (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += String(chunk || "");
      });
      response.on("end", () => {
        this._fail(
          new Error(
            `WebSocket recusado (HTTP ${response.statusCode}): ${body.slice(0, 400) || response.statusMessage}`
          )
        );
      });
    });

    request.on("upgrade", (response, socket, head) => {
      const expected = crypto
        .createHash("sha1")
        .update(key + WS_GUID)
        .digest("base64");
      if (response.headers["sec-websocket-accept"] !== expected) {
        socket.destroy();
        this._fail(new Error("Handshake WebSocket invalido."));
        return;
      }
      this._socket = socket;
      socket.setNoDelay(true);
      this.readyState = MinimalWebSocket.OPEN;
      socket.on("data", (chunk) => this._onData(chunk));
      socket.on("error", (error) => this._fail(error));
      socket.on("close", () => this._closed(1006, ""));
      this.emit("open");
      if (head && head.length) {
        this._onData(head);
      }
    });

    request.on("error", (error) => this._fail(error));
    request.end();
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    const { frames, rest } = decodeFrames(this._buffer);
    this._buffer = Buffer.from(rest);
    for (const frame of frames) {
      this._handleFrame(frame);
    }
  }

  _handleFrame(frame) {
    switch (frame.opcode) {
      case OPCODE.text:
      case OPCODE.binary:
        if (frame.fin) {
          this.emit("message", frame.opcode === OPCODE.text ? frame.payload.toString("utf8") : frame.payload);
        } else {
          this._fragmentOpcode = frame.opcode;
          this._fragments = [frame.payload];
        }
        return;
      case OPCODE.continuation:
        this._fragments.push(frame.payload);
        if (frame.fin) {
          const full = Buffer.concat(this._fragments);
          this._fragments = [];
          this.emit("message", this._fragmentOpcode === OPCODE.text ? full.toString("utf8") : full);
        }
        return;
      case OPCODE.ping:
        this._write(encodeFrame(OPCODE.pong, frame.payload));
        return;
      case OPCODE.close: {
        const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1005;
        const reason = frame.payload.length > 2 ? frame.payload.subarray(2).toString("utf8") : "";
        if (this.readyState === MinimalWebSocket.OPEN) {
          this._write(encodeFrame(OPCODE.close, frame.payload.subarray(0, 2)));
        }
        this._closed(code, reason);
        return;
      }
      default:
        return;
    }
  }

  _write(buffer) {
    if (this._socket && !this._socket.destroyed) {
      this._socket.write(buffer);
    }
  }

  send(data) {
    if (this.readyState !== MinimalWebSocket.OPEN) {
      throw new Error("WebSocket nao esta aberto.");
    }
    this._write(encodeFrame(OPCODE.text, typeof data === "string" ? data : Buffer.from(data)));
  }

  close(code = 1000, reason = "") {
    if (this.readyState === MinimalWebSocket.CLOSED) {
      return;
    }
    if (this.readyState === MinimalWebSocket.OPEN) {
      const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
      payload.writeUInt16BE(code, 0);
      payload.write(reason, 2);
      this._write(encodeFrame(OPCODE.close, payload));
    }
    this.readyState = MinimalWebSocket.CLOSING;
    setTimeout(() => {
      if (this._socket && !this._socket.destroyed) {
        this._socket.destroy();
      }
      this._closed(code, reason);
    }, 200);
  }

  _fail(error) {
    if (this.readyState === MinimalWebSocket.CLOSED) {
      return;
    }
    this.emit("error", error);
    if (this._socket && !this._socket.destroyed) {
      this._socket.destroy();
    }
    this._closed(1006, error.message);
  }

  _closed(code, reason) {
    if (this.readyState === MinimalWebSocket.CLOSED) {
      return;
    }
    this.readyState = MinimalWebSocket.CLOSED;
    this.emit("close", code, reason);
  }
}

MinimalWebSocket.CONNECTING = 0;
MinimalWebSocket.OPEN = 1;
MinimalWebSocket.CLOSING = 2;
MinimalWebSocket.CLOSED = 3;

module.exports = { MinimalWebSocket, encodeFrame, decodeFrames };
