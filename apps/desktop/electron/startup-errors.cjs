const fs = require("node:fs");
const path = require("node:path");

function createStartupErrorReporter({ app, dialog, getLogger, consoleRef = console }) {
  let reported = false;
  return (error, stage) => {
    if (reported) return;
    reported = true;
    const message = error instanceof Error ? error.message : String(error);
    let logPath = "";
    try {
      const logger = getLogger();
      if (!logger) throw new Error("Logger not initialized");
      logger.error("AIGA startup failed", { stage, message });
      logPath = logger.getLogFilePath();
    } catch {
      try {
        logPath = path.join(app.getPath("userData"), "logs", "startup-error.log");
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, `${new Date().toISOString()} | ${stage} | ${message}\n`, "utf8");
      } catch { logPath = ""; }
    }
    consoleRef.error("AIGA startup failed", stage, message);
    dialog.showErrorBox("Não foi possível iniciar o AIGA",
      `Etapa: ${stage}\n\n${message}\n\n${logPath ? `Diagnóstico: ${logPath}` : "Não foi possível gravar o diagnóstico. Verifique a permissão da pasta de dados."}`);
    app.quit();
  };
}
module.exports = { createStartupErrorReporter };
