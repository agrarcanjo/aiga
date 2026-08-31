const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getEnvironmentReport,
  parseBoolean,
  parseStealthHardening
} = require("./env-config.cjs");

test("parseBoolean accepts common truthy/falsy strings", () => {
  assert.equal(parseBoolean("true"), true);
  assert.equal(parseBoolean("0"), false);
  assert.equal(parseBoolean("maybe"), undefined);
});

test("getEnvironmentReport lists overrides for set env vars", () => {
  const prev = process.env.FEATURE_STEALTH_HARDENING;
  process.env.FEATURE_STEALTH_HARDENING = "strict";
  try {
    const report = getEnvironmentReport();
    const hit = report.overrides.find((o) => o.envKey === "FEATURE_STEALTH_HARDENING");
    assert.ok(hit);
    assert.equal(hit.value, "strict");
    assert.equal(report.env.stealthHardening, "strict");
  } finally {
    if (prev === undefined) {
      delete process.env.FEATURE_STEALTH_HARDENING;
    } else {
      process.env.FEATURE_STEALTH_HARDENING = prev;
    }
  }
});

test("parseStealthHardening rejects invalid values", () => {
  assert.equal(parseStealthHardening("safe"), "safe");
  assert.equal(parseStealthHardening("invalid"), undefined);
});
