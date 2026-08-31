// Daily purge of ephemeral capture data per privacy.retentionDays (§12.4)
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_RETENTION_DAYS = 7;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function isOlderThan(filePath, cutoffMs) {
  try {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs || stat.ctimeMs;
    return mtime < cutoffMs;
  } catch {
    return false;
  }
}

function purgeDirectory(dirPath, cutoffMs, logger) {
  if (!fs.existsSync(dirPath)) {
    return { deleted: 0, errors: 0 };
  }
  let deleted = 0;
  let errors = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    try {
      if (entry.isDirectory()) {
        const sub = purgeDirectory(full, cutoffMs, logger);
        deleted += sub.deleted;
        errors += sub.errors;
        if (fs.readdirSync(full).length === 0) {
          fs.rmdirSync(full);
        }
      } else if (isOlderThan(full, cutoffMs)) {
        fs.unlinkSync(full);
        deleted += 1;
      }
    } catch (error) {
      errors += 1;
      logger.warn("Retention purge file failed", {
        path: full,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { deleted, errors };
}

function createRetentionPurgeService(dependencies) {
  const logger = dependencies.logger;
  const getRetentionDays = dependencies.getRetentionDays;
  const getPurgeRoots = dependencies.getPurgeRoots;

  let intervalHandle = null;

  function resolveRetentionDays() {
    const days = typeof getRetentionDays === "function" ? getRetentionDays() : DEFAULT_RETENTION_DAYS;
    return Math.min(90, Math.max(1, Number(days) || DEFAULT_RETENTION_DAYS));
  }

  function runPurge() {
    const days = resolveRetentionDays();
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
    const roots = typeof getPurgeRoots === "function" ? getPurgeRoots() : [];
    let totalDeleted = 0;
    let totalErrors = 0;

    for (const root of roots) {
      const { deleted, errors } = purgeDirectory(root, cutoffMs, logger);
      totalDeleted += deleted;
      totalErrors += errors;
    }

    if (totalDeleted > 0 || totalErrors > 0) {
      logger.info("Retention purge completed", {
        retentionDays: days,
        deletedFiles: totalDeleted,
        errors: totalErrors
      });
    }

    return {
      retentionDays: days,
      deletedFiles: totalDeleted,
      errors: totalErrors,
      ranAtIso: new Date().toISOString()
    };
  }

  function schedule(intervalMs = PURGE_INTERVAL_MS) {
    if (intervalHandle) {
      return;
    }
    void runPurge();
    intervalHandle = setInterval(() => {
      void runPurge();
    }, intervalMs);
    logger.info("Retention purge scheduled", { intervalHours: intervalMs / 3600000 });
  }

  function stop() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  return {
    runPurge,
    schedule,
    stop
  };
}

module.exports = { createRetentionPurgeService, PURGE_INTERVAL_MS };
