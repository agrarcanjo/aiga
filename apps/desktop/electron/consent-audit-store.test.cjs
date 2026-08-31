const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createConsentAuditStore, CONSENT_TEXT_VERSION } = require("./consent-audit-store.cjs");

test("consent audit store records and lists entries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiga-consent-"));
  const storePath = path.join(tmpDir, "consent-log.json");

  const store = createConsentAuditStore({
    logger: { info: () => {} },
    maxEntries: 10,
    storePath
  });

  const text = store.getConsentText();
  assert.equal(text.version, CONSENT_TEXT_VERSION);
  assert.ok(text.text.includes(CONSENT_TEXT_VERSION));

  const entry = store.recordConsent({
    sessionId: "sess-a",
    sessionType: "meeting",
    consentAccepted: true,
    useCloud: false
  });
  assert.equal(entry.sessionId, "sess-a");
  assert.equal(entry.consentTextVersion, CONSENT_TEXT_VERSION);

  const recent = store.listRecent(5);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].sessionId, "sess-a");

  assert.ok(fs.existsSync(storePath));

  const translationEntry = store.recordConsent({
    sessionId: "sess-b",
    sessionType: "translation",
    consentAccepted: true,
    useCloud: true
  });
  assert.equal(translationEntry.sessionType, "translation");
  assert.equal(store.listRecent(10).length, 2);
});
