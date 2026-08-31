// Persisted consent audit trail for meeting / translation sessions (§12.7)
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { app } = require("electron");

const CONSENT_TEXT_VERSION = "2026-05-19-v1";

const CONSENT_TEXT_PT = `Ao iniciar a captura, você declara que:
- A gravação e o processamento de áudio são permitidos neste contexto;
- Os participantes foram informados quando exigido por política interna ou lei;
- Dados enviados à nuvem (se habilitado) saem deste dispositivo conforme configurações de privacidade.

Versão do aviso: ${CONSENT_TEXT_VERSION}`;

function createConsentAuditStore(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {} };
  const storePath =
    options?.storePath || path.join(app.getPath("userData"), "audit", "consent-log.json");
  const maxEntries = options?.maxEntries ?? 500;

  function ensure() {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(storePath)) {
      fs.writeFileSync(storePath, JSON.stringify({ entries: [] }, null, 2), "utf-8");
    }
  }

  function readEntries() {
    ensure();
    try {
      const raw = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      return Array.isArray(raw.entries) ? raw.entries : [];
    } catch {
      return [];
    }
  }

  function writeEntries(entries) {
    ensure();
    const trimmed = entries.slice(-maxEntries);
    fs.writeFileSync(storePath, JSON.stringify({ entries: trimmed }, null, 2), "utf-8");
  }

  function recordConsent(payload) {
    const entry = {
      id: randomUUID(),
      sessionId: payload.sessionId,
      sessionType: payload.sessionType || "meeting",
      consentAccepted: Boolean(payload.consentAccepted),
      consentTextVersion: payload.consentTextVersion || CONSENT_TEXT_VERSION,
      useCloud: Boolean(payload.useCloud),
      recordedAtIso: new Date().toISOString()
    };
    const entries = readEntries();
    entries.push(entry);
    writeEntries(entries);
    logger.info("Consent recorded", {
      sessionId: entry.sessionId,
      sessionType: entry.sessionType,
      accepted: entry.consentAccepted
    });
    return entry;
  }

  function listRecent(limit = 50) {
    return readEntries()
      .slice(-limit)
      .reverse();
  }

  function getConsentText() {
    return {
      version: CONSENT_TEXT_VERSION,
      text: CONSENT_TEXT_PT
    };
  }

  return {
    CONSENT_TEXT_VERSION,
    recordConsent,
    listRecent,
    getConsentText
  };
}

module.exports = { createConsentAuditStore, CONSENT_TEXT_VERSION };
