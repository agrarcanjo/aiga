import test from "node:test";
import assert from "node:assert/strict";
import {
  buildModelOptions,
  customModelCandidate,
  filterModelOptions,
  isChatModel,
  matchRanges,
} from "./modelOptions.ts";

const ids = (options) => options.map((option) => option.id);

test("modelo salvo fora do catálogo continua visível ao reabrir", () => {
  const options = buildModelOptions(["gpt-5.6-terra", "gpt-5.6-luna"], undefined, "gpt-4o-mini");
  assert.equal(options[0].id, "gpt-4o-mini");
  assert.ok(ids(options).includes("gpt-5.6-terra"));
});

test("modelo salvo que já está na lista não é duplicado", () => {
  const options = buildModelOptions(["a", "b"], undefined, "b");
  assert.deepEqual(ids(options), ["a", "b"]);
});

test("lista da conta substitui o catálogo e remove modelos que não são de chat", () => {
  const fetched = [
    "gpt-4o-mini",
    "gpt-4o-mini-transcribe",
    "whisper-1",
    "text-embedding-3-small",
    "gpt-4o-realtime-preview",
    "tts-1",
    "gpt-4o",
  ];
  const options = buildModelOptions(["gpt-5.6-terra"], fetched, "gpt-4o");
  assert.deepEqual(ids(options), ["gpt-4o", "gpt-4o-mini"]);
});

test("modelo salvo ausente da conta aparece marcado como não confirmado", () => {
  const options = buildModelOptions([], ["gemini-3.8-flash"], "gemini-2.5-flash");
  assert.deepEqual(options[0], { id: "gemini-2.5-flash", unverified: true });
});

test("isChatModel reconhece modelos de chat de todos os provedores", () => {
  assert.ok(isChatModel("gemini-3.8-flash"));
  assert.ok(isChatModel("claude-sonnet-4-20250514"));
  assert.ok(isChatModel("gpt-4o-mini"));
  assert.equal(isChatModel("gpt-4o-mini-transcribe"), false);
  assert.equal(isChatModel("text-embedding-004"), false);
});

test("busca com vários termos casa em qualquer ordem e prioriza prefixo", () => {
  const options = buildModelOptions(
    ["chatgpt-4o-latest", "gpt-4o", "gpt-4o-mini", "o4-mini", "gpt-4.1-mini"],
    undefined,
    ""
  );
  assert.deepEqual(ids(filterModelOptions(options, "4o mini")), ["gpt-4o-mini"]);
  assert.deepEqual(ids(filterModelOptions(options, "mini 4o")), ["gpt-4o-mini"]);
  assert.deepEqual(ids(filterModelOptions(options, "gpt-4o")), ["gpt-4o", "gpt-4o-mini", "chatgpt-4o-latest"]);
  assert.deepEqual(ids(filterModelOptions(options, "")), ids(options));
  assert.deepEqual(filterModelOptions(options, "inexistente"), []);
});

test("matchRanges mescla trechos sobrepostos para o destaque", () => {
  assert.deepEqual(matchRanges("gpt-4o-mini", "4o mini"), [
    [4, 6],
    [7, 11],
  ]);
  assert.deepEqual(matchRanges("gpt-4o", "gpt gpt-4"), [[0, 5]]);
  assert.deepEqual(matchRanges("abc", ""), []);
});

test("customModelCandidate permite digitar um id que não está na lista", () => {
  const options = buildModelOptions(["gpt-4o"], undefined, "");
  assert.equal(customModelCandidate(options, " gemini-3.8-flash "), "gemini-3.8-flash");
  assert.equal(customModelCandidate(options, "gpt-4o"), null);
  assert.equal(customModelCandidate(options, "dois termos"), null);
  assert.equal(customModelCandidate(options, ""), null);
});
