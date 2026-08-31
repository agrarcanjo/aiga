const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { app } = require("electron");

// essentials (gyan) NÃO inclui WASAPI — necessário para captura de saída no Windows.
const DEFAULT_DOWNLOAD_URL =
  process.env.FFMPEG_DOWNLOAD_URL ||
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

const WASAPI_MISSING_HINT =
  "ffmpeg sem suporte WASAPI (build essentials ou incompleto). Reinstale o ffmpeg completo em Configurações → Captura áudio.";

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getManagedFfmpegPath() {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(app.getPath("userData"), "runtime", "ffmpeg", binaryName);
}

function candidatePaths() {
  const paths = [];
  const fromEnv = process.env.FFMPEG_PATH || "";
  if (fromEnv) {
    paths.push(fromEnv);
  }
  paths.push(getManagedFfmpegPath());
  paths.push(process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return [...new Set(paths)];
}

function spawnFfmpeg(ffmpegPath, args) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      resolve({ ok: false, code: -1, stdout, stderr, error: err.message });
    });
    proc.on("close", (code) => {
      resolve({ ok: code === 0, code: code ?? -1, stdout, stderr, error: "" });
    });
  });
}

async function probeWasapiSupport(ffmpegPath) {
  if (process.platform !== "win32") {
    return { supported: true, detail: "non-windows" };
  }

  const formats = await spawnFfmpeg(ffmpegPath, ["-hide_banner", "-demuxers"]);
  const text = `${formats.stdout}\n${formats.stderr}`;
  if (/\bwasapi\b/i.test(text)) {
    return { supported: true, detail: "demuxer-list" };
  }

  // Fallback: tentativa real — essentials responde "Unknown input format: 'wasapi'".
  const tryOpen = await spawnFfmpeg(ffmpegPath, [
    "-hide_banner",
    "-f",
    "wasapi",
    "-list_devices",
    "true",
    "-i",
    "dummy"
  ]);
  const tryText = `${tryOpen.stdout}\n${tryOpen.stderr}`;
  if (/unknown input format\s*['"]?wasapi/i.test(tryText)) {
    return { supported: false, detail: tryText.trim().slice(0, 300) };
  }
  if (/\bwasapi\b/i.test(tryText) || /WASAPI devices/i.test(tryText)) {
    return { supported: true, detail: "list-devices" };
  }
  return { supported: false, detail: tryText.trim().slice(0, 300) || "wasapi ausente" };
}

async function detectFfmpegAt(ffmpegPath) {
  const version = await spawnFfmpeg(ffmpegPath, ["-version"]);
  if (!version.ok) {
    return {
      available: false,
      wasapiSupported: false,
      path: ffmpegPath,
      versionOk: false,
      wasapiDetail: version.error || version.stderr.slice(0, 200)
    };
  }

  const wasapi = await probeWasapiSupport(ffmpegPath);
  const loopbackReady = process.platform !== "win32" || wasapi.supported;
  return {
    available: loopbackReady,
    wasapiSupported: wasapi.supported,
    path: ffmpegPath,
    versionOk: true,
    wasapiDetail: wasapi.detail
  };
}

/**
 * Prefere binário com WASAPI (managed/env) em vez de um ffmpeg do PATH incompleto.
 */
async function resolveBestFfmpeg() {
  let fallback = null;
  for (const candidate of candidatePaths()) {
    const exists =
      candidate === "ffmpeg" ||
      candidate === "ffmpeg.exe" ||
      fs.existsSync(candidate);
    if (!exists && candidate !== "ffmpeg" && candidate !== "ffmpeg.exe") {
      continue;
    }
    const detected = await detectFfmpegAt(candidate);
    if (!detected.versionOk) {
      continue;
    }
    if (!fallback) {
      fallback = detected;
    }
    if (detected.wasapiSupported || process.platform !== "win32") {
      if (detected.path && fs.existsSync(detected.path)) {
        process.env.FFMPEG_PATH = detected.path;
      }
      return detected;
    }
  }
  return (
    fallback || {
      available: false,
      wasapiSupported: false,
      path: getManagedFfmpegPath(),
      versionOk: false,
      wasapiDetail: "ffmpeg nao encontrado"
    }
  );
}

function resolveFfmpegPath() {
  const fromEnv = process.env.FFMPEG_PATH || "";
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const managed = getManagedFfmpegPath();
  if (fs.existsSync(managed)) {
    return managed;
  }

  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function downloadToFile(url, destinationPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;

    const request = client.get(
      parsed,
      {
        headers: {
          "User-Agent": "AIGA-Desktop/ffmpeg-installer",
          Accept: "*/*"
        }
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          downloadToFile(response.headers.location, destinationPath, onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download falhou com status ${response.statusCode || "desconhecido"}`));
          return;
        }

        const total = Number(response.headers["content-length"] || 0);
        let received = 0;
        const output = fs.createWriteStream(destinationPath);
        response.pipe(output);
        response.on("data", (chunk) => {
          received += chunk.length;
          if (typeof onProgress === "function") {
            const percent = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : null;
            const mb = Math.round(received / (1024 * 1024));
            onProgress({
              percent,
              receivedBytes: received,
              totalBytes: total || null,
              message: total
                ? `Baixando ffmpeg completo… ${percent}% (${mb} MB)`
                : `Baixando ffmpeg completo… ${mb} MB`
            });
          }
        });

        output.on("finish", () => {
          output.close();
          resolve();
        });

        output.on("error", (error) => {
          output.close();
          reject(error);
        });
      }
    );

    request.on("error", reject);
  });
}

function findFfmpegBinary(rootDir) {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.name.toLowerCase() === binaryName.toLowerCase()) {
        return fullPath;
      }
    }
  }

  return "";
}

function extractZipWithPowerShell(zipPath, destinationDir) {
  return new Promise((resolve, reject) => {
    const command = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`;
    const proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      windowsHide: true
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Expand-Archive falhou com codigo ${code}`));
    });
  });
}

async function detectFfmpeg() {
  return resolveBestFfmpeg();
}

function createFfmpegInstaller(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {}, error: () => {} };
  const allowNetworkDownloads = options?.allowNetworkDownloads !== false;
  const emitProgress = options?.emitProgress || (() => {});

  let installState = "idle";
  let lastError = "";
  let lastInstalledAtIso = "";
  let progressPercent = null;
  let progressMessage = "";

  function pushProgress(partial) {
    if (partial.percent !== undefined) {
      progressPercent = partial.percent;
    }
    if (partial.message) {
      progressMessage = partial.message;
    }
    emitProgress({
      installState,
      percent: progressPercent,
      message: progressMessage,
      lastError,
      emittedAtIso: new Date().toISOString(),
      ...partial
    });
  }

  async function getStatus() {
    const detected = await detectFfmpeg();
    if (detected.versionOk && !detected.wasapiSupported && process.platform === "win32") {
      lastError = lastError || WASAPI_MISSING_HINT;
    }
    return {
      available: detected.available,
      wasapiSupported: Boolean(detected.wasapiSupported),
      path: detected.path,
      managedPath: getManagedFfmpegPath(),
      installState,
      lastError,
      lastInstalledAtIso,
      platformSupported: process.platform === "win32",
      downloadUrl: DEFAULT_DOWNLOAD_URL,
      progressPercent,
      progressMessage
    };
  }

  async function installPortable(installOptions = {}) {
    const force = Boolean(installOptions.force);

    if (process.platform !== "win32") {
      installState = "failed";
      lastError = "Instalacao automatica disponivel apenas no Windows.";
      pushProgress({ installState, message: lastError, percent: null });
      return getStatus();
    }

    if (!allowNetworkDownloads) {
      installState = "failed";
      lastError = "Downloads de rede desabilitados neste ambiente.";
      pushProgress({ installState, message: lastError, percent: null });
      return getStatus();
    }

    const existing = await detectFfmpeg();
    if (existing.available && existing.wasapiSupported && !force) {
      installState = "ready";
      lastError = "";
      progressPercent = 100;
      progressMessage = "ffmpeg já pronto (WASAPI OK).";
      pushProgress({ installState, message: progressMessage, percent: 100 });
      return getStatus();
    }

    if (existing.versionOk && !existing.wasapiSupported) {
      logger.warn("ffmpeg found without WASAPI — reinstalling full build", {
        path: existing.path
      });
    }

    installState = "downloading";
    lastError = "";
    progressPercent = 0;
    progressMessage = "Iniciando download do ffmpeg completo…";
    pushProgress({ installState, message: progressMessage, percent: 0 });

    const runtimeDir = path.join(app.getPath("userData"), "runtime", "ffmpeg");
    const tempDir = path.join(os.tmpdir(), `aiga-ffmpeg-${Date.now()}`);
    const zipPath = path.join(tempDir, "ffmpeg.zip");
    const extractDir = path.join(tempDir, "extracted");

    try {
      ensureDirectory(tempDir);
      ensureDirectory(extractDir);
      ensureDirectory(runtimeDir);

      logger.info("ffmpeg install: downloading", { url: DEFAULT_DOWNLOAD_URL });
      await downloadToFile(DEFAULT_DOWNLOAD_URL, zipPath, (info) => {
        installState = "downloading";
        pushProgress({
          installState,
          percent: info.percent,
          message: info.message
        });
      });

      installState = "extracting";
      progressPercent = 99;
      progressMessage = "Extraindo ffmpeg…";
      pushProgress({ installState, message: progressMessage, percent: 99 });
      await extractZipWithPowerShell(zipPath, extractDir);

      const sourceBinary = findFfmpegBinary(extractDir);
      if (!sourceBinary) {
        throw new Error("ffmpeg.exe nao encontrado no pacote baixado.");
      }

      progressMessage = "Validando demuxer WASAPI…";
      pushProgress({ installState: "extracting", message: progressMessage, percent: 99 });

      const destination = getManagedFfmpegPath();
      fs.copyFileSync(sourceBinary, destination);
      process.env.FFMPEG_PATH = destination;

      const verified = await detectFfmpegAt(destination);
      if (!verified.versionOk) {
        throw new Error("ffmpeg instalado mas nao respondeu ao teste de versao.");
      }
      if (!verified.wasapiSupported) {
        throw new Error(
          "ffmpeg instalado sem demuxer WASAPI. Use um build full (BtbN/gpl) ou defina FFMPEG_DOWNLOAD_URL."
        );
      }

      installState = "ready";
      lastInstalledAtIso = new Date().toISOString();
      lastError = "";
      progressPercent = 100;
      progressMessage = "ffmpeg completo instalado (WASAPI OK).";
      pushProgress({ installState, message: progressMessage, percent: 100 });
      logger.info("ffmpeg install: ready with WASAPI", { path: destination });
      return getStatus();
    } catch (error) {
      installState = "failed";
      lastError = error instanceof Error ? error.message : "Falha ao instalar ffmpeg.";
      progressMessage = lastError;
      pushProgress({ installState, message: lastError, percent: progressPercent });
      logger.error("ffmpeg install failed", { lastError });
      return getStatus();
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  return {
    resolveFfmpegPath,
    detectFfmpeg,
    getStatus,
    installPortable,
    WASAPI_MISSING_HINT
  };
}

module.exports = {
  createFfmpegInstaller,
  resolveFfmpegPath,
  detectFfmpeg,
  getManagedFfmpegPath,
  probeWasapiSupport,
  WASAPI_MISSING_HINT
};
