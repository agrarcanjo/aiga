/**
 * Captura de áudio (microfone ou saída do sistema) no renderer.
 * FFmpeg NÃO tem input WASAPI no upstream — loopback real no Windows usa desktopCapturer.
 */

export interface DesktopLoopbackSource {
  id: string;
  name: string;
  displayId?: string;
}

export async function getDesktopLoopbackSource(): Promise<DesktopLoopbackSource> {
  const r = await window.desktopApi.getDesktopLoopbackSource();
  if (!r?.id) {
    throw new Error("Nenhuma tela disponível para captura de áudio do sistema.");
  }
  return r;
}

/**
 * Abre stream com áudio de loopback (o que toca nos alto-falantes).
 * Mantém o track de vídeo vivo (exigência do Chromium no Windows) sem usá-lo na UI.
 */
export async function openSystemAudioStream(sourceId: string): Promise<{
  stream: MediaStream;
  audioStream: MediaStream;
}> {
  const constraints = {
    audio: {
      mandatory: {
        chromeMediaSource: "desktop",
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
      },
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(
    constraints as unknown as MediaStreamConstraints
  );

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      "Sem faixa de áudio do sistema. No Windows, permita áudio ao capturar a tela/desktop."
    );
  }

  // MediaRecorder só com áudio; mantém `stream` (com vídeo) vivo no caller.
  const audioStream = new MediaStream(audioTracks);
  return { stream, audioStream };
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function isLoopbackMode(mode: string | undefined): boolean {
  return mode !== "microphone";
}

/**
 * Abre a fonte configurada: microfone (getUserMedia) ou saída do sistema (desktopCapturer).
 * `stream` é a fonte completa (pode conter vídeo) e deve ser parada no fim;
 * `audioStream` contém apenas áudio e serve para MediaRecorder/medidor.
 */
export async function openCaptureStream(mode: string): Promise<{
  stream: MediaStream;
  audioStream: MediaStream;
}> {
  if (!isLoopbackMode(mode)) {
    // echoCancellation evita que o áudio da reunião volte pelo microfone e duplique a transcrição.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    return { stream, audioStream: stream };
  }
  const source = await getDesktopLoopbackSource();
  return openSystemAudioStream(source.id);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface ChunkedCaptureController {
  /** Stream só de áudio, para o medidor de nível. */
  stream: MediaStream;
  mode: string;
  stop: () => void;
}

const PCM_TARGET_RATE = 24000;
const PCM_FRAME_MS = 100;

// Roda na thread de áudio: mixa para mono, reamostra (linear) para 24 kHz e
// entrega frames Int16 de 100 ms ao main thread.
const PCM_WORKLET_SOURCE = `
class PcmFrameProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || 24000;
    this.frameSamples = Math.round(this.targetRate * (opts.frameMs || 100) / 1000);
    this.ratio = sampleRate / this.targetRate;
    this.frame = new Int16Array(this.frameSamples);
    this.filled = 0;
    this.position = 0;
    this.last = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) {
      return true;
    }
    const channels = input.length;
    const length = input[0].length;
    const mono = new Float32Array(length);
    for (let c = 0; c < channels; c += 1) {
      const data = input[c];
      for (let i = 0; i < length; i += 1) {
        mono[i] += data[i] / channels;
      }
    }
    while (this.position < length) {
      const index = Math.floor(this.position);
      const frac = this.position - index;
      const a = index === 0 ? this.last : mono[index - 1];
      const b = mono[index];
      let sample = a + (b - a) * frac;
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      this.frame[this.filled] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.filled += 1;
      if (this.filled === this.frameSamples) {
        const out = this.frame;
        this.port.postMessage(out.buffer, [out.buffer]);
        this.frame = new Int16Array(this.frameSamples);
        this.filled = 0;
      }
      this.position += this.ratio;
    }
    this.position -= length;
    this.last = mono[length - 1];
    return true;
  }
}
registerProcessor("pcm-frame-processor", PcmFrameProcessor);
`;

/**
 * Captura contínua em PCM16 mono 24 kHz, em frames de 100 ms, para STT em streaming.
 */
export async function startPcmStreamCapture(options: {
  mode: string;
  onFrame: (pcm: ArrayBuffer) => void;
}): Promise<ChunkedCaptureController> {
  const { stream, audioStream } = await openCaptureStream(options.mode);
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    stopMediaStream(audioStream);
    stopMediaStream(stream);
    throw new Error("AudioContext indisponível para captura em streaming.");
  }

  const ctx = new AudioCtx();
  const workletUrl = URL.createObjectURL(
    new Blob([PCM_WORKLET_SOURCE], { type: "application/javascript" })
  );
  let node: AudioWorkletNode;
  let source: MediaStreamAudioSourceNode;
  let sink: GainNode;
  try {
    await ctx.audioWorklet.addModule(workletUrl);
    source = ctx.createMediaStreamSource(audioStream);
    node = new AudioWorkletNode(ctx, "pcm-frame-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: "explicit",
      channelCount: 2,
      processorOptions: { targetRate: PCM_TARGET_RATE, frameMs: PCM_FRAME_MS },
    });
    // Saída muda: o nó precisa estar ligado ao destino para ser processado.
    sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  } catch (error) {
    URL.revokeObjectURL(workletUrl);
    void ctx.close().catch(() => undefined);
    stopMediaStream(audioStream);
    stopMediaStream(stream);
    throw error instanceof Error
      ? error
      : new Error("Falha ao iniciar a captura de áudio em streaming.");
  }
  URL.revokeObjectURL(workletUrl);

  let stopped = false;
  node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
    if (!stopped) {
      options.onFrame(ev.data);
    }
  };

  return {
    stream: audioStream,
    mode: options.mode,
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      node.port.onmessage = null;
      try {
        source.disconnect();
        node.disconnect();
        sink.disconnect();
      } catch {
        // ignore
      }
      void ctx.close().catch(() => undefined);
      stopMediaStream(audioStream);
      stopMediaStream(stream);
    },
  };
}

