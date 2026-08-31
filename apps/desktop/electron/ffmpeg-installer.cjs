const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { app } = require("electron");

// ffmpeg é usado para conversão de áudio (STT local). A captura da saída do sistema
// não depende dele — usa o desktopCapturer do Electron.
const DEFAULT_DOWNLOAD_URL =
  process.env.FFMPEG_DOWNLOAD_URL ||
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

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

async function detectFfmpegAt(ffmpegPath) {
  const version = await spawnFfmpeg(ffmpegPath, ["-version"]);
  if (!version.ok) {
    return {
      available: false,
      path: ffmpegPath,
      versionOk: false,
      detail: version.error || version.stderr.slice(0, 200)
    };
  }

  return {
    available: true,
    path: ffmpegPath,
    versionOk: true,
    detail: "version-ok"
  };
}

async function resolveBestFfmpeg() {
  for (const candidate of candidatePaths()) {
    const exists =
      candidate === "ffmpeg" ||
      candidate === "ffmpeg.exe" ||
      fs.existsSync(candidate);
    if (!exists) {
      continue;
    }
    const detected = await detectFfmpegAt(candidate);
    if (!detected.versionOk) {
      continue;
    }
    if (detected.path && fs.existsSync(detected.path)) {
      process.env.FFMPEG_PATH = detected.path;
    }
    return detected;
  }

  return {
    available: false,
    path: getManagedFfmpegPath(),
    versionOk: false,
    detail: "ffmpeg nao encontrado"
  };
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
    return {
      available: detected.available,
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
    if (existing.available && !force) {
      installState = "ready";
      lastError = "";
      progressPercent = 100;
      progressMessage = "ffmpeg já pronto.";
      pushProgress({ installState, message: progressMessage, percent: 100 });
      return getStatus();
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

      progressMessage = "Validando binário ffmpeg…";
      pushProgress({ installState: "extracting", message: progressMessage, percent: 99 });

      const destination = getManagedFfmpegPath();
      fs.copyFileSync(sourceBinary, destination);
      process.env.FFMPEG_PATH = destination;

      const verified = await detectFfmpegAt(destination);
      if (!verified.versionOk) {
        throw new Error("ffmpeg instalado mas nao respondeu ao teste de versao.");
      }

      installState = "ready";
      lastInstalledAtIso = new Date().toISOString();
      lastError = "";
      progressPercent = 100;
      progressMessage = "ffmpeg instalado com sucesso.";
      pushProgress({ installState, message: progressMessage, percent: 100 });
      logger.info("ffmpeg install: ready", { path: destination });
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
    installPortable
  };
}

module.exports = {
  createFfmpegInstaller,
  resolveFfmpegPath,
  detectFfmpeg,
  getManagedFfmpegPath
};
