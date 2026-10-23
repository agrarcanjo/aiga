// Auto-install whisper-cli from official whisper.cpp Windows x64 release zip.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { app } = require("electron");

const DEFAULT_WHISPER_CLI_ZIP_URL =
  process.env.WHISPER_CLI_DOWNLOAD_URL ||
  "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip";

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getManagedWhisperCliDir() {
  return path.join(app.getPath("userData"), "runtime", "whisper");
}

function getManagedWhisperCliPath() {
  const binaryName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  return path.join(getManagedWhisperCliDir(), binaryName);
}

function getLegacyWhisperCliPath() {
  const binaryName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  return path.join(app.getPath("userData"), "runtime", binaryName);
}

/**
 * whisper-cli.exe exige whisper.dll (+ ggml*) no MESMO diretório.
 * Qualquer .dll (ex.: pasta misturada com llama) NÃO conta — senão o processo
 * sai com 0xC0000135 (STATUS_DLL_NOT_FOUND / 3221225781).
 */
function hasRuntimeLibraries(binaryPath) {
  if (process.platform !== "win32") {
    return true;
  }
  try {
    const dir = path.dirname(binaryPath);
    const names = fs.readdirSync(dir).map((n) => n.toLowerCase());
    const hasWhisperDll = names.includes("whisper.dll");
    const hasGgml = names.some((n) => n === "ggml.dll" || n.startsWith("ggml-"));
    return hasWhisperDll && hasGgml;
  } catch {
    return false;
  }
}

function downloadToFile(url, destinationPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    const request = client.get(parsed, (response) => {
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
          onProgress({
            percent,
            message: total
              ? `Baixando whisper-cli… ${percent}%`
              : `Baixando whisper-cli… ${Math.round(received / (1024 * 1024))} MB`
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
    });
    request.on("error", reject);
  });
}

function findBinary(rootDir, binaryName) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
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
    const proc = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true }
    );
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

function createWhisperCliInstaller(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {}, error: () => {} };
  const allowNetworkDownloads = options?.allowNetworkDownloads !== false;

  async function detect() {
    const managed = getManagedWhisperCliPath();
    const fromEnv = process.env.WHISPER_CLI_PATH || "";
    const candidates = [
      fromEnv,
      managed,
      getLegacyWhisperCliPath(),
      path.join(process.cwd(), "bin", path.basename(managed))
    ].filter(Boolean);
    const found =
      candidates.find((candidate) => fs.existsSync(candidate) && hasRuntimeLibraries(candidate)) ||
      "";
    const incomplete = candidates.find(
      (candidate) => fs.existsSync(candidate) && !hasRuntimeLibraries(candidate)
    );
    return {
      available: Boolean(found),
      path: found,
      managedPath: managed,
      lastError:
        !found && incomplete
          ? `whisper-cli em ${incomplete} esta sem as DLLs do runtime. Reinstale o runtime de transcricao.`
          : ""
    };
  }

  function removeBrokenLegacyBinary() {
    const legacy = getLegacyWhisperCliPath();
    try {
      if (fs.existsSync(legacy) && !hasRuntimeLibraries(legacy)) {
        fs.unlinkSync(legacy);
        logger.warn("Removed incomplete legacy whisper-cli.exe (missing whisper.dll)", {
          path: legacy
        });
      }
    } catch (error) {
      logger.warn("Could not remove legacy whisper-cli", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function installPortable(onProgress, installOptions = {}) {
    const force = Boolean(installOptions.force);

    if (process.platform !== "win32") {
      return {
        available: false,
        path: "",
        managedPath: getManagedWhisperCliPath(),
        installState: "failed",
        lastError: "Instalacao automatica do whisper-cli disponivel apenas no Windows."
      };
    }
    if (!allowNetworkDownloads) {
      return {
        available: false,
        path: "",
        managedPath: getManagedWhisperCliPath(),
        installState: "failed",
        lastError: "Downloads de rede desabilitados neste ambiente."
      };
    }

    removeBrokenLegacyBinary();

    const existing = await detect();
    if (existing.available && !force) {
      process.env.WHISPER_CLI_PATH = existing.path;
      return {
        ...existing,
        installState: "ready",
        lastError: ""
      };
    }

    const tempDir = path.join(os.tmpdir(), `aiga-whisper-cli-${Date.now()}`);
    const zipPath = path.join(tempDir, "whisper-bin.zip");
    const extractDir = path.join(tempDir, "extracted");
    const destination = getManagedWhisperCliPath();
    const targetDir = getManagedWhisperCliDir();

    try {
      ensureDirectory(tempDir);
      ensureDirectory(extractDir);
      ensureDirectory(targetDir);

      logger.info("whisper-cli install: downloading", { url: DEFAULT_WHISPER_CLI_ZIP_URL, force });
      if (typeof onProgress === "function") {
        onProgress({ percent: 0, message: "Baixando whisper-cli + DLLs…" });
      }
      await downloadToFile(DEFAULT_WHISPER_CLI_ZIP_URL, zipPath, onProgress);

      if (typeof onProgress === "function") {
        onProgress({ percent: null, message: "Extraindo whisper-cli…" });
      }
      await extractZipWithPowerShell(zipPath, extractDir);

      const sourceBinary = findBinary(extractDir, "whisper-cli.exe");
      if (!sourceBinary) {
        throw new Error("whisper-cli.exe nao encontrado no pacote baixado.");
      }

      // Copia o diretório do binário (whisper.dll, ggml*, SDL2, etc.) para runtime/whisper/.
      const sourceDir = path.dirname(sourceBinary);
      for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (!entry.isFile()) {
          continue;
        }
        fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      }

      if (!hasRuntimeLibraries(destination)) {
        throw new Error(
          "Pacote extraido sem whisper.dll. Baixe novamente o runtime em Configuracoes > Traducao."
        );
      }

      process.env.WHISPER_CLI_PATH = destination;
      removeBrokenLegacyBinary();

      const verified = await detect();
      if (!verified.available) {
        throw new Error(
          verified.lastError || "whisper-cli instalado mas nao foi encontrado no destino."
        );
      }

      // Sanity: o processo deve pelo menos carregar (help exit != DLL_NOT_FOUND).
      const smoke = await new Promise((resolve) => {
        const proc = spawn(destination, ["-h"], { windowsHide: true });
        proc.on("error", (err) => resolve({ ok: false, detail: err.message }));
        proc.on("close", (code) => {
          if (code === 3221225781) {
            resolve({ ok: false, detail: "DLLs ainda ausentes apos instalacao (0xC0000135)." });
            return;
          }
          resolve({ ok: true, detail: `exit ${code}` });
        });
      });
      if (!smoke.ok) {
        throw new Error(smoke.detail);
      }

      logger.info("whisper-cli install: ready", { path: destination });
      return {
        ...verified,
        installState: "ready",
        lastError: ""
      };
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "Falha ao instalar whisper-cli.";
      logger.error("whisper-cli install failed", { lastError });
      return {
        available: false,
        path: "",
        managedPath: destination,
        installState: "failed",
        lastError
      };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  return {
    detect,
    installPortable,
    getManagedWhisperCliPath,
    getManagedWhisperCliDir
  };
}

module.exports = {
  createWhisperCliInstaller,
  getManagedWhisperCliPath,
  getManagedWhisperCliDir,
  getLegacyWhisperCliPath,
  hasRuntimeLibraries,
  DEFAULT_WHISPER_CLI_ZIP_URL
};
