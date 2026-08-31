// Downloadable transcription language packs for local Whisper STT (PT/EN required).
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WHISPER_BASE_URL =
  process.env.WHISPER_MODEL_URL ||
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

const DEFAULT_WHISPER_SMALL_URL =
  process.env.WHISPER_SMALL_MODEL_URL ||
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";

const DEFAULT_WHISPER_MEDIUM_URL =
  process.env.WHISPER_MEDIUM_MODEL_URL ||
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin";

const LANGUAGE_PACKS = [
  {
    id: "pt",
    label: "Português",
    languageCode: "pt",
    required: true,
    description: "Obrigatório para tradução e reuniões em português."
  },
  {
    id: "en",
    label: "Inglês",
    languageCode: "en",
    required: true,
    description: "Obrigatório para tradução simultânea EN ↔ PT."
  },
  {
    id: "es",
    label: "Espanhol",
    languageCode: "es",
    required: false,
    description: "Opcional — usa o mesmo motor multilíngue."
  },
  {
    id: "fr",
    label: "Francês",
    languageCode: "fr",
    required: false,
    description: "Opcional — usa o mesmo motor multilíngue."
  },
  {
    id: "de",
    label: "Alemão",
    languageCode: "de",
    required: false,
    description: "Opcional — usa o mesmo motor multilíngue."
  },
  {
    id: "it",
    label: "Italiano",
    languageCode: "it",
    required: false,
    description: "Opcional — usa o mesmo motor multilíngue."
  }
];

const MODEL_TIERS = [
  {
    id: "base",
    label: "Whisper Base",
    modelKey: "whisper",
    description: "Rápido (~142 MB). Bom para começar.",
    approximateSizeMb: 142
  },
  {
    id: "small",
    label: "Whisper Small",
    modelKey: "whisper-small",
    description: "Melhor qualidade (~466 MB).",
    approximateSizeMb: 466
  },
  {
    id: "medium",
    label: "Whisper Medium (maior qualidade)",
    modelKey: "whisper-medium",
    description: "Mais preciso e mais pesado (~1.5 GB).",
    approximateSizeMb: 1500
  }
];

function tierToModelKey(tier) {
  if (tier === "medium") return "whisper-medium";
  if (tier === "small") return "whisper-small";
  return "whisper";
}

function normalizeTier(tier) {
  if (tier === "medium" || tier === "small" || tier === "base") {
    return tier;
  }
  return "base";
}

