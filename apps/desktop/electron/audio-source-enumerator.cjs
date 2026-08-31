// Windows audio source enumeration via ffmpeg WASAPI
const { spawn } = require("node:child_process");
const { resolveFfmpegPath } = require("./ffmpeg-installer.cjs");

function parseWasapiDevices(stderrText) {
  const outputs = [];
  const inputs = [];
  let section = "";

  stderrText.split("\n").forEach((line) => {
    if (line.includes("DirectShow audio devices") || line.includes("DirectShow video devices")) {
      return;
    }
    if (line.includes("WASAPI devices")) {
      section = "wasapi";
      return;
    }
    if (line.includes("DirectShow")) {
      section = "";
    }
    if (section !== "wasapi") {
      return;
    }
    const match = line.match(/^\s*"(.+)"\s+\((audio|video)\)/i) || line.match(/^\s*"(.+)"\s*$/);
    if (!match) {
      return;
    }
    const label = match[1];
    const kind = (match[2] || "audio").toLowerCase() === "video" ? "video" : "audio";
    const entry = { id: label, label, kind: "output" };
    if (line.toLowerCase().includes("(input") || label.toLowerCase().includes("microphone")) {
      inputs.push({ ...entry, kind: "input" });
    } else {
      outputs.push(entry);
    }
  });

  if (outputs.length === 0) {
    const alt = [...stderrText.matchAll(/\[wasapi[^\]]*\]\s+"([^"]+)"/gi)].map((m, i) => ({
      id: m[1],
      label: m[1],
      kind: "output"
    }));
    outputs.push(...alt);
  }

  return { outputs, inputs };
}

function createAudioSourceEnumerator(options) {
  const logger = options?.logger || { debug: () => {}, warn: () => {} };
  let lastFfmpegError = "";

  async function detectFfmpeg() {
    const ffmpeg = resolveFfmpegPath();
    return new Promise((resolve) => {
      const proc = spawn(ffmpeg, ["-version"], { windowsHide: true });
      proc.on("error", () => resolve({ available: false, path: ffmpeg }));
      proc.on("close", (code) => resolve({ available: code === 0, path: ffmpeg }));
    });
  }

  async function listWasapiDevices() {
    const { available, path } = await detectFfmpeg();
    if (!available) {
      lastFfmpegError =
        "ffmpeg nao encontrado. Use Configuracoes > Captura de audio para instalar automaticamente.";
      return { outputs: [], inputs: [], ffmpegAvailable: false, error: lastFfmpegError };
    }

    return new Promise((resolve) => {
      const proc = spawn(path, ["-hide_banner", "-list_devices", "true", "-f", "wasapi", "-i", "dummy"], {
        windowsHide: true
      });
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proc.on("error", (err) => {
        lastFfmpegError = err.message;
        resolve({ outputs: [], inputs: [], ffmpegAvailable: false, error: lastFfmpegError });
      });
      proc.on("close", () => {
        const parsed = parseWasapiDevices(stderr);
        if (/unknown input format\s*['"]?wasapi/i.test(stderr)) {
          lastFfmpegError =
            "ffmpeg sem suporte WASAPI (build essentials). Reinstale o ffmpeg completo em Configurações → Captura áudio.";
          logger.warn("WASAPI demuxer missing", { path, stderr: stderr.trim().slice(0, 300) });
          resolve({
            outputs: [],
            inputs: [],
            ffmpegAvailable: false,
            ffmpegPath: path,
            error: lastFfmpegError
          });
          return;
        }
        logger.debug("WASAPI devices listed", {
          outputCount: parsed.outputs.length,
          inputCount: parsed.inputs.length
        });
        resolve({
          ...parsed,
          ffmpegAvailable: true,
          ffmpegPath: path
        });
      });
    });
  }

  async function listSources() {
    if (process.platform !== "win32") {
      return {
        modes: ["microphone"],
        outputs: [],
        inputs: [],
        ffmpegAvailable: false,
        platformSupported: false
      };
    }

    const wasapi = await listWasapiDevices();
    return {
      modes: ["microphone", "system_loopback", "output_device"],
      outputs: wasapi.outputs,
      inputs: wasapi.inputs,
      ffmpegAvailable: wasapi.ffmpegAvailable,
      ffmpegPath: wasapi.ffmpegPath,
      error: wasapi.error,
      platformSupported: true,
      defaultOutputId: wasapi.outputs[0]?.id || ""
    };
  }

  return {
    listSources,
    detectFfmpeg,
    getLastError: () => lastFfmpegError
  };
}

module.exports = { createAudioSourceEnumerator, resolveFfmpegPath };