/**
 * Grava a fonte em blocos independentes (cada bloco é um webm completo, decodificável pelo STT).
 */
export async function startChunkedCapture(options: {
  mode: string;
  timesliceMs?: number;
  onChunk: (chunkBase64: string) => void | Promise<void>;
}): Promise<ChunkedCaptureController> {
  const { stream, audioStream } = await openCaptureStream(options.mode);
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(audioStream, { mimeType: mime, audioBitsPerSecond: 16000 });
  } catch (error) {
    stopMediaStream(audioStream);
    stopMediaStream(stream);
    throw error;
  }

  let stopped = false;

  recorder.ondataavailable = (ev) => {
    if (!ev.data.size || stopped) {
      return;
    }
    void ev.data
      .arrayBuffer()
      .then((buf) => options.onChunk(arrayBufferToBase64(buf)))
      .catch(() => {
        // chunk perdido nao interrompe a captura
      });
  };

  recorder.start();
  const timer = setInterval(() => {
    if (stopped) {
      return;
    }
    if (recorder.state === "recording") {
      recorder.stop();
    }
    if (recorder.state === "inactive") {
      recorder.start();
    }
  }, options.timesliceMs ?? 6000);

  return {
    stream: audioStream,
    mode: options.mode,
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(timer);
      try {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch {
        // ignore
      }
      stopMediaStream(audioStream);
      stopMediaStream(stream);
    },
  };
}

export interface CaptureTestResult {
  ok: boolean;
  peakDbFs: number;
  message: string;
}

export type CaptureSource = "microphone" | "system";

export interface DualCaptureController {
  micStream: MediaStream | null;
  systemStream: MediaStream | null;
  micError: string;
  systemError: string;
  stop: () => void;
}

/**
 * Captura microfone e saída do sistema em paralelo, marcando a origem de cada bloco
 * para distinguir quem falou (você x reunião).
 */
export async function startDualChunkedCapture(options: {
  timesliceMs?: number;
  onChunk: (chunkBase64: string, source: CaptureSource) => void | Promise<void>;
}): Promise<DualCaptureController> {
  const results = await Promise.allSettled([
    startChunkedCapture({
      mode: "microphone",
      timesliceMs: options.timesliceMs,
      onChunk: (chunk) => options.onChunk(chunk, "microphone"),
    }),
    startChunkedCapture({
      mode: "system_loopback",
      timesliceMs: options.timesliceMs,
      onChunk: (chunk) => options.onChunk(chunk, "system"),
    }),
  ]);

  const [mic, system] = results;
  const micController = mic.status === "fulfilled" ? mic.value : null;
  const systemController = system.status === "fulfilled" ? system.value : null;

  if (!micController && !systemController) {
    const reason = mic.status === "rejected" ? mic.reason : (system as PromiseRejectedResult).reason;
    throw reason instanceof Error ? reason : new Error("Falha ao abrir as fontes de áudio.");
  }

  return {
    micStream: micController?.stream ?? null,
    systemStream: systemController?.stream ?? null,
    micError:
      mic.status === "rejected"
        ? mic.reason instanceof Error
          ? mic.reason.message
          : String(mic.reason)
        : "",
    systemError:
      system.status === "rejected"
        ? system.reason instanceof Error
          ? system.reason.message
          : String(system.reason)
        : "",
    stop: () => {
      micController?.stop();
      systemController?.stop();
    },
  };
}

/**
 * Testa a fonte medindo o pico real em dBFS por alguns segundos.
 */
export async function testCaptureSource(
  mode: string,
  durationMs = 3000
): Promise<CaptureTestResult> {
  let stream: MediaStream | null = null;
  let audioStream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  try {
    const opened = await openCaptureStream(mode);
    stream = opened.stream;
    audioStream = opened.audioStream;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return { ok: true, peakDbFs: -90, message: "Fonte aberta (medidor indisponível)." };
    }

    ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(audioStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    let peak = 0;
    const startedAt = Date.now();
    while (Date.now() - startedAt < durationMs) {
      analyser.getByteTimeDomainData(data);
      for (let i = 0; i < data.length; i += 1) {
        const amplitude = Math.abs((data[i] - 128) / 128);
        if (amplitude > peak) {
          peak = amplitude;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const peakDbFs = peak > 1e-6 ? Number((20 * Math.log10(peak)).toFixed(1)) : -90;
    const label = isLoopbackMode(mode) ? "saída do sistema" : "microfone";
    if (peakDbFs <= -60) {
      return {
        ok: false,
        peakDbFs,
        message: `Fonte aberta (${label}), mas sem áudio audível. Reproduza som e teste novamente.`,
      };
    }
    return {
      ok: true,
      peakDbFs,
      message: `Fonte OK (${label}) — pico ${peakDbFs} dBFS.`,
    };
  } catch (error) {
    return {
      ok: false,
      peakDbFs: -90,
      message: error instanceof Error ? error.message : "Falha ao abrir a fonte de áudio.",
    };
  } finally {
    if (ctx) {
      void ctx.close().catch(() => undefined);
    }
    stopMediaStream(audioStream);
    stopMediaStream(stream);
  }
}
