/**
 * Captura de áudio do sistema via Chromium/Electron desktopCapturer.
 * FFmpeg NÃO tem input WASAPI no upstream — loopback real no Windows usa esta API.
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