function createTranscriptionPacksService(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {}, error: () => {} };
  const settingsStore = options.settingsStore;
  const modelManager = options.modelManager;
  const whisperCliManager = options.whisperCliManager;
  const whisperCliInstaller = options.whisperCliInstaller;
  const ffmpegInstaller = options.ffmpegInstaller;
  const emitProgress = options.emitProgress || (() => {});

  let busyPackId = "";
  let lastError = "";
  let downloadPercent = null;

  function readInstalled() {
    const raw = settingsStore?.getTranscriptionPacks?.() || {};
    const installed = Array.isArray(raw.installedLanguageIds)
      ? raw.installedLanguageIds.map(String)
      : [];
    return {
      installedLanguageIds: [...new Set(installed)],
      preferredModelTier: normalizeTier(raw.preferredModelTier)
    };
  }

  function writeInstalled(next) {
    if (!settingsStore?.savePartial) {
      return;
    }
    settingsStore.savePartial({
      transcriptionPacks: {
        installedLanguageIds: next.installedLanguageIds,
        preferredModelTier: normalizeTier(next.preferredModelTier)
      }
    });
  }

  function resolveEngineState() {
    const preferred = readInstalled().preferredModelTier;
    const preferredKey = tierToModelKey(preferred);
    const preferredPath = modelManager?.resolveModelPath?.(preferredKey) || "";
    const anyModelPath =
      preferredPath ||
      modelManager?.resolveModelPath?.("whisper") ||
      modelManager?.resolveModelPath?.("whisper-small") ||
      modelManager?.resolveModelPath?.("whisper-medium") ||
      "";
    const cli = whisperCliManager?.getStatus?.() || {};
    const modelReady = Boolean(preferredPath);
    const binaryReady = Boolean(cli.binaryPath);

    return {
      modelReady,
      binaryReady,
      modelPath: preferredPath || anyModelPath,
      binaryPath: cli.binaryPath || "",
      preferredModelKey: preferredKey,
      lastModelError: "",
      fullyReady: modelReady && binaryReady
    };
  }

  function listPacks() {
    const { installedLanguageIds, preferredModelTier } = readInstalled();
    const engine = resolveEngineState();

    const packs = LANGUAGE_PACKS.map((pack) => {
      const installed = installedLanguageIds.includes(pack.id);
      let status = "missing";
      if (busyPackId === pack.id || busyPackId === "required" || busyPackId === "setup") {
        status = "downloading";
      } else if (installed && engine.fullyReady) {
        status = "ready";
      } else if (installed && !engine.fullyReady) {
        status = "needs_engine";
      }

      return {
        ...pack,
        installed,
        status,
        busy: busyPackId === pack.id || busyPackId === "required" || busyPackId === "setup"
      };
    });

    const requiredIds = LANGUAGE_PACKS.filter((p) => p.required).map((p) => p.id);
    const requiredInstalled = requiredIds.every((id) => installedLanguageIds.includes(id));
    const requiredReady = requiredInstalled && engine.fullyReady;

    const modelTiers = MODEL_TIERS.map((tier) => {
      const modelPath = modelManager?.resolveModelPath?.(tier.modelKey) || "";
      return {
        ...tier,
        installed: Boolean(modelPath),
        active: preferredModelTier === tier.id,
        filePath: modelPath
      };
    });

    return {
      packs,
      modelTiers,
      preferredModelTier,
      engine: {
        ...engine,
        downloadPercent,
        busyPackId,
        lastError
      },
      requiredReady,
      requiredInstalled,
      requiredLanguageIds: requiredIds
    };
  }

  async function ensureWhisperCli() {
    const status = whisperCliManager?.getStatus?.() || {};
    if (status.binaryPath) {
      return status;
    }
    if (!whisperCliInstaller?.installPortable) {
      throw new Error("Instalador do whisper-cli indisponivel.");
    }
    emitProgress({
      kind: "engine",
      status: "downloading",
      message: "Instalando whisper-cli automaticamente…"
    });
    const installed = await whisperCliInstaller.installPortable((info) => {
      downloadPercent = typeof info?.percent === "number" ? info.percent : null;
      emitProgress({
        kind: "engine",
        status: "downloading",
        message: info?.message || "Baixando whisper-cli…",
        percent: downloadPercent
      });
    });
    if (!installed.available) {
      throw new Error(installed.lastError || "Falha ao instalar whisper-cli.");
    }
    if (whisperCliManager?.ensureAvailable) {
      return whisperCliManager.ensureAvailable();
    }
    return installed;
  }

  async function ensureEngine(tier) {
    const preferred = normalizeTier(tier || readInstalled().preferredModelTier || "base");
    const modelKey = tierToModelKey(preferred);

    if (!modelManager?.ensureModel) {
      throw new Error("ModelManager indisponivel.");
    }

    await ensureWhisperCli();

    emitProgress({
      kind: "engine",
      status: "downloading",
      modelKey,
      message: `Baixando modelo ${preferred}…`,
      percent: downloadPercent
    });

    const ensured = await modelManager.ensureModel(modelKey, {
      onProgress: (info) => {
        downloadPercent = typeof info?.percent === "number" ? info.percent : null;
        emitProgress({
          kind: "engine",
          status: "downloading",
          modelKey,
          message: info?.message || `Baixando ${modelKey}…`,
          percent: downloadPercent
        });
      }
    });

    if (ensured.state !== "ready") {
      throw new Error(ensured.lastError || `Falha ao preparar modelo ${modelKey}`);
    }

    const cli = await whisperCliManager.ensureAvailable();
    if (cli.state !== "ready") {
      throw new Error(cli.lastError || "whisper-cli ainda indisponivel apos instalacao.");
    }

    return ensured;
  }

  async function installPack(packId) {
    const pack = LANGUAGE_PACKS.find((p) => p.id === packId);
    if (!pack) {
      throw new Error(`Pacote desconhecido: ${packId}`);
    }

    busyPackId = packId;
    lastError = "";
    downloadPercent = null;

    try {
      const current = readInstalled();
      await ensureEngine(current.preferredModelTier);
      writeInstalled({
        installedLanguageIds: [...new Set([...current.installedLanguageIds, packId])],
        preferredModelTier: current.preferredModelTier
      });
      emitProgress({ kind: "pack", packId, status: "ready", message: `Pacote ${pack.label} pronto.` });
      return listPacks();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      emitProgress({ kind: "pack", packId, status: "error", message: lastError });
      throw error;
    } finally {
      busyPackId = "";
      downloadPercent = null;
    }
  }

  async function uninstallPack(packId) {
    const current = readInstalled();
    writeInstalled({
      installedLanguageIds: current.installedLanguageIds.filter((id) => id !== packId),
      preferredModelTier: current.preferredModelTier
    });
    return listPacks();
  }

  async function installRequiredPacks() {
    return setupEverything();
  }

  async function setupEverything(tierOverride) {
    busyPackId = "setup";
    lastError = "";
    downloadPercent = null;

    try {
      const current = readInstalled();
      const tier = normalizeTier(tierOverride || current.preferredModelTier || "base");

      emitProgress({
        kind: "setup",
        status: "downloading",
        message: "Preparando runtime (whisper-cli + modelo + idiomas)…"
      });

      if (ffmpegInstaller?.installPortable) {
        try {
          const ffmpegStatus = await ffmpegInstaller.getStatus?.();
          if (ffmpegStatus && !ffmpegStatus.available) {
            emitProgress({
              kind: "setup",
              status: "downloading",
              message: "Instalando ffmpeg (captura de áudio do sistema)…"
            });
            await ffmpegInstaller.installPortable();
          }
        } catch (error) {
          logger.warn("ffmpeg auto-install skipped", {
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }

      await ensureEngine(tier);

      const requiredIds = LANGUAGE_PACKS.filter((p) => p.required).map((p) => p.id);
      writeInstalled({
        installedLanguageIds: [...new Set([...current.installedLanguageIds, ...requiredIds])],
        preferredModelTier: tier
      });

      emitProgress({
        kind: "setup",
        status: "ready",
        message: "Pronto: whisper-cli, modelo e pacotes PT/EN instalados."
      });
      return listPacks();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      emitProgress({ kind: "setup", status: "error", message: lastError });
      throw error;
    } finally {
      busyPackId = "";
      downloadPercent = null;
    }
  }

  async function setPreferredModelTier(tier) {
    const nextTier = normalizeTier(tier);
    busyPackId = "setup";
    lastError = "";
    downloadPercent = null;
    try {
      const current = readInstalled();
      writeInstalled({
        installedLanguageIds: current.installedLanguageIds,
        preferredModelTier: nextTier
      });
      await ensureEngine(nextTier);
      emitProgress({
        kind: "engine",
        status: "ready",
        message: `Modelo ${nextTier} ativo.`
      });
      return listPacks();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      emitProgress({ kind: "engine", status: "error", message: lastError });
      throw error;
    } finally {
      busyPackId = "";
      downloadPercent = null;
    }
  }

  async function uninstallModelTier(tier) {
    const target = normalizeTier(tier);
    const modelKey = tierToModelKey(target);
    const filePath = modelManager?.resolveModelPath?.(modelKey) || "";
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info("Uninstalled whisper model", { modelKey, filePath });
    }
    const current = readInstalled();
    if (current.preferredModelTier === target) {
      const fallback = ["base", "small", "medium"]
        .filter((id) => id !== target)
        .find((id) => Boolean(modelManager?.resolveModelPath?.(tierToModelKey(id))));
      writeInstalled({
        installedLanguageIds: current.installedLanguageIds,
        preferredModelTier: fallback || "base"
      });
    }
    return listPacks();
  }

  function isLanguageReady(languageCode) {
    const status = listPacks();
    if (!status.engine.fullyReady) {
      return false;
    }
    if (!languageCode || languageCode === "auto") {
      return status.requiredReady;
    }
    const pack = status.packs.find((p) => p.languageCode === languageCode);
    return Boolean(pack && pack.status === "ready");
  }

  return {
    listPacks,
    installPack,
    uninstallPack,
    installRequiredPacks,
    setupEverything,
    setPreferredModelTier,
    uninstallModelTier,
    isLanguageReady,
    getDefaultWhisperUrls: () => ({
      base: DEFAULT_WHISPER_BASE_URL,
      small: DEFAULT_WHISPER_SMALL_URL,
      medium: DEFAULT_WHISPER_MEDIUM_URL
    })
  };
}

module.exports = {
  createTranscriptionPacksService,
  LANGUAGE_PACKS,
  MODEL_TIERS,
  DEFAULT_WHISPER_BASE_URL,
  DEFAULT_WHISPER_SMALL_URL,
  DEFAULT_WHISPER_MEDIUM_URL
};
