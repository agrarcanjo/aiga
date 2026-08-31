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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
