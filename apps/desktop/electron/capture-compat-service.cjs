const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { z } = require("zod");

const identitySchema = z.object({
  pid: z.number().int().positive().max(0xffffffff),
  created: z.string().regex(/^[1-9][0-9]{0,19}$/),
  path: z.string().min(1).max(32768).refine((value) => !/[\r\n\0]/.test(value)),
  arch: z.enum(["x64", "x86", "arm64", "unknown"]),
}).strict();
const windowSchema = z.object({
  hwnd: z.string().regex(/^\d+$/), threadId: z.number().int(), className: z.string().max(128),
  valid: z.boolean(), before: z.number().int().nullable(), affinity: z.number().int().nullable(),
  queryError: z.number().int().nonnegative(), clearError: z.number().int().nonnegative(),
});
const resultSchema = z.object({
  protocol: z.literal(1), version: z.literal("1.0.0"), loaded: z.boolean(), initialized: z.boolean(),
  hookActive: z.boolean(), stable: z.boolean(), overflow: z.boolean(), error: z.number().int().nonnegative(),
  stage: z.string(), blocked: z.string().regex(/^\d+$/), observedAt: z.string().regex(/^\d+$/),
  identity: identitySchema, windows: z.array(windowSchema).max(256),
});
const sameIdentity = (a, b) => a.pid === b.pid && a.created === b.created &&
  a.path.toLowerCase() === b.path.toLowerCase() && a.arch === b.arch;

function resolveArtifacts(root) {
  const directory = path.join(root, "capture-compat", "x64");
  for (const name of ["manifest.json", "aiga-capture-helper.exe", "aiga-capture-compat.dll"]) {
    const artifactPath = path.join(directory, name);
    if (!fs.existsSync(artifactPath)) throw Object.assign(new Error(
      `Componente de compatibilidade ausente: ${artifactPath}. Restaure a pasta capture-compat/x64 completa do mesmo pacote. Em desenvolvimento, gere os componentes com corepack pnpm --filter @aiga/desktop build:capture-compat. Nenhuma operação foi enviada ao Java.`
    ), { code: "ARTIFACTS_MISSING", stage: "artifacts", artifactPath, resourcesRoot: root });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8").replace(/^\uFEFF/, ""));
  if (manifest.protocol !== 1 || manifest.version !== "1.0.0" || manifest.arch !== "x64") throw new Error("Versão dos componentes nativos incompatível. Recompile ou reinstale o AIGA.");
  for (const name of ["aiga-capture-helper.exe", "aiga-capture-compat.dll"]) {
    const actual = createHash("sha256").update(fs.readFileSync(path.join(directory, name))).digest("hex");
    if (actual !== manifest.sha256?.[name]) throw new Error(`Integridade inválida: ${name}. Reinstale o AIGA.`);
  }
  return path.join(directory, "aiga-capture-helper.exe");
}

function createNativeRunner(root) {
  return (operation, identity, token) => new Promise((resolve, reject) => {
    let executable;
    try { executable = resolveArtifacts(root); }
    catch (error) { reject(Object.assign(error, { stage: "artifacts", code: error.code || "ARTIFACTS", resourcesRoot: root })); return; }
    const startedAt = Date.now();
    const child = spawn(executable, [], { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(Object.assign(error, { helperPid: child.pid, elapsedMs: Date.now() - startedAt, outputBytes: Buffer.byteLength(output), operation })); else resolve(result);
    };
    const timer = setTimeout(() => {
      // Only the helper is terminated. Its remote operation may still be running.
      child.kill();
      finish(Object.assign(new Error("Tempo limite; a operação no alvo pode continuar. Consulte o estado antes de repetir."), { uncertain: true, stage: "communication", code: "TIMEOUT" }));
    }, 12000);
    child.on("error", (error) => finish(error));
    child.stdin.on("error", () => {});
    child.stderr.resume();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (Buffer.byteLength(output) > 1024 * 1024) {
        child.kill(); finish(Object.assign(new Error("Resposta nativa excedeu o limite."), { uncertain: true, stage: "protocol" }));
      }
    });
    child.on("close", (exitCode, signal) => {
      try {
        const result = JSON.parse(output);
        if (result.protocol !== 1) throw new Error("Protocolo nativo incompatível.");
        finish(null, result);
      } catch (error) { finish(Object.assign(error, { uncertain: true, stage: "communication", exitCode, signal })); }
    });
    const input = operation === "list" ? "list\n" : `${operation}\n${identity.pid}\n${identity.created}\n${identity.path}\n${identity.arch}\n${token}\n`;
    // Token is passed through an inherited anonymous pipe, never command-line arguments or logs.
    child.stdin.end(input, "utf8");
  });
}

function explain(code, stage) {
  if (code === 5) return "Acesso negado ou sessão pertencente a outro controlador. Confira a instância e o nível de integridade; não há elevação automática.";
  if (code === 193) return "Arquitetura incompatível. Esta distribuição atende apenas processos Windows x64.";
  if (code === 1306) return "DLL incompatível já carregada. Aguarde o encerramento natural da aplicação para usar a nova versão.";
  if (code === 1460) return "Tempo limite; o estado residual é desconhecido. Não há confirmação de reversão.";
  if (code === 87) return "A identidade mudou ou o processo terminou. Selecione novamente a instância atual.";
  if (code === 170) return "Uma operação nativa ainda está em andamento. Aguarde e consulte o estado.";
  return `Falha na etapa ${stage} (código ${code}). Consulte o diagnóstico; o alvo não será reiniciado.`;
}

function createCaptureCompatService({ resourcesRoot, logger = { info() {} }, appVersion = "0.1.0", platform = process.platform, run = createNativeRunner(resourcesRoot), pollMs = 2000 }) {
  let selected = null, token = "", candidates = [], state = { status: "disabled", hookActive: false, windows: [], message: "Selecione explicitamente uma instância Java." };
  let queue = Promise.resolve(), pending = 0, closed = false, uncertain = false, owned = false;
  let lastLogAt = 0, lastLoggedStatus = "";
  const serialize = (work) => {
    if (pending >= 8) return Promise.reject(new Error("Há operações pendentes. Aguarde a conclusão."));
    pending++;
    const result = queue.then(work).finally(() => { pending--; });
    queue = result.catch(() => {}); return result;
  };
  const snapshot = () => structuredClone({ ...state, selected });
  const failure = (error, operationId) => {
    uncertain ||= !!error.uncertain;
    state = { ...state, status: error.uncertain ? "unknown" : "failed", hookActive: null, verifiedAt: null,
      windows: [], operationId, stage: error.stage || "communication", error: error.code || "NATIVE", message: error.message };
    logger.info("Capture compatibility failure", { operationId, stage: state.stage, error: state.error, pid: selected?.pid,
      message: error.message, resourcesRoot, artifactPath: error.artifactPath, operation: error.operation,
      helperPid: error.helperPid, elapsedMs: error.elapsedMs, exitCode: error.exitCode, signal: error.signal, outputBytes: error.outputBytes,
      uncertain, appVersion });
    if (error.code === 87 && (error.stage === "identity" || error.stage === "access")) {
      selected = null; token = ""; owned = false; uncertain = false; state.hookActive = false;
      state.message = "A sessão foi invalidada: o processo terminou ou sua identidade mudou. Atualize a lista e selecione uma instância atual.";
    }
    return snapshot();
  };
  async function operate(operation) {
    if (closed) throw new Error("Serviço encerrado.");
    if (!selected) throw new Error("Selecione uma instância primeiro.");
    if (operation === "enable" && uncertain) throw new Error("Consulte o estado residual antes de tentar habilitar novamente.");
    if (selected.arch !== "x64") return failure({ code: 193, stage: "architecture", message: explain(193) }, randomUUID());
    const operationId = randomUUID();
    state = { ...state, status: "installing", stage: operation, verifiedAt: null, operationId };
    try {
      const raw = await run(operation, selected, token);
      if (raw.error && (raw.hookActive === undefined || raw.error === 170)) {
        // ERROR_BUSY returns before the DLL acquires its state lock; zero-initialized flags are not evidence.
        return failure({ code: raw.error, stage: raw.stage, uncertain: raw.uncertain || raw.error === 170, message: explain(raw.error, raw.stage) }, operationId);
      }
      const result = resultSchema.parse(raw);
      if (!sameIdentity(result.identity, selected)) throw Object.assign(new Error("Identidade divergente na resposta nativa."), { uncertain: true, stage: "identity" });
      if (operation === "enable" && result.hookActive && !result.error) owned = true;
      if (!result.hookActive) owned = false;
      // A loaded module with an uncompleted initialization is not proof that a timed-out enable ended.
      if (!result.error && (!uncertain || result.initialized)) uncertain = false;
      const allVerified = result.windows.length > 0 && result.stable && !result.overflow &&
        result.windows.every((window) => window.valid && window.affinity === 0 && window.queryError === 0 && window.clearError === 0);
      const status = result.error ? "failed" : uncertain ? "unknown" : !result.hookActive ? "disabled" : allVerified ? "verified" : "partial";
      const verifiedAt = result.observedAt !== "0" ? new Date(Number(BigInt(result.observedAt) / 10000n - 11644473600000n)).toISOString() : null;
      state = { ...result, selected, status, operationId, verifiedAt,
        message: result.error ? explain(result.error, result.stage) : uncertain ? "Operação anterior ainda sem conclusão confirmada." :
          !result.hookActive ? "Interceptação desativada. A aplicação pode voltar a solicitar proteção." :
          !result.windows.length ? "Hook instalado; aguardando janela. Nenhuma captura foi verificada." :
          allVerified ? "Hook ativo e afinidade real das janelas observadas igual a 0x0." : "Hook ativo; há janelas ou consultas pendentes. Veja os erros abaixo." };
      if (operation !== "query" || state.status !== lastLoggedStatus || Date.now() - lastLogAt >= 60000) {
        lastLogAt = Date.now(); lastLoggedStatus = state.status;
        logger.info("Capture compatibility observation", { appVersion, nativeVersion: "1.0.0", protocol: 1, operationId, operation, pid: selected.pid, created: selected.created,
          arch: selected.arch, status, loaded: result.loaded, hookActive: result.hookActive, error: result.error, blocked: result.blocked,
          observedAt: verifiedAt, windows: result.windows.map(({ hwnd, before, affinity, queryError, clearError }) => ({ hwnd, before, affinity, queryError, clearError })) });
      }
      return snapshot();
    } catch (error) {
      // A malformed/absent reply after dispatch cannot prove that the remote operation stopped.
      if (error.stage !== "artifacts") error.uncertain = true;
      return failure(error, operationId);
    }
  }
  const timer = pollMs ? setInterval(() => {
    if (closed || pending || !owned || uncertain) return;
    void serialize(() => operate("query")).catch(() => {});
  }, pollMs) : null;
  timer?.unref();
  return {
    preflight: () => {
      try {
        const helperPath = resolveArtifacts(resourcesRoot);
        logger.info("Capture compatibility artifacts ready", { appVersion, resourcesRoot, helperPath });
        return { ready: true };
      } catch (error) {
        logger.info("Capture compatibility artifacts unavailable", { appVersion, resourcesRoot,
          code: error.code || "ARTIFACTS", stage: "artifacts", artifactPath: error.artifactPath, message: error.message });
        return { ready: false, message: error.message };
      }
    },
    list: () => serialize(async () => {
      if (platform !== "win32") throw new Error("Compatibilidade de captura disponível apenas no Windows.");
      const result = await run("list");
      if (result.error) throw new Error(explain(result.error, result.stage));
      candidates = z.array(identitySchema.extend({ windows: z.array(windowSchema).max(256) })).max(1024).parse(result.candidates);
      return structuredClone(candidates);
    }),
    select: (payload) => serialize(async () => {
      const identity = identitySchema.parse(payload);
      if (selected && sameIdentity(identity, selected)) return operate("query");
      if (selected && (owned || uncertain || state.hookActive !== false)) throw new Error("Desative ou esclareça o estado da sessão atual antes de trocar a seleção.");
      if (!candidates.some((candidate) => sameIdentity(candidate, identity))) throw new Error("Instância não consta na descoberta atual. Atualize a lista.");
      selected = identity; token = randomBytes(32).toString("hex");
      return operate("query");
    }),
    enable: () => serialize(() => operate("enable")),
    enableFromShortcut: () => serialize(async () => {
      if (closed) throw new Error("Serviço encerrado.");
      if (platform !== "win32") throw new Error("Compatibilidade disponível apenas no Windows.");
      if (selected) {
        const current = await operate("query");
        if (!selected) return current; // Never migrate a stale selection to a different process.
        if (current.status === "unknown" || current.status === "failed" || current.hookActive) return current;
        return operate("enable");
      }
      const discovery = await run("list");
      if (discovery.error) throw new Error(explain(discovery.error, discovery.stage));
      candidates = z.array(identitySchema.extend({ windows: z.array(windowSchema).max(256) })).max(1024).parse(discovery.candidates);
      if (candidates.length !== 1) throw new Error(candidates.length
        ? "Há várias instâncias Java. Selecione a desejada em Configurações > Captura tela antes de usar o atalho."
        : "Nenhuma instância Java encontrada. Abra a aplicação Java e pressione o atalho novamente.");
      const { windows, ...identity } = candidates[0];
      selected = identity; token = randomBytes(32).toString("hex");
      const current = await operate("query");
      if (!selected || current.status === "failed" || current.status === "unknown" || current.hookActive) return current;
      return operate("enable");
    }),
    query: () => serialize(() => selected ? operate("query") : snapshot()),
    disable: () => serialize(() => operate("disable")),
    snapshot,
    close: () => { closed = true; if (timer) clearInterval(timer); token = ""; },
  };
}

function registerCaptureCompatIpc({ ipcMain, service, getMainWindow, trustedUrl }) {
  for (const operation of ["list", "select", "enable", "query", "disable"]) {
    ipcMain.handle(`capture-compat:${operation}`, (event, payload) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== trustedUrl())
        throw new Error("Origem não autorizada para compatibilidade de captura.");
      if (operation !== "select" && payload !== undefined) throw new Error("Esta operação não aceita parâmetros.");
      return operation === "select" ? service.select(identitySchema.parse(payload)) : service[operation]();
    });
  }
}
module.exports = { createCaptureCompatService, createNativeRunner, registerCaptureCompatIpc, resolveArtifacts, identitySchema };
